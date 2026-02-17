/**
 * useTileManager — Manages Google 3D / OSM Building tile toggles + boundary clipping.
 * Merges logic from CesiumMap.tsx lines 224-251 and Site3DViewer.tsx lines 154-200.
 */

import { useEffect, useState, useCallback } from 'react';
import type { CesiumModule, CesiumViewer, TileMode } from '../types';
import type { SiteDefinition } from '../../../types/workflow';
import { createBoundaryClippingPlanes } from '../utils/clippingPlanes';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || '';

interface UseTileManagerOptions {
  cesiumRef: React.MutableRefObject<CesiumModule>;
  viewerRef: React.MutableRefObject<CesiumViewer>;
  cesiumLoaded: boolean;
  site?: SiteDefinition | null;
  initialTileMode?: TileMode;
  enableBoundaryClipping?: boolean;
}

export function useTileManager(options: UseTileManagerOptions) {
  const {
    cesiumRef,
    viewerRef,
    cesiumLoaded,
    site,
    initialTileMode,
    enableBoundaryClipping = false,
  } = options;

  // Determine initial google3D state
  const shouldAutoEnable = !!(site?.enhanced_3d && GOOGLE_MAPS_API_KEY);
  const initialGoogle3D = initialTileMode === 'google3d'
    ? !!GOOGLE_MAPS_API_KEY
    : shouldAutoEnable;

  const [google3DEnabled, setGoogle3DEnabled] = useState(initialGoogle3D);
  const [terrainEnabled, setTerrainEnabled] = useState(true);

  // Auto-enable Google 3D for enhanced sites
  useEffect(() => {
    if (site?.enhanced_3d && GOOGLE_MAPS_API_KEY && !google3DEnabled) {
      setGoogle3DEnabled(true);
    }
  }, [site?.enhanced_3d]);

  // Toggle tiles when google3DEnabled changes
  useEffect(() => {
    if (!cesiumLoaded || !viewerRef.current || !cesiumRef.current) return;
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;

    // Remove any existing tile primitives we previously added
    const primitives = viewer.scene.primitives;
    for (let i = primitives.length - 1; i >= 0; i--) {
      const p = primitives.get(i);
      if (p._cesiumGlobeViewerOsm || p._cesiumGlobeViewerGoogle) {
        primitives.remove(p);
      }
    }

    if (google3DEnabled && GOOGLE_MAPS_API_KEY) {
      (async () => {
        try {
          const tileset = await Cesium.Cesium3DTileset.fromUrl(
            `https://tile.googleapis.com/v1/3dtiles/root.json?key=${GOOGLE_MAPS_API_KEY}`
          );
          tileset._cesiumGlobeViewerGoogle = true;

          // Apply boundary clipping to restrict tile loading
          if (enableBoundaryClipping && site?.boundary_polygon) {
            const clippingPlanes = createBoundaryClippingPlanes(
              Cesium,
              site.boundary_polygon,
            );
            if (clippingPlanes) {
              tileset.clippingPlanes = clippingPlanes;
            }
          }

          viewer.scene.primitives.add(tileset);
        } catch (e) {
          console.warn('[CesiumGlobeViewer] Google 3D Tiles not available, falling back to OSM:', e);
          // Fallback to OSM
          try {
            const osmBuildings = await Cesium.createOsmBuildingsAsync();
            osmBuildings._cesiumGlobeViewerOsm = true;
            viewer.scene.primitives.add(osmBuildings);
          } catch (_) {
            // OSM also unavailable
          }
        }
      })();
    } else {
      // OSM Buildings mode
      (async () => {
        try {
          const osmBuildings = await Cesium.createOsmBuildingsAsync();
          osmBuildings._cesiumGlobeViewerOsm = true;
          viewer.scene.primitives.add(osmBuildings);
        } catch (e) {
          console.warn('[CesiumGlobeViewer] OSM Buildings not available:', e);
        }
      })();
    }
  }, [cesiumLoaded, google3DEnabled, enableBoundaryClipping, site?.boundary_polygon]);

  const toggleGoogle3D = useCallback(() => {
    setGoogle3DEnabled((v) => !v);
  }, []);

  const toggleTerrain = useCallback(() => {
    setTerrainEnabled((v) => !v);
  }, []);

  return {
    google3DEnabled,
    terrainEnabled,
    toggleGoogle3D,
    toggleTerrain,
    hasGoogleKey: !!GOOGLE_MAPS_API_KEY,
  };
}
