/**
 * Tracker state management.
 * In-memory state with staleness detection and GPS health tracking.
 */

import { TrackerRecord, TrackerState, TrackerSummary, GPSHealthStatus, GPSFixLossEvent, createInitialGPSHealthState } from './models';
import { GPSHealthTracker, GPSHealthChangeCallback } from './gps-health-tracker';
import { getTrackerAliasByTrackerId } from './library-store';

export type TrackerUpdateCallback = (state: TrackerState) => void;

export class StateManager {
  private trackers = new Map<string, TrackerState>();
  private staleInterval: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private gpsHealthTracker: GPSHealthTracker;

  constructor(
    private staleSeconds: number,
    private onTrackerUpdated?: TrackerUpdateCallback,
    private onTrackerStale?: TrackerUpdateCallback,
    private onGPSHealthChange?: GPSHealthChangeCallback,
    private lowBatteryMv = 3300,
    private criticalBatteryMv = 3000
  ) {
    // Initialize GPS health tracker with callback
    this.gpsHealthTracker = new GPSHealthTracker({}, onGPSHealthChange);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.staleInterval = setInterval(() => this.checkStaleness(), 5000);
  }

  stop(): void {
    this.running = false;
    if (this.staleInterval) {
      clearInterval(this.staleInterval);
      this.staleInterval = null;
    }
  }

  updateTracker(record: TrackerRecord): void {
    const trackerId = record.tracker_id;

    let state = this.trackers.get(trackerId);
    if (!state) {
      state = this.createEmptyState(trackerId, record.time_local_received);
      this.trackers.set(trackerId, state);
    }

    // Update timestamps
    state.time_local_received = record.time_local_received;
    state.time_gps = record.time_gps;

    // Update position only if fix is valid
    if (record.fix_valid) {
      state.lat = record.lat;
      state.lon = record.lon;
      state.alt_m = record.alt_m;
      state.speed_mps = record.speed_mps;
      state.course_deg = record.course_deg;
      state.hdop = record.hdop;
      state.fix_valid = true;

      // Capture last known good position
      state.last_known_lat = record.lat;
      state.last_known_lon = record.lon;
      state.last_known_alt_m = record.alt_m;
      state.last_known_time = record.time_local_received;
    } else {
      state.fix_valid = false;
    }

    // Update satellites (independent of fix)
    if (record.satellites !== null) {
      state.satellites = record.satellites;
    }

    // Update RSSI, baro, battery (independent of GPS fix)
    if (record.rssi_dbm !== null) state.rssi_dbm = record.rssi_dbm;
    if (record.baro_alt_m !== null) state.baro_alt_m = record.baro_alt_m;
    if (record.baro_temp_c !== null) state.baro_temp_c = record.baro_temp_c;
    if (record.baro_press_hpa !== null) state.baro_press_hpa = record.baro_press_hpa;

    if (record.battery_mv !== null) {
      state.battery_mv = record.battery_mv;
      state.battery_critical = record.battery_mv <= this.criticalBatteryMv;
      state.low_battery = record.battery_mv <= this.lowBatteryMv;
    }

    if (record.latency_ms !== null) {
      state.latency_ms = record.latency_ms;
    }

    // Reset age and staleness
    state.age_seconds = 0;
    const wasStale = state.is_stale;
    state.is_stale = false;

    if (wasStale) {
      state.stale_since = null;
    }

    // Update GPS health tracking
    const position = record.fix_valid && record.lat !== null && record.lon !== null
      ? { lat: record.lat, lon: record.lon, alt_m: record.alt_m }
      : null;

    state.gps_health = this.gpsHealthTracker.updateHealth(
      trackerId,
      record.time_local_received,
      record.fix_valid,
      record.hdop,
      record.satellites,
      position,
      record.rssi_dbm,
      'unknown' // fix_type would come from GPGSA parsing
    );

    if (this.onTrackerUpdated) {
      this.onTrackerUpdated(state);
    }
  }

  getTracker(trackerId: string): TrackerState | undefined {
    return this.trackers.get(trackerId);
  }

  getAllTrackers(): TrackerState[] {
    return Array.from(this.trackers.values());
  }

  getTrackerSummaries(): TrackerSummary[] {
    const summaries: TrackerSummary[] = [];

    for (const state of this.trackers.values()) {
      // Get GPS health summary
      const gpsHealthSummary = this.gpsHealthTracker.getHealthSummary(state.tracker_id) ?? {
        health_status: 'lost' as GPSHealthStatus,
        fix_valid: false,
        fix_type: 'unknown' as const,
        hdop: null,
        satellites: null,
        current_loss_duration_ms: null,
        total_fix_loss_events: 0,
        fix_availability_percent: 0,
        health_score: 0,
      };

      // Look up alias from tracker alias registry
      const aliasRecord = getTrackerAliasByTrackerId(state.tracker_id);

      summaries.push({
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
        gps_health: gpsHealthSummary,
      });
    }

    summaries.sort((a, b) => a.tracker_id.localeCompare(b.tracker_id));
    return summaries;
  }

  getTrackerCount(): number {
    return this.trackers.size;
  }

  clearAll(): void {
    this.trackers.clear();
  }

  getTrackerIds(): string[] {
    return Array.from(this.trackers.keys());
  }

  private checkStaleness(): void {
    const now = Date.now();

    for (const state of this.trackers.values()) {
      const lastUpdate = new Date(state.time_local_received).getTime();
      const age = (now - lastUpdate) / 1000;
      state.age_seconds = age;

      const wasStale = state.is_stale;
      const isNowStale = age > this.staleSeconds;

      if (isNowStale && !wasStale) {
        state.is_stale = true;
        state.stale_since = new Date().toISOString();

        if (this.onTrackerStale) {
          this.onTrackerStale(state);
        }
      }
    }
  }

  private createEmptyState(trackerId: string, timeReceived: string): TrackerState {
    return {
      tracker_id: trackerId,
      time_local_received: timeReceived,
      time_gps: null,
      time_received: null,
      lat: null,
      lon: null,
      alt_m: null,
      speed_mps: null,
      course_deg: null,
      hdop: null,
      satellites: null,
      rssi_dbm: null,
      baro_alt_m: null,
      baro_temp_c: null,
      baro_press_hpa: null,
      fix_valid: false,
      is_stale: false,
      age_seconds: 0,
      battery_mv: null,
      latency_ms: null,
      last_known_lat: null,
      last_known_lon: null,
      last_known_alt_m: null,
      last_known_time: null,
      stale_since: null,
      low_battery: false,
      battery_critical: false,
      gps_health: createInitialGPSHealthState(),
    };
  }

  /**
   * Get GPS health tracker for direct access (e.g., for API endpoints)
   */
  getGPSHealthTracker(): GPSHealthTracker {
    return this.gpsHealthTracker;
  }

  /**
   * Clear all state including GPS health tracking
   */
  clearAllWithHealth(): void {
    this.trackers.clear();
    this.gpsHealthTracker.clearAll();
  }

  /**
   * Reset GPS health session aggregates for a new recording session
   */
  resetGPSHealthSession(trackerId?: string): void {
    if (trackerId) {
      this.gpsHealthTracker.resetSessionAggregates(trackerId);
    } else {
      // Reset for all trackers
      for (const id of this.trackers.keys()) {
        this.gpsHealthTracker.resetSessionAggregates(id);
      }
    }
  }
}
