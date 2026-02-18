/**
 * useGoogle3DMap — Initializes a Google Maps 3D map element.
 *
 * Uses @vis.gl/react-google-maps to load the Maps JavaScript API,
 * then imperatively creates and configures a gmp-map-3d element.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import type { SiteDefinition, CameraState3D } from '../../../types/workflow';
import { cesiumToGoogle3DCamera } from '../types';
import { useApiUsageSafe } from '../../../contexts/ApiUsageContext';

/** Ref to the gmp-map-3d element (typed as any since Google types may lag) */
export type Map3DElementRef = any;

interface UseGoogle3DMapOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  site?: SiteDefinition | null;
  initialCameraState?: CameraState3D;
  mode?: string;
}

interface UseGoogle3DMapReturn {
  mapRef: React.MutableRefObject<Map3DElementRef | null>;
  maps3dLib: any;
  isLoaded: boolean;
  error: string | null;
  setMapMode: (mode: 'HYBRID' | 'SATELLITE') => void;
}

export function useGoogle3DMap({
  containerRef,
  site,
  initialCameraState,
  mode: _mode,
}: UseGoogle3DMapOptions): UseGoogle3DMapReturn {
  const mapRef = useRef<Map3DElementRef | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiUsage = useApiUsageSafe();

  // Load the maps3d library via @vis.gl/react-google-maps
  const maps3dLib = useMapsLibrary('maps3d');

  // Create and attach the map element
  useEffect(() => {
    if (!maps3dLib || !containerRef.current) return;

    // Avoid double-init
    if (mapRef.current) return;

    try {
      const { Map3DElement } = maps3dLib as any;

      const mapEl = new Map3DElement();

      // Set mode (mandatory since Feb 2025)
      mapEl.mode = 'HYBRID';

      // Set initial camera position
      if (initialCameraState) {
        const cam = cesiumToGoogle3DCamera(initialCameraState);
        mapEl.center = { lat: cam.lat, lng: cam.lng, altitude: cam.altitude };
        mapEl.range = cam.range;
        mapEl.tilt = cam.tilt;
        mapEl.heading = cam.heading;
      } else if (site?.center) {
        mapEl.center = {
          lat: site.center.lat,
          lng: site.center.lon,
          altitude: site.center.alt_m ?? 0,
        };
        mapEl.range = 2000;
        mapEl.tilt = 60;
        mapEl.heading = 0;
      } else {
        // Default: overview position
        mapEl.center = { lat: 37.7749, lng: -122.4194, altitude: 0 };
        mapEl.range = 5000;
        mapEl.tilt = 50;
        mapEl.heading = 0;
      }

      // Camera bounds restriction if site has boundary
      if (site?.boundary_polygon && site.boundary_polygon.length >= 3) {
        const lats = site.boundary_polygon.map(p => p.lat);
        const lons = site.boundary_polygon.map(p => p.lon);
        const padding = 0.005; // ~500m padding
        mapEl.bounds = {
          north: Math.max(...lats) + padding,
          south: Math.min(...lats) - padding,
          east: Math.max(...lons) + padding,
          west: Math.min(...lons) - padding,
        };
        mapEl.minAltitude = 0;
        mapEl.maxAltitude = 10000;
        mapEl.minTilt = 0;
      }

      // Style the map to fill container
      mapEl.style.width = '100%';
      mapEl.style.height = '100%';
      mapEl.style.display = 'block';

      containerRef.current.appendChild(mapEl);
      mapRef.current = mapEl;

      // Wait for map to be ready
      const onReady = () => {
        setIsLoaded(true);
      };

      // gmp-map-3d fires 'gmp-animationend' on initial load, but there's no
      // explicit 'ready' event. Use a short delay after append as a pragmatic approach.
      // The map renders progressively, so this is sufficient for our purposes.
      requestAnimationFrame(() => {
        setTimeout(() => {
          onReady();
          apiUsage?.recordMapInit();
        }, 500);
      });
    } catch (err) {
      setError(`Failed to initialize Google 3D Map: ${err}`);
    }

    return () => {
      // Cleanup: remove map element
      if (mapRef.current && containerRef.current) {
        try {
          containerRef.current.removeChild(mapRef.current);
        } catch {
          // Element may have already been removed
        }
        mapRef.current = null;
        setIsLoaded(false);
      }
    };
  }, [maps3dLib]); // Only re-run when library loads, not on prop changes

  const setMapMode = useCallback((mode: 'HYBRID' | 'SATELLITE') => {
    if (mapRef.current) {
      mapRef.current.mode = mode;
    }
  }, []);

  return { mapRef, maps3dLib, isLoaded, error, setMapMode };
}

/**
 * Get current camera state from a Map3DElement.
 */
export function getGoogle3DCameraState(mapEl: Map3DElementRef): CameraState3D | null {
  if (!mapEl) return null;
  try {
    const center = mapEl.center;
    return {
      latitude: center?.lat ?? 0,
      longitude: center?.lng ?? 0,
      height: center?.altitude ?? 0,
      heading: mapEl.heading ?? 0,
      pitch: (mapEl.tilt ?? 0) - 90, // Google tilt → Cesium pitch
      roll: 0,
    };
  } catch {
    return null;
  }
}
