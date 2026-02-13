/**
 * Detection API Routes
 * Endpoints for viewing and classifying UAS detections from CoT and other sources.
 */

import { Router } from 'express';
import log from 'electron-log';
import { IFFCategory } from '../../core/models/iff';
import {
  getRecentDetections,
  getDetectionById,
  updateDetectionClassification,
} from '../../core/deconfliction';

export function detectionRoutes(): Router {
  const router = Router();

  // =========================================================================
  // GET /api/detections - List recent detections
  // =========================================================================
  router.get('/detections', (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const category = req.query.category as string | undefined;
      const source = req.query.source as string | undefined;

      let detections = getRecentDetections(Math.min(limit, 1000));

      // Filter by IFF category if specified
      if (category && Object.values(IFFCategory).includes(category as IFFCategory)) {
        detections = detections.filter(d => d.iff_category === category);
      }

      // Filter by source if specified
      if (source) {
        detections = detections.filter(d => d.source === source);
      }

      // Return newest first
      const sorted = [...detections].reverse();

      res.json({
        detections: sorted,
        total: sorted.length,
        filters: {
          category: category || null,
          source: source || null,
          limit,
        },
      });
    } catch (error: any) {
      log.error('[Detections API] Failed to get detections:', error);
      res.status(500).json({ error: 'Failed to fetch detections' });
    }
  });

  // =========================================================================
  // GET /api/detections/:id - Get a single detection
  // =========================================================================
  router.get('/detections/:id', (req, res) => {
    try {
      const detection = getDetectionById(req.params.id);
      if (!detection) {
        return res.status(404).json({ error: 'Detection not found' });
      }
      res.json(detection);
    } catch (error: any) {
      log.error('[Detections API] Failed to get detection:', error);
      res.status(500).json({ error: 'Failed to fetch detection' });
    }
  });

  // =========================================================================
  // POST /api/detections/:id/classify - Manually classify a detection
  // =========================================================================
  router.post('/detections/:id/classify', (req, res) => {
    try {
      const { id } = req.params;
      const { iff_category, notes } = req.body;

      // Validate IFF category
      if (!iff_category || !Object.values(IFFCategory).includes(iff_category)) {
        return res.status(400).json({
          error: `Invalid iff_category. Must be one of: ${Object.values(IFFCategory).join(', ')}`,
        });
      }

      const detection = updateDetectionClassification(id, iff_category, notes);
      if (!detection) {
        return res.status(404).json({ error: 'Detection not found' });
      }

      log.info(`[Detections API] Detection ${id} classified as ${iff_category}`);
      res.json(detection);
    } catch (error: any) {
      log.error('[Detections API] Failed to classify detection:', error);
      res.status(500).json({ error: 'Failed to classify detection' });
    }
  });

  // =========================================================================
  // GET /api/detections/summary/stats - Detection statistics
  // =========================================================================
  router.get('/detections/summary/stats', (_req, res) => {
    try {
      const detections = getRecentDetections(1000);

      const byCat: Record<string, number> = {
        [IFFCategory.BLUE]: 0,
        [IFFCategory.RED]: 0,
        [IFFCategory.YELLOW]: 0,
        [IFFCategory.GRAY]: 0,
      };

      const bySource: Record<string, number> = {};

      for (const d of detections) {
        byCat[d.iff_category] = (byCat[d.iff_category] || 0) + 1;
        bySource[d.source] = (bySource[d.source] || 0) + 1;
      }

      res.json({
        total: detections.length,
        by_category: byCat,
        by_source: bySource,
        oldest: detections.length > 0 ? detections[0].timestamp : null,
        newest: detections.length > 0 ? detections[detections.length - 1].timestamp : null,
      });
    } catch (error: any) {
      log.error('[Detections API] Failed to get stats:', error);
      res.status(500).json({ error: 'Failed to get detection stats' });
    }
  });

  return router;
}
