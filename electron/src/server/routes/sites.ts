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
      res.status(500).json({ error: 'Failed to fetch site' });
    }
  });

  // POST /api/sites - Create new site
  router.post('/sites', (req, res) => {
    try {
      // Use any to allow legacy format fields
      const rawData = req.body as Record<string, unknown>;
      const siteData = { ...rawData } as Omit<SiteDefinition, 'id' | 'created_at' | 'updated_at'> & {
        center_lat?: number;
        center_lon?: number;
      };

      // Validate required fields - name and center are required, boundary_polygon is optional
      if (!siteData.name) {
        return res.status(400).json({ error: 'Missing required field: name' });
      }

      // Default center if not provided
      if (!siteData.center) {
        // If center_lat/center_lon are provided (legacy format), use those
        if (siteData.center_lat !== undefined && siteData.center_lon !== undefined) {
          siteData.center = { lat: siteData.center_lat, lon: siteData.center_lon };
        } else {
          return res.status(400).json({ error: 'Missing required field: center (or center_lat/center_lon)' });
        }
      }

      // Ensure boundary_polygon is at least an empty array if not provided
      if (!siteData.boundary_polygon) {
        siteData.boundary_polygon = [];
      }

      const site = createSite(siteData);
      res.status(201).json(site);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create site' });
    }
  });

  // PUT /api/sites/:id - Update site
  router.put('/sites/:id', (req, res) => {
    try {
      const updates = req.body as Partial<SiteDefinition>;
      const site = updateSite(req.params.id, updates);

      if (!site) {
        return res.status(404).json({ error: 'Site not found' });
      }

      res.json(site);
    } catch (error) {
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
      res.status(500).json({ error: 'Failed to fetch sessions' });
    }
  });

  return router;
}
