/**
 * DroneTrackLayer — Renders quality-colored drone tracks.
 * Extracted from CesiumMap.tsx lines 444-520.
 */

import type { PositionPoint } from '../../../types/drone';
import type { EnhancedPositionPoint } from '../../../types/workflow';
import type { CesiumModule, CesiumViewer } from '../types';
import { QUALITY_COLORS } from '../../../utils/trackSegmentation';

// Track colors matching Map3DViewer
const TRACK_COLORS = [
  '#00c8ff', '#ff6b6b', '#4ecdc4', '#f7dc6f',
  '#bb8fce', '#58d68d', '#f8b500', '#5dade2',
];

export interface DroneTrackLayerOptions {
  droneHistory: Map<string, PositionPoint[]>;
  enhancedHistory?: Map<string, EnhancedPositionPoint[]>;
  currentTime: number;
  timelineStart: number;
}

/**
 * Renders drone track polylines. Returns the set of trackerIds that have visible positions,
 * and the color index map (trackerId → color string).
 */
export function renderDroneTracks(
  Cesium: CesiumModule,
  viewer: CesiumViewer,
  options: DroneTrackLayerOptions,
): { hasPositions: boolean; colorMap: Map<string, string> } {
  const { droneHistory, enhancedHistory, currentTime, timelineStart } = options;

  let hasPositions = false;
  let colorIndex = 0;
  const colorMap = new Map<string, string>();

  for (const [trackerId, positions] of droneHistory) {
    const baseColor = TRACK_COLORS[colorIndex % TRACK_COLORS.length];
    colorMap.set(trackerId, baseColor);
    colorIndex++;

    const filtered = positions.filter(
      (p) => p.timestamp >= timelineStart && p.timestamp <= currentTime
    );
    const displayPositions = filtered.length >= 2 ? filtered : positions;

    if (displayPositions.length < 2) continue;
    hasPositions = true;

    // Check for enhanced data for quality-colored segments
    const enhancedPoints = enhancedHistory?.get(trackerId);
    const hasEnhanced = enhancedPoints && enhancedPoints.length > 0;

    if (hasEnhanced) {
      const timeFiltered = enhancedPoints.filter(
        (p) => p.timestamp_ms >= timelineStart && p.timestamp_ms <= currentTime
      );
      const display = timeFiltered.length >= 2 ? timeFiltered : enhancedPoints;

      if (display.length >= 2) {
        // Group consecutive points by quality
        let segStart = 0;
        for (let i = 1; i <= display.length; i++) {
          const prevQ = display[i - 1].quality;
          const currQ = i < display.length ? display[i].quality : null;

          if (currQ !== prevQ || i === display.length) {
            const segPoints = display.slice(segStart, i);
            if (segPoints.length >= 2) {
              const qualityColor =
                QUALITY_COLORS[prevQ as keyof typeof QUALITY_COLORS] || baseColor;
              const cartesians = segPoints.map((p) =>
                Cesium.Cartesian3.fromDegrees(p.lon, p.lat, (p.alt_m || 0) + 1)
              );

              viewer.entities.add({
                name: `drone_${trackerId}_track`,
                polyline: {
                  positions: cartesians,
                  width: 3,
                  material:
                    prevQ === 'lost'
                      ? new Cesium.PolylineDashMaterialProperty({
                          color: Cesium.Color.fromCssColorString(qualityColor),
                          dashLength: 8.0,
                        })
                      : Cesium.Color.fromCssColorString(qualityColor),
                  clampToGround: false,
                },
              });
            }
            segStart = i;
          }
        }
      }
    } else {
      // Simple solid-color track
      const cartesians = displayPositions.map((p) =>
        Cesium.Cartesian3.fromDegrees(p.lon, p.lat, (p.alt_m || 0) + 1)
      );

      viewer.entities.add({
        name: `drone_${trackerId}_track`,
        polyline: {
          positions: cartesians,
          width: 3,
          material: Cesium.Color.fromCssColorString(baseColor),
          clampToGround: false,
        },
      });
    }
  }

  return { hasPositions, colorMap };
}
