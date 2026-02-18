/**
 * EventDashboard — Full command-center layout for Blue UAS event monitoring.
 *
 * Layout:
 * +------------------------------------------------------------------+
 * |  EventStatusBar (back btn, branding, status, counts, alerts, clock)
 * +------+-------------------------------------------+---------------+
 * | Icon |  [CameraPresetsOverlay]                   | DroneDetail   |
 * | Side |        Google 3D Map Viewer               | Panel (320px) |
 * | bar  |  [EventSidebarPanel, 280px]               | (when drone   |
 * | 56px |  (overlays map when open)                 |  selected)    |
 * +------+-------------------------------------------+---------------+
 */

import React, { useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { APIProvider } from '@vis.gl/react-google-maps';
import Google3DViewer from '../google3d/Google3DViewer';
import type { Google3DViewerHandle } from '../google3d/Google3DViewer';
import EventStatusBar from './EventStatusBar';
import EventSidebar from './EventSidebar';
import type { EventPanel } from './EventSidebar';
import EventSidebarPanel from './EventSidebarPanel';
import DroneDetailPanel from './DroneDetailPanel';
import CameraPresetsOverlay from './CameraPresetsOverlay';
import { useEventAlerts } from './hooks/useEventAlerts';
import { useWebSocket } from '../../contexts/WebSocketContext';
import { useWorkflow } from '../../contexts/WorkflowContext';
import type { FleetSummary, GeofenceZone } from '../../types/blueUas';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

const EventDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { drones, droneHistory, currentTime, timelineStart } = useWebSocket();
  const { selectedSite, cuasProfiles, droneProfiles } = useWorkflow();

  // State
  const [selectedDroneId, setSelectedDroneId] = useState<string | null>(null);
  const [activeSidebarPanel, setActiveSidebarPanel] = useState<EventPanel | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [hiddenZoneIds, setHiddenZoneIds] = useState<Set<string>>(new Set());

  // Viewer ref for camera controls
  const viewerRef = useRef<Google3DViewerHandle>(null);

  // Geofence zones
  const geofenceZones = useMemo<GeofenceZone[]>(() => {
    if (!selectedSite?.center) return [];
    return [
      {
        id: 'auth-corridor-1',
        name: 'Authorized Flight Corridor',
        type: 'authorized_corridor',
        center: { lat: selectedSite.center.lat, lng: selectedSite.center.lon },
        radiusM: 500,
        minAltitudeM: 30,
        maxAltitudeM: 120,
        fillColor: 'rgba(34, 197, 94, 0.15)',
        strokeColor: '#22c55e',
        fillOpacity: 0.15,
        extruded: true,
        active: true,
      },
    ];
  }, [selectedSite]);

  // Visible zones (filter out hidden)
  const visibleZones = useMemo(
    () => geofenceZones.filter(z => !hiddenZoneIds.has(z.id)),
    [geofenceZones, hiddenZoneIds],
  );

  // Alerts
  const { alerts, unacknowledgedCount, acknowledgeAlert, acknowledgeAll } = useEventAlerts(drones, geofenceZones);

  // Fleet summary
  const fleetSummary = useMemo<FleetSummary>(() => {
    let active = 0, landed = 0, emergency = 0, total = 0;
    drones.forEach(drone => {
      total++;
      if (drone.is_stale) landed++;
      else active++;
    });
    return {
      totalDrones: total,
      activeDrones: active,
      landedDrones: landed,
      emergencyDrones: emergency,
      geofenceBreaches: alerts.filter(a => a.type === 'geofence_breach' && !a.acknowledged).length,
      overallStatus: emergency > 0 ? 'alert' : alerts.some(a => a.severity === 'critical' && !a.acknowledged) ? 'warning' : 'nominal',
    };
  }, [drones, alerts]);

  // Selected drone data
  const selectedDrone = selectedDroneId ? drones.get(selectedDroneId) : null;
  const selectedProfile = selectedDroneId
    ? droneProfiles.find(p => p.id === selectedDroneId) ?? null
    : null;

  // Handlers
  const handleDroneClick = useCallback((droneId: string) => {
    setSelectedDroneId(prev => prev === droneId ? null : droneId);
    setIsTracking(false);
  }, []);

  const handleSelectDroneFromPanel = useCallback((droneId: string) => {
    setSelectedDroneId(droneId);
    setIsTracking(false);
    // Fly to drone
    const drone = drones.get(droneId);
    if (drone?.lat != null && drone?.lon != null) {
      viewerRef.current?.flyTo(drone.lat, drone.lon, drone.alt_m ?? 50);
    }
  }, [drones]);

  const handleCloseDetail = useCallback(() => {
    setSelectedDroneId(null);
    setIsTracking(false);
  }, []);

  const handleFlyTo = useCallback(() => {
    if (!selectedDrone?.lat || !selectedDrone?.lon) return;
    viewerRef.current?.flyTo(selectedDrone.lat, selectedDrone.lon, selectedDrone.alt_m ?? 50);
  }, [selectedDrone]);

  const handleTrackDrone = useCallback(() => {
    setIsTracking(prev => !prev);
  }, []);

  const handleOrbitDrone = useCallback(() => {
    if (!selectedDrone?.lat || !selectedDrone?.lon) return;
    viewerRef.current?.flyTo(selectedDrone.lat, selectedDrone.lon, selectedDrone.alt_m ?? 50, 400);
    setTimeout(() => viewerRef.current?.startOrbit(10000), 1800);
  }, [selectedDrone]);

  // Camera presets
  const handleOverview = useCallback(() => {
    if (selectedSite?.center) {
      viewerRef.current?.flyTo(selectedSite.center.lat, selectedSite.center.lon, selectedSite.center.alt_m ?? 0, 3000);
    }
  }, [selectedSite]);

  const handleOrbitVenue = useCallback(() => {
    viewerRef.current?.startOrbit(15000);
  }, []);

  const handleFollowDrone = useCallback(() => {
    handleFlyTo();
    setIsTracking(true);
  }, [handleFlyTo]);

  const handleResetCamera = useCallback(() => {
    viewerRef.current?.resetCamera();
  }, []);

  const handleToggleLabels = useCallback(() => {
    setShowLabels(prev => !prev);
  }, []);

  const handleToggleZone = useCallback((id: string) => {
    setHiddenZoneIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleAlertClick = useCallback((alert: { trackerId: string }) => {
    const drone = drones.get(alert.trackerId);
    if (drone?.lat != null && drone?.lon != null) {
      setSelectedDroneId(alert.trackerId);
      viewerRef.current?.flyTo(drone.lat, drone.lon, drone.alt_m ?? 50);
    }
  }, [drones]);

  const handleAlertBellClick = useCallback(() => {
    setActiveSidebarPanel(prev => prev === 'alerts' ? null : 'alerts');
  }, []);

  // API key guard
  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        height: '100vh', background: '#0a0a0a', color: '#ef4444',
        flexDirection: 'column', gap: 8,
      }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Google Maps API Key Required</div>
        <div style={{ color: '#888', fontSize: 13, maxWidth: 400, textAlign: 'center' }}>
          Set VITE_GOOGLE_MAPS_API_KEY in your .env file with a key that has
          Maps JavaScript API enabled.
        </div>
      </div>
    );
  }

  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY} version="alpha">
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: '#0a0a0a',
      }}>
        {/* Top bar */}
        <EventStatusBar
          summary={fleetSummary}
          siteName={selectedSite?.name}
          alertCount={unacknowledgedCount}
          onNavigateBack={() => navigate('/')}
          onAlertClick={handleAlertBellClick}
        />

        {/* Main content area */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left sidebar icon strip */}
          <EventSidebar
            activePanel={activeSidebarPanel}
            onPanelChange={setActiveSidebarPanel}
            alertCount={unacknowledgedCount}
          />

          {/* Expandable sidebar panel */}
          <EventSidebarPanel
            activePanel={activeSidebarPanel}
            drones={drones}
            droneProfiles={droneProfiles}
            selectedDroneId={selectedDroneId}
            onSelectDrone={handleSelectDroneFromPanel}
            geofenceZones={geofenceZones}
            hiddenZoneIds={hiddenZoneIds}
            onToggleZone={handleToggleZone}
            alerts={alerts}
            onAcknowledgeAlert={acknowledgeAlert}
            onAcknowledgeAll={acknowledgeAll}
            onAlertClick={handleAlertClick}
          />

          {/* Map area */}
          <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
            <Google3DViewer
              ref={viewerRef}
              mode="event"
              site={selectedSite}
              initialCameraState={selectedSite?.camera_state_3d}
              droneHistory={droneHistory}
              currentTime={currentTime}
              timelineStart={timelineStart}
              currentDroneData={drones}
              selectedDroneId={selectedDroneId}
              onDroneClick={handleDroneClick}
              droneProfiles={droneProfiles}
              cuasPlacements={[]}
              cuasProfiles={cuasProfiles}
              geofenceZones={visibleZones}
            />

            {/* Camera presets overlay */}
            <CameraPresetsOverlay
              onOverview={handleOverview}
              onOrbitVenue={handleOrbitVenue}
              onFollowDrone={handleFollowDrone}
              onReset={handleResetCamera}
              showLabels={showLabels}
              onToggleLabels={handleToggleLabels}
              hasDroneSelected={!!selectedDroneId}
            />
          </div>

          {/* Right detail panel */}
          {selectedDrone && (
            <DroneDetailPanel
              drone={selectedDrone}
              profile={selectedProfile}
              onClose={handleCloseDetail}
              onFlyTo={handleFlyTo}
              onTrackDrone={handleTrackDrone}
              onOrbitDrone={handleOrbitDrone}
              isTracking={isTracking}
            />
          )}
        </div>
      </div>
    </APIProvider>
  );
};

export default EventDashboard;
