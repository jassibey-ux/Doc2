/**
 * Site3DViewer — Standalone Cesium viewer for 3D site reconnaissance
 *
 * Provides 3D terrain visualization for site setup, with support for:
 * - OSM Buildings or Google 3D Photorealistic Tiles
 * - Site boundary polygon overlay
 * - Interactive CUAS placement via click-to-place
 * - Screenshot capture for recon documentation
 *
 * Follows the CesiumMap.tsx lazy-load pattern.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { SiteDefinition, CUASPlacement, CUASProfile, CameraState3D } from '../types/workflow';
import { GlassPanel, GlassButton, Badge } from './ui/GlassUI';

// Cesium types — lazy loaded
type CesiumViewer = any;
type CesiumModule = any;

const CESIUM_TOKEN = import.meta.env.VITE_CESIUM_TOKEN || '';
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || '';

interface Site3DViewerProps {
  site: SiteDefinition;
  cuasPlacements?: CUASPlacement[];
  cuasProfiles?: CUASProfile[];
  initialCameraState?: CameraState3D;
  onCameraChange?: (state: CameraState3D) => void;
  mode: 'preview' | 'interactive';
  tileMode: 'osm' | 'google3d';
  onCuasPlaced?: (position: { lat: number; lon: number; alt_m: number }) => void;
  onReady?: () => void;
  onCaptureScreenshots?: (screenshots: Array<{ label: string; base64: string; cameraState: CameraState3D }>) => void;
  onClose?: () => void;
}

const Site3DViewer: React.FC<Site3DViewerProps> = ({
  site,
  cuasPlacements,
  cuasProfiles,
  initialCameraState,
  onCameraChange,
  mode,
  tileMode: initialTileMode,
  onCuasPlaced,
  onReady,
  onCaptureScreenshots,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<CesiumViewer>(null);
  const cesiumRef = useRef<CesiumModule>(null);
  const handlerRef = useRef<any>(null);
  const cameraListenerRef = useRef<any>(null);
  const [cesiumLoaded, setCesiumLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tileMode, setTileMode] = useState<'osm' | 'google3d'>(initialTileMode);
  const [capturing, setCapturing] = useState(false);
  const initialFlyDone = useRef(false);

  // --------------------------------------------------------------------------
  // Helper: read current camera state from the Cesium viewer
  // --------------------------------------------------------------------------
  const getCameraState = useCallback((): CameraState3D | null => {
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

  // --------------------------------------------------------------------------
  // 1. Lazy-load CesiumJS and create the viewer
  // --------------------------------------------------------------------------
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
      } catch (e: any) {
        if (!destroyed) {
          setError(`Failed to load CesiumJS: ${e.message}`);
        }
      }
    };

    loadCesium();

    return () => {
      destroyed = true;
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
      if (cameraListenerRef.current) {
        cameraListenerRef.current();
        cameraListenerRef.current = null;
      }
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, []);

  // --------------------------------------------------------------------------
  // 2. Toggle tile mode (OSM Buildings vs Google 3D Photorealistic)
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!cesiumLoaded || !viewerRef.current || !cesiumRef.current) return;
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;

    // Remove any existing tile primitives we previously added
    const primitives = viewer.scene.primitives;
    for (let i = primitives.length - 1; i >= 0; i--) {
      const p = primitives.get(i);
      if (p._site3dOsm || p._site3dGoogle) {
        primitives.remove(p);
      }
    }

    if (tileMode === 'google3d' && GOOGLE_MAPS_API_KEY) {
      (async () => {
        try {
          const tileset = await Cesium.Cesium3DTileset.fromUrl(
            `https://tile.googleapis.com/v1/3dtiles/root.json?key=${GOOGLE_MAPS_API_KEY}`
          );
          tileset._site3dGoogle = true;
          viewer.scene.primitives.add(tileset);
        } catch (e) {
          console.warn('Google 3D Tiles not available, falling back to OSM:', e);
          // Fallback: add OSM buildings
          try {
            const osmBuildings = await Cesium.createOsmBuildingsAsync();
            osmBuildings._site3dOsm = true;
            viewer.scene.primitives.add(osmBuildings);
          } catch (_) {
            // OSM also unavailable — viewer still works with terrain only
          }
        }
      })();
    } else {
      // OSM Buildings mode
      (async () => {
        try {
          const osmBuildings = await Cesium.createOsmBuildingsAsync();
          osmBuildings._site3dOsm = true;
          viewer.scene.primitives.add(osmBuildings);
        } catch (e) {
          console.warn('OSM Buildings not available:', e);
        }
      })();
    }
  }, [cesiumLoaded, tileMode]);

  // --------------------------------------------------------------------------
  // 3. Render site boundary, CUAS placements
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!cesiumLoaded || !viewerRef.current || !cesiumRef.current) return;
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;

    // Clear all entities and re-add
    viewer.entities.removeAll();

    // ── Site Boundary Polygon ──
    if (site.boundary_polygon && site.boundary_polygon.length >= 3) {
      const boundaryCartesians = site.boundary_polygon.map((p) =>
        Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 0)
      );

      // Filled polygon
      viewer.entities.add({
        name: 'site_boundary',
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(boundaryCartesians),
          material: Cesium.Color.ORANGE.withAlpha(0.1),
          outline: true,
          outlineColor: Cesium.Color.ORANGE.withAlpha(0.8),
          outlineWidth: 2,
          height: 0,
          classificationType: Cesium.ClassificationType.BOTH,
        },
      });

      // Dashed boundary outline for visibility on terrain
      const outlinePositions = [...boundaryCartesians, boundaryCartesians[0]];
      viewer.entities.add({
        name: 'site_boundary_outline',
        polyline: {
          positions: outlinePositions,
          width: 2,
          material: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.ORANGE.withAlpha(0.8),
            dashLength: 16.0,
          }),
          clampToGround: true,
        },
      });
    }

    // ── CUAS Placements ──
    if (cuasPlacements) {
      for (const placement of cuasPlacements) {
        const profile = cuasProfiles?.find((p) => p.id === placement.cuas_profile_id);
        const effectiveRange = profile?.effective_range_m || 500;

        // CUAS marker
        viewer.entities.add({
          name: `cuas_${placement.id}`,
          description: placement.id,
          position: Cesium.Cartesian3.fromDegrees(
            placement.position.lon,
            placement.position.lat,
            (placement.height_agl_m || 0) + 2
          ),
          billboard: {
            image: createCUASDataUri('#f97316'),
            width: 28,
            height: 28,
          },
          label: {
            text: profile?.name || 'CUAS',
            font: '11px monospace',
            fillColor: Cesium.Color.fromCssColorString('#f97316'),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -20),
          },
        });

        // Coverage circle (36 segments)
        const circlePositions: any[] = [];
        for (let deg = 0; deg <= 360; deg += 10) {
          const rad = (deg * Math.PI) / 180;
          const lat = placement.position.lat + (effectiveRange / 111320) * Math.cos(rad);
          const lon =
            placement.position.lon +
            (effectiveRange / (111320 * Math.cos((placement.position.lat * Math.PI) / 180))) *
              Math.sin(rad);
          circlePositions.push(Cesium.Cartesian3.fromDegrees(lon, lat, 0));
        }

        viewer.entities.add({
          name: `cuas_coverage_${placement.id}`,
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(circlePositions),
            material: Cesium.Color.fromCssColorString('#f97316').withAlpha(0.05),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString('#f97316').withAlpha(0.4),
            height: 0,
          },
        });

        // Heading / beam direction cone
        if (placement.orientation_deg !== undefined && profile?.beam_width_deg) {
          const beamHalf = (profile.beam_width_deg || 60) / 2;
          const headingRad = ((placement.orientation_deg - 90) * Math.PI) / 180;
          const coneRange = effectiveRange * 0.8;

          const conePositions = [
            Cesium.Cartesian3.fromDegrees(placement.position.lon, placement.position.lat, 1),
          ];
          for (let a = -beamHalf; a <= beamHalf; a += 5) {
            const rad = headingRad + (a * Math.PI) / 180;
            const lat = placement.position.lat + (coneRange / 111320) * Math.cos(rad);
            const lon =
              placement.position.lon +
              (coneRange / (111320 * Math.cos((placement.position.lat * Math.PI) / 180))) *
                Math.sin(rad);
            conePositions.push(Cesium.Cartesian3.fromDegrees(lon, lat, 1));
          }

          viewer.entities.add({
            name: `cuas_beam_${placement.id}`,
            polygon: {
              hierarchy: new Cesium.PolygonHierarchy(conePositions),
              material: Cesium.Color.fromCssColorString('#f97316').withAlpha(0.1),
              height: 0,
            },
          });
        }
      }
    }
  }, [cesiumLoaded, site, cuasPlacements, cuasProfiles]);

  // --------------------------------------------------------------------------
  // 4. Camera fly-to on load (initial camera state or bounding rectangle)
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!cesiumLoaded || !viewerRef.current || !cesiumRef.current || initialFlyDone.current) return;
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;

    initialFlyDone.current = true;

    // If an initial camera state was provided, restore it
    if (initialCameraState) {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          initialCameraState.longitude,
          initialCameraState.latitude,
          initialCameraState.height
        ),
        orientation: {
          heading: Cesium.Math.toRadians(initialCameraState.heading),
          pitch: Cesium.Math.toRadians(initialCameraState.pitch),
          roll: Cesium.Math.toRadians(initialCameraState.roll),
        },
        duration: 1.5,
        complete: () => {
          onReady?.();
        },
      });
      return;
    }

    // Calculate bounding rectangle from site boundary
    if (site.boundary_polygon && site.boundary_polygon.length >= 3) {
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

      // Approximate extent in meters
      const latExtent = (maxLat - minLat) * 111320;
      const lonExtent = (maxLon - minLon) * 111320 * Math.cos((centerLat * Math.PI) / 180);
      const maxExtent = Math.max(latExtent, lonExtent, 200);

      // Camera height = 1.5x the max boundary extent
      const cameraHeight = maxExtent * 1.5;

      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, cameraHeight),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-45),
          roll: 0,
        },
        duration: 2.0,
        complete: () => {
          onReady?.();
        },
      });
    } else {
      // Fallback: fly to site center
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          site.center.lon,
          site.center.lat,
          5000
        ),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-45),
          roll: 0,
        },
        duration: 2.0,
        complete: () => {
          onReady?.();
        },
      });
    }
  }, [cesiumLoaded, site, initialCameraState, onReady]);

  // --------------------------------------------------------------------------
  // 5. Interactive mode: click-to-place CUAS handler
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!cesiumLoaded || !viewerRef.current || !cesiumRef.current) return;
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;

    // Clean up previous handler
    if (handlerRef.current) {
      handlerRef.current.destroy();
      handlerRef.current = null;
    }

    if (mode === 'interactive' && onCuasPlaced) {
      const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction((click: any) => {
        // Attempt to pick terrain/tileset position
        const ray = viewer.camera.getPickRay(click.position);
        if (!ray) return;

        const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
        if (!cartesian) return;

        const carto = Cesium.Cartographic.fromCartesian(cartesian);
        const lat = Cesium.Math.toDegrees(carto.latitude);
        const lon = Cesium.Math.toDegrees(carto.longitude);
        const alt_m = carto.height;

        onCuasPlaced({ lat, lon, alt_m });
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

      handlerRef.current = handler;
    }

    return () => {
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
    };
  }, [cesiumLoaded, mode, onCuasPlaced]);

  // --------------------------------------------------------------------------
  // 6. Camera change listener
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!cesiumLoaded || !viewerRef.current || !cesiumRef.current || !onCameraChange) return;
    const viewer = viewerRef.current;

    // Remove previous listener
    if (cameraListenerRef.current) {
      cameraListenerRef.current();
      cameraListenerRef.current = null;
    }

    const listener = viewer.camera.changed.addEventListener(() => {
      const state = getCameraState();
      if (state) onCameraChange(state);
    });

    // Cesium camera.changed fires with a percentage threshold. Lower it for
    // more frequent updates (default is 0.5). Set to 0.1 for responsive UI.
    viewer.camera.percentageChanged = 0.1;
    cameraListenerRef.current = listener;

    return () => {
      if (cameraListenerRef.current) {
        cameraListenerRef.current();
        cameraListenerRef.current = null;
      }
    };
  }, [cesiumLoaded, onCameraChange, getCameraState]);

  // --------------------------------------------------------------------------
  // 7. Screenshot capture
  // --------------------------------------------------------------------------
  const handleCaptureScreenshot = useCallback(async () => {
    if (!viewerRef.current || !onCaptureScreenshots) return;
    const viewer = viewerRef.current;

    setCapturing(true);

    try {
      // Force a render to ensure current frame is up to date
      viewer.scene.render();

      const canvas = viewer.canvas as HTMLCanvasElement;
      const base64 = canvas.toDataURL('image/png');

      const cameraState = getCameraState();
      if (!cameraState) return;

      const now = new Date();
      const label = `Recon ${now.toLocaleTimeString()} - ${site.name}`;

      onCaptureScreenshots([
        {
          label,
          base64,
          cameraState,
        },
      ]);
    } finally {
      setCapturing(false);
    }
  }, [getCameraState, onCaptureScreenshots, site.name]);

  // --------------------------------------------------------------------------
  // 8. Toggle tile mode handler
  // --------------------------------------------------------------------------
  const handleToggleTileMode = useCallback(() => {
    setTileMode((prev) => (prev === 'osm' ? 'google3d' : 'osm'));
  }, []);

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------
  if (error) {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          background: '#0a0a0a',
          color: '#ef4444',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div>{error}</div>
        <div style={{ color: '#888', fontSize: 12 }}>
          Set VITE_CESIUM_TOKEN environment variable for CesiumJS
        </div>
        {onClose && (
          <GlassButton variant="secondary" size="sm" onClick={onClose}>
            Close
          </GlassButton>
        )}
      </div>
    );
  }

  const bothTokensAvailable = !!CESIUM_TOKEN && !!GOOGLE_MAPS_API_KEY;

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* Cesium container */}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Loading overlay */}
      {!cesiumLoaded && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            background: '#0a0a0a',
            color: '#888',
            fontSize: 14,
          }}
        >
          Loading CesiumJS 3D Viewer...
        </div>
      )}

      {/* Bottom control panel */}
      {cesiumLoaded && (
        <GlassPanel
          style={{
            position: 'absolute',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            maxWidth: 'calc(100% - 32px)',
            zIndex: 10,
          }}
        >
          {/* Mode badge */}
          {mode === 'preview' ? (
            <Badge color="blue" size="md">Preview</Badge>
          ) : (
            <Badge color="orange" size="md">Interactive — Click to Place CUAS</Badge>
          )}

          {/* Tile mode toggle — only show when both tokens are available */}
          {bothTokensAvailable && (
            <GlassButton
              variant="secondary"
              size="sm"
              onClick={handleToggleTileMode}
            >
              {tileMode === 'osm' ? 'OSM Buildings' : 'Google 3D'}
            </GlassButton>
          )}

          {/* Capture screenshot button */}
          {onCaptureScreenshots && (
            <GlassButton
              variant="primary"
              size="sm"
              onClick={handleCaptureScreenshot}
              disabled={capturing}
            >
              {capturing ? 'Capturing...' : 'Capture Screenshot'}
            </GlassButton>
          )}

          {/* Close button */}
          {onClose && (
            <GlassButton
              variant="ghost"
              size="sm"
              onClick={onClose}
            >
              Close
            </GlassButton>
          )}
        </GlassPanel>
      )}
    </div>
  );
};

// =============================================================================
// Helper: SVG data URI for CUAS markers (matching CesiumMap pattern)
// =============================================================================

function createCUASDataUri(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
    <circle cx="14" cy="14" r="12" fill="${color}" stroke="#000" stroke-width="2" opacity="0.9"/>
    <text x="14" y="19" text-anchor="middle" fill="#fff" font-size="14" font-weight="bold">J</text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

export default Site3DViewer;
