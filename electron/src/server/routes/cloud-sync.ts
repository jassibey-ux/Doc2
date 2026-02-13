/**
 * Cloud Sync API routes.
 *
 * GET  /api/cloud-sync/status   — current sync status
 * GET  /api/cloud-sync/config   — get cloud sync config
 * PUT  /api/cloud-sync/config   — update cloud sync config
 * POST /api/cloud-sync/start    — start sync
 * POST /api/cloud-sync/stop     — stop sync
 */

import { Router } from 'express';
import { cloudSyncManager } from '../../core/cloud-sync';

export function cloudSyncRoutes(): Router {
  const router = Router();

  router.get('/cloud-sync/status', (_req, res) => {
    res.json(cloudSyncManager.getStatus());
  });

  router.get('/cloud-sync/config', (_req, res) => {
    const config = cloudSyncManager.getConfig();
    // Redact API key in response
    res.json({
      ...config,
      api_key: config.api_key ? '***' : '',
    });
  });

  router.put('/cloud-sync/config', (req, res) => {
    try {
      const updates = req.body;
      cloudSyncManager.saveConfig(updates);

      // Restart if enabled state changed
      if ('enabled' in updates) {
        if (updates.enabled) {
          cloudSyncManager.start();
        } else {
          cloudSyncManager.stop();
        }
      }

      res.json({ success: true, config: cloudSyncManager.getConfig() });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/cloud-sync/start', (_req, res) => {
    cloudSyncManager.saveConfig({ enabled: true });
    cloudSyncManager.start();
    res.json({ success: true, status: cloudSyncManager.getStatus() });
  });

  router.post('/cloud-sync/stop', (_req, res) => {
    cloudSyncManager.stop();
    cloudSyncManager.saveConfig({ enabled: false });
    res.json({ success: true, status: cloudSyncManager.getStatus() });
  });

  return router;
}
