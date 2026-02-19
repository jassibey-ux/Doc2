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
    cuasJamStates, toggleJamState, loadSessionById,
    engagements, activeEngagements,
    quickEngage, createEngagement, engage, disengage,
    activeBursts,
  } = useTestSessionPhase();

  // Centralized filtered data
  const {
    sessionDrones, sessionDroneHistory, sessionAlerts: rawSessionAlerts,
    sessionTrackerIds, cuasPlacements, events,
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
  const [engagementModeCuasId, setEngagementModeCuasId] = useState<string | null>(null);
  const [trackingDroneId, setTrackingDroneId] = useState<string | null>(null);

  const mapRef = useRef<SessionMapAreaHandle>(null);
  const isNarrow = useMediaQuery('(max-width: 1600px)');

  // Selected IDs for sidebar highlighting
  const selectedDroneId = detailContext?.type === 'drone' ? detailContext.droneId : null;
  const selectedCuasId = detailContext?.type === 'cuas' ? detailContext.cuasId : null;

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

  // Drone selection: if in engagement mode, create engagement
  const handleDroneClick = useCallback(async (droneId: string) => {
    if (engagementModeCuasId) {
      try {
        const engagement = await createEngagement(engagementModeCuasId, [droneId]);
        if (engagement) {
          await engage(engagement.id);
          showToast('success', `Engaged → ${droneId}`);
        }
      } catch {
        showToast('error', 'Failed to create engagement');
      }
      setEngagementModeCuasId(null);
      return;
    }
    setDetailContext({ type: 'drone', droneId });
  }, [engagementModeCuasId, createEngagement, engage, showToast]);

  const handleCuasClick = useCallback((cuasId: string) => {
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

  // Quick action handlers
  const handleJamToggle = useCallback(async () => {
    if (cuasPlacements.length === 1) {
      await toggleJamState(cuasPlacements[0].id);
    } else if (cuasPlacements.length > 1) {
      // Toggle first non-jamming, or turn off first jamming
      const firstJamming = cuasPlacements.find(p => cuasJamStates.get(p.id));
      const target = firstJamming || cuasPlacements[0];
      await toggleJamState(target.id);
    }
  }, [cuasPlacements, cuasJamStates, toggleJamState]);

  const handleEngage = useCallback(async () => {
    if (cuasPlacements.length === 1) {
      setEngagementModeCuasId(cuasPlacements[0].id);
      showToast('info', 'Click a drone to engage');
    } else if (cuasPlacements.length > 1) {
      // If only one CUAS, use it. Otherwise enter engagement mode.
      setEngagementModeCuasId(cuasPlacements[0].id);
      showToast('info', 'Click a drone to engage');
    } else {
      try {
        await quickEngage();
      } catch {
        showToast('error', 'No CUAS available to engage');
      }
    }
  }, [cuasPlacements, quickEngage, showToast]);

  const handleDisengage = useCallback(async () => {
    if (activeEngagements.size === 1) {
      const engId = Array.from(activeEngagements.keys())[0];
      try {
        const result = await disengage(engId);
        if (result?.metrics) {
          const tte = result.metrics.time_to_effect_s;
          showToast('success', `Disengaged — TTE: ${tte ? tte.toFixed(1) + 's' : '--'}`);
        }
      } catch {
        showToast('error', 'Failed to disengage');
      }
    }
  }, [activeEngagements, disengage, showToast]);

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

  // Keyboard shortcuts
  useSessionKeyboard({
    onJam: handleJamToggle,
    onEngage: handleEngage,
    onDisengage: handleDisengage,
    onLaunch: () => handleMarkEvent('launch'),
    onRecover: () => handleMarkEvent('recover'),
    onFailsafe: () => handleMarkEvent('failsafe'),
    onNote: () => setShowNoteInput(true),
    onToggleTactical: () => setTacticalMode(prev => !prev),
    onEscape: () => {
      if (showNoteInput) { setShowNoteInput(false); return; }
      if (engagementModeCuasId) { setEngagementModeCuasId(null); return; }
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
            alerts={alerts}
            events={events}
            onAcknowledgeAlert={acknowledgeAlert}
            onAcknowledgeAll={acknowledgeAll}
            onAlertClick={handleAlertClick}
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
            cuasPlacements={cuasPlacements}
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
          />

          {/* Floating quick actions */}
          <SessionQuickActions
            tacticalMode={tacticalMode}
            isLive={isLive}
            isCompleted={isCompleted}
            hasActiveEngagement={activeEngagements.size > 0}
            isJamming={isAnyJamming}
            showToolbar={showToolbar}
            onToggleToolbar={() => setShowToolbar(prev => !prev)}
            onEngage={handleEngage}
            onDisengage={handleDisengage}
            onJamToggle={handleJamToggle}
            onLaunch={() => handleMarkEvent('launch')}
            onRecover={() => handleMarkEvent('recover')}
            onFailsafe={() => handleMarkEvent('failsafe')}
            onNote={() => setShowNoteInput(true)}
          />
        </div>

        {/* Timeline Control */}
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
    </APIProvider>
  );
};

export default SessionPage;
