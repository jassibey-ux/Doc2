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

    let engColor: any;
    let lineWidth: number;
    let dashLen: number;
    if (g.isJamming) {
      engColor = Cesium.Color.RED.withAlpha(0.9);
      lineWidth = 3;
      dashLen = 8.0;
    } else {
      engColor = Cesium.Color.CYAN.withAlpha(0.8);
      lineWidth = 2;
      dashLen = 16.0;
    }

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
          fillColor: g.isJamming ? Cesium.Color.RED : Cesium.Color.CYAN,
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
