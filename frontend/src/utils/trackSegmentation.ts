/**
 * Track Segmentation Utilities
 * Segments drone tracks by GPS quality for color-coded visualization
 */

import type { PositionPoint } from '../types/drone';
import type { GPSQuality, EnhancedPositionPoint, TrackSegment, DataSource } from '../types/workflow';

// Quality color scheme
export const QUALITY_COLORS: Record<GPSQuality | 'sd_only' | 'gap', string> = {
  good: '#22c55e',      // Green - good GPS fix
  degraded: '#eab308',  // Yellow - poor HDOP or few satellites
  lost: '#ef4444',      // Red - no GPS fix
  sd_only: '#f97316',   // Orange - SD card data only (no live)
  gap: '#6b7280',       // Gray dashed - interpolated/gap
};

// Quality thresholds
const HDOP_GOOD_THRESHOLD = 2.0;
const HDOP_DEGRADED_THRESHOLD = 5.0;
const SATELLITES_GOOD_THRESHOLD = 8;
const SATELLITES_DEGRADED_THRESHOLD = 4;

/**
 * Determine GPS quality from position data
 */
export function determineGPSQuality(
  hdop: number | null,
  satellites: number | null,
  fixValid: boolean
): GPSQuality {
  // No fix = lost
  if (!fixValid) {
    return 'lost';
  }

  // Check HDOP (lower is better)
  if (hdop !== null) {
    if (hdop <= HDOP_GOOD_THRESHOLD) {
      // Good HDOP - check satellites for confirmation
      if (satellites === null || satellites >= SATELLITES_GOOD_THRESHOLD) {
        return 'good';
      }
      return 'degraded';
    }
    if (hdop <= HDOP_DEGRADED_THRESHOLD) {
      return 'degraded';
    }
    // HDOP too high
    return 'lost';
  }

  // No HDOP data - use satellites only
  if (satellites !== null) {
    if (satellites >= SATELLITES_GOOD_THRESHOLD) {
      return 'good';
    }
    if (satellites >= SATELLITES_DEGRADED_THRESHOLD) {
      return 'degraded';
    }
    return 'lost';
  }

  // No quality data available - assume good if fix is valid
  return fixValid ? 'good' : 'lost';
}

/**
 * Convert basic PositionPoint to EnhancedPositionPoint with quality
 */
export function enhancePositionPoint(
  point: PositionPoint,
  hdop?: number | null,
  satellites?: number | null,
  fixValid: boolean = true,
  source: DataSource = 'live'
): EnhancedPositionPoint {
  const quality = determineGPSQuality(hdop ?? null, satellites ?? null, fixValid);

  return {
    lat: point.lat,
    lon: point.lon,
    alt_m: point.alt_m,
    baro_alt_m: null,
    timestamp_ms: point.timestamp,
    hdop: hdop ?? null,
    satellites: satellites ?? null,
    fix_valid: fixValid,
    speed_mps: null,
    course_deg: null,
    rssi_dbm: null,
    source,
    quality,
  };
}

/**
 * Segment track by GPS quality
 * Groups consecutive points with the same quality into segments
 */
export function segmentTrackByQuality(
  points: EnhancedPositionPoint[],
  trackerId: string
): TrackSegment[] {
  if (points.length === 0) return [];

  const segments: TrackSegment[] = [];
  let currentSegment: EnhancedPositionPoint[] = [points[0]];
  let currentQuality = getSegmentQuality(points[0]);

  for (let i = 1; i < points.length; i++) {
    const point = points[i];
    const pointQuality = getSegmentQuality(point);

    if (pointQuality === currentQuality) {
      // Same quality - add to current segment
      currentSegment.push(point);
    } else {
      // Quality changed - close current segment and start new one
      // Add the last point to both segments for continuity
      segments.push({
        tracker_id: trackerId,
        points: currentSegment,
        quality: currentQuality,
        start_time_ms: currentSegment[0].timestamp_ms,
        end_time_ms: currentSegment[currentSegment.length - 1].timestamp_ms,
      });

      // Start new segment with overlap point for continuous line
      currentSegment = [currentSegment[currentSegment.length - 1], point];
      currentQuality = pointQuality;
    }
  }

  // Close final segment
  if (currentSegment.length > 0) {
    segments.push({
      tracker_id: trackerId,
      points: currentSegment,
      quality: currentQuality,
      start_time_ms: currentSegment[0].timestamp_ms,
      end_time_ms: currentSegment[currentSegment.length - 1].timestamp_ms,
    });
  }

  return segments;
}

/**
 * Get segment quality from enhanced point
 */
function getSegmentQuality(point: EnhancedPositionPoint): GPSQuality | 'sd_only' | 'gap' {
  // SD card only data
  if (point.source === 'sd_card' && !point.fix_valid) {
    return 'sd_only';
  }
  // Interpolated/gap data
  if (point.source === 'interpolated') {
    return 'gap';
  }
  return point.quality;
}

/**
 * Convert track segments to GeoJSON features for MapLibre
 */
export function segmentsToGeoJSON(
  segments: TrackSegment[],
  baseColor: string
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  for (const segment of segments) {
    if (segment.points.length < 2) continue;

    const coordinates = segment.points.map(p => [p.lon, p.lat]);
    const color = QUALITY_COLORS[segment.quality] || baseColor;
    const isDashed = segment.quality === 'gap' || segment.quality === 'lost';

    features.push({
      type: 'Feature',
      properties: {
        trackerId: segment.tracker_id,
        quality: segment.quality,
        color,
        baseColor,
        isDashed,
        startTime: segment.start_time_ms,
        endTime: segment.end_time_ms,
      },
      geometry: {
        type: 'LineString',
        coordinates,
      },
    });
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

/**
 * Create quality-segmented GeoJSON from basic position history
 * Falls back to uniform quality when enhanced data not available
 */
export function createQualityTrackGeoJSON(
  history: Map<string, PositionPoint[]>,
  enhancedHistory?: Map<string, EnhancedPositionPoint[]>,
  droneColorMap?: Map<string, string>,
  timelineStart?: number,
  currentTime?: number
): GeoJSON.FeatureCollection {
  const allFeatures: GeoJSON.Feature[] = [];
  const defaultColors = [
    '#00c8ff', '#ff6b6b', '#4ecdc4', '#f7dc6f',
    '#bb8fce', '#58d68d', '#f8b500', '#5dade2',
  ];

  let colorIndex = 0;

  for (const [trackerId, positions] of history) {
    const baseColor = droneColorMap?.get(trackerId) || defaultColors[colorIndex % defaultColors.length];
    colorIndex++;

    // Check if we have enhanced data for this tracker
    const hasEnhanced = enhancedHistory?.has(trackerId) && (enhancedHistory.get(trackerId)?.length ?? 0) > 0;

    if (hasEnhanced) {
      // Use enhanced data with quality segmentation
      let enhancedPoints = enhancedHistory!.get(trackerId)!;

      // Filter by time range if provided
      if (timelineStart !== undefined && currentTime !== undefined) {
        enhancedPoints = enhancedPoints.filter(
          p => p.timestamp_ms >= timelineStart && p.timestamp_ms <= currentTime
        );
      }

      if (enhancedPoints.length < 2) continue;

      // Segment by quality
      const segments = segmentTrackByQuality(enhancedPoints, trackerId);
      const segmentGeoJSON = segmentsToGeoJSON(segments, baseColor);
      allFeatures.push(...segmentGeoJSON.features);
    } else {
      // Use basic position data
      let basicPositions = positions;

      // Filter by time range if provided
      if (timelineStart !== undefined && currentTime !== undefined) {
        basicPositions = basicPositions.filter(
          p => p.timestamp >= timelineStart && p.timestamp <= currentTime
        );
      }

      if (basicPositions.length < 2) continue;

      // Single segment with base color
      const coordinates = basicPositions.map(p => [p.lon, p.lat]);
      allFeatures.push({
        type: 'Feature',
        properties: {
          trackerId,
          quality: 'good',
          color: baseColor,
          baseColor,
          isDashed: false,
        },
        geometry: {
          type: 'LineString',
          coordinates,
        },
      });
    }
  }

  return {
    type: 'FeatureCollection',
    features: allFeatures,
  };
}

/**
 * Calculate track statistics
 */
export interface TrackQualityStats {
  totalPoints: number;
  goodPoints: number;
  degradedPoints: number;
  lostPoints: number;
  goodPercentage: number;
  degradedPercentage: number;
  lostPercentage: number;
  totalDurationMs: number;
  goodDurationMs: number;
  degradedDurationMs: number;
  lostDurationMs: number;
}

export function calculateTrackQualityStats(
  segments: TrackSegment[]
): TrackQualityStats {
  const stats: TrackQualityStats = {
    totalPoints: 0,
    goodPoints: 0,
    degradedPoints: 0,
    lostPoints: 0,
    goodPercentage: 0,
    degradedPercentage: 0,
    lostPercentage: 0,
    totalDurationMs: 0,
    goodDurationMs: 0,
    degradedDurationMs: 0,
    lostDurationMs: 0,
  };

  for (const segment of segments) {
    const pointCount = segment.points.length;
    const duration = segment.end_time_ms - segment.start_time_ms;

    stats.totalPoints += pointCount;
    stats.totalDurationMs += duration;

    switch (segment.quality) {
      case 'good':
        stats.goodPoints += pointCount;
        stats.goodDurationMs += duration;
        break;
      case 'degraded':
        stats.degradedPoints += pointCount;
        stats.degradedDurationMs += duration;
        break;
      case 'lost':
      case 'gap':
        stats.lostPoints += pointCount;
        stats.lostDurationMs += duration;
        break;
    }
  }

  // Calculate percentages
  if (stats.totalPoints > 0) {
    stats.goodPercentage = (stats.goodPoints / stats.totalPoints) * 100;
    stats.degradedPercentage = (stats.degradedPoints / stats.totalPoints) * 100;
    stats.lostPercentage = (stats.lostPoints / stats.totalPoints) * 100;
  }

  return stats;
}
