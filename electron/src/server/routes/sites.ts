/**
 * Site Library API Routes
 * CRUD operations for test site definitions
 */

import { Router } from 'express';
import {
  getSites,
  getSiteById,
  createSite,
  updateSite,
  deleteSite,
  duplicateSite,
  getTestSessionsBySite,
} from '../../core/library-store';
import { SiteDefinition } from '../../core/models/workflow';

export function siteRoutes(): Router {
  const router = Router();

  // GET /api/sites - List all sites
  router.get('/sites', (_req, res) => {
    try {
      const sites = getSites();
      res.json(sites);
    } catch (error) {
      console.error('[sites] GET /sites error:', error);
      res.status(500).json({ error: 'Failed to fetch sites' });
    }
  });

  // GET /api/sites/:id - Get site by ID
  router.get('/sites/:id', (req, res) => {
    try {
      const site = getSiteById(req.params.id);
      if (!site) {
        return res.status(404).json({ error: 'Site not found' });
      }
      res.json(site);
    } catch (error) {
      console.error('[sites] GET /sites/:id error:', error);
      res.status(500).json({ error: 'Failed to fetch site' });
    }
  });

  // POST /api/sites - Create new site
  router.post('/sites', (req, res) => {
    try {
      const siteData = { ...req.body } as Omit<SiteDefinition, 'id' | 'created_at' | 'updated_at'>;

      // Validate required fields
      if (!siteData.name) {
        return res.status(400).json({ error: 'Missing required field: name' });
      }

      // Center is required
      if (!siteData.center) {
        return res.status(400).json({ error: 'Missing required field: center' });
      }

      // Coordinate validation
      const { lat, lon } = siteData.center;
      if (typeof lat !== 'number' || typeof lon !== 'number' ||
          lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return res.status(400).json({ error: 'Invalid center coordinates: lat must be [-90,90], lon must be [-180,180]' });
      }

      // Normalize boundary_polygon: unwrap { points: [...] } if needed
      if (siteData.boundary_polygon && !Array.isArray(siteData.boundary_polygon)) {
        siteData.boundary_polygon = (siteData.boundary_polygon as any).points ?? [];
      }
      if (!siteData.boundary_polygon) {
        siteData.boundary_polygon = [];
      }

      // Auto-generate GeoJSON boundary from boundary_polygon if not already present
      if (siteData.boundary_polygon && siteData.boundary_polygon.length >= 3 && !siteData.boundary) {
        const coords = siteData.boundary_polygon.map((p: any) => [p.lon, p.lat]);
        coords.push(coords[0]); // Close the ring
        (siteData as any).boundary = { type: 'Polygon', coordinates: [coords] };
      }

      const site = createSite(siteData);
      res.status(201).json(site);
    } catch (error) {
      console.error('[sites] POST /sites error:', error);
      res.status(500).json({ error: 'Failed to create site' });
    }
  });

  // PUT /api/sites/:id - Update site
  router.put('/sites/:id', (req, res) => {
    try {
      const updates = req.body as Partial<SiteDefinition>;
      // Normalize boundary_polygon: unwrap { points: [...] } if needed
      if (updates.boundary_polygon && !Array.isArray(updates.boundary_polygon)) {
        updates.boundary_polygon = (updates.boundary_polygon as any).points ?? [];
      }
      // Auto-generate GeoJSON boundary from boundary_polygon if updated
      if (updates.boundary_polygon && updates.boundary_polygon.length >= 3 && !updates.boundary) {
        const coords = updates.boundary_polygon.map(p => [p.lon, p.lat]);
        coords.push(coords[0]); // Close the ring
        updates.boundary = { type: 'Polygon', coordinates: [coords] };
      }
      const site = updateSite(req.params.id, updates);

      if (!site) {
        return res.status(404).json({ error: 'Site not found' });
      }

      res.json(site);
    } catch (error) {
      console.error('[sites] PUT /sites/:id error:', error);
      res.status(500).json({ error: 'Failed to update site' });
    }
  });

  // DELETE /api/sites/:id - Delete site
  router.delete('/sites/:id', (req, res) => {
    try {
      // Check if site has associated sessions
      const sessions = getTestSessionsBySite(req.params.id);
      if (sessions.length > 0) {
        return res.status(400).json({
          error: 'Cannot delete site with associated test sessions',
          session_count: sessions.length,
        });
      }

      const deleted = deleteSite(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: 'Site not found' });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('[sites] DELETE /sites/:id error:', error);
      res.status(500).json({ error: 'Failed to delete site' });
    }
  });

  // POST /api/sites/:id/duplicate - Duplicate site
  router.post('/sites/:id/duplicate', (req, res) => {
    try {
      const { name } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'New name is required' });
      }

      const site = duplicateSite(req.params.id, name);
      if (!site) {
        return res.status(404).json({ error: 'Site not found' });
      }

      res.status(201).json(site);
    } catch (error) {
      console.error('[sites] POST /sites/:id/duplicate error:', error);
      res.status(500).json({ error: 'Failed to duplicate site' });
    }
  });

  // GET /api/sites/:id/sessions - Get sessions for a site
  router.get('/sites/:id/sessions', (req, res) => {
    try {
      const site = getSiteById(req.params.id);
      if (!site) {
        return res.status(404).json({ error: 'Site not found' });
      }

      const sessions = getTestSessionsBySite(req.params.id);
      res.json(sessions);
    } catch (error) {
      console.error('[sites] GET /sites/:id/sessions error:', error);
      res.status(500).json({ error: 'Failed to fetch sessions' });
    }
  });

  return router;
}
