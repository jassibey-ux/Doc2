/**
 * WebSocket endpoint for real-time updates.
 */

import { Server as HTTPServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import log from 'electron-log';
import { DashboardApp } from './app';

export function setupWebSocket(server: HTTPServer, app: DashboardApp): void {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    app.wsConnections.add(ws);
    log.info(`WebSocket client connected (total: ${app.wsConnections.size})`);

    // Send initial state with error handling for EPIPE
    try {
      const summaries = app.stateManager.getTrackerSummaries();
      for (const summary of summaries) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'tracker_updated',
            data: summary,
          }), (err) => {
            if (err) {
              app.wsConnections.delete(ws);
            }
          });
        }
      }

      if (app.activeEvent && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'active_event_changed',
          data: { event_name: app.activeEvent },
        }), (err) => {
          if (err) {
            app.wsConnections.delete(ws);
          }
        });
      }
    } catch (e) {
      log.error('Error sending initial state:', e);
      app.wsConnections.delete(ws);
    }

    ws.on('message', () => {
      // Keep-alive pings from client
    });

    ws.on('close', () => {
      app.wsConnections.delete(ws);
      log.info(`WebSocket client disconnected (total: ${app.wsConnections.size})`);
    });

    ws.on('error', (err) => {
      log.error('WebSocket error:', err);
      app.wsConnections.delete(ws);
    });
  });
}
