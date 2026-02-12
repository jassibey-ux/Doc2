/**
 * DashboardApp orchestrator.
 * Coordinates state, watcher, replay, and WebSocket broadcasting.
 */

import * as path from 'path';
import * as fs from 'fs';
import log from 'electron-log';
import { TrackerRecord, TrackerState, TrackerSummary, WebSocketMessage, GPSHealthStatus, GPSFixLossEvent } from '../core/models';
import { getTrackerAliasByTrackerId } from '../core/library-store';
import { StateManager } from '../core/state';
import { LogWatcher } from '../core/watcher';
import { SessionScanner } from '../core/session-scanner';
import { SessionLoader, ReplayEngine, FrameGroup } from '../core/replay';
import { AppConfig, loadConfig, saveConfigAtomic, getConfigPath } from '../core/config';
import { AnomalyDetector, AnomalyAlert } from '../core/anomaly-detector';
import { sessionDataCollector } from '../core/session-data-collector';
import WebSocket from 'ws';

// --- Fix 11: Read version from package.json ---
function getAppVersion(): string {
  try {
    const pkgPath = path.join(__dirname, '../../package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      return pkg.version || '0.0.0';
    }
  } catch { /* fallback */ }
  return '0.0.0';
}

const APP_VERSION = getAppVersion();

export class DashboardApp {
  config: AppConfig;
  stateManager: StateManager;
  anomalyDetector: AnomalyDetector;
  watcher: LogWatcher | null = null;
  activeEvent: string | null = null;
  scanner: SessionScanner;
  sessionLoader: SessionLoader;
  replayEngine: ReplayEngine | null = null;
  replayMode = false;
  startTime = Date.now();
  wsConnections = new Set<WebSocket>();

  constructor() {
    this.config = loadConfig();

    this.stateManager = new StateManager(
      this.config.stale_seconds,
      (state) => this.onTrackerUpdated(state),
      (state) => this.onTrackerStale(state),
      (trackerId, prevStatus, newStatus, event) => this.onGPSHealthChange(trackerId, prevStatus, newStatus, event),
      this.config.low_battery_mv,
      this.config.critical_battery_mv
    );

    // Initialize anomaly detector with alert callback
    this.anomalyDetector = new AnomalyDetector(
      {
        altitudeAnomalyThresholdM: 50,
        positionJumpThresholdM: 500,
        alertCooldownMs: 5000,
      },
      (alert) => this.onAnomalyDetected(alert)
    );

    this.scanner = new SessionScanner(this.config.log_root_folder);
    this.sessionLoader = new SessionLoader(this.config.log_root_folder);
  }

  get version(): string {
    return APP_VERSION;
  }

  get uptimeSeconds(): number {
    return (Date.now() - this.startTime) / 1000;
  }

  async startup(): Promise<void> {
    log.info('='.repeat(60));
    log.info('SCENSUS Dashboard - Initializing');
    log.info('='.repeat(60));

    this.stateManager.start();

    const { existsSync } = await import('fs');
    const logRoot = this.config.log_root_folder;

    if (!existsSync(logRoot)) {
      log.warn(`Data folder does not exist: ${logRoot}`);
      // --- Fix 10: Broadcast folder error to UI ---
      this.broadcastMessage({
        type: 'error' as any,
        data: {
          code: 'FOLDER_NOT_FOUND',
          message: `Data folder does not exist: ${logRoot}`,
          path: logRoot,
        },
      });
      return;
    }

    // Start watching
    this.watcher = new LogWatcher(
      logRoot,
      (records) => this.onRecords(records),
      (filePath) => this.onNewFile(filePath)
    );
    await this.watcher.start();
    this.activeEvent = path.basename(logRoot);

    log.info(`Monitoring: ${logRoot}`);
  }

  async shutdown(): Promise<void> {
    log.info('Shutting down dashboard application');

    if (this.watcher) {
      await this.watcher.stop();
      this.watcher = null;
    }

    this.stateManager.stop();

    for (const ws of this.wsConnections) {
      try { ws.close(); } catch { /* ignore */ }
    }
    this.wsConnections.clear();
  }

  async setLogRoot(newPath: string): Promise<{ success: boolean; message: string; log_root?: string }> {
    const { existsSync, statSync } = await import('fs');

    if (!existsSync(newPath)) {
      return { success: false, message: `Path does not exist: ${newPath}` };
    }

    const stat = statSync(newPath);
    if (!stat.isDirectory()) {
      return { success: false, message: `Path is not a directory: ${newPath}` };
    }

    try {
      if (this.watcher) {
        await this.watcher.stop();
        this.watcher = null;
      }

      this.stateManager.clearAll();
      this.activeEvent = null;

      this.config.log_root_folder = newPath;
      this.scanner = new SessionScanner(newPath);
      this.sessionLoader = new SessionLoader(newPath);

      // Save config
      saveConfigAtomic({ log_root_folder: newPath });

      // Broadcast config change
      this.broadcastMessage({
        type: 'config_changed',
        data: { log_root: newPath, log_root_exists: true },
      });

      // Start monitoring
      this.watcher = new LogWatcher(
        newPath,
        (records) => this.onRecords(records),
        (filePath) => this.onNewFile(filePath)
      );
      await this.watcher.start();
      this.activeEvent = path.basename(newPath);

      this.broadcastMessage({
        type: 'active_event_changed',
        data: { event_name: this.activeEvent },
      });

      return { success: true, message: `Now monitoring: ${newPath}`, log_root: newPath };
    } catch (e: any) {
      return { success: false, message: `Failed to set log root: ${e.message}` };
    }
  }

  async loadReplaySession(sessionId: string, trackers?: string[]): Promise<any> {
    const sessions = await this.sessionLoader.scanSessions();
    const session = sessions.find((s) => s.session_id === sessionId);

    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    // Stop any existing watcher immediately
    if (this.watcher) {
      await this.watcher.stop();
      this.watcher = null;
    }

    this.stateManager.clearAll();
    this.replayMode = true;

    // Return metadata immediately (Phase 1)
    const response = {
      success: true,
      phase: 'metadata',
      frames_ready: false,
      session: {
        session_id: session.session_id,
        name: session.name,
        duration_seconds: session.duration_seconds,
        tracker_ids: session.tracker_ids,
        total_records: session.total_records,
        start_time: session.start_time,
        end_time: session.end_time,
      },
    };

    // Build frames in background (Phase 2 - non-blocking with timeout)
    const FRAME_BUILD_TIMEOUT_MS = 180000; // 3 minute timeout for frame building (safety net)

    // Progress callback to notify frontend during frame building
    const progressCallback = (frameIndex: number, totalFrames: number) => {
      this.broadcastMessage({
        type: 'replay_build_progress' as any,
        data: {
          session_id: sessionId,
          frame_index: frameIndex,
          total_frames: totalFrames,
          percent: Math.round((frameIndex / totalFrames) * 100),
        },
      });
    };

    setImmediate(async () => {
      try {
        log.info(`[Replay] Starting background frame building for session: ${sessionId}`);

        // Create a timeout promise to prevent indefinite hangs
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Frame building timed out after 3 minutes')), FRAME_BUILD_TIMEOUT_MS);
        });

        // Race between timeline loading and timeout
        const timeline = await Promise.race([
          this.sessionLoader.loadTimeline(session, trackers, progressCallback),
          timeoutPromise,
        ]);

        if (!timeline || timeline.length === 0) {
          this.broadcastMessage({
            type: 'replay_frames_error' as any,
            data: {
              session_id: sessionId,
              error: 'No data in session',
            },
          });
          return;
        }

        this.replayEngine = new ReplayEngine(timeline, this.stateManager);
        this.replayEngine.setBroadcastCallback((msg) => {
          this.broadcastMessage({ type: msg.type as any, data: msg });
        });

        log.info(`[Replay] Frames ready: ${timeline.length} frames built`);

        // Notify frontend that frames are ready
        this.broadcastMessage({
          type: 'replay_frames_ready' as any,
          data: {
            session_id: sessionId,
            frame_count: timeline.length,
          },
        });
      } catch (error: any) {
        log.error(`[Replay] Frame building failed:`, error);
        this.broadcastMessage({
          type: 'replay_frames_error' as any,
          data: {
            session_id: sessionId,
            error: error.message,
          },
        });
      }
    });

    return response;
  }

  async stopReplay(): Promise<void> {
    if (this.replayEngine) {
      this.replayEngine.pause();
      this.replayEngine = null;
    }
    this.replayMode = false;
    this.stateManager.clearAll();

    // Restore watcher for live tracking (following setLogRoot pattern)
    const logRoot = this.config.log_root_folder;
    if (logRoot && !this.watcher) {
      const { existsSync } = await import('fs');
      if (existsSync(logRoot)) {
        this.watcher = new LogWatcher(
          logRoot,
          (records) => this.onRecords(records),
          (filePath) => this.onNewFile(filePath)
        );
        await this.watcher.start();
        this.activeEvent = path.basename(logRoot);
        log.info(`[Replay] Restored live monitoring: ${logRoot}`);

        // Notify clients that live tracking is restored
        this.broadcastMessage({
          type: 'active_event_changed',
          data: { event_name: this.activeEvent },
        });
      }
    }
  }

  broadcastMessage(message: WebSocketMessage): void {
    if (this.wsConnections.size === 0) return;

    const json = JSON.stringify(message);
    const disconnected: WebSocket[] = [];

    for (const ws of this.wsConnections) {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          // Use callback version to catch async errors like EPIPE
          ws.send(json, (err) => {
            if (err) {
              // Silently remove the connection on send error (EPIPE, etc.)
              this.wsConnections.delete(ws);
            }
          });
        } else {
          disconnected.push(ws);
        }
      } catch {
        disconnected.push(ws);
      }
    }

    for (const ws of disconnected) {
      this.wsConnections.delete(ws);
    }
  }

  private onRecords(records: TrackerRecord[]): void {
    for (const record of records) {
      this.stateManager.updateTracker(record);
    }
  }

  private onNewFile(filePath: string): void {
    this.broadcastMessage({
      type: 'new_file_detected',
      data: {
        filename: path.basename(filePath),
        path: filePath,
        timestamp: new Date().toISOString(),
      },
    });
  }

  private onTrackerUpdated(state: TrackerState): void {
    // Look up alias from tracker alias registry
    const aliasRecord = getTrackerAliasByTrackerId(state.tracker_id);

    const summary: TrackerSummary = {
      tracker_id: state.tracker_id,
      alias: aliasRecord?.alias,  // Include alias if set
      lat: state.lat,
      lon: state.lon,
      alt_m: state.alt_m,
      rssi_dbm: state.rssi_dbm,
      fix_valid: state.fix_valid,
      is_stale: state.is_stale,
      age_seconds: state.age_seconds,
      last_update: state.time_local_received,
      battery_mv: state.battery_mv,
      speed_mps: state.speed_mps,
      heading_deg: state.course_deg,
      last_known_lat: state.last_known_lat,
      last_known_lon: state.last_known_lon,
      last_known_alt_m: state.last_known_alt_m,
      last_known_time: state.last_known_time,
      stale_since: state.stale_since,
      low_battery: state.low_battery,
      battery_critical: state.battery_critical,
      gps_health: {
        health_status: state.gps_health.health_status,
        fix_valid: state.gps_health.fix_valid,
        fix_type: state.gps_health.fix_type,
        hdop: state.gps_health.hdop,
        satellites: state.gps_health.satellites,
        current_loss_duration_ms: state.gps_health.current_loss_duration_ms,
        total_fix_loss_events: state.gps_health.total_fix_loss_events,
        fix_availability_percent: state.gps_health.fix_availability_percent,
        health_score: state.gps_health.health_score,
      },
    };

    // Process through anomaly detector
    this.anomalyDetector.processUpdate(summary);

    // Record position to active recording sessions where this tracker is assigned
    if (state.lat !== null && state.lon !== null) {
      const position = {
        tracker_id: state.tracker_id,
        timestamp: state.time_local_received,
        latitude: state.lat,
        longitude: state.lon,
        altitude_m: state.alt_m ?? 0,
        speed_ms: state.speed_mps ?? 0,
        heading_deg: state.course_deg ?? 0,
        rssi_dbm: state.rssi_dbm ?? -100,
        gps_quality: this.determineGPSQuality(state),
        source: 'live',
        hdop: state.hdop ?? 1.0,
        satellites: state.satellites ?? 10,
        fix_valid: state.fix_valid,
        battery_mv: state.battery_mv ?? 4000,
      };

      for (const sessionId of sessionDataCollector.getActiveSessionIds()) {
        // Only record if tracker is assigned to this session (or if no filter set)
        if (sessionDataCollector.isTrackerAssignedToSession(sessionId, state.tracker_id)) {
          sessionDataCollector.recordPosition(sessionId, position);
        }
      }
    }

    this.broadcastMessage({
      type: 'tracker_updated',
      data: summary as any,
    });
  }

  private determineGPSQuality(state: TrackerState): 'good' | 'degraded' | 'poor' {
    if (!state.fix_valid) return 'poor';
    if (state.hdop !== null && state.hdop > 5) return 'degraded';
    if (state.satellites !== null && state.satellites < 4) return 'degraded';
    return 'good';
  }

  private onTrackerStale(state: TrackerState): void {
    // Process stale event through anomaly detector
    this.anomalyDetector.processStale(state.tracker_id, state.age_seconds);

    this.broadcastMessage({
      type: 'tracker_stale',
      data: {
        tracker_id: state.tracker_id,
        age_seconds: state.age_seconds,
      },
    });
  }

  private onAnomalyDetected(alert: AnomalyAlert): void {
    log.info(`Anomaly detected: ${alert.type} for ${alert.tracker_id} - ${alert.message}`);

    this.broadcastMessage({
      type: 'anomaly_alert',
      data: { ...alert } as Record<string, unknown>,
    });
  }

  private onGPSHealthChange(
    trackerId: string,
    previousStatus: GPSHealthStatus,
    newStatus: GPSHealthStatus,
    event: GPSFixLossEvent | null
  ): void {
    log.info(`GPS health changed for ${trackerId}: ${previousStatus} -> ${newStatus}`);

    this.broadcastMessage({
      type: 'gps_health_alert',
      data: {
        tracker_id: trackerId,
        previous_status: previousStatus,
        new_status: newStatus,
        fix_loss_event: event,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Enable/disable anomaly detection
   */
  setAnomalyDetectionEnabled(enabled: boolean): void {
    this.anomalyDetector.setEnabled(enabled);
  }

  /**
   * Check if anomaly detection is enabled
   */
  isAnomalyDetectionEnabled(): boolean {
    return this.anomalyDetector.isEnabled();
  }
}
