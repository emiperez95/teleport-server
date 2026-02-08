import { Router, Request, Response } from 'express';
import { sessionManager } from '../services/session-manager.js';
import { agentApiService } from '../services/agentapi-service.js';

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

export default router;
