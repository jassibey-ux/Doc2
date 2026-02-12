import { Router } from 'express';
import { DashboardApp } from '../app';

export function trackerRoutes(app: DashboardApp): Router {
  const router = Router();

  router.get('/trackers', (_req, res) => {
    res.json(app.stateManager.getTrackerSummaries());
  });

  router.get('/trackers/:trackerId', (req, res) => {
    const state = app.stateManager.getTracker(req.params.trackerId);
    if (!state) {
      res.status(404).json({ detail: 'Tracker not found' });
      return;
    }
    res.json(state);
  });

  return router;
}
