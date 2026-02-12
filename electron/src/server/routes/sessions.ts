import { Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { DashboardApp } from '../app';
import { CSVParser } from '../../core/parser';
import { NMEAParser } from '../../core/nmea-parser';

/**
 * Validate that a path is within an allowed directory (path traversal protection)
 */
function isPathWithinBase(targetPath: string, basePath: string): boolean {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedBase = path.resolve(basePath);
  return resolvedTarget.startsWith(resolvedBase + path.sep) || resolvedTarget === resolvedBase;
}

export function sessionRoutes(app: DashboardApp): Router {
  const router = Router();

  router.get('/events', (_req, res) => {
    const logRoot = app.config.log_root_folder;
    if (!fs.existsSync(logRoot)) {
      res.json({ events: [] });
      return;
    }

    try {
      const events = fs.readdirSync(logRoot, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
        .map((e) => e.name)
        .sort();
      res.json({ events });
    } catch {
      res.json({ events: [] });
    }
  });

  router.get('/sessions/scan', (_req, res) => {
    const sessions = app.scanner.scanSessions();
    res.json({
      sessions: sessions.map((s) => ({
        name: s.name,
        last_activity: s.last_activity,
        is_active: s.is_active,
        file_count: s.file_count,
      })),
    });
  });

  router.get('/sessions', (_req, res) => {
    const logRoot = app.config.log_root_folder;
    if (!fs.existsSync(logRoot)) {
      res.json({ sessions: [], log_root: logRoot });
      return;
    }

    const sessions: any[] = [];

    // Check for flat structure
    try {
      const rootFiles = fs.readdirSync(logRoot)
        .filter((f) => ['.csv', '.nmea'].includes(path.extname(f).toLowerCase()));

      if (rootFiles.length > 0) {
        const stats = rootFiles.map((f) => fs.statSync(path.join(logRoot, f)));
        const lastModified = Math.max(...stats.map((s) => s.mtimeMs));
        const totalSize = stats.reduce((sum, s) => sum + s.size, 0);

        sessions.push({
          name: path.basename(logRoot),
          path: logRoot,
          file_count: rootFiles.length,
          tracker_ids: [],
          tracker_count: 0,
          last_modified: new Date(lastModified).toISOString(),
          total_size_bytes: totalSize,
          is_active: app.activeEvent === path.basename(logRoot),
          is_root_folder: true,
        });
      }
    } catch { /* ignore */ }

    // Scan subdirectories
    try {
      const entries = fs.readdirSync(logRoot, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'test-sessions');

      for (const entry of entries) {
        const subPath = path.join(logRoot, entry.name);
        const csvFiles = fs.readdirSync(subPath).filter((f) => f.endsWith('.csv'));
        if (csvFiles.length === 0) continue;

        const stats = csvFiles.map((f) => fs.statSync(path.join(subPath, f)));
        const lastModified = Math.max(...stats.map((s) => s.mtimeMs));
        const totalSize = stats.reduce((sum, s) => sum + s.size, 0);

        sessions.push({
          name: entry.name,
          path: subPath,
          file_count: csvFiles.length,
          tracker_ids: [],
          tracker_count: 0,
          last_modified: new Date(lastModified).toISOString(),
          total_size_bytes: totalSize,
          is_active: app.activeEvent === entry.name,
          is_root_folder: false,
          is_test_session: false,
        });
      }
    } catch { /* ignore */ }

    // Scan test-sessions subdirectory for completed test sessions
    try {
      const testSessionsPath = path.join(logRoot, 'test-sessions');
      if (fs.existsSync(testSessionsPath)) {
        const testEntries = fs.readdirSync(testSessionsPath, { withFileTypes: true })
          .filter((e) => e.isDirectory() && !e.name.startsWith('.'));

        for (const entry of testEntries) {
          const subPath = path.join(testSessionsPath, entry.name);
          const csvFiles = fs.readdirSync(subPath).filter((f) => f.endsWith('.csv'));
          if (csvFiles.length === 0) continue;

          const stats = csvFiles.map((f) => fs.statSync(path.join(subPath, f)));
          const lastModified = Math.max(...stats.map((s) => s.mtimeMs));
          const totalSize = stats.reduce((sum, s) => sum + s.size, 0);

          // Try to read session metadata if available
          let sessionMetadata: any = null;
          const metadataPath = path.join(subPath, 'session.json');
          if (fs.existsSync(metadataPath)) {
            try {
              sessionMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
            } catch { /* ignore */ }
          }

          sessions.push({
            name: entry.name,
            path: subPath,
            file_count: csvFiles.length,
            tracker_ids: sessionMetadata?.trackerSummaries?.map((t: any) => t.trackerId) || [],
            tracker_count: sessionMetadata?.trackerCount || 0,
            last_modified: new Date(lastModified).toISOString(),
            total_size_bytes: totalSize,
            is_active: false,
            is_root_folder: false,
            is_test_session: true,
            duration_seconds: sessionMetadata?.duration_seconds,
            total_positions: sessionMetadata?.totalPositions,
          });
        }
      }
    } catch { /* ignore */ }

    // Sort by last_modified descending (newest first)
    sessions.sort((a, b) => new Date(b.last_modified).getTime() - new Date(a.last_modified).getTime());

    res.json({ sessions, log_root: logRoot, active_session: app.activeEvent });
  });

  router.get('/sessions/:sessionName/files', (req, res) => {
    const logRoot = app.config.log_root_folder;
    const sessionName = req.params.sessionName;

    // Try multiple possible paths: root, subdirectory, or test-sessions
    let sessionPath = sessionName === path.basename(logRoot) ? logRoot : path.join(logRoot, sessionName);

    // If not found, try test-sessions subdirectory
    if (!fs.existsSync(sessionPath)) {
      const testSessionPath = path.join(logRoot, 'test-sessions', sessionName);
      if (fs.existsSync(testSessionPath)) {
        sessionPath = testSessionPath;
      }
    }

    // Security: Path traversal protection
    if (!isPathWithinBase(sessionPath, logRoot)) {
      res.status(403).json({ detail: 'Access denied' });
      return;
    }

    if (!fs.existsSync(sessionPath)) {
      res.status(404).json({ detail: 'Session not found' });
      return;
    }

    try {
      const dataFiles = fs.readdirSync(sessionPath)
        .filter((f) => ['.csv', '.nmea'].includes(path.extname(f).toLowerCase()));

      const files = dataFiles.map((f) => {
        const stat = fs.statSync(path.join(sessionPath, f));
        return {
          name: f,
          path: path.join(sessionPath, f),
          size_bytes: stat.size,
          modified: new Date(stat.mtimeMs).toISOString(),
        };
      }).sort((a, b) => b.modified.localeCompare(a.modified));

      res.json({ session_name: sessionName, files, file_count: files.length });
    } catch (e: any) {
      res.status(500).json({ detail: e.message });
    }
  });

  router.get('/sessions/:sessionName/history', (req, res) => {
    const logRoot = app.config.log_root_folder;
    const sessionName = req.params.sessionName;
    const trackerId = req.query.tracker_id as string | undefined;

    // Try multiple possible paths: root, subdirectory, or test-sessions
    let sessionPath = sessionName === path.basename(logRoot) ? logRoot : path.join(logRoot, sessionName);

    // If not found, try test-sessions subdirectory
    if (!fs.existsSync(sessionPath)) {
      const testSessionPath = path.join(logRoot, 'test-sessions', sessionName);
      if (fs.existsSync(testSessionPath)) {
        sessionPath = testSessionPath;
      }
    }

    // Security: Path traversal protection
    if (!isPathWithinBase(sessionPath, logRoot)) {
      res.status(403).json({ detail: 'Access denied' });
      return;
    }

    if (!fs.existsSync(sessionPath)) {
      res.status(404).json({ detail: 'Session not found' });
      return;
    }

    try {
      const parser = new CSVParser();
      let csvFiles = fs.readdirSync(sessionPath).filter((f) => f.endsWith('.csv'));
      if (trackerId) {
        csvFiles = csvFiles.filter((f) => f.includes(`tracker_${trackerId}`));
      }

      const allRecords: any[] = [];
      for (const file of csvFiles) {
        const content = fs.readFileSync(path.join(sessionPath, file), 'utf-8');
        const records = parser.parseCSVContent(content);
        allRecords.push(...records);
      }

      allRecords.sort((a, b) => a.time_local_received.localeCompare(b.time_local_received));

      const tracks: Record<string, any[]> = {};
      for (const record of allRecords) {
        if (record.lat === null || record.lon === null) continue;
        if (!tracks[record.tracker_id]) tracks[record.tracker_id] = [];
        tracks[record.tracker_id].push({
          lat: record.lat,
          lon: record.lon,
          alt_m: record.alt_m,
          timestamp: record.time_local_received,
          timestamp_ms: new Date(record.time_local_received).getTime(),
          speed_mps: record.speed_mps,
          course_deg: record.course_deg,
          rssi_dbm: record.rssi_dbm,
        });
      }

      const startTime = allRecords.length > 0 ? allRecords[0].time_local_received : null;
      const endTime = allRecords.length > 0 ? allRecords[allRecords.length - 1].time_local_received : null;
      const durationSeconds = startTime && endTime
        ? (new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000
        : 0;

      res.json({
        session_name: sessionName,
        tracks,
        tracker_ids: Object.keys(tracks),
        total_points: Object.values(tracks).reduce((sum, t) => sum + t.length, 0),
        start_time: startTime,
        end_time: endTime,
        duration_seconds: durationSeconds,
      });
    } catch (e: any) {
      res.status(500).json({ detail: e.message });
    }
  });

  router.get('/file/history', (req, res) => {
    const filePath = req.query.path as string;
    if (!filePath || !fs.existsSync(filePath)) {
      res.status(404).json({ detail: 'File not found' });
      return;
    }

    // --- Fix 4: Path traversal protection ---
    const logRoot = app.config.log_root_folder;
    const resolvedPath = path.resolve(filePath);
    const resolvedRoot = path.resolve(logRoot);
    if (!resolvedPath.startsWith(resolvedRoot + path.sep) && resolvedPath !== resolvedRoot) {
      res.status(403).json({ detail: 'Access denied: path is outside the allowed directory' });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    if (!['.csv', '.nmea'].includes(ext)) {
      res.status(400).json({ detail: 'File must be a CSV or NMEA file' });
      return;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      let allRecords: any[];

      if (ext === '.nmea') {
        const parser = new NMEAParser();
        allRecords = parser.parseNMEAContent(content);
      } else {
        const parser = new CSVParser();
        allRecords = parser.parseCSVContent(content);
      }

      allRecords.sort((a, b) => a.time_local_received.localeCompare(b.time_local_received));

      const tracks: Record<string, any[]> = {};
      for (const record of allRecords) {
        if (record.lat === null || record.lon === null) continue;
        if (!tracks[record.tracker_id]) tracks[record.tracker_id] = [];
        tracks[record.tracker_id].push({
          lat: record.lat,
          lon: record.lon,
          alt_m: record.alt_m,
          timestamp: record.time_local_received,
          timestamp_ms: new Date(record.time_local_received).getTime(),
          speed_mps: record.speed_mps,
          course_deg: record.course_deg,
          rssi_dbm: record.rssi_dbm,
        });
      }

      const startTime = allRecords.length > 0 ? allRecords[0].time_local_received : null;
      const endTime = allRecords.length > 0 ? allRecords[allRecords.length - 1].time_local_received : null;
      const durationSeconds = startTime && endTime
        ? (new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000
        : 0;

      res.json({
        file_name: path.basename(filePath),
        file_path: filePath,
        tracks,
        tracker_ids: Object.keys(tracks),
        total_points: Object.values(tracks).reduce((sum, t) => sum + t.length, 0),
        start_time: startTime,
        end_time: endTime,
        duration_seconds: durationSeconds,
      });
    } catch (e: any) {
      res.status(500).json({ detail: e.message });
    }
  });

  return router;
}
