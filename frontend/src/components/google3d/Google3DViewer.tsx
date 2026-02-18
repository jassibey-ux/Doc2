/**
 * Google3DViewer — Google Maps 3D viewer component.
 *
 * Drop-in replacement for CesiumGlobeViewer. Adapts behavior based on `mode` prop.
 * Uses imperative Google Maps 3D web components for all layer rendering.
 *
 * Modes:
 * - setup:    Click-to-place CUAS, site boundary
 * - live:     Real-time drone tracks, engagements, CUAS jam states
 * - replay:   Timeline-driven drone tracks
 * - analysis: Post-session drone tracks with quality colors
 * - preview:  Static site view
 * - event:    Blue UAS event dashboard (geofences, fleet tracking)
 */

import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import type { Google3DViewerProps, ViewerMode } from './types';
import { useGoogle3DMap } from './hooks/useGoogle3DMap';
import { useGoogle3DCameraController } from './hooks/useGoogle3DCameraController';
import { useGoogle3DClickHandler } from './hooks/useGoogle3DClickHandler';
import { renderSiteBoundary } from './layers/SiteBoundaryLayer3D';
import { renderCuasLayer } from './layers/CuasLayer3D';
import { renderDroneTracks } from './layers/DroneTrackLayer3D';
import { renderDroneMarkers } from './layers/DroneMarkerLayer3D';
import { renderEngagementLayer } from './layers/EngagementLayer3D';
import { renderGeofenceZones } from './layers/GeofenceLayer3D';
import { useApiUsageSafe } from '../../contexts/ApiUsageContext';

/** Imperative handle for external camera control */
export interface Google3DViewerHandle {
  flyTo(lat: number, lng: number, alt: number, range?: number): void;
  resetCamera(): void;
  startOrbit(durationMs?: number): void;
}

// Feature matrix: which features are active per mode
const MODE_FEATURES: Record<ViewerMode, {
  droneTracks: boolean;
  droneMarkers: boolean;
  engagements: boolean;
  jamStateColors: boolean;
  clickToPlace: boolean;
  screenshots: boolean;
  droneSelectionFlyTo: boolean;
  geofences: boolean;
}> = {
  setup:    { droneTracks: false, droneMarkers: false, engagements: false, jamStateColors: false, clickToPlace: true,  screenshots: true,  droneSelectionFlyTo: false, geofences: false },
  live:     { droneTracks: true,  droneMarkers: true,  engagements: true,  jamStateColors: true,  clickToPlace: false, screenshots: false, droneSelectionFlyTo: true,  geofences: false },
  replay:   { droneTracks: true,  droneMarkers: true,  engagements: false, jamStateColors: false, clickToPlace: false, screenshots: false, droneSelectionFlyTo: true,  geofences: false },
  analysis: { droneTracks: true,  droneMarkers: true,  engagements: true,  jamStateColors: false, clickToPlace: false, screenshots: false, droneSelectionFlyTo: true,  geofences: false },
  preview:  { droneTracks: false, droneMarkers: false, engagements: false, jamStateColors: false, clickToPlace: false, screenshots: true,  droneSelectionFlyTo: false, geofences: false },
  event:    { droneTracks: true,  droneMarkers: true,  engagements: false, jamStateColors: false, clickToPlace: false, screenshots: false, droneSelectionFlyTo: true,  geofences: true  },
};

const Google3DViewer = forwardRef<Google3DViewerHandle, Google3DViewerProps>((props, ref) => {
  const {
    mode,
    site,
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
    geofenceZones,
    onReady,
    onClose,
  } = props;

  const features = MODE_FEATURES[mode];
  const apiUsage = useApiUsageSafe();
  const containerRef = useRef<HTMLDivElement>(null);
  const [showLabelsInternal, setShowLabelsInternal] = useState(true);
  // Use prop if provided (event mode), otherwise use internal state
  const showLabels = props.showLabels ?? showLabelsInternal;

  // Core map setup
  const { mapRef, maps3dLib, isLoaded, error, setMapMode } = useGoogle3DMap({
    containerRef,
    site,
    initialCameraState,
    mode,
  });

  // Camera management
  const { handleResetCamera, startOrbit, flyTo } = useGoogle3DCameraController({
    mapRef,
    isLoaded,
    site,
    initialCameraState,
    selectedDroneId: features.droneSelectionFlyTo ? selectedDroneId : undefined,
    currentDroneData,
    onCameraStateChange,
    onReady,
  });

  // Expose imperative handle for external camera control
  useImperativeHandle(ref, () => ({
    flyTo: (lat: number, lng: number, alt: number, range?: number) => flyTo(lat, lng, alt, range),
    resetCamera: handleResetCamera,
    startOrbit: (durationMs?: number) => startOrbit(durationMs ?? 15000),
  }), [flyTo, handleResetCamera, startOrbit]);

  // Toggle Google POI labels by switching map mode
  useEffect(() => {
    if (isLoaded) {
      setMapMode(showLabels ? 'HYBRID' : 'SATELLITE');
    }
  }, [isLoaded, showLabels, setMapMode]);

  // Click handling
  useGoogle3DClickHandler({
    mapRef,
    isLoaded,
    mode,
    onDroneClick,
    onCuasClick,
    onCuasPlaced: features.clickToPlace ? onCuasPlaced : undefined,
  });

  // PerformanceObserver to count Google Maps tile fetches
  useEffect(() => {
    if (!apiUsage) return;
    try {
      const observer = new PerformanceObserver((list) => {
        let tileCount = 0;
        for (const entry of list.getEntries()) {
          if (entry.name.includes('maps.googleapis.com') || entry.name.includes('khms.googleapis.com')) {
            tileCount++;
          }
        }
        if (tileCount > 0) {
          apiUsage.recordTileLoad(tileCount);
        }
      });
      observer.observe({ type: 'resource', buffered: false });
      return () => observer.disconnect();
    } catch {
      // PerformanceObserver not supported
    }
  }, [apiUsage]);

  // Track cleanup functions for layers
  const cleanupRef = useRef<Array<() => void>>([]);

  // Render all layers when data changes
  useEffect(() => {
    if (!isLoaded || !mapRef.current || !maps3dLib) return;

    const mapEl = mapRef.current;

    // Clean up previous layer renders
    cleanupRef.current.forEach(fn => fn());
    cleanupRef.current = [];

    // Wrap all layer rendering in try/catch — the Google Maps 3D alpha API
    // can throw internally (e.g. 'Cannot read properties of undefined')
    // when element constructors run before the map scene is fully ready.
    try {
      // Site boundary (all modes)
      cleanupRef.current.push(
        renderSiteBoundary(maps3dLib, mapEl, site)
      );
      apiUsage?.recordLayerRender('SiteBoundary');

      // Geofence zones (event mode)
      if (features.geofences && geofenceZones) {
        cleanupRef.current.push(
          renderGeofenceZones(maps3dLib, mapEl, geofenceZones)
        );
        apiUsage?.recordLayerRender('GeofenceZones');
      }

      // CUAS placements
      if (cuasPlacements && cuasPlacements.length > 0) {
        cleanupRef.current.push(
          renderCuasLayer(maps3dLib, mapEl, {
            cuasPlacements,
            cuasProfiles,
            cuasJamStates: features.jamStateColors ? cuasJamStates : undefined,
            engagementModeCuasId,
            showLabels,
            onCuasClick,
          })
        );
        apiUsage?.recordLayerRender('CUAS');
      }

      // Drone tracks
      let colorMap = new Map<string, string>();
      if (features.droneTracks && droneHistory && droneHistory.size > 0) {
        const trackResult = renderDroneTracks(maps3dLib, mapEl, {
          droneHistory,
          enhancedHistory,
          currentTime: currentTime ?? Date.now(),
          timelineStart: timelineStart ?? (Date.now() - 3600000),
        });
        colorMap = trackResult.colorMap;
        cleanupRef.current.push(trackResult.cleanup);
        apiUsage?.recordLayerRender('DroneTracks');
      }

      // Drone markers (current position)
      if (features.droneMarkers && droneHistory && droneHistory.size > 0) {
        cleanupRef.current.push(
          renderDroneMarkers(maps3dLib, mapEl, {
            droneHistory,
            currentTime: currentTime ?? Date.now(),
            timelineStart: timelineStart ?? (Date.now() - 3600000),
            currentDroneData,
            selectedDroneId,
            droneProfiles,
            droneProfileMap,
            showLabels,
            colorMap,
            onDroneClick,
          })
        );
        apiUsage?.recordLayerRender('DroneMarkers');
      }

      // Engagement lines
      if (features.engagements && engagements && cuasPlacements) {
        cleanupRef.current.push(
          renderEngagementLayer(maps3dLib, mapEl, {
            engagements,
            activeBursts: features.jamStateColors ? activeBursts : undefined,
            cuasPlacements,
            currentDroneData: currentDroneData ?? new Map(),
            showLabels,
          })
        );
        apiUsage?.recordLayerRender('Engagements');
      }
    } catch (err) {
      console.warn('[Google3DViewer] Layer rendering failed (Maps 3D alpha API):', err);
    }
  }, [
    isLoaded, maps3dLib, droneHistory, enhancedHistory, currentTime, timelineStart,
    cuasPlacements, cuasProfiles, cuasJamStates, site, engagements,
    currentDroneData, selectedDroneId, showLabels, activeBursts,
    engagementModeCuasId, droneProfiles, droneProfileMap, mode, geofenceZones,
    onCuasClick, onDroneClick,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupRef.current.forEach(fn => fn());
      cleanupRef.current = [];
    };
  }, []);

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
          Check Google Maps API key configuration
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
      {/* Map container */}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Controls Panel — top-left (non-event modes only; event mode uses CameraPresetsOverlay) */}
      {isLoaded && (mode === 'live' || mode === 'replay' || mode === 'analysis') && (
        <div style={{
          position: 'absolute', top: 8, left: 8,
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <ControlButton
            label={showLabels ? 'Labels: ON' : 'Labels: OFF'}
            active={showLabels}
            onClick={() => setShowLabelsInternal(v => !v)}
          />
          <ControlButton
            label="Reset Camera"
            active={false}
            onClick={handleResetCamera}
          />
        </div>
      )}

      {/* Bottom control bar — setup/preview modes */}
      {isLoaded && (mode === 'setup' || mode === 'preview') && (
        <div style={{
          position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12,
          maxWidth: 'calc(100% - 32px)', zIndex: 10,
          background: 'rgba(15, 15, 30, 0.85)', borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.1)',
          backdropFilter: 'blur(12px)',
        }}>
          <span style={{
            padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
            background: mode === 'setup' ? 'rgba(249,115,22,0.2)' : 'rgba(59,130,246,0.2)',
            color: mode === 'setup' ? '#f97316' : '#3b82f6',
            border: `1px solid ${mode === 'setup' ? 'rgba(249,115,22,0.4)' : 'rgba(59,130,246,0.4)'}`,
          }}>
            {mode === 'setup' ? 'Interactive — Click to Place CUAS' : 'Preview'}
          </span>
          {onClose && (
            <ControlButton label="Close" active={false} onClick={onClose} />
          )}
        </div>
      )}

      {/* Exit button — top-right */}
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
      {!isLoaded && !error && (
        <div style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          background: '#0a0a0a', color: '#888',
        }}>
          Loading Google 3D Maps...
        </div>
      )}
    </div>
  );
});

Google3DViewer.displayName = 'Google3DViewer';

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

export default Google3DViewer;
