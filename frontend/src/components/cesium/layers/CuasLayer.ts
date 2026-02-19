/**
 * CuasLayer — Renders CUAS markers, coverage circles, and beam cones.
 * Extracted and unified from CesiumMap.tsx lines 303-441 and Site3DViewer.tsx lines 249-379.
 */

import type { CUASPlacement, CUASProfile } from '../../../types/workflow';
import type { CesiumModule, CesiumViewer } from '../types';
import { getCUASModel } from '../../../utils/modelRegistry';
import { isModelCached, createModelGraphicsOptions, createModelOrientation } from '../../../utils/modelLoader';
import { createCUASDataUri } from '../utils/svgDataUris';

export interface CuasLayerOptions {
  cuasPlacements: CUASPlacement[];
  cuasProfiles?: CUASProfile[];
  cuasJamStates?: Map<string, boolean>;
  engagementModeCuasId?: string | null;
  showLabels?: boolean;
}

export function renderCuasLayer(
  Cesium: CesiumModule,
  viewer: CesiumViewer,
  options: CuasLayerOptions,
): void {
  const {
    cuasPlacements,
    cuasProfiles,
    cuasJamStates,
    engagementModeCuasId,
    showLabels = true,
  } = options;

  for (const placement of cuasPlacements) {
    const isJamming = cuasJamStates?.get(placement.id);
    const profile = cuasProfiles?.find((p) => p.id === placement.cuas_profile_id);
    const effectiveRange = profile?.effective_range_m || 500;
    const placementColor = isJamming ? '#ef4444' : '#f97316';

    const isSelected = engagementModeCuasId === placement.id;
    const cuasModelAsset = profile ? getCUASModel(profile.type) : null;
    const glbExists = cuasModelAsset ? isModelCached(cuasModelAsset.glbPath) === true : false;
    const cuasAlt = (placement.height_agl_m || 0) + 2;
    const orientationDeg = placement.orientation_deg ?? 0;
    const cuasColor = Cesium.Color.fromCssColorString(placementColor);
    const isSensor = profile?.type === 'rf_sensor' || profile?.type === 'radar' || profile?.type === 'eo_ir_camera' || profile?.type === 'acoustic';

    // CUAS marker entity (description stores placement ID for click handler)
    const cuasMarkerEntity: any = {
      name: `cuas_${placement.id}`,
      description: placement.id,
      position: Cesium.Cartesian3.fromDegrees(
        placement.position.lon,
        placement.position.lat,
        cuasAlt,
      ),
      label: showLabels ? {
        text: profile?.name || 'CUAS',
        font: '11px monospace',
        fillColor: cuasColor,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -20),
      } : undefined,
    };

    if (cuasModelAsset && glbExists) {
      cuasMarkerEntity.model = new Cesium.ModelGraphics(
        createModelGraphicsOptions(Cesium, cuasModelAsset, orientationDeg, false)
      );
      cuasMarkerEntity.orientation = createModelOrientation(
        Cesium, placement.position.lon, placement.position.lat, cuasAlt, orientationDeg
      );
    } else if (isSensor) {
      cuasMarkerEntity.ellipsoid = {
        radii: new Cesium.Cartesian3(1.0, 1.0, 1.5),
        material: cuasColor.withAlpha(0.8),
        outline: true,
        outlineColor: cuasColor,
        heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
      };
      cuasMarkerEntity.billboard = {
        image: createCUASDataUri(placementColor),
        width: isSelected ? 36 : 28,
        height: isSelected ? 36 : 28,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      };
    } else {
      cuasMarkerEntity.cylinder = {
        length: 2.0,
        topRadius: 1.5,
        bottomRadius: 1.5,
        material: cuasColor.withAlpha(0.8),
        outline: true,
        outlineColor: cuasColor,
        heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
      };
      cuasMarkerEntity.billboard = {
        image: createCUASDataUri(placementColor),
        width: isSelected ? 36 : 28,
        height: isSelected ? 36 : 28,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      };
    }

    viewer.entities.add(cuasMarkerEntity);

    // Coverage circle (36 segments)
    const circlePositions: any[] = [];
    for (let deg = 0; deg <= 360; deg += 10) {
      const rad = (deg * Math.PI) / 180;
      const lat = placement.position.lat + (effectiveRange / 111320) * Math.cos(rad);
      const lon =
        placement.position.lon +
        (effectiveRange / (111320 * Math.cos((placement.position.lat * Math.PI) / 180))) *
          Math.sin(rad);
      circlePositions.push(Cesium.Cartesian3.fromDegrees(lon, lat, 0));
    }

    viewer.entities.add({
      name: `cuas_coverage_${placement.id}`,
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(circlePositions),
        material: Cesium.Color.fromCssColorString(placementColor).withAlpha(isJamming ? 0.15 : 0.05),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString(placementColor).withAlpha(0.4),
        height: 0,
      },
    });

    // Heading / beam direction cone
    if (placement.orientation_deg !== undefined && profile?.beam_width_deg) {
      const beamHalf = (profile.beam_width_deg || 60) / 2;
      const headingRad = ((placement.orientation_deg - 90) * Math.PI) / 180;
      const coneRange = effectiveRange * 0.8;

      const conePositions = [
        Cesium.Cartesian3.fromDegrees(placement.position.lon, placement.position.lat, 1),
      ];
      for (let a = -beamHalf; a <= beamHalf; a += 5) {
        const rad = headingRad + (a * Math.PI) / 180;
        const lat = placement.position.lat + (coneRange / 111320) * Math.cos(rad);
        const lon =
          placement.position.lon +
          (coneRange / (111320 * Math.cos((placement.position.lat * Math.PI) / 180))) *
            Math.sin(rad);
        conePositions.push(Cesium.Cartesian3.fromDegrees(lon, lat, 1));
      }

      viewer.entities.add({
        name: `cuas_beam_${placement.id}`,
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(conePositions),
          material: Cesium.Color.fromCssColorString(placementColor).withAlpha(isJamming ? 0.25 : 0.1),
          height: 0,
        },
      });
    }
  }
}
