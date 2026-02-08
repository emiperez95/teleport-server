import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../logger.js';

const execAsync = promisify(exec);

/**
 * Run a command as the claude user so tmux sessions are owned by
 * the same user that SSH logins use.
 */
function asClaudeUser(cmd: string): string {
  return `su - claude -c ${JSON.stringify(cmd)}`;
}

export class AgentApiService {
  /**
   * Start Claude Code in a tmux session
   */
  async startInTmux(
    sessionName: string,
    workDir: string,
    envVars?: Record<string, string>,
    initialPrompt?: string,
    resumeSessionId?: string
  ): Promise<{ tmuxSession: string }> {
    // Create tmux session
    await this.createTmuxSession(sessionName, workDir);

    // Build environment string
    const envString = envVars
      ? Object.entries(envVars)
          .map(([k, v]) => `export ${k}="${v}"`)
          .join(' && ') + ' && '
      : '';

    // Build claude command (skip permissions since sessions run unattended)
    let claudeCmd = 'claude --dangerously-skip-permissions';

    if (resumeSessionId) {
      claudeCmd += ` --resume ${resumeSessionId}`;
    } else if (initialPrompt) {
      const escaped = initialPrompt.replace(/'/g, "'\\''");
      claudeCmd += ` '${escaped}'`;
    }

    // Send command to tmux session
    const fullCmd = `${envString}cd "${workDir}" && ${claudeCmd}`;
    await execAsync(
      asClaudeUser(`tmux send-keys -t "${sessionName}" '${fullCmd.replace(/'/g, "'\\''")}' Enter`)
    );

    logger.info(`Started Claude in tmux session ${sessionName}`);

    // Auto-accept the --dangerously-skip-permissions confirmation prompt
    // Prompt defaults to "No, exit" so we need: arrow-down, then Enter
    setTimeout(async () => {
      try {
        await execAsync(asClaudeUser(`tmux send-keys -t "${sessionName}" Down`));
        setTimeout(async () => {
          try {
            await execAsync(asClaudeUser(`tmux send-keys -t "${sessionName}" Enter`));
            logger.info(`Accepted skip-permissions prompt for ${sessionName}`);
          } catch { /* ignore */ }
        }, 500);
      } catch { /* ignore if session already past the prompt */ }
    }, 3000);

    return { tmuxSession: sessionName };
  }

  /**
   * Create a new tmux session
   */
  async createTmuxSession(name: string, workDir: string): Promise<void> {
    try {
      // Kill existing session if it exists
      await execAsync(asClaudeUser(`tmux kill-session -t "${name}" 2>/dev/null || true`));

      // Create new session
      await execAsync(asClaudeUser(`tmux new-session -d -s "${name}" -c "${workDir}"`));
      logger.info(`Created tmux session: ${name}`);
    } catch (error) {
      logger.error(`Failed to create tmux session: ${error}`);
      throw error;
    }
  }

  /**
   * Kill a tmux session
   */
  async killSession(sessionName: string): Promise<void> {
    try {
      await execAsync(asClaudeUser(`tmux kill-session -t "${sessionName}" 2>/dev/null || true`));
      logger.info(`Killed tmux session: ${sessionName}`);
    } catch (error) {
      logger.warn(`Error killing tmux session: ${error}`);
    }
  }

  /**
   * List active tmux sessions
   */
  async listTmuxSessions(): Promise<string[]> {
    try {
      const { stdout } = await execAsync(
        asClaudeUser('tmux list-sessions -F "#{session_name}" 2>/dev/null || true')
      );
      return stdout
        .trim()
        .split('\n')
        .filter((s) => s.length > 0);
    } catch {
      return [];
    }
  }
}

export const agentApiService = new AgentApiService();
