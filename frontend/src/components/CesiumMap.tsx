/**
 * CesiumJS Globe Component
 *
 * Full 3D globe view with Google 3D Tiles, track rendering,
 * and CUAS coverage overlays. Used as the "3D mode" alternative
 * to the MapLibre 2D view.
 */

import React, { useRef, useEffect, useState } from 'react';
import type { PositionPoint } from '../types/drone';
import type { EnhancedPositionPoint, CUASPlacement, CUASProfile, SiteDefinition } from '../types/workflow';

// Cesium types - lazy loaded
type CesiumViewer = any;

const CESIUM_TOKEN = import.meta.env.VITE_CESIUM_TOKEN || '';
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || '';

// Track colors matching Map3DViewer
const TRACK_COLORS = [
  '#00c8ff', '#ff6b6b', '#4ecdc4', '#f7dc6f',
  '#bb8fce', '#58d68d', '#f8b500', '#5dade2',
];

interface CesiumMapProps {
  droneHistory: Map<string, PositionPoint[]>;
  enhancedHistory?: Map<string, EnhancedPositionPoint[]>;
  currentTime: number;
  timelineStart: number;
  site?: SiteDefinition | null;
  cuasPlacements?: CUASPlacement[];
  cuasProfiles?: CUASProfile[];
  cuasJamStates?: Map<string, boolean>;
  selectedDroneId?: string | null;
  onDroneClick?: (droneId: string) => void;
  viewshedImageUrl?: string | null;
  viewshedBounds?: [[number, number], [number, number], [number, number], [number, number]] | null;
  rfCoverageImageUrl?: string | null;
  rfCoverageBounds?: [[number, number], [number, number], [number, number], [number, number]] | null;
  onClose?: () => void;
}

const CesiumMap: React.FC<CesiumMapProps> = ({
  droneHistory,
  enhancedHistory: _enhancedHistory,
  currentTime,
  timelineStart,
  site,
  cuasPlacements,
  cuasProfiles,
  cuasJamStates,
  selectedDroneId: _selectedDroneId,
  onDroneClick: _onDroneClick,
  viewshedImageUrl: _viewshedImageUrl,
  viewshedBounds: _viewshedBounds,
  rfCoverageImageUrl: _rfCoverageImageUrl,
  rfCoverageBounds: _rfCoverageBounds,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<CesiumViewer>(null);
  const [cesiumLoaded, setCesiumLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lazy load Cesium
  useEffect(() => {
    const loadCesium = async () => {
      try {
        const Cesium = await import('cesium');
        // @ts-ignore
        window.Cesium = Cesium;

        if (CESIUM_TOKEN) {
          Cesium.Ion.defaultAccessToken = CESIUM_TOKEN;
        }

        if (!containerRef.current) return;

        const viewer = new Cesium.Viewer(containerRef.current, {
          terrain: Cesium.Terrain.fromWorldTerrain(),
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

        // Add Google 3D Tiles if API key available
        if (GOOGLE_MAPS_API_KEY) {
          try {
            const tileset = await Cesium.Cesium3DTileset.fromUrl(
              `https://tile.googleapis.com/v1/3dtiles/root.json?key=${GOOGLE_MAPS_API_KEY}`
            );
            viewer.scene.primitives.add(tileset);
          } catch (e) {
            console.warn('Google 3D Tiles not available:', e);
          }
        }

        viewerRef.current = viewer;
        setCesiumLoaded(true);
      } catch (e: any) {
        setError(`Failed to load CesiumJS: ${e.message}`);
      }
    };

    loadCesium();

    return () => {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, []);

  // Update tracks when data changes
  useEffect(() => {
    if (!cesiumLoaded || !viewerRef.current) return;

    const updateTracks = async () => {
      const Cesium = await import('cesium');
      const viewer = viewerRef.current;
      if (!viewer) return;

      // Remove existing entities
      viewer.entities.removeAll();

      let colorIndex = 0;
      let hasPositions = false;

      for (const [trackerId, positions] of droneHistory) {
        const color = TRACK_COLORS[colorIndex % TRACK_COLORS.length];
        colorIndex++;

        const filtered = positions.filter(
          (p) => p.timestamp >= timelineStart && p.timestamp <= currentTime
        );

        if (filtered.length < 2) continue;
        hasPositions = true;

        // Create polyline positions
        const cartesians = filtered.map((p) =>
          Cesium.Cartesian3.fromDegrees(
            p.lon,
            p.lat,
            (p.alt_m || 0) + 1, // Slight offset above terrain
          )
        );

        // Track polyline
        viewer.entities.add({
          name: trackerId,
          polyline: {
            positions: cartesians,
            width: 3,
            material: Cesium.Color.fromCssColorString(color),
            clampToGround: false,
          },
        });

        // Current position marker
        const lastPos = filtered[filtered.length - 1];
        viewer.entities.add({
          name: `${trackerId}_marker`,
          position: Cesium.Cartesian3.fromDegrees(
            lastPos.lon,
            lastPos.lat,
            (lastPos.alt_m || 0) + 2,
          ),
          point: {
            pixelSize: 10,
            color: Cesium.Color.fromCssColorString(color),
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
          },
          label: {
            text: trackerId,
            font: '12px monospace',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -15),
          },
        });
      }

      // Add CUAS placements
      if (cuasPlacements) {
        for (const placement of cuasPlacements) {
          const isJamming = cuasJamStates?.get(placement.id);
          const profile = cuasProfiles?.find((p) => p.id === placement.cuas_profile_id);

          viewer.entities.add({
            name: `cuas_${placement.id}`,
            position: Cesium.Cartesian3.fromDegrees(
              placement.position.lon,
              placement.position.lat,
              (placement.height_agl_m || 0) + 2,
            ),
            billboard: {
              image: createCUASDataUri(isJamming ? '#ef4444' : '#f97316'),
              width: 24,
              height: 24,
            },
            label: {
              text: profile?.name || 'CUAS',
              font: '11px monospace',
              fillColor: Cesium.Color.fromCssColorString(isJamming ? '#ef4444' : '#f97316'),
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              pixelOffset: new Cesium.Cartesian2(0, -18),
            },
          });
        }
      }

      // Fly to tracks
      if (hasPositions) {
        viewer.zoomTo(viewer.entities);
      } else if (site) {
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(
            site.center.lon,
            site.center.lat,
            5000,
          ),
        });
      }
    };

    updateTracks();
  }, [cesiumLoaded, droneHistory, currentTime, timelineStart, cuasPlacements, cuasProfiles, cuasJamStates, site]);

  if (error) {
    return (
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        height: '100%', background: '#0a0a0a', color: '#ef4444',
        flexDirection: 'column', gap: 8,
      }}>
        <div>{error}</div>
        <div style={{ color: '#888', fontSize: 12 }}>
          Set VITE_CESIUM_TOKEN environment variable for CesiumJS
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {onClose && (
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 8, right: 8,
            background: 'rgba(0,0,0,0.7)', border: '1px solid #444',
            borderRadius: 4, color: '#fff', padding: '4px 8px', cursor: 'pointer',
          }}
        >
          Exit 3D
        </button>
      )}

      {!cesiumLoaded && (
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          background: '#0a0a0a', color: '#888',
        }}>
          Loading CesiumJS Globe...
        </div>
      )}
    </div>
  );
};

/** Create a simple SVG data URI for CUAS markers */
function createCUASDataUri(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" fill="${color}" stroke="#000" stroke-width="2"/>
    <text x="12" y="16" text-anchor="middle" fill="#fff" font-size="12" font-weight="bold">J</text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

export default CesiumMap;
