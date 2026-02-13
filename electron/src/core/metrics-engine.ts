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
import { sessionDataCollector } from './session-data-collector';
import { TrackerPosition } from './mock-tracker-provider';
import {
  getTestSessionById,
  updateTestSession,
} from './library-store';

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

/**
 * Aggregate per-tracker analysis results into session-level metrics
 */
export function aggregateSessionMetrics(
  trackerResults: Map<string, AnalysisResult>
): SessionMetrics {
  const allMetrics: SessionMetrics[] = [];
  for (const result of trackerResults.values()) {
    allMetrics.push(result.metrics);
  }

  if (allMetrics.length === 0) {
    return {
      total_flight_time_s: 0,
      time_under_jamming_s: 0,
      failsafe_triggered: false,
      pass_fail: 'fail',
    };
  }

  // Aggregate: max flight time, total jamming, min time-to-effect, max drift, etc.
  const totalFlightTime = Math.max(...allMetrics.map(m => m.total_flight_time_s));
  const totalJammingTime = Math.max(...allMetrics.map(m => m.time_under_jamming_s));

  const timesToEffect = allMetrics
    .map(m => m.time_to_effect_s)
    .filter((t): t is number => t !== undefined);
  const timesToFullDenial = allMetrics
    .map(m => m.time_to_full_denial_s)
    .filter((t): t is number => t !== undefined);
  const recoveryTimes = allMetrics
    .map(m => m.recovery_time_s)
    .filter((t): t is number => t !== undefined);
  const effectiveRanges = allMetrics
    .map(m => m.effective_range_m)
    .filter((r): r is number => r !== undefined);
  const lateralDrifts = allMetrics
    .map(m => m.max_lateral_drift_m)
    .filter((d): d is number => d !== undefined);
  const altitudeDeltas = allMetrics
    .map(m => m.altitude_delta_m)
    .filter((d): d is number => d !== undefined);

  const anyFailsafe = allMetrics.some(m => m.failsafe_triggered);
  const failsafeTypes = allMetrics
    .map(m => m.failsafe_type)
    .filter((t): t is FailsafeType => t !== undefined);

  // Determine overall pass/fail: pass if any tracker passed, partial if any partial
  const passFails = allMetrics.map(m => m.pass_fail).filter(Boolean);
  let overallPassFail: 'pass' | 'fail' | 'partial' = 'fail';
  if (passFails.includes('pass')) overallPassFail = 'pass';
  else if (passFails.includes('partial')) overallPassFail = 'partial';

  return {
    total_flight_time_s: totalFlightTime,
    time_under_jamming_s: totalJammingTime,
    time_to_effect_s: timesToEffect.length > 0 ? Math.min(...timesToEffect) : undefined,
    time_to_full_denial_s: timesToFullDenial.length > 0 ? Math.min(...timesToFullDenial) : undefined,
    recovery_time_s: recoveryTimes.length > 0 ? Math.max(...recoveryTimes) : undefined,
    effective_range_m: effectiveRanges.length > 0 ? Math.min(...effectiveRanges) : undefined,
    altitude_delta_m: altitudeDeltas.length > 0 ? Math.max(...altitudeDeltas) : undefined,
    max_lateral_drift_m: lateralDrifts.length > 0 ? Math.max(...lateralDrifts) : undefined,
    failsafe_triggered: anyFailsafe,
    failsafe_type: failsafeTypes[0],
    pass_fail: overallPassFail,
  };
}

/**
 * Convert TrackerPosition[] to DroneTrackData format for analysis
 */
function positionsToTrackData(
  trackerId: string,
  positions: TrackerPosition[]
): DroneTrackData {
  const sorted = [...positions].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const points: EnhancedPositionPoint[] = sorted.map(p => ({
    lat: p.latitude,
    lon: p.longitude,
    alt_m: p.altitude_m,
    baro_alt_m: null,
    timestamp_ms: new Date(p.timestamp).getTime(),
    hdop: p.hdop ?? null,
    satellites: p.satellites ?? null,
    speed_mps: p.speed_ms,
    course_deg: p.heading_deg,
    fix_valid: p.gps_quality !== 'poor',
    rssi_dbm: p.rssi_dbm ?? null,
    quality: (p.gps_quality === 'good' ? 'good' : p.gps_quality === 'degraded' ? 'degraded' : 'lost') as 'good' | 'degraded' | 'lost',
    source: 'live' as 'live' | 'sd_card' | 'interpolated',
  }));

  return {
    tracker_id: trackerId,
    points,
    start_time_ms: points.length > 0 ? points[0].timestamp_ms : 0,
    end_time_ms: points.length > 0 ? points[points.length - 1].timestamp_ms : 0,
  };
}

/**
 * Auto-compute metrics when a session transitions to completed/analyzing.
 * Called from the session status change handler.
 * @returns The computed session metrics, or null if computation failed
 */
export function autoComputeOnSessionComplete(sessionId: string): SessionMetrics | null {
  try {
    const session = getTestSessionById(sessionId);
    if (!session) {
      log.warn(`[MetricsEngine] Cannot auto-compute: session ${sessionId} not found`);
      return null;
    }

    // Get recorded positions from session data collector
    const positionsByTracker = sessionDataCollector.getPositionsByTracker(sessionId);
    if (positionsByTracker.size === 0) {
      log.warn(`[MetricsEngine] No track data for session ${sessionId}, skipping auto-compute`);
      return null;
    }

    // Convert to DroneTrackData
    const trackData = new Map<string, DroneTrackData>();
    for (const [trackerId, positions] of positionsByTracker) {
      if (positions.length === 0) continue;
      trackData.set(trackerId, positionsToTrackData(trackerId, positions));
    }

    // Build CUAS positions map
    const cuasPositions = new Map<string, { lat: number; lon: number }>();
    for (const placement of session.cuas_placements || []) {
      if (placement.position) {
        cuasPositions.set(placement.cuas_profile_id, {
          lat: placement.position.lat,
          lon: placement.position.lon,
        });
      }
    }

    // Run per-tracker analysis
    const trackerResults = analyzeSession(session, trackData, cuasPositions);

    // Aggregate into session-level metrics
    const sessionMetrics = aggregateSessionMetrics(trackerResults);

    // Save metrics to session
    updateTestSession(sessionId, {
      metrics: sessionMetrics,
      analysis_completed: true,
    });

    log.info(`[MetricsEngine] Auto-computed metrics for session ${sessionId}: pass_fail=${sessionMetrics.pass_fail}`);
    return sessionMetrics;
  } catch (error) {
    log.error(`[MetricsEngine] Auto-compute failed for session ${sessionId}:`, error);
    return null;
  }
}
