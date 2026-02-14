import { Router } from 'express';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { DashboardApp } from '../app';
import { generateKML } from '../../core/kml-export';
import { sessionDataCollector } from '../../core/session-data-collector';
import { getTestSessionById, getSiteById, getCUASProfileById } from '../../core/library-store';

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

      const positionsByTracker = sessionDataCollector.getPositionsByTracker(sessionId);
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

      const features: any[] = [];

      // --- Drone tracks (LineString per tracker) ---
      const positionsByTracker = sessionDataCollector.getPositionsByTracker(sessionId);
      for (const [trackerId, positions] of positionsByTracker) {
        if (positions.length < 2) continue;

        const coordinates = positions.map(p => [p.longitude, p.latitude, p.altitude_m]);
        const speeds = positions.map(p => p.speed_ms).filter(s => s != null);
        const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;

        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates },
          properties: {
            feature_type: 'drone_track',
            tracker_id: trackerId,
            point_count: positions.length,
            start_time: positions[0].timestamp,
            end_time: positions[positions.length - 1].timestamp,
            avg_speed_mps: Math.round(avgSpeed * 100) / 100,
          },
        });
      }

      // --- CUAS placements (Point + coverage Polygon) ---
      const cuasPlacements = session.cuas_placements || [];
      for (const placement of cuasPlacements) {
        const profile = getCUASProfileById(placement.cuas_profile_id);
        const range = profile?.effective_range_m || 0;

        // CUAS Point
        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [placement.position.lon, placement.position.lat, placement.position.alt_m || 0],
          },
          properties: {
            feature_type: 'cuas_placement',
            cuas_name: profile?.name || 'Unknown CUAS',
            orientation_deg: placement.orientation_deg,
            effective_range_m: range,
            height_agl_m: placement.height_agl_m,
          },
        });

        // CUAS coverage polygon (36-point circle approximation)
        if (range > 0) {
          const coverageCoords: number[][] = [];
          for (let i = 0; i <= 36; i++) {
            const angle = (i % 36) * (2 * Math.PI / 36);
            // Approximate meter offset to degrees
            const dLat = (range * Math.cos(angle)) / 111320;
            const dLon = (range * Math.sin(angle)) / (111320 * Math.cos(placement.position.lat * Math.PI / 180));
            coverageCoords.push([
              placement.position.lon + dLon,
              placement.position.lat + dLat,
            ]);
          }

          features.push({
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [coverageCoords] },
            properties: {
              feature_type: 'cuas_coverage',
              cuas_name: profile?.name || 'Unknown CUAS',
              range_m: range,
              antenna_pattern: profile?.antenna_pattern || 'omni',
            },
          });
        }
      }

      // --- Engagement lines (LineString from CUAS to target) ---
      const engagements = session.engagements || [];
      for (const eng of engagements) {
        const placement = cuasPlacements.find(p => p.id === eng.cuas_placement_id);
        if (!placement) continue;

        for (const target of eng.targets || []) {
          // Use engagement-recorded positions or look up from tracker data
          const cuasLon = eng.cuas_lon ?? placement.position.lon;
          const cuasLat = eng.cuas_lat ?? placement.position.lat;
          const droneLat = target.drone_lat;
          const droneLon = target.drone_lon;

          if (droneLat == null || droneLon == null) continue;

          features.push({
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [
                [cuasLon, cuasLat],
                [droneLon, droneLat],
              ],
            },
            properties: {
              feature_type: 'engagement_line',
              engagement_id: eng.id,
              cuas_name: getCUASProfileById(placement.cuas_profile_id)?.name || 'CUAS',
              target_tracker_id: target.tracker_id,
              range_m: target.initial_range_m,
              bearing_deg: target.initial_bearing_deg,
            },
          });
        }
      }

      // --- Site boundary (Polygon) ---
      if (session.site_id) {
        const site = getSiteById(session.site_id);
        if (site && site.boundary_polygon && site.boundary_polygon.length >= 3) {
          const boundaryCoords = site.boundary_polygon.map(p => [p.lon, p.lat]);
          // Close the ring
          boundaryCoords.push(boundaryCoords[0]);

          features.push({
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [boundaryCoords] },
            properties: {
              feature_type: 'site_boundary',
              site_name: site.name,
            },
          });
        }
      }

      const featureCollection = {
        type: 'FeatureCollection',
        features,
      };

      const safeName = session.name.replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 30);
      const filename = `${safeName}_session.geojson`;

      res.setHeader('Content-Type', 'application/geo+json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.json(featureCollection);
    } catch (error) {
      res.status(500).json({ error: 'GeoJSON export failed' });
    }
  });

  return router;
}
