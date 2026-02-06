import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { logger } from '../logger.js';

const execAsync = promisify(exec);

const AGENTAPI_BASE_PORT = parseInt(process.env.AGENTAPI_BASE_PORT || '3284', 10);
const MAX_SESSIONS = parseInt(process.env.MAX_SESSIONS || '16', 10);

export interface AgentApiProcess {
  port: number;
  process?: ChildProcess;
  tmuxSession: string;
}

export class AgentApiService {
  private usedPorts: Set<number> = new Set();

  /**
   * Start Claude Code in API mode within a tmux session
   * Returns the allocated port
   */
  async startInTmux(
    sessionName: string,
    workDir: string,
    envVars?: Record<string, string>,
    initialPrompt?: string
  ): Promise<AgentApiProcess> {
    const port = this.allocatePort();
    if (port === -1) {
      throw new Error('No available ports - maximum sessions reached');
    }

    try {
      // Create tmux session
      await this.createTmuxSession(sessionName, workDir);

      // Build environment string
      const envString = envVars
        ? Object.entries(envVars)
            .map(([k, v]) => `export ${k}="${v}"`)
            .join(' && ') + ' && '
        : '';

      // Build claude command with API mode
      // Note: Using --api flag which starts Claude in HTTP API mode
      let claudeCmd = `claude --api --port ${port}`;

      if (initialPrompt) {
        // If there's an initial prompt, we'll send it after starting
        claudeCmd += ' --resume';
      }

      // Send command to tmux session
      const fullCmd = `${envString}cd "${workDir}" && ${claudeCmd}`;
      await execAsync(
        `tmux send-keys -t "${sessionName}" '${fullCmd.replace(/'/g, "'\\''")}' Enter`
      );

      logger.info(`Started Claude API on port ${port} in tmux session ${sessionName}`);

      // Wait for the API to be ready
      await this.waitForApi(port);

      return {
        port,
        tmuxSession: sessionName,
      };
    } catch (error) {
      this.releasePort(port);
      logger.error(`Failed to start AgentAPI: ${error}`);
      throw error;
    }
  }

  /**
   * Create a new tmux session
   */
  async createTmuxSession(name: string, workDir: string): Promise<void> {
    try {
      // Kill existing session if it exists
      await execAsync(`tmux kill-session -t "${name}" 2>/dev/null || true`);

      // Create new session
      await execAsync(`tmux new-session -d -s "${name}" -c "${workDir}"`);
      logger.info(`Created tmux session: ${name}`);
    } catch (error) {
      logger.error(`Failed to create tmux session: ${error}`);
      throw error;
    }
  }

  /**
   * Kill a tmux session and release its port
   */
  async killSession(sessionName: string, port?: number): Promise<void> {
    try {
      await execAsync(`tmux kill-session -t "${sessionName}" 2>/dev/null || true`);
      logger.info(`Killed tmux session: ${sessionName}`);
    } catch (error) {
      logger.warn(`Error killing tmux session: ${error}`);
    }

    if (port) {
      this.releasePort(port);
    }
  }

  /**
   * List active tmux sessions
   */
  async listTmuxSessions(): Promise<string[]> {
    try {
      const { stdout } = await execAsync('tmux list-sessions -F "#{session_name}" 2>/dev/null || true');
      return stdout
        .trim()
        .split('\n')
        .filter((s) => s.length > 0);
    } catch {
      return [];
    }
  }

  /**
   * Check if API is responding
   */
  async isApiReady(port: number): Promise<boolean> {
    try {
      const response = await fetch(`http://localhost:${port}/status`);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Wait for API to be ready
   */
  private async waitForApi(port: number, timeoutMs = 30000): Promise<void> {
    const startTime = Date.now();
    const checkInterval = 500;

    while (Date.now() - startTime < timeoutMs) {
      if (await this.isApiReady(port)) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    }

    logger.warn(`API on port ${port} did not become ready within ${timeoutMs}ms`);
    // Don't throw - the API might still start
  }

  /**
   * Allocate a port for a new session
   */
  private allocatePort(): number {
    for (let i = 0; i < MAX_SESSIONS; i++) {
      const port = AGENTAPI_BASE_PORT + i;
      if (!this.usedPorts.has(port)) {
        this.usedPorts.add(port);
        return port;
      }
    }
    return -1;
  }

  /**
   * Release a port
   */
  private releasePort(port: number): void {
    this.usedPorts.delete(port);
  }

  /**
   * Get all used ports
   */
  getUsedPorts(): number[] {
    return Array.from(this.usedPorts);
  }
}

export const agentApiService = new AgentApiService();
