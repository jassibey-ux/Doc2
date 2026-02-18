/**
 * useGoogle3DCameraController — Camera fly-to, bounds lock, state synchronization.
 *
 * Handles:
 * - Flying to a drone when selectedDroneId changes
 * - Broadcasting camera state changes to parent via onCameraStateChange
 * - Reset camera to initial position
 * - Orbit animation for demo mode
 */

import { useEffect, useCallback, useRef } from 'react';
import type { CameraState3D, SiteDefinition } from '../../../types/workflow';
import type { DroneSummary } from '../../../types/drone';
import type { Map3DElementRef } from './useGoogle3DMap';
import { getGoogle3DCameraState } from './useGoogle3DMap';
import { cesiumToGoogle3DCamera } from '../types';

/** Waypoint for guided camera tours */
export interface TourWaypoint {
  lat: number;
  lng: number;
  altitude?: number;
  range?: number;
  tilt?: number;
  heading?: number;
  durationMs?: number;
  pauseMs?: number;
}

interface UseGoogle3DCameraControllerOptions {
  mapRef: React.MutableRefObject<Map3DElementRef | null>;
  isLoaded: boolean;
  site?: SiteDefinition | null;
  initialCameraState?: CameraState3D;
  selectedDroneId?: string | null;
  currentDroneData?: Map<string, DroneSummary>;
  onCameraStateChange?: (state: CameraState3D) => void;
  onReady?: () => void;
}

export function useGoogle3DCameraController({
  mapRef,
  isLoaded,
  site,
  initialCameraState,
  selectedDroneId,
  currentDroneData,
  onCameraStateChange,
  onReady,
}: UseGoogle3DCameraControllerOptions) {
  const readyFired = useRef(false);

  // Fire onReady once when map is loaded
  useEffect(() => {
    if (isLoaded && !readyFired.current) {
      readyFired.current = true;
      onReady?.();
    }
  }, [isLoaded, onReady]);

  // Camera state change listener — debounced broadcast
  useEffect(() => {
    const mapEl = mapRef.current;
    if (!mapEl || !isLoaded || !onCameraStateChange) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const broadcastCameraState = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const state = getGoogle3DCameraState(mapEl);
        if (state) onCameraStateChange(state);
      }, 200);
    };

    // Listen to all camera change events
    const events = ['gmp-centerchange', 'gmp-tiltchange', 'gmp-headingchange', 'gmp-rangechange'];
    events.forEach(evt => mapEl.addEventListener(evt, broadcastCameraState));

    return () => {
      events.forEach(evt => mapEl.removeEventListener(evt, broadcastCameraState));
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [isLoaded, onCameraStateChange]);

  // Fly to selected drone
  useEffect(() => {
    const mapEl = mapRef.current;
    if (!mapEl || !isLoaded || !selectedDroneId || !currentDroneData) return;

    const drone = currentDroneData.get(selectedDroneId);
    if (!drone?.lat || !drone?.lon) return;

    const altitude = drone.alt_m ?? 50;

    try {
      mapEl.flyCameraTo({
        endCamera: {
          center: { lat: drone.lat, lng: drone.lon, altitude },
          range: Math.max(altitude * 3, 300),
          tilt: 65,
          heading: mapEl.heading ?? 0,
        },
        durationMillis: 1500,
      });
    } catch {
      // Fallback: set camera directly if flyCameraTo not available
      mapEl.center = { lat: drone.lat, lng: drone.lon, altitude };
      mapEl.range = Math.max(altitude * 3, 300);
      mapEl.tilt = 65;
    }
  }, [selectedDroneId, isLoaded]);

  // Reset camera to initial position
  const handleResetCamera = useCallback(() => {
    const mapEl = mapRef.current;
    if (!mapEl) return;

    if (initialCameraState) {
      const cam = cesiumToGoogle3DCamera(initialCameraState);
      try {
        mapEl.flyCameraTo({
          endCamera: {
            center: { lat: cam.lat, lng: cam.lng, altitude: cam.altitude },
            range: cam.range,
            tilt: cam.tilt,
            heading: cam.heading,
          },
          durationMillis: 2000,
        });
      } catch {
        mapEl.center = { lat: cam.lat, lng: cam.lng, altitude: cam.altitude };
        mapEl.range = cam.range;
        mapEl.tilt = cam.tilt;
        mapEl.heading = cam.heading;
      }
    } else if (site?.center) {
      try {
        mapEl.flyCameraTo({
          endCamera: {
            center: { lat: site.center.lat, lng: site.center.lon, altitude: site.center.alt_m ?? 0 },
            range: 2000,
            tilt: 60,
            heading: 0,
          },
          durationMillis: 2000,
        });
      } catch {
        mapEl.center = { lat: site.center.lat, lng: site.center.lon, altitude: site.center.alt_m ?? 0 };
        mapEl.range = 2000;
        mapEl.tilt = 60;
        mapEl.heading = 0;
      }
    }
  }, [initialCameraState, site]);

  // Demo orbit animation
  const startOrbit = useCallback((durationMs: number = 15000) => {
    const mapEl = mapRef.current;
    if (!mapEl) return;

    try {
      mapEl.flyCameraAround({
        camera: {
          center: mapEl.center,
          range: mapEl.range,
          tilt: mapEl.tilt,
          heading: mapEl.heading,
        },
        durationMillis: durationMs,
        rounds: 1,
      });
    } catch {
      // flyCameraAround not available — no-op
    }
  }, []);

  // Fly camera to specific coordinates
  const flyTo = useCallback((lat: number, lng: number, altitude: number, range?: number) => {
    const mapEl = mapRef.current;
    if (!mapEl) return;

    try {
      mapEl.flyCameraTo({
        endCamera: {
          center: { lat, lng, altitude },
          range: range ?? Math.max(altitude * 3, 500),
          tilt: 65,
          heading: mapEl.heading ?? 0,
        },
        durationMillis: 1500,
      });
    } catch {
      mapEl.center = { lat, lng, altitude };
      mapEl.range = range ?? Math.max(altitude * 3, 500);
      mapEl.tilt = 65;
    }
  }, []);

  // Guided tour state
  const tourIndexRef = useRef(-1);
  const tourWaypointsRef = useRef<TourWaypoint[]>([]);
  const tourPauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tourActiveRef = useRef(false);

  const cancelTour = useCallback(() => {
    tourActiveRef.current = false;
    tourIndexRef.current = -1;
    tourWaypointsRef.current = [];
    if (tourPauseTimerRef.current) {
      clearTimeout(tourPauseTimerRef.current);
      tourPauseTimerRef.current = null;
    }
  }, []);

  const guidedTour = useCallback((waypoints: TourWaypoint[]) => {
    const mapEl = mapRef.current;
    if (!mapEl || waypoints.length === 0) return;

    // Cancel any existing tour
    cancelTour();

    tourWaypointsRef.current = waypoints;
    tourActiveRef.current = true;

    const flyToWaypoint = (index: number) => {
      if (!tourActiveRef.current || index >= tourWaypointsRef.current.length) {
        cancelTour();
        return;
      }

      tourIndexRef.current = index;
      const wp = tourWaypointsRef.current[index];

      try {
        mapEl.flyCameraTo({
          endCamera: {
            center: { lat: wp.lat, lng: wp.lng, altitude: wp.altitude ?? 0 },
            range: wp.range ?? 1500,
            tilt: wp.tilt ?? 65,
            heading: wp.heading ?? (mapEl.heading ?? 0),
          },
          durationMillis: wp.durationMs ?? 2000,
        });
      } catch {
        // Fallback: set camera directly
        mapEl.center = { lat: wp.lat, lng: wp.lng, altitude: wp.altitude ?? 0 };
        mapEl.range = wp.range ?? 1500;
        mapEl.tilt = wp.tilt ?? 65;
        if (wp.heading !== undefined) mapEl.heading = wp.heading;
      }
    };

    // Listen for animation end to advance to next waypoint
    const handleAnimationEnd = () => {
      if (!tourActiveRef.current) return;
      const nextIndex = tourIndexRef.current + 1;
      if (nextIndex >= tourWaypointsRef.current.length) {
        cancelTour();
        mapEl.removeEventListener('gmp-animationend', handleAnimationEnd);
        return;
      }

      const currentWp = tourWaypointsRef.current[tourIndexRef.current];
      const pauseMs = currentWp?.pauseMs ?? 0;

      if (pauseMs > 0) {
        tourPauseTimerRef.current = setTimeout(() => {
          flyToWaypoint(nextIndex);
        }, pauseMs);
      } else {
        flyToWaypoint(nextIndex);
      }
    };

    mapEl.addEventListener('gmp-animationend', handleAnimationEnd);

    // Start the tour with the first waypoint
    flyToWaypoint(0);

  }, [cancelTour]);

  return { handleResetCamera, startOrbit, flyTo, guidedTour, cancelTour };
}
