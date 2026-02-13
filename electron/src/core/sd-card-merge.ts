/**
 * SD Card Merge Service
 * Handles parsing SD card logs and merging with live track data
 */

import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log';

export interface RawGPSPoint {
  lat: number;
  lon: number;
  alt_m: number | null;
  baro_alt_m?: number | null;
  timestamp_ms: number;
  hdop?: number | null;
  satellites?: number | null;
  speed_mps?: number | null;
  course_deg?: number | null;
  fix_valid: boolean;
}

export interface ParsedSDCardData {
  tracker_id: string;
  filename: string;
  start_time_ms: number;
  end_time_ms: number;
  points: RawGPSPoint[];
  metadata: {
    total_points: number;
    valid_points: number;
    duration_s: number;
    sample_rate_hz: number;
  };
}

export type GPSQuality = 'good' | 'degraded' | 'lost';
export type DataSource = 'live' | 'sd_card' | 'interpolated';

export interface EnhancedPositionPoint {
  lat: number;
  lon: number;
  alt_m: number | null;
  baro_alt_m: number | null;
  timestamp_ms: number;
  hdop: number | null;
  satellites: number | null;
  fix_valid: boolean;
  speed_mps: number | null;
  course_deg: number | null;
  rssi_dbm: number | null;
  source: DataSource;
  quality: GPSQuality;
}

export interface TrackSegment {
  tracker_id: string;
  points: EnhancedPositionPoint[];
  quality: GPSQuality | 'sd_only' | 'gap';
  start_time_ms: number;
  end_time_ms: number;
}

export interface MergedTrack {
  tracker_id: string;
  segments: TrackSegment[];
  total_points: number;
  live_points: number;
  sd_points: number;
  interpolated_points: number;
  gaps: { start_ms: number; end_ms: number; duration_s: number }[];
  coverage_percent: number;
}

/**
 * Parse SD card log file
 * Supports CSV format with timestamp,lat,lon,alt,hdop,satellites,speed,course columns
 */
export function parseSDCardFile(filePath: string, trackerId: string): ParsedSDCardData | null {
  try {
    if (!fs.existsSync(filePath)) {
      log.error(`SD card file not found: ${filePath}`);
      return null;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      log.warn(`SD card file has no data: ${filePath}`);
      return null;
    }

    // Parse header to determine column indices
    const header = lines[0].toLowerCase().split(',').map(h => h.trim());
    const colIndex = {
      timestamp: findColumn(header, ['timestamp', 'time', 'ts', 'time_ms']),
      lat: findColumn(header, ['lat', 'latitude']),
      lon: findColumn(header, ['lon', 'lng', 'longitude']),
      alt: findColumn(header, ['alt', 'altitude', 'gps_alt']),
      baro_alt: findColumn(header, ['baro_alt', 'baro', 'pressure_alt']),
      hdop: findColumn(header, ['hdop', 'dop']),
      satellites: findColumn(header, ['satellites', 'sats', 'sat_count', 'numsat']),
      speed: findColumn(header, ['speed', 'speed_mps', 'velocity']),
      course: findColumn(header, ['course', 'heading', 'bearing', 'track']),
      fix: findColumn(header, ['fix', 'fix_valid', 'gps_fix', 'fix_type']),
    };

    if (colIndex.lat === -1 || colIndex.lon === -1) {
      log.error(`SD card file missing required lat/lon columns: ${filePath}`);
      return null;
    }

    const points: RawGPSPoint[] = [];
    let validPoints = 0;

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim());
      if (cols.length < 3) continue;

      const lat = parseFloat(cols[colIndex.lat]);
      const lon = parseFloat(cols[colIndex.lon]);

      // Skip invalid coordinates
      if (isNaN(lat) || isNaN(lon) || lat === 0 || lon === 0) continue;

      const point: RawGPSPoint = {
        lat,
        lon,
        alt_m: colIndex.alt !== -1 ? parseFloatOrNull(cols[colIndex.alt]) : null,
        baro_alt_m: colIndex.baro_alt !== -1 ? parseFloatOrNull(cols[colIndex.baro_alt]) : null,
        timestamp_ms: colIndex.timestamp !== -1 ? parseTimestamp(cols[colIndex.timestamp]) : Date.now(),
        hdop: colIndex.hdop !== -1 ? parseFloatOrNull(cols[colIndex.hdop]) : null,
        satellites: colIndex.satellites !== -1 ? parseIntOrNull(cols[colIndex.satellites]) : null,
        speed_mps: colIndex.speed !== -1 ? parseFloatOrNull(cols[colIndex.speed]) : null,
        course_deg: colIndex.course !== -1 ? parseFloatOrNull(cols[colIndex.course]) : null,
        fix_valid: colIndex.fix !== -1 ? parseBoolOrTrue(cols[colIndex.fix]) : true,
      };

      if (point.fix_valid) validPoints++;
      points.push(point);
    }

    if (points.length === 0) {
      log.warn(`No valid points found in SD card file: ${filePath}`);
      return null;
    }

    // Sort by timestamp
    points.sort((a, b) => a.timestamp_ms - b.timestamp_ms);

    const startTime = points[0].timestamp_ms;
    const endTime = points[points.length - 1].timestamp_ms;
    const durationS = (endTime - startTime) / 1000;
    const sampleRateHz = durationS > 0 ? points.length / durationS : 0;

    return {
      tracker_id: trackerId,
      filename: path.basename(filePath),
      start_time_ms: startTime,
      end_time_ms: endTime,
      points,
      metadata: {
        total_points: points.length,
        valid_points: validPoints,
        duration_s: durationS,
        sample_rate_hz: sampleRateHz,
      },
    };
  } catch (error) {
    log.error(`Error parsing SD card file: ${filePath}`, error);
    return null;
  }
}

/**
 * Determine GPS quality based on HDOP and satellite count
 */
export function determineGPSQuality(hdop: number | null, satellites: number | null): GPSQuality {
  // If we have HDOP — harmonized thresholds matching analysis.py classify_quality()
  if (hdop !== null) {
    if (hdop <= 2) return 'good';
    if (hdop <= 5) return 'good';     // HDOP 2-5 is still acceptable
    if (hdop <= 20) return 'degraded'; // HDOP 5-20 is degraded (was: >5 = lost)
    return 'lost';                     // HDOP > 20 is denied
  }

  // Fall back to satellite count — harmonized thresholds
  if (satellites !== null) {
    if (satellites >= 6) return 'good';
    if (satellites >= 4) return 'degraded';
    return 'lost';
  }

  // No quality info available, assume good
  return 'good';
}

/**
 * Merge live and SD card data for a single tracker
 */
export function mergeTrackData(
  livePoints: RawGPSPoint[],
  sdCardData: ParsedSDCardData | null,
  trackerId: string
): MergedTrack {
  const allPoints: EnhancedPositionPoint[] = [];

  // Convert live points
  for (const p of livePoints) {
    allPoints.push({
      ...p,
      baro_alt_m: p.baro_alt_m ?? null,
      hdop: p.hdop ?? null,
      satellites: p.satellites ?? null,
      speed_mps: p.speed_mps ?? null,
      course_deg: p.course_deg ?? null,
      rssi_dbm: null,
      source: 'live',
      quality: determineGPSQuality(p.hdop ?? null, p.satellites ?? null),
    });
  }

  // Add SD card points
  if (sdCardData) {
    for (const p of sdCardData.points) {
      // Check if we already have a live point at this timestamp
      const existingIdx = allPoints.findIndex(
        lp => Math.abs(lp.timestamp_ms - p.timestamp_ms) < 100 // Within 100ms
      );

      if (existingIdx === -1) {
        // New point from SD card
        allPoints.push({
          ...p,
          baro_alt_m: p.baro_alt_m ?? null,
          hdop: p.hdop ?? null,
          satellites: p.satellites ?? null,
          speed_mps: p.speed_mps ?? null,
          course_deg: p.course_deg ?? null,
          rssi_dbm: null,
          source: 'sd_card',
          quality: determineGPSQuality(p.hdop ?? null, p.satellites ?? null),
        });
      } else {
        // Merge with existing point - prefer SD card data for position
        const existing = allPoints[existingIdx];
        if (existing.quality === 'lost' && p.fix_valid) {
          // SD card has better data
          allPoints[existingIdx] = {
            ...existing,
            lat: p.lat,
            lon: p.lon,
            alt_m: p.alt_m ?? existing.alt_m,
            baro_alt_m: p.baro_alt_m ?? existing.baro_alt_m,
            hdop: p.hdop ?? existing.hdop,
            satellites: p.satellites ?? existing.satellites,
            quality: determineGPSQuality(p.hdop ?? null, p.satellites ?? null),
          };
        }
      }
    }
  }

  // Sort by timestamp
  allPoints.sort((a, b) => a.timestamp_ms - b.timestamp_ms);

  // Identify gaps and create segments
  const segments: TrackSegment[] = [];
  const gaps: MergedTrack['gaps'] = [];
  let currentSegment: EnhancedPositionPoint[] = [];
  let currentQuality: GPSQuality | 'sd_only' | 'gap' = 'good';

  const GAP_THRESHOLD_MS = 5000; // 5 seconds

  for (let i = 0; i < allPoints.length; i++) {
    const point = allPoints[i];
    const prevPoint = i > 0 ? allPoints[i - 1] : null;

    // Check for gap
    if (prevPoint && point.timestamp_ms - prevPoint.timestamp_ms > GAP_THRESHOLD_MS) {
      // Save current segment
      if (currentSegment.length > 0) {
        segments.push({
          tracker_id: trackerId,
          points: currentSegment,
          quality: currentQuality,
          start_time_ms: currentSegment[0].timestamp_ms,
          end_time_ms: currentSegment[currentSegment.length - 1].timestamp_ms,
        });
      }

      // Record gap
      gaps.push({
        start_ms: prevPoint.timestamp_ms,
        end_ms: point.timestamp_ms,
        duration_s: (point.timestamp_ms - prevPoint.timestamp_ms) / 1000,
      });

      // Start new segment
      currentSegment = [];
    }

    // Determine segment quality
    const pointQuality = point.source === 'sd_card' && livePoints.length === 0
      ? 'sd_only' as const
      : point.quality;

    if (currentSegment.length === 0 || pointQuality !== currentQuality) {
      // Quality changed, save segment and start new one
      if (currentSegment.length > 0) {
        segments.push({
          tracker_id: trackerId,
          points: currentSegment,
          quality: currentQuality,
          start_time_ms: currentSegment[0].timestamp_ms,
          end_time_ms: currentSegment[currentSegment.length - 1].timestamp_ms,
        });
        currentSegment = [];
      }
      currentQuality = pointQuality;
    }

    currentSegment.push(point);
  }

  // Save final segment
  if (currentSegment.length > 0) {
    segments.push({
      tracker_id: trackerId,
      points: currentSegment,
      quality: currentQuality,
      start_time_ms: currentSegment[0].timestamp_ms,
      end_time_ms: currentSegment[currentSegment.length - 1].timestamp_ms,
    });
  }

  // Calculate coverage
  const liveCount = allPoints.filter(p => p.source === 'live').length;
  const sdCount = allPoints.filter(p => p.source === 'sd_card').length;
  const interpolatedCount = allPoints.filter(p => p.source === 'interpolated').length;

  const totalDuration = allPoints.length > 0
    ? allPoints[allPoints.length - 1].timestamp_ms - allPoints[0].timestamp_ms
    : 0;
  const gapDuration = gaps.reduce((sum, g) => sum + g.duration_s * 1000, 0);
  const coveragePercent = totalDuration > 0
    ? ((totalDuration - gapDuration) / totalDuration) * 100
    : 100;

  return {
    tracker_id: trackerId,
    segments,
    total_points: allPoints.length,
    live_points: liveCount,
    sd_points: sdCount,
    interpolated_points: interpolatedCount,
    gaps,
    coverage_percent: Math.round(coveragePercent * 10) / 10,
  };
}

// Helper functions
function findColumn(header: string[], candidates: string[]): number {
  for (const c of candidates) {
    const idx = header.indexOf(c);
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseFloatOrNull(val: string): number | null {
  const num = parseFloat(val);
  return isNaN(num) ? null : num;
}

function parseIntOrNull(val: string): number | null {
  const num = parseInt(val, 10);
  return isNaN(num) ? null : num;
}

function parseTimestamp(val: string): number {
  // Try parsing as integer (milliseconds)
  const num = parseInt(val, 10);
  if (!isNaN(num)) {
    // If it looks like seconds, convert to ms
    return num < 1e12 ? num * 1000 : num;
  }
  // Try parsing as date string
  const date = new Date(val);
  return date.getTime() || Date.now();
}

function parseBoolOrTrue(val: string): boolean {
  const lower = val.toLowerCase();
  return lower !== '0' && lower !== 'false' && lower !== 'no';
}

/**
 * Get SD card data as a separate track (not merged with live)
 * Used for dual-track visualization where SD card track is displayed alongside live track
 *
 * @param sdCardData - Parsed SD card data
 * @param timeOffset - Optional time offset in milliseconds to align with live data
 * @returns Array of EnhancedPositionPoint with source='sd_card'
 */
export function getSDCardTrackSeparate(
  sdCardData: ParsedSDCardData,
  timeOffset: number = 0
): EnhancedPositionPoint[] {
  return sdCardData.points.map(p => ({
    lat: p.lat,
    lon: p.lon,
    alt_m: p.alt_m,
    baro_alt_m: p.baro_alt_m ?? null,
    timestamp_ms: p.timestamp_ms + timeOffset,
    hdop: p.hdop ?? null,
    satellites: p.satellites ?? null,
    fix_valid: p.fix_valid,
    speed_mps: p.speed_mps ?? null,
    course_deg: p.course_deg ?? null,
    rssi_dbm: null,
    source: 'sd_card' as DataSource,
    quality: determineGPSQuality(p.hdop ?? null, p.satellites ?? null),
  }));
}

/**
 * Detect gaps between live track and SD card track
 * Returns time ranges where only SD card data is available (connection loss periods)
 */
export function detectConnectionGaps(
  livePoints: RawGPSPoint[],
  sdCardData: ParsedSDCardData,
  gapThresholdMs: number = 5000
): { start_ms: number; end_ms: number; duration_s: number }[] {
  if (livePoints.length === 0 || !sdCardData || sdCardData.points.length === 0) {
    return [];
  }

  const gaps: { start_ms: number; end_ms: number; duration_s: number }[] = [];

  // Sort live points by timestamp
  const sortedLive = [...livePoints].sort((a, b) => a.timestamp_ms - b.timestamp_ms);

  // Find gaps in live data where SD card has data
  for (let i = 0; i < sortedLive.length - 1; i++) {
    const currentEnd = sortedLive[i].timestamp_ms;
    const nextStart = sortedLive[i + 1].timestamp_ms;
    const gapDuration = nextStart - currentEnd;

    if (gapDuration > gapThresholdMs) {
      // Check if SD card has data during this gap
      const sdPointsInGap = sdCardData.points.filter(
        p => p.timestamp_ms > currentEnd && p.timestamp_ms < nextStart
      );

      if (sdPointsInGap.length > 0) {
        gaps.push({
          start_ms: currentEnd,
          end_ms: nextStart,
          duration_s: Math.round(gapDuration / 100) / 10,
        });
      }
    }
  }

  return gaps;
}
