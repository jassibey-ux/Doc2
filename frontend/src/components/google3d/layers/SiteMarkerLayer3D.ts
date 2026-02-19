/**
 * SiteMarkerLayer3D — Site markers rendered as 3D interactive markers on Google 3D Map.
 *
 * Each SiteMarker from the site definition is rendered as a Marker3DInteractiveElement
 * with a color-coded PinElement glyph based on marker type:
 *   command_post  = red
 *   launch_point  = green
 *   recovery_zone = blue
 *   observation   = yellow
 *   custom        = purple
 */

import type { SiteDefinition } from '../../../types/workflow';
import type { Map3DElementRef } from '../hooks/useGoogle3DMap';

const SITE_MARKER_TAG = 'site-marker-layer';

/** Marker type to pin color mapping */
const MARKER_TYPE_COLORS: Record<string, string> = {
  command_post: '#ef4444',
  launch_point: '#22c55e',
  recovery_zone: '#3b82f6',
  observation: '#eab308',
  custom: '#a855f7',
};

/**
 * Render site markers as 3D interactive markers on the map.
 * Returns a cleanup function to remove all site markers.
 */
export function renderSiteMarkers(
  maps3dLib: any,
  mapEl: Map3DElementRef,
  site?: SiteDefinition | null,
): () => void {
  cleanupSiteMarkers(mapEl);

  if (!site?.markers || site.markers.length === 0 || !maps3dLib) {
    return () => cleanupSiteMarkers(mapEl);
  }

  const { Marker3DInteractiveElement } = maps3dLib;

  for (const marker of site.markers) {
    if (!marker.position) continue;

    const color = MARKER_TYPE_COLORS[marker.type] ?? MARKER_TYPE_COLORS.custom;

    const markerEl = new Marker3DInteractiveElement();
    markerEl.setAttribute('data-layer', SITE_MARKER_TAG);
    markerEl.setAttribute('data-marker-id', marker.id);
    markerEl.position = {
      lat: marker.position.lat,
      lng: marker.position.lon,
      altitude: marker.position.alt_m ?? 2,
    };
    markerEl.altitudeMode = 'RELATIVE_TO_GROUND';
    markerEl.extruded = true;
    markerEl.drawsWhenOccluded = true;
    markerEl.collisionBehavior = 'OPTIONAL_AND_HIDES_LOWER_PRIORITY';
    markerEl.zIndex = 200;

    // Label
    markerEl.title = marker.name;

    // Pin styling based on marker type
    try {
      const pin = new (window as any).google.maps.marker.PinElement({
        background: color,
        borderColor: '#333',
        glyphColor: '#fff',
        scale: 1.0,
      });
      markerEl.append(pin);
    } catch {
      // PinElement not available
    }

    mapEl.append(markerEl);
  }

  return () => cleanupSiteMarkers(mapEl);
}

function cleanupSiteMarkers(mapEl: Map3DElementRef): void {
  if (!mapEl) return;
  const existing = mapEl.querySelectorAll(`[data-layer="${SITE_MARKER_TAG}"]`);
  existing.forEach((el: Element) => el.remove());
}
