import { Router } from 'express';
import { DashboardApp } from '../app';

export function healthRoutes(app: DashboardApp): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      version: app.version,
      active_event: app.activeEvent,
      tracker_count: app.stateManager.getTrackerCount(),
      uptime_seconds: app.uptimeSeconds,
    });
  });

  return router;
}
