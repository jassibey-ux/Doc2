import { Router } from 'express';
import log from 'electron-log';
import { DashboardApp } from '../app';
import { getPythonBackend } from '../../core/python-backend';

const PYTHON_BACKEND_PORT = 8083;
const PYTHON_BACKEND_URL = `http://127.0.0.1:${PYTHON_BACKEND_PORT}`;

export function healthRoutes(app: DashboardApp): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      version: app.version,
      active_event: app.activeEvent,
      tracker_count: app.stateManager.getTrackerCount(),
      uptime_seconds: app.uptimeSeconds,
    });
  });

  router.get('/health/backend', async (_req, res) => {
    let running = false;
    try {
      const backend = getPythonBackend();
      running = backend.isRunning;
    } catch {
      // getPythonBackend may throw if not initialized
    }

    let reachable = false;
    try {
      const resp = await fetch(`${PYTHON_BACKEND_URL}/api/health`, {
        signal: AbortSignal.timeout(3000),
      });
      reachable = resp.ok;
    } catch {
      // Connection refused or timeout
    }

    res.json({
      python_backend: {
        running,
        reachable,
        port: PYTHON_BACKEND_PORT,
      },
    });
  });

  return router;
}
