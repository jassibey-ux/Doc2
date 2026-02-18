/**
 * DroneTrackLayer3D — Flight path polylines on Google 3D Map.
 *
 * Renders drone tracks with quality-colored segments:
 * - Good GPS: green polyline
 * - Degraded: yellow polyline
 * - Lost: red polyline
 *
 * Google 3D doesn't support per-vertex colors on a single polyline,
 * so each quality segment becomes a separate Polyline3DElement.
 */

import type { PositionPoint } from '../../../types/drone';
import type { EnhancedPositionPoint } from '../../../types/workflow';
import type { Map3DElementRef } from '../hooks/useGoogle3DMap';

const TRACK_TAG = 'drone-track-layer';

/** Quality → color mapping (matches Cesium QUALITY_COLORS) */
const QUALITY_COLORS: Record<string, string> = {
  good: '#22c55e',
  degraded: '#eab308',
  lost: '#ef4444',
  sd_only: '#8b5cf6',
  gap: '#6b7280',
};

/** Default track colors for non-enhanced tracks (rotate through) */
const TRACK_COLOR_PALETTE = [
  '#22c55e', '#3b82f6', '#f59e0b', '#ec4899',
  '#8b5cf6', '#06b6d4', '#f97316', '#14b8a6',
];

interface DroneTrackLayerOptions {
  droneHistory: Map<string, PositionPoint[]>;
  enhancedHistory?: Map<string, EnhancedPositionPoint[]>;
  currentTime: number;
  timelineStart: number;
}

interface DroneTrackResult {
  colorMap: Map<string, string>;
  hasPositions: boolean;
}

/**
 * Render drone flight path tracks.
 */
export function renderDroneTracks(
  maps3dLib: any,
  mapEl: Map3DElementRef,
  options: DroneTrackLayerOptions,
): DroneTrackResult & { cleanup: () => void } {
  cleanupTracks(mapEl);

  const { droneHistory, enhancedHistory, currentTime, timelineStart: _timelineStart } = options;
  const colorMap = new Map<string, string>();
  let hasPositions = false;

  if (!droneHistory || droneHistory.size === 0 || !maps3dLib) {
    return { colorMap, hasPositions, cleanup: () => cleanupTracks(mapEl) };
  }

  const { Polyline3DElement } = maps3dLib;
  let colorIdx = 0;

  for (const [trackerId, positions] of droneHistory) {
    // Filter positions up to currentTime
    const visiblePositions = positions.filter(p => p.timestamp <= currentTime);
    if (visiblePositions.length < 2) continue;

    hasPositions = true;
    const trackColor = TRACK_COLOR_PALETTE[colorIdx % TRACK_COLOR_PALETTE.length];
    colorMap.set(trackerId, trackColor);
    colorIdx++;

    // Check if we have enhanced history with quality data
    const enhanced = enhancedHistory?.get(trackerId);
    if (enhanced && enhanced.length >= 2) {
      // Render quality-colored segments
      renderQualitySegments(Polyline3DElement, mapEl, trackerId, enhanced, currentTime);
    } else {
      // Single-color polyline for the entire track
      const coords = visiblePositions.map(p => ({
        lat: p.lat,
        lng: p.lon,
        altitude: p.alt_m ?? 50,
      }));

      const polyline = new Polyline3DElement();
      polyline.setAttribute('data-layer', TRACK_TAG);
      polyline.setAttribute('data-drone-id', trackerId);
      polyline.coordinates = coords;
      polyline.altitudeMode = 'RELATIVE_TO_MESH';
      polyline.strokeColor = trackColor;
      polyline.strokeWidth = 3;
      polyline.outerColor = '#000000';
      polyline.outerWidth = 5;
      mapEl.append(polyline);
    }
  }

  return { colorMap, hasPositions, cleanup: () => cleanupTracks(mapEl) };
}

/**
 * Render quality-colored track segments for enhanced history.
 * Each quality transition creates a new polyline with the appropriate color.
 */
function renderQualitySegments(
  Polyline3DElement: any,
  mapEl: Map3DElementRef,
  trackerId: string,
  enhanced: EnhancedPositionPoint[],
  currentTime: number,
): void {
  const visible = enhanced.filter(p => p.timestamp_ms <= currentTime);
  if (visible.length < 2) return;

  // Group consecutive points by quality
  let segStart = 0;
  for (let i = 1; i <= visible.length; i++) {
    const currentQuality = visible[segStart].quality;
    const nextQuality = i < visible.length ? visible[i].quality : null;

    if (nextQuality !== currentQuality || i === visible.length) {
      // End of segment — render if 2+ points
      const segPoints = visible.slice(segStart, i + (i < visible.length ? 1 : 0));
      if (segPoints.length >= 2) {
        const color = QUALITY_COLORS[currentQuality] ?? QUALITY_COLORS.good;
        const coords = segPoints.map(p => ({
          lat: p.lat,
          lng: p.lon,
          altitude: p.alt_m ?? 50,
        }));

        const polyline = new Polyline3DElement();
        polyline.setAttribute('data-layer', TRACK_TAG);
        polyline.setAttribute('data-drone-id', trackerId);
        polyline.coordinates = coords;
        polyline.altitudeMode = 'RELATIVE_TO_MESH';
        polyline.strokeColor = color;
        polyline.strokeWidth = 3;
        polyline.outerColor = '#000000';
        polyline.outerWidth = 5;
        mapEl.append(polyline);
      }

      segStart = i;
    }
  }
}

function cleanupTracks(mapEl: Map3DElementRef): void {
  if (!mapEl) return;
  const existing = mapEl.querySelectorAll(`[data-layer="${TRACK_TAG}"]`);
  existing.forEach((el: Element) => el.remove());
}
