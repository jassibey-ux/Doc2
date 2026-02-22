/**
 * AssetLayer3D — Vehicle and equipment 3D models on Google Maps.
 *
 * Renders each AssetPlacement as a ground-level 3D model using the shared factory.
 * Uses tiltDeg: 0 for ground equipment that should sit flat.
 */

import type { AssetPlacement } from '../../../types/workflow';
import type { Map3DElementRef } from '../hooks/useGoogle3DMap';
import { VEHICLE_MODELS, EQUIPMENT_MODELS } from '../../../utils/modelRegistry';
import { createModel3D } from '../utils/createModel3D';

const ASSET_TAG = 'asset-layer';

interface AssetLayerOptions {
  assetPlacements: AssetPlacement[];
  selectedAssetId?: string | null;
}

/**
 * Render asset placements (vehicles/equipment) on the map.
 */
export function renderAssetLayer(
  maps3dLib: any,
  mapEl: Map3DElementRef,
  options: AssetLayerOptions,
): () => void {
  cleanupAssetLayer(mapEl);

  const { assetPlacements, selectedAssetId } = options;

  if (!assetPlacements || assetPlacements.length === 0 || !maps3dLib) {
    return () => cleanupAssetLayer(mapEl);
  }

  const { Marker3DInteractiveElement } = maps3dLib;
  const baseUrl = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';

  for (const placement of assetPlacements) {
    if (placement.position?.lat == null || placement.position?.lon == null) continue;

    const registry = placement.asset_type === 'vehicle' ? VEHICLE_MODELS : EQUIPMENT_MODELS;
    const asset = registry[placement.model_id];
    const isSelected = selectedAssetId === placement.id;

    // Render 3D GLB model
    if (asset) {
      const model = createModel3D({
        maps3dLib,
        asset,
        baseUrl,
        position: {
          lat: placement.position.lat,
          lng: placement.position.lon,
          altitude: 0,
        },
        headingDeg: placement.orientation_deg ?? 0,
        tiltDeg: 0, // ground models sit flat
        isSelected,
        dataLayer: ASSET_TAG,
        dataId: { key: 'data-asset-id', value: placement.id },
      });
      if (model) {
        mapEl.append(model);
      }
    }

    // Label marker
    if (Marker3DInteractiveElement) {
      const marker = new Marker3DInteractiveElement();
      marker.setAttribute('data-layer', ASSET_TAG);
      marker.setAttribute('data-asset-id', placement.id);
      marker.position = {
        lat: placement.position.lat,
        lng: placement.position.lon,
        altitude: 2,
      };
      marker.altitudeMode = 'RELATIVE_TO_GROUND';
      marker.title = placement.label;
      marker.collisionBehavior = 'OPTIONAL_AND_HIDES_LOWER_PRIORITY';

      try {
        const glyphEl = document.createElement('span');
        glyphEl.textContent = placement.asset_type === 'vehicle' ? '\u{1F697}' : '\u{1F527}';
        glyphEl.style.fontSize = '12px';
        const pin = new (window as any).google.maps.marker.PinElement({
          background: placement.asset_type === 'vehicle' ? '#3b82f6' : '#8b5cf6',
          borderColor: '#1e3a5f',
          glyph: glyphEl,
          glyphColor: '#fff',
          scale: isSelected ? 1.2 : 0.8,
        });
        marker.append(pin);
      } catch {
        // PinElement may not be available
      }

      mapEl.append(marker);
    }
  }

  return () => cleanupAssetLayer(mapEl);
}

function cleanupAssetLayer(mapEl: Map3DElementRef): void {
  if (!mapEl) return;
  const existing = mapEl.querySelectorAll(`[data-layer="${ASSET_TAG}"]`);
  existing.forEach((el: Element) => el.remove());
}
