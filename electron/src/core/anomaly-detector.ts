/**
 * Anomaly Detector
 * Monitors tracker state changes and detects anomalies:
 * - GPS loss (fix_valid becomes false)
 * - GPS acquired (fix_valid becomes true after loss)
 * - GPS degraded (HDOP/satellites exceed thresholds but fix still valid)
 * - GPS recovered (quality improved back to good)
 * - Altitude anomaly (sudden altitude change)
 * - Position jump (sudden position change)
 * - Link lost (tracker goes stale)
 * - Link restored (tracker becomes active after stale)
 */

import log from 'electron-log';
import { TrackerState, TrackerSummary, GPSHealthStatus } from './models';

export type AnomalyType =
  | 'gps_lost'
  | 'gps_acquired'
  | 'gps_degraded'     // NEW: Quality degraded but fix still valid
  | 'gps_recovered'    // NEW: Quality improved back to healthy
  | 'altitude_anomaly'
  | 'position_jump'
  | 'link_lost'
  | 'link_restored'
  | 'low_battery'
  | 'battery_critical';

export type AlertLevel = 'info' | 'warning' | 'critical';

export interface AnomalyAlert {
  id: string;
  type: AnomalyType;
  level: AlertLevel;
  tracker_id: string;
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export type AnomalyAlertCallback = (alert: AnomalyAlert) => void;

interface TrackerHistory {
  lastPosition: { lat: number; lon: number; alt_m: number | null } | null;
  lastFixValid: boolean;
  lastIsStale: boolean;
  lastBatteryState: 'normal' | 'low' | 'critical';
  lastGPSHealthStatus: GPSHealthStatus;
  lastUpdateTime: number;
  gpsLostTime: number | null;
  gpsDegradedTime: number | null;
  staleSince: number | null;
}

export interface AnomalyDetectorConfig {
  // Altitude anomaly threshold in meters
  altitudeAnomalyThresholdM: number;
  // Position jump threshold in meters
  positionJumpThresholdM: number;
  // Minimum time between alerts for the same tracker/type (ms)
  alertCooldownMs: number;
  // Enable/disable specific anomaly types
  enabledTypes: Set<AnomalyType>;
}

const DEFAULT_CONFIG: AnomalyDetectorConfig = {
  altitudeAnomalyThresholdM: 50,
  positionJumpThresholdM: 500,
  alertCooldownMs: 5000,
  enabledTypes: new Set([
    'gps_lost',
    'gps_acquired',
    'gps_degraded',
    'gps_recovered',
    'altitude_anomaly',
    'position_jump',
    'link_lost',
    'link_restored',
    'low_battery',
    'battery_critical',
  ]),
};

export class AnomalyDetector {
  private trackerHistory = new Map<string, TrackerHistory>();
  private alertCooldowns = new Map<string, number>(); // key: tracker_id:type, value: last alert time
  private alertCounter = 0;
  private config: AnomalyDetectorConfig;
  private onAlertCallback?: AnomalyAlertCallback;
  private enabled = true;

  constructor(
    config: Partial<AnomalyDetectorConfig> = {},
    onAlert?: AnomalyAlertCallback
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.onAlertCallback = onAlert;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    log.info(`AnomalyDetector ${enabled ? 'enabled' : 'disabled'}`);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setConfig(config: Partial<AnomalyDetectorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  setAlertCallback(callback: AnomalyAlertCallback): void {
    this.onAlertCallback = callback;
  }

  /**
   * Process a tracker update and detect anomalies
   */
  processUpdate(state: TrackerState | TrackerSummary): AnomalyAlert[] {
    if (!this.enabled) return [];

    const alerts: AnomalyAlert[] = [];
    const trackerId = state.tracker_id;
    const now = Date.now();

    // Get or create history for this tracker
    let history = this.trackerHistory.get(trackerId);
    if (!history) {
      const initialHealthStatus = this.getGPSHealthStatus(state);
      history = {
        lastPosition: null,
        lastFixValid: state.fix_valid,
        lastIsStale: state.is_stale,
        lastBatteryState: this.getBatteryState(state),
        lastGPSHealthStatus: initialHealthStatus,
        lastUpdateTime: now,
        gpsLostTime: null,
        gpsDegradedTime: null,
        staleSince: null,
      };
      this.trackerHistory.set(trackerId, history);

      // Don't generate alerts for first update
      this.updateHistory(history, state, now);
      return alerts;
    }

    // Check for GPS state changes
    if (this.config.enabledTypes.has('gps_lost') || this.config.enabledTypes.has('gps_acquired')) {
      if (history.lastFixValid && !state.fix_valid) {
        // GPS was valid, now lost
        history.gpsLostTime = now;
        const alert = this.createAlert('gps_lost', 'warning', trackerId, 'GPS signal lost', {
          last_position: history.lastPosition,
        });
        if (alert && this.config.enabledTypes.has('gps_lost')) {
          alerts.push(alert);
        }
      } else if (!history.lastFixValid && state.fix_valid) {
        // GPS was lost, now acquired
        const lostDuration = history.gpsLostTime
          ? Math.round((now - history.gpsLostTime) / 1000)
          : null;
        history.gpsLostTime = null;
        const alert = this.createAlert('gps_acquired', 'info', trackerId, 'GPS signal acquired', {
          lost_duration_seconds: lostDuration,
        });
        if (alert && this.config.enabledTypes.has('gps_acquired')) {
          alerts.push(alert);
        }
      }
    }

    // Check for GPS health status changes (degraded/recovered)
    const currentHealthStatus = this.getGPSHealthStatus(state);
    if (this.config.enabledTypes.has('gps_degraded') || this.config.enabledTypes.has('gps_recovered')) {
      // Detect degradation: was healthy, now degraded
      if (history.lastGPSHealthStatus === 'healthy' && currentHealthStatus === 'degraded') {
        history.gpsDegradedTime = now;
        const hdop = 'gps_health' in state ? state.gps_health?.hdop : null;
        const satellites = 'gps_health' in state ? state.gps_health?.satellites : null;
        const alert = this.createAlert(
          'gps_degraded',
          'warning',
          trackerId,
          `GPS quality degraded (HDOP: ${hdop?.toFixed(1) ?? 'N/A'}, Sats: ${satellites ?? 'N/A'})`,
          {
            hdop,
            satellites,
            rssi_dbm: state.rssi_dbm,
          }
        );
        if (alert && this.config.enabledTypes.has('gps_degraded')) {
          alerts.push(alert);
        }
      }
      // Detect recovery: was degraded, now healthy
      else if (history.lastGPSHealthStatus === 'degraded' && currentHealthStatus === 'healthy') {
        const degradedDuration = history.gpsDegradedTime
          ? Math.round((now - history.gpsDegradedTime) / 1000)
          : null;
        history.gpsDegradedTime = null;
        const hdop = 'gps_health' in state ? state.gps_health?.hdop : null;
        const satellites = 'gps_health' in state ? state.gps_health?.satellites : null;
        const alert = this.createAlert(
          'gps_recovered',
          'info',
          trackerId,
          'GPS quality recovered',
          {
            degraded_duration_seconds: degradedDuration,
            hdop,
            satellites,
          }
        );
        if (alert && this.config.enabledTypes.has('gps_recovered')) {
          alerts.push(alert);
        }
      }
    }

    // Check for link state changes (stale)
    if (this.config.enabledTypes.has('link_lost') || this.config.enabledTypes.has('link_restored')) {
      if (!history.lastIsStale && state.is_stale) {
        // Tracker went stale
        history.staleSince = now;
        const alert = this.createAlert('link_lost', 'critical', trackerId, 'Telemetry link lost', {
          last_update: history.lastUpdateTime,
          age_seconds: state.age_seconds,
        });
        if (alert && this.config.enabledTypes.has('link_lost')) {
          alerts.push(alert);
        }
      } else if (history.lastIsStale && !state.is_stale) {
        // Tracker came back online
        const staleDuration = history.staleSince
          ? Math.round((now - history.staleSince) / 1000)
          : null;
        history.staleSince = null;
        const alert = this.createAlert('link_restored', 'info', trackerId, 'Telemetry link restored', {
          stale_duration_seconds: staleDuration,
        });
        if (alert && this.config.enabledTypes.has('link_restored')) {
          alerts.push(alert);
        }
      }
    }

    // Check for position anomalies (only if fix is valid)
    if (state.fix_valid && state.lat !== null && state.lon !== null && history.lastPosition) {
      // Altitude anomaly
      if (
        this.config.enabledTypes.has('altitude_anomaly') &&
        state.alt_m !== null &&
        history.lastPosition.alt_m !== null
      ) {
        const altDelta = Math.abs(state.alt_m - history.lastPosition.alt_m);
        if (altDelta > this.config.altitudeAnomalyThresholdM) {
          const alert = this.createAlert(
            'altitude_anomaly',
            'warning',
            trackerId,
            `Sudden altitude change: ${altDelta.toFixed(1)}m`,
            {
              previous_alt_m: history.lastPosition.alt_m,
              current_alt_m: state.alt_m,
              delta_m: altDelta,
            }
          );
          if (alert) alerts.push(alert);
        }
      }

      // Position jump
      if (this.config.enabledTypes.has('position_jump')) {
        const distance = this.calculateDistance(
          history.lastPosition.lat,
          history.lastPosition.lon,
          state.lat,
          state.lon
        );
        if (distance > this.config.positionJumpThresholdM) {
          const alert = this.createAlert(
            'position_jump',
            'warning',
            trackerId,
            `Sudden position jump: ${distance.toFixed(0)}m`,
            {
              previous_lat: history.lastPosition.lat,
              previous_lon: history.lastPosition.lon,
              current_lat: state.lat,
              current_lon: state.lon,
              distance_m: distance,
            }
          );
          if (alert) alerts.push(alert);
        }
      }
    }

    // Check for battery state changes
    const currentBatteryState = this.getBatteryState(state);
    if (currentBatteryState !== history.lastBatteryState) {
      if (currentBatteryState === 'critical' && this.config.enabledTypes.has('battery_critical')) {
        const alert = this.createAlert(
          'battery_critical',
          'critical',
          trackerId,
          'Battery critically low',
          { battery_mv: 'battery_mv' in state ? state.battery_mv : null }
        );
        if (alert) alerts.push(alert);
      } else if (currentBatteryState === 'low' && this.config.enabledTypes.has('low_battery')) {
        const alert = this.createAlert(
          'low_battery',
          'warning',
          trackerId,
          'Battery low',
          { battery_mv: 'battery_mv' in state ? state.battery_mv : null }
        );
        if (alert) alerts.push(alert);
      }
    }

    // Update history
    this.updateHistory(history, state, now);

    // Emit alerts via callback
    for (const alert of alerts) {
      if (this.onAlertCallback) {
        this.onAlertCallback(alert);
      }
    }

    return alerts;
  }

  /**
   * Process a tracker going stale (called from StateManager's onTrackerStale)
   */
  processStale(trackerId: string, ageSeconds: number): AnomalyAlert | null {
    if (!this.enabled) return null;
    if (!this.config.enabledTypes.has('link_lost')) return null;

    const history = this.trackerHistory.get(trackerId);
    if (history && !history.lastIsStale) {
      history.lastIsStale = true;
      history.staleSince = Date.now();

      const alert = this.createAlert('link_lost', 'critical', trackerId, 'Telemetry link lost', {
        age_seconds: ageSeconds,
      });

      if (alert && this.onAlertCallback) {
        this.onAlertCallback(alert);
      }

      return alert;
    }

    return null;
  }

  /**
   * Clear history for a tracker
   */
  clearTracker(trackerId: string): void {
    this.trackerHistory.delete(trackerId);
  }

  /**
   * Clear all history
   */
  clearAll(): void {
    this.trackerHistory.clear();
    this.alertCooldowns.clear();
  }

  private createAlert(
    type: AnomalyType,
    level: AlertLevel,
    trackerId: string,
    message: string,
    metadata?: Record<string, unknown>
  ): AnomalyAlert | null {
    // Check cooldown
    const cooldownKey = `${trackerId}:${type}`;
    const lastAlert = this.alertCooldowns.get(cooldownKey);
    const now = Date.now();

    if (lastAlert && now - lastAlert < this.config.alertCooldownMs) {
      return null; // Still in cooldown
    }

    this.alertCooldowns.set(cooldownKey, now);
    this.alertCounter++;

    return {
      id: `alert-${this.alertCounter}-${Date.now()}`,
      type,
      level,
      tracker_id: trackerId,
      message,
      timestamp: new Date().toISOString(),
      metadata,
    };
  }

  private updateHistory(
    history: TrackerHistory,
    state: TrackerState | TrackerSummary,
    now: number
  ): void {
    history.lastFixValid = state.fix_valid;
    history.lastIsStale = state.is_stale;
    history.lastBatteryState = this.getBatteryState(state);
    history.lastGPSHealthStatus = this.getGPSHealthStatus(state);
    history.lastUpdateTime = now;

    if (state.fix_valid && state.lat !== null && state.lon !== null) {
      history.lastPosition = {
        lat: state.lat,
        lon: state.lon,
        alt_m: state.alt_m,
      };
    }
  }

  /**
   * Get GPS health status from state
   */
  private getGPSHealthStatus(state: TrackerState | TrackerSummary): GPSHealthStatus {
    // If state has gps_health, use it directly
    if ('gps_health' in state && state.gps_health) {
      return state.gps_health.health_status;
    }
    // Fallback: derive from fix_valid
    return state.fix_valid ? 'healthy' : 'lost';
  }

  private getBatteryState(state: TrackerState | TrackerSummary): 'normal' | 'low' | 'critical' {
    if ('battery_critical' in state && state.battery_critical) return 'critical';
    if ('low_battery' in state && state.low_battery) return 'low';
    return 'normal';
  }

  /**
   * Calculate distance between two points using Haversine formula
   */
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Earth radius in meters
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }
}
