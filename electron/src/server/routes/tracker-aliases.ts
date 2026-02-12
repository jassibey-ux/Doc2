/**
 * Tracker Alias API Routes
 * CRUD operations for tracker aliases (persistent naming for tracker IDs)
 */

import { Router } from 'express';
import {
  getTrackerAliases,
  getTrackerAliasById,
  getTrackerAliasByTrackerId,
  createTrackerAlias,
  updateTrackerAlias,
  deleteTrackerAlias,
} from '../../core/library-store';
import { TrackerAlias } from '../../core/models/workflow';

export function trackerAliasRoutes(): Router {
  const router = Router();

  // GET /api/tracker-aliases - List all aliases
  router.get('/tracker-aliases', (_req, res) => {
    try {
      const aliases = getTrackerAliases();
      res.json(aliases);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch tracker aliases' });
    }
  });

  // GET /api/tracker-aliases/by-tracker/:trackerId - Get alias by tracker ID
  router.get('/tracker-aliases/by-tracker/:trackerId', (req, res) => {
    try {
      const alias = getTrackerAliasByTrackerId(req.params.trackerId);
      if (!alias) {
        return res.status(404).json({ error: 'Alias not found for tracker' });
      }
      res.json(alias);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch tracker alias' });
    }
  });

  // GET /api/tracker-aliases/:id - Get alias by ID
  router.get('/tracker-aliases/:id', (req, res) => {
    try {
      const alias = getTrackerAliasById(req.params.id);
      if (!alias) {
        return res.status(404).json({ error: 'Tracker alias not found' });
      }
      res.json(alias);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch tracker alias' });
    }
  });

  // POST /api/tracker-aliases - Create new alias
  router.post('/tracker-aliases', (req, res) => {
    try {
      const aliasData = req.body as Omit<TrackerAlias, 'id' | 'created_at' | 'updated_at'>;

      // Validate required fields
      if (!aliasData.tracker_id) {
        return res.status(400).json({ error: 'Missing required field: tracker_id' });
      }

      if (!aliasData.alias) {
        return res.status(400).json({ error: 'Missing required field: alias' });
      }

      const alias = createTrackerAlias(aliasData);
      res.status(201).json(alias);
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists')) {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to create tracker alias' });
    }
  });

  // PUT /api/tracker-aliases/:id - Update alias
  router.put('/tracker-aliases/:id', (req, res) => {
    try {
      const updates = req.body as Partial<TrackerAlias>;
      const alias = updateTrackerAlias(req.params.id, updates);

      if (!alias) {
        return res.status(404).json({ error: 'Tracker alias not found' });
      }

      res.json(alias);
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists')) {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to update tracker alias' });
    }
  });

  // DELETE /api/tracker-aliases/:id - Delete alias
  router.delete('/tracker-aliases/:id', (req, res) => {
    try {
      const deleted = deleteTrackerAlias(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: 'Tracker alias not found' });
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete tracker alias' });
    }
  });

  return router;
}
