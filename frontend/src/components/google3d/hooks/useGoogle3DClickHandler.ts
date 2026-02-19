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

import { useEffect, useRef } from 'react';
import type { Map3DElementRef } from './useGoogle3DMap';
import type { ViewerMode } from '../types';

interface UseGoogle3DClickHandlerOptions {
  mapRef: React.MutableRefObject<Map3DElementRef | null>;
  isLoaded: boolean;
  mode: ViewerMode;
  onDroneClick?: (droneId: string) => void;
  onCuasClick?: (cuasPlacementId: string) => void;
  onCuasPlaced?: (position: { lat: number; lon: number; alt_m: number }) => void;
  onPlaceClick?: (place: { displayName: string; types: string[]; formattedAddress?: string }) => void;
  /** When true, suppress map click handling (e.g., during boundary drawing) */
  suppressClicks?: boolean;
}

export function useGoogle3DClickHandler({
  mapRef,
  isLoaded,
  mode,
  onDroneClick: _onDroneClick,
  onCuasClick: _onCuasClick,
  onCuasPlaced,
  onPlaceClick,
  suppressClicks,
}: UseGoogle3DClickHandlerOptions) {
  const suppressRef = useRef(false);
  suppressRef.current = !!suppressClicks;

  // Map click handler — click-to-place in setup mode
  useEffect(() => {
    const mapEl = mapRef.current;
    if (!mapEl || !isLoaded) return;

    const handleMapClick = (event: any) => {
      // Skip if clicks are suppressed (e.g., boundary drawing is active)
      if (suppressRef.current) return;

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

  // Place click handler — gmp-placeclick for event mode
  useEffect(() => {
    const mapEl = mapRef.current;
    if (!mapEl || !isLoaded || mode !== 'event' || !onPlaceClick) return;

    const handlePlaceClick = async (event: any) => {
      try {
        const place = event?.place;
        if (!place) return;

        // Fetch basic fields only ($5/1K calls)
        await place.fetchFields({ fields: ['displayName', 'types', 'formattedAddress'] });

        onPlaceClick({
          displayName: place.displayName || 'Unknown Place',
          types: place.types || [],
          formattedAddress: place.formattedAddress,
        });
      } catch (err) {
        console.warn('[Google3D] Place fetch failed:', err);
      }
    };

    mapEl.addEventListener('gmp-placeclick', handlePlaceClick);

    return () => {
      mapEl.removeEventListener('gmp-placeclick', handlePlaceClick);
    };
  }, [isLoaded, mode, onPlaceClick]);
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
