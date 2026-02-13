/**
 * GPS Health Tracker
 * Tracks GPS fix transitions, computes duration metrics, and maintains health state
 * for real-time GPS health monitoring during Counter-UAS testing.
 */

import log from 'electron-log';
import {
  GPSHealthState,
  GPSHealthStatus,
  GPSFixType,
  GPSFixLossEvent,
  GPSHealthSummary,
  createInitialGPSHealthState,
} from './models';

// Quality thresholds (matching trackSegmentation.ts)
const HDOP_GOOD_THRESHOLD = 2.0;
const HDOP_DEGRADED_THRESHOLD = 5.0;
const SATELLITES_GOOD_THRESHOLD = 8;
const SATELLITES_DEGRADED_THRESHOLD = 4;

// Rolling window size for quality history
const QUALITY_HISTORY_SIZE = 100;

export interface GPSHealthTrackerConfig {
  hdopGoodThreshold?: number;
  hdopDegradedThreshold?: number;
  satellitesGoodThreshold?: number;
  satellitesDegradedThreshold?: number;
  /** Duration in ms of continuous fix loss before emitting gps_lost event */
  fixLossDurationMs?: number;
  /** Duration in ms of continuous degradation before emitting gps_degraded event */
  degradedDurationMs?: number;
  /** Whether to auto-emit session events on GPS state changes */
  autoEmitEvents?: boolean;
}

export type GPSEventType = 'gps_lost' | 'gps_acquired' | 'gps_degraded' | 'gps_recovered';

export interface GPSAutoEvent {
  type: GPSEventType;
  trackerId: string;
  timestamp: string;
  metadata: {
    hdop?: number | null;
    satellites?: number | null;
    rssi_dbm?: number | null;
    duration_ms?: number;
    previous_status: string;
    new_status: string;
  };
}

export type GPSAutoEventCallback = (event: GPSAutoEvent) => void;

export type GPSHealthChangeCallback = (
  trackerId: string,
  previousStatus: GPSHealthStatus,
  newStatus: GPSHealthStatus,
  event: GPSFixLossEvent | null
) => void;

interface QualityHistoryEntry {
  timestamp: number;
  hdop: number | null;
  satellites: number | null;
}

// RSSI history entry for tracking signal degradation before GPS loss
interface RSSIHistoryEntry {
  timestamp: number;
  rssi_dbm: number;
  hdop: number | null;
  satellites: number | null;
}

// Maximum RSSI history buffer size (60 seconds at 1Hz for better degradation analysis)
const RSSI_HISTORY_SIZE = 60;

interface TrackerHealthData {
  state: GPSHealthState;
  qualityHistory: QualityHistoryEntry[];
  fixLossEvents: GPSFixLossEvent[];
  firstUpdateTime: number | null;
  lastUpdateTime: number | null;
  // Running totals for averages
  hdopSum: number;
  hdopCount: number;
  satellitesSum: number;
  satellitesCount: number;
  // RSSI history buffer for capturing signal degradation before GPS loss
  rssiHistory: RSSIHistoryEntry[];
}

export class GPSHealthTracker {
  private trackerHealth: Map<string, TrackerHealthData> = new Map();
  private config: Required<GPSHealthTrackerConfig>;
  private onHealthChange?: GPSHealthChangeCallback;
  private onAutoEvent?: GPSAutoEventCallback;
  // Track sustained state durations for debounced event emission
  private sustainedLost: Map<string, number> = new Map(); // trackerId -> first timestamp ms
  private sustainedDegraded: Map<string, number> = new Map();
  private emittedLost: Set<string> = new Set(); // trackerIds that already emitted gps_lost
  private emittedDegraded: Set<string> = new Set();

  constructor(
    config: GPSHealthTrackerConfig = {},
    onHealthChange?: GPSHealthChangeCallback,
    onAutoEvent?: GPSAutoEventCallback,
  ) {
    this.config = {
      hdopGoodThreshold: config.hdopGoodThreshold ?? HDOP_GOOD_THRESHOLD,
      hdopDegradedThreshold: config.hdopDegradedThreshold ?? HDOP_DEGRADED_THRESHOLD,
      satellitesGoodThreshold: config.satellitesGoodThreshold ?? SATELLITES_GOOD_THRESHOLD,
      satellitesDegradedThreshold: config.satellitesDegradedThreshold ?? SATELLITES_DEGRADED_THRESHOLD,
      fixLossDurationMs: config.fixLossDurationMs ?? 3000,
      degradedDurationMs: config.degradedDurationMs ?? 5000,
      autoEmitEvents: config.autoEmitEvents ?? true,
    };
    this.onHealthChange = onHealthChange;
    this.onAutoEvent = onAutoEvent;
  }

  /**
   * Set the auto-event callback for GPS state change events
   */
  setAutoEventCallback(callback: GPSAutoEventCallback): void {
    this.onAutoEvent = callback;
  }

  /**
   * Update GPS denial detection thresholds at runtime
   */
  updateThresholds(config: Partial<GPSHealthTrackerConfig>): void {
    if (config.hdopGoodThreshold !== undefined) this.config.hdopGoodThreshold = config.hdopGoodThreshold;
    if (config.hdopDegradedThreshold !== undefined) this.config.hdopDegradedThreshold = config.hdopDegradedThreshold;
    if (config.satellitesGoodThreshold !== undefined) this.config.satellitesGoodThreshold = config.satellitesGoodThreshold;
    if (config.satellitesDegradedThreshold !== undefined) this.config.satellitesDegradedThreshold = config.satellitesDegradedThreshold;
    if (config.fixLossDurationMs !== undefined) this.config.fixLossDurationMs = config.fixLossDurationMs;
    if (config.degradedDurationMs !== undefined) this.config.degradedDurationMs = config.degradedDurationMs;
    if (config.autoEmitEvents !== undefined) this.config.autoEmitEvents = config.autoEmitEvents;
  }

  /**
   * Update GPS health for a tracker based on new telemetry data
   */
  updateHealth(
    trackerId: string,
    timestamp: string,
    fixValid: boolean,
    hdop: number | null,
    satellites: number | null,
    position: { lat: number; lon: number; alt_m: number | null } | null,
    rssi: number | null,
    fixType: GPSFixType = 'unknown'
  ): GPSHealthState {
    const now = new Date(timestamp).getTime();
    let data = this.trackerHealth.get(trackerId);

    if (!data) {
      data = this.createTrackerData();
      this.trackerHealth.set(trackerId, data);
    }

    const state = data.state;
    const previousStatus = state.health_status;
    const wasFixValid = state.fix_valid;

    // Initialize first update time
    if (data.firstUpdateTime === null) {
      data.firstUpdateTime = now;
    }
    data.lastUpdateTime = now;

    // Update current values
    state.fix_valid = fixValid;
    state.fix_type = fixType;
    state.hdop = hdop;
    state.satellites = satellites;

    // Update VDOP/PDOP if available (would be set from GPGSA parsing)
    // These are set separately via setDOPValues()

    // Compute new health status
    state.health_status = this.computeHealthStatus(fixValid, hdop, satellites);

    // Track fix transitions
    if (!wasFixValid && fixValid) {
      this.handleFixAcquired(data, timestamp, position, now);
    } else if (wasFixValid && !fixValid) {
      this.handleFixLost(data, timestamp, position, hdop, satellites, rssi, now);
    }

    // Update duration tracking for ongoing fix loss
    if (!fixValid && state.fix_lost_at) {
      const lostTime = new Date(state.fix_lost_at).getTime();
      state.current_loss_duration_ms = now - lostTime;
    } else {
      state.current_loss_duration_ms = null;
    }

    // Update quality history and statistics
    this.updateQualityHistory(data, now, hdop, satellites);

    // Update RSSI history buffer
    this.updateRSSIHistory(data, now, rssi, hdop, satellites);

    // Update time tracking
    this.updateTimeTracking(data, fixValid, now);

    // Update health score
    state.health_score = this.computeHealthScore(state, data);

    // Fire callback on status change
    if (previousStatus !== state.health_status && this.onHealthChange) {
      const event = this.getCurrentLossEvent(data);
      this.onHealthChange(trackerId, previousStatus, state.health_status, event);
    }

    // Auto-emit GPS denial events with debouncing
    if (this.config.autoEmitEvents && this.onAutoEvent) {
      this.checkAndEmitAutoEvents(trackerId, previousStatus, state.health_status, now, hdop, satellites, rssi);
    }

    return state;
  }

  /**
   * Set DOP values from GPGSA sentence parsing
   */
  setDOPValues(trackerId: string, pdop: number | null, hdop: number | null, vdop: number | null): void {
    const data = this.trackerHealth.get(trackerId);
    if (data) {
      if (pdop !== null) data.state.pdop = pdop;
      if (hdop !== null) data.state.hdop = hdop;
      if (vdop !== null) data.state.vdop = vdop;
    }
  }

  /**
   * Get health state for a tracker
   */
  getHealth(trackerId: string): GPSHealthState | null {
    const data = this.trackerHealth.get(trackerId);
    return data?.state ?? null;
  }

  /**
   * Get health summary for API responses
   */
  getHealthSummary(trackerId: string): GPSHealthSummary | null {
    const data = this.trackerHealth.get(trackerId);
    if (!data) return null;

    const state = data.state;
    return {
      health_status: state.health_status,
      fix_valid: state.fix_valid,
      fix_type: state.fix_type,
      hdop: state.hdop,
      satellites: state.satellites,
      current_loss_duration_ms: state.current_loss_duration_ms,
      total_fix_loss_events: state.total_fix_loss_events,
      fix_availability_percent: state.fix_availability_percent,
      health_score: state.health_score,
    };
  }

  /**
   * Get all fix loss events for a tracker
   */
  getFixLossEvents(trackerId: string): GPSFixLossEvent[] {
    const data = this.trackerHealth.get(trackerId);
    return data?.fixLossEvents ?? [];
  }

  /**
   * Clear all tracking data
   */
  clearAll(): void {
    this.trackerHealth.clear();
  }

  /**
   * Clear tracking data for a specific tracker
   */
  clearTracker(trackerId: string): void {
    this.trackerHealth.delete(trackerId);
  }

  /**
   * Reset session aggregates (for starting a new recording session)
   */
  resetSessionAggregates(trackerId: string): void {
    const data = this.trackerHealth.get(trackerId);
    if (data) {
      data.state.total_fix_loss_events = 0;
      data.state.total_fix_loss_duration_ms = 0;
      data.state.total_time_valid_ms = 0;
      data.state.total_time_tracked_ms = 0;
      data.state.fix_availability_percent = 0;
      data.fixLossEvents = [];
      data.hdopSum = 0;
      data.hdopCount = 0;
      data.satellitesSum = 0;
      data.satellitesCount = 0;
      data.state.hdop_min = null;
      data.state.hdop_max = null;
      data.state.hdop_avg = null;
      data.state.satellites_min = null;
      data.state.satellites_max = null;
      data.state.satellites_avg = null;
      data.firstUpdateTime = null;
      data.lastUpdateTime = null;
    }
  }

  // =========================================================================
  // GPS Denial Auto-Event Emission
  // =========================================================================

  /**
   * Check GPS state transitions and emit auto-detected events with debouncing.
   * Events are only emitted after sustained state duration thresholds are met.
   */
  private checkAndEmitAutoEvents(
    trackerId: string,
    previousStatus: GPSHealthStatus,
    newStatus: GPSHealthStatus,
    nowMs: number,
    hdop: number | null,
    satellites: number | null,
    rssi: number | null,
  ): void {
    // Track sustained "lost" state
    if (newStatus === 'lost') {
      if (!this.sustainedLost.has(trackerId)) {
        this.sustainedLost.set(trackerId, nowMs);
      }
      // Check if sustained long enough to emit
      const lostSince = this.sustainedLost.get(trackerId)!;
      if (nowMs - lostSince >= this.config.fixLossDurationMs && !this.emittedLost.has(trackerId)) {
        this.emittedLost.add(trackerId);
        this.onAutoEvent!({
          type: 'gps_lost',
          trackerId,
          timestamp: new Date(nowMs).toISOString(),
          metadata: {
            hdop, satellites, rssi_dbm: rssi,
            duration_ms: nowMs - lostSince,
            previous_status: previousStatus,
            new_status: newStatus,
          },
        });
        log.info(`[GPSAutoEvent] gps_lost emitted for ${trackerId} after ${nowMs - lostSince}ms`);
      }
      // Clear degraded tracking since we're past degraded
      this.sustainedDegraded.delete(trackerId);
      this.emittedDegraded.delete(trackerId);
    } else if (newStatus === 'degraded') {
      if (!this.sustainedDegraded.has(trackerId)) {
        this.sustainedDegraded.set(trackerId, nowMs);
      }
      const degradedSince = this.sustainedDegraded.get(trackerId)!;
      if (nowMs - degradedSince >= this.config.degradedDurationMs && !this.emittedDegraded.has(trackerId)) {
        this.emittedDegraded.add(trackerId);
        this.onAutoEvent!({
          type: 'gps_degraded',
          trackerId,
          timestamp: new Date(nowMs).toISOString(),
          metadata: {
            hdop, satellites, rssi_dbm: rssi,
            duration_ms: nowMs - degradedSince,
            previous_status: previousStatus,
            new_status: newStatus,
          },
        });
        log.info(`[GPSAutoEvent] gps_degraded emitted for ${trackerId} after ${nowMs - degradedSince}ms`);
      }
      // Clear lost tracking since we recovered from lost
      if (this.emittedLost.has(trackerId)) {
        this.emittedLost.delete(trackerId);
        this.sustainedLost.delete(trackerId);
        // Emit gps_acquired since we went from lost to degraded
        this.onAutoEvent!({
          type: 'gps_acquired',
          trackerId,
          timestamp: new Date(nowMs).toISOString(),
          metadata: {
            hdop, satellites, rssi_dbm: rssi,
            previous_status: previousStatus,
            new_status: newStatus,
          },
        });
        log.info(`[GPSAutoEvent] gps_acquired emitted for ${trackerId} (lost → degraded)`);
      }
    } else if (newStatus === 'healthy') {
      // Emit gps_acquired if we were in lost state
      if (this.emittedLost.has(trackerId)) {
        const lostSince = this.sustainedLost.get(trackerId);
        this.onAutoEvent!({
          type: 'gps_acquired',
          trackerId,
          timestamp: new Date(nowMs).toISOString(),
          metadata: {
            hdop, satellites, rssi_dbm: rssi,
            duration_ms: lostSince ? nowMs - lostSince : undefined,
            previous_status: previousStatus,
            new_status: newStatus,
          },
        });
        log.info(`[GPSAutoEvent] gps_acquired emitted for ${trackerId} (lost → healthy)`);
      }
      // Emit gps_recovered if we were in degraded state
      if (this.emittedDegraded.has(trackerId)) {
        const degradedSince = this.sustainedDegraded.get(trackerId);
        this.onAutoEvent!({
          type: 'gps_recovered',
          trackerId,
          timestamp: new Date(nowMs).toISOString(),
          metadata: {
            hdop, satellites, rssi_dbm: rssi,
            duration_ms: degradedSince ? nowMs - degradedSince : undefined,
            previous_status: previousStatus,
            new_status: newStatus,
          },
        });
        log.info(`[GPSAutoEvent] gps_recovered emitted for ${trackerId} (degraded → healthy)`);
      }
      // Clear all tracking
      this.sustainedLost.delete(trackerId);
      this.sustainedDegraded.delete(trackerId);
      this.emittedLost.delete(trackerId);
      this.emittedDegraded.delete(trackerId);
    }
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  private createTrackerData(): TrackerHealthData {
    return {
      state: createInitialGPSHealthState(),
      qualityHistory: [],
      fixLossEvents: [],
      firstUpdateTime: null,
      lastUpdateTime: null,
      hdopSum: 0,
      hdopCount: 0,
      satellitesSum: 0,
      satellitesCount: 0,
      rssiHistory: [],
    };
  }

  /**
   * Compute health status based on fix validity, HDOP, and satellite count
   */
  private computeHealthStatus(
    fixValid: boolean,
    hdop: number | null,
    satellites: number | null
  ): GPSHealthStatus {
    // No fix = lost
    if (!fixValid) {
      return 'lost';
    }

    // Check HDOP first
    if (hdop !== null) {
      if (hdop <= this.config.hdopGoodThreshold) {
        // Good HDOP - check satellites for confirmation
        if (satellites === null || satellites >= this.config.satellitesGoodThreshold) {
          return 'healthy';
        }
        // Good HDOP but low satellites - degraded
        return 'degraded';
      }
      if (hdop <= this.config.hdopDegradedThreshold) {
        return 'degraded';
      }
      // HDOP > 5.0 is very poor quality
      return 'degraded';
    }

    // No HDOP - check satellites
    if (satellites !== null) {
      if (satellites >= this.config.satellitesGoodThreshold) {
        return 'healthy';
      }
      if (satellites >= this.config.satellitesDegradedThreshold) {
        return 'degraded';
      }
      // Very few satellites
      return 'degraded';
    }

    // Fix is valid but no quality metrics - assume degraded
    return 'degraded';
  }

  /**
   * Handle fix acquisition (was lost, now valid)
   */
  private handleFixAcquired(
    data: TrackerHealthData,
    timestamp: string,
    position: { lat: number; lon: number; alt_m: number | null } | null,
    now: number
  ): void {
    const state = data.state;

    // Calculate recovery time if we were tracking a loss
    if (state.fix_lost_at) {
      const lostTime = new Date(state.fix_lost_at).getTime();
      state.last_recovery_time_ms = now - lostTime;

      // Update the most recent fix loss event with recovery info
      const lastEvent = data.fixLossEvents[data.fixLossEvents.length - 1];
      if (lastEvent && lastEvent.recovered_at === null) {
        lastEvent.recovered_at = timestamp;
        lastEvent.duration_ms = now - lostTime;
        lastEvent.recovery_position = position;
      }

      log.debug(`GPS fix acquired for tracker after ${state.last_recovery_time_ms}ms`);
    }

    state.fix_acquired_at = timestamp;
    state.fix_lost_at = null;
    state.current_loss_duration_ms = null;
  }

  /**
   * Handle fix loss (was valid, now lost)
   */
  private handleFixLost(
    data: TrackerHealthData,
    timestamp: string,
    position: { lat: number; lon: number; alt_m: number | null } | null,
    hdop: number | null,
    satellites: number | null,
    rssi: number | null,
    now: number
  ): void {
    const state = data.state;

    state.fix_lost_at = timestamp;
    state.total_fix_loss_events++;

    // Capture last 10 RSSI values before loss for degradation analysis
    const rssiBeforeLoss = data.rssiHistory.slice(-10).map(entry => ({
      timestamp_ms: entry.timestamp,
      rssi_dbm: entry.rssi_dbm,
      hdop: entry.hdop,
      satellites: entry.satellites,
    }));

    // Create a new fix loss event
    const event: GPSFixLossEvent = {
      id: `gps-loss-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      lost_at: timestamp,
      recovered_at: null,
      duration_ms: 0,
      last_position: position,
      recovery_position: null,
      hdop_before_loss: hdop,
      satellites_before_loss: satellites,
      rssi_at_loss: rssi,
      rssi_history_before_loss: rssiBeforeLoss,
    };
    data.fixLossEvents.push(event);

    log.debug(`GPS fix lost for tracker (HDOP: ${hdop}, Sats: ${satellites}, RSSI: ${rssi}, History: ${rssiBeforeLoss.length} entries)`);
  }

  /**
   * Update quality history and statistics
   */
  private updateQualityHistory(
    data: TrackerHealthData,
    now: number,
    hdop: number | null,
    satellites: number | null
  ): void {
    const state = data.state;

    // Add to history
    data.qualityHistory.push({ timestamp: now, hdop, satellites });

    // Trim history to window size
    if (data.qualityHistory.length > QUALITY_HISTORY_SIZE) {
      data.qualityHistory.shift();
    }

    // Update running statistics for HDOP
    if (hdop !== null) {
      data.hdopSum += hdop;
      data.hdopCount++;
      state.hdop_avg = data.hdopSum / data.hdopCount;

      if (state.hdop_min === null || hdop < state.hdop_min) {
        state.hdop_min = hdop;
      }
      if (state.hdop_max === null || hdop > state.hdop_max) {
        state.hdop_max = hdop;
      }
    }

    // Update running statistics for satellites
    if (satellites !== null) {
      data.satellitesSum += satellites;
      data.satellitesCount++;
      state.satellites_avg = data.satellitesSum / data.satellitesCount;

      if (state.satellites_min === null || satellites < state.satellites_min) {
        state.satellites_min = satellites;
      }
      if (state.satellites_max === null || satellites > state.satellites_max) {
        state.satellites_max = satellites;
      }
    }
  }

  /**
   * Update RSSI history buffer for tracking signal degradation before GPS loss
   */
  private updateRSSIHistory(
    data: TrackerHealthData,
    timestamp: number,
    rssi: number | null,
    hdop: number | null,
    satellites: number | null
  ): void {
    // Only track if we have RSSI data
    if (rssi !== null) {
      data.rssiHistory.push({
        timestamp,
        rssi_dbm: rssi,
        hdop,
        satellites,
      });

      // Trim to keep only the most recent entries
      if (data.rssiHistory.length > RSSI_HISTORY_SIZE) {
        data.rssiHistory.shift();
      }
    }
  }

  /**
   * Get RSSI history for a tracker (for metrics calculation)
   */
  getRSSIHistory(trackerId: string): RSSIHistoryEntry[] {
    const data = this.trackerHealth.get(trackerId);
    return data?.rssiHistory ?? [];
  }

  /**
   * Update time tracking for fix availability calculation
   */
  private updateTimeTracking(data: TrackerHealthData, fixValid: boolean, now: number): void {
    const state = data.state;

    if (data.lastUpdateTime !== null && data.firstUpdateTime !== null) {
      // Estimate time delta since last update (assume ~1 second between updates)
      const timeDelta = Math.min(now - (data.lastUpdateTime ?? now), 5000); // Cap at 5 seconds

      state.total_time_tracked_ms += timeDelta;

      if (fixValid) {
        state.total_time_valid_ms += timeDelta;
        state.last_good_fix_at = new Date(now).toISOString();
      } else {
        state.total_fix_loss_duration_ms += timeDelta;
      }

      // Calculate availability percentage
      if (state.total_time_tracked_ms > 0) {
        state.fix_availability_percent = (state.total_time_valid_ms / state.total_time_tracked_ms) * 100;
      }
    }
  }

  /**
   * Compute composite health score (0-100)
   */
  private computeHealthScore(state: GPSHealthState, data: TrackerHealthData): number {
    // Weight factors
    const AVAILABILITY_WEIGHT = 0.4;
    const HDOP_WEIGHT = 0.3;
    const SATELLITE_WEIGHT = 0.2;
    const RECOVERY_WEIGHT = 0.1;

    let score = 0;

    // Availability score (40%)
    score += state.fix_availability_percent * AVAILABILITY_WEIGHT;

    // HDOP score (30%) - lower is better
    if (state.hdop_avg !== null) {
      // 100 points for HDOP <= 2, linearly decreasing to 0 at HDOP = 10
      const hdopScore = Math.max(0, 100 - (state.hdop_avg - 2) * (100 / 8));
      score += hdopScore * HDOP_WEIGHT;
    } else {
      // No HDOP data - assume middle score
      score += 50 * HDOP_WEIGHT;
    }

    // Satellite score (20%) - more is better
    if (state.satellites_avg !== null) {
      // 100 points for >= 8 satellites, linearly decreasing to 0 at 0 satellites
      const satScore = Math.min(100, (state.satellites_avg / 8) * 100);
      score += satScore * SATELLITE_WEIGHT;
    } else {
      // No satellite data - assume middle score
      score += 50 * SATELLITE_WEIGHT;
    }

    // Recovery time score (10%) - faster is better
    if (data.fixLossEvents.length > 0) {
      const completedEvents = data.fixLossEvents.filter(e => e.recovered_at !== null);
      if (completedEvents.length > 0) {
        const avgRecovery = completedEvents.reduce((sum, e) => sum + e.duration_ms, 0) / completedEvents.length;
        // 100 points for < 5 seconds, linearly decreasing to 0 at 30 seconds
        const recoveryScore = Math.max(0, 100 - (avgRecovery / 1000 - 5) * (100 / 25));
        score += recoveryScore * RECOVERY_WEIGHT;
      } else {
        // Events still ongoing - penalize
        score += 25 * RECOVERY_WEIGHT;
      }
    } else {
      // No fix loss events - perfect recovery score
      score += 100 * RECOVERY_WEIGHT;
    }

    return Math.round(Math.max(0, Math.min(100, score)));
  }

  /**
   * Get the current (most recent) fix loss event if one is ongoing
   */
  private getCurrentLossEvent(data: TrackerHealthData): GPSFixLossEvent | null {
    if (data.fixLossEvents.length === 0) return null;
    const lastEvent = data.fixLossEvents[data.fixLossEvents.length - 1];
    return lastEvent.recovered_at === null ? lastEvent : null;
  }
}
