import { Router, Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { sessionManager } from '../services/session-manager.js';
import { agentApiService } from '../services/agentapi-service.js';

const execAsync = promisify(exec);

const router = Router();

/**
 * GET /health
 * Health check endpoint
 */
router.get('/', async (_req: Request, res: Response) => {
  const tmuxSessions = await agentApiService.listTmuxSessions();

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    sessions: {
      active: sessionManager.getSessionCount(),
      tmux: tmuxSessions.length,
    },
  });
});

/**
 * GET /health/ready
 * Readiness probe
 */
router.get('/ready', (_req: Request, res: Response) => {
  res.json({ ready: true });
});

/**
 * GET /health/live
 * Liveness probe
 */
router.get('/live', (_req: Request, res: Response) => {
  res.json({ alive: true });
});

/**
 * GET /health/auth
 * Check authentication status for GitHub and Claude
 */
router.get('/auth', async (_req: Request, res: Response) => {
  let github = 'not configured';
  let claude = 'not configured';

  try {
    const { stdout } = await execAsync('su - claude -c "gh auth status 2>&1"', { timeout: 10000 });
    const match = stdout.match(/Logged in to .* account (\S+)/);
    github = match ? `authenticated (${match[1]})` : 'authenticated';
  } catch {
    github = 'not authenticated';
  }

  try {
    const { stdout } = await execAsync('cat /claude-data/.claude/.credentials.json', { timeout: 5000 });
    const creds = JSON.parse(stdout);
    if (creds.claudeAiOauth?.accessToken) {
      const expired = creds.claudeAiOauth.expiresAt < Date.now();
      const sub = creds.claudeAiOauth.subscriptionType || 'unknown';
      claude = expired ? `expired (${sub})` : `authenticated (${sub})`;
    } else {
      claude = 'credentials found (no OAuth token)';
    }
  } catch {
    if (process.env.ANTHROPIC_API_KEY) {
      claude = 'authenticated (API key)';
    } else {
      claude = 'not authenticated';
    }
  }

  res.json({ github, claude });
});

export default router;
