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
import { CUAS_MODELS } from '../../../utils/modelRegistry';
import { createModel3D } from '../utils/createModel3D';

const CUAS_TAG = 'cuas-layer';

interface CuasLayerOptions {
  cuasPlacements: CUASPlacement[];
  cuasProfiles?: CUASProfile[];
  cuasJamStates?: Map<string, boolean>;
  engagementModeCuasId?: string | null;
  selectedCuasId?: string | null;
  showLabels?: boolean;
  onCuasClick?: (cuasPlacementId: string) => void;
}

/** CUAS type to color mapping */
const CUAS_COLORS: Record<string, string> = {
  jammer: '#e040fb',
  rf_sensor: '#00bcd4',
  radar: '#009688',
  eo_ir_camera: '#26c6da',
  acoustic: '#00e5ff',
  combined: '#0097a7',
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
    selectedCuasId,
    showLabels = true,
    onCuasClick,
  } = options;

  if (!cuasPlacements || cuasPlacements.length === 0 || !maps3dLib) {
    return () => cleanupCuasLayer(mapEl);
  }

  const { Marker3DInteractiveElement, Polygon3DElement, Polyline3DElement } = maps3dLib;
  const baseUrl = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';

  // Build profile lookup
  const profileMap = new Map<string, CUASProfile>();
  cuasProfiles?.forEach(p => profileMap.set(p.id, p));

  for (const placement of cuasPlacements) {
    if (placement.position?.lat == null || placement.position?.lon == null) continue;

    const profile = profileMap.get(placement.cuas_profile_id);
    const isJamming = cuasJamStates?.get(placement.id) ?? false;
    const isEngagementTarget = engagementModeCuasId === placement.id;
    const cuasType = profile?.type ?? 'combined';
    const baseColor = CUAS_COLORS[cuasType] ?? '#888888';

    // Marker color: red if jamming, base color otherwise, bright if engagement target
    const markerColor = isJamming ? '#e040fb' : isEngagementTarget ? '#fbbf24' : baseColor;
    const isSelected = selectedCuasId === placement.id;

    // Render 3D GLB model via shared factory
    const cuasAsset = CUAS_MODELS[cuasType];
    if (cuasAsset) {
      const model = createModel3D({
        maps3dLib,
        asset: cuasAsset,
        baseUrl,
        position: {
          lat: placement.position.lat,
          lng: placement.position.lon,
          altitude: placement.height_agl_m ?? 2,
        },
        headingDeg: placement.orientation_deg ?? 0,
        tiltDeg: 0,
        isSelected,
        dataLayer: CUAS_TAG,
        dataId: { key: 'data-cuas-id', value: placement.id },
      });
      if (model) {
        attachCuasClickHandler(model, placement.id, onCuasClick);
        mapEl.append(model);
      }
    }

    // Create marker (label/fallback — always rendered alongside 3D model)
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
      const glyphEl = document.createElement('span');
      glyphEl.textContent = '\u26E8';
      glyphEl.style.fontSize = '14px';
      const pin = new (window as any).google.maps.marker.PinElement({
        background: markerColor,
        borderColor: isJamming ? '#880e4f' : '#004d40',
        glyph: glyphEl,
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
        { units: 'kilometers', steps: Math.max(64, Math.min(256, Math.ceil(radiusKm * 8))) },
      );

      const ring = circleGeoJSON.geometry.coordinates[0];
      const polygon = new Polygon3DElement();
      polygon.setAttribute('data-layer', CUAS_TAG);
      polygon.outerCoordinates = ring.map(([lng, lat]: number[]) => ({
        lat,
        lng,
        altitude: placement.height_agl_m ?? 2,
      }));
      polygon.altitudeMode = 'RELATIVE_TO_MESH';
      polygon.fillColor = isJamming
        ? 'rgba(224, 64, 251, 0.12)'
        : `${baseColor}1a`; // Add low alpha hex
      polygon.strokeColor = isJamming ? '#e040fb' : baseColor;
      polygon.strokeWidth = 1;
      polygon.extruded = false;
      mapEl.append(polygon);

      // Range rings at 25%, 50%, 75%, 100% of effective range (when CUAS is selected)
      if (isSelected || isEngagementTarget) {
        const ringPercents = [0.25, 0.5, 0.75, 1.0];
        for (const pct of ringPercents) {
          const ringRadiusKm = radiusKm * pct;
          const ringGeo = circle(
            [placement.position.lon, placement.position.lat],
            ringRadiusKm,
            { units: 'kilometers', steps: Math.max(48, Math.ceil(ringRadiusKm * 8)) },
          );
          const ringCoords = ringGeo.geometry.coordinates[0];
          const ringLine = new Polyline3DElement();
          ringLine.setAttribute('data-layer', CUAS_TAG);
          ringLine.coordinates = ringCoords.map(([lng, lat]: number[]) => ({
            lat,
            lng,
            altitude: (placement.height_agl_m ?? 2) + 1,
          }));
          ringLine.altitudeMode = 'RELATIVE_TO_MESH';
          ringLine.strokeColor = isJamming ? 'rgba(224, 64, 251, 0.4)' : `${baseColor}66`;
          ringLine.strokeWidth = 1;
          mapEl.append(ringLine);
        }
      }
    }
  }

  return () => cleanupCuasLayer(mapEl);
}

function cleanupCuasLayer(mapEl: Map3DElementRef): void {
  if (!mapEl) return;
  const existing = mapEl.querySelectorAll(`[data-layer="${CUAS_TAG}"]`);
  existing.forEach((el: Element) => el.remove());
}
