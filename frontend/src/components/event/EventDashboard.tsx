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
 *
 * Quick Start: When no drones are detected, an overlay offers demo mode
 * selection (backend scenarios or client-side simulation).
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
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
import QuickStartOverlay from './QuickStartOverlay';
import { useEventAlerts } from './hooks/useEventAlerts';
import { useBackendStatus } from './hooks/useBackendStatus';
import { useClientDemoMode } from './hooks/useClientDemoMode';
import { useWebSocket } from '../../contexts/WebSocketContext';
import { useWorkflow } from '../../contexts/WorkflowContext';
import { haversineDistance } from '../../utils/geo';
import type { FleetSummary, GeofenceZone } from '../../types/blueUas';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

const EventDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { drones, droneHistory, currentTime, timelineStart } = useWebSocket();
  const { selectedSite, sites, loadSites, selectSite, cuasProfiles, droneProfiles } = useWorkflow();

  // State
  const [selectedDroneId, setSelectedDroneId] = useState<string | null>(null);
  const [activeSidebarPanel, setActiveSidebarPanel] = useState<EventPanel | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [hiddenZoneIds, setHiddenZoneIds] = useState<Set<string>>(new Set());

  // Quick Start state
  const [quickStartDismissed, setQuickStartDismissed] = useState(false);
  const [clientDemoActive, setClientDemoActive] = useState(false);
  const [isLaunchingDemo, setIsLaunchingDemo] = useState(false);

  // Viewer ref for camera controls
  const viewerRef = useRef<Google3DViewerHandle>(null);

  // Backend status + demo mode API
  const { backendAvailable, scenarios, enableDemoMode, isChecking } = useBackendStatus();

  // Client-side demo data
  const { demoDrones, demoDroneHistory, demoGeofenceZones, demoSiteCenter } = useClientDemoMode(clientDemoActive);

  // ─── Data merging: real WebSocket data wins; client demo is fallback ───
  const effectiveDrones = drones.size > 0 ? drones : demoDrones;
  const effectiveDroneHistory = droneHistory.size > 0 ? droneHistory : demoDroneHistory;

  // Geofence zones from site selection
  const siteGeofenceZones = useMemo<GeofenceZone[]>(() => {
    if (!selectedSite?.center) return [];
    return [
      {
        id: 'auth-corridor-1',
        name: 'Authorized Flight Corridor',
        type: 'authorized_corridor' as const,
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
      {
        id: 'restricted-south-1',
        name: 'Restricted Airspace',
        type: 'restricted_airspace' as const,
        center: { lat: selectedSite.center.lat - 0.003, lng: selectedSite.center.lon + 0.001 },
        radiusM: 200,
        minAltitudeM: 0,
        maxAltitudeM: 400,
        fillColor: 'rgba(239, 68, 68, 0.2)',
        strokeColor: '#ef4444',
        fillOpacity: 0.2,
        extruded: true,
        active: true,
      },
    ];
  }, [selectedSite]);

  const effectiveGeofenceZones = siteGeofenceZones.length > 0
    ? siteGeofenceZones
    : clientDemoActive ? demoGeofenceZones : [];

  // Visible zones (filter out hidden)
  const visibleZones = useMemo(
    () => effectiveGeofenceZones.filter(z => !hiddenZoneIds.has(z.id)),
    [effectiveGeofenceZones, hiddenZoneIds],
  );

  // ─── Auto-transition when real data arrives ───
  useEffect(() => {
    if (drones.size > 0) {
      if (clientDemoActive) setClientDemoActive(false);
      if (!quickStartDismissed) setQuickStartDismissed(true);
    }
  }, [drones.size, clientDemoActive, quickStartDismissed]);

  // Quick Start visibility
  const showQuickStart = !quickStartDismissed && effectiveDrones.size === 0 && !isChecking;

  // Alerts (using effective data)
  const { alerts, unacknowledgedCount, acknowledgeAlert, acknowledgeAll } = useEventAlerts(effectiveDrones, effectiveGeofenceZones);

  // Fleet summary (using effective data)
  const fleetSummary = useMemo<FleetSummary>(() => {
    let active = 0, landed = 0, emergency = 0, total = 0;
    effectiveDrones.forEach(drone => {
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
  }, [effectiveDrones, alerts]);

  // Selected drone data (check effective drones)
  const selectedDrone = selectedDroneId ? effectiveDrones.get(selectedDroneId) : null;
  const selectedProfile = selectedDroneId
    ? droneProfiles.find(p => p.id === selectedDroneId) ?? null
    : null;

  // Effective site name (real site or demo label)
  const effectiveSiteName = selectedSite?.name ?? (clientDemoActive ? 'SF Demo Site' : undefined);

  // ─── Scenario-to-site matching ───
  const findMatchingSite = useCallback((scenarioId: string) => {
    if (sites.length === 0) return null;
    if (scenarioId === 'default') {
      const alphaMatch = sites.find(s => /alpha/i.test(s.name));
      if (alphaMatch) return alphaMatch;
    }
    if (scenarioId === 'bmo-field') {
      // Find nearest site to Toronto BMO Field (43.63, -79.42)
      let best = sites[0];
      let bestDist = Infinity;
      for (const s of sites) {
        const d = haversineDistance(s.center.lat, s.center.lon, 43.63, -79.42);
        if (d < bestDist) { bestDist = d; best = s; }
      }
      return best;
    }
    return sites[0];
  }, [sites]);

  // ─── Quick Start handlers ───
  const handleLaunchDemo = useCallback(async (scenarioId: string) => {
    setIsLaunchingDemo(true);
    try {
      const success = await enableDemoMode(scenarioId);
      if (success) {
        await loadSites();
        const match = findMatchingSite(scenarioId);
        if (match) selectSite(match);
        setQuickStartDismissed(true);
      }
    } finally {
      setIsLaunchingDemo(false);
    }
  }, [enableDemoMode, loadSites, findMatchingSite, selectSite]);

  const handleStartClientDemo = useCallback(() => {
    setClientDemoActive(true);
    setQuickStartDismissed(true);
  }, []);

  const handleDismiss = useCallback(() => {
    setQuickStartDismissed(true);
  }, []);

  // ─── Drone interaction handlers ───
  const handleDroneClick = useCallback((droneId: string) => {
    setSelectedDroneId(prev => prev === droneId ? null : droneId);
    setIsTracking(false);
  }, []);

  const handleSelectDroneFromPanel = useCallback((droneId: string) => {
    setSelectedDroneId(droneId);
    setIsTracking(false);
    const drone = effectiveDrones.get(droneId);
    if (drone?.lat != null && drone?.lon != null) {
      viewerRef.current?.flyTo(drone.lat, drone.lon, drone.alt_m ?? 50);
    }
  }, [effectiveDrones]);

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
    const center = selectedSite?.center ?? (clientDemoActive ? { lat: demoSiteCenter.lat, lon: demoSiteCenter.lon, alt_m: 0 } : null);
    if (center) {
      viewerRef.current?.flyTo(center.lat, center.lon, center.alt_m ?? 0, 3000);
    }
  }, [selectedSite, clientDemoActive, demoSiteCenter]);

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
    const drone = effectiveDrones.get(alert.trackerId);
    if (drone?.lat != null && drone?.lon != null) {
      setSelectedDroneId(alert.trackerId);
      viewerRef.current?.flyTo(drone.lat, drone.lon, drone.alt_m ?? 50);
    }
  }, [effectiveDrones]);

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
          siteName={effectiveSiteName}
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
            drones={effectiveDrones}
            droneProfiles={droneProfiles}
            selectedDroneId={selectedDroneId}
            onSelectDrone={handleSelectDroneFromPanel}
            geofenceZones={effectiveGeofenceZones}
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
              droneHistory={effectiveDroneHistory}
              currentTime={currentTime}
              timelineStart={timelineStart}
              currentDroneData={effectiveDrones}
              selectedDroneId={selectedDroneId}
              onDroneClick={handleDroneClick}
              droneProfiles={droneProfiles}
              cuasPlacements={[]}
              cuasProfiles={cuasProfiles}
              geofenceZones={visibleZones}
              showLabels={showLabels}
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

            {/* Quick Start overlay */}
            {showQuickStart && (
              <QuickStartOverlay
                scenarios={scenarios}
                backendAvailable={backendAvailable}
                isLoading={isLaunchingDemo}
                onLaunchDemo={handleLaunchDemo}
                onStartClientDemo={handleStartClientDemo}
                onDismiss={handleDismiss}
              />
            )}
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
