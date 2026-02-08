import express from 'express';
import teleportRoutes from './routes/teleport.js';
import sessionsRoutes from './routes/sessions.js';
import healthRoutes from './routes/health.js';
import { logger } from './logger.js';

const app = express();
const PORT = parseInt(process.env.TELEPORT_PORT || '8080', 10);

// Middleware — large limit for session data transfers
app.use(express.json({ limit: '50mb' }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// Routes
app.use('/teleport', teleportRoutes);
app.use('/sessions', sessionsRoutes);
app.use('/health', healthRoutes);

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    name: 'Claude Teleport Server',
    version: '1.0.0',
    endpoints: {
      'POST /teleport': 'Send a Claude session (repo + config)',
      'GET /sessions': 'List active sessions',
      'GET /sessions/:id': 'Get session details',
      'DELETE /sessions/:id': 'Kill a session',
      'POST /sessions/:id/push': 'Commit and push session changes',
      'GET /health': 'Health check',
    },
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Claude Teleport Server listening on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Max sessions: ${process.env.MAX_SESSIONS || 16}`);
  logger.info(`Session timeout: ${process.env.SESSION_TIMEOUT_HOURS || 24} hours`);
});
