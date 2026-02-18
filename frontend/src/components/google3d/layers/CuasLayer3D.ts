/**
 * CuasLayer3D — CUAS equipment markers on Google 3D Map.
 *
 * Renders each CUAS placement as:
 * - Marker3DInteractiveElement with label and icon
 * - Coverage circle polygon (from effective_range_m)
 * - Optional jam state coloring (green=idle, red=jamming)
 */

import circle from '@turf/circle';
import type { CUASPlacement, CUASProfile } from '../../../types/workflow';
import type { Map3DElementRef } from '../hooks/useGoogle3DMap';
import { attachCuasClickHandler } from '../hooks/useGoogle3DClickHandler';

const CUAS_TAG = 'cuas-layer';

interface CuasLayerOptions {
  cuasPlacements: CUASPlacement[];
  cuasProfiles?: CUASProfile[];
  cuasJamStates?: Map<string, boolean>;
  engagementModeCuasId?: string | null;
  showLabels?: boolean;
  onCuasClick?: (cuasPlacementId: string) => void;
}

/** CUAS type to color mapping */
const CUAS_COLORS: Record<string, string> = {
  jammer: '#ef4444',
  rf_sensor: '#3b82f6',
  radar: '#f59e0b',
  eo_ir_camera: '#8b5cf6',
  acoustic: '#22c55e',
  combined: '#ec4899',
};

/**
 * Render CUAS placements on the map.
 */
export function renderCuasLayer(
  maps3dLib: any,
  mapEl: Map3DElementRef,
  options: CuasLayerOptions,
): () => void {
  cleanupCuasLayer(mapEl);

  const {
    cuasPlacements,
    cuasProfiles,
    cuasJamStates,
    engagementModeCuasId,
    showLabels = true,
    onCuasClick,
  } = options;

  if (!cuasPlacements || cuasPlacements.length === 0 || !maps3dLib) {
    return () => cleanupCuasLayer(mapEl);
  }

  const { Marker3DInteractiveElement, Polygon3DElement } = maps3dLib;

  // Build profile lookup
  const profileMap = new Map<string, CUASProfile>();
  cuasProfiles?.forEach(p => profileMap.set(p.id, p));

  for (const placement of cuasPlacements) {
    if (!placement.position?.lat || !placement.position?.lon) continue;

    const profile = profileMap.get(placement.cuas_profile_id);
    const isJamming = cuasJamStates?.get(placement.id) ?? false;
    const isEngagementTarget = engagementModeCuasId === placement.id;
    const cuasType = profile?.type ?? 'combined';
    const baseColor = CUAS_COLORS[cuasType] ?? '#888888';

    // Marker color: red if jamming, base color otherwise, bright if engagement target
    const markerColor = isJamming ? '#ef4444' : isEngagementTarget ? '#fbbf24' : baseColor;

    // Create marker
    const marker = new Marker3DInteractiveElement();
    marker.setAttribute('data-layer', CUAS_TAG);
    marker.setAttribute('data-cuas-id', placement.id);
    marker.position = {
      lat: placement.position.lat,
      lng: placement.position.lon,
      altitude: placement.height_agl_m ?? 2,
    };
    marker.altitudeMode = 'RELATIVE_TO_GROUND';
    marker.extruded = true;
    marker.drawsWhenOccluded = true;
    marker.collisionBehavior = 'OPTIONAL_AND_HIDES_LOWER_PRIORITY';

    // Label via title attribute
    if (showLabels) {
      const label = profile?.name ?? `CUAS ${placement.id.slice(0, 6)}`;
      marker.title = label;
    }

    // Click handler
    attachCuasClickHandler(marker, placement.id, onCuasClick);

    // Create a PinElement for the marker glyph
    try {
      const pin = new (window as any).google.maps.marker.PinElement({
        background: markerColor,
        borderColor: isJamming ? '#991b1b' : '#333',
        glyphColor: '#fff',
        scale: isEngagementTarget ? 1.4 : 1.0,
      });
      marker.append(pin);
    } catch {
      // PinElement may not be available; marker renders with default style
    }

    mapEl.append(marker);

    // Coverage circle polygon
    if (profile?.effective_range_m && profile.effective_range_m > 0) {
      const radiusKm = profile.effective_range_m / 1000;
      const circleGeoJSON = circle(
        [placement.position.lon, placement.position.lat],
        radiusKm,
        { units: 'kilometers', steps: 48 },
      );

      const ring = circleGeoJSON.geometry.coordinates[0];
      const polygon = new Polygon3DElement();
      polygon.setAttribute('data-layer', CUAS_TAG);
      polygon.outerCoordinates = ring.map(([lng, lat]: number[]) => ({
        lat,
        lng,
        altitude: placement.height_agl_m ?? 2,
      }));
      polygon.altitudeMode = 'RELATIVE_TO_GROUND';
      polygon.fillColor = isJamming
        ? 'rgba(239, 68, 68, 0.12)'
        : `${baseColor}1a`; // Add low alpha hex
      polygon.strokeColor = isJamming ? '#ef4444' : baseColor;
      polygon.strokeWidth = 1;
      polygon.extruded = false;
      mapEl.append(polygon);
    }
  }

  return () => cleanupCuasLayer(mapEl);
}

function cleanupCuasLayer(mapEl: Map3DElementRef): void {
  if (!mapEl) return;
  const existing = mapEl.querySelectorAll(`[data-layer="${CUAS_TAG}"]`);
  existing.forEach((el: Element) => el.remove());
}
