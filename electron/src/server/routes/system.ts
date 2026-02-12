/**
 * System API Routes
 * Endpoints for system-level operations including demo mode
 */

import { Router } from 'express';
import log from 'electron-log';
import {
  MockTrackerProvider,
  getMockTrackerProvider,
  resetMockTrackerProvider,
} from '../../core/mock-tracker-provider';
import { sessionDataCollector } from '../../core/session-data-collector';
import { getLibraryStats } from '../../core/library-store';
import { DashboardApp } from '../app';

// Store demo mode state
let demoModeEnabled = false;
let demoModeApp: DashboardApp | null = null;

export function systemRoutes(app: DashboardApp): Router {
  const router = Router();
  demoModeApp = app;

  /**
   * GET /api/system/status
   * Get overall system status
   */
  router.get('/system/status', (_req, res) => {
    const libraryStats = getLibraryStats();
    const mockProvider = getMockTrackerProvider();

    res.json({
      demoMode: {
        enabled: demoModeEnabled,
        trackerCount: mockProvider.isRunning() ? mockProvider.getTrackerIds().length : 0,
        trackerIds: mockProvider.isRunning() ? mockProvider.getTrackerIds() : [],
      },
      recording: {
        activeSessionIds: sessionDataCollector.getActiveSessionIds(),
        allSessionIds: sessionDataCollector.getAllSessionIds(),
      },
      libraries: libraryStats,
      anomalyDetection: {
        enabled: app.isAnomalyDetectionEnabled(),
      },
    });
  });

  /**
   * POST /api/system/demo-mode
   * Enable or disable demo mode
   */
  router.post('/system/demo-mode', (req, res) => {
    const { enabled, siteCenter } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    try {
      if (enabled) {
        enableDemoMode(siteCenter);
        res.json({
          success: true,
          message: 'Demo mode enabled',
          trackerIds: getMockTrackerProvider().getTrackerIds(),
        });
      } else {
        disableDemoMode();
        res.json({
          success: true,
          message: 'Demo mode disabled',
        });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      log.error('Error toggling demo mode:', error);
      res.status(500).json({ error: message });
    }
  });

  /**
   * GET /api/system/demo-mode
   * Get demo mode status
   */
  router.get('/system/demo-mode', (_req, res) => {
    const mockProvider = getMockTrackerProvider();

    res.json({
      enabled: demoModeEnabled,
      running: mockProvider.isRunning(),
      trackerCount: mockProvider.isRunning() ? mockProvider.getTrackerIds().length : 0,
      trackerIds: mockProvider.isRunning() ? mockProvider.getTrackerIds() : [],
    });
  });

  /**
   * POST /api/system/demo-mode/trackers
   * Add custom mock trackers (for advanced demo scenarios)
   */
  router.post('/system/demo-mode/trackers', (req, res) => {
    if (!demoModeEnabled) {
      return res.status(400).json({ error: 'Demo mode is not enabled' });
    }

    const { trackers } = req.body;

    if (!Array.isArray(trackers)) {
      return res.status(400).json({ error: 'trackers must be an array' });
    }

    const mockProvider = getMockTrackerProvider();

    for (const tracker of trackers) {
      if (!tracker.trackerId || !tracker.startPosition) {
        continue;
      }

      mockProvider.addMockTracker({
        trackerId: tracker.trackerId,
        startPosition: tracker.startPosition,
        altitude: tracker.altitude || 50,
        speed: tracker.speed || 10,
        heading: tracker.heading || 0,
        pattern: tracker.pattern || 'circular',
        waypoints: tracker.waypoints,
        color: tracker.color,
      });
    }

    res.json({
      success: true,
      trackerCount: mockProvider.getTrackerIds().length,
      trackerIds: mockProvider.getTrackerIds(),
    });
  });

  /**
   * DELETE /api/system/demo-mode/trackers/:trackerId
   * Remove a specific mock tracker
   */
  router.delete('/system/demo-mode/trackers/:trackerId', (req, res) => {
    if (!demoModeEnabled) {
      return res.status(400).json({ error: 'Demo mode is not enabled' });
    }

    const { trackerId } = req.params;
    const mockProvider = getMockTrackerProvider();

    mockProvider.removeMockTracker(trackerId);

    res.json({
      success: true,
      trackerCount: mockProvider.getTrackerIds().length,
    });
  });

  /**
   * POST /api/system/recording/start
   * Start recording session data
   */
  router.post('/system/recording/start', (req, res) => {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    sessionDataCollector.startSession(sessionId);

    res.json({
      success: true,
      message: `Started recording session: ${sessionId}`,
    });
  });

  /**
   * POST /api/system/recording/stop
   * Stop recording session data
   */
  router.post('/system/recording/stop', (req, res) => {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    sessionDataCollector.stopSession(sessionId);
    const summary = sessionDataCollector.getSessionSummary(sessionId);

    res.json({
      success: true,
      message: `Stopped recording session: ${sessionId}`,
      summary,
    });
  });

  /**
   * GET /api/system/recording/:sessionId
   * Get recorded session data
   */
  router.get('/system/recording/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const data = sessionDataCollector.exportSessionData(sessionId);

    if (data.positions.length === 0 && data.events.length === 0) {
      return res.status(404).json({ error: 'No data found for session' });
    }

    res.json(data);
  });

  /**
   * DELETE /api/system/recording/:sessionId
   * Clear recorded session data
   */
  router.delete('/system/recording/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    sessionDataCollector.clearSession(sessionId);

    res.json({
      success: true,
      message: `Cleared session data: ${sessionId}`,
    });
  });

  return router;
}

/**
 * Enable demo mode with mock trackers
 */
function enableDemoMode(siteCenter?: [number, number]): void {
  if (demoModeEnabled) {
    log.info('Demo mode already enabled');
    return;
  }

  const mockProvider = getMockTrackerProvider();

  // Add default demo trackers
  const defaultTrackers = MockTrackerProvider.getDefaultDemoTrackers(siteCenter);
  for (const tracker of defaultTrackers) {
    mockProvider.addMockTracker(tracker);
  }

  // Setup position update handler - route through StateManager for proper GPS health tracking
  mockProvider.on('position', (position) => {
    if (demoModeApp) {
      // Create a TrackerRecord and pass it through the StateManager
      // This ensures GPS health tracking works properly
      const record = {
        tracker_id: position.tracker_id,
        time_local_received: position.timestamp,
        time_gps: position.timestamp,
        time_received: position.timestamp,
        lat: position.latitude,
        lon: position.longitude,
        alt_m: position.altitude_m,
        speed_mps: position.speed_ms,
        course_deg: position.heading_deg,
        hdop: position.hdop,
        satellites: position.satellites,
        rssi_dbm: position.rssi_dbm,
        baro_alt_m: null,
        baro_temp_c: null,
        baro_press_hpa: null,
        fix_valid: position.fix_valid,
        battery_mv: position.battery_mv,
        latency_ms: null,
      };

      // Update through state manager - this triggers GPS health tracking and broadcasts
      demoModeApp.stateManager.updateTracker(record);

      // Record for any active sessions
      for (const sessionId of sessionDataCollector.getActiveSessionIds()) {
        sessionDataCollector.recordPosition(sessionId, position);
      }
    }
  });

  mockProvider.start();
  demoModeEnabled = true;

  log.info(`Demo mode enabled with ${mockProvider.getTrackerIds().length} trackers`);

  // Broadcast demo mode status
  if (demoModeApp) {
    demoModeApp.broadcastMessage({
      type: 'demo_mode_changed',
      data: {
        enabled: true,
        trackerIds: mockProvider.getTrackerIds(),
      },
    });
  }
}

/**
 * Disable demo mode
 */
function disableDemoMode(): void {
  if (!demoModeEnabled) {
    return;
  }

  resetMockTrackerProvider();
  demoModeEnabled = false;

  log.info('Demo mode disabled');

  // Broadcast demo mode status
  if (demoModeApp) {
    demoModeApp.broadcastMessage({
      type: 'demo_mode_changed',
      data: {
        enabled: false,
        trackerIds: [],
      },
    });
  }
}

/**
 * Check if demo mode is enabled
 */
export function isDemoModeEnabled(): boolean {
  return demoModeEnabled;
}
