/**
 * Tracker Metrics Calculator
 * Calculates per-tracker CUAS effectiveness metrics
 * Correlates GPS loss events with jamming events for effectiveness analysis
 */

import log from 'electron-log';
import { TestEvent, CUASPlacement } from './models/workflow';
import { GPSFixLossEvent, TrackerSessionMetrics, RSSIHistoryEntry } from './models';
import { extractJammingWindows, JammingWindow, DroneTrackData } from './metrics-engine';
import { EnhancedPositionPoint } from './sd-card-merge';

/**
 * Calculate distance between two GPS points in meters (Haversine formula)
 */
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculate 3D distance between two GPS points in meters
 * Combines haversine horizontal distance with altitude delta
 */
function haversine3DDistance(
  lat1: number,
  lon1: number,
  alt1: number | null,
  lat2: number,
  lon2: number,
  alt2: number | null
): number {
  const horizontalDist = haversineDistance(lat1, lon1, lat2, lon2);

  // If we have both altitudes, calculate 3D distance
  if (alt1 !== null && alt2 !== null) {
    const altDelta = alt2 - alt1;
    return Math.sqrt(horizontalDist * horizontalDist + altDelta * altDelta);
  }

  return horizontalDist;
}

/**
 * Find first point where HDOP crosses degradation threshold after a given time
 */
function findDegradationOnsetTime(
  points: EnhancedPositionPoint[],
  afterTime: number,
  hdopThreshold: number = 2.0
): number | null {
  for (const point of points) {
    if (point.timestamp_ms >= afterTime &&
        point.hdop !== null &&
        point.hdop > hdopThreshold) {
      return point.timestamp_ms;
    }
  }
  return null;
}

/**
 * Find sustained recovery: 5+ seconds of good HDOP after jam ends
 * Returns timestamp when sustained good GPS started
 */
function findSustainedRecoveryTime(
  points: EnhancedPositionPoint[],
  afterTime: number,
  sustainedDurationMs: number = 5000,
  hdopThreshold: number = 2.0
): number | null {
  let goodStartTime: number | null = null;

  for (const point of points) {
    if (point.timestamp_ms < afterTime) continue;

    const isGood = point.fix_valid &&
                   point.hdop !== null &&
                   point.hdop <= hdopThreshold;

    if (isGood) {
      if (goodStartTime === null) {
        goodStartTime = point.timestamp_ms;
      } else if (point.timestamp_ms - goodStartTime >= sustainedDurationMs) {
        return goodStartTime; // 5+ seconds of good GPS
      }
    } else {
      goodStartTime = null; // Reset on quality loss
    }
  }

  return null;
}

/**
 * Find position point closest to a given timestamp
 */
function findPositionAtTime(
  points: EnhancedPositionPoint[],
  targetTime: number,
  toleranceMs: number = 5000
): EnhancedPositionPoint | null {
  let closest: EnhancedPositionPoint | null = null;
  let minDiff = Infinity;

  for (const point of points) {
    const diff = Math.abs(point.timestamp_ms - targetTime);
    if (diff < minDiff && diff <= toleranceMs) {
      minDiff = diff;
      closest = point;
    }
  }

  return closest;
}

/**
 * Calculate per-tracker CUAS effectiveness metrics
 */
export function calculateTrackerMetrics(
  trackerId: string,
  sessionId: string,
  trackData: DroneTrackData | null,
  sessionEvents: TestEvent[],
  cuasPlacements: CUASPlacement[],
  fixLossEvents: GPSFixLossEvent[]
): TrackerSessionMetrics {
  const jammingWindows = extractJammingWindows(sessionEvents);
  const points = trackData?.points ?? [];

  // Initialize result
  const metrics: TrackerSessionMetrics = {
    tracker_id: trackerId,
    session_id: sessionId,
    time_to_effect_s: null,
    time_to_full_denial_s: null,
    time_to_degradation_s: null,
    recovery_time_s: null,
    rssi_history_before_loss: [],
    effective_range_m: null,
    cuas_position: null,
    drone_position_at_effect: null,
    total_denial_duration_s: 0,
    denial_event_count: 0,
    max_lateral_drift_m: 0,
    altitude_delta_m: 0,
    gps_availability_percent: 0,
    avg_hdop: null,
    avg_satellites: null,
  };

  // Get first CUAS placement position
  const firstCuas = cuasPlacements.length > 0 ? cuasPlacements[0] : null;
  if (firstCuas) {
    metrics.cuas_position = {
      lat: firstCuas.position.lat,
      lon: firstCuas.position.lon,
    };
  }

  // Calculate denial metrics from fix loss events
  if (fixLossEvents.length > 0) {
    metrics.denial_event_count = fixLossEvents.length;

    let totalDenialMs = 0;
    for (const event of fixLossEvents) {
      totalDenialMs += event.duration_ms;
    }
    metrics.total_denial_duration_s = totalDenialMs / 1000;

    // Get RSSI history from first loss event
    const firstLoss = fixLossEvents[0];
    if (firstLoss.rssi_history_before_loss) {
      metrics.rssi_history_before_loss = firstLoss.rssi_history_before_loss;
    }
  }

  // Calculate effective range: 3D distance from CUAS to drone at JAM_ON time
  // This is more accurate than using position at GPS loss time
  if (jammingWindows.length > 0 && firstCuas && points.length > 0) {
    const jamOnTime = jammingWindows[0].start_time_ms;
    const droneAtJamOn = findPositionAtTime(points, jamOnTime, 2000);

    if (droneAtJamOn) {
      // Use CUAS height AGL from placement if available
      const cuasAlt = firstCuas.height_agl_m ?? 0;

      metrics.drone_position_at_effect = {
        lat: droneAtJamOn.lat,
        lon: droneAtJamOn.lon,
        alt_m: droneAtJamOn.alt_m,
      };

      // Calculate 3D distance from CUAS to drone
      metrics.effective_range_m = haversine3DDistance(
        firstCuas.position.lat,
        firstCuas.position.lon,
        cuasAlt,
        droneAtJamOn.lat,
        droneAtJamOn.lon,
        droneAtJamOn.alt_m
      );
    }
  }

  // Calculate time-to-degradation: JAM_ON to HDOP crossing threshold
  if (jammingWindows.length > 0 && points.length > 0) {
    const firstJamStart = jammingWindows[0].start_time_ms;
    const degradationTime = findDegradationOnsetTime(points, firstJamStart, 2.0);

    if (degradationTime !== null) {
      metrics.time_to_degradation_s = (degradationTime - firstJamStart) / 1000;
    }
  }

  // Calculate time-to-effect: JAM_ON to first complete GPS loss
  if (jammingWindows.length > 0 && fixLossEvents.length > 0) {
    const firstJamStart = jammingWindows[0].start_time_ms;
    const firstLossTime = new Date(fixLossEvents[0].lost_at).getTime();

    // Time to effect is only valid if loss occurred AFTER jam started
    if (firstLossTime >= firstJamStart) {
      // time_to_effect = earlier of degradation or full loss
      if (metrics.time_to_degradation_s !== null) {
        metrics.time_to_effect_s = metrics.time_to_degradation_s;
      } else {
        metrics.time_to_effect_s = (firstLossTime - firstJamStart) / 1000;
      }
      metrics.time_to_full_denial_s = (firstLossTime - firstJamStart) / 1000;
    }
  }

  // Calculate recovery time: JAM_OFF to sustained GPS reacquired (5+ seconds good HDOP)
  if (jammingWindows.length > 0 && points.length > 0) {
    const lastJamEnd = jammingWindows[jammingWindows.length - 1].end_time_ms;

    // Use sustained recovery (5 seconds of good HDOP) for more accurate measurement
    const sustainedRecoveryTime = findSustainedRecoveryTime(points, lastJamEnd, 5000, 2.0);

    if (sustainedRecoveryTime !== null) {
      metrics.recovery_time_s = (sustainedRecoveryTime - lastJamEnd) / 1000;
    } else {
      // Fallback to first fix event recovery if no sustained recovery found in points
      for (const event of fixLossEvents) {
        if (event.recovered_at) {
          const recoveryTime = new Date(event.recovered_at).getTime();
          if (recoveryTime >= lastJamEnd) {
            metrics.recovery_time_s = (recoveryTime - lastJamEnd) / 1000;
            break;
          }
        }
      }
    }
  }

  // Calculate drift metrics during jamming
  if (jammingWindows.length > 0 && points.length > 0) {
    const firstJam = jammingWindows[0];

    // Find position at jam start (reference point)
    const refPoint = findPositionAtTime(points, firstJam.start_time_ms);
    if (refPoint) {
      let maxDrift = 0;
      let minAlt = refPoint.alt_m ?? 0;
      let maxAlt = refPoint.alt_m ?? 0;

      // Check all positions during jamming
      for (const point of points) {
        if (point.timestamp_ms >= firstJam.start_time_ms && point.timestamp_ms <= firstJam.end_time_ms) {
          // Calculate lateral drift
          const drift = haversineDistance(
            refPoint.lat,
            refPoint.lon,
            point.lat,
            point.lon
          );
          if (drift > maxDrift) {
            maxDrift = drift;
          }

          // Track altitude range
          if (point.alt_m !== null) {
            if (point.alt_m < minAlt) minAlt = point.alt_m;
            if (point.alt_m > maxAlt) maxAlt = point.alt_m;
          }
        }
      }

      metrics.max_lateral_drift_m = maxDrift;
      metrics.altitude_delta_m = maxAlt - minAlt;
    }
  }

  // Calculate GPS quality summary
  if (points.length > 0) {
    let hdopSum = 0;
    let hdopCount = 0;
    let satSum = 0;
    let satCount = 0;
    let validCount = 0;

    for (const point of points) {
      if (point.hdop !== null && point.hdop !== undefined) {
        hdopSum += point.hdop;
        hdopCount++;
      }
      if (point.satellites !== null && point.satellites !== undefined) {
        satSum += point.satellites;
        satCount++;
      }
      if (point.quality !== 'lost') {
        validCount++;
      }
    }

    if (hdopCount > 0) {
      metrics.avg_hdop = hdopSum / hdopCount;
    }
    if (satCount > 0) {
      metrics.avg_satellites = satSum / satCount;
    }
    if (points.length > 0) {
      metrics.gps_availability_percent = (validCount / points.length) * 100;
    }
  }

  return metrics;
}

/**
 * Calculate metrics for all trackers in a session
 */
export function calculateAllTrackerMetrics(
  sessionId: string,
  trackDataMap: Map<string, DroneTrackData>,
  sessionEvents: TestEvent[],
  cuasPlacements: CUASPlacement[],
  fixLossEventsMap: Map<string, GPSFixLossEvent[]>
): TrackerSessionMetrics[] {
  const results: TrackerSessionMetrics[] = [];

  for (const [trackerId, trackData] of trackDataMap) {
    const fixLossEvents = fixLossEventsMap.get(trackerId) ?? [];
    const metrics = calculateTrackerMetrics(
      trackerId,
      sessionId,
      trackData,
      sessionEvents,
      cuasPlacements,
      fixLossEvents
    );
    results.push(metrics);
  }

  return results;
}
