/**
 * EngagementLayer — Renders engagement lines + distance labels.
 * Extracted from CesiumMap.tsx lines 600-664.
 */

import type { Engagement, JamBurst, CUASPlacement } from '../../../types/workflow';
import type { DroneSummary } from '../../../types/drone';
import type { CesiumModule, CesiumViewer } from '../types';
import { computeEngagementGeometries } from '../../../utils/engagementGeometry';

export interface EngagementLayerOptions {
  engagements: Engagement[];
  activeBursts?: Map<string, JamBurst>;
  cuasPlacements: CUASPlacement[];
  currentDroneData: Map<string, DroneSummary>;
  showLabels?: boolean;
}

export function renderEngagementLayer(
  Cesium: CesiumModule,
  viewer: CesiumViewer,
  options: EngagementLayerOptions,
): void {
  const {
    engagements,
    activeBursts,
    cuasPlacements,
    currentDroneData,
    showLabels = true,
  } = options;

  const geometries = computeEngagementGeometries(
    engagements,
    activeBursts,
    cuasPlacements,
    currentDroneData,
  );

  for (const g of geometries) {
    const cuasPos = Cesium.Cartesian3.fromDegrees(
      g.emitterLon, g.emitterLat, g.emitterAlt + 2,
    );
    const dronePos = Cesium.Cartesian3.fromDegrees(
      g.droneLon, g.droneLat, g.droneAlt + 2,
    );

    // Color from GPS health (already computed in lineColor); jamming affects width/dash
    const hexToColor = (hex: string, alpha: number) => {
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const gr = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      return new Cesium.Color(r, gr, b, alpha);
    };
    const engColor = hexToColor(g.lineColor, g.isJamming ? 0.9 : 0.8);
    const lineWidth = g.isJamming ? 3 : 2;
    const dashLen = g.isJamming ? 8.0 : 16.0;

    viewer.entities.add({
      name: `engagement_${g.engagementId}_${g.trackerId}`,
      polyline: {
        positions: [cuasPos, dronePos],
        width: lineWidth,
        material: new Cesium.PolylineDashMaterialProperty({
          color: engColor,
          dashLength: dashLen,
        }),
      },
    });

    // Distance + bearing label at midpoint
    if (showLabels) {
      const midAlt = (g.emitterAlt + g.droneAlt) / 2;
      viewer.entities.add({
        name: `engagement_dist_${g.engagementId}_${g.trackerId}`,
        position: Cesium.Cartesian3.fromDegrees(
          g.midpoint.lon, g.midpoint.lat, midAlt + 10,
        ),
        label: {
          text: g.distanceLabel,
          font: '10px monospace',
          fillColor: hexToColor(g.lineColor, 1.0),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          showBackground: true,
          backgroundColor: Cesium.Color.BLACK.withAlpha(0.6),
        },
      });
    }
  }
}
