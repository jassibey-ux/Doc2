/**
 * Session Data Collector
 * Records live tracker positions during active test sessions for later analysis
 */

import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log';
import { TrackerPosition } from './mock-tracker-provider';

export interface SessionRecording {
  sessionId: string;
  startTime: string;
  endTime?: string;
  positions: Map<string, TrackerPosition[]>; // trackerId -> positions
  events: SessionEvent[];
  isRecording: boolean;
}

export interface SessionEvent {
  id: string;
  timestamp: string;
  type: string;
  trackerId?: string;
  data?: Record<string, unknown>;
}

export interface SessionSummary {
  sessionId: string;
  startTime: string;
  endTime?: string;
  duration_seconds: number;
  trackerCount: number;
  totalPositions: number;
  eventCount: number;
  trackerSummaries: TrackerSummary[];
}

export interface TrackerSummary {
  trackerId: string;
  positionCount: number;
  firstPosition?: TrackerPosition;
  lastPosition?: TrackerPosition;
  avgAltitude: number;
  avgSpeed: number;
  gpsQualityBreakdown: {
    good: number;
    degraded: number;
    poor: number;
  };
}

class SessionDataCollector {
  private recordings: Map<string, SessionRecording> = new Map();
  // Track which trackers are assigned to each session for filtering
  private sessionTrackerIds: Map<string, Set<string>> = new Map();

  /**
   * Start recording for a session
   * @param sessionId The session ID to start recording
   * @param trackerIds Optional array of tracker IDs assigned to this session (for filtering)
   */
  startSession(sessionId: string, trackerIds: string[] = []): void {
    if (this.recordings.has(sessionId)) {
      log.warn(`Session ${sessionId} already being recorded`);
      return;
    }

    // Store allowed tracker IDs for this session (empty set means allow all)
    this.sessionTrackerIds.set(sessionId, new Set(trackerIds));

    this.recordings.set(sessionId, {
      sessionId,
      startTime: new Date().toISOString(),
      positions: new Map(),
      events: [],
      isRecording: true,
    });

    if (trackerIds.length > 0) {
      log.info(`Started recording session: ${sessionId} with ${trackerIds.length} assigned trackers: ${trackerIds.join(', ')}`);
    } else {
      log.info(`Started recording session: ${sessionId} (no tracker filter - recording all)`);
    }
  }

  /**
   * Check if a tracker is assigned to a session
   * @returns true if tracker is assigned, or if no trackers are specified (allow all)
   */
  isTrackerAssignedToSession(sessionId: string, trackerId: string): boolean {
    const allowedTrackers = this.sessionTrackerIds.get(sessionId);
    // If no tracker restriction set, allow all trackers
    if (!allowedTrackers || allowedTrackers.size === 0) return true;
    return allowedTrackers.has(trackerId);
  }

  /**
   * Update tracker assignments for an active session
   */
  updateSessionTrackers(sessionId: string, trackerIds: string[]): void {
    if (!this.recordings.has(sessionId)) {
      log.warn(`Cannot update trackers - no recording for session ${sessionId}`);
      return;
    }
    this.sessionTrackerIds.set(sessionId, new Set(trackerIds));
    log.info(`Updated session ${sessionId} trackers: ${trackerIds.join(', ')}`);
  }

  /**
   * Stop recording for a session
   */
  stopSession(sessionId: string): void {
    const recording = this.recordings.get(sessionId);
    if (!recording) {
      log.warn(`No recording found for session ${sessionId}`);
      return;
    }

    recording.endTime = new Date().toISOString();
    recording.isRecording = false;

    log.info(`Stopped recording session: ${sessionId}`);
  }

  /**
   * Check if a session is currently recording
   */
  isRecording(sessionId: string): boolean {
    const recording = this.recordings.get(sessionId);
    return recording?.isRecording ?? false;
  }

  /**
   * Record a position for a session
   * Only records if the tracker is assigned to this session
   */
  recordPosition(sessionId: string, position: TrackerPosition): void {
    const recording = this.recordings.get(sessionId);
    if (!recording || !recording.isRecording) {
      // Log discarded positions for debugging
      if (!recording) {
        log.debug(`[SessionData] Position discarded - no recording for session ${sessionId}`);
      } else if (!recording.isRecording) {
        log.debug(`[SessionData] Position discarded - session ${sessionId} not recording`);
      }
      return;
    }

    // Validate tracker is assigned to this session
    if (!this.isTrackerAssignedToSession(sessionId, position.tracker_id)) {
      // Don't log every time - too noisy. Only log first occurrence per tracker per session
      return;
    }

    const trackerId = position.tracker_id;
    if (!recording.positions.has(trackerId)) {
      recording.positions.set(trackerId, []);
      log.info(`[SessionData] New tracker ${trackerId} detected in session ${sessionId}`);
    }

    recording.positions.get(trackerId)!.push(position);

    // Log every 100th position to avoid flooding logs
    const count = recording.positions.get(trackerId)!.length;
    if (count % 100 === 0) {
      log.info(`[SessionData] Recorded ${count} positions for ${trackerId} in session ${sessionId}`);
    }
  }

  /**
   * Record multiple positions at once
   */
  recordPositions(sessionId: string, positions: TrackerPosition[]): void {
    for (const position of positions) {
      this.recordPosition(sessionId, position);
    }
  }

  /**
   * Record an event for a session
   */
  recordEvent(sessionId: string, event: Omit<SessionEvent, 'id' | 'timestamp'>): void {
    const recording = this.recordings.get(sessionId);
    if (!recording) {
      return;
    }

    recording.events.push({
      ...event,
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get all positions for a session as a flat array
   */
  getSessionPositions(sessionId: string): TrackerPosition[] {
    const recording = this.recordings.get(sessionId);
    if (!recording) {
      return [];
    }

    const allPositions: TrackerPosition[] = [];
    for (const positions of recording.positions.values()) {
      allPositions.push(...positions);
    }

    // Sort by timestamp
    allPositions.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    return allPositions;
  }

  /**
   * Get positions grouped by tracker
   * IMPORTANT: Returns a DEEP COPY to prevent data corruption between sessions
   */
  getPositionsByTracker(sessionId: string): Map<string, TrackerPosition[]> {
    const recording = this.recordings.get(sessionId);
    if (!recording) {
      return new Map();
    }

    // DEEP COPY: Create new Map with new arrays to prevent shared references
    const deepCopiedMap = new Map<string, TrackerPosition[]>();
    for (const [trackerId, positions] of recording.positions) {
      // Spread operator creates a new array (shallow copy of array, but TrackerPosition objects are not mutated)
      deepCopiedMap.set(trackerId, [...positions]);
    }
    return deepCopiedMap;
  }

  /**
   * Get session events
   * IMPORTANT: Returns a DEEP COPY to prevent data corruption
   */
  getSessionEvents(sessionId: string): SessionEvent[] {
    const recording = this.recordings.get(sessionId);
    if (!recording) {
      return [];
    }
    // Return a copy of the events array
    return [...recording.events];
  }

  /**
   * Get full session recording
   * IMPORTANT: Returns a DEEP COPY to prevent data corruption between sessions
   */
  getSessionRecording(sessionId: string): SessionRecording | undefined {
    const recording = this.recordings.get(sessionId);
    if (!recording) {
      return undefined;
    }

    // Deep copy the recording to prevent shared references
    const positionsCopy = new Map<string, TrackerPosition[]>();
    for (const [trackerId, positions] of recording.positions) {
      positionsCopy.set(trackerId, [...positions]);
    }

    return {
      sessionId: recording.sessionId,
      startTime: recording.startTime,
      endTime: recording.endTime,
      positions: positionsCopy,
      events: [...recording.events],
      isRecording: recording.isRecording,
    };
  }

  /**
   * Get session summary statistics
   */
  getSessionSummary(sessionId: string): SessionSummary | null {
    const recording = this.recordings.get(sessionId);
    if (!recording) {
      return null;
    }

    const startTime = new Date(recording.startTime);
    const endTime = recording.endTime ? new Date(recording.endTime) : new Date();
    const duration_seconds = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);

    let totalPositions = 0;
    const trackerSummaries: TrackerSummary[] = [];

    for (const [trackerId, positions] of recording.positions) {
      totalPositions += positions.length;

      if (positions.length > 0) {
        const avgAltitude = positions.reduce((sum, p) => sum + p.altitude_m, 0) / positions.length;
        const avgSpeed = positions.reduce((sum, p) => sum + p.speed_ms, 0) / positions.length;

        const gpsQualityBreakdown = {
          good: positions.filter(p => p.gps_quality === 'good').length,
          degraded: positions.filter(p => p.gps_quality === 'degraded').length,
          poor: positions.filter(p => p.gps_quality === 'poor').length,
        };

        // DEEP COPY: Clone TrackerPosition objects to prevent shared references
        trackerSummaries.push({
          trackerId,
          positionCount: positions.length,
          firstPosition: positions[0] ? { ...positions[0] } : undefined,
          lastPosition: positions[positions.length - 1] ? { ...positions[positions.length - 1] } : undefined,
          avgAltitude,
          avgSpeed,
          gpsQualityBreakdown,
        });
      }
    }

    return {
      sessionId,
      startTime: recording.startTime,
      endTime: recording.endTime,
      duration_seconds,
      trackerCount: recording.positions.size,
      totalPositions,
      eventCount: recording.events.length,
      trackerSummaries,
    };
  }

  /**
   * Export session data for analysis
   */
  exportSessionData(sessionId: string): {
    positions: TrackerPosition[];
    events: SessionEvent[];
    summary: SessionSummary | null;
  } {
    return {
      positions: this.getSessionPositions(sessionId),
      events: this.getSessionEvents(sessionId),
      summary: this.getSessionSummary(sessionId),
    };
  }

  /**
   * Clear session data
   */
  clearSession(sessionId: string): void {
    this.recordings.delete(sessionId);
    this.sessionTrackerIds.delete(sessionId);
    log.info(`Cleared session data: ${sessionId}`);
  }

  /**
   * Get all active session IDs
   */
  getActiveSessionIds(): string[] {
    return Array.from(this.recordings.entries())
      .filter(([, recording]) => recording.isRecording)
      .map(([sessionId]) => sessionId);
  }

  /**
   * Get all recorded session IDs
   */
  getAllSessionIds(): string[] {
    return Array.from(this.recordings.keys());
  }

  /**
   * Export session data to CSV files in the specified directory.
   * Creates one CSV file per tracker + events.csv
   * @returns Array of created file paths
   */
  async exportToCSV(sessionId: string, outputDir: string): Promise<string[]> {
    const recording = this.recordings.get(sessionId);
    if (!recording) {
      log.warn(`No recording found for session ${sessionId}`);
      return [];
    }

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const createdFiles: string[] = [];

    // Export positions per tracker
    for (const [trackerId, positions] of recording.positions) {
      if (positions.length === 0) continue;

      const safeTrackerId = trackerId.replace(/[^a-zA-Z0-9-_]/g, '_');
      const filename = `tracker_${safeTrackerId}.csv`;
      const filePath = path.join(outputDir, filename);

      // CSV header matching the format expected by CSVParser
      const header = [
        'tracker_id',
        'time_local_received',
        'time_gps',
        'lat',
        'lon',
        'alt_m',
        'speed_mps',
        'course_deg',
        'hdop',
        'satellites',
        'rssi_dbm',
        'baro_alt_m',
        'baro_temp_c',
        'baro_press_hpa',
        'fix_valid',
        'battery_mv',
      ].join(',');

      const rows = positions.map(p => [
        trackerId,
        p.timestamp,
        '', // time_gps (not available from mock)
        p.latitude,
        p.longitude,
        p.altitude_m,
        p.speed_ms,
        p.heading_deg,
        '', // hdop
        '', // satellites
        p.rssi_dbm ?? '',
        '', // baro_alt_m
        '', // baro_temp_c
        '', // baro_press_hpa
        p.gps_quality !== 'poor' ? 'true' : 'false',
        '', // battery_mv
      ].join(','));

      const content = [header, ...rows].join('\n');
      fs.writeFileSync(filePath, content, 'utf-8');
      createdFiles.push(filePath);
      log.info(`Exported ${positions.length} positions for ${trackerId} to ${filename}`);
    }

    // Export events if any
    if (recording.events.length > 0) {
      const eventsPath = path.join(outputDir, 'events.csv');
      const eventsHeader = 'id,timestamp,type,tracker_id,data';
      const eventsRows = recording.events.map(e => [
        e.id,
        e.timestamp,
        e.type,
        e.trackerId ?? '',
        e.data ? JSON.stringify(e.data).replace(/,/g, ';') : '', // Escape commas in JSON
      ].join(','));
      const eventsContent = [eventsHeader, ...eventsRows].join('\n');
      fs.writeFileSync(eventsPath, eventsContent, 'utf-8');
      createdFiles.push(eventsPath);
      log.info(`Exported ${recording.events.length} events to events.csv`);
    }

    // Export session metadata
    const metadataPath = path.join(outputDir, 'session.json');
    const summary = this.getSessionSummary(sessionId);
    fs.writeFileSync(metadataPath, JSON.stringify(summary, null, 2), 'utf-8');
    createdFiles.push(metadataPath);

    log.info(`Session ${sessionId} exported to ${outputDir}: ${createdFiles.length} files`);
    return createdFiles;
  }
}

// Singleton instance
export const sessionDataCollector = new SessionDataCollector();
