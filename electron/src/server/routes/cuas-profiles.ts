/**
 * CUAS Profile Library API Routes
 * CRUD operations for CUAS system profiles (jammers, sensors, radar, etc.)
 */

import { Router } from 'express';
import {
  getCUASProfiles,
  getCUASProfileById,
  createCUASProfile,
  updateCUASProfile,
  deleteCUASProfile,
} from '../../core/library-store';
import { CUASProfile } from '../../core/models/workflow';

export function cuasProfileRoutes(): Router {
  const router = Router();

  // GET /api/cuas-profiles - List all profiles
  router.get('/cuas-profiles', (_req, res) => {
    try {
      const profiles = getCUASProfiles();
      res.json(profiles);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch CUAS profiles' });
    }
  });

  // GET /api/cuas-profiles/:id - Get profile by ID
  router.get('/cuas-profiles/:id', (req, res) => {
    try {
      const profile = getCUASProfileById(req.params.id);
      if (!profile) {
        return res.status(404).json({ error: 'CUAS profile not found' });
      }
      res.json(profile);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch CUAS profile' });
    }
  });

  // POST /api/cuas-profiles - Create new profile
  router.post('/cuas-profiles', (req, res) => {
    try {
      const profileData = req.body as Omit<CUASProfile, 'id' | 'created_at' | 'updated_at'>;

      // Validate required fields
      if (!profileData.name || !profileData.vendor || !profileData.type) {
        return res.status(400).json({ error: 'Missing required fields: name, vendor, type' });
      }

      if (typeof profileData.effective_range_m !== 'number') {
        return res.status(400).json({ error: 'Missing required field: effective_range_m' });
      }

      // Validate CUAS type
      const validTypes = ['jammer', 'rf_sensor', 'radar', 'eo_ir_camera', 'acoustic', 'combined'];
      if (!validTypes.includes(profileData.type)) {
        return res.status(400).json({
          error: `Invalid type. Must be one of: ${validTypes.join(', ')}`,
        });
      }

      const profile = createCUASProfile(profileData);
      res.status(201).json(profile);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create CUAS profile' });
    }
  });

  // PUT /api/cuas-profiles/:id - Update profile
  router.put('/cuas-profiles/:id', (req, res) => {
    try {
      const updates = req.body as Partial<CUASProfile>;
      const profile = updateCUASProfile(req.params.id, updates);

      if (!profile) {
        return res.status(404).json({ error: 'CUAS profile not found' });
      }

      res.json(profile);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update CUAS profile' });
    }
  });

  // DELETE /api/cuas-profiles/:id - Delete profile
  router.delete('/cuas-profiles/:id', (req, res) => {
    try {
      const deleted = deleteCUASProfile(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: 'CUAS profile not found' });
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete CUAS profile' });
    }
  });

  // POST /api/cuas-profiles/:id/update-measured - Update measured performance
  router.post('/cuas-profiles/:id/update-measured', (req, res) => {
    try {
      const { measured_range_m } = req.body;

      if (typeof measured_range_m !== 'number') {
        return res.status(400).json({ error: 'measured_range_m must be a number' });
      }

      const profile = updateCUASProfile(req.params.id, { measured_range_m });

      if (!profile) {
        return res.status(404).json({ error: 'CUAS profile not found' });
      }

      res.json(profile);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update measured performance' });
    }
  });

  return router;
}
