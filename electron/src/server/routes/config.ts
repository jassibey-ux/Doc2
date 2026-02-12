import { Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { dialog } from 'electron';
import { DashboardApp } from '../app';

export function configRoutes(app: DashboardApp): Router {
  const router = Router();

  router.get('/config', (_req, res) => {
    const logRoot = app.config.log_root_folder;
    let logRootExists = false;
    let hasSessions = false;

    try {
      const stat = fs.statSync(logRoot);
      logRootExists = stat.isDirectory();

      if (logRootExists) {
        const entries = fs.readdirSync(logRoot, { withFileTypes: true });
        hasSessions = entries.some((e) => e.isDirectory() && !e.name.startsWith('.'));
      }
    } catch {
      // ignore
    }

    res.json({
      log_root: logRoot,
      log_root_exists: logRootExists,
      has_sessions: hasSessions,
      active_event: app.activeEvent,
      is_configured: logRootExists,
      port: app.config.port,
      stale_seconds: app.config.stale_seconds,
    });
  });

  router.post('/config/log-root', async (req, res) => {
    const { path: newPath } = req.body;
    if (!newPath) {
      res.json({ success: false, message: 'Path is required' });
      return;
    }

    const result = await app.setLogRoot(newPath);
    res.json(result);
  });

  router.get('/validate-path', (req, res) => {
    const pathStr = req.query.path as string;
    if (!pathStr || !pathStr.trim()) {
      res.json({ valid: false, exists: false, is_directory: false, sessions: [], message: 'Path is empty' });
      return;
    }

    const checkPath = pathStr.trim();

    try {
      if (!fs.existsSync(checkPath)) {
        res.json({ valid: false, exists: false, is_directory: false, sessions: [], message: 'Path does not exist' });
        return;
      }

      const stat = fs.statSync(checkPath);
      if (!stat.isDirectory()) {
        res.json({ valid: false, exists: true, is_directory: false, sessions: [], message: 'Path is not a directory' });
        return;
      }

      // Scan for sessions
      const sessions: any[] = [];
      const entries = fs.readdirSync(checkPath, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
        .slice(0, 5);

      for (const entry of entries) {
        const subPath = path.join(checkPath, entry.name);
        const csvFiles = fs.readdirSync(subPath).filter((f) => f.endsWith('.csv'));
        if (csvFiles.length > 0) {
          const lastMod = Math.max(
            ...csvFiles.map((f) => fs.statSync(path.join(subPath, f)).mtimeMs)
          );
          sessions.push({
            name: entry.name,
            file_count: csvFiles.length,
            last_modified: new Date(lastMod).toISOString(),
          });
        }
      }

      // Check for supported files directly in the folder
      const supportedExts = ['.csv', '.nmea', '.kml', '.kmz'];
      const allFiles = fs.readdirSync(checkPath);
      const directFiles = allFiles.filter((f) => {
        const ext = path.extname(f).toLowerCase();
        return supportedExts.includes(ext);
      });
      const directFileCount = directFiles.length;

      // Build message
      let message: string;
      if (sessions.length > 0) {
        message = `Found ${entries.length} session(s)`;
      } else if (directFileCount > 0) {
        message = `Found ${directFileCount} file(s)`;
      } else {
        message = 'No log files found';
      }

      res.json({
        valid: true,
        exists: true,
        is_directory: true,
        sessions,
        session_count: entries.length,
        direct_file_count: directFileCount,
        message,
      });
    } catch (e: any) {
      res.json({
        valid: false,
        exists: false,
        is_directory: false,
        sessions: [],
        message: `Cannot access path: ${e.message}`,
      });
    }
  });

  router.get('/select-folder', async (_req, res) => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select Data Folder',
      });
      if (result.canceled || result.filePaths.length === 0) {
        res.json({ path: '' });
      } else {
        res.json({ path: result.filePaths[0] });
      }
    } catch (e: any) {
      res.json({ path: '' });
    }
  });

  return router;
}
