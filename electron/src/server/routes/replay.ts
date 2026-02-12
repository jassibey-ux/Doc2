import { Router } from 'express';
import log from 'electron-log';
import { DashboardApp } from '../app';

export function replayRoutes(app: DashboardApp): Router {
  const router = Router();

  router.get('/replay/sessions', async (_req, res) => {
    try {
      const sessions = await app.sessionLoader.scanSessions();
      res.json({
        sessions: sessions.map((s) => ({
          session_id: s.session_id,
          name: s.name,
          start_time: s.start_time,
          end_time: s.end_time,
          duration_seconds: s.duration_seconds,
          tracker_ids: s.tracker_ids,
          file_count: s.file_count,
          total_records: s.total_records,
          size_bytes: s.size_bytes,
        })),
        log_root: app.config.log_root_folder,
      });
    } catch (e) {
      log.error('Error listing replay sessions:', e);
      res.json({ sessions: [] });
    }
  });

  router.post('/replay/load/:sessionId', async (req, res) => {
    try {
      const result = await app.loadReplaySession(req.params.sessionId, req.body?.trackers);
      if (!result.success) {
        res.status(400).json(result);
        return;
      }
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  router.post('/replay/load-path', async (req, res) => {
    const { path: sessionPath } = req.body;
    if (!sessionPath) {
      res.json({ success: false, message: 'Path is required' });
      return;
    }

    try {
      const { existsSync, statSync, readdirSync } = await import('fs');
      const pathModule = await import('path');

      if (!existsSync(sessionPath)) {
        res.json({ success: false, message: `Path does not exist: ${sessionPath}` });
        return;
      }

      if (!statSync(sessionPath).isDirectory()) {
        res.json({ success: false, message: `Path is not a directory: ${sessionPath}` });
        return;
      }

      const csvFiles = readdirSync(sessionPath).filter((f: string) => f.endsWith('.csv'));
      if (csvFiles.length === 0) {
        res.json({ success: false, message: 'No CSV files found in the selected folder' });
        return;
      }

      const sessionId = pathModule.basename(sessionPath);
      const result = await app.loadReplaySession(sessionId);
      res.json(result);
    } catch (e: any) {
      res.json({ success: false, message: e.message });
    }
  });

  router.post('/replay/control', async (req, res) => {
    const { action, frame, speed } = req.query;

    if (!app.replayEngine) {
      res.status(400).json({ detail: 'No session loaded' });
      return;
    }

    try {
      switch (action) {
        case 'play':
          app.replayEngine.play();
          break;
        case 'pause':
          app.replayEngine.pause();
          break;
        case 'seek': {
          if (frame === undefined) {
            res.status(400).json({ detail: 'frame parameter is required for seek' });
            return;
          }
          const frameNum = parseInt(frame as string, 10);
          if (isNaN(frameNum) || frameNum < 0) {
            res.status(400).json({ detail: 'frame must be a non-negative integer' });
            return;
          }
          app.replayEngine.seek(frameNum);
          break;
        }
        case 'speed': {
          if (speed === undefined) {
            res.status(400).json({ detail: 'speed parameter is required for speed action' });
            return;
          }
          const speedNum = parseFloat(speed as string);
          if (isNaN(speedNum) || speedNum <= 0 || speedNum > 100) {
            res.status(400).json({ detail: 'speed must be a number between 0 and 100' });
            return;
          }
          app.replayEngine.setSpeed(speedNum);
          break;
        }
        default:
          res.status(400).json({ detail: 'Invalid action' });
          return;
      }

      const state = app.replayEngine.getCurrentState();
      app.broadcastMessage({ type: 'replay_state', data: state });
      res.json({ success: true, ...state });
    } catch (e: any) {
      res.json({ success: false, error: e.message });
    }
  });

  router.get('/replay/state', (_req, res) => {
    if (!app.replayEngine) {
      res.json({ replay_mode: false });
      return;
    }

    const state = app.replayEngine.getCurrentState();
    res.json({ replay_mode: true, ...state });
  });

  router.post('/replay/stop', async (_req, res) => {
    try {
      await app.stopReplay();
      res.json({ success: true, message: 'Replay stopped' });
    } catch (e: any) {
      res.json({ success: false, error: e.message });
    }
  });

  return router;
}
