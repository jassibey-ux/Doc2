/**
 * Metrics Engine
 * Calculates CUAS effectiveness metrics from test session data
 */

import log from 'electron-log';
import {
  TestSession,
  TestEvent,
  SessionMetrics,
  FailsafeType,
} from './models/workflow';
import { EnhancedPositionPoint, TrackSegment } from './sd-card-merge';

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

export interface AnalysisResult {
  session_id: string;
  tracker_id: string;
  metrics: SessionMetrics;
  jamming_windows: JammingWindow[];
  altitude_profile: { time_ms: number; alt_m: number }[];
  position_drift: { time_ms: number; drift_m: number }[];
  gps_quality_changes: { time_ms: number; quality: string }[];
}

/**
 * Calculate distance between two GPS points in meters
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

/**
 * Calculate time-to-effect: time from jam_on until first GPS degradation
 */
export function calculateTimeToEffect(
  events: TestEvent[],
  trackData: DroneTrackData
): number | undefined {
  const jamOnEvent = events.find(e => e.type === 'jam_on');
  if (!jamOnEvent) return undefined;

  const jamStartTime = new Date(jamOnEvent.timestamp).getTime();

  // Find first point with degraded/lost quality after jam start
  const firstDegradedPoint = trackData.points.find(
    p => p.timestamp_ms >= jamStartTime && (p.quality === 'degraded' || p.quality === 'lost')
  );

  if (!firstDegradedPoint) return undefined;

  return (firstDegradedPoint.timestamp_ms - jamStartTime) / 1000;
}

/**
 * Calculate time-to-full-denial: time from jam_on until complete GPS loss
 */
export function calculateTimeToFullDenial(
  events: TestEvent[],
  trackData: DroneTrackData
): number | undefined {
  const jamOnEvent = events.find(e => e.type === 'jam_on');
  if (!jamOnEvent) return undefined;

  const jamStartTime = new Date(jamOnEvent.timestamp).getTime();

  // Find first 'lost' quality point after jam start
  const firstLostPoint = trackData.points.find(
    p => p.timestamp_ms >= jamStartTime && p.quality === 'lost'
  );

  if (!firstLostPoint) return undefined;

  return (firstLostPoint.timestamp_ms - jamStartTime) / 1000;
}

/**
 * Calculate recovery time: time from jam_off until GPS is restored
 */
export function calculateRecoveryTime(
  events: TestEvent[],
  trackData: DroneTrackData
): number | undefined {
  const jamOffEvent = events.find(e => e.type === 'jam_off');
  if (!jamOffEvent) return undefined;

  const jamEndTime = new Date(jamOffEvent.timestamp).getTime();

  // Find first good quality point after jam end
  const firstGoodPoint = trackData.points.find(
    p => p.timestamp_ms >= jamEndTime && p.quality === 'good'
  );

  if (!firstGoodPoint) return undefined;

  return (firstGoodPoint.timestamp_ms - jamEndTime) / 1000;
}

/**
 * Calculate maximum lateral drift during jamming
 */
export function calculateMaxLateralDrift(
  trackData: DroneTrackData,
  jammingWindows: JammingWindow[]
): number {
  let maxDrift = 0;

  for (const window of jammingWindows) {
    // Get pre-jam position (average of last 5 points before jam)
    const preJamPoints = trackData.points.filter(
      p => p.timestamp_ms >= window.start_time_ms - 5000 && p.timestamp_ms < window.start_time_ms
    );

    if (preJamPoints.length === 0) continue;

    const avgPreJamLat = preJamPoints.reduce((sum, p) => sum + p.lat, 0) / preJamPoints.length;
    const avgPreJamLon = preJamPoints.reduce((sum, p) => sum + p.lon, 0) / preJamPoints.length;

    // Get points during jamming
    const jamPoints = trackData.points.filter(
      p => p.timestamp_ms >= window.start_time_ms && p.timestamp_ms <= window.end_time_ms
    );

    // Calculate max drift from pre-jam position
    for (const point of jamPoints) {
      const drift = haversineDistance(avgPreJamLat, avgPreJamLon, point.lat, point.lon);
      maxDrift = Math.max(maxDrift, drift);
    }
  }

  return Math.round(maxDrift * 10) / 10; // Round to 0.1m
}

/**
 * Calculate altitude delta during jamming
 */
export function calculateAltitudeDelta(
  trackData: DroneTrackData,
  jammingWindows: JammingWindow[]
): number {
  let maxDelta = 0;

  for (const window of jammingWindows) {
    // Get pre-jam altitude
    const preJamPoints = trackData.points.filter(
      p => p.timestamp_ms >= window.start_time_ms - 5000 &&
           p.timestamp_ms < window.start_time_ms &&
           p.alt_m !== null
    );

    if (preJamPoints.length === 0) continue;

    const avgPreJamAlt = preJamPoints.reduce((sum, p) => sum + (p.alt_m || 0), 0) / preJamPoints.length;

    // Get points during jamming with valid altitude
    const jamPoints = trackData.points.filter(
      p => p.timestamp_ms >= window.start_time_ms &&
           p.timestamp_ms <= window.end_time_ms &&
           p.alt_m !== null
    );

    // Calculate max altitude delta
    for (const point of jamPoints) {
      const delta = Math.abs((point.alt_m || 0) - avgPreJamAlt);
      maxDelta = Math.max(maxDelta, delta);
    }
  }

  return Math.round(maxDelta * 10) / 10; // Round to 0.1m
}

/**
 * Detect failsafe events from track data
 */
export function detectFailsafe(
  events: TestEvent[],
  trackData: DroneTrackData
): { triggered: boolean; type?: FailsafeType } {
  // First check for explicit failsafe event
  const failsafeEvent = events.find(e => e.type === 'failsafe');
  if (failsafeEvent) {
    return {
      triggered: true,
      type: (failsafeEvent.metadata?.failsafe_type as FailsafeType) || 'unknown',
    };
  }

  // Auto-detect based on behavior patterns
  // RTH: consistent movement toward home point
  // Land: descent with minimal horizontal movement
  // Hover: minimal movement in all directions

  // For now, just check if we have a recovery event which might indicate RTH
  const recoverEvent = events.find(e => e.type === 'recover');
  if (recoverEvent) {
    return { triggered: true, type: 'rth' };
  }

  return { triggered: false };
}

/**
 * Calculate effective range from CUAS position to drone at first effect
 */
export function calculateEffectiveRange(
  cuasPosition: { lat: number; lon: number },
  events: TestEvent[],
  trackData: DroneTrackData
): number | undefined {
  const jamOnEvent = events.find(e => e.type === 'jam_on');
  if (!jamOnEvent) return undefined;

  const jamStartTime = new Date(jamOnEvent.timestamp).getTime();

  // Find drone position at jam start
  const droneAtJam = trackData.points.find(
    p => p.timestamp_ms >= jamStartTime && p.timestamp_ms <= jamStartTime + 1000
  );

  if (!droneAtJam) return undefined;

  return Math.round(haversineDistance(
    cuasPosition.lat,
    cuasPosition.lon,
    droneAtJam.lat,
    droneAtJam.lon
  ));
}

/**
 * Determine pass/fail status based on expected vs actual behavior
 */
export function determinePassFail(
  expectedFailsafe: FailsafeType | undefined,
  actualFailsafe: { triggered: boolean; type?: FailsafeType },
  timeToEffect?: number,
  maxDrift?: number
): 'pass' | 'fail' | 'partial' {
  // If failsafe was expected and triggered correctly
  if (expectedFailsafe) {
    if (actualFailsafe.triggered && actualFailsafe.type === expectedFailsafe) {
      return 'pass';
    }
    if (actualFailsafe.triggered && actualFailsafe.type !== expectedFailsafe) {
      return 'partial'; // Triggered but wrong type
    }
    return 'fail'; // Expected but didn't trigger
  }

  // If no specific failsafe expected, check for any response
  if (timeToEffect !== undefined && timeToEffect < 30) {
    return 'pass'; // Effect observed within 30 seconds
  }

  if (maxDrift && maxDrift > 100) {
    return 'partial'; // Significant drift indicates some effect
  }

  return 'fail';
}

/**
 * Generate altitude profile for visualization
 */
export function generateAltitudeProfile(
  trackData: DroneTrackData
): { time_ms: number; alt_m: number }[] {
  return trackData.points
    .filter(p => p.alt_m !== null)
    .map(p => ({
      time_ms: p.timestamp_ms,
      alt_m: p.alt_m!,
    }));
}

/**
 * Generate position drift profile for visualization
 */
export function generateDriftProfile(
  trackData: DroneTrackData,
  jammingWindows: JammingWindow[]
): { time_ms: number; drift_m: number }[] {
  const driftProfile: { time_ms: number; drift_m: number }[] = [];

  if (jammingWindows.length === 0) {
    return trackData.points.map(p => ({ time_ms: p.timestamp_ms, drift_m: 0 }));
  }

  // Use first jamming window for reference
  const window = jammingWindows[0];
  const preJamPoints = trackData.points.filter(
    p => p.timestamp_ms >= window.start_time_ms - 5000 && p.timestamp_ms < window.start_time_ms
  );

  if (preJamPoints.length === 0) {
    return trackData.points.map(p => ({ time_ms: p.timestamp_ms, drift_m: 0 }));
  }

  const refLat = preJamPoints.reduce((sum, p) => sum + p.lat, 0) / preJamPoints.length;
  const refLon = preJamPoints.reduce((sum, p) => sum + p.lon, 0) / preJamPoints.length;

  for (const point of trackData.points) {
    const drift = haversineDistance(refLat, refLon, point.lat, point.lon);
    driftProfile.push({
      time_ms: point.timestamp_ms,
      drift_m: Math.round(drift * 10) / 10,
    });
  }

  return driftProfile;
}

/**
 * Main analysis function - calculate all metrics for a session
 */
export function analyzeSession(
  session: TestSession,
  trackData: Map<string, DroneTrackData>,
  cuasPositions: Map<string, { lat: number; lon: number }>
): Map<string, AnalysisResult> {
  const results = new Map<string, AnalysisResult>();

  // Extract jamming windows from session events
  const jammingWindows = extractJammingWindows(session.events);

  // Calculate total jamming time
  const totalJammingTime = jammingWindows.reduce((sum, w) => sum + w.duration_s, 0);

  // Analyze each tracker
  for (const [trackerId, data] of trackData.entries()) {
    const assignment = session.tracker_assignments.find(a => a.tracker_id === trackerId);
    const expectedFailsafe = assignment
      ? undefined // Would get from drone profile
      : undefined;

    const timeToEffect = calculateTimeToEffect(session.events, data);
    const timeToFullDenial = calculateTimeToFullDenial(session.events, data);
    const recoveryTime = calculateRecoveryTime(session.events, data);
    const maxLateralDrift = calculateMaxLateralDrift(data, jammingWindows);
    const altitudeDelta = calculateAltitudeDelta(data, jammingWindows);
    const failsafe = detectFailsafe(session.events, data);

    // Calculate effective range if CUAS position is available
    const firstCuasPlacement = session.cuas_placements[0];
    const effectiveRange = firstCuasPlacement && cuasPositions.has(firstCuasPlacement.cuas_profile_id)
      ? calculateEffectiveRange(
          cuasPositions.get(firstCuasPlacement.cuas_profile_id)!,
          session.events,
          data
        )
      : undefined;

    const passFail = determinePassFail(expectedFailsafe, failsafe, timeToEffect, maxLateralDrift);

    const metrics: SessionMetrics = {
      total_flight_time_s: (data.end_time_ms - data.start_time_ms) / 1000,
      time_under_jamming_s: totalJammingTime,
      time_to_effect_s: timeToEffect,
      time_to_full_denial_s: timeToFullDenial,
      recovery_time_s: recoveryTime,
      effective_range_m: effectiveRange,
      max_altitude_under_jam_m: undefined, // Would calculate from track data
      altitude_delta_m: altitudeDelta,
      max_lateral_drift_m: maxLateralDrift,
      connection_loss_duration_s: undefined, // Would calculate from gaps
      failsafe_triggered: failsafe.triggered,
      failsafe_type: failsafe.type,
      failsafe_expected: expectedFailsafe,
      pass_fail: passFail,
    };

    const gpsQualityChanges: { time_ms: number; quality: string }[] = [];
    let lastQuality = data.points[0]?.quality || 'unknown';

    for (const point of data.points) {
      if (point.quality !== lastQuality) {
        gpsQualityChanges.push({
          time_ms: point.timestamp_ms,
          quality: point.quality,
        });
        lastQuality = point.quality;
      }
    }

    results.set(trackerId, {
      session_id: session.id,
      tracker_id: trackerId,
      metrics,
      jamming_windows: jammingWindows,
      altitude_profile: generateAltitudeProfile(data),
      position_drift: generateDriftProfile(data, jammingWindows),
      gps_quality_changes: gpsQualityChanges,
    });
  }

  return results;
}
