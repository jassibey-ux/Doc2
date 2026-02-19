/**
 * Replay Console - View for replaying saved test sessions
 * Based on SessionConsole, adapted for playback controls
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useWorkflow } from '../contexts/WorkflowContext';
import { useToast } from '../contexts/ToastContext';
import { GlassButton, Badge } from './ui/GlassUI';
import { APIProvider } from '@vis.gl/react-google-maps';
import MapComponent from './Map';
import Map3DViewer from './Map3DViewer';
import Google3DViewer from './google3d/Google3DViewer';
import DroneDetailPanel from './DroneDetailPanel';
import type { CUASPlacement, CUASProfile, SiteDefinition } from '../types/workflow';
import {
  ArrowLeft,
  Radio,
  Clock,
  Activity,
  Users,
  Zap,
  Box,
  Globe,
  Map as MapIcon,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Rewind,
  FastForward,
  X,
} from 'lucide-react';

// Event colors (same as SessionConsole)
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
  custom: '#6b7280',
};

// Format duration as HH:MM:SS
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Format timestamp for event log
function formatEventTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', { hour12: false });
}

// Replay state interface
interface ReplayState {
  is_playing: boolean;
  current_frame: number;
  total_frames: number;
  playback_speed: number;
  current_time: string | null;
  progress_percent: number;
}

// Session info from replay API
interface ReplaySessionInfo {
  session_id: string;
  name: string;
  duration_seconds: number;
  start_time: string;
  end_time: string;
  tracker_ids: string[];
  file_count: number;
  total_records: number;
}

export default function ReplayConsole() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { showToast } = useToast();

  // Get live data from WebSocket (replay engine pushes to same WebSocket)
  const {
    drones,
    droneHistory,
    connectionStatus,
  } = useWebSocket();

  // Get workflow data for site/CUAS profiles
  const {
    cuasProfiles,
    sites,
    testSessions,
  } = useWorkflow();

  // Replay state
  const [replayState, setReplayState] = useState<ReplayState | null>(null);
  const [sessionInfo, setSessionInfo] = useState<ReplaySessionInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [selectedDroneId, setSelectedDroneId] = useState<string | null>(null);
  const [show3DView, setShow3DView] = useState(true);
  const [showCesiumGlobe, setShowCesiumGlobe] = useState(false);
  const [mapStyle, setMapStyle] = useState<'dark' | 'satellite' | 'street'>('satellite');
  const [selectedCuasId, setSelectedCuasId] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Get selected drone
  const selectedDrone = selectedDroneId ? drones.get(selectedDroneId) || null : null;

  // Try to find test session from workflow context for additional metadata
  const testSession = useMemo(() => {
    return testSessions.find(s => s.id === sessionId) || null;
  }, [testSessions, sessionId]);

  // Get site for the session
  const sessionSite = useMemo((): SiteDefinition | null => {
    if (testSession?.site_id) {
      const site = sites.find(s => s.id === testSession.site_id);
      if (site) return site;
    }
    return null;
  }, [testSession, sites]);

  // CUAS placements from test session
  const cuasPlacements = testSession?.cuas_placements || [];

  // Build profiles map
  const profilesMap = useMemo(() => {
    const map = new Map<string, CUASProfile>();
    cuasProfiles.forEach(p => map.set(p.id, p));
    return map;
  }, [cuasProfiles]);

  const getProfile = (placement: CUASPlacement): CUASProfile | undefined => {
    return profilesMap.get(placement.cuas_profile_id);
  };

  // Load replay session on mount
  useEffect(() => {
    if (!sessionId) return;

    const loadSession = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/replay/load/${sessionId}`, { method: 'POST' });
        const data = await res.json();

        if (!data.success) {
          throw new Error(data.error || 'Failed to load session');
        }

        // Backend returns session info nested under data.session
        const session = data.session || data;
        setSessionInfo({
          session_id: session.session_id || sessionId,
          name: session.name || sessionId,
          duration_seconds: session.duration_seconds || 0,
          start_time: session.start_time || '',
          end_time: session.end_time || '',
          tracker_ids: session.tracker_ids || [],
          file_count: session.file_count || session.frame_count || 0,
          total_records: session.total_records || session.frame_count || 0,
        });

        // Get initial replay state
        const stateRes = await fetch('/api/replay/state');
        const stateData = await stateRes.json();
        if (stateData.replay_mode) {
          setReplayState({
            is_playing: stateData.is_playing,
            current_frame: stateData.current_frame,
            total_frames: stateData.total_frames,
            playback_speed: stateData.playback_speed,
            current_time: stateData.current_time,
            progress_percent: stateData.progress_percent,
          });
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load session');
        showToast('error', err.message || 'Failed to load replay session');
      } finally {
        setIsLoading(false);
      }
    };

    loadSession();

    // Cleanup: stop replay when unmounting
    return () => {
      fetch('/api/replay/stop', { method: 'POST' }).catch(() => {});
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [sessionId, showToast]);

  // Poll for replay state updates
  useEffect(() => {
    if (!sessionInfo) return;

    const pollState = async () => {
      try {
        const res = await fetch('/api/replay/state');
        const data = await res.json();
        if (data.replay_mode) {
          setReplayState({
            is_playing: data.is_playing,
            current_frame: data.current_frame,
            total_frames: data.total_frames,
            playback_speed: data.playback_speed,
            current_time: data.current_time,
            progress_percent: data.progress_percent,
          });
        }
      } catch {
        // Ignore polling errors
      }
    };

    pollingRef.current = setInterval(pollState, 500);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [sessionInfo]);

  // Control replay
  const controlReplay = useCallback(async (action: string, params?: Record<string, string | number>) => {
    try {
      const query = new URLSearchParams({ action });
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          query.set(key, String(value));
        });
      }

      const res = await fetch(`/api/replay/control?${query.toString()}`, { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        setReplayState({
          is_playing: data.is_playing,
          current_frame: data.current_frame,
          total_frames: data.total_frames,
          playback_speed: data.playback_speed,
          current_time: data.current_time,
          progress_percent: data.progress_percent,
        });
      }
    } catch (err: any) {
      showToast('error', 'Failed to control playback');
    }
  }, [showToast]);

  // Handle play/pause
  const handlePlayPause = useCallback(() => {
    controlReplay(replayState?.is_playing ? 'pause' : 'play');
  }, [replayState?.is_playing, controlReplay]);

  // Handle seek
  const handleSeek = useCallback((frame: number) => {
    controlReplay('seek', { frame });
  }, [controlReplay]);

  // Handle speed change
  const handleSpeedChange = useCallback((speed: number) => {
    controlReplay('speed', { speed });
  }, [controlReplay]);

  // Handle drone selection
  const handleDroneClick = useCallback((droneId: string) => {
    setSelectedDroneId(droneId);
  }, []);

  // Calculate current playback time (in seconds from session start)
  const currentPlaybackTime = useMemo(() => {
    if (!sessionInfo || !replayState?.current_time) return null;
    const startMs = new Date(sessionInfo.start_time).getTime();
    const currentMs = new Date(replayState.current_time).getTime();
    return (currentMs - startMs) / 1000;
  }, [sessionInfo, replayState?.current_time]);

  // Calculate timeline values for Map components (in ms timestamps)
  const mapCurrentTime = useMemo(() => {
    if (replayState?.current_time) {
      return new Date(replayState.current_time).getTime();
    }
    return Date.now();
  }, [replayState?.current_time]);

  const mapTimelineStart = useMemo(() => {
    if (sessionInfo?.start_time) {
      return new Date(sessionInfo.start_time).getTime();
    }
    return Date.now() - 3600000;
  }, [sessionInfo?.start_time]);

  // Loading state
  if (isLoading) {
    return (
      <div className="rc-container">
        <div className="rc-loading">
          <div className="rc-loading-spinner" />
          <span>Loading replay session...</span>
        </div>
        <style>{styles}</style>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="rc-container">
        <div className="rc-error">
          <span>Error: {error}</span>
          <GlassButton variant="primary" size="sm" onClick={() => navigate('/')}>
            Back to Home
          </GlassButton>
        </div>
        <style>{styles}</style>
      </div>
    );
  }

  return (
    <div className="rc-container">
      {/* Header */}
      <header className="rc-header">
        <div className="rc-header-left">
          <GlassButton
            variant="ghost"
            size="sm"
            onClick={() => navigate('/')}
            style={{ marginRight: '8px' }}
          >
            <ArrowLeft size={16} />
          </GlassButton>

          {/* Replay indicator */}
          <div className="rc-replay-indicator">
            <Play size={12} />
            <span className="rc-replay-label">REPLAY</span>
          </div>

          {/* Session name */}
          <span className="rc-session-name">{sessionInfo?.name || sessionId}</span>
        </div>

        <div className="rc-header-center">
          {/* Current time / Total time */}
          <div className="rc-time-display">
            <Clock size={14} />
            <span>
              {formatDuration(currentPlaybackTime || 0)} / {formatDuration(sessionInfo?.duration_seconds || 0)}
            </span>
          </div>

          {/* Tracker count */}
          <div className="rc-tracker-count">
            <Radio size={14} />
            <span>{drones.size} trackers</span>
          </div>

          {/* Connection status */}
          <Badge
            color={connectionStatus === 'connected' ? 'green' : 'red'}
            size="sm"
          >
            {connectionStatus === 'connected' ? 'CONNECTED' : 'OFFLINE'}
          </Badge>
        </div>

        <div className="rc-header-right">
          {/* Exit Replay button */}
          <GlassButton
            variant="secondary"
            size="sm"
            onClick={() => {
              fetch('/api/replay/stop', { method: 'POST' });
              navigate('/');
            }}
          >
            <X size={14} />
            Exit Replay
          </GlassButton>
        </div>
      </header>

      {/* Main 2-column layout */}
      <div className="rc-main">
        {/* Left Panel - Session Info */}
        <aside className="rc-sidebar rc-left">
          {/* Session Info Card */}
          <div className="rc-section">
            <div className="rc-section-header">
              <Activity size={14} />
              <span>Session Info</span>
            </div>
            <div className="rc-info-grid">
              <div className="rc-info-row">
                <span className="rc-info-label">Site</span>
                <span className="rc-info-value">{sessionSite?.name || 'No site'}</span>
              </div>
              {testSession?.operator_name && (
                <div className="rc-info-row">
                  <span className="rc-info-label">Operator</span>
                  <span className="rc-info-value">{testSession.operator_name}</span>
                </div>
              )}
              <div className="rc-info-row">
                <span className="rc-info-label">Duration</span>
                <span className="rc-info-value">{formatDuration(sessionInfo?.duration_seconds || 0)}</span>
              </div>
              <div className="rc-info-row">
                <span className="rc-info-label">Records</span>
                <span className="rc-info-value">{sessionInfo?.total_records?.toLocaleString() || 0}</span>
              </div>
              <div className="rc-info-row">
                <span className="rc-info-label">Start</span>
                <span className="rc-info-value">
                  {sessionInfo?.start_time
                    ? new Date(sessionInfo.start_time).toLocaleString()
                    : '-'}
                </span>
              </div>
            </div>
          </div>

          {/* Trackers List */}
          <div className="rc-section rc-section-grow">
            <div className="rc-section-header">
              <Users size={14} />
              <span>Trackers</span>
              <Badge color="blue" size="sm">{drones.size}</Badge>
            </div>
            <div className="rc-tracker-list">
              {Array.from(drones.values()).map(drone => (
                <div
                  key={drone.tracker_id}
                  className={`rc-tracker-item ${selectedDroneId === drone.tracker_id ? 'selected' : ''}`}
                  onClick={() => handleDroneClick(drone.tracker_id)}
                >
                  <div className="rc-tracker-icon">
                    <Radio size={12} />
                  </div>
                  <div className="rc-tracker-info">
                    <span className="rc-tracker-id">{drone.tracker_id}</span>
                    <span className="rc-tracker-status">
                      {drone.is_stale ? 'Stale' : drone.fix_valid ? 'Active' : 'No fix'}
                    </span>
                  </div>
                  <div className={`rc-tracker-dot ${drone.is_stale ? 'stale' : drone.fix_valid ? 'active' : 'no-fix'}`} />
                </div>
              ))}
              {drones.size === 0 && (
                <div className="rc-empty">No trackers in session</div>
              )}
            </div>
          </div>

          {/* CUAS Systems Section */}
          {cuasPlacements.length > 0 && (
            <div className="rc-section">
              <div className="rc-section-header">
                <Radio size={14} />
                <span>CUAS Systems</span>
                <Badge color="orange" size="sm">{cuasPlacements.length}</Badge>
              </div>
              <div className="rc-cuas-list">
                {cuasPlacements.map((placement, idx) => {
                  const profile = getProfile(placement);
                  return (
                    <div
                      key={placement.id}
                      className={`rc-cuas-item ${selectedCuasId === placement.id ? 'selected' : ''}`}
                      onClick={() => setSelectedCuasId(selectedCuasId === placement.id ? null : placement.id)}
                    >
                      <div className="rc-cuas-icon">
                        <Radio size={12} />
                      </div>
                      <div className="rc-cuas-info">
                        <span className="rc-cuas-name">{profile?.name || `CUAS ${idx + 1}`}</span>
                        <span className="rc-cuas-location">
                          {placement.position?.lat?.toFixed(4) ?? '?'}, {placement.position?.lon?.toFixed(4) ?? '?'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Event Log */}
          <div className="rc-section">
            <div className="rc-section-header">
              <Zap size={14} />
              <span>Event Log</span>
              <Badge color="gray" size="sm">{testSession?.events?.length || 0}</Badge>
            </div>
            <div className="rc-event-log">
              {(testSession?.events || []).slice(-10).reverse().map((event, idx) => {
                const cuasPlacement = event.cuas_id
                  ? cuasPlacements.find(p => p.id === event.cuas_id)
                  : undefined;
                const cuasName = cuasPlacement ? getProfile(cuasPlacement)?.name : null;

                return (
                  <div key={idx} className="rc-event-item">
                    <span
                      className="rc-event-dot"
                      style={{ background: EVENT_COLORS[event.type] || '#6b7280' }}
                    />
                    <div className="rc-event-details">
                      <span className="rc-event-type">{event.type.replace('_', ' ')}</span>
                      {cuasName && <span className="rc-event-cuas">{cuasName}</span>}
                      {event.note && <span className="rc-event-note">{event.note}</span>}
                    </div>
                    <span className="rc-event-time">{formatEventTime(event.timestamp)}</span>
                  </div>
                );
              })}
              {(!testSession?.events || testSession.events.length === 0) && (
                <div className="rc-empty">No events recorded</div>
              )}
            </div>
          </div>
        </aside>

        {/* Center - Map */}
        <main className="rc-center">
          <div className="rc-map">
            <MapComponent
              drones={drones}
              droneHistory={droneHistory}
              selectedDroneId={selectedDroneId}
              onDroneClick={handleDroneClick}
              currentTime={mapCurrentTime}
              timelineStart={mapTimelineStart}
              selectedSite={sessionSite}
              cuasPlacements={cuasPlacements}
              cuasProfiles={cuasProfiles}
              cuasJamStates={new Map()}
              showCuasCoverage={true}
              mapStyle={mapStyle}
            />

            {/* 3D View Overlay */}
            {show3DView && !showCesiumGlobe && (
              <Map3DViewer
                droneHistory={droneHistory}
                currentTime={mapCurrentTime}
                timelineStart={mapTimelineStart}
                onClose={() => setShow3DView(false)}
                showQualityColors={false}
                mapStyle={mapStyle}
                site={sessionSite}
                cuasPlacements={cuasPlacements}
                cuasProfiles={cuasProfiles}
                cuasJamStates={new Map()}
                currentDroneData={drones}
              />
            )}

            {/* Google 3D Globe Overlay */}
            {showCesiumGlobe && (
              <div style={{ position: 'absolute', inset: 0, zIndex: 10 }}>
                <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''} version="alpha">
                  <Google3DViewer
                    mode="replay"
                    droneHistory={droneHistory}
                    currentTime={mapCurrentTime}
                    timelineStart={mapTimelineStart}
                    site={sessionSite}
                    cuasPlacements={cuasPlacements}
                    cuasProfiles={cuasProfiles}
                    currentDroneData={drones}
                    selectedDroneId={selectedDroneId}
                    onDroneClick={handleDroneClick}
                    onClose={() => setShowCesiumGlobe(false)}
                  />
                </APIProvider>
              </div>
            )}

            {/* Google 3D Globe Toggle */}
            <button
              onClick={() => {
                setShowCesiumGlobe(prev => !prev);
                if (!showCesiumGlobe) setShow3DView(false);
              }}
              title={showCesiumGlobe ? 'Close Globe View' : 'Open Google 3D Globe'}
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
              }}
            >
              <Globe size={18} />
            </button>

            {/* Map Style Toggle */}
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

            {/* 3D Toggle */}
            <button
              onClick={() => {
                setShow3DView(prev => !prev);
                if (!show3DView) setShowCesiumGlobe(false);
              }}
              title={show3DView ? 'Switch to 2D Map' : 'Switch to 3D View'}
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

          {/* Playback Controls Bar */}
          <div className="rc-playback-bar">
            {/* Skip to start */}
            <button
              className="rc-playback-btn"
              onClick={() => handleSeek(0)}
              title="Skip to start"
            >
              <SkipBack size={16} />
            </button>

            {/* Step back 10 frames */}
            <button
              className="rc-playback-btn"
              onClick={() => handleSeek(Math.max(0, (replayState?.current_frame || 0) - 10))}
              title="Step back"
            >
              <Rewind size={16} />
            </button>

            {/* Play/Pause */}
            <button
              className={`rc-playback-btn rc-play-btn ${replayState?.is_playing ? 'playing' : ''}`}
              onClick={handlePlayPause}
              title={replayState?.is_playing ? 'Pause' : 'Play'}
            >
              {replayState?.is_playing ? <Pause size={20} /> : <Play size={20} />}
            </button>

            {/* Step forward 10 frames */}
            <button
              className="rc-playback-btn"
              onClick={() => handleSeek(Math.min((replayState?.total_frames || 0) - 1, (replayState?.current_frame || 0) + 10))}
              title="Step forward"
            >
              <FastForward size={16} />
            </button>

            {/* Skip to end */}
            <button
              className="rc-playback-btn"
              onClick={() => handleSeek((replayState?.total_frames || 1) - 1)}
              title="Skip to end"
            >
              <SkipForward size={16} />
            </button>

            {/* Timeline scrubber */}
            <div className="rc-timeline">
              <input
                type="range"
                min="0"
                max={replayState?.total_frames || 100}
                value={replayState?.current_frame || 0}
                onChange={(e) => handleSeek(parseInt(e.target.value, 10))}
                className="rc-timeline-slider"
              />
              <div
                className="rc-timeline-progress"
                style={{ width: `${replayState?.progress_percent || 0}%` }}
              />
            </div>

            {/* Frame counter */}
            <div className="rc-frame-counter">
              {replayState?.current_frame || 0} / {replayState?.total_frames || 0}
            </div>

            {/* Speed selector */}
            <select
              className="rc-speed-select"
              value={replayState?.playback_speed || 1}
              onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
            >
              <option value="0.25">0.25x</option>
              <option value="0.5">0.5x</option>
              <option value="1">1x</option>
              <option value="2">2x</option>
              <option value="4">4x</option>
              <option value="8">8x</option>
            </select>
          </div>
        </main>
      </div>

      {/* Drone Detail Modal */}
      {selectedDrone && (
        <div className="rc-drone-modal">
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
          <div className="rc-cuas-dialog-overlay" onClick={() => setSelectedCuasId(null)}>
            <div className="rc-cuas-dialog" onClick={e => e.stopPropagation()}>
              <div className="rc-cuas-dialog-header">
                <span>{profile?.name || 'CUAS System'}</span>
                <button onClick={() => setSelectedCuasId(null)}><X size={16} /></button>
              </div>
              <div className="rc-cuas-dialog-content">
                <div className="rc-cuas-dialog-row">
                  <span>Type:</span>
                  <span>{profile?.type || 'Unknown'}</span>
                </div>
                <div className="rc-cuas-dialog-row">
                  <span>Range:</span>
                  <span>{profile?.effective_range_m || 0}m</span>
                </div>
                <div className="rc-cuas-dialog-row">
                  <span>Position:</span>
                  <span>{placement.position?.lat?.toFixed(5) ?? '?'}, {placement.position?.lon?.toFixed(5) ?? '?'}</span>
                </div>
                <div className="rc-cuas-dialog-row">
                  <span>Height AGL:</span>
                  <span>{placement.height_agl_m}m</span>
                </div>
              </div>
            </div>
          </div>
        ) : null;
      })()}

      <style>{styles}</style>
    </div>
  );
}

const styles = `
  .rc-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    background: #0a0a12;
    color: #fff;
    overflow: hidden;
  }

  /* Header */
  .rc-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    background: rgba(15, 15, 25, 0.95);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    height: 56px;
    flex-shrink: 0;
  }

  .rc-header-left, .rc-header-center, .rc-header-right {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .rc-header-center {
    gap: 24px;
  }

  .rc-replay-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: rgba(59, 130, 246, 0.15);
    border: 1px solid rgba(59, 130, 246, 0.3);
    border-radius: 8px;
    color: #3b82f6;
  }

  .rc-replay-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 1px;
  }

  .rc-session-name {
    font-size: 15px;
    font-weight: 600;
    color: #fff;
  }

  .rc-time-display, .rc-tracker-count {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.7);
  }

  .rc-time-display span {
    font-family: monospace;
    font-weight: 600;
    color: #3b82f6;
  }

  /* Main Layout */
  .rc-main {
    flex: 1;
    display: grid;
    grid-template-columns: 280px 1fr;
    gap: 8px;
    padding: 8px;
    min-height: 0;
    overflow: hidden;
  }

  /* Sidebar */
  .rc-sidebar {
    background: rgba(20, 20, 35, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 10px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .rc-section {
    padding: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .rc-section:last-child {
    border-bottom: none;
  }

  .rc-section-grow {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .rc-section-header {
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

  .rc-info-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .rc-info-row {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
  }

  .rc-info-label {
    color: rgba(255, 255, 255, 0.5);
  }

  .rc-info-value {
    color: #fff;
    font-weight: 500;
  }

  /* Tracker List */
  .rc-tracker-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .rc-tracker-item {
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

  .rc-tracker-item:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .rc-tracker-item.selected {
    background: rgba(59, 130, 246, 0.1);
    border-color: rgba(59, 130, 246, 0.3);
  }

  .rc-tracker-icon {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.6);
  }

  .rc-tracker-info {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .rc-tracker-id {
    font-size: 12px;
    font-weight: 500;
    color: #fff;
  }

  .rc-tracker-status {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.4);
  }

  .rc-tracker-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .rc-tracker-dot.active {
    background: #22c55e;
    box-shadow: 0 0 6px rgba(34, 197, 94, 0.5);
  }

  .rc-tracker-dot.stale {
    background: #f97316;
  }

  .rc-tracker-dot.no-fix {
    background: #6b7280;
  }

  /* CUAS List */
  .rc-cuas-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 120px;
    overflow-y: auto;
  }

  .rc-cuas-item {
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

  .rc-cuas-item:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .rc-cuas-item.selected {
    background: rgba(249, 115, 22, 0.1);
    border-color: rgba(249, 115, 22, 0.3);
  }

  .rc-cuas-icon {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(249, 115, 22, 0.1);
    border-radius: 4px;
    color: #f97316;
  }

  .rc-cuas-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .rc-cuas-name {
    font-size: 12px;
    font-weight: 500;
    color: #fff;
  }

  .rc-cuas-location {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.4);
    font-family: monospace;
  }

  /* Event Log */
  .rc-event-log {
    max-height: 150px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .rc-event-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    background: rgba(255, 255, 255, 0.02);
    border-radius: 4px;
    font-size: 11px;
  }

  .rc-event-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .rc-event-details {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .rc-event-type {
    color: rgba(255, 255, 255, 0.7);
    text-transform: capitalize;
  }

  .rc-event-cuas {
    font-size: 9px;
    color: rgba(249, 115, 22, 0.8);
  }

  .rc-event-note {
    font-size: 9px;
    color: rgba(255, 255, 255, 0.4);
    font-style: italic;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rc-event-time {
    font-family: monospace;
    color: rgba(255, 255, 255, 0.4);
  }

  .rc-empty {
    padding: 16px;
    text-align: center;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.3);
  }

  /* Center */
  .rc-center {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .rc-map {
    flex: 1;
    position: relative;
    min-height: 0;
    border-radius: 10px;
    overflow: hidden;
    background: rgba(20, 20, 35, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.06);
  }

  /* Playback Bar */
  .rc-playback-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: rgba(20, 20, 35, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
  }

  .rc-playback-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    transition: all 0.15s;
  }

  .rc-playback-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  .rc-play-btn {
    width: 44px;
    height: 44px;
    background: rgba(59, 130, 246, 0.2);
    border-color: rgba(59, 130, 246, 0.4);
    color: #3b82f6;
  }

  .rc-play-btn:hover {
    background: rgba(59, 130, 246, 0.3);
  }

  .rc-play-btn.playing {
    background: rgba(249, 115, 22, 0.2);
    border-color: rgba(249, 115, 22, 0.4);
    color: #f97316;
  }

  /* Timeline */
  .rc-timeline {
    flex: 1;
    position: relative;
    height: 36px;
    display: flex;
    align-items: center;
  }

  .rc-timeline-slider {
    width: 100%;
    height: 8px;
    appearance: none;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    cursor: pointer;
  }

  .rc-timeline-slider::-webkit-slider-thumb {
    appearance: none;
    width: 16px;
    height: 16px;
    background: #3b82f6;
    border-radius: 50%;
    cursor: grab;
    box-shadow: 0 2px 6px rgba(59, 130, 246, 0.4);
  }

  .rc-timeline-slider::-webkit-slider-thumb:active {
    cursor: grabbing;
  }

  .rc-timeline-progress {
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    height: 8px;
    background: rgba(59, 130, 246, 0.4);
    border-radius: 4px;
    pointer-events: none;
  }

  .rc-frame-counter {
    font-family: monospace;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
    min-width: 80px;
    text-align: center;
  }

  .rc-speed-select {
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    color: #fff;
    font-size: 12px;
    cursor: pointer;
    outline: none;
  }

  .rc-speed-select option {
    background: #1a1a2e;
  }

  /* Modals */
  .rc-drone-modal {
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

  .rc-cuas-dialog-overlay {
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

  .rc-cuas-dialog {
    background: rgba(20, 20, 35, 0.98);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 16px;
    min-width: 280px;
    max-width: 360px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .rc-cuas-dialog-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .rc-cuas-dialog-header span {
    font-size: 16px;
    font-weight: 600;
    color: #fff;
  }

  .rc-cuas-dialog-header button {
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

  .rc-cuas-dialog-header button:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  .rc-cuas-dialog-content {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .rc-cuas-dialog-row {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
  }

  .rc-cuas-dialog-row span:first-child {
    color: rgba(255, 255, 255, 0.5);
  }

  .rc-cuas-dialog-row span:last-child {
    color: #fff;
    font-weight: 500;
  }

  /* Loading & Error */
  .rc-loading, .rc-error {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    color: rgba(255, 255, 255, 0.6);
  }

  .rc-loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(59, 130, 246, 0.2);
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: rc-spin 1s linear infinite;
  }

  @keyframes rc-spin {
    to { transform: rotate(360deg); }
  }
`;
