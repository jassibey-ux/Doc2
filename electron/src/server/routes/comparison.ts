/**
 * Session Comparison API Routes
 * Side-by-side comparison of two or more test sessions' metrics
 */

import { Router } from 'express';
import {
  getTestSessionById,
  getSiteById,
  getDroneProfileById,
  getCUASProfileById,
} from '../../core/library-store';
import { sessionDataCollector } from '../../core/session-data-collector';
import log from 'electron-log';

export function comparisonRoutes(): Router {
  const router = Router();

  /**
   * GET /api/sessions/compare?ids=id1,id2
   * Compare metrics between two or more sessions
   */
  router.get('/sessions/compare', (req, res) => {
    try {
      const idsParam = req.query.ids as string;
      if (!idsParam) {
        return res.status(400).json({ error: 'ids query parameter required (comma-separated)' });
      }

      const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean);
      if (ids.length < 2) {
        return res.status(400).json({ error: 'At least 2 session IDs required for comparison' });
      }

      const sessions = [];

      for (const id of ids) {
        const session = getTestSessionById(id);
        if (!session) {
          return res.status(404).json({ error: `Session ${id} not found` });
        }

        // Get site name
        const site = session.site_id ? getSiteById(session.site_id) : null;

        // Get drone profiles used
        const droneNames: string[] = [];
        for (const assignment of session.tracker_assignments || []) {
          const drone = getDroneProfileById(assignment.drone_profile_id);
          if (drone) {
            droneNames.push(`${drone.make} ${drone.model}`);
          }
        }

        // Get CUAS profiles used
        const cuasNames: string[] = [];
        for (const placement of session.cuas_placements || []) {
          const cuas = getCUASProfileById(placement.cuas_profile_id);
          if (cuas) {
            cuasNames.push(cuas.name);
          }
        }

        sessions.push({
          session_id: session.id,
          name: session.name,
          status: session.status,
          site_name: site?.name || null,
          start_time: session.start_time || null,
          end_time: session.end_time || null,
          duration_seconds: session.duration_seconds || null,
          drone_names: droneNames,
          cuas_names: cuasNames,
          tracker_count: session.tracker_assignments?.length || 0,
          event_count: session.events?.length || 0,
          metrics: session.metrics || null,
          analysis_completed: session.analysis_completed,
        });
      }

      // Build comparison matrix for key metrics
      const metricKeys = [
        'total_flight_time_s',
        'time_under_jamming_s',
        'time_to_effect_s',
        'time_to_full_denial_s',
        'recovery_time_s',
        'effective_range_m',
        'max_lateral_drift_m',
        'altitude_delta_m',
        'pass_fail',
      ];

      const comparison: Record<string, (number | string | null)[]> = {};
      for (const key of metricKeys) {
        comparison[key] = sessions.map(s => {
          if (!s.metrics) return null;
          return (s.metrics as any)[key] ?? null;
        });
      }

      res.json({
        sessions,
        comparison,
        metric_keys: metricKeys,
      });
    } catch (error) {
      log.error('Comparison error:', error);
      res.status(500).json({ error: 'Failed to compare sessions' });
    }
  });

  return router;
}
