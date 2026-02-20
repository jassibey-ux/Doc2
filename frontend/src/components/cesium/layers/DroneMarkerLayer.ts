/**
 * DroneMarkerLayer — Renders current-position markers with altitude poles.
 * Extracted from CesiumMap.tsx lines 522-598.
 */

import type { PositionPoint, DroneSummary } from '../../../types/drone';
import type { DroneProfile } from '../../../types/workflow';
import type { CesiumModule, CesiumViewer } from '../types';
import { getDroneModel } from '../../../utils/modelRegistry';
import { isModelCached, createModelGraphicsOptions, createModelOrientation } from '../../../utils/modelLoader';
import { createDroneDataUri } from '../utils/svgDataUris';
import { computePitch, computeRoll } from '../../../utils/flightDynamics';
import { bearing } from '../../../utils/geo';

export interface DroneMarkerLayerOptions {
  droneHistory: Map<string, PositionPoint[]>;
  currentTime: number;
  timelineStart: number;
  currentDroneData?: Map<string, DroneSummary>;
  selectedDroneId?: string | null;
  droneProfiles?: DroneProfile[];
  droneProfileMap?: Map<string, DroneProfile>;
  showLabels?: boolean;
  /** Map of trackerId → track color (from DroneTrackLayer) */
  colorMap: Map<string, string>;
}

export function renderDroneMarkers(
  Cesium: CesiumModule,
  viewer: CesiumViewer,
  options: DroneMarkerLayerOptions,
): void {
  const {
    droneHistory,
    currentTime,
    timelineStart,
    currentDroneData,
    selectedDroneId,
    droneProfiles,
    droneProfileMap,
    showLabels = true,
    colorMap,
  } = options;

  for (const [trackerId, positions] of droneHistory) {
    const baseColor = colorMap.get(trackerId) || '#00c8ff';

    const filtered = positions.filter(
      (p) => p.timestamp >= timelineStart && p.timestamp <= currentTime
    );
    const displayPositions = filtered.length >= 2 ? filtered : positions;
    if (displayPositions.length < 1) continue;

    const lastPos = displayPositions[displayPositions.length - 1];
    const altitude = lastPos.alt_m || 0;
    const isSelected = selectedDroneId === trackerId;
    const markerSize = isSelected ? 14 : 10;

    // Altitude pole (vertical line from ground to drone)
    if (altitude > 5) {
      viewer.entities.add({
        name: `drone_${trackerId}_pole`,
        polyline: {
          positions: [
            Cesium.Cartesian3.fromDegrees(lastPos.lon, lastPos.lat, 0),
            Cesium.Cartesian3.fromDegrees(lastPos.lon, lastPos.lat, altitude),
          ],
          width: 1,
          material: Cesium.Color.fromCssColorString(baseColor).withAlpha(0.4),
        },
      });
    }

    // Try to find a matching drone profile for 3D model
    const droneProfile = droneProfileMap?.get(trackerId) ?? droneProfiles?.find(dp => dp.id === trackerId);
    const droneModelAsset = droneProfile ? getDroneModel(droneProfile) : null;
    const droneGlbExists = droneModelAsset ? isModelCached(droneModelAsset.glbPath) === true : false;
    const droneHeading = currentDroneData?.get(trackerId)?.heading_deg ?? 0;
    const droneColor = Cesium.Color.fromCssColorString(baseColor);

    const droneMarkerEntity: any = {
      name: `drone_${trackerId}_marker`,
      position: Cesium.Cartesian3.fromDegrees(lastPos.lon, lastPos.lat, altitude + 2),
      label: showLabels ? {
        text: `${trackerId}\n${altitude.toFixed(0)}m`,
        font: isSelected ? 'bold 12px monospace' : '11px monospace',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -(markerSize + 4)),
        showBackground: isSelected,
        backgroundColor: droneColor.withAlpha(0.7),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      } : undefined,
    };

    if (droneModelAsset && droneGlbExists) {
      // Compute pitch/roll from recent positions
      let pitchDeg = 0;
      let rollDeg = 0;
      if (displayPositions.length >= 2) {
        const prev = displayPositions.length >= 3
          ? displayPositions[displayPositions.length - 3]
          : displayPositions[displayPositions.length - 2];
        const curr = displayPositions[displayPositions.length - 1];
        const dtSec = (curr.timestamp - prev.timestamp) / 1000;
        if (dtSec > 0) {
          const speedMps = currentDroneData?.get(trackerId)?.speed_mps ?? 0;
          pitchDeg = computePitch(speedMps, speedMps, dtSec);

          const prevHeading = bearing(prev.lat, prev.lon, curr.lat, curr.lon);
          rollDeg = computeRoll(droneHeading, prevHeading, dtSec);
        }
      }

      droneMarkerEntity.model = new Cesium.ModelGraphics(
        createModelGraphicsOptions(Cesium, droneModelAsset, droneHeading, isSelected)
      );
      droneMarkerEntity.orientation = createModelOrientation(
        Cesium, lastPos.lon, lastPos.lat, altitude + 2 + (droneModelAsset.heightOffset ?? 0),
        droneHeading, pitchDeg, rollDeg,
      );
    } else {
      droneMarkerEntity.ellipsoid = {
        radii: new Cesium.Cartesian3(1.5, 1.5, 0.5),
        material: droneColor.withAlpha(0.9),
        outline: true,
        outlineColor: isSelected ? Cesium.Color.WHITE : droneColor,
        outlineWidth: isSelected ? 2 : 1,
        heightReference: Cesium.HeightReference.NONE,
      };
      droneMarkerEntity.billboard = {
        image: createDroneDataUri(baseColor, isSelected),
        width: markerSize * 2,
        height: markerSize * 2,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      };
    }

    viewer.entities.add(droneMarkerEntity);
  }
}
