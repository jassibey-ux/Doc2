/**
 * Replay system for historical session playback.
 */

import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log';
import { TrackerRecord } from './models';
import { CSVParser } from './parser';
import { StateManager } from './state';
import { getTestSessions } from './library-store';

export interface ReplaySession {
  session_id: string;
  name: string;
  path: string;
  duration_seconds: number;
  start_time: string;
  end_time: string;
  tracker_ids: string[];
  file_count: number;
  total_records: number;
  size_bytes: number;
}

export interface FrameGroup {
  frame_index: number;
  timestamp: string;
  records: Map<string, TrackerRecord>;
  duration_seconds: number;
}

export type BroadcastCallback = (msg: Record<string, unknown>) => void;

export class SessionLoader {
  private parser = new CSVParser();

  constructor(private logRoot: string) {}

  async scanSessions(): Promise<ReplaySession[]> {
    const sessions: ReplaySession[] = [];

    if (!fs.existsSync(this.logRoot)) return sessions;

    try {
      // Check if logRoot itself contains CSV files (treat as a session if so)
      const csvInRoot = fs.readdirSync(this.logRoot)
        .filter((f) => path.extname(f).toLowerCase() === '.csv');

      if (csvInRoot.length > 0) {
        const session = await this.analyzeSession(this.logRoot);
        if (session) {
          sessions.push(session);
          // NOTE: Don't return early - continue scanning subdirectories for more sessions
        }
      }

      // Scan subdirectories (one level)
      const entries = fs.readdirSync(this.logRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

        const entryPath = path.join(this.logRoot, entry.name);

        // Check if this directory contains CSV files directly
        const session = await this.analyzeSession(entryPath);
        if (session) {
          sessions.push(session);
        } else {
          // If no CSV files found, scan subdirectories (for test-sessions/ folder structure)
          // This handles: log_root/test-sessions/{session_name}/*.csv
          try {
            const subEntries = fs.readdirSync(entryPath, { withFileTypes: true });
            for (const subEntry of subEntries) {
              if (!subEntry.isDirectory() || subEntry.name.startsWith('.')) continue;
              const subSession = await this.analyzeSession(path.join(entryPath, subEntry.name));
              if (subSession) sessions.push(subSession);
            }
          } catch {
            // Ignore errors scanning subdirectories
          }
        }
      }

      // Also check library-store for completed sessions with live_data_path
      // This bridges the gap between JSON metadata and file-based storage
      try {
        const testSessions = getTestSessions().filter(
          (s) => (s.status === 'completed' || s.status === 'capturing') && s.live_data_path
        );

        for (const ts of testSessions) {
          // Check if already found via file scan
          const alreadyFound = sessions.find((s) => s.path === ts.live_data_path);
          if (!alreadyFound && ts.live_data_path && fs.existsSync(ts.live_data_path)) {
            const session = await this.analyzeSession(ts.live_data_path);
            if (session) {
              // Use the session name from the metadata
              session.name = ts.name;
              session.session_id = ts.id;
              sessions.push(session);
              log.info(`[Replay] Found session from library-store: ${ts.name} at ${ts.live_data_path}`);
            }
          }
        }
      } catch (libError) {
        log.warn('[Replay] Could not check library-store for sessions:', libError);
      }

      // Sort by most recent first
      sessions.sort((a, b) => b.start_time.localeCompare(a.start_time));
      return sessions;
    } catch (e) {
      log.error('Error scanning sessions:', e);
      return [];
    }
  }

  private async analyzeSession(sessionPath: string): Promise<ReplaySession | null> {
    try {
      const csvFiles = fs.readdirSync(sessionPath)
        .filter((f) => path.extname(f).toLowerCase() === '.csv')
        .map((f) => path.join(sessionPath, f));

      if (csvFiles.length === 0) return null;

      let totalSize = 0;
      const trackerIds = new Set<string>();
      const allTimes: number[] = [];
      let totalRecords = 0;

      for (const csvFile of csvFiles) {
        try {
          const stat = fs.statSync(csvFile);
          totalSize += stat.size;

          const content = fs.readFileSync(csvFile, 'utf-8');
          const lines = content.split('\n').filter((l) => l.trim());
          if (lines.length <= 1) continue;

          const header = lines[0];

          // Parse first record
          if (lines.length > 1) {
            const records = this.parser.parseCSVContent(header + '\n' + lines[1]);
            if (records.length > 0) {
              trackerIds.add(records[0].tracker_id);
              const t = new Date(records[0].time_local_received).getTime();
              if (!isNaN(t)) allTimes.push(t);
            }
          }

          // Parse last record
          if (lines.length > 2) {
            const records = this.parser.parseCSVContent(header + '\n' + lines[lines.length - 1]);
            if (records.length > 0) {
              const t = new Date(records[0].time_local_received).getTime();
              if (!isNaN(t)) allTimes.push(t);
            }
          }

          totalRecords += lines.length - 1;
        } catch {
          continue;
        }
      }

      if (allTimes.length === 0) return null;

      const startTime = Math.min(...allTimes);
      const endTime = Math.max(...allTimes);
      const duration = (endTime - startTime) / 1000;

      return {
        session_id: path.basename(sessionPath),
        name: path.basename(sessionPath),
        path: sessionPath,
        duration_seconds: duration,
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
        tracker_ids: Array.from(trackerIds).sort(),
        file_count: csvFiles.length,
        total_records: totalRecords,
        size_bytes: totalSize,
      };
    } catch (e) {
      log.error(`Error analyzing session ${sessionPath}:`, e);
      return null;
    }
  }

  async loadTimeline(
    session: ReplaySession,
    selectedTrackers?: string[],
    progressCallback?: (frameIndex: number, totalFrames: number) => void
  ): Promise<FrameGroup[]> {
    const allRecords: TrackerRecord[] = [];

    const csvFiles = fs.readdirSync(session.path)
      .filter((f) => path.extname(f).toLowerCase() === '.csv')
      .map((f) => path.join(session.path, f));

    for (const csvFile of csvFiles) {
      try {
        const content = fs.readFileSync(csvFile, 'utf-8');
        const records = this.parser.parseCSVContent(content);

        for (const record of records) {
          if (!selectedTrackers || selectedTrackers.includes(record.tracker_id)) {
            allRecords.push(record);
          }
        }
      } catch (e) {
        log.error(`Error loading ${csvFile}:`, e);
      }
    }

    if (allRecords.length === 0) return [];

    // Sort by time
    allRecords.sort((a, b) => a.time_local_received.localeCompare(b.time_local_received));

    // Use optimized async buildFrames with progress reporting
    return await this.buildFrames(allRecords, 0.5, progressCallback);
  }

  /**
   * Build frame groups from records - OPTIMIZED with index tracking
   * Uses O(n) algorithm instead of O(n³) by tracking position per tracker.
   * Includes progress reporting and chunked processing.
   */
  private async buildFrames(
    records: TrackerRecord[],
    frameInterval = 0.5,
    progressCallback?: (frameIndex: number, totalFrames: number) => void
  ): Promise<FrameGroup[]> {
    if (records.length === 0) return [];

    const frames: FrameGroup[] = [];
    const startTime = new Date(records[0].time_local_received).getTime();
    const endTime = new Date(records[records.length - 1].time_local_received).getTime();

    // Group by tracker and pre-compute timestamps for efficiency
    const byTracker = new Map<string, { record: TrackerRecord; timestamp: number }[]>();
    for (const record of records) {
      const list = byTracker.get(record.tracker_id) || [];
      list.push({
        record,
        timestamp: new Date(record.time_local_received).getTime(),
      });
      byTracker.set(record.tracker_id, list);
    }

    // Sort each tracker's records by timestamp (they should already be sorted, but ensure it)
    for (const [, trackerRecords] of byTracker) {
      trackerRecords.sort((a, b) => a.timestamp - b.timestamp);
    }

    const intervalMs = frameInterval * 1000;
    let currentTime = startTime;
    let frameIndex = 0;
    const CHUNK_SIZE = 100; // Yield more frequently for better responsiveness
    const PROGRESS_INTERVAL = 50; // Report progress every 50 frames

    // Calculate total frames for progress reporting
    const totalFrames = Math.ceil((endTime - startTime) / intervalMs);

    // Track current index per tracker for O(1) lookup instead of O(n) linear search
    const trackerIndices = new Map<string, number>();
    for (const trackerId of byTracker.keys()) {
      trackerIndices.set(trackerId, 0);
    }

    log.info(`[Replay] Building ${totalFrames} frames for ${byTracker.size} trackers (${records.length} records)`);

    while (currentTime <= endTime) {
      const frameRecords = new Map<string, TrackerRecord>();

      for (const [trackerId, trackerRecords] of byTracker) {
        // Get current index for this tracker (optimized: O(1) instead of O(n))
        let idx = trackerIndices.get(trackerId) || 0;

        // Move forward through records until we find one past current time
        // This is O(1) amortized because we only move forward
        while (
          idx < trackerRecords.length - 1 &&
          trackerRecords[idx + 1].timestamp <= currentTime
        ) {
          idx++;
        }

        // Update the tracked index for next frame
        trackerIndices.set(trackerId, idx);

        // Check if we have a valid record within tolerance
        const currentRecord = trackerRecords[idx];
        if (currentRecord) {
          const delta = Math.abs(currentRecord.timestamp - currentTime);

          // Also check the next record if available for a potentially closer match
          if (idx < trackerRecords.length - 1) {
            const nextRecord = trackerRecords[idx + 1];
            const nextDelta = Math.abs(nextRecord.timestamp - currentTime);
            if (nextDelta < delta && nextDelta < intervalMs * 2) {
              frameRecords.set(trackerId, nextRecord.record);
            } else if (delta < intervalMs * 2) {
              frameRecords.set(trackerId, currentRecord.record);
            }
          } else if (delta < intervalMs * 2) {
            frameRecords.set(trackerId, currentRecord.record);
          }
        }
      }

      if (frameRecords.size > 0) {
        frames.push({
          frame_index: frameIndex,
          timestamp: new Date(currentTime).toISOString(),
          records: frameRecords,
          duration_seconds: frameInterval,
        });
      }

      currentTime += intervalMs;
      frameIndex++;

      // Report progress periodically
      if (progressCallback && frameIndex % PROGRESS_INTERVAL === 0) {
        progressCallback(frameIndex, totalFrames);
      }

      // Yield to event loop periodically to prevent UI freeze
      if (frameIndex % CHUNK_SIZE === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    // Final progress report
    if (progressCallback) {
      progressCallback(totalFrames, totalFrames);
    }

    log.info(`[Replay] Built ${frames.length} frames for ${byTracker.size} trackers`);
    return frames;
  }
}

export class ReplayEngine {
  currentFrameIndex = 0;
  playbackSpeed = 1.0;
  isPlaying = false;
  private playbackTimer: ReturnType<typeof setTimeout> | null = null;
  private broadcastCallback: BroadcastCallback | null = null;

  constructor(
    private frames: FrameGroup[],
    private stateManager: StateManager
  ) {}

  setBroadcastCallback(callback: BroadcastCallback): void {
    this.broadcastCallback = callback;
  }

  play(): void {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.scheduleNextFrame();
  }

  pause(): void {
    this.isPlaying = false;
    if (this.playbackTimer) {
      clearTimeout(this.playbackTimer);
      this.playbackTimer = null;
    }
  }

  seek(frameIndex: number): void {
    if (frameIndex < 0 || frameIndex >= this.frames.length) return;

    const wasPlaying = this.isPlaying;
    if (wasPlaying) this.pause();

    this.currentFrameIndex = frameIndex;
    this.emitFrame(this.frames[frameIndex]);

    if (wasPlaying) this.play();
  }

  setSpeed(speed: number): void {
    this.playbackSpeed = Math.max(0.1, Math.min(10.0, speed));
  }

  getCurrentState(): Record<string, unknown> {
    const currentFrame = this.currentFrameIndex < this.frames.length
      ? this.frames[this.currentFrameIndex]
      : null;

    return {
      is_playing: this.isPlaying,
      current_frame: this.currentFrameIndex,
      total_frames: this.frames.length,
      playback_speed: this.playbackSpeed,
      current_time: currentFrame?.timestamp || null,
      progress_percent: this.frames.length > 0
        ? (this.currentFrameIndex / this.frames.length) * 100
        : 0,
    };
  }

  private scheduleNextFrame(): void {
    if (!this.isPlaying || this.currentFrameIndex >= this.frames.length) {
      if (this.currentFrameIndex >= this.frames.length) {
        this.isPlaying = false;
        if (this.broadcastCallback) {
          this.broadcastCallback({ type: 'replay_completed' });
        }
      }
      return;
    }

    const frame = this.frames[this.currentFrameIndex];
    this.emitFrame(frame);

    const sleepTime = Math.max(1, Math.min(1000, (frame.duration_seconds / this.playbackSpeed) * 1000));

    this.playbackTimer = setTimeout(() => {
      this.currentFrameIndex++;

      if (this.broadcastCallback) {
        this.broadcastCallback({
          type: 'replay_progress',
          frame: this.currentFrameIndex,
          total: this.frames.length,
        });
      }

      this.scheduleNextFrame();
    }, sleepTime);
  }

  private emitFrame(frame: FrameGroup): void {
    for (const [, record] of frame.records) {
      this.stateManager.updateTracker(record);
    }
  }
}
