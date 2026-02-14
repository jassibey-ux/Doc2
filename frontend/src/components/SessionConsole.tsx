/**
 * Session Console - Focused view for active recording sessions
 * 3-panel layout inspired by Monitoring Console
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useParams, useBlocker } from 'react-router-dom';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useWorkflow } from '../contexts/WorkflowContext';
import { useTestSessionPhase } from '../contexts/TestSessionPhaseContext';
import { useToast } from '../contexts/ToastContext';
import { GlassButton, Badge } from './ui/GlassUI';
import MapComponent from './Map';
import Map3DViewer from './Map3DViewer';
import CesiumMap from './CesiumMap';
import DroneDetailPanel from './DroneDetailPanel';
import type { TestEvent, CUASPlacement, CUASProfile, JamBurst } from '../types/workflow';
import type { DroneSummary, PositionPoint } from '../types/drone';
import {
  ArrowLeft,
  Square,
  Radio,
  Plane,
  Home,
  AlertTriangle,
  FileText,
  Clock,
  Activity,
  Users,
  Zap,
  ChevronDown,
  Check,
  Box,
  HardDrive,
  BarChart3,
  X,
  Globe,
  Map as MapIcon,
  History,
  Crosshair,
  Download,
} from 'lucide-react';
import SDCardPanel from './SDCardPanel';
import TrackerSDCardSection from './TrackerSDCardSection';
import EngagementPanel from './EngagementPanel';

// Event colors matching RecordingBar
const EVENT_COLORS: Record<string, string> = {
  jam_on: '#ef4444',
  jam_off: '#f97316',
  launch: '#22c55e',
  recover: '#3b82f6',
  failsafe: '#eab308',
  note: '#a855f7',
  gps_lost: '#ef4444',
  gps_acquired: '#22c55e',
  altitude_anomaly: '#f97316',
  position_jump: '#f97316',
  geofence_breach: '#ef4444',
  link_lost: '#ef4444',
  link_restored: '#22c55e',
  engage: '#06b6d4',
  disengage: '#8b5cf6',
  engagement_aborted: '#f97316',
  custom: '#6b7280',
};

// Format duration as HH:MM:SS
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Format timestamp for event log
function formatEventTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', { hour12: false });
}

export default function SessionConsole() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { showToast } = useToast();

  // Get live data
  const {
    drones,
    droneHistory,
    connectionStatus,
    sdCardTracks,
    showSDCardTracks,
  } = useWebSocket();

  // Get workflow data
  const {
    selectedSite,
    cuasProfiles,
    addEvent,
    sites,
    selectSite,
  } = useWorkflow();

  // Get session phase data
  const {
    currentPhase,
    activeSession,
    phaseDuration,
    stopTest,
    cuasJamStates,
    toggleJamState,
    loadSessionById,
    engagements,
    activeEngagements,
    quickEngage,
    createEngagement,
    engage,
    disengage,
    jamOn,
    jamOff,
    activeBursts,
    refreshEngagements,
  } = useTestSessionPhase();

  // Debug: Log session state for diagnosing JAM button and event log issues
  useEffect(() => {
    console.log('[SessionConsole] State:', {
      currentPhase,
      urlSessionId: sessionId,
      activeSessionId: activeSession?.id,
      status: activeSession?.status,
      eventsCount: activeSession?.events?.length,
      cuasPlacementsCount: activeSession?.cuas_placements?.length,
    });
  }, [currentPhase, sessionId, activeSession]);

  // Load session by URL parameter if not already loaded
  useEffect(() => {
    if (sessionId && (!activeSession || activeSession.id !== sessionId)) {
      console.log('[SessionConsole] Loading session from URL:', sessionId);
      loadSessionById(sessionId);
    }
  }, [sessionId, activeSession, loadSessionById]);

  // Determine if this is a completed session (not live)
  const isCompletedSession = activeSession?.status === 'completed' || activeSession?.status === 'analyzing';

  // Historical telemetry for completed sessions
  const [historicalDrones, setHistoricalDrones] = useState<Map<string, DroneSummary>>(new Map());
  const [historicalDroneHistory, setHistoricalDroneHistory] = useState<Map<string, PositionPoint[]>>(new Map());
  const [historicalDataLoaded, setHistoricalDataLoaded] = useState(false);

  useEffect(() => {
    if (!isCompletedSession || !activeSession?.id || historicalDataLoaded) return;

    const fetchHistoricalTelemetry = async () => {
      try {
        const res = await fetch(`/api/v2/sessions/${activeSession.id}/telemetry?downsample=2000`);
        if (!res.ok) return;

        const data = await res.json();
        const tracks: Record<string, Array<{ lat: number; lon: number; alt_m: number | null; timestamp: string | null; speed_mps: number | null; hdop: number | null; satellites: number | null; fix_valid: boolean | null }>> = data.tracks || {};

        const newDrones = new Map<string, DroneSummary>();
        const newHistory = new Map<string, PositionPoint[]>();

        for (const [trackerId, points] of Object.entries(tracks)) {
          if (points.length === 0) continue;

          // Build history array
          const history: PositionPoint[] = points.map(p => ({
            lat: p.lat,
            lon: p.lon,
            alt_m: p.alt_m,
            timestamp: p.timestamp ? new Date(p.timestamp).getTime() : 0,
          }));
          newHistory.set(trackerId, history);

          // Build a DroneSummary from last known point
          const last = points[points.length - 1];
          newDrones.set(trackerId, {
            tracker_id: trackerId,
            lat: last.lat,
            lon: last.lon,
            alt_m: last.alt_m,
            rssi_dbm: null,
            fix_valid: last.fix_valid ?? true,
            is_stale: true,
            age_seconds: 0,
            last_update: last.timestamp || '',
            speed_mps: last.speed_mps,
          });
        }

        setHistoricalDrones(newDrones);
        setHistoricalDroneHistory(newHistory);
        setHistoricalDataLoaded(true);
        console.log('[SessionConsole] Loaded historical telemetry:', newHistory.size, 'tracks,', data.point_count, 'points');
      } catch (err) {
        console.error('[SessionConsole] Failed to fetch historical telemetry:', err);
      }
    };

    fetchHistoricalTelemetry();
  }, [isCompletedSession, activeSession?.id, historicalDataLoaded]);

  // Filter drones and droneHistory by session's tracker_assignments
  // This ensures only assigned trackers appear in the session view
  const sessionTrackerIds = useMemo(() => {
    if (!activeSession?.tracker_assignments) return new Set<string>();
    return new Set(activeSession.tracker_assignments.map(a => a.tracker_id));
  }, [activeSession?.tracker_assignments]);

  // Filtered drones - only show trackers assigned to this session
  // For COMPLETED sessions, show historical data from the telemetry API
  const sessionDrones = useMemo(() => {
    if (isCompletedSession) {
      return historicalDrones;
    }

    // If no tracker assignments, show all drones (backward compatibility)
    if (sessionTrackerIds.size === 0) return drones;

    const filtered = new Map<string, typeof drones extends Map<string, infer V> ? V : never>();
    for (const [trackerId, drone] of drones) {
      if (sessionTrackerIds.has(trackerId)) {
        filtered.set(trackerId, drone);
      }
    }
    return filtered;
  }, [drones, sessionTrackerIds, isCompletedSession, historicalDrones]);

  // Filtered droneHistory - only show history for assigned trackers
  // For COMPLETED sessions, show historical tracks from the telemetry API
  const sessionDroneHistory = useMemo(() => {
    if (isCompletedSession) {
      return historicalDroneHistory;
    }

    // If no tracker assignments, show all history (backward compatibility)
    if (sessionTrackerIds.size === 0) return droneHistory;

    const filtered = new Map<string, typeof droneHistory extends Map<string, infer V> ? V : never>();
    for (const [trackerId, history] of droneHistory) {
      if (sessionTrackerIds.has(trackerId)) {
        filtered.set(trackerId, history);
      }
    }
    return filtered;
  }, [droneHistory, sessionTrackerIds, isCompletedSession, historicalDroneHistory]);

  // Local state
  const [selectedDroneId, setSelectedDroneId] = useState<string | null>(null);
  const [showJammerDropdown, setShowJammerDropdown] = useState(false);
  const [lastEvent, setLastEvent] = useState<{ type: string; timestamp: number } | null>(null);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [show3DView, setShow3DView] = useState(true); // Default to 3D view
  const [showCesiumGlobe, setShowCesiumGlobe] = useState(false);
  const [mapStyle, setMapStyle] = useState<'dark' | 'satellite' | 'street'>('satellite');
  const [selectedCuasId, setSelectedCuasId] = useState<string | null>(null);
  const [showSDCardPanel, setShowSDCardPanel] = useState(false);
  const [expandedSDTrackerId, setExpandedSDTrackerId] = useState<string | null>(null);
  const [showEngageDropdown, setShowEngageDropdown] = useState(false);
  const [engagementModeCuasId, setEngagementModeCuasId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const engageDropdownRef = useRef<HTMLDivElement>(null);

  // Get selected drone
  const selectedDrone = selectedDroneId ? sessionDrones.get(selectedDroneId) || null : null;

  // Get site for the session - prioritize looking up by session's site_id
  const sessionSite = useMemo(() => {
    // First try to find by session's site_id (must be non-empty and not null)
    if (activeSession?.site_id && activeSession.site_id !== '' && activeSession.site_id !== null) {
      const site = sites.find(s => s.id === activeSession.site_id);
      if (site) return site;
    }
    // Fall back to currently selected site from workflow context
    if (selectedSite) return selectedSite;
    return null;
  }, [activeSession, sites, selectedSite]);

  // CUAS placements from active session
  const cuasPlacements = activeSession?.cuas_placements || [];
  const hasMultipleJammers = cuasPlacements.length > 1;

  // Build profiles map
  const profilesMap = useMemo(() => {
    const map = new Map<string, CUASProfile>();
    cuasProfiles.forEach(p => map.set(p.id, p));
    return map;
  }, [cuasProfiles]);

  const getProfile = (placement: CUASPlacement): CUASProfile | undefined => {
    return profilesMap.get(placement.cuas_profile_id);
  };

  // Count active jammers
  const activeJammerCount = Array.from(cuasJamStates.values()).filter(v => v).length;

  // Redirect if no active session (but not if we have a URL sessionId — it's still loading)
  useEffect(() => {
    if (currentPhase === 'idle' && !activeSession && !sessionId) {
      navigate('/');
    }
  }, [currentPhase, activeSession, sessionId, navigate]);

  // Ensure site is selected in WorkflowContext for map visualization
  useEffect(() => {
    if (sessionSite && (!selectedSite || selectedSite.id !== sessionSite.id)) {
      selectSite(sessionSite);
    }
  }, [sessionSite, selectedSite, selectSite]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowJammerDropdown(false);
      }
      if (engageDropdownRef.current && !engageDropdownRef.current.contains(e.target as Node)) {
        setShowEngageDropdown(false);
      }
    };
    if (showJammerDropdown || showEngageDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showJammerDropdown, showEngageDropdown]);

  // Handle CUAS click on map — enter engagement mode
  const handleCuasClickOnMap = useCallback((cuasPlacementId: string) => {
    setEngagementModeCuasId(cuasPlacementId);
  }, []);

  // Handle drone selection — if in engagement mode, create engagement
  const handleDroneClick = useCallback(async (droneId: string) => {
    if (engagementModeCuasId) {
      try {
        const engagement = await createEngagement(engagementModeCuasId, [droneId]);
        if (engagement) {
          await engage(engagement.id);
          const placement = cuasPlacements.find(p => p.id === engagementModeCuasId);
          const cuasName = placement ? profilesMap.get(placement.cuas_profile_id)?.name : 'CUAS';
          showToast('success', `Engaged ${cuasName} → ${droneId}`);
        }
      } catch (error) {
        showToast('error', 'Failed to create engagement');
      }
      setEngagementModeCuasId(null);
      return;
    }
    setSelectedDroneId(droneId);
  }, [engagementModeCuasId, createEngagement, engage, cuasPlacements, profilesMap, showToast]);

  // Handle stop session - stay on page, don't redirect
  const handleStop = useCallback(async () => {
    try {
      await stopTest();
      showToast('success', 'Session stopped');
      // Don't navigate - stay on Session Console so user can see final state
    } catch (error) {
      showToast('error', 'Failed to stop session');
    }
  }, [stopTest, showToast]);

  // Handle event marking
  const handleMarkEvent = useCallback(async (type: string, note?: string, cuasId?: string) => {
    if (!activeSession) return;

    // Handle jam events
    if (type === 'jam_on' || type === 'jam_off') {
      if (hasMultipleJammers && !cuasId) {
        setShowJammerDropdown(true);
        return;
      }

      const targetId = cuasId || (cuasPlacements.length === 1 ? cuasPlacements[0].id : null);
      if (targetId) {
        await toggleJamState(targetId);
        setLastEvent({ type, timestamp: Date.now() });
        setTimeout(() => setLastEvent(null), 2000);
        setShowJammerDropdown(false);
        return;
      }
    }

    // Handle note event
    if (type === 'note' && !note) {
      setShowNoteInput(true);
      return;
    }

    // Log other events
    await addEvent(activeSession.id, {
      type: type as TestEvent['type'],
      timestamp: new Date().toISOString(),
      source: 'manual',
      note,
    });

    setLastEvent({ type, timestamp: Date.now() });
    setTimeout(() => setLastEvent(null), 2000);
  }, [activeSession, addEvent, hasMultipleJammers, cuasPlacements, toggleJamState]);

  // Handle jammer selection
  const handleJammerSelect = useCallback((placement: CUASPlacement) => {
    const isCurrentlyJamming = cuasJamStates.get(placement.id) || false;
    handleMarkEvent(isCurrentlyJamming ? 'jam_off' : 'jam_on', undefined, placement.id);
  }, [cuasJamStates, handleMarkEvent]);

  // Submit note
  const handleSubmitNote = useCallback(() => {
    if (noteText.trim()) {
      handleMarkEvent('note', noteText.trim());
    }
    setNoteText('');
    setShowNoteInput(false);
  }, [noteText, handleMarkEvent]);

  // Handle engage action
  const handleEngage = useCallback(async (cuasPlacementId?: string) => {
    try {
      const engagement = await quickEngage(cuasPlacementId);
      if (engagement) {
        showToast('success', `Engagement active: ${engagement.name || 'Quick Engage'}`);
        setShowEngageDropdown(false);
      }
    } catch (error) {
      showToast('error', 'Failed to start engagement');
    }
  }, [quickEngage, showToast]);

  // Handle disengage action
  const handleDisengage = useCallback(async (engagementId?: string) => {
    console.log('[SessionConsole] handleDisengage called, engagementId:', engagementId, 'activeEngagements.size:', activeEngagements.size, 'keys:', Array.from(activeEngagements.keys()));
    const targetId = engagementId || (activeEngagements.size === 1 ? Array.from(activeEngagements.keys())[0] : null);
    if (!targetId) {
      console.warn('[SessionConsole] No targetId found for disengage');
      return;
    }
    console.log('[SessionConsole] Disengaging targetId:', targetId);
    try {
      const result = await disengage(targetId);
      if (result?.metrics) {
        const tte = result.metrics.time_to_effect_s;
        const range = result.metrics.effective_range_m;
        showToast('success', `Engagement complete — TTE: ${tte ? tte.toFixed(1) + 's' : '--'}, Range: ${range ? Math.round(range) + 'm' : '--'}`);
      } else {
        showToast('success', 'Engagement complete');
      }
    } catch (error) {
      showToast('error', 'Failed to disengage');
    }
  }, [activeEngagements, disengage, showToast]);

  // Determine if there's an active jam burst for the current engagement
  const activeEngagementId = activeEngagements.size > 0 ? Array.from(activeEngagements.keys())[0] : null;
  const activeJamBurst: JamBurst | undefined = activeEngagementId
    ? activeBursts.get(activeEngagementId)
    : undefined;
  const hasOpenBurst = !!activeJamBurst && !activeJamBurst.jam_off_at;

  // Burst elapsed timer
  const [burstElapsed, setBurstElapsed] = useState(0);
  useEffect(() => {
    if (!hasOpenBurst || !activeJamBurst?.jam_on_at) {
      setBurstElapsed(0);
      return;
    }
    const startTime = new Date(activeJamBurst.jam_on_at).getTime();
    const tick = () => setBurstElapsed(Math.floor((Date.now() - startTime) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [hasOpenBurst, activeJamBurst?.jam_on_at]);

  // Handle JAM ON / JAM OFF toggle on active engagement
  const handleJamToggle = useCallback(async () => {
    if (!activeEngagementId) return;
    try {
      if (hasOpenBurst) {
        await jamOff(activeEngagementId);
        showToast('success', 'JAM OFF');
      } else {
        await jamOn(activeEngagementId);
        showToast('success', 'JAM ON');
      }
      await refreshEngagements();
    } catch (error) {
      showToast('error', 'Failed to toggle jam burst');
    }
  }, [activeEngagementId, hasOpenBurst, jamOn, jamOff, refreshEngagements, showToast]);

  // Keyboard shortcuts
  useEffect(() => {
    if (currentPhase !== 'active') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const key = e.key.toLowerCase();

      // J = JAM ON/OFF burst toggle on active engagement
      if (key === 'j') {
        e.preventDefault();
        if (activeEngagements.size > 0) {
          handleJamToggle();
        } else {
          // Fallback: legacy jam toggle when no engagement active
          if (hasMultipleJammers) {
            setShowJammerDropdown(prev => !prev);
          } else if (cuasPlacements.length === 1) {
            const isJamming = cuasJamStates.get(cuasPlacements[0].id) || false;
            handleMarkEvent(isJamming ? 'jam_off' : 'jam_on', undefined, cuasPlacements[0].id);
          }
        }
        return;
      }

      // E = Engage workflow
      if (key === 'e') {
        e.preventDefault();
        if (activeEngagements.size > 0) {
          // Already have active engagement, ignore
          return;
        }
        if (hasMultipleJammers) {
          setShowEngageDropdown(prev => !prev);
        } else if (cuasPlacements.length === 1) {
          handleEngage(cuasPlacements[0].id);
        } else {
          handleEngage();
        }
        return;
      }

      // D = Disengage
      if (key === 'd') {
        e.preventDefault();
        if (activeEngagements.size > 0) {
          handleDisengage();
        }
        return;
      }

      const shortcutMap: Record<string, string> = {
        'l': 'launch',
        'r': 'recover',
        'f': 'failsafe',
        'n': 'note',
      };

      const eventType = shortcutMap[key];
      if (eventType) {
        e.preventDefault();
        handleMarkEvent(eventType);
      }

      if (key === 'escape') {
        setEngagementModeCuasId(null);
        setShowJammerDropdown(false);
        setShowEngageDropdown(false);
        setShowNoteInput(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPhase, hasMultipleJammers, cuasPlacements, cuasJamStates, handleMarkEvent, activeEngagements, handleEngage, handleDisengage, handleJamToggle]);

  // --- Navigation Guards ---

  // Browser beforeunload guard (prevents tab close / browser navigation during active session)
  useEffect(() => {
    if (currentPhase !== 'active') return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Session is recording. Leave?';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [currentPhase]);

  // React Router in-app navigation blocker
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    currentPhase === 'active' && currentLocation.pathname !== nextLocation.pathname
  );

  // If no active session, show loading or redirect
  if (!activeSession) {
    return (
      <div className="sc-container">
        <div className="sc-loading">
          <div className="sc-loading-spinner" />
          <span>Loading session...</span>
        </div>
        <style>{styles}</style>
      </div>
    );
  }

  return (
    <div className="sc-container">
      {/* Header */}
      <header className="sc-header">
        <div className="sc-header-left">
          <GlassButton
            variant="ghost"
            size="sm"
            onClick={() => navigate('/')}
            style={{ marginRight: '8px' }}
          >
            <ArrowLeft size={16} />
          </GlassButton>

          {/* Recording indicator or Completed indicator */}
          {currentPhase === 'completed' ? (
            <div className="sc-completed-indicator">
              <Check size={14} />
              <span className="sc-completed-label">COMPLETED</span>
            </div>
          ) : (
            <div className="sc-rec-indicator">
              <span className="sc-rec-dot" />
              <span className="sc-rec-label">REC</span>
            </div>
          )}

          {/* Session name */}
          <span className="sc-session-name">{activeSession.name}</span>
        </div>

        <div className="sc-header-center">
          {/* Duration */}
          <div className="sc-duration">
            <Clock size={14} />
            <span>{formatDuration(phaseDuration)}</span>
          </div>

          {/* Tracker count - for completed sessions, show assigned count since live drones are empty */}
          <div className="sc-tracker-count">
            <Radio size={14} />
            <span>{isCompletedSession ? sessionTrackerIds.size : sessionDrones.size} trackers</span>
          </div>

          {/* Connection status */}
          <Badge
            color={connectionStatus === 'connected' ? 'green' : 'red'}
            size="sm"
          >
            {connectionStatus === 'connected' ? 'LIVE' : 'OFFLINE'}
          </Badge>
        </div>

        <div className="sc-header-right">
          {currentPhase === 'completed' ? (
            /* Buttons when completed */
            <div style={{ display: 'flex', gap: '8px' }}>
              {/* Replay Session button */}
              <GlassButton
                variant="secondary"
                size="sm"
                onClick={() => navigate(`/replay/${sessionId}`)}
                style={{
                  background: 'rgba(168, 85, 247, 0.2)',
                  borderColor: 'rgba(168, 85, 247, 0.4)',
                  color: '#a855f7',
                }}
              >
                <History size={14} />
                Replay
              </GlassButton>

              {/* GeoJSON Export button */}
              <GlassButton
                variant="secondary"
                size="sm"
                onClick={() => window.open(`/api/export/session/${sessionId}/geojson`, '_blank')}
                style={{
                  background: 'rgba(6, 182, 212, 0.2)',
                  borderColor: 'rgba(6, 182, 212, 0.4)',
                  color: '#06b6d4',
                }}
              >
                <Download size={14} />
                GeoJSON
              </GlassButton>

              {/* SD Card Merge button */}
              <GlassButton
                variant="secondary"
                size="sm"
                onClick={() => setShowSDCardPanel(true)}
                style={{
                  background: 'rgba(59, 130, 246, 0.2)',
                  borderColor: 'rgba(59, 130, 246, 0.4)',
                  color: '#3b82f6',
                }}
              >
                <HardDrive size={14} />
                SD Merge
              </GlassButton>

              {/* View Analysis button */}
              <GlassButton
                variant="primary"
                size="sm"
                onClick={() => navigate(`/session/${sessionId}/analysis`)}
                style={{
                  background: 'rgba(34, 197, 94, 0.2)',
                  borderColor: 'rgba(34, 197, 94, 0.4)',
                  color: '#22c55e',
                }}
              >
                <BarChart3 size={14} />
                View Analysis
              </GlassButton>
            </div>
          ) : (
            /* Stop button when active */
            <GlassButton
              variant="primary"
              size="sm"
              onClick={handleStop}
              style={{
                background: 'rgba(239, 68, 68, 0.2)',
                borderColor: 'rgba(239, 68, 68, 0.4)',
                color: '#ef4444',
              }}
            >
              <Square size={14} />
              Stop Session
            </GlassButton>
          )}
        </div>
      </header>

      {/* Main 3-column layout */}
      <div className="sc-main">
        {/* Left Panel - Session Info */}
        <aside className="sc-sidebar sc-left">
          {/* Session Info Card */}
          <div className="sc-section">
            <div className="sc-section-header">
              <Activity size={14} />
              <span>Session Info</span>
            </div>
            <div className="sc-info-grid">
              <div className="sc-info-row">
                <span className="sc-info-label">Site</span>
                <span className="sc-info-value">{sessionSite?.name || 'No site'}</span>
              </div>
              {activeSession.operator_name && (
                <div className="sc-info-row">
                  <span className="sc-info-label">Operator</span>
                  <span className="sc-info-value">{activeSession.operator_name}</span>
                </div>
              )}
              {activeSession.weather_notes && (
                <div className="sc-info-row">
                  <span className="sc-info-label">Weather</span>
                  <span className="sc-info-value">{activeSession.weather_notes}</span>
                </div>
              )}
              <div className="sc-info-row">
                <span className="sc-info-label">Started</span>
                <span className="sc-info-value">
                  {activeSession.start_time
                    ? new Date(activeSession.start_time).toLocaleTimeString()
                    : 'Just now'}
                </span>
              </div>
            </div>
          </div>

          {/* Trackers List */}
          <div className="sc-section sc-section-grow">
            <div className="sc-section-header">
              <Users size={14} />
              <span>Active Trackers</span>
              <Badge color="green" size="sm">{sessionDrones.size}</Badge>
            </div>
            <div className="sc-tracker-list">
              {Array.from(sessionDrones.values()).map(drone => {
                const hasSDData = sdCardTracks.has(drone.tracker_id);
                return (
                  <div key={drone.tracker_id} className="sc-tracker-wrapper">
                    <div
                      className={`sc-tracker-item ${selectedDroneId === drone.tracker_id ? 'selected' : ''}`}
                      onClick={() => handleDroneClick(drone.tracker_id)}
                    >
                      <div className="sc-tracker-icon">
                        <Radio size={12} />
                      </div>
                      <div className="sc-tracker-info">
                        <span className="sc-tracker-id">{drone.tracker_id}</span>
                        <span className="sc-tracker-status">
                          {drone.is_stale ? 'Stale' : drone.fix_valid ? 'Active' : 'No fix'}
                          {hasSDData && <span style={{ color: '#f97316', marginLeft: '6px' }}>• SD</span>}
                        </span>
                      </div>
                      <div className={`sc-tracker-dot ${drone.is_stale ? 'stale' : drone.fix_valid ? 'active' : 'no-fix'}`} />
                    </div>
                    {/* SD Card Section for this tracker */}
                    <TrackerSDCardSection
                      trackerId={drone.tracker_id}
                      sessionId={activeSession?.id || ''}
                      isExpanded={expandedSDTrackerId === drone.tracker_id}
                      onToggleExpand={() => setExpandedSDTrackerId(
                        expandedSDTrackerId === drone.tracker_id ? null : drone.tracker_id
                      )}
                      livePointCount={sessionDroneHistory.get(drone.tracker_id)?.length || 0}
                    />
                  </div>
                );
              })}
              {sessionDrones.size === 0 && (
                <div className="sc-empty">No trackers connected</div>
              )}
            </div>
          </div>

          {/* CUAS Systems Section */}
          <div className="sc-section">
            <div className="sc-section-header">
              <Radio size={14} />
              <span>CUAS Systems</span>
              <Badge color="orange" size="sm">{cuasPlacements.length}</Badge>
            </div>
            <div className="sc-cuas-list">
              {cuasPlacements.map((placement, idx) => {
                const profile = getProfile(placement);
                const isJamming = cuasJamStates.get(placement.id) || false;
                return (
                  <div
                    key={placement.id}
                    className={`sc-cuas-item ${selectedCuasId === placement.id ? 'selected' : ''} ${isJamming ? 'jamming' : ''}`}
                  >
                    <div className="sc-cuas-icon">
                      <Radio size={12} />
                    </div>
                    <div
                      className="sc-cuas-info"
                      onClick={() => setSelectedCuasId(selectedCuasId === placement.id ? null : placement.id)}
                    >
                      <span className="sc-cuas-name">{profile?.name || `CUAS ${idx + 1}`}</span>
                      <span className="sc-cuas-location">
                        {placement.position.lat.toFixed(4)}, {placement.position.lon.toFixed(4)}
                      </span>
                    </div>
                    {/* Inline engagement/JAM buttons */}
                    {currentPhase === 'active' ? (
                      // Check if this CUAS has an active engagement
                      Array.from(activeEngagements.values()).some(e => e.cuas_placement_id === placement.id) ? (
                        <div className="sc-cuas-engaged-badge">ENGAGED</div>
                      ) : (
                        <button
                          className={`sc-cuas-jam-btn ${isJamming ? 'active' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isJamming) {
                              handleEngage(placement.id);
                            } else {
                              toggleJamState(placement.id);
                            }
                          }}
                        >
                          {isJamming ? 'STOP' : 'ENGAGE'}
                        </button>
                      )
                    ) : (
                      <div className={`sc-cuas-status ${isJamming ? 'active' : 'idle'}`}>
                        {isJamming ? 'JAM' : 'IDLE'}
                      </div>
                    )}
                  </div>
                );
              })}
              {cuasPlacements.length === 0 && (
                <div className="sc-empty">No CUAS configured</div>
              )}
            </div>
          </div>

          {/* Engagements Section */}
          <EngagementPanel
            engagements={engagements}
            activeEngagements={activeEngagements}
            cuasPlacements={cuasPlacements}
            cuasProfiles={cuasProfiles}
            onDisengage={handleDisengage}
            onNewEngagement={currentPhase === 'active' ? () => {
              if (hasMultipleJammers) {
                setShowEngageDropdown(true);
              } else if (cuasPlacements.length === 1) {
                handleEngage(cuasPlacements[0].id);
              } else {
                handleEngage();
              }
            } : undefined}
            isActive={currentPhase === 'active'}
            activeBursts={activeBursts}
            liveDronePositions={sessionDrones as Map<string, { lat: number | null; lon: number | null; alt_m: number | null; fix_valid: boolean; speed_mps?: number | null }>}
          />

          {/* Event Log - Enhanced with CUAS names */}
          <div className="sc-section">
            <div className="sc-section-header">
              <Zap size={14} />
              <span>Event Log</span>
              <Badge color="gray" size="sm">{activeSession.events?.length || 0}</Badge>
            </div>
            <div className="sc-event-log">
              {(activeSession.events || []).slice(-10).reverse().map((event, idx) => {
                // Get CUAS name if event has cuas_id
                const cuasPlacement = event.cuas_id
                  ? cuasPlacements.find(p => p.id === event.cuas_id)
                  : undefined;
                const cuasName = cuasPlacement ? getProfile(cuasPlacement)?.name : null;

                return (
                  <div key={idx} className="sc-event-item">
                    <span
                      className="sc-event-dot"
                      style={{ background: EVENT_COLORS[event.type] || '#6b7280' }}
                    />
                    <div className="sc-event-details">
                      <span className="sc-event-type">{event.type.replace('_', ' ')}</span>
                      {cuasName && <span className="sc-event-cuas">{cuasName}</span>}
                      {event.note && <span className="sc-event-note">{event.note}</span>}
                    </div>
                    <span className="sc-event-time">{formatEventTime(event.timestamp)}</span>
                  </div>
                );
              })}
              {(!activeSession.events || activeSession.events.length === 0) && (
                <div className="sc-empty">No events yet</div>
              )}
            </div>
          </div>
        </aside>

        {/* Center - Map */}
        <main className="sc-center">
          <div className="sc-map">
            {/* Engagement Mode Banner */}
            {engagementModeCuasId && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 1001,
                background: 'linear-gradient(180deg, rgba(239, 68, 68, 0.95) 0%, rgba(239, 68, 68, 0.85) 100%)',
                color: '#fff',
                padding: '8px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                fontSize: '13px',
                fontWeight: 700,
                letterSpacing: '0.5px',
                backdropFilter: 'blur(8px)',
                borderBottom: '2px solid rgba(255, 255, 255, 0.3)',
              }}>
                <Crosshair size={16} />
                <span>ENGAGEMENT MODE — Click a drone to engage with {
                  (() => {
                    const p = cuasPlacements.find(pl => pl.id === engagementModeCuasId);
                    return p ? profilesMap.get(p.cuas_profile_id)?.name ?? 'CUAS' : 'CUAS';
                  })()
                }</span>
                <button
                  onClick={() => setEngagementModeCuasId(null)}
                  style={{
                    background: 'rgba(255,255,255,0.2)',
                    border: '1px solid rgba(255,255,255,0.4)',
                    color: '#fff',
                    borderRadius: '4px',
                    padding: '2px 8px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    marginLeft: '8px',
                  }}
                >
                  ESC to cancel
                </button>
              </div>
            )}
            <MapComponent
              drones={sessionDrones}
              droneHistory={sessionDroneHistory}
              selectedDroneId={selectedDroneId}
              onDroneClick={handleDroneClick}
              currentTime={Date.now()}
              timelineStart={Date.now() - 3600000}
              selectedSite={sessionSite}
              cuasPlacements={cuasPlacements}
              cuasProfiles={cuasProfiles}
              cuasJamStates={cuasJamStates}
              showCuasCoverage={true}
              mapStyle={mapStyle}
              sdCardTracks={sdCardTracks}
              showSDCardTracks={showSDCardTracks}
              activeEngagements={Array.from(activeEngagements.values())}
              activeBursts={activeBursts}
              onCuasClick={handleCuasClickOnMap}
              engagementModeCuasId={engagementModeCuasId}
            />

            {/* 3D View Overlay */}
            {show3DView && !showCesiumGlobe && (
              <Map3DViewer
                droneHistory={sessionDroneHistory}
                currentTime={Date.now()}
                timelineStart={Date.now() - 3600000}
                onClose={() => setShow3DView(false)}
                showQualityColors={false}
                mapStyle={mapStyle}
                site={sessionSite}
                cuasPlacements={cuasPlacements}
                cuasProfiles={cuasProfiles}
                cuasJamStates={cuasJamStates}
                currentDroneData={sessionDrones}
                selectedDroneId={selectedDroneId}
                onDroneClick={handleDroneClick}
                sdCardTracks={sdCardTracks}
                showSDCardTracks={showSDCardTracks}
                activeEngagements={Array.from(activeEngagements.values())}
                activeBursts={activeBursts}
                onCuasClick={handleCuasClickOnMap}
                engagementModeCuasId={engagementModeCuasId}
              />
            )}

            {/* Cesium Globe Overlay */}
            {showCesiumGlobe && (
              <div style={{ position: 'absolute', inset: 0, zIndex: 10 }}>
                <CesiumMap
                  droneHistory={sessionDroneHistory}
                  currentTime={Date.now()}
                  timelineStart={Date.now() - 3600000}
                  site={sessionSite}
                  cuasPlacements={cuasPlacements}
                  cuasProfiles={cuasProfiles}
                  cuasJamStates={cuasJamStates}
                  currentDroneData={sessionDrones}
                  selectedDroneId={selectedDroneId}
                  onDroneClick={handleDroneClick}
                  onClose={() => setShowCesiumGlobe(false)}
                  engagements={Array.from(activeEngagements.values())}
                  activeBursts={activeBursts}
                  onCuasClick={handleCuasClickOnMap}
                  engagementModeCuasId={engagementModeCuasId}
                />
              </div>
            )}

            {/* Cesium Globe Toggle Button */}
            <button
              onClick={() => {
                setShowCesiumGlobe(prev => !prev);
                if (!showCesiumGlobe) setShow3DView(false); // Turn off Map3DViewer when switching to Globe
              }}
              title={showCesiumGlobe ? 'Close Globe View' : 'Open Cesium Globe'}
              style={{
                position: 'absolute',
                top: '10px',
                right: '102px',
                zIndex: 1000,
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                background: showCesiumGlobe ? 'rgba(0, 200, 255, 0.3)' : 'rgba(20, 20, 35, 0.9)',
                color: showCesiumGlobe ? '#00c8ff' : 'rgba(255, 255, 255, 0.7)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                fontSize: '11px',
                fontWeight: 700,
              }}
            >
              <Globe size={18} />
            </button>

            {/* Map Style Toggle Button */}
            <button
              onClick={() => setMapStyle(prev =>
                prev === 'dark' ? 'satellite' : prev === 'satellite' ? 'street' : 'dark'
              )}
              title={`Switch to ${mapStyle === 'dark' ? 'Satellite' : mapStyle === 'satellite' ? 'Street' : 'Dark'} Map`}
              style={{
                position: 'absolute',
                top: '10px',
                right: '56px',
                zIndex: 1000,
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                background: mapStyle !== 'dark' ? 'rgba(0, 200, 255, 0.3)' : 'rgba(20, 20, 35, 0.9)',
                color: mapStyle !== 'dark' ? '#00c8ff' : 'rgba(255, 255, 255, 0.7)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
              }}
            >
              {mapStyle === 'satellite' ? <Globe size={18} /> : <MapIcon size={18} />}
            </button>

            {/* 3D Toggle Button */}
            <button
              onClick={() => {
                setShow3DView(prev => !prev);
                if (!show3DView) setShowCesiumGlobe(false); // Turn off Globe when switching to Map3DViewer
              }}
              title={show3DView ? 'Switch to 2D Map' : 'Switch to 3D View'}
              className="sc-3d-toggle"
              style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                zIndex: 1000,
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                background: show3DView ? 'rgba(0, 200, 255, 0.3)' : 'rgba(20, 20, 35, 0.9)',
                color: show3DView ? '#00c8ff' : 'rgba(255, 255, 255, 0.7)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
              }}
            >
              <Box size={18} />
            </button>
          </div>

          {/* Event Buttons Bar — only during active sessions */}
          {currentPhase === 'active' ? (
          <div className="sc-event-bar">
            {/* ENGAGE / DISENGAGE button */}
            {activeEngagements.size > 0 ? (
              /* DISENGAGE button when engagement is active */
              <button
                className="sc-event-btn sc-event-btn--disengage"
                onClick={() => handleDisengage()}
              >
                <Square size={14} />
                <span>DISENGAGE</span>
                <Badge color="red" size="sm">{activeEngagements.size}</Badge>
              </button>
            ) : (
              /* ENGAGE button with optional CUAS picker */
              <div className="sc-event-btn-wrapper" ref={engageDropdownRef}>
                <button
                  className="sc-event-btn sc-event-btn--engage"
                  onClick={() => {
                    if (hasMultipleJammers) {
                      setShowEngageDropdown(!showEngageDropdown);
                    } else if (cuasPlacements.length === 1) {
                      handleEngage(cuasPlacements[0].id);
                    } else {
                      handleEngage();
                    }
                  }}
                >
                  <Radio size={14} />
                  <span>ENGAGE</span>
                  {hasMultipleJammers && <ChevronDown size={10} />}
                </button>

                {showEngageDropdown && (
                  <div className="sc-jammer-dropdown">
                    <div className="sc-dropdown-label">SELECT CUAS TO ENGAGE</div>
                    {cuasPlacements.map((placement, index) => {
                      const profile = getProfile(placement);
                      return (
                        <button
                          key={placement.id}
                          className="sc-jammer-option"
                          onClick={() => handleEngage(placement.id)}
                        >
                          <Badge color="gray" size="sm">{index + 1}</Badge>
                          <span>{profile?.name || `CUAS ${index + 1}`}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* JAM ON / JAM OFF burst toggle button */}
            <button
              className={`sc-event-btn ${hasOpenBurst ? 'sc-event-btn--jam-active' : 'sc-event-btn--jam-ready'}`}
              onClick={handleJamToggle}
              disabled={!activeEngagementId}
              title={activeEngagementId ? (hasOpenBurst ? 'JAM OFF (J)' : 'JAM ON (J)') : 'No active engagement'}
            >
              <Zap size={14} />
              <span>{hasOpenBurst ? 'JAM OFF' : 'JAM ON'}</span>
              {hasOpenBurst && burstElapsed > 0 && (
                <span className="sc-jam-timer">{formatDuration(burstElapsed)}</span>
              )}
            </button>

            {/* Legacy JAM button (secondary, for manual jam without engagement) */}
            <div className="sc-event-btn-wrapper" ref={dropdownRef}>
              <button
                className={`sc-event-btn ${activeJammerCount > 0 ? 'active-jam' : ''}`}
                onClick={() => hasMultipleJammers ? setShowJammerDropdown(!showJammerDropdown) : handleMarkEvent('jam_on')}
                title="Manual JAM toggle (legacy)"
              >
                <Radio size={14} />
                <span>JAM</span>
                {activeJammerCount > 0 && <Badge color="red" size="sm">{activeJammerCount}</Badge>}
                {hasMultipleJammers && <ChevronDown size={10} />}
              </button>

              {showJammerDropdown && (
                <div className="sc-jammer-dropdown">
                  <div className="sc-dropdown-label">SELECT JAMMER</div>
                  {cuasPlacements.map((placement, index) => {
                    const profile = getProfile(placement);
                    const isJamming = cuasJamStates.get(placement.id) || false;
                    return (
                      <button
                        key={placement.id}
                        className={`sc-jammer-option ${isJamming ? 'jamming' : ''}`}
                        onClick={() => handleJammerSelect(placement)}
                      >
                        <Badge color="gray" size="sm">{index + 1}</Badge>
                        <span>{profile?.name || `CUAS ${index + 1}`}</span>
                        {isJamming && <Check size={12} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <button className="sc-event-btn" onClick={() => handleMarkEvent('launch')}>
              <Plane size={14} />
              <span>LAUNCH</span>
            </button>

            <button className="sc-event-btn" onClick={() => handleMarkEvent('recover')}>
              <Home size={14} />
              <span>RECOVER</span>
            </button>

            <button className="sc-event-btn" onClick={() => handleMarkEvent('failsafe')}>
              <AlertTriangle size={14} />
              <span>FAILSAFE</span>
            </button>

            <button className="sc-event-btn" onClick={() => handleMarkEvent('note')}>
              <FileText size={14} />
              <span>NOTE</span>
            </button>

            {/* Last event indicator */}
            {lastEvent && (
              <div className="sc-last-event">
                <Zap size={12} style={{ color: EVENT_COLORS[lastEvent.type] }} />
                <span>{lastEvent.type.replace('_', ' ').toUpperCase()}</span>
              </div>
            )}
          </div>
          ) : isCompletedSession ? (
          /* Read-only engagement summary bar for completed sessions */
          <div className="sc-event-bar sc-event-bar--completed">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0 8px' }}>
              <Check size={14} style={{ color: '#22c55e' }} />
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.5px' }}>
                SESSION COMPLETE
              </span>
              {engagements.length > 0 && (
                <Badge color="blue" size="sm">{engagements.length} engagement{engagements.length !== 1 ? 's' : ''}</Badge>
              )}
              {activeSession?.events && activeSession.events.length > 0 && (
                <Badge color="gray" size="sm">{activeSession.events.length} event{activeSession.events.length !== 1 ? 's' : ''}</Badge>
              )}
              {historicalDataLoaded && (
                <Badge color="green" size="sm">{sessionDroneHistory.size} track{sessionDroneHistory.size !== 1 ? 's' : ''}</Badge>
              )}
            </div>
          </div>
          ) : null}

          {/* Note input modal */}
          {showNoteInput && (
            <div className="sc-note-modal">
              <textarea
                autoFocus
                placeholder="Enter note..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmitNote();
                  }
                  if (e.key === 'Escape') {
                    setShowNoteInput(false);
                    setNoteText('');
                  }
                }}
              />
              <div className="sc-note-actions">
                <GlassButton
                  variant="ghost"
                  size="sm"
                  onClick={() => { setShowNoteInput(false); setNoteText(''); }}
                >
                  Cancel
                </GlassButton>
                <GlassButton
                  variant="primary"
                  size="sm"
                  onClick={handleSubmitNote}
                >
                  Add Note
                </GlassButton>
              </div>
            </div>
          )}
        </main>

      </div>

      {/* Drone Detail Modal - shows as overlay when tracker clicked */}
      {selectedDrone && (
        <div className="sc-drone-modal">
          <DroneDetailPanel
            drone={selectedDrone}
            onClose={() => setSelectedDroneId(null)}
            onOpenCamera={() => {}}
          />
        </div>
      )}

      {/* CUAS Detail Dialog */}
      {selectedCuasId && (() => {
        const placement = cuasPlacements.find(p => p.id === selectedCuasId);
        const profile = placement ? getProfile(placement) : undefined;
        return placement ? (
          <div className="cuas-dialog-overlay" onClick={() => setSelectedCuasId(null)}>
            <div className="cuas-dialog" onClick={e => e.stopPropagation()}>
              <div className="cuas-dialog-header">
                <span>{profile?.name || 'CUAS System'}</span>
                <button onClick={() => setSelectedCuasId(null)}><X size={16} /></button>
              </div>
              <div className="cuas-dialog-content">
                <div className="cuas-dialog-row">
                  <span>Type:</span>
                  <span>{profile?.type || 'Unknown'}</span>
                </div>
                <div className="cuas-dialog-row">
                  <span>Range:</span>
                  <span>{profile?.effective_range_m || 0}m</span>
                </div>
                <div className="cuas-dialog-row">
                  <span>Position:</span>
                  <span>{placement.position.lat.toFixed(5)}, {placement.position.lon.toFixed(5)}</span>
                </div>
                <div className="cuas-dialog-row">
                  <span>Height AGL:</span>
                  <span>{placement.height_agl_m}m</span>
                </div>
                <div className="cuas-dialog-row">
                  <span>Orientation:</span>
                  <span>{placement.orientation_deg}°</span>
                </div>
                <div className="cuas-dialog-row">
                  <span>Status:</span>
                  <span className={cuasJamStates.get(selectedCuasId) ? 'status-active' : 'status-idle'}>
                    {cuasJamStates.get(selectedCuasId) ? 'JAMMING' : 'IDLE'}
                  </span>
                </div>
              </div>
              {currentPhase === 'active' && (
                <button
                  className={`cuas-jam-btn ${cuasJamStates.get(selectedCuasId) ? 'active' : ''}`}
                  onClick={() => toggleJamState(selectedCuasId)}
                >
                  {cuasJamStates.get(selectedCuasId) ? 'STOP JAM' : 'START JAM'}
                </button>
              )}
            </div>
          </div>
        ) : null;
      })()}

      {/* SD Card Panel */}
      {showSDCardPanel && (
        <SDCardPanel
          isOpen={showSDCardPanel}
          onClose={() => setShowSDCardPanel(false)}
        />
      )}

      {/* Navigation Blocker Confirmation Dialog */}
      {blocker.state === 'blocked' && (
        <div className="cuas-dialog-overlay" onClick={() => blocker.reset()}>
          <div className="cuas-dialog" onClick={e => e.stopPropagation()}>
            <div className="cuas-dialog-header">
              <span>Session Recording</span>
              <button onClick={() => blocker.reset()}><X size={16} /></button>
            </div>
            <div className="cuas-dialog-content" style={{ textAlign: 'center', padding: '16px 0' }}>
              <AlertTriangle size={32} style={{ color: '#f97316', marginBottom: '12px' }} />
              <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)', margin: '0 0 8px' }}>
                Session is currently recording.
              </p>
              <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', margin: 0 }}>
                Navigating away will not stop the recording, but you may lose track of the session.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <GlassButton
                variant="primary"
                size="sm"
                onClick={() => blocker.reset()}
                style={{ flex: 1, background: 'rgba(34, 197, 94, 0.2)', borderColor: 'rgba(34, 197, 94, 0.4)', color: '#22c55e' }}
              >
                Stay on Session
              </GlassButton>
              <GlassButton
                variant="ghost"
                size="sm"
                onClick={() => blocker.proceed()}
                style={{ flex: 1 }}
              >
                Leave Anyway
              </GlassButton>
            </div>
          </div>
        </div>
      )}

      <style>{styles}</style>
    </div>
  );
}

const styles = `
  .sc-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    background: #0a0a12;
    color: #fff;
    overflow: hidden;
  }

  /* Header */
  .sc-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    background: rgba(15, 15, 25, 0.95);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    height: 56px;
    flex-shrink: 0;
  }

  .sc-header-left, .sc-header-center, .sc-header-right {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .sc-header-center {
    gap: 24px;
  }

  .sc-rec-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 8px;
  }

  .sc-rec-dot {
    width: 10px;
    height: 10px;
    background: #ef4444;
    border-radius: 50%;
    animation: pulse 1.5s ease-in-out infinite;
    box-shadow: 0 0 8px rgba(239, 68, 68, 0.6);
  }

  .sc-rec-label {
    font-size: 11px;
    font-weight: 700;
    color: #ef4444;
    letter-spacing: 1px;
  }

  .sc-session-name {
    font-size: 15px;
    font-weight: 600;
    color: #fff;
  }

  .sc-duration, .sc-tracker-count {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.7);
  }

  .sc-duration span {
    font-family: monospace;
    font-weight: 600;
    color: #ff8c00;
  }

  /* Main Layout - 2 column (sidebar + map) */
  .sc-main {
    flex: 1;
    display: grid;
    grid-template-columns: 280px 1fr;
    gap: 8px;
    padding: 8px;
    min-height: 0;
    overflow: hidden;
  }

  /* Sidebars */
  .sc-sidebar {
    background: rgba(20, 20, 35, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 10px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .sc-section {
    padding: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .sc-section:last-child {
    border-bottom: none;
  }

  .sc-section-grow {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .sc-section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    font-size: 11px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.5);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .sc-info-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .sc-info-row {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
  }

  .sc-info-label {
    color: rgba(255, 255, 255, 0.5);
  }

  .sc-info-value {
    color: #fff;
    font-weight: 500;
  }

  /* Tracker List */
  .sc-tracker-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .sc-tracker-wrapper {
    display: flex;
    flex-direction: column;
  }

  .sc-tracker-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid transparent;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .sc-tracker-item:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .sc-tracker-item.selected {
    background: rgba(255, 140, 0, 0.1);
    border-color: rgba(255, 140, 0, 0.3);
  }

  .sc-tracker-icon {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.6);
  }

  .sc-tracker-info {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .sc-tracker-id {
    font-size: 12px;
    font-weight: 500;
    color: #fff;
  }

  .sc-tracker-status {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.4);
  }

  .sc-tracker-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .sc-tracker-dot.active {
    background: #22c55e;
    box-shadow: 0 0 6px rgba(34, 197, 94, 0.5);
  }

  .sc-tracker-dot.stale {
    background: #f97316;
  }

  .sc-tracker-dot.no-fix {
    background: #6b7280;
  }

  /* Event Log */
  .sc-event-log {
    max-height: 150px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .sc-event-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    background: rgba(255, 255, 255, 0.02);
    border-radius: 4px;
    font-size: 11px;
  }

  .sc-event-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .sc-event-type {
    flex: 1;
    color: rgba(255, 255, 255, 0.7);
    text-transform: capitalize;
  }

  .sc-event-time {
    font-family: monospace;
    color: rgba(255, 255, 255, 0.4);
  }

  .sc-empty {
    padding: 16px;
    text-align: center;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.3);
  }

  /* Center */
  .sc-center {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .sc-map {
    flex: 1;
    position: relative;
    min-height: 0;
    border-radius: 10px;
    overflow: hidden;
    background: rgba(20, 20, 35, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.06);
  }

  /* Event Bar */
  .sc-event-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: rgba(20, 20, 35, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
  }

  .sc-event-bar--completed {
    justify-content: center;
    background: rgba(20, 25, 35, 0.85);
    border-color: rgba(34, 197, 94, 0.15);
  }

  .sc-event-btn-wrapper {
    position: relative;
  }

  .sc-event-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.8);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }

  .sc-event-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  .sc-event-btn.active-jam {
    background: rgba(239, 68, 68, 0.2);
    border-color: rgba(239, 68, 68, 0.4);
    color: #ef4444;
  }

  .sc-jammer-dropdown {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 8px;
    padding: 8px;
    background: rgba(10, 15, 26, 0.98);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    min-width: 180px;
    z-index: 100;
  }

  .sc-dropdown-label {
    font-size: 9px;
    color: rgba(255, 255, 255, 0.4);
    margin-bottom: 6px;
    padding: 0 8px;
  }

  .sc-jammer-option {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.8);
    font-size: 11px;
    cursor: pointer;
    text-align: left;
  }

  .sc-jammer-option:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .sc-jammer-option.jamming {
    background: rgba(239, 68, 68, 0.2);
    border-color: rgba(239, 68, 68, 0.4);
    color: #ef4444;
  }

  .sc-last-event {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
    padding: 6px 12px;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.5);
  }

  /* Note Modal */
  .sc-note-modal {
    position: absolute;
    bottom: 70px;
    left: 50%;
    transform: translateX(-50%);
    padding: 12px;
    background: rgba(10, 15, 26, 0.98);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    width: 300px;
    z-index: 100;
  }

  .sc-note-modal textarea {
    width: 100%;
    padding: 10px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    color: #fff;
    font-size: 13px;
    outline: none;
    min-height: 60px;
    resize: none;
  }

  .sc-note-actions {
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }

  .sc-note-actions button {
    flex: 1;
  }

  /* Right Panel */
  .sc-drone-detail {
    flex: 1;
    overflow-y: auto;
  }

  /* Drone Detail Modal - floating overlay */
  .sc-drone-modal {
    position: fixed;
    top: 80px;
    right: 24px;
    width: 320px;
    max-height: calc(100vh - 120px);
    background: rgba(20, 20, 35, 0.98);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    overflow-y: auto;
    z-index: 500;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  /* Loading */
  .sc-loading {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    color: rgba(255, 255, 255, 0.6);
  }

  .sc-loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(255, 140, 0, 0.2);
    border-top-color: #ff8c00;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(1.1); }
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Completed indicator */
  .sc-completed-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: rgba(34, 197, 94, 0.15);
    border: 1px solid rgba(34, 197, 94, 0.3);
    border-radius: 8px;
    color: #22c55e;
  }

  .sc-completed-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 1px;
  }

  /* CUAS Systems List */
  .sc-cuas-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 150px;
    overflow-y: auto;
  }

  .sc-cuas-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid transparent;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .sc-cuas-item:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .sc-cuas-item.selected {
    background: rgba(255, 140, 0, 0.1);
    border-color: rgba(255, 140, 0, 0.3);
  }

  .sc-cuas-item.jamming {
    background: rgba(239, 68, 68, 0.1);
    border-color: rgba(239, 68, 68, 0.3);
  }

  .sc-cuas-icon {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.6);
  }

  .sc-cuas-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .sc-cuas-name {
    font-size: 12px;
    font-weight: 500;
    color: #fff;
  }

  .sc-cuas-location {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.4);
    font-family: monospace;
  }

  .sc-cuas-status {
    font-size: 9px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.5);
  }

  .sc-cuas-status.active {
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
  }

  /* Inline JAM button on CUAS cards */
  .sc-cuas-jam-btn {
    padding: 4px 10px;
    font-size: 10px;
    font-weight: 600;
    border-radius: 4px;
    border: 1px solid rgba(239, 68, 68, 0.4);
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
    cursor: pointer;
    transition: all 0.15s;
    flex-shrink: 0;
  }

  .sc-cuas-jam-btn:hover {
    background: rgba(239, 68, 68, 0.2);
  }

  .sc-cuas-jam-btn.active {
    background: rgba(239, 68, 68, 0.3);
    animation: pulse-jam 1.5s ease-in-out infinite;
  }

  @keyframes pulse-jam {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  /* Enhanced Event Details */
  .sc-event-details {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .sc-event-cuas {
    font-size: 9px;
    color: rgba(255, 140, 0, 0.8);
  }

  .sc-event-note {
    font-size: 9px;
    color: rgba(255, 255, 255, 0.4);
    font-style: italic;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* CUAS Detail Dialog */
  .cuas-dialog-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
  }

  .cuas-dialog {
    background: rgba(20, 20, 35, 0.98);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 16px;
    min-width: 280px;
    max-width: 360px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .cuas-dialog-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .cuas-dialog-header span {
    font-size: 16px;
    font-weight: 600;
    color: #fff;
  }

  .cuas-dialog-header button {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.5);
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.15s;
  }

  .cuas-dialog-header button:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  .cuas-dialog-content {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .cuas-dialog-row {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
  }

  .cuas-dialog-row span:first-child {
    color: rgba(255, 255, 255, 0.5);
  }

  .cuas-dialog-row span:last-child {
    color: #fff;
    font-weight: 500;
  }

  .cuas-dialog-row .status-active {
    color: #ef4444;
    font-weight: 600;
  }

  .cuas-dialog-row .status-idle {
    color: #22c55e;
  }

  .cuas-jam-btn {
    width: 100%;
    margin-top: 16px;
    padding: 10px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.8);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .cuas-jam-btn:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .cuas-jam-btn.active {
    background: rgba(239, 68, 68, 0.2);
    border-color: rgba(239, 68, 68, 0.4);
    color: #ef4444;
  }

  /* Engage/Disengage button styles */
  .sc-event-btn--engage {
    background: rgba(6, 182, 212, 0.15) !important;
    border-color: rgba(6, 182, 212, 0.3) !important;
    color: #06b6d4 !important;
  }

  .sc-event-btn--engage:hover {
    background: rgba(6, 182, 212, 0.25) !important;
  }

  .sc-event-btn--disengage {
    background: rgba(139, 92, 246, 0.2) !important;
    border-color: rgba(139, 92, 246, 0.4) !important;
    color: #8b5cf6 !important;
    animation: pulse-engage 1.5s ease-in-out infinite;
  }

  .sc-event-btn--disengage:hover {
    background: rgba(139, 92, 246, 0.3) !important;
  }

  @keyframes pulse-engage {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }

  /* JAM ON/OFF burst button styles */
  .sc-event-btn--jam-ready {
    background: rgba(239, 68, 68, 0.2) !important;
    border-color: rgba(239, 68, 68, 0.4) !important;
    color: #ef4444 !important;
    font-weight: 700 !important;
  }

  .sc-event-btn--jam-ready:hover {
    background: rgba(239, 68, 68, 0.3) !important;
  }

  .sc-event-btn--jam-ready:disabled {
    background: rgba(255, 255, 255, 0.03) !important;
    border-color: rgba(255, 255, 255, 0.06) !important;
    color: rgba(255, 255, 255, 0.25) !important;
    cursor: not-allowed !important;
  }

  .sc-event-btn--jam-active {
    background: rgba(249, 115, 22, 0.25) !important;
    border-color: rgba(249, 115, 22, 0.5) !important;
    color: #f97316 !important;
    font-weight: 700 !important;
    animation: pulse-jam-burst 1.2s ease-in-out infinite;
  }

  .sc-event-btn--jam-active:hover {
    background: rgba(249, 115, 22, 0.35) !important;
  }

  @keyframes pulse-jam-burst {
    0%, 100% { opacity: 1; box-shadow: 0 0 8px rgba(249, 115, 22, 0.3); }
    50% { opacity: 0.75; box-shadow: 0 0 16px rgba(249, 115, 22, 0.5); }
  }

  .sc-jam-timer {
    font-family: monospace;
    font-size: 10px;
    font-weight: 600;
    color: #f97316;
    margin-left: 4px;
    background: rgba(0, 0, 0, 0.3);
    padding: 1px 6px;
    border-radius: 3px;
  }

  /* CUAS inline engaged badge */
  .sc-cuas-engaged-badge {
    padding: 4px 8px;
    font-size: 9px;
    font-weight: 700;
    border-radius: 4px;
    border: 1px solid rgba(6, 182, 212, 0.4);
    background: rgba(6, 182, 212, 0.15);
    color: #06b6d4;
    letter-spacing: 0.5px;
    animation: pulse-engage 1.5s ease-in-out infinite;
    flex-shrink: 0;
  }
`;
