/**
 * SiteZoneLayer3D — Renders site zones as colored polygons on Google 3D Map.
 *
 * Each zone from site.zones[] is rendered as a filled Polygon3DElement
 * with a Polyline3DElement outline. Zone color and opacity come from
 * the SiteZone definition; the outline uses the zone color at full opacity.
 */

import type { SiteDefinition } from '../../../types/workflow';
import type { Map3DElementRef } from '../hooks/useGoogle3DMap';

const ZONE_TAG = 'site-zone-layer';

/**
 * Convert a hex color string and opacity (0-1) to an rgba() string.
 */
function hexToRgba(hex: string, opacity: number): string {
  const cleaned = hex.replace('#', '');
  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Render site zone polygons on the map.
 * Returns a cleanup function to remove all zone elements.
 */
export function renderSiteZones(
  maps3dLib: any,
  mapEl: Map3DElementRef,
  site?: SiteDefinition | null,
): () => void {
  // Remove existing zone elements
  cleanupSiteZones(mapEl);

  if (!site?.zones || site.zones.length === 0 || !maps3dLib) {
    return () => cleanupSiteZones(mapEl);
  }

  const { Polygon3DElement, Polyline3DElement } = maps3dLib;

  for (const zone of site.zones) {
    if (!zone.polygon || zone.polygon.length < 3) continue;

    // Create fill polygon
    const fillPolygon = new Polygon3DElement();
    fillPolygon.setAttribute('data-layer', ZONE_TAG);
    fillPolygon.setAttribute('data-zone-id', zone.id);
    fillPolygon.outerCoordinates = zone.polygon.map(p => ({
      lat: p.lat,
      lng: p.lon,
      altitude: 1,
    }));
    fillPolygon.altitudeMode = 'RELATIVE_TO_GROUND';
    fillPolygon.fillColor = hexToRgba(zone.color, zone.opacity);
    fillPolygon.strokeColor = zone.color;
    fillPolygon.strokeWidth = 2;
    fillPolygon.extruded = false;
    mapEl.append(fillPolygon);

    // Create outline polyline — close the polygon by repeating the first point
    const outlineCoords = [
      ...zone.polygon.map(p => ({
        lat: p.lat,
        lng: p.lon,
        altitude: 2,
      })),
      {
        lat: zone.polygon[0].lat,
        lng: zone.polygon[0].lon,
        altitude: 2,
      },
    ];

    const outlinePolyline = new Polyline3DElement();
    outlinePolyline.setAttribute('data-layer', ZONE_TAG);
    outlinePolyline.setAttribute('data-zone-id', zone.id);
    outlinePolyline.coordinates = outlineCoords;
    outlinePolyline.altitudeMode = 'RELATIVE_TO_GROUND';
    outlinePolyline.strokeColor = zone.color;
    outlinePolyline.strokeWidth = 2;
    mapEl.append(outlinePolyline);
  }

  return () => cleanupSiteZones(mapEl);
}

function cleanupSiteZones(mapEl: Map3DElementRef): void {
  if (!mapEl) return;
  const existing = mapEl.querySelectorAll(`[data-layer="${ZONE_TAG}"]`);
  existing.forEach((el: Element) => el.remove());
}
