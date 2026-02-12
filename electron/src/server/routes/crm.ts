/**
 * CRM API Routes
 * Tagging, Annotations, Search, Analytics, and Entity History
 */

import { Router } from 'express';
import {
  // Tagging
  addTagToSession,
  removeTagFromSession,
  getSessionTags,
  getAllTags,
  getSessionsByTag,
  // Annotations
  addAnnotationToSession,
  updateAnnotation,
  removeAnnotationFromSession,
  getSessionAnnotations,
  // Search
  searchSessions,
  SessionSearchFilters,
  // Analytics
  getDashboardStats,
  // Entity History
  getSessionsByDroneProfile,
  getSessionsByCUASProfile,
  getDroneProfileStats,
  getCUASProfileStats,
  getTestSessionById,
} from '../../core/library-store';
import { AnnotationType } from '../../core/models/workflow';

export function crmRoutes(): Router {
  const router = Router();

  // ==========================================================================
  // Tagging Endpoints
  // ==========================================================================

  // GET /api/crm/tags - Get all tags with counts
  router.get('/crm/tags', (req, res) => {
    try {
      const tags = getAllTags();
      res.json({ tags });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch tags' });
    }
  });

  // GET /api/crm/sessions/by-tag/:tag - Get sessions by tag
  router.get('/crm/sessions/by-tag/:tag', (req, res) => {
    try {
      const sessions = getSessionsByTag(req.params.tag);
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch sessions by tag' });
    }
  });

  // POST /api/crm/sessions/:id/tags - Add tag to session
  router.post('/crm/sessions/:id/tags', (req, res) => {
    try {
      const { tag } = req.body;
      if (!tag || typeof tag !== 'string') {
        return res.status(400).json({ error: 'Tag is required' });
      }

      const session = addTagToSession(req.params.id, tag);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      res.json({ tags: session.tags });
    } catch (error) {
      res.status(500).json({ error: 'Failed to add tag' });
    }
  });

  // DELETE /api/crm/sessions/:id/tags/:tag - Remove tag from session
  router.delete('/crm/sessions/:id/tags/:tag', (req, res) => {
    try {
      const session = removeTagFromSession(req.params.id, req.params.tag);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      res.json({ tags: session.tags });
    } catch (error) {
      res.status(500).json({ error: 'Failed to remove tag' });
    }
  });

  // GET /api/crm/sessions/:id/tags - Get tags for a session
  router.get('/crm/sessions/:id/tags', (req, res) => {
    try {
      const tags = getSessionTags(req.params.id);
      res.json({ tags });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch session tags' });
    }
  });

  // ==========================================================================
  // Annotation Endpoints
  // ==========================================================================

  // GET /api/crm/sessions/:id/annotations - Get annotations for a session
  router.get('/crm/sessions/:id/annotations', (req, res) => {
    try {
      const type = req.query.type as AnnotationType | undefined;
      const annotations = getSessionAnnotations(req.params.id, type);
      res.json({ annotations });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch annotations' });
    }
  });

  // POST /api/crm/sessions/:id/annotations - Add annotation to session
  router.post('/crm/sessions/:id/annotations', (req, res) => {
    try {
      const { content, type, author, timestamp_ref } = req.body;

      if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: 'Content is required' });
      }

      const validTypes: AnnotationType[] = ['note', 'observation', 'issue', 'recommendation'];
      const annotationType: AnnotationType = validTypes.includes(type) ? type : 'note';

      const session = addAnnotationToSession(
        req.params.id,
        content,
        annotationType,
        author,
        timestamp_ref
      );

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Return the newly added annotation
      const newAnnotation = session.annotations?.[session.annotations.length - 1];
      res.status(201).json(newAnnotation);
    } catch (error) {
      res.status(500).json({ error: 'Failed to add annotation' });
    }
  });

  // PUT /api/crm/sessions/:id/annotations/:annotationId - Update annotation
  router.put('/crm/sessions/:id/annotations/:annotationId', (req, res) => {
    try {
      const { content } = req.body;

      if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: 'Content is required' });
      }

      const session = updateAnnotation(req.params.id, req.params.annotationId, content);
      if (!session) {
        return res.status(404).json({ error: 'Session or annotation not found' });
      }

      const updatedAnnotation = session.annotations?.find(a => a.id === req.params.annotationId);
      res.json(updatedAnnotation);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update annotation' });
    }
  });

  // DELETE /api/crm/sessions/:id/annotations/:annotationId - Remove annotation
  router.delete('/crm/sessions/:id/annotations/:annotationId', (req, res) => {
    try {
      const session = removeAnnotationFromSession(req.params.id, req.params.annotationId);
      if (!session) {
        return res.status(404).json({ error: 'Session or annotation not found' });
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to remove annotation' });
    }
  });

  // ==========================================================================
  // Search Endpoint
  // ==========================================================================

  // POST /api/crm/sessions/search - Search sessions with filters
  router.post('/crm/sessions/search', (req, res) => {
    try {
      const filters: SessionSearchFilters = req.body;
      const sessions = searchSessions(filters);

      res.json({
        sessions,
        total: sessions.length,
        filters,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to search sessions' });
    }
  });

  // GET /api/crm/sessions/search - Search with query params
  router.get('/crm/sessions/search', (req, res) => {
    try {
      const filters: SessionSearchFilters = {
        search: req.query.q as string | undefined,
        status: req.query.status ? (req.query.status as string).split(',') : undefined,
        siteId: req.query.site_id as string | undefined,
        tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
        passFail: req.query.pass_fail as string | undefined,
        droneProfileId: req.query.drone_profile_id as string | undefined,
        cuasProfileId: req.query.cuas_profile_id as string | undefined,
        startDate: req.query.start_date as string | undefined,
        endDate: req.query.end_date as string | undefined,
        operatorName: req.query.operator as string | undefined,
      };

      const sessions = searchSessions(filters);

      res.json({
        sessions,
        total: sessions.length,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to search sessions' });
    }
  });

  // ==========================================================================
  // Dashboard Analytics
  // ==========================================================================

  // GET /api/crm/dashboard - Get dashboard statistics
  router.get('/crm/dashboard', (req, res) => {
    try {
      const stats = getDashboardStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
  });

  // ==========================================================================
  // Entity History
  // ==========================================================================

  // GET /api/crm/drone-profiles/:id/sessions - Get sessions for drone profile
  router.get('/crm/drone-profiles/:id/sessions', (req, res) => {
    try {
      const sessions = getSessionsByDroneProfile(req.params.id);
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch sessions for drone profile' });
    }
  });

  // GET /api/crm/drone-profiles/:id/stats - Get stats for drone profile
  router.get('/crm/drone-profiles/:id/stats', (req, res) => {
    try {
      const stats = getDroneProfileStats(req.params.id);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch drone profile stats' });
    }
  });

  // GET /api/crm/cuas-profiles/:id/sessions - Get sessions for CUAS profile
  router.get('/crm/cuas-profiles/:id/sessions', (req, res) => {
    try {
      const sessions = getSessionsByCUASProfile(req.params.id);
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch sessions for CUAS profile' });
    }
  });

  // GET /api/crm/cuas-profiles/:id/stats - Get stats for CUAS profile
  router.get('/crm/cuas-profiles/:id/stats', (req, res) => {
    try {
      const stats = getCUASProfileStats(req.params.id);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch CUAS profile stats' });
    }
  });

  // GET /api/crm/sites/:id/sessions - Get sessions for site
  router.get('/crm/sites/:id/sessions', (req, res) => {
    try {
      const sessions = searchSessions({ siteId: req.params.id });
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch sessions for site' });
    }
  });

  return router;
}
