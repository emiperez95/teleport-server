import { v4 as uuidv4 } from 'uuid';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import {
  Session,
  SessionStatus,
  TeleportRequest,
  SessionListItem,
  SessionDetails,
} from '../types/index.js';
import { gitService } from './git-service.js';
import { agentApiService } from './agentapi-service.js';
import { logger } from '../logger.js';

const DATA_DIR = process.env.DATA_DIR || '/claude-data';
const SESSION_TIMEOUT_HOURS = parseInt(process.env.SESSION_TIMEOUT_HOURS || '24', 10);

export class SessionManager {
  private sessions: Map<string, Session> = new Map();

  constructor() {
    // Start cleanup interval
    setInterval(() => this.cleanupIdleSessions(), 60 * 60 * 1000); // Every hour
  }

  /**
   * Create a new session from a teleport request
   */
  async createSession(request: TeleportRequest): Promise<Session> {
    const sessionId = uuidv4();
    const tmuxSession = `claude-${sessionId.slice(0, 8)}`;

    logger.info(`Creating session ${sessionId} for ${request.repo_url}`);

    // Clone or update repository
    const workDir = await gitService.cloneOrPull(request.repo_url, request.branch);

    // Apply Claude config if provided
    if (request.claude_config) {
      this.applyClaudeConfig(workDir, request.claude_config);
    }

    // Extract project name from URL
    const project = this.extractProjectName(request.repo_url);

    // Create initial session record
    const session: Session = {
      id: sessionId,
      project,
      repo_url: request.repo_url,
      branch: request.branch || 'main',
      status: 'starting',
      port: 0,
      tmux_session: tmuxSession,
      created_at: new Date(),
      work_dir: workDir,
    };

    this.sessions.set(sessionId, session);

    try {
      // Start Claude in tmux with API mode
      const agentApi = await agentApiService.startInTmux(
        tmuxSession,
        workDir,
        request.env_vars,
        request.initial_prompt
      );

      session.port = agentApi.port;
      session.status = 'running';
      session.last_activity = new Date();

      logger.info(`Session ${sessionId} started on port ${session.port}`);
    } catch (error) {
      session.status = 'error';
      logger.error(`Failed to start session ${sessionId}: ${error}`);
      throw error;
    }

    return session;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * List all sessions
   */
  listSessions(): SessionListItem[] {
    return Array.from(this.sessions.values()).map((s) => ({
      id: s.id,
      project: s.project,
      status: s.status,
      port: s.port,
      created_at: s.created_at.toISOString(),
      last_activity: s.last_activity?.toISOString(),
    }));
  }

  /**
   * Get detailed session info
   */
  getSessionDetails(sessionId: string): SessionDetails | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    return {
      id: session.id,
      project: session.project,
      status: session.status,
      port: session.port,
      created_at: session.created_at.toISOString(),
      last_activity: session.last_activity?.toISOString(),
      repo_url: session.repo_url,
      branch: session.branch,
      work_dir: session.work_dir,
      tmux_session: session.tmux_session,
    };
  }

  /**
   * Kill a session
   */
  async killSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    logger.info(`Killing session ${sessionId}`);

    await agentApiService.killSession(session.tmux_session, session.port);

    session.status = 'stopped';
    this.sessions.delete(sessionId);

    return true;
  }

  /**
   * Push changes from a session's working directory
   */
  async pushSession(
    sessionId: string,
    message?: string
  ): Promise<{ committed: boolean; pushed: boolean }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const commitMessage =
      message || `Claude session ${sessionId} - auto-commit on ${new Date().toISOString()}`;

    return await gitService.commitAndPush(session.work_dir, commitMessage);
  }

  /**
   * Update session status
   */
  updateSessionStatus(sessionId: string, status: SessionStatus): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = status;
      session.last_activity = new Date();
    }
  }

  /**
   * Apply Claude configuration to the working directory
   */
  private applyClaudeConfig(workDir: string, config: TeleportRequest['claude_config']): void {
    if (!config) return;

    const claudeDir = path.join(workDir, '.claude');
    if (!existsSync(claudeDir)) {
      mkdirSync(claudeDir, { recursive: true });
    }

    // Write MCP config
    if (config.mcp) {
      writeFileSync(path.join(claudeDir, 'mcp.json'), JSON.stringify(config.mcp, null, 2));
      logger.info('Applied MCP configuration');
    }

    // Write settings
    if (config.settings) {
      writeFileSync(
        path.join(claudeDir, 'settings.json'),
        JSON.stringify(config.settings, null, 2)
      );
      logger.info('Applied settings configuration');
    }

    // Write permissions
    if (config.permissions) {
      const settingsPath = path.join(claudeDir, 'settings.json');
      let settings: Record<string, unknown> = {};
      if (existsSync(settingsPath)) {
        settings = JSON.parse(require('fs').readFileSync(settingsPath, 'utf8'));
      }
      settings.permissions = config.permissions;
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      logger.info('Applied permissions configuration');
    }
  }

  /**
   * Extract project name from git URL
   */
  private extractProjectName(repoUrl: string): string {
    return repoUrl
      .replace(/\.git$/, '')
      .split('/')
      .pop() || 'unknown';
  }

  /**
   * Clean up idle sessions
   */
  private async cleanupIdleSessions(): Promise<void> {
    const now = Date.now();
    const timeoutMs = SESSION_TIMEOUT_HOURS * 60 * 60 * 1000;

    for (const [id, session] of this.sessions.entries()) {
      const lastActivity = session.last_activity || session.created_at;
      const idleMs = now - lastActivity.getTime();

      if (idleMs > timeoutMs) {
        logger.info(`Session ${id} idle for ${Math.round(idleMs / 1000 / 60)} minutes, killing`);
        await this.killSession(id);
      }
    }
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }
}

export const sessionManager = new SessionManager();
