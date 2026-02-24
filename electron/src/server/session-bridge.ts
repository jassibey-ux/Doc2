/**
 * Session Bridge Middleware
 *
 * Intercepts v2 session start/stop calls (which go to the Python backend)
 * and bridges them to the Express-side sessionDataCollector so that live
 * tracker telemetry is collected and exported to CSV for replay.
 *
 * Without this bridge, the Python backend manages session status but has
 * no access to the live tracker data that flows through Express WebSocket.
 * The tracker data arrives via WebSocket to Express (app.ts), gets recorded
 * by sessionDataCollector in-memory, and must be exported to CSV on stop.
 */

import { Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log';
import { sessionDataCollector } from '../core/session-data-collector';
import { loadConfig } from '../core/config';
import { cotActorBridge } from '../core/cot-actor-bridge';
import { getDashboardApp } from './index';

const PYTHON_BACKEND_PORT = 8083;
const PYTHON_BACKEND_URL = `http://127.0.0.1:${PYTHON_BACKEND_PORT}`;

// Match /api/v2/sessions/:id/start or /api/v2/sessions/:id/stop
const SESSION_START_RE = /^\/api\/v2\/sessions\/([^/]+)\/start$/;
const SESSION_STOP_RE = /^\/api\/v2\/sessions\/([^/]+)\/stop$/;
// Match /api/v2/sessions (POST — create) — no trailing ID
const SESSION_CREATE_RE = /^\/api\/v2\/sessions\/?$/;
// Match /api/v2/sessions/:id/assign-tracker or /cuas-placement
const SESSION_ASSIGN_TRACKER_RE = /^\/api\/v2\/sessions\/([^/]+)\/assign-tracker$/;
const SESSION_CUAS_PLACEMENT_RE = /^\/api\/v2\/sessions\/([^/]+)\/cuas-placement$/;
// Mobile companion paths — intercept for WebSocket broadcast
const CUAS_GEOTAG_RE = /^\/api\/v2\/cuas-placements\/([^/]+)\/geotag$/;
const SDR_READING_RE = /^\/api\/v2\/sessions\/([^/]+)\/sdr-readings$/;

// Local map of session live_data_paths (since sessions live in Python's DB)
// Persisted to disk so paths survive app restarts.
const sessionPaths = new Map<string, string>();
const SESSION_PATHS_FILE = path.join(
  loadConfig().log_root_folder,
  'session-paths.json',
);

/** Load persisted session paths from disk */
function loadSessionPaths(): void {
  try {
    if (fs.existsSync(SESSION_PATHS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSION_PATHS_FILE, 'utf-8'));
      for (const [id, p] of Object.entries(data)) {
        if (typeof p === 'string') sessionPaths.set(id, p);
      }
      log.info(`[session-bridge] Loaded ${sessionPaths.size} persisted session paths`);
    }
  } catch (e: any) {
    log.warn(`[session-bridge] Failed to load session paths: ${e.message}`);
  }
}

/** Save session paths to disk */
function saveSessionPaths(): void {
  try {
    const obj: Record<string, string> = {};
    for (const [id, p] of sessionPaths) obj[id] = p;
    fs.mkdirSync(path.dirname(SESSION_PATHS_FILE), { recursive: true });
    fs.writeFileSync(SESSION_PATHS_FILE, JSON.stringify(obj, null, 2));
  } catch (e: any) {
    log.warn(`[session-bridge] Failed to save session paths: ${e.message}`);
  }
}

// Load on module init
loadSessionPaths();

/** Get the live_data_path for a Python v2 session */
export function getSessionLiveDataPath(sessionId: string): string | null {
  return sessionPaths.get(sessionId) ?? null;
}

/**
 * Forward a request to the Python backend and return the parsed response.
 */
async function forwardToPython(req: Request): Promise<{ status: number; data: any }> {
  const url = `${PYTHON_BACKEND_URL}${req.originalUrl}`;

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') {
      headers[key] = value;
    }
  }
  delete headers['host'];

  const fetchOptions: RequestInit = {
    method: req.method,
    headers,
    signal: AbortSignal.timeout(60000),
  };

  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
    fetchOptions.body = JSON.stringify(req.body);
  }

  const response = await fetch(url, fetchOptions);
  const data = await response.json();
  return { status: response.status, data };
}

/**
 * Update a field on the Python session via PUT.
 */
async function updatePythonSession(sessionId: string, updates: Record<string, any>): Promise<void> {
  const url = `${PYTHON_BACKEND_URL}/api/v2/sessions/${sessionId}`;
  await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
    signal: AbortSignal.timeout(10000),
  });
}

/**
 * Handle session START: forward to Python, then start Express-side data collection.
 */
async function handleSessionStart(req: Request, res: Response, sessionId: string): Promise<void> {
  // Forward to Python first
  let pythonResult: { status: number; data: any };
  try {
    pythonResult = await forwardToPython(req);
  } catch (e: any) {
    log.warn(`[session-bridge] Python backend unavailable for start: ${e.message}`);
    res.status(502).json({
      error: 'Python backend unavailable',
      detail: `Cannot reach backend at ${PYTHON_BACKEND_URL}`,
      code: 'BACKEND_UNAVAILABLE',
    });
    return;
  }

  if (pythonResult.status >= 400) {
    res.status(pythonResult.status).json(pythonResult.data);
    return;
  }

  // Bridge to Express sessionDataCollector using data from the Python response
  try {
    // Python start returns the session object (may be wrapped in { session: ... })
    const session = pythonResult.data.session ?? pythonResult.data;

    // Extract assigned tracker IDs from the Python session
    const trackerAssignments = session.tracker_assignments ?? [];
    const assignedTrackerIds: string[] = trackerAssignments.map((a: any) => a.tracker_id);
    const sessionName: string = session.name || sessionId;

    log.info(`[session-bridge] Starting Express data collection for session ${sessionId} with ${assignedTrackerIds.length} trackers: ${assignedTrackerIds.join(', ') || 'all'}`);

    // Start recording in sessionDataCollector
    sessionDataCollector.startSession(sessionId, assignedTrackerIds);

    // Create session directory for CSV export
    const config = loadConfig();
    const safeName = sessionName.replace(/[^a-zA-Z0-9-_]/g, '_');
    const sessionDirName = `${safeName}_${Date.now()}`;
    const sessionPath = path.join(config.log_root_folder, 'test-sessions', sessionDirName);
    fs.mkdirSync(sessionPath, { recursive: true });
    log.info(`[session-bridge] Created session directory: ${sessionPath}`);

    // Store locally for stop handler and persist to disk
    sessionPaths.set(sessionId, sessionPath);
    saveSessionPaths();

    // Update live_data_path on the Python session
    try {
      await updatePythonSession(sessionId, { live_data_path: sessionPath });
      log.info(`[session-bridge] Updated Python session live_data_path: ${sessionPath}`);
    } catch (updateErr: any) {
      log.warn(`[session-bridge] Failed to update live_data_path on Python: ${updateErr.message}`);
    }

    // Activate CoT-to-actor bridge for operator position tracking
    cotActorBridge.setActiveSession(sessionId).catch((err) => {
      log.warn(`[session-bridge] CoT actor bridge activation failed: ${err}`);
    });
  } catch (bridgeError: any) {
    // Log but don't fail — Python side succeeded, data collection is best-effort
    log.error(`[session-bridge] Express bridge error on start: ${bridgeError.message}`);
  }

  res.status(pythonResult.status).json(pythonResult.data);
}

/**
 * Handle session STOP: export Express-side data, then forward to Python.
 */
async function handleSessionStop(req: Request, res: Response, sessionId: string): Promise<void> {
  // Export Express-side telemetry BEFORE forwarding to Python
  // (data is in-memory in sessionDataCollector — must export while it exists)
  let expressExportSummary: {
    files_created: string[];
    total_positions: number;
    trackers_exported: string[];
    output_path: string;
  } | null = null;

  try {
    const livePath = sessionPaths.get(sessionId);

    if (sessionDataCollector.isRecording(sessionId)) {
      // Stop recording
      sessionDataCollector.stopSession(sessionId);

      if (livePath) {
        const createdFiles = await sessionDataCollector.exportToCSV(sessionId, livePath);
        const summary = sessionDataCollector.getSessionSummary(sessionId);

        expressExportSummary = {
          files_created: createdFiles.map(f => path.basename(f)),
          total_positions: summary?.totalPositions || 0,
          trackers_exported: summary?.trackerSummaries.map(t => t.trackerId) || [],
          output_path: livePath,
        };

        log.info(`[session-bridge] Exported session ${sessionId}: ${createdFiles.length} files, ${expressExportSummary.total_positions} positions to ${livePath}`);
      } else {
        log.warn(`[session-bridge] Session ${sessionId} has no live_data_path — cannot export CSV`);
      }
    } else {
      log.warn(`[session-bridge] Session ${sessionId} not recording in sessionDataCollector`);

      // Still try to export if there's data (session was stopped but data exists)
      if (livePath && sessionDataCollector.getSessionSummary(sessionId)) {
        const createdFiles = await sessionDataCollector.exportToCSV(sessionId, livePath);
        const summary = sessionDataCollector.getSessionSummary(sessionId);
        expressExportSummary = {
          files_created: createdFiles.map(f => path.basename(f)),
          total_positions: summary?.totalPositions || 0,
          trackers_exported: summary?.trackerSummaries.map(t => t.trackerId) || [],
          output_path: livePath,
        };
        log.info(`[session-bridge] Late export for session ${sessionId}: ${createdFiles.length} files`);
      }
    }

    // Keep sessionPaths entry — needed by raw-telemetry endpoint after session ends

    // Deactivate CoT-to-actor bridge
    cotActorBridge.setActiveSession(null).catch(() => {});
  } catch (bridgeError: any) {
    log.error(`[session-bridge] Express bridge error on stop: ${bridgeError.message}`);
  }

  // Forward to Python
  let pythonResult: { status: number; data: any };
  try {
    pythonResult = await forwardToPython(req);
  } catch (e: any) {
    log.warn(`[session-bridge] Python backend unavailable for stop: ${e.message}`);
    // Even if Python is down, we've already exported the Express-side data
    res.status(502).json({
      error: 'Python backend unavailable',
      detail: `Cannot reach backend at ${PYTHON_BACKEND_URL}`,
      code: 'BACKEND_UNAVAILABLE',
      export_summary: expressExportSummary,
    });
    return;
  }

  // Merge Express export_summary into the Python response
  const responseData = { ...pythonResult.data };
  if (expressExportSummary) {
    // Use Express export_summary (which has the actual tracker data) as primary
    responseData.export_summary = expressExportSummary;
  }

  res.status(pythonResult.status).json(responseData);
}

/**
 * Handle session CREATE: forward to Python, then cache locally for library/GPX features.
 */
async function handleSessionCreate(req: Request, res: Response): Promise<void> {
  let pythonResult: { status: number; data: any };
  try {
    pythonResult = await forwardToPython(req);
  } catch (e: any) {
    log.warn(`[session-bridge] Python backend unavailable for create: ${e.message}`);
    res.status(502).json({
      error: 'Python backend unavailable',
      detail: `Cannot reach backend at ${PYTHON_BACKEND_URL}`,
      code: 'BACKEND_UNAVAILABLE',
    });
    return;
  }

  if (pythonResult.status >= 400) {
    res.status(pythonResult.status).json(pythonResult.data);
    return;
  }

  // Broadcast session_created to WebSocket clients for real-time UI updates
  try {
    getDashboardApp().broadcastMessage({
      type: 'session_created',
      data: pythonResult.data,
    });
  } catch (e: any) {
    log.warn(`[session-bridge] Failed to broadcast session_created: ${e.message}`);
  }

  res.status(pythonResult.status).json(pythonResult.data);
}

/**
 * Handle assign-tracker / cuas-placement: forward to Python, broadcast update.
 */
async function handleSessionSubResource(
  req: Request,
  res: Response,
  sessionId: string,
  resourceType: 'assign-tracker' | 'cuas-placement',
): Promise<void> {
  let pythonResult: { status: number; data: any };
  try {
    pythonResult = await forwardToPython(req);
  } catch (e: any) {
    log.warn(`[session-bridge] Python backend unavailable for ${resourceType}: ${e.message}`);
    res.status(502).json({
      error: 'Python backend unavailable',
      detail: `Cannot reach backend at ${PYTHON_BACKEND_URL}`,
      code: 'BACKEND_UNAVAILABLE',
    });
    return;
  }

  if (pythonResult.status < 400) {
    // Broadcast update so other clients see it in real-time
    try {
      getDashboardApp().broadcastMessage({
        type: resourceType === 'assign-tracker' ? 'tracker_assigned' : 'cuas_placed',
        data: { session_id: sessionId, ...pythonResult.data },
      });
    } catch {
      // Non-critical
    }
  }

  res.status(pythonResult.status).json(pythonResult.data);
}

/**
 * Create middleware that bridges v2 session start/stop to Express data collection.
 * Must be registered BEFORE the Python proxy middleware.
 */
export function sessionBridgeMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Only intercept POST requests
    if (req.method !== 'POST') {
      return next();
    }

    // Session create — forward + broadcast
    if (req.path.match(SESSION_CREATE_RE)) {
      await handleSessionCreate(req, res);
      return;
    }

    const startMatch = req.path.match(SESSION_START_RE);
    if (startMatch) {
      const sessionId = startMatch[1];
      await handleSessionStart(req, res, sessionId);
      return;
    }

    const stopMatch = req.path.match(SESSION_STOP_RE);
    if (stopMatch) {
      const sessionId = stopMatch[1];
      await handleSessionStop(req, res, sessionId);
      return;
    }

    // Assign tracker — forward + broadcast
    const assignMatch = req.path.match(SESSION_ASSIGN_TRACKER_RE);
    if (assignMatch) {
      await handleSessionSubResource(req, res, assignMatch[1], 'assign-tracker');
      return;
    }

    // CUAS placement — forward + broadcast
    const placementMatch = req.path.match(SESSION_CUAS_PLACEMENT_RE);
    if (placementMatch) {
      await handleSessionSubResource(req, res, placementMatch[1], 'cuas-placement');
      return;
    }

    // Mobile companion: CUAS geotag — forward then broadcast
    const geotagMatch = req.path.match(CUAS_GEOTAG_RE);
    if (geotagMatch) {
      try {
        const result = await forwardToPython(req);
        if (result.status < 400) {
          getDashboardApp().broadcastMessage({
            type: 'cuas_geotagged',
            data: result.data,
          });
        }
        res.status(result.status).json(result.data);
      } catch {
        next(); // Fall through to proxy if Python unreachable
      }
      return;
    }

    // Mobile companion: SDR reading — forward then broadcast
    const sdrMatch = req.path.match(SDR_READING_RE);
    if (sdrMatch) {
      try {
        const result = await forwardToPython(req);
        if (result.status < 400) {
          getDashboardApp().broadcastMessage({
            type: 'sdr_captured',
            data: { session_id: sdrMatch[1], ...result.data },
          });
        }
        res.status(result.status).json(result.data);
      } catch {
        next(); // Fall through to proxy if Python unreachable
      }
      return;
    }

    // Not a handled path — pass through to proxy
    next();
  };
}
