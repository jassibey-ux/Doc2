/**
 * Drone Profile Library API Routes
 * CRUD operations for drone profiles
 */

import { Router } from 'express';
import {
  getDroneProfiles,
  getDroneProfileById,
  createDroneProfile,
  updateDroneProfile,
  deleteDroneProfile,
} from '../../core/library-store';
import { DroneProfile } from '../../core/models/workflow';

export function droneProfileRoutes(): Router {
  const router = Router();

  // GET /api/drone-profiles - List all profiles
  router.get('/drone-profiles', (_req, res) => {
    try {
      const profiles = getDroneProfiles();
      res.json(profiles);
    } catch (error) {
      console.error('[drone-profiles] GET /drone-profiles error:', error);
      res.status(500).json({ error: 'Failed to fetch drone profiles' });
    }
  });

  // GET /api/drone-profiles/:id - Get profile by ID
  router.get('/drone-profiles/:id', (req, res) => {
    try {
      const profile = getDroneProfileById(req.params.id);
      if (!profile) {
        return res.status(404).json({ error: 'Drone profile not found' });
      }
      res.json(profile);
    } catch (error) {
      console.error('[drone-profiles] GET /drone-profiles/:id error:', error);
      res.status(500).json({ error: 'Failed to fetch drone profile' });
    }
  });

  // POST /api/drone-profiles - Create new profile
  router.post('/drone-profiles', (req, res) => {
    try {
      const profileData = req.body as Omit<DroneProfile, 'id' | 'created_at' | 'updated_at'>;

      // Validate required fields
      if (!profileData.name || !profileData.make || !profileData.model) {
        return res.status(400).json({ error: 'Missing required fields: name, make, model' });
      }

      if (!profileData.weight_class) {
        return res.status(400).json({ error: 'Missing required field: weight_class' });
      }

      if (!profileData.expected_failsafe) {
        return res.status(400).json({ error: 'Missing required field: expected_failsafe' });
      }

      const profile = createDroneProfile(profileData);
      res.status(201).json(profile);
    } catch (error) {
      console.error('[drone-profiles] POST /drone-profiles error:', error);
      res.status(500).json({ error: 'Failed to create drone profile' });
    }
  });

  // PUT /api/drone-profiles/:id - Update profile
  router.put('/drone-profiles/:id', (req, res) => {
    try {
      const updates = req.body as Partial<DroneProfile>;
      const profile = updateDroneProfile(req.params.id, updates);

      if (!profile) {
        return res.status(404).json({ error: 'Drone profile not found' });
      }

      res.json(profile);
    } catch (error) {
      console.error('[drone-profiles] PUT /drone-profiles/:id error:', error);
      res.status(500).json({ error: 'Failed to update drone profile' });
    }
  });

  // DELETE /api/drone-profiles/:id - Delete profile
  router.delete('/drone-profiles/:id', (req, res) => {
    try {
      const deleted = deleteDroneProfile(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: 'Drone profile not found' });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('[drone-profiles] DELETE /drone-profiles/:id error:', error);
      res.status(500).json({ error: 'Failed to delete drone profile' });
    }
  });

  return router;
}
