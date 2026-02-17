/**
 * useTileManager — Manages Google 3D / OSM Building tile toggles + boundary clipping.
 * Merges logic from CesiumMap.tsx lines 224-251 and Site3DViewer.tsx lines 154-200.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import type { CesiumModule, CesiumViewer, TileMode } from '../types';
import type { SiteDefinition } from '../../../types/workflow';
import { createBoundaryClippingPlanes } from '../utils/clippingPlanes';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || '';
const IS_DEV = import.meta.env.DEV;

export interface TileStats {
  google3DTilesLoaded: number;
  google3DRequestsFailed: number;
  clippingEnabled: boolean;
  clippingPlaneCount: number;
  tileSource: 'google3d' | 'osm' | 'none';
  lastTileLoadTime: number | null;
}

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

  // Dev stats tracking
  const [tileStats, setTileStats] = useState<TileStats>({
    google3DTilesLoaded: 0,
    google3DRequestsFailed: 0,
    clippingEnabled: false,
    clippingPlaneCount: 0,
    tileSource: 'none',
    lastTileLoadTime: null,
  });
  const tileLoadListenerRef = useRef<(() => void) | null>(null);

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

    // Clean up previous tile load listener
    if (tileLoadListenerRef.current) {
      tileLoadListenerRef.current();
      tileLoadListenerRef.current = null;
    }

    if (google3DEnabled && GOOGLE_MAPS_API_KEY) {
      (async () => {
        try {
          const tileset = await Cesium.Cesium3DTileset.fromUrl(
            `https://tile.googleapis.com/v1/3dtiles/root.json?key=${GOOGLE_MAPS_API_KEY}`
          );
          tileset._cesiumGlobeViewerGoogle = true;

          let clippingPlaneCount = 0;

          // Apply boundary clipping to restrict tile loading
          if (enableBoundaryClipping && site?.boundary_polygon) {
            const clippingPlanes = createBoundaryClippingPlanes(
              Cesium,
              site.boundary_polygon,
            );
            if (clippingPlanes) {
              tileset.clippingPlanes = clippingPlanes;
              clippingPlaneCount = clippingPlanes.length || 0;
            }
          }

          // Track tile load events in dev mode
          if (IS_DEV) {
            let loadCount = 0;
            let failCount = 0;

            const onTileLoad = () => {
              loadCount++;
              setTileStats((prev) => ({
                ...prev,
                google3DTilesLoaded: loadCount,
                lastTileLoadTime: Date.now(),
              }));
            };

            const onTileFailed = () => {
              failCount++;
              setTileStats((prev) => ({
                ...prev,
                google3DRequestsFailed: failCount,
              }));
            };

            tileset.tileLoad.addEventListener(onTileLoad);
            tileset.tileFailed.addEventListener(onTileFailed);

            tileLoadListenerRef.current = () => {
              tileset.tileLoad.removeEventListener(onTileLoad);
              tileset.tileFailed.removeEventListener(onTileFailed);
            };

            setTileStats({
              google3DTilesLoaded: 0,
              google3DRequestsFailed: 0,
              clippingEnabled: enableBoundaryClipping && !!site?.boundary_polygon,
              clippingPlaneCount,
              tileSource: 'google3d',
              lastTileLoadTime: null,
            });
          }

          viewer.scene.primitives.add(tileset);
        } catch (e) {
          console.warn('[CesiumGlobeViewer] Google 3D Tiles not available, falling back to OSM:', e);
          if (IS_DEV) {
            setTileStats((prev) => ({ ...prev, tileSource: 'osm', google3DRequestsFailed: prev.google3DRequestsFailed + 1 }));
          }
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
      if (IS_DEV) {
        setTileStats({
          google3DTilesLoaded: 0,
          google3DRequestsFailed: 0,
          clippingEnabled: false,
          clippingPlaneCount: 0,
          tileSource: 'osm',
          lastTileLoadTime: null,
        });
      }
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
    tileStats: IS_DEV ? tileStats : null,
  };
}
