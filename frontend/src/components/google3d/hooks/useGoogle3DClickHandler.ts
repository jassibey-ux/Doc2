/**
 * useGoogle3DClickHandler — Entity picking and click-to-place on 3D mesh.
 *
 * Google 3D Maps fires gmp-click on:
 * - Map3DElement → LocationClickEvent with position (lat/lng/alt on mesh surface)
 * - Model3DInteractiveElement → gmp-click with event.target reference
 * - Marker3DInteractiveElement → gmp-click with event.target reference
 *
 * For entity picking, we tag elements with data-* attributes and read them
 * from the click target.
 */

import { useEffect } from 'react';
import type { Map3DElementRef } from './useGoogle3DMap';
import type { ViewerMode } from '../types';

interface UseGoogle3DClickHandlerOptions {
  mapRef: React.MutableRefObject<Map3DElementRef | null>;
  isLoaded: boolean;
  mode: ViewerMode;
  onDroneClick?: (droneId: string) => void;
  onCuasClick?: (cuasPlacementId: string) => void;
  onCuasPlaced?: (position: { lat: number; lon: number; alt_m: number }) => void;
}

export function useGoogle3DClickHandler({
  mapRef,
  isLoaded,
  mode,
  onDroneClick,
  onCuasClick,
  onCuasPlaced,
}: UseGoogle3DClickHandlerOptions) {

  // Map click handler — click-to-place in setup mode
  useEffect(() => {
    const mapEl = mapRef.current;
    if (!mapEl || !isLoaded) return;

    const handleMapClick = (event: any) => {
      // In setup mode, clicks on the map surface place CUAS equipment
      if (mode === 'setup' && onCuasPlaced) {
        const position = event?.position;
        if (position) {
          onCuasPlaced({
            lat: position.lat,
            lon: position.lng,
            alt_m: position.altitude ?? 0,
          });
        }
      }
    };

    mapEl.addEventListener('gmp-click', handleMapClick);

    return () => {
      mapEl.removeEventListener('gmp-click', handleMapClick);
    };
  }, [isLoaded, mode, onCuasPlaced]);
}

/**
 * Attach click handler to a drone model/marker element.
 * Called by DroneMarkerLayer3D when creating elements.
 */
export function attachDroneClickHandler(
  element: any,
  droneId: string,
  onDroneClick?: (droneId: string) => void,
): void {
  if (!onDroneClick) return;
  element.addEventListener('gmp-click', (e: any) => {
    e.stopPropagation?.();
    onDroneClick(droneId);
  });
}

/**
 * Attach click handler to a CUAS marker element.
 * Called by CuasLayer3D when creating elements.
 */
export function attachCuasClickHandler(
  element: any,
  cuasPlacementId: string,
  onCuasClick?: (cuasPlacementId: string) => void,
): void {
  if (!onCuasClick) return;
  element.addEventListener('gmp-click', (e: any) => {
    e.stopPropagation?.();
    onCuasClick(cuasPlacementId);
  });
}
