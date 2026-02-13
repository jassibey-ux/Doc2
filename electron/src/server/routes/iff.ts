/**
 * IFF (Identification Friend or Foe) Registry API Routes
 * CRUD operations for managing the IFF registry of known UAS.
 */

import { Router } from 'express';
import log from 'electron-log';
import {
  IFFCategory,
  iffRegistry,
  UASRegistryEntry,
} from '../../core/models/iff';

export function iffRoutes(): Router {
  const router = Router();

  // =========================================================================
  // GET /api/iff/registry - List all IFF registry entries
  // =========================================================================
  router.get('/iff/registry', (_req, res) => {
    try {
      const entries = iffRegistry.getAll();
      res.json({
        entries,
        counts: iffRegistry.getCategoryCounts(),
        total: entries.length,
      });
    } catch (error: any) {
      log.error('[IFF API] Failed to get registry:', error);
      res.status(500).json({ error: 'Failed to fetch IFF registry' });
    }
  });

  // =========================================================================
  // POST /api/iff/registry - Add a new registry entry
  // =========================================================================
  router.post('/iff/registry', (req, res) => {
    try {
      const { tracker_id, iff_category, drone_type, callsign, notes, icon } = req.body;

      // Validate required fields
      if (!tracker_id) {
        return res.status(400).json({ error: 'Missing required field: tracker_id' });
      }
      if (!callsign) {
        return res.status(400).json({ error: 'Missing required field: callsign' });
      }
      if (!iff_category || !Object.values(IFFCategory).includes(iff_category)) {
        return res.status(400).json({
          error: `Invalid iff_category. Must be one of: ${Object.values(IFFCategory).join(', ')}`,
        });
      }

      const entry = iffRegistry.add({
        tracker_id,
        iff_category,
        drone_type: drone_type || '',
        callsign,
        notes: notes || '',
        icon,
      });

      log.info(`[IFF API] Created registry entry: ${callsign} (${tracker_id})`);
      res.status(201).json(entry);
    } catch (error: any) {
      if (error.message?.includes('already exists')) {
        return res.status(409).json({ error: error.message });
      }
      log.error('[IFF API] Failed to create registry entry:', error);
      res.status(500).json({ error: 'Failed to create registry entry' });
    }
  });

  // =========================================================================
  // PUT /api/iff/registry/:id - Update a registry entry
  // =========================================================================
  router.put('/iff/registry/:id', (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body as Partial<Omit<UASRegistryEntry, 'id' | 'created_at'>>;

      // Validate iff_category if provided
      if (updates.iff_category && !Object.values(IFFCategory).includes(updates.iff_category)) {
        return res.status(400).json({
          error: `Invalid iff_category. Must be one of: ${Object.values(IFFCategory).join(', ')}`,
        });
      }

      const entry = iffRegistry.update(id, updates);
      if (!entry) {
        return res.status(404).json({ error: 'Registry entry not found' });
      }

      log.info(`[IFF API] Updated registry entry: ${entry.callsign} (${entry.tracker_id})`);
      res.json(entry);
    } catch (error: any) {
      if (error.message?.includes('already exists')) {
        return res.status(409).json({ error: error.message });
      }
      log.error('[IFF API] Failed to update registry entry:', error);
      res.status(500).json({ error: 'Failed to update registry entry' });
    }
  });

  // =========================================================================
  // DELETE /api/iff/registry/:id - Remove a registry entry
  // =========================================================================
  router.delete('/iff/registry/:id', (req, res) => {
    try {
      const { id } = req.params;
      const deleted = iffRegistry.remove(id);

      if (!deleted) {
        return res.status(404).json({ error: 'Registry entry not found' });
      }

      log.info(`[IFF API] Deleted registry entry: ${id}`);
      res.json({ success: true });
    } catch (error: any) {
      log.error('[IFF API] Failed to delete registry entry:', error);
      res.status(500).json({ error: 'Failed to delete registry entry' });
    }
  });

  // =========================================================================
  // GET /api/iff/category/:trackerId - Get IFF category for a specific tracker
  // =========================================================================
  router.get('/iff/category/:trackerId', (req, res) => {
    try {
      const { trackerId } = req.params;
      const entry = iffRegistry.getByTrackerId(trackerId);

      if (!entry) {
        return res.json({
          tracker_id: trackerId,
          iff_category: IFFCategory.YELLOW,
          in_registry: false,
          message: 'Tracker not found in IFF registry, classified as UNKNOWN',
        });
      }

      res.json({
        tracker_id: trackerId,
        iff_category: entry.iff_category,
        callsign: entry.callsign,
        drone_type: entry.drone_type,
        in_registry: true,
        entry,
      });
    } catch (error: any) {
      log.error('[IFF API] Failed to get IFF category:', error);
      res.status(500).json({ error: 'Failed to get IFF category' });
    }
  });

  // =========================================================================
  // GET /api/iff/registry/:id - Get a single registry entry by ID
  // =========================================================================
  router.get('/iff/registry/:id', (req, res) => {
    try {
      const entry = iffRegistry.getById(req.params.id);
      if (!entry) {
        return res.status(404).json({ error: 'Registry entry not found' });
      }
      res.json(entry);
    } catch (error: any) {
      log.error('[IFF API] Failed to get registry entry:', error);
      res.status(500).json({ error: 'Failed to get registry entry' });
    }
  });

  // =========================================================================
  // GET /api/iff/stats - Registry summary statistics
  // =========================================================================
  router.get('/iff/stats', (_req, res) => {
    try {
      const counts = iffRegistry.getCategoryCounts();
      const all = iffRegistry.getAll();
      res.json({
        total: all.length,
        counts,
        last_updated: all.length > 0
          ? all.reduce((latest, e) =>
              new Date(e.updated_at) > new Date(latest.updated_at) ? e : latest
            ).updated_at
          : null,
      });
    } catch (error: any) {
      log.error('[IFF API] Failed to get stats:', error);
      res.status(500).json({ error: 'Failed to get IFF stats' });
    }
  });

  return router;
}
