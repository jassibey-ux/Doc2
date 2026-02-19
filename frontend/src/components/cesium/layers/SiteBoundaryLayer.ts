/**
 * SiteBoundaryLayer — Renders site boundary polygon + dashed outline.
 * Extracted from CesiumMap.tsx lines 266-301.
 */

import type { SiteDefinition } from '../../../types/workflow';
import type { CesiumModule, CesiumViewer } from '../types';

export function renderSiteBoundary(
  Cesium: CesiumModule,
  viewer: CesiumViewer,
  site: SiteDefinition | null | undefined,
): void {
  if (!site?.boundary_polygon || site.boundary_polygon.length < 3) return;

  const boundaryPositions = site.boundary_polygon.map((p) =>
    Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 0)
  );
  // Close the polygon
  boundaryPositions.push(boundaryPositions[0]);

  // Filled polygon
  viewer.entities.add({
    name: 'site_boundary',
    polygon: {
      hierarchy: new Cesium.PolygonHierarchy(
        site.boundary_polygon.map((p) => Cesium.Cartesian3.fromDegrees(p.lon, p.lat))
      ),
      material: Cesium.Color.ORANGE.withAlpha(0.1),
      outline: true,
      outlineColor: Cesium.Color.ORANGE.withAlpha(0.8),
      outlineWidth: 2,
      height: 0,
      classificationType: Cesium.ClassificationType.BOTH,
    },
  });

  // Dashed boundary outline for visibility on terrain
  viewer.entities.add({
    name: 'site_boundary_outline',
    polyline: {
      positions: boundaryPositions,
      width: 2,
      material: new Cesium.PolylineDashMaterialProperty({
        color: Cesium.Color.ORANGE.withAlpha(0.8),
        dashLength: 16.0,
      }),
      clampToGround: true,
    },
  });
}
