import { Router, Request, Response } from 'express';
import { sessionManager } from '../services/session-manager.js';
import { TeleportRequest, TeleportResponse } from '../types/index.js';
import { logger } from '../logger.js';

const router = Router();

/**
 * POST /teleport
 * Receive a new Claude session: clone repo, apply config, start Claude API
 */
router.post('/', async (req: Request, res: Response) => {
  const body = req.body as TeleportRequest;

  // Validate required fields
  if (!body.repo_url) {
    res.status(400).json({
      error: 'Missing required field: repo_url',
    });
    return;
  }

  // Validate repo URL format
  const urlPattern = /^(https?:\/\/|git@)/;
  if (!urlPattern.test(body.repo_url)) {
    res.status(400).json({
      error: 'Invalid repo_url format. Must be HTTPS or SSH git URL.',
    });
    return;
  }

  try {
    logger.info(`Teleport request for ${body.repo_url}`);

    const session = await sessionManager.createSession(body);

    const response: TeleportResponse = {
      session_id: session.id,
      agent_port: session.port,
      status: session.status,
      work_dir: session.work_dir,
    };

    res.status(201).json(response);
  } catch (error) {
    logger.error(`Teleport failed: ${error}`);
    res.status(500).json({
      error: 'Failed to create session',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
