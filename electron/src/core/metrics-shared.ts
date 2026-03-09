/**
 * Shared Metrics Utilities
 * Common types and functions used by both metrics-engine.ts and tracker-metrics-calculator.ts.
 * Extracted to break circular dependency.
 */

import { TestEvent } from './models/workflow';
import { EnhancedPositionPoint } from './sd-card-merge';

// =============================================================================
// Shared Types
// =============================================================================

export interface DroneTrackData {
  tracker_id: string;
  points: EnhancedPositionPoint[];
  start_time_ms: number;
  end_time_ms: number;
}

export interface JammingWindow {
  start_time_ms: number;
  end_time_ms: number;
  duration_s: number;
  cuas_id?: string;
}

// =============================================================================
// Distance Functions
// =============================================================================

/**
 * Calculate distance between two GPS points in meters (Haversine formula)
 */
export function haversineDistance(
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
export function haversine3DDistance(
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

// =============================================================================
// Point Lookup Functions
// =============================================================================

/**
 * Find position point closest to a given timestamp
 */
export function findPositionAtTime(
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
 * Find first point where HDOP crosses degradation threshold after a given time
 */
export function findDegradationOnsetTime(
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
export function findSustainedRecoveryTime(
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

// =============================================================================
// Event Parsing
// =============================================================================

/**
 * Extract jamming windows from session events
 */
export function extractJammingWindows(events: TestEvent[]): JammingWindow[] {
  const windows: JammingWindow[] = [];
  let jamStartTime: number | null = null;
  let currentCuasId: string | undefined;

  for (const event of events) {
    if (event.type === 'jam_on') {
      jamStartTime = new Date(event.timestamp).getTime();
      currentCuasId = event.cuas_id;
    } else if (event.type === 'jam_off' && jamStartTime !== null) {
      const endTime = new Date(event.timestamp).getTime();
      windows.push({
        start_time_ms: jamStartTime,
        end_time_ms: endTime,
        duration_s: (endTime - jamStartTime) / 1000,
        cuas_id: currentCuasId,
      });
      jamStartTime = null;
      currentCuasId = undefined;
    }
  }

  // Handle unclosed jamming window
  if (jamStartTime !== null) {
    const lastEvent = events[events.length - 1];
    const endTime = new Date(lastEvent.timestamp).getTime();
    windows.push({
      start_time_ms: jamStartTime,
      end_time_ms: endTime,
      duration_s: (endTime - jamStartTime) / 1000,
      cuas_id: currentCuasId,
    });
  }

  return windows;
}
