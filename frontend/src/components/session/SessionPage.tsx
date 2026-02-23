/**
 * SessionPage — Route entry and layout shell for /session/:id/live.
 *
 * EventDashboard-style layout with SessionConsole domain features:
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ SessionStatusBar (44px)                                            │
 * ├──────┬─────────┬──────────────────────────────┬────────────────────┤
 * │ Icon │ Sidebar │        Map Area              │  Detail Panel     │
 * │ 56px │ 280px   │     (Google 3D)              │  320px            │
 * │      │ (opt)   │                              │  (contextual)     │
 * ├──────┴─────────┴──────────────────────────────┴────────────────────┤
 * │ [Quick Actions Toolbar - floating]                                 │
 * └────────────────────────────────────────────────────────────────────┘
 *
 * Responsive rule: Below 1600px, opening right panel auto-collapses left.
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { APIProvider } from '@vis.gl/react-google-maps';
import { useWebSocket } from '../../contexts/WebSocketContext';
import { useWorkflow } from '../../contexts/WorkflowContext';
import { useTestSessionPhase } from '../../contexts/TestSessionPhaseContext';
import { useToast } from '../../contexts/ToastContext';
import { useSessionData } from './hooks/useSessionData';
import { useSessionAlerts } from './hooks/useSessionAlerts';
import { useSessionKeyboard } from './hooks/useSessionKeyboard';
import SessionStatusBar from './SessionStatusBar';
import SessionSidebar from './SessionSidebar';
import type { SessionPanel } from './SessionSidebar';
import SessionSidebarPanel from './SessionSidebarPanel';
import SessionDetailPanel from './SessionDetailPanel';
import type { DetailContext } from './SessionDetailPanel';
import SessionQuickActions from './SessionQuickActions';
import SessionMapArea from './SessionMapArea';
import type { SessionMapAreaHandle } from './SessionMapArea';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import TimelineControl from '../TimelineControl';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

const SessionPage: React.FC = () => {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { showToast } = useToast();
  const {
    currentTime, setCurrentTime,
    timelineStart, timelineEnd,
    isLive: wsIsLive, setIsLive: wsSetIsLive,
    timeRange, setTimeRange,
  } = useWebSocket();
  const {
    selectedSite, cuasProfiles, droneProfiles, addEvent, sites, selectSite,
  } = useWorkflow();
  const {
    currentPhase, activeSession, phaseDuration, stopTest,
    cuasJamStates, toggleJamState: _toggleJamState, loadSessionById,
    engagements, activeEngagements,
    quickEngage, createEngagement, engage, disengage,
    activeBursts, jamOn, jamOff,
  } = useTestSessionPhase();

  // Centralized filtered data
  const {
    sessionDrones, sessionDroneHistory, sessionAlerts: rawSessionAlerts,
    sessionTrackerIds, cuasPlacements, assetPlacements, events,
    sessionName, isLive, isCompleted, connectionStatus,
  } = useSessionData();

  // Alerts
  const { alerts, unacknowledgedCount, acknowledgeAlert, acknowledgeAll } = useSessionAlerts(
    sessionDrones, rawSessionAlerts, events,
  );

  // UI state
  const [activeSidebarPanel, setActiveSidebarPanel] = useState<SessionPanel | null>('operations');
  const [detailContext, setDetailContext] = useState<DetailContext>(null);
  const [tacticalMode, setTacticalMode] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [selectedCuasId, setSelectedCuasId] = useState<string | null>(null);
  const [selectedDroneId, setSelectedDroneId] = useState<string | null>(null);
  const [engagementModeCuasId, setEngagementModeCuasId] = useState<string | null>(null);
  const [trackingDroneId, setTrackingDroneId] = useState<string | null>(null);
  const [engageElapsedSeconds, setEngageElapsedSeconds] = useState(0);

  const mapRef = useRef<SessionMapAreaHandle>(null);
  const isNarrow = useMediaQuery('(max-width: 1600px)');

  // Auto-collapse left panel on narrow screens when detail panel is open
  useEffect(() => {
    if (isNarrow && detailContext) {
      setActiveSidebarPanel(null);
    }
  }, [isNarrow, detailContext]);

  // Load session by URL parameter
  useEffect(() => {
    if (sessionId && (!activeSession || activeSession.id !== sessionId)) {
      loadSessionById(sessionId);
    }
  }, [sessionId, activeSession, loadSessionById]);

  // Redirect if no session
  useEffect(() => {
    if (currentPhase === 'idle' && !activeSession && !sessionId) {
      navigate('/');
    }
  }, [currentPhase, activeSession, sessionId, navigate]);

  // Ensure site is selected in WorkflowContext
  const sessionSite = useMemo(() => {
    if (activeSession?.site_id) {
      const site = sites.find(s => s.id === activeSession.site_id);
      if (site) return site;
    }
    return selectedSite ?? null;
  }, [activeSession, sites, selectedSite]);

  useEffect(() => {
    if (sessionSite && (!selectedSite || selectedSite.id !== sessionSite.id)) {
      selectSite(sessionSite);
    }
  }, [sessionSite, selectedSite, selectSite]);

  // Jam state summary
  const activeJammerCount = useMemo(
    () => Array.from(cuasJamStates.values()).filter(v => v).length,
    [cuasJamStates],
  );
  const isAnyJamming = activeJammerCount > 0;

  // Connected tracker count
  const connectedCount = useMemo(
    () => Array.from(sessionDrones.values()).filter(d => !d.is_stale).length,
    [sessionDrones],
  );

  // Active engagement info for toolbar
  const activeEngInfo = useMemo(() => {
    if (activeEngagements.size === 0) return null;
    const eng = Array.from(activeEngagements.values())[0];
    const target = eng.targets?.[0];
    const drone = target ? sessionDrones.get(target.tracker_id) : null;
    const placement = cuasPlacements.find(p => p.id === eng.cuas_placement_id);
    let distance: number | undefined;
    if (drone?.lat != null && drone?.lon != null && placement?.position) {
      const dLat = (drone.lat - placement.position.lat) * 111320;
      const dLon = (drone.lon - placement.position.lon) * 111320 * Math.cos(placement.position.lat * Math.PI / 180);
      distance = Math.sqrt(dLat * dLat + dLon * dLon);
    }
    return {
      cuasName: eng.cuas_name ?? 'CUAS',
      droneName: drone?.alias ?? target?.tracker_id ?? 'Drone',
      distance,
      gpsOk: drone?.fix_valid ?? true,
      engageTimestamp: eng.engage_timestamp,
    };
  }, [activeEngagements, sessionDrones, cuasPlacements]);

  // Elapsed timer for active engagement
  useEffect(() => {
    if (!activeEngInfo?.engageTimestamp) {
      setEngageElapsedSeconds(0);
      return;
    }
    const startMs = new Date(activeEngInfo.engageTimestamp).getTime();
    const update = () => setEngageElapsedSeconds(Math.floor((Date.now() - startMs) / 1000));
    update();
    const interval = window.setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [activeEngInfo?.engageTimestamp]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleNavigateBack = useCallback(() => navigate('/'), [navigate]);

  const handleStopSession = useCallback(async () => {
    try {
      await stopTest();
      showToast('success', 'Session stopped');
    } catch {
      showToast('error', 'Failed to stop session');
    }
  }, [stopTest, showToast]);

  // Drone click: if in engagement mode, create engagement; otherwise show detail
  const handleDroneClick = useCallback(async (droneId: string) => {
    if (engagementModeCuasId) {
      try {
        const engagement = await createEngagement(engagementModeCuasId, [droneId]);
        if (engagement) {
          await engage(engagement.id);
          showToast('success', `Engaged drone ${droneId}`);
        }
      } catch {
        showToast('error', 'Failed to create engagement');
      }
      setEngagementModeCuasId(null);
      return;
    }
    // If no active engagement, select this drone for the toolbar
    if (activeEngagements.size === 0) {
      setSelectedDroneId(droneId);
    }
    setDetailContext({ type: 'drone', droneId });
  }, [engagementModeCuasId, activeEngagements, createEngagement, engage, showToast]);

  const handleCuasClick = useCallback((cuasId: string) => {
    setEngagementModeCuasId(cuasId);
    setDetailContext({ type: 'cuas', cuasId });
  }, []);

  const handleSelectEngagement = useCallback((engagementId: string) => {
    setDetailContext({ type: 'engagement', engagementId });
  }, []);

  const handleCloseDetail = useCallback(() => {
    setDetailContext(null);
    setTrackingDroneId(null);
  }, []);

  const handleFlyToDrone = useCallback((droneId: string) => {
    const drone = sessionDrones.get(droneId);
    if (drone?.lat != null && drone?.lon != null) {
      mapRef.current?.flyTo(drone.lat, drone.lon, drone.alt_m ?? 50);
    }
  }, [sessionDrones]);

  const handleTrackDrone = useCallback((droneId: string) => {
    setTrackingDroneId(prev => prev === droneId ? null : droneId);
  }, []);

  const handleAlertBellClick = useCallback(() => {
    setActiveSidebarPanel(prev => prev === 'activity' ? null : 'activity');
  }, []);

  const handleAlertClick = useCallback((alert: { trackerId?: string }) => {
    if (alert.trackerId) {
      const drone = sessionDrones.get(alert.trackerId);
      if (drone?.lat != null && drone?.lon != null) {
        setDetailContext({ type: 'drone', droneId: alert.trackerId });
        mapRef.current?.flyTo(drone.lat, drone.lon, drone.alt_m ?? 50);
      }
    }
  }, [sessionDrones]);

  // Quick action handlers — simplified: no separate JAM toggle
  const handleEngage = useCallback(async () => {
    if (!selectedCuasId || !selectedDroneId) {
      showToast('warning', 'Select CUAS and drone first');
      return;
    }
    try {
      const result = await quickEngage(selectedCuasId, selectedDroneId);
      if (result) {
        showToast('success', `Engaged → ${selectedDroneId}`);
      }
    } catch {
      showToast('error', 'Failed to engage');
    }
  }, [selectedCuasId, selectedDroneId, quickEngage, showToast]);

  const handleDisengage = useCallback(async () => {
    if (activeEngagements.size === 1) {
      const engId = Array.from(activeEngagements.keys())[0];
      try {
        const result = await disengage(engId);
        if (result?.metrics) {
          const tte = result.metrics.time_to_effect_s;
          showToast('success', `Disengaged — TTE: ${tte ? tte.toFixed(1) + 's' : '--'}`);
        } else {
          showToast('success', 'Disengaged');
        }
      } catch {
        showToast('error', 'Failed to disengage');
      }
    }
  }, [activeEngagements, disengage, showToast]);

  // ─── CUAS detail panel engagement/jam handlers ─────────────────────────────

  const handleCuasEngage = useCallback(async (cuasPlacementId: string, selectedTrackerIds: string[]) => {
    try {
      const engagement = await createEngagement(cuasPlacementId, selectedTrackerIds);
      if (engagement) {
        await engage(engagement.id);
        showToast('success', `Engaged ${selectedTrackerIds.length} target(s)`);
      }
    } catch {
      showToast('error', 'Failed to create engagement');
    }
  }, [createEngagement, engage, showToast]);

  const handleCuasJamOn = useCallback(async (engagementId: string, params?: { frequency_mhz?: number; power_dbm?: number; bandwidth_mhz?: number; notes?: string }) => {
    try {
      await jamOn(engagementId, params);
    } catch {
      showToast('error', 'Failed to start jam burst');
    }
  }, [jamOn, showToast]);

  const handleCuasJamOff = useCallback(async (engagementId: string) => {
    try {
      await jamOff(engagementId);
    } catch {
      showToast('error', 'Failed to stop jam burst');
    }
  }, [jamOff, showToast]);

  // Build droneProfileMap for model thumbnails (applies model_3d_override)
  const droneProfileMap = useMemo(() => {
    const map = new Map<string, import('../../types/workflow').DroneProfile>();
    const assignments = activeSession?.tracker_assignments;
    if (assignments && droneProfiles) {
      for (const a of assignments) {
        const profile = droneProfiles.find(p => p.id === a.drone_profile_id);
        if (profile) {
          const effective = a.model_3d_override
            ? { ...profile, model_3d: a.model_3d_override }
            : profile;
          map.set(a.tracker_id, effective);
        }
      }
    }
    return map;
  }, [activeSession?.tracker_assignments, droneProfiles]);

  // Model override handlers (PATCH to backend + refresh session)
  const handleDroneModelOverride = useCallback(async (trackerId: string, modelId: string | undefined) => {
    if (!activeSession) return;
    // Find the assignment row ID for this tracker
    const assignment = activeSession.tracker_assignments?.find(a => a.tracker_id === trackerId);
    if (!assignment) return;
    try {
      await fetch(`/api/v2/sessions/${activeSession.id}/tracker-assignments/${assignment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_3d_override: modelId ?? '' }),
      });
      // Reload session to pick up updated assignments
      loadSessionById(activeSession.id);
    } catch (err) {
      showToast('error', 'Failed to update model');
    }
  }, [activeSession, loadSessionById, showToast]);

  const handleCuasModelOverride = useCallback(async (cuasPlacementId: string, modelId: string | undefined) => {
    if (!activeSession) return;
    try {
      await fetch(`/api/v2/sessions/${activeSession.id}/cuas-placements/${cuasPlacementId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_3d_override: modelId ?? '' }),
      });
      loadSessionById(activeSession.id);
    } catch (err) {
      showToast('error', 'Failed to update CUAS model');
    }
  }, [activeSession, loadSessionById, showToast]);

  const handleCuasDisengage = useCallback(async (engagementId: string) => {
    try {
      const result = await disengage(engagementId);
      if (result?.metrics) {
        const tte = result.metrics.time_to_effect_s;
        showToast('success', `Disengaged — TTE: ${tte ? tte.toFixed(1) + 's' : '--'}`);
      } else {
        showToast('success', 'Disengaged');
      }
      setDetailContext(null);
    } catch {
      showToast('error', 'Failed to disengage');
    }
  }, [disengage, showToast]);

  const handleMarkEvent = useCallback(async (type: string, note?: string) => {
    if (!activeSession) return;
    await addEvent(activeSession.id, {
      type: type as any,
      timestamp: new Date().toISOString(),
      source: 'manual',
      note,
    });
    showToast('info', `Event: ${type.replace(/_/g, ' ')}`);
  }, [activeSession, addEvent, showToast]);

  const handleSubmitNote = useCallback(() => {
    if (noteText.trim()) {
      handleMarkEvent('note', noteText.trim());
    }
    setNoteText('');
    setShowNoteInput(false);
  }, [noteText, handleMarkEvent]);

  // Keyboard shortcuts (J removed — jam is automatic with engage/disengage)
  useSessionKeyboard({
    onJam: () => {}, // No-op: jam is now automatic
    onEngage: handleEngage,
    onDisengage: handleDisengage,
    onLaunch: () => handleMarkEvent('launch'),
    onRecover: () => handleMarkEvent('recover'),
    onFailsafe: () => handleMarkEvent('failsafe'),
    onNote: () => setShowNoteInput(true),
    onToggleTactical: () => setTacticalMode(prev => !prev),
    onEscape: () => {
      if (engagementModeCuasId) { setEngagementModeCuasId(null); return; }
      if (showNoteInput) { setShowNoteInput(false); return; }
      if (detailContext) { handleCloseDetail(); return; }
      if (activeSidebarPanel) { setActiveSidebarPanel(null); return; }
    },
    onToggleToolbar: () => setShowToolbar(prev => !prev),
  }, isLive && !isCompleted);

  // Auto-open engagements tab when engagement starts
  useEffect(() => {
    if (activeEngagements.size > 0 && activeSidebarPanel !== 'engagements') {
      setActiveSidebarPanel('engagements');
    }
  }, [activeEngagements.size]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track selected drone camera follow
  useEffect(() => {
    if (!trackingDroneId) return;
    const drone = sessionDrones.get(trackingDroneId);
    if (drone?.lat != null && drone?.lon != null) {
      mapRef.current?.flyTo(drone.lat, drone.lon, drone.alt_m ?? 50);
    }
  }, [trackingDroneId, sessionDrones]);

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
          Set VITE_GOOGLE_MAPS_API_KEY in your .env file with a key that has Maps JavaScript API enabled.
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
        background: tacticalMode ? '#000000' : '#0a0a0a',
      }}>
        {/* Top status bar */}
        <SessionStatusBar
          sessionName={sessionName}
          duration={phaseDuration}
          isRecording={isLive}
          isCompleted={isCompleted}
          trackerCount={sessionTrackerIds.size}
          connectedTrackerCount={connectedCount}
          activeEngagementCount={activeEngagements.size}
          isJamming={isAnyJamming}
          alertCount={unacknowledgedCount}
          connectionStatus={connectionStatus}
          tacticalMode={tacticalMode}
          onNavigateBack={handleNavigateBack}
          onAlertClick={handleAlertBellClick}
          onToggleTacticalMode={() => setTacticalMode(prev => !prev)}
          onStopSession={handleStopSession}
        />

        {/* Main content */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left sidebar icon strip */}
          <SessionSidebar
            activePanel={activeSidebarPanel}
            onPanelChange={setActiveSidebarPanel}
            alertCount={unacknowledgedCount}
            activeEngagementCount={activeEngagements.size}
            tacticalMode={tacticalMode}
          />

          {/* Collapsible sidebar panel */}
          <SessionSidebarPanel
            activePanel={activeSidebarPanel}
            tacticalMode={tacticalMode}
            drones={sessionDrones}
            cuasPlacements={cuasPlacements}
            cuasProfiles={cuasProfiles}
            cuasJamStates={cuasJamStates}
            selectedDroneId={selectedDroneId}
            selectedCuasId={selectedCuasId}
            onSelectDrone={(id) => {
              setDetailContext({ type: 'drone', droneId: id });
              handleFlyToDrone(id);
            }}
            onSelectCuas={(id) => setDetailContext({ type: 'cuas', cuasId: id })}
            engagements={engagements}
            activeEngagements={activeEngagements}
            onSelectEngagement={handleSelectEngagement}
            currentDroneData={sessionDrones}
            alerts={alerts}
            events={events}
            onAcknowledgeAlert={acknowledgeAlert}
            onAcknowledgeAll={acknowledgeAll}
            onAlertClick={handleAlertClick}
            onOpenLog={() => setDetailContext({ type: 'log' })}
            droneProfileMap={droneProfileMap}
          />

          {/* Map area */}
          <SessionMapArea
            ref={mapRef}
            site={sessionSite}
            droneHistory={sessionDroneHistory}
            currentTime={currentTime}
            timelineStart={timelineStart}
            currentDroneData={sessionDrones}
            selectedDroneId={selectedDroneId}
            onDroneClick={handleDroneClick}
            droneProfiles={droneProfiles}
            droneProfileMap={droneProfileMap}
            cuasPlacements={cuasPlacements}
            assetPlacements={assetPlacements}
            cuasProfiles={cuasProfiles}
            cuasJamStates={cuasJamStates}
            onCuasClick={handleCuasClick}
            engagementModeCuasId={engagementModeCuasId}
            engagements={engagements}
            activeBursts={activeBursts}
            tacticalMode={tacticalMode}
            showNoteInput={showNoteInput}
            noteText={noteText}
            onNoteTextChange={setNoteText}
            onSubmitNote={handleSubmitNote}
            onCancelNote={() => { setShowNoteInput(false); setNoteText(''); }}
          />

          {/* Right detail panel */}
          <SessionDetailPanel
            context={detailContext}
            tacticalMode={tacticalMode}
            onClose={handleCloseDetail}
            drones={sessionDrones}
            onFlyToDrone={handleFlyToDrone}
            onTrackDrone={handleTrackDrone}
            trackingDroneId={trackingDroneId}
            engagements={engagements}
            cuasPlacements={cuasPlacements}
            cuasProfiles={cuasProfiles}
            cuasJamStates={cuasJamStates}
            sessionTrackerIds={sessionTrackerIds}
            activeEngagements={activeEngagements}
            activeBursts={activeBursts}
            isLive={isLive}
            trackerAssignments={activeSession?.tracker_assignments}
            onCuasEngage={handleCuasEngage}
            onCuasJamOn={handleCuasJamOn}
            onCuasJamOff={handleCuasJamOff}
            onCuasDisengage={handleCuasDisengage}
            droneProfileMap={droneProfileMap}
            onDroneModelOverride={handleDroneModelOverride}
            onCuasModelOverride={handleCuasModelOverride}
            onLogRowClick={(row) => {
              if (row.lat != null && row.lon != null) {
                mapRef.current?.flyTo(row.lat, row.lon, row.alt_m ?? 50);
              }
              setCurrentTime(row.timestamp_ms);
            }}
          />

          {/* Floating quick actions */}
          <SessionQuickActions
            tacticalMode={tacticalMode}
            isLive={isLive}
            isCompleted={isCompleted}
            hasActiveEngagement={activeEngagements.size > 0}
            showToolbar={showToolbar}
            cuasPlacements={cuasPlacements}
            cuasProfiles={cuasProfiles}
            sessionDrones={sessionDrones}
            selectedCuasId={selectedCuasId}
            selectedDroneId={selectedDroneId}
            onSelectCuas={setSelectedCuasId}
            onSelectDrone={setSelectedDroneId}
            activeCuasName={activeEngInfo?.cuasName}
            activeDroneName={activeEngInfo?.droneName}
            activeElapsedSeconds={activeEngagements.size > 0 ? engageElapsedSeconds : undefined}
            activeDistanceM={activeEngInfo?.distance}
            activeGpsOk={activeEngInfo?.gpsOk}
            onEngage={handleEngage}
            onDisengage={handleDisengage}
            onLaunch={() => handleMarkEvent('launch')}
            onRecover={() => handleMarkEvent('recover')}
            onFailsafe={() => handleMarkEvent('failsafe')}
            onNote={() => setShowNoteInput(true)}
          />
        </div>

        {/* Timeline Control — flexShrink:0 prevents flex:1 in .timeline-control from expanding vertically */}
        <div style={{ flexShrink: 0, padding: '6px 12px 8px' }}>
          <TimelineControl
            isLive={wsIsLive}
            setIsLive={wsSetIsLive}
            timeRange={timeRange}
            setTimeRange={setTimeRange}
            currentTime={currentTime}
            setCurrentTime={setCurrentTime}
            timelineStart={timelineStart}
            timelineEnd={timelineEnd}
            connectionStatus={connectionStatus as 'connected' | 'disconnected' | 'connecting'}
            engagements={engagements}
          />
        </div>
      </div>
    </APIProvider>
  );
};

export default SessionPage;
