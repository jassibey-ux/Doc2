/**
 * useCesiumViewer — Lazy-load CesiumJS module and create/destroy Viewer instance.
 *
 * Returns { viewerRef, cesiumRef, cesiumLoaded, error, containerRef }
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import type { CesiumViewer, CesiumModule } from '../types';
import { precheckAllModels } from '../../../utils/modelLoader';

const CESIUM_TOKEN = import.meta.env.VITE_CESIUM_TOKEN || '';

export function useCesiumViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<CesiumViewer>(null);
  const cesiumRef = useRef<CesiumModule>(null);
  const [cesiumLoaded, setCesiumLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let destroyed = false;

    const loadCesium = async () => {
      try {
        const Cesium = await import('cesium');
        if (destroyed) return;

        cesiumRef.current = Cesium;
        // @ts-ignore — required for Cesium widget CSS resolution
        window.Cesium = Cesium;

        if (CESIUM_TOKEN) {
          Cesium.Ion.defaultAccessToken = CESIUM_TOKEN;
        }

        if (!containerRef.current) return;

        const viewer = new Cesium.Viewer(containerRef.current, {
          terrain: CESIUM_TOKEN ? Cesium.Terrain.fromWorldTerrain() : undefined,
          baseLayerPicker: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          navigationHelpButton: false,
          animation: false,
          timeline: false,
          fullscreenButton: false,
          vrButton: false,
          infoBox: false,
          selectionIndicator: false,
        });

        // Dark atmosphere
        viewer.scene.globe.enableLighting = true;
        if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true;

        viewerRef.current = viewer;
        setCesiumLoaded(true);

        // Precheck all model GLBs so render loop can use sync isModelCached()
        precheckAllModels();
      } catch (e: any) {
        if (!destroyed) {
          setError(`Failed to load CesiumJS: ${e.message}`);
        }
      }
    };

    loadCesium();

    return () => {
      destroyed = true;
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, []);

  /** Read current camera state from the Cesium viewer */
  const getCameraState = useCallback(() => {
    if (!viewerRef.current || !cesiumRef.current) return null;
    const Cesium = cesiumRef.current;
    const camera = viewerRef.current.camera;
    const carto = Cesium.Cartographic.fromCartesian(camera.positionWC);
    return {
      longitude: Cesium.Math.toDegrees(carto.longitude),
      latitude: Cesium.Math.toDegrees(carto.latitude),
      height: carto.height,
      heading: Cesium.Math.toDegrees(camera.heading),
      pitch: Cesium.Math.toDegrees(camera.pitch),
      roll: Cesium.Math.toDegrees(camera.roll),
    };
  }, []);

  return { containerRef, viewerRef, cesiumRef, cesiumLoaded, error, getCameraState };
}
