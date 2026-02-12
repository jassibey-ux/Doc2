import { Router } from 'express';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { DashboardApp } from '../app';
import { generateKML } from '../../core/kml-export';

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

  return router;
}
