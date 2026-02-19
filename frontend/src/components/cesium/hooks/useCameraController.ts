/**
 * useCameraController — Manages camera initialization, fly-to, reset, and state tracking.
 * Merges logic from CesiumMap.tsx and Site3DViewer.tsx camera handling.
 */

import { useEffect, useRef, useCallback } from 'react';
import type { CesiumModule, CesiumViewer } from '../types';
import type { SiteDefinition, CameraState3D } from '../../../types/workflow';
import type { DroneSummary } from '../../../types/drone';

interface UseCameraControllerOptions {
  cesiumRef: React.MutableRefObject<CesiumModule>;
  viewerRef: React.MutableRefObject<CesiumViewer>;
  cesiumLoaded: boolean;
  site?: SiteDefinition | null;
  initialCameraState?: CameraState3D;
  selectedDroneId?: string | null;
  currentDroneData?: Map<string, DroneSummary>;
  onCameraStateChange?: (state: CameraState3D) => void;
  onReady?: () => void;
  getCameraState: () => CameraState3D | null;
  hasEntities?: boolean;
}

export function useCameraController(options: UseCameraControllerOptions) {
  const {
    cesiumRef,
    viewerRef,
    cesiumLoaded,
    site,
    initialCameraState,
    selectedDroneId,
    currentDroneData,
    onCameraStateChange,
    onReady,
    getCameraState,
    hasEntities = false,
  } = options;

  const initialFlyDone = useRef(false);
  const prevSiteIdRef = useRef<string | null>(null);
  const cameraListenerRef = useRef<any>(null);

  // Initial camera positioning — runs once when Cesium loads or site changes
  useEffect(() => {
    if (!cesiumLoaded || !viewerRef.current || !cesiumRef.current) return;

    const siteChanged = prevSiteIdRef.current !== null && prevSiteIdRef.current !== site?.id;
    if (initialFlyDone.current && !siteChanged) return;

    prevSiteIdRef.current = site?.id ?? null;
    initialFlyDone.current = true;

    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;

    // Priority 1: Saved camera state (not on site change)
    if (initialCameraState && !siteChanged) {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          initialCameraState.longitude,
          initialCameraState.latitude,
          initialCameraState.height,
        ),
        orientation: {
          heading: Cesium.Math.toRadians(initialCameraState.heading),
          pitch: Cesium.Math.toRadians(initialCameraState.pitch),
          roll: Cesium.Math.toRadians(initialCameraState.roll),
        },
        duration: 2,
        complete: () => onReady?.(),
      });
      return;
    }

    // Priority 2: Fit to site boundary
    if (site?.boundary_polygon && site.boundary_polygon.length >= 3) {
      let minLat = Infinity, maxLat = -Infinity;
      let minLon = Infinity, maxLon = -Infinity;
      for (const p of site.boundary_polygon) {
        if (p.lat < minLat) minLat = p.lat;
        if (p.lat > maxLat) maxLat = p.lat;
        if (p.lon < minLon) minLon = p.lon;
        if (p.lon > maxLon) maxLon = p.lon;
      }

      const centerLat = (minLat + maxLat) / 2;
      const centerLon = (minLon + maxLon) / 2;
      const latExtent = (maxLat - minLat) * 111320;
      const lonExtent = (maxLon - minLon) * 111320 * Math.cos((centerLat * Math.PI) / 180);
      const maxExtent = Math.max(latExtent, lonExtent, 200);
      const cameraHeight = maxExtent * 1.5;

      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, cameraHeight),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-45),
          roll: 0,
        },
        duration: 2.0,
        complete: () => onReady?.(),
      });
      return;
    }

    // Priority 3: Site center fallback
    if (site?.center) {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          site.center.lon,
          site.center.lat,
          5000,
        ),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-45),
          roll: 0,
        },
        duration: 2.0,
        complete: () => onReady?.(),
      });
      return;
    }

    // Priority 4: Zoom to entities if available
    if (hasEntities) {
      viewer.zoomTo(viewer.entities);
    }

    onReady?.();
  }, [cesiumLoaded, site, initialCameraState, onReady]);

  // Fly to selected drone
  useEffect(() => {
    if (!cesiumLoaded || !viewerRef.current || !cesiumRef.current || !selectedDroneId) return;

    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;

    const droneData = currentDroneData?.get(selectedDroneId);
    if (droneData?.lat && droneData?.lon) {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          droneData.lon,
          droneData.lat,
          (droneData.alt_m || 100) + 500,
        ),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-45),
          roll: 0,
        },
        duration: 1.5,
      });
    }
  }, [cesiumLoaded, selectedDroneId]);

  // Camera state change listener
  useEffect(() => {
    if (!cesiumLoaded || !viewerRef.current || !onCameraStateChange) return;
    const viewer = viewerRef.current;

    // Remove previous listener
    if (cameraListenerRef.current) {
      cameraListenerRef.current();
      cameraListenerRef.current = null;
    }

    const listener = viewer.camera.moveEnd.addEventListener(() => {
      const state = getCameraState();
      if (state) onCameraStateChange(state);
    });

    cameraListenerRef.current = listener;

    return () => {
      if (cameraListenerRef.current) {
        cameraListenerRef.current();
        cameraListenerRef.current = null;
      }
    };
  }, [cesiumLoaded, onCameraStateChange, getCameraState]);

  // Reset camera handler
  const handleResetCamera = useCallback(() => {
    if (!viewerRef.current || !cesiumRef.current) return;
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;

    if (site?.center) {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          site.center.lon,
          site.center.lat,
          5000,
        ),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-45),
          roll: 0,
        },
        duration: 1.0,
      });
    } else {
      viewer.zoomTo(viewer.entities);
    }
  }, [site]);

  return { handleResetCamera };
}
