/**
 * Analysis API Routes
 * Provides engagement analysis data (range-over-time, GPS quality) from Express-side
 * session data collector. These routes serve data that only exists in the Electron process.
 */

import { Router } from 'express';
import { sessionDataCollector } from '../../core/session-data-collector';
import { getTestSessionById } from '../../core/library-store';

const EARTH_RADIUS_M = 6371000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function analysisRoutes(): Router {
  const router = Router();

  /**
   * GET /sessions/:sessionId/range-timeline?cuas_id=X&tracker_id=Y
   * Returns range-over-time data and events for a CUAS-to-drone pair.
   */
  router.get('/sessions/:sessionId/range-timeline', (req, res) => {
    const { sessionId } = req.params;
    const cuasId = req.query.cuas_id as string;
    const trackerId = req.query.tracker_id as string;

    if (!cuasId || !trackerId) {
      return res.status(400).json({ error: 'cuas_id and tracker_id are required' });
    }

    // Get session to find CUAS placement position
    const session = getTestSessionById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const cuasPlacement = (session.cuas_placements || []).find(
      (p: any) => p.id === cuasId
    );
    if (!cuasPlacement) {
      return res.status(404).json({ error: 'CUAS placement not found' });
    }

    // Handle both flat (lat/lon) and nested (position.lat/lon) formats
    const cuasLat = cuasPlacement.position?.lat ?? (cuasPlacement as any).lat;
    const cuasLon = cuasPlacement.position?.lon ?? (cuasPlacement as any).lon;

    if (cuasLat == null || cuasLon == null) {
      return res.status(400).json({ error: 'CUAS placement has no position' });
    }

    // Get position data from session data collector
    let positionsByTracker: Map<string, any[]>;
    try {
      positionsByTracker = sessionDataCollector.getPositionsByTracker(sessionId);
    } catch {
      return res.status(404).json({ error: 'No recorded data for this session' });
    }

    const trackerPositions = positionsByTracker.get(trackerId);
    if (!trackerPositions || trackerPositions.length === 0) {
      return res.json({ points: [], events: [] });
    }

    // Compute range at each timestamp
    const points = trackerPositions.map((pos: any) => {
      const lat = pos.latitude ?? pos.lat;
      const lon = pos.longitude ?? pos.lon;
      const range = haversineDistance(cuasLat, cuasLon, lat, lon);
      const ts = pos.timestamp
        ? new Date(pos.timestamp).getTime()
        : (pos.timestamp_ms || 0);

      return {
        timestamp_ms: ts,
        range_m: Math.round(range * 10) / 10,
        gps_quality: pos.gps_quality || 'good',
        hdop: pos.hdop ?? 1.0,
        satellites: pos.satellites ?? 12,
      };
    }).sort((a: any, b: any) => a.timestamp_ms - b.timestamp_ms);

    // Get events for this session
    let events: any[] = [];
    try {
      const sessionEvents = sessionDataCollector.getSessionEvents(sessionId);
      events = sessionEvents
        .filter((e: any) => !e.trackerId || e.trackerId === trackerId)
        .map((e: any) => ({
          timestamp_ms: new Date(e.timestamp).getTime(),
          type: e.type,
        }));
    } catch {
      // No events available
    }

    return res.json({ points, events });
  });

  return router;
}
