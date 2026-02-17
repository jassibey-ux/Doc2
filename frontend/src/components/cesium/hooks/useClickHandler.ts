/**
 * useClickHandler — Handles drone/CUAS entity click + click-to-place CUAS.
 * Merges logic from CesiumMap.tsx lines 137-152 and Site3DViewer.tsx lines 477-527.
 */

import { useEffect, useRef } from 'react';
import type { CesiumModule, CesiumViewer, ViewerMode } from '../types';

interface UseClickHandlerOptions {
  cesiumRef: React.MutableRefObject<CesiumModule>;
  viewerRef: React.MutableRefObject<CesiumViewer>;
  cesiumLoaded: boolean;
  mode: ViewerMode;
  onDroneClick?: (droneId: string) => void;
  onCuasClick?: (cuasPlacementId: string) => void;
  onCuasPlaced?: (position: { lat: number; lon: number; alt_m: number }) => void;
}

export function useClickHandler(options: UseClickHandlerOptions) {
  const {
    cesiumRef,
    viewerRef,
    cesiumLoaded,
    mode,
    onDroneClick,
    onCuasClick,
    onCuasPlaced,
  } = options;

  const entityHandlerRef = useRef<any>(null);
  const placeHandlerRef = useRef<any>(null);

  // Entity click handler (drone/CUAS selection) — active in all modes except setup
  useEffect(() => {
    if (!cesiumLoaded || !viewerRef.current || !cesiumRef.current) return;
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;

    // Clean up previous handler
    if (entityHandlerRef.current) {
      entityHandlerRef.current.destroy();
      entityHandlerRef.current = null;
    }

    if (mode === 'setup') return; // setup mode uses place handler instead

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click: any) => {
      const pickedObject = viewer.scene.pick(click.position);
      if (Cesium.defined(pickedObject) && pickedObject.id) {
        const entity = pickedObject.id;
        const name = entity.name || '';
        if (name.startsWith('drone_') && onDroneClick) {
          const droneId = name.replace('drone_', '').replace('_marker', '').replace('_track', '');
          onDroneClick(droneId);
        } else if (name.startsWith('cuas_') && onCuasClick) {
          const placementId = entity.description?.getValue?.() || '';
          if (placementId) onCuasClick(placementId);
        }
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    entityHandlerRef.current = handler;

    return () => {
      if (entityHandlerRef.current) {
        entityHandlerRef.current.destroy();
        entityHandlerRef.current = null;
      }
    };
  }, [cesiumLoaded, mode, onDroneClick, onCuasClick]);

  // Click-to-place CUAS handler — active only in setup mode with onCuasPlaced
  useEffect(() => {
    if (!cesiumLoaded || !viewerRef.current || !cesiumRef.current) return;
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;

    // Clean up previous handler
    if (placeHandlerRef.current) {
      placeHandlerRef.current.destroy();
      placeHandlerRef.current = null;
    }

    if (mode !== 'setup' || !onCuasPlaced) return;

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click: any) => {
      // Try scene.pick first — hits 3D Tiles/buildings (rooftop-aware)
      const pickedObject = viewer.scene.pick(click.position);
      let cartesian: any = null;

      if (Cesium.defined(pickedObject)) {
        cartesian = viewer.scene.pickPosition(click.position);
      }

      // Fallback: pick the globe terrain
      if (!cartesian) {
        const ray = viewer.camera.getPickRay(click.position);
        if (ray) {
          cartesian = viewer.scene.globe.pick(ray, viewer.scene);
        }
      }

      if (!cartesian) return;

      const carto = Cesium.Cartographic.fromCartesian(cartesian);
      const lat = Cesium.Math.toDegrees(carto.latitude);
      const lon = Cesium.Math.toDegrees(carto.longitude);
      const alt_m = carto.height;

      onCuasPlaced({ lat, lon, alt_m });
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    placeHandlerRef.current = handler;

    return () => {
      if (placeHandlerRef.current) {
        placeHandlerRef.current.destroy();
        placeHandlerRef.current = null;
      }
    };
  }, [cesiumLoaded, mode, onCuasPlaced]);
}
