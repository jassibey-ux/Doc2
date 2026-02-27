import { Router } from 'express';
import { DashboardApp } from '../app';
import { generateKML } from '../../core/kml-export';
import { generateCZML } from '../../core/czml-generator';
import { generateGeoJSON } from '../../core/geojson-generator';
import { generateGeoPackage } from '../../core/geopackage-generator';
import { sessionDataCollector, recoverPositionsFromCSV } from '../../core/session-data-collector';
import { getTestSessionById, getSiteById, getCUASProfileById } from '../../core/library-store';
import type { TrackerPosition } from '../../core/mock-tracker-provider';
import type { TestSession } from '../../core/models/workflow';

/**
 * Get session telemetry with CSV-from-disk fallback for completed sessions.
 */
function getSessionTelemetry(
  sessionId: string,
  session: TestSession,
): Map<string, TrackerPosition[]> {
  let positionsByTracker = sessionDataCollector.getPositionsByTracker(sessionId);
  if (positionsByTracker.size === 0 && session.live_data_path) {
    positionsByTracker = recoverPositionsFromCSV(
      session.live_data_path,
      session.start_time,
      session.end_time,
    );
  }
  return positionsByTracker;
}

/**
 * Build a CUAS profiles Map from session placements.
 */
function buildCUASProfilesMap(session: TestSession) {
  const profiles = new Map<string, NonNullable<ReturnType<typeof getCUASProfileById>>>();
  for (const placement of session.cuas_placements || []) {
    const profile = getCUASProfileById(placement.cuas_profile_id);
    if (profile) profiles.set(placement.cuas_profile_id, profile);
  }
  return profiles;
}

export function exportRoutes(app: DashboardApp): Router {
  const router = Router();

  router.get('/export/csv', (_req, res) => {
    const trackers = app.stateManager.getAllTrackers();

    const header = [
      'tracker_id', 'time_local_received', 'time_gps',
      'lat', 'lon', 'alt_m', 'speed_mps', 'course_deg',
      'hdop', 'satellites', 'rssi_dbm', 'baro_alt_m', 'baro_temp_c',
      'baro_press_hpa', 'fix_valid', 'battery_mv', 'latency_ms',
      'is_stale', 'age_seconds',
    ].join(',');

    const rows = trackers.map((t) => [
      t.tracker_id,
      t.time_local_received || '',
      t.time_gps || '',
      t.lat ?? '',
      t.lon ?? '',
      t.alt_m ?? '',
      t.speed_mps ?? '',
      t.course_deg ?? '',
      t.hdop ?? '',
      t.satellites ?? '',
      t.rssi_dbm ?? '',
      t.baro_alt_m ?? '',
      t.baro_temp_c ?? '',
      t.baro_press_hpa ?? '',
      t.fix_valid,
      t.battery_mv ?? '',
      t.latency_ms ?? '',
      t.is_stale,
      t.age_seconds,
    ].join(','));

    const csv = [header, ...rows].join('\n');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '').substring(0, 15);
    const filename = `scensus_export_${app.activeEvent || 'data'}_${timestamp}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  });

  router.get('/export/kml', (req, res) => {
    const event = req.query.event as string | undefined;
    const trackers = app.stateManager.getAllTrackers();

    if (trackers.length === 0) {
      res.status(404).json({ detail: 'No tracker data to export' });
      return;
    }

    try {
      const kmlContent = generateKML(trackers, event || app.activeEvent);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '').substring(0, 15);
      const filename = `scensus_export_${event || app.activeEvent || 'data'}_${timestamp}.kml`;

      res.setHeader('Content-Type', 'application/vnd.google-earth.kml+xml');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(kmlContent);
    } catch (e: any) {
      res.status(500).json({ detail: 'KML export failed' });
    }
  });

  /**
   * GET /api/export/session/:id/csv
   * Export full session telemetry as CSV download
   */
  router.get('/export/session/:id/csv', (req, res) => {
    try {
      const sessionId = req.params.id;
      const session = getTestSessionById(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const positionsByTracker = getSessionTelemetry(sessionId, session);

      if (positionsByTracker.size === 0) {
        return res.status(404).json({ error: 'No telemetry data for session' });
      }

      // Build CSV
      const header = [
        'timestamp', 'tracker_id', 'lat', 'lon', 'alt_m',
        'hdop', 'satellites', 'fix_valid', 'rssi_dbm',
        'speed_mps', 'course_deg', 'battery_mv', 'gps_quality',
      ].join(',');

      const rows: string[] = [];
      for (const [trackerId, positions] of positionsByTracker) {
        for (const p of positions) {
          rows.push([
            p.timestamp,
            trackerId,
            p.latitude,
            p.longitude,
            p.altitude_m,
            p.hdop ?? '',
            p.satellites ?? '',
            p.fix_valid ?? '',
            p.rssi_dbm ?? '',
            p.speed_ms,
            p.heading_deg,
            p.battery_mv ?? '',
            p.gps_quality,
          ].join(','));
        }
      }

      // Sort by timestamp
      rows.sort();

      const crsComment = '# CRS: EPSG:4326 (WGS 84) | Altitude: meters above ellipsoid | Timestamps: ISO 8601 UTC';
      const csv = [crsComment, header, ...rows].join('\n');
      const safeName = session.name.replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 30);
      const filename = `${safeName}_telemetry.csv`;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) {
      res.status(500).json({ error: 'CSV export failed' });
    }
  });

  /**
   * GET /api/export/session/:id/geojson
   * Export session data as RFC 7946 GeoJSON FeatureCollection
   */
  router.get('/export/session/:id/geojson', (req, res) => {
    try {
      const sessionId = req.params.id;
      const session = getTestSessionById(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const positionsByTracker = getSessionTelemetry(sessionId, session);
      const cuasProfiles = buildCUASProfilesMap(session);
      const site = session.site_id ? getSiteById(session.site_id) : undefined;

      const featureCollection = generateGeoJSON({
        session,
        positionsByTracker,
        site: site || undefined,
        cuasProfiles,
      });

      const safeName = session.name.replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 30);
      const filename = `${safeName}_session.geojson`;

      res.setHeader('Content-Type', 'application/geo+json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.json(featureCollection);
    } catch (error) {
      res.status(500).json({ error: 'GeoJSON export failed' });
    }
  });

  /**
   * GET /api/export/session/:id/czml
   * Export session as CZML (Cesium Language) for 3D replay
   */
  router.get('/export/session/:id/czml', (req, res) => {
    try {
      const sessionId = req.params.id;
      const session = getTestSessionById(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const telemetry = getSessionTelemetry(sessionId, session);
      const site = session.site_id ? getSiteById(session.site_id) : undefined;

      // Gather CUAS profiles for placements
      const cuasPlacements = session.cuas_placements || [];
      const cuasProfileIds = new Set(cuasPlacements.map(p => p.cuas_profile_id));
      const cuasProfiles = Array.from(cuasProfileIds)
        .map(id => getCUASProfileById(id))
        .filter((p): p is NonNullable<typeof p> => p != null);

      const czml = generateCZML({
        session,
        telemetry,
        site,
        cuasPlacements,
        cuasProfiles,
      });

      const safeName = session.name.replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 30);
      const filename = `${safeName}_3d_replay.czml`;

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.json(czml);
    } catch (error) {
      console.error('[CZML Export] Failed:', error);
      res.status(500).json({ error: 'CZML export failed' });
    }
  });

  /**
   * GET /api/export/session/:id/geopackage
   * Export session data as OGC GeoPackage (.gpkg)
   */
  router.get('/export/session/:id/geopackage', (req, res) => {
    try {
      const sessionId = req.params.id;
      const session = getTestSessionById(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const positionsByTracker = getSessionTelemetry(sessionId, session);
      const cuasProfiles = buildCUASProfilesMap(session);
      const site = session.site_id ? getSiteById(session.site_id) : undefined;

      const featureCollection = generateGeoJSON({
        session,
        positionsByTracker,
        site: site || undefined,
        cuasProfiles,
      });

      const gpkgBuffer = generateGeoPackage(featureCollection, session.name);

      const safeName = session.name.replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 30);
      const filename = `${safeName}_session.gpkg`;

      res.setHeader('Content-Type', 'application/geopackage+sqlite3');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(gpkgBuffer);
    } catch (error) {
      console.error('[GeoPackage Export] Failed:', error);
      res.status(500).json({ error: 'GeoPackage export failed' });
    }
  });

  return router;
}
