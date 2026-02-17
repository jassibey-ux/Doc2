/**
 * CesiumGlobeViewer — Unified Cesium 3D viewer component.
 *
 * Replaces both CesiumMap.tsx and Site3DViewer.tsx with a single component
 * that adapts behavior based on the `mode` prop.
 *
 * Modes:
 * - setup:    CUAS click-to-place, site boundary, screenshots
 * - live:     Real-time drone tracks, engagements, CUAS jam states
 * - replay:   Timeline-driven drone tracks
 * - analysis: Post-session drone tracks with quality colors
 * - preview:  Static site view with screenshots
 */

import React, { useEffect, useState, useCallback } from 'react';
import type { CesiumGlobeViewerProps, ViewerMode } from './types';
import { useCesiumViewer } from './hooks/useCesiumViewer';
import { useTileManager } from './hooks/useTileManager';
import { useCameraController } from './hooks/useCameraController';
import { useClickHandler } from './hooks/useClickHandler';
import { renderSiteBoundary } from './layers/SiteBoundaryLayer';
import { renderCuasLayer } from './layers/CuasLayer';
import { renderDroneTracks } from './layers/DroneTrackLayer';
import { renderDroneMarkers } from './layers/DroneMarkerLayer';
import { renderEngagementLayer } from './layers/EngagementLayer';

// Feature matrix: which features are active per mode
const MODE_FEATURES: Record<ViewerMode, {
  droneTracks: boolean;
  droneMarkers: boolean;
  engagements: boolean;
  jamStateColors: boolean;
  clickToPlace: boolean;
  screenshots: boolean;
  droneSelectionFlyTo: boolean;
}> = {
  setup:    { droneTracks: false, droneMarkers: false, engagements: false, jamStateColors: false, clickToPlace: true,  screenshots: true,  droneSelectionFlyTo: false },
  live:     { droneTracks: true,  droneMarkers: true,  engagements: true,  jamStateColors: true,  clickToPlace: false, screenshots: false, droneSelectionFlyTo: true  },
  replay:   { droneTracks: true,  droneMarkers: true,  engagements: false, jamStateColors: false, clickToPlace: false, screenshots: false, droneSelectionFlyTo: true  },
  analysis: { droneTracks: true,  droneMarkers: true,  engagements: true,  jamStateColors: false, clickToPlace: false, screenshots: false, droneSelectionFlyTo: true  },
  preview:  { droneTracks: false, droneMarkers: false, engagements: false, jamStateColors: false, clickToPlace: false, screenshots: true,  droneSelectionFlyTo: false },
};

const CesiumGlobeViewer: React.FC<CesiumGlobeViewerProps> = (props) => {
  const {
    mode,
    site,
    tileMode: initialTileMode,
    enableBoundaryClipping = false,
    initialCameraState,
    onCameraStateChange,
    cuasPlacements,
    cuasProfiles,
    cuasJamStates,
    onCuasClick,
    engagementModeCuasId,
    onCuasPlaced,
    droneHistory,
    enhancedHistory,
    currentTime,
    timelineStart,
    currentDroneData,
    selectedDroneId,
    onDroneClick,
    droneProfiles,
    droneProfileMap,
    engagements,
    activeBursts,
    onCaptureScreenshots,
    onReady,
    onClose,
  } = props;

  const features = MODE_FEATURES[mode];
  const [showLabels, setShowLabels] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [hasEntities, setHasEntities] = useState(false);

  // Core viewer setup
  const { containerRef, viewerRef, cesiumRef, cesiumLoaded, error, getCameraState } = useCesiumViewer();

  // Tile management (Google 3D / OSM + boundary clipping)
  const { google3DEnabled, terrainEnabled, toggleGoogle3D, toggleTerrain, hasGoogleKey } = useTileManager({
    cesiumRef,
    viewerRef,
    cesiumLoaded,
    site,
    initialTileMode,
    enableBoundaryClipping,
  });

  // Camera management
  const { handleResetCamera } = useCameraController({
    cesiumRef,
    viewerRef,
    cesiumLoaded,
    site,
    initialCameraState,
    selectedDroneId: features.droneSelectionFlyTo ? selectedDroneId : undefined,
    currentDroneData,
    onCameraStateChange,
    onReady,
    getCameraState,
    hasEntities,
  });

  // Click handling (entity clicks + click-to-place)
  useClickHandler({
    cesiumRef,
    viewerRef,
    cesiumLoaded,
    mode,
    onDroneClick,
    onCuasClick,
    onCuasPlaced: features.clickToPlace ? onCuasPlaced : undefined,
  });

  // Render all entities when data changes
  useEffect(() => {
    if (!cesiumLoaded || !viewerRef.current || !cesiumRef.current) return;

    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;

    // Clear and re-render all entities
    viewer.entities.removeAll();

    // Site boundary (all modes)
    renderSiteBoundary(Cesium, viewer, site);

    // CUAS placements (all modes)
    if (cuasPlacements && cuasPlacements.length > 0) {
      renderCuasLayer(Cesium, viewer, {
        cuasPlacements,
        cuasProfiles,
        cuasJamStates: features.jamStateColors ? cuasJamStates : undefined,
        engagementModeCuasId,
        showLabels,
      });
    }

    // Drone tracks
    let colorMap = new Map<string, string>();
    let entitiesHavePositions = false;
    if (features.droneTracks && droneHistory && droneHistory.size > 0) {
      const trackResult = renderDroneTracks(Cesium, viewer, {
        droneHistory,
        enhancedHistory,
        currentTime: currentTime ?? Date.now(),
        timelineStart: timelineStart ?? (Date.now() - 3600000),
      });
      colorMap = trackResult.colorMap;
      entitiesHavePositions = trackResult.hasPositions;
    }

    // Drone markers (current position)
    if (features.droneMarkers && droneHistory && droneHistory.size > 0) {
      renderDroneMarkers(Cesium, viewer, {
        droneHistory,
        currentTime: currentTime ?? Date.now(),
        timelineStart: timelineStart ?? (Date.now() - 3600000),
        currentDroneData,
        selectedDroneId,
        droneProfiles,
        droneProfileMap,
        showLabels,
        colorMap,
      });
    }

    // Engagement lines
    if (features.engagements && engagements && cuasPlacements) {
      renderEngagementLayer(Cesium, viewer, {
        engagements,
        activeBursts: features.jamStateColors ? activeBursts : undefined,
        cuasPlacements,
        currentDroneData: currentDroneData ?? new Map(),
        showLabels,
      });
    }

    setHasEntities(entitiesHavePositions);
  }, [
    cesiumLoaded, droneHistory, enhancedHistory, currentTime, timelineStart,
    cuasPlacements, cuasProfiles, cuasJamStates, site, engagements,
    currentDroneData, selectedDroneId, showLabels, activeBursts,
    engagementModeCuasId, droneProfiles, droneProfileMap, mode,
  ]);

  // Screenshot capture
  const handleCaptureScreenshot = useCallback(async () => {
    if (!viewerRef.current || !onCaptureScreenshots) return;
    const viewer = viewerRef.current;

    setCapturing(true);
    try {
      viewer.scene.render();
      const canvas = viewer.canvas as HTMLCanvasElement;
      const base64 = canvas.toDataURL('image/png');
      const cameraState = getCameraState();
      if (!cameraState) return;

      const now = new Date();
      const label = `Recon ${now.toLocaleTimeString()} - ${site?.name || 'Site'}`;
      onCaptureScreenshots([{ label, base64, cameraState }]);
    } finally {
      setCapturing(false);
    }
  }, [getCameraState, onCaptureScreenshots, site?.name]);

  // Error state
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
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: 'rgba(0,0,0,0.7)', border: '1px solid #444',
              borderRadius: 4, color: '#fff', padding: '4px 12px', cursor: 'pointer',
              fontSize: 12, marginTop: 8,
            }}
          >
            Close
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Controls Panel — top-left (live/replay/analysis modes) */}
      {cesiumLoaded && (mode === 'live' || mode === 'replay' || mode === 'analysis') && (
        <div style={{
          position: 'absolute', top: 8, left: 8,
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <ControlButton
            label={terrainEnabled ? 'Terrain: ON' : 'Terrain: OFF'}
            active={terrainEnabled}
            onClick={toggleTerrain}
          />
          {hasGoogleKey && (
            <ControlButton
              label={google3DEnabled ? '3D Buildings: ON' : '3D Buildings: OFF'}
              active={google3DEnabled}
              onClick={toggleGoogle3D}
            />
          )}
          <ControlButton
            label={showLabels ? 'Labels: ON' : 'Labels: OFF'}
            active={showLabels}
            onClick={() => setShowLabels((v) => !v)}
          />
          <ControlButton
            label="Reset Camera"
            active={false}
            onClick={handleResetCamera}
          />
        </div>
      )}

      {/* Bottom control bar — setup/preview modes */}
      {cesiumLoaded && (mode === 'setup' || mode === 'preview') && (
        <div style={{
          position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12,
          maxWidth: 'calc(100% - 32px)', zIndex: 10,
          background: 'rgba(15, 15, 30, 0.85)', borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.1)',
          backdropFilter: 'blur(12px)',
        }}>
          {/* Mode badge */}
          <span style={{
            padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
            background: mode === 'setup' ? 'rgba(249,115,22,0.2)' : 'rgba(59,130,246,0.2)',
            color: mode === 'setup' ? '#f97316' : '#3b82f6',
            border: `1px solid ${mode === 'setup' ? 'rgba(249,115,22,0.4)' : 'rgba(59,130,246,0.4)'}`,
          }}>
            {mode === 'setup' ? 'Interactive — Click to Place CUAS' : 'Preview'}
          </span>

          {/* Tile mode toggle */}
          {hasGoogleKey && (
            <ControlButton
              label={google3DEnabled ? 'Google 3D' : 'OSM Buildings'}
              active={google3DEnabled}
              onClick={toggleGoogle3D}
            />
          )}

          {/* Capture screenshot */}
          {features.screenshots && onCaptureScreenshots && (
            <button
              onClick={handleCaptureScreenshot}
              disabled={capturing}
              style={{
                background: 'rgba(59,130,246,0.7)', border: '1px solid #3b82f6',
                borderRadius: 4, color: '#fff', padding: '3px 10px', cursor: 'pointer',
                fontSize: 11, whiteSpace: 'nowrap',
                opacity: capturing ? 0.5 : 1,
              }}
            >
              {capturing ? 'Capturing...' : 'Capture Screenshot'}
            </button>
          )}

          {/* Close */}
          {onClose && (
            <ControlButton label="Close" active={false} onClick={onClose} />
          )}
        </div>
      )}

      {/* Exit Globe button — top-right (live/replay/analysis modes) */}
      {onClose && (mode === 'live' || mode === 'replay' || mode === 'analysis') && (
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 8, right: 8,
            background: 'rgba(0,0,0,0.7)', border: '1px solid #444',
            borderRadius: 4, color: '#fff', padding: '4px 12px', cursor: 'pointer',
            fontSize: 12,
          }}
        >
          Exit Globe
        </button>
      )}

      {/* Loading overlay */}
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

/** Reusable control button */
const ControlButton: React.FC<{
  label: string;
  active: boolean;
  onClick: () => void;
}> = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    style={{
      background: active ? 'rgba(59,130,246,0.7)' : 'rgba(0,0,0,0.7)',
      border: `1px solid ${active ? '#3b82f6' : '#444'}`,
      borderRadius: 4,
      color: '#fff',
      padding: '3px 8px',
      cursor: 'pointer',
      fontSize: 11,
      whiteSpace: 'nowrap',
    }}
  >
    {label}
  </button>
);

export default CesiumGlobeViewer;
