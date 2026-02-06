import { Router, Request, Response } from 'express';
import { sessionManager } from '../services/session-manager.js';
import { logger } from '../logger.js';

const router = Router();

/**
 * GET /sessions
 * List all active sessions
 */
router.get('/', (_req: Request, res: Response) => {
  const sessions = sessionManager.listSessions();
  res.json({ sessions });
});

/**
 * GET /sessions/:id
 * Get details of a specific session
 */
router.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const session = sessionManager.getSessionDetails(id);

  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  res.json(session);
});

/**
 * DELETE /sessions/:id
 * Kill a session
 */
router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  logger.info(`Delete request for session ${id}`);

  const success = await sessionManager.killSession(id);

  if (!success) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  res.json({ success: true, message: `Session ${id} killed` });
});

/**
 * POST /sessions/:id/push
 * Commit and push changes from a session
 */
router.post('/:id/push', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { message } = req.body as { message?: string };

  logger.info(`Push request for session ${id}`);

  try {
    const result = await sessionManager.pushSession(id, message);
    res.json({
      success: true,
      committed: result.committed,
      pushed: result.pushed,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    logger.error(`Push failed: ${error}`);
    res.status(500).json({
      error: 'Failed to push',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
