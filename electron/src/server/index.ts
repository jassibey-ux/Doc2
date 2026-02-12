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

  // Register API routes
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

  // Static files (React build) - must be last
  app.use('/', staticRoutes());

  // Start server with port conflict handling (Fix 2)
  return new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => {
      log.info(`Server listening on http://127.0.0.1:${port}`);

      // Start monitoring
      dashboardApp!.startup().then(resolve).catch(reject);
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
  if (httpServer) {
    await new Promise<void>((resolve) => {
      httpServer!.close(() => resolve());
    });
    httpServer = null;
  }
}
