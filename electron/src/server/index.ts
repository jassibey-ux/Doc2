/**
 * Express HTTP + WebSocket server bootstrap.
 */

import express from 'express';
import cors from 'cors';
import { createServer, Server as HTTPServer } from 'http';
import log from 'electron-log';
import { setupWebSocket } from './websocket';
import { DashboardApp } from './app';
import { healthRoutes } from './routes/health';
import { configRoutes } from './routes/config';
import { trackerRoutes } from './routes/trackers';
import { sessionRoutes } from './routes/sessions';
import { replayRoutes } from './routes/replay';
import { exportRoutes } from './routes/exports';
import { uploadRoutes } from './routes/upload';
import { staticRoutes } from './routes/static';
// CUAS Workflow routes
import { siteRoutes } from './routes/sites';
import { droneProfileRoutes } from './routes/drone-profiles';
import { cuasProfileRoutes } from './routes/cuas-profiles';
import { testSessionRoutes } from './routes/test-sessions';
import { sdMergeRoutes } from './routes/sd-merge';
import { reportsRoutes } from './routes/reports';
import { systemRoutes } from './routes/system';
import { crmRoutes } from './routes/crm';
import { trackerAliasRoutes } from './routes/tracker-aliases';
import { comparisonRoutes } from './routes/comparison';
import { cloudSyncRoutes } from './routes/cloud-sync';
import { siteReconRoutes } from './routes/site-recon';
// Ops Mode routes
import { iffRoutes } from './routes/iff';
import { detectionRoutes } from './routes/detections';
import { analysisRoutes } from './routes/analysis';
import { loadConfig } from '../core/config';
// Backend convergence: Python proxy + subprocess
import { simplePythonProxy } from './proxy';
import { sessionBridgeMiddleware } from './session-bridge';
import { getPythonBackend } from '../core/python-backend';
// CoT listener + deconfliction (Ops Mode)
import { CotListener } from '../core/cot-listener';
import { deconflictionEngine } from '../core/deconfliction';
import { cotActorBridge } from '../core/cot-actor-bridge';

let cotListener: CotListener | null = null;

let dashboardApp: DashboardApp | null = null;
let httpServer: HTTPServer | null = null;

export function getDashboardApp(): DashboardApp {
  if (!dashboardApp) throw new Error('DashboardApp not initialized');
  return dashboardApp;
}

export async function startServer(port: number): Promise<void> {
  const app = express();

  // --- Fix 6: CORS ---
  app.use(cors({ origin: `http://127.0.0.1:${port}` }));

  // JSON body parser
  app.use(express.json());

  const server = createServer(app);
  httpServer = server;

  // Initialize DashboardApp
  dashboardApp = new DashboardApp();

  // Setup WebSocket
  setupWebSocket(server, dashboardApp);

  // Wire CoT actor bridge broadcast to DashboardApp WebSocket
  cotActorBridge.setBroadcast((msg) => {
    dashboardApp!.broadcastMessage(msg as any);
  });

  // Session bridge: intercept v2 session start/stop to bridge Express data collection
  // Must come before the proxy so it can handle these specific paths
  app.use(sessionBridgeMiddleware());

  // Backend convergence: proxy /api/v2/* to Python backend
  // This must come before the Express API routes so /api/v2 paths hit Python first
  app.use(simplePythonProxy());

  // Register API routes (v1 — served by Express)
  app.use('/api', healthRoutes(dashboardApp));
  app.use('/api', configRoutes(dashboardApp));
  app.use('/api', trackerRoutes(dashboardApp));
  app.use('/api', sessionRoutes(dashboardApp));
  app.use('/api', replayRoutes(dashboardApp));
  app.use('/api', exportRoutes(dashboardApp));
  app.use('/api', uploadRoutes(dashboardApp));

  // CUAS Workflow routes
  app.use('/api', siteRoutes());
  app.use('/api', droneProfileRoutes());
  app.use('/api', cuasProfileRoutes());
  app.use('/api', testSessionRoutes());
  app.use('/api', sdMergeRoutes());
  app.use('/api', reportsRoutes());
  app.use('/api', systemRoutes(dashboardApp));
  app.use('/api', trackerAliasRoutes());

  // CRM routes (tagging, annotations, search, analytics)
  app.use('/api', crmRoutes());

  // Session comparison
  app.use('/api', comparisonRoutes());

  // Cloud sync
  app.use('/api', cloudSyncRoutes());

  // Site recon (3D screenshot cache)
  app.use('/api', siteReconRoutes());

  // Engagement analysis routes (range-over-time, GPS quality)
  app.use('/api', analysisRoutes());

  // Ops Mode routes (IFF registry and detections)
  app.use('/api', iffRoutes());
  app.use('/api', detectionRoutes());

  // Static files (React build) - must be last
  app.use('/', staticRoutes());

  // Determine bind host: if ops_mode is enabled, use ops_bind_host for network access
  const config = loadConfig();
  const bindHost = config.ops_mode ? (config.ops_bind_host || '0.0.0.0') : '127.0.0.1';

  // When in ops mode, allow CORS from any origin for network clients
  if (config.ops_mode) {
    app.use(cors({ origin: true }));
    log.info(`[Ops Mode] Enabled - binding to ${bindHost}, CORS opened for network access`);
  }

  // Start server with port conflict handling (Fix 2)
  return new Promise((resolve, reject) => {
    server.listen(port, bindHost, async () => {
      log.info(`Server listening on http://${bindHost}:${port}`);

      // Await Python backend so the window doesn't load before it's ready
      const pythonBackend = getPythonBackend({
        logRootFolder: config.log_root_folder,
      });
      try {
        const ready = await pythonBackend.start();
        log.info(ready
          ? '[server] Python backend ready — /api/v2/* proxied'
          : '[server] Python backend not available — /api/v2/* will fall through to Express');
      } catch (err) {
        log.warn(`[server] Python backend start failed: ${err}`);
      }

      // Start CoT listener in ops mode — fire-and-forget (non-critical)
      if (config.ops_mode && config.cot_enabled) {
        cotListener = new CotListener(
          {
            port: config.cot_listen_port,
            multicastGroup: config.cot_multicast_group,
          },
          (events) => {
            for (const event of events) {
              deconflictionEngine.processCotEvent(event);
            }
            // Forward CoT events to session actor bridge for operator position tracking
            cotActorBridge.processCotEvents(events);
          },
        );
        deconflictionEngine.updateConfig({
          proximity_threshold_m: config.iff_proximity_threshold_m,
        });
        cotListener.start().then(() => {
          log.info(`[Ops Mode] CoT listener started on UDP port ${config.cot_listen_port}`);
        }).catch((err) => {
          log.warn(`[Ops Mode] CoT listener failed to start: ${err}`);
        });
      }

      // Start monitoring — must succeed for resolve
      try {
        await dashboardApp!.startup();
        resolve();
      } catch (err) {
        reject(err as Error);
      }
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        log.error(`Port ${port} is already in use`);
        reject(new Error(
          `Port ${port} is already in use. Another instance may be running, or another application is using this port.`
        ));
      } else {
        reject(err);
      }
    });
  });
}

export async function stopServer(): Promise<void> {
  // Stop CoT listener
  if (cotListener) {
    await cotListener.stop();
    cotListener = null;
  }

  // Stop Python backend subprocess
  try {
    const pythonBackend = getPythonBackend();
    if (pythonBackend.isRunning) {
      pythonBackend.stop();
    }
  } catch {
    // Ignore if not initialized
  }

  if (httpServer) {
    await new Promise<void>((resolve) => {
      httpServer!.close(() => resolve());
    });
    httpServer = null;
  }
}
