/**
 * SiteBoundaryLayer3D — Renders site boundary polygon on Google 3D Map.
 *
 * Uses Polygon3DElement with outerColor for a dashed-line-like outline effect.
 * Cesium used PolylineDashMaterial; Google 3D doesn't support dashes,
 * so we use a dual-tone border (outerColor + strokeColor) for visual distinction.
 */

import type { SiteDefinition } from '../../../types/workflow';
import type { Map3DElementRef } from '../hooks/useGoogle3DMap';

const BOUNDARY_TAG = 'site-boundary-layer';

/**
 * Render the site boundary polygon on the map.
 * Returns a cleanup function to remove the boundary.
 */
export function renderSiteBoundary(
  maps3dLib: any,
  mapEl: Map3DElementRef,
  site?: SiteDefinition | null,
): () => void {
  // Remove existing boundary elements
  cleanupSiteBoundary(mapEl);

  if (!site?.boundary_polygon || site.boundary_polygon.length < 3 || !maps3dLib) {
    return () => cleanupSiteBoundary(mapEl);
  }

  const { Polygon3DElement, Polyline3DElement } = maps3dLib;

  // Create fill polygon (semi-transparent)
  const fillPolygon = new Polygon3DElement();
  fillPolygon.setAttribute('data-layer', BOUNDARY_TAG);
  fillPolygon.outerCoordinates = site.boundary_polygon.map(p => ({
    lat: p.lat,
    lng: p.lon,
    altitude: 1, // Slight offset above ground to avoid z-fighting
  }));
  fillPolygon.altitudeMode = 'RELATIVE_TO_GROUND';
  fillPolygon.fillColor = 'rgba(59, 130, 246, 0.08)';
  fillPolygon.strokeColor = '#3b82f6';
  fillPolygon.strokeWidth = 3;
  fillPolygon.extruded = false;
  mapEl.append(fillPolygon);

  // Create outline polyline with dual-tone for visual distinction
  // Close the polygon by repeating the first point
  const outlineCoords = [
    ...site.boundary_polygon.map(p => ({
      lat: p.lat,
      lng: p.lon,
      altitude: 2,
    })),
    {
      lat: site.boundary_polygon[0].lat,
      lng: site.boundary_polygon[0].lon,
      altitude: 2,
    },
  ];

  const outlinePolyline = new Polyline3DElement();
  outlinePolyline.setAttribute('data-layer', BOUNDARY_TAG);
  outlinePolyline.coordinates = outlineCoords;
  outlinePolyline.altitudeMode = 'RELATIVE_TO_GROUND';
  outlinePolyline.strokeColor = '#60a5fa';
  outlinePolyline.strokeWidth = 2;
  outlinePolyline.outerColor = '#1e3a5f';
  outlinePolyline.outerWidth = 4;
  mapEl.append(outlinePolyline);

  return () => cleanupSiteBoundary(mapEl);
}

function cleanupSiteBoundary(mapEl: Map3DElementRef): void {
  if (!mapEl) return;
  const existing = mapEl.querySelectorAll(`[data-layer="${BOUNDARY_TAG}"]`);
  existing.forEach((el: Element) => el.remove());
}
