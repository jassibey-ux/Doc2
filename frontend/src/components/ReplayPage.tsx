/**
 * Replay Page - Dedicated page for browsing and replaying saved test sessions
 * Features two-phase loading: metadata returns immediately, frames build in background
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useWorkflow } from '../contexts/WorkflowContext';
import { useToast } from '../contexts/ToastContext';
import { GlassButton, Badge } from './ui/GlassUI';
import MapComponent from './Map';
import Map3DViewer from './Map3DViewer';
import DroneDetailPanel from './DroneDetailPanel';
import ReplaySessionBrowserPanel from './ReplaySessionBrowserPanel';
import type { CUASProfile, SiteDefinition } from '../types/workflow';
import {
  ArrowLeft,
  Radio,
  Clock,
  Activity,
  Users,
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
  Loader2,
  History,
} from 'lucide-react';

// State machine for replay page
type ReplayPageState =
  | { status: 'idle' }
  | { status: 'loading_metadata'; sessionId: string }
  | { status: 'building_frames'; sessionId: string; metadata: SessionMetadata }
  | { status: 'ready'; sessionId: string; metadata: SessionMetadata; frameCount: number }
  | { status: 'error'; sessionId: string; error: string };

interface SessionMetadata {
  session_id: string;
  name: string;
  duration_seconds: number;
  start_time: string;
  end_time: string;
  tracker_ids: string[];
  total_records: number;
}

interface ReplayState {
  is_playing: boolean;
  current_frame: number;
  total_frames: number;
  playback_speed: number;
  current_time: string | null;
  progress_percent: number;
}

// Format duration as HH:MM:SS
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default function ReplayPage() {
  const navigate = useNavigate();
  const { sessionId: urlSessionId } = useParams<{ sessionId: string }>();
  const { showToast } = useToast();

  // WebSocket context with replay frame notifications
  const {
    drones,
    droneHistory,
    connectionStatus,
    replayFramesReady,
    replayFramesError,
    replayBuildProgress,
    clearReplayFramesReady,
    clearReplayFramesError,
    clearReplayBuildProgress,
  } = useWebSocket();

  // Workflow context for site/CUAS profiles
  const {
    cuasProfiles,
    sites,
    testSessions,
  } = useWorkflow();

  // Page state machine
  const [pageState, setPageState] = useState<ReplayPageState>({ status: 'idle' });
  const [replayState, setReplayState] = useState<ReplayState | null>(null);

  // UI state
  const [selectedDroneId, setSelectedDroneId] = useState<string | null>(null);
  const [show3DView, setShow3DView] = useState(true);
  const [mapStyle, setMapStyle] = useState<'dark' | 'satellite' | 'street'>('satellite');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Get selected drone
  const selectedDrone = selectedDroneId ? drones.get(selectedDroneId) || null : null;

  // Try to find test session from workflow context
  const testSession = useMemo(() => {
    if (pageState.status === 'ready' || pageState.status === 'building_frames') {
      return testSessions.find(s => s.id === pageState.sessionId) || null;
    }
    return null;
  }, [testSessions, pageState]);

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

  // Build profiles map (used by Map3DViewer for CUAS coverage)
  const _profilesMap = useMemo(() => {
    const map = new Map<string, CUASProfile>();
    cuasProfiles.forEach(p => map.set(p.id, p));
    return map;
  }, [cuasProfiles]);
  void _profilesMap; // Suppress unused warning - may be used for CUAS features

  // Load session from URL on mount or when URL changes
  useEffect(() => {
    if (urlSessionId) {
      // If idle, load the session
      if (pageState.status === 'idle') {
        handleSelectSession(urlSessionId);
      }
      // If already loading/building a different session, switch to the new one
      else if (
        (pageState.status === 'loading_metadata' || pageState.status === 'building_frames') &&
        pageState.sessionId !== urlSessionId
      ) {
        // Cancel current load and switch to new session
        fetch('/api/replay/stop', { method: 'POST' }).catch(() => {});
        handleSelectSession(urlSessionId);
      }
    }
  }, [urlSessionId]);

  // Listen for frames ready notification
  useEffect(() => {
    if (replayFramesReady && pageState.status === 'building_frames') {
      if (replayFramesReady.sessionId === pageState.sessionId) {
        setPageState({
          status: 'ready',
          sessionId: pageState.sessionId,
          metadata: pageState.metadata,
          frameCount: replayFramesReady.frameCount,
        });
        clearReplayFramesReady();
        clearReplayBuildProgress(); // Clear progress when frames are ready
        showToast('success', `Session loaded: ${replayFramesReady.frameCount} frames`);
      }
    }
  }, [replayFramesReady, pageState, clearReplayFramesReady, clearReplayBuildProgress, showToast]);

  // Listen for frames error notification
  useEffect(() => {
    if (replayFramesError && pageState.status === 'building_frames') {
      if (replayFramesError.sessionId === pageState.sessionId) {
        setPageState({
          status: 'error',
          sessionId: pageState.sessionId,
          error: replayFramesError.error,
        });
        clearReplayFramesError();
        showToast('error', `Failed to load session: ${replayFramesError.error}`);
      }
    }
  }, [replayFramesError, pageState, clearReplayFramesError, showToast]);

  // Handle session selection
  const handleSelectSession = async (sessionId: string) => {
    // Clear previous state
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setReplayState(null);

    // Phase 1: Load metadata
    setPageState({ status: 'loading_metadata', sessionId });

    try {
      const res = await fetch(`/api/replay/load/${sessionId}`, { method: 'POST' });

      // Check HTTP status before parsing JSON
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to load session');
      }

      const session = data.session;
      const metadata: SessionMetadata = {
        session_id: session.session_id || sessionId,
        name: session.name || sessionId,
        duration_seconds: session.duration_seconds || 0,
        start_time: session.start_time || '',
        end_time: session.end_time || '',
        tracker_ids: session.tracker_ids || [],
        total_records: session.total_records || 0,
      };

      // Phase 2: Wait for frames (backend builds in background, notifies via WebSocket)
      setPageState({
        status: 'building_frames',
        sessionId,
        metadata,
      });

      // Update URL if needed
      if (!urlSessionId || urlSessionId !== sessionId) {
        navigate(`/replay/${sessionId}`, { replace: true });
      }

    } catch (err: any) {
      setPageState({
        status: 'error',
        sessionId,
        error: err.message || 'Failed to load session',
      });
      showToast('error', err.message || 'Failed to load session');
    }
  };

  // Poll for replay state when ready
  useEffect(() => {
    if (pageState.status !== 'ready') return;

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

    // Initial poll
    pollState();

    pollingRef.current = setInterval(pollState, 500);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [pageState.status]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      fetch('/api/replay/stop', { method: 'POST' }).catch(() => {});
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

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

  const handlePlayPause = useCallback(() => {
    controlReplay(replayState?.is_playing ? 'pause' : 'play');
  }, [replayState?.is_playing, controlReplay]);

  const handleSeek = useCallback((frame: number) => {
    controlReplay('seek', { frame });
  }, [controlReplay]);

  const handleSpeedChange = useCallback((speed: number) => {
    controlReplay('speed', { speed });
  }, [controlReplay]);

  const handleDroneClick = useCallback((droneId: string) => {
    setSelectedDroneId(droneId);
  }, []);

  // Calculate current playback time
  const currentPlaybackTime = useMemo(() => {
    if (pageState.status !== 'ready' || !replayState?.current_time) return null;
    const startMs = new Date(pageState.metadata.start_time).getTime();
    const currentMs = new Date(replayState.current_time).getTime();
    return (currentMs - startMs) / 1000;
  }, [pageState, replayState?.current_time]);

  // Get current metadata
  const metadata = (pageState.status === 'building_frames' || pageState.status === 'ready')
    ? pageState.metadata
    : null;

  // Check if we're in a loading/building state
  const isProcessing = pageState.status === 'loading_metadata' || pageState.status === 'building_frames';

  return (
    <div className="rp-container">
      {/* Header */}
      <header className="rp-header">
        <div className="rp-header-left">
          <GlassButton
            variant="ghost"
            size="sm"
            onClick={() => {
              fetch('/api/replay/stop', { method: 'POST' });
              navigate('/');
            }}
            style={{ marginRight: '8px' }}
          >
            <ArrowLeft size={16} />
          </GlassButton>

          <div className="rp-replay-indicator">
            <History size={12} />
            <span className="rp-replay-label">REPLAY</span>
          </div>

          {metadata && (
            <span className="rp-session-name">{metadata.name}</span>
          )}

          {isProcessing && (
            <span style={{ marginLeft: '8px' }}>
              <Badge color="yellow" size="sm">
                <Loader2 size={10} className="spinning" style={{ marginRight: '4px' }} />
                {pageState.status === 'loading_metadata' ? 'Loading...' : 'Building frames...'}
              </Badge>
            </span>
          )}
        </div>

        <div className="rp-header-center">
          {pageState.status === 'ready' && (
            <>
              <div className="rp-time-display">
                <Clock size={14} />
                <span>
                  {formatDuration(currentPlaybackTime || 0)} / {formatDuration(metadata?.duration_seconds || 0)}
                </span>
              </div>

              <div className="rp-tracker-count">
                <Radio size={14} />
                <span>{drones.size} trackers</span>
              </div>
            </>
          )}

          <Badge
            color={connectionStatus === 'connected' ? 'green' : 'red'}
            size="sm"
          >
            {connectionStatus === 'connected' ? 'CONNECTED' : 'OFFLINE'}
          </Badge>
        </div>

        <div className="rp-header-right">
          {pageState.status !== 'idle' && (
            <GlassButton
              variant="secondary"
              size="sm"
              onClick={() => {
                fetch('/api/replay/stop', { method: 'POST' });
                setPageState({ status: 'idle' });
                setReplayState(null);
                navigate('/replay', { replace: true });
              }}
            >
              <X size={14} />
              Close Session
            </GlassButton>
          )}
        </div>
      </header>

      {/* Main Layout */}
      <div className="rp-main">
        {/* Left Panel - Session Browser */}
        <aside className="rp-browser">
          <ReplaySessionBrowserPanel
            selectedSessionId={pageState.status !== 'idle' ? (pageState as any).sessionId : null}
            onSelectSession={handleSelectSession}
            disabled={isProcessing}
          />
        </aside>

        {/* Center Content */}
        <main className="rp-content">
          {pageState.status === 'idle' ? (
            <div className="rp-empty-state">
              <History size={48} />
              <span className="rp-empty-title">Select a Session</span>
              <span className="rp-empty-hint">Choose a recorded session from the list to replay</span>
            </div>
          ) : pageState.status === 'loading_metadata' ? (
            <div className="rp-loading-state">
              <div className="rp-spinner" />
              <span>Loading session...</span>
            </div>
          ) : pageState.status === 'building_frames' ? (
            <div className="rp-building-state">
              <div className="rp-spinner" />
              <span className="rp-building-title">Building frames...</span>
              <span className="rp-building-info">
                {metadata?.name} - {metadata?.total_records?.toLocaleString()} records
              </span>
              {/* Progress bar */}
              {replayBuildProgress && replayBuildProgress.sessionId === pageState.sessionId ? (
                <div className="rp-progress-container">
                  <div className="rp-progress-bar">
                    <div
                      className="rp-progress-fill"
                      style={{ width: `${replayBuildProgress.percent}%` }}
                    />
                  </div>
                  <span className="rp-progress-text">
                    {replayBuildProgress.percent}% ({replayBuildProgress.frameIndex.toLocaleString()} / {replayBuildProgress.totalFrames.toLocaleString()} frames)
                  </span>
                </div>
              ) : (
                <span className="rp-building-hint">This may take a few seconds for large sessions</span>
              )}
            </div>
          ) : pageState.status === 'error' ? (
            <div className="rp-error-state">
              <span className="rp-error-title">Error</span>
              <span className="rp-error-message">{pageState.error}</span>
              <GlassButton variant="primary" size="sm" onClick={() => {
                // Cleanup before resetting state
                fetch('/api/replay/stop', { method: 'POST' }).catch(() => {});
                setPageState({ status: 'idle' });
              }}>
                Try Another Session
              </GlassButton>
            </div>
          ) : (
            <>
              {/* Map */}
              <div className="rp-map">
                <MapComponent
                  drones={drones}
                  droneHistory={droneHistory}
                  selectedDroneId={selectedDroneId}
                  onDroneClick={handleDroneClick}
                  currentTime={Date.now()}
                  timelineStart={Date.now() - 3600000}
                  selectedSite={sessionSite}
                  cuasPlacements={cuasPlacements}
                  cuasProfiles={cuasProfiles}
                  cuasJamStates={new Map()}
                  showCuasCoverage={true}
                  mapStyle={mapStyle}
                />

                {show3DView && (
                  <Map3DViewer
                    droneHistory={droneHistory}
                    currentTime={Date.now()}
                    timelineStart={Date.now() - 3600000}
                    onClose={() => setShow3DView(false)}
                    showQualityColors={false}
                    site={sessionSite}
                    cuasPlacements={cuasPlacements}
                    cuasProfiles={cuasProfiles}
                    cuasJamStates={new Map()}
                    currentDroneData={drones}
                  />
                )}

                {/* Map controls */}
                <button
                  onClick={() => setMapStyle(prev =>
                    prev === 'dark' ? 'satellite' : prev === 'satellite' ? 'street' : 'dark'
                  )}
                  title="Toggle map style"
                  className="rp-map-btn"
                  style={{ right: '56px' }}
                >
                  {mapStyle === 'satellite' ? <Globe size={18} /> : <MapIcon size={18} />}
                </button>

                <button
                  onClick={() => setShow3DView(prev => !prev)}
                  title={show3DView ? 'Switch to 2D' : 'Switch to 3D'}
                  className={`rp-map-btn ${show3DView ? 'active' : ''}`}
                  style={{ right: '10px' }}
                >
                  <Box size={18} />
                </button>
              </div>

              {/* Playback Controls */}
              <div className="rp-playback-bar">
                <button className="rp-pb-btn" onClick={() => handleSeek(0)} title="Skip to start">
                  <SkipBack size={16} />
                </button>

                <button
                  className="rp-pb-btn"
                  onClick={() => handleSeek(Math.max(0, (replayState?.current_frame || 0) - 10))}
                  title="Step back"
                >
                  <Rewind size={16} />
                </button>

                <button
                  className={`rp-pb-btn rp-play-btn ${replayState?.is_playing ? 'playing' : ''}`}
                  onClick={handlePlayPause}
                  title={replayState?.is_playing ? 'Pause' : 'Play'}
                >
                  {replayState?.is_playing ? <Pause size={20} /> : <Play size={20} />}
                </button>

                <button
                  className="rp-pb-btn"
                  onClick={() => handleSeek(Math.min((replayState?.total_frames || 0) - 1, (replayState?.current_frame || 0) + 10))}
                  title="Step forward"
                >
                  <FastForward size={16} />
                </button>

                <button
                  className="rp-pb-btn"
                  onClick={() => handleSeek((replayState?.total_frames || 1) - 1)}
                  title="Skip to end"
                >
                  <SkipForward size={16} />
                </button>

                <div className="rp-timeline">
                  <input
                    type="range"
                    min="0"
                    max={replayState?.total_frames || 100}
                    value={replayState?.current_frame || 0}
                    onChange={(e) => handleSeek(parseInt(e.target.value, 10))}
                    className="rp-timeline-slider"
                  />
                  <div
                    className="rp-timeline-progress"
                    style={{ width: `${replayState?.progress_percent || 0}%` }}
                  />
                </div>

                <div className="rp-frame-counter">
                  {replayState?.current_frame || 0} / {replayState?.total_frames || 0}
                </div>

                <select
                  className="rp-speed-select"
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
            </>
          )}
        </main>

        {/* Right Panel - Session Info (only when ready) */}
        {pageState.status === 'ready' && (
          <aside className="rp-sidebar">
            <div className="rp-section">
              <div className="rp-section-header">
                <Activity size={14} />
                <span>Session Info</span>
              </div>
              <div className="rp-info-grid">
                <div className="rp-info-row">
                  <span className="rp-info-label">Duration</span>
                  <span className="rp-info-value">{formatDuration(metadata?.duration_seconds || 0)}</span>
                </div>
                <div className="rp-info-row">
                  <span className="rp-info-label">Records</span>
                  <span className="rp-info-value">{metadata?.total_records?.toLocaleString() || 0}</span>
                </div>
                <div className="rp-info-row">
                  <span className="rp-info-label">Frames</span>
                  <span className="rp-info-value">{pageState.frameCount.toLocaleString()}</span>
                </div>
                <div className="rp-info-row">
                  <span className="rp-info-label">Site</span>
                  <span className="rp-info-value">{sessionSite?.name || 'No site'}</span>
                </div>
              </div>
            </div>

            <div className="rp-section rp-section-grow">
              <div className="rp-section-header">
                <Users size={14} />
                <span>Trackers</span>
                <Badge color="blue" size="sm">{drones.size}</Badge>
              </div>
              <div className="rp-tracker-list">
                {Array.from(drones.values()).map(drone => (
                  <div
                    key={drone.tracker_id}
                    className={`rp-tracker-item ${selectedDroneId === drone.tracker_id ? 'selected' : ''}`}
                    onClick={() => handleDroneClick(drone.tracker_id)}
                  >
                    <div className="rp-tracker-icon">
                      <Radio size={12} />
                    </div>
                    <div className="rp-tracker-info">
                      <span className="rp-tracker-id">{drone.tracker_id}</span>
                      <span className="rp-tracker-status">
                        {drone.is_stale ? 'Stale' : drone.fix_valid ? 'Active' : 'No fix'}
                      </span>
                    </div>
                    <div className={`rp-tracker-dot ${drone.is_stale ? 'stale' : drone.fix_valid ? 'active' : 'no-fix'}`} />
                  </div>
                ))}
                {drones.size === 0 && (
                  <div className="rp-empty">No trackers in session</div>
                )}
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Drone Detail Modal */}
      {selectedDrone && (
        <div className="rp-drone-modal">
          <DroneDetailPanel
            drone={selectedDrone}
            onClose={() => setSelectedDroneId(null)}
            onOpenCamera={() => {}}
          />
        </div>
      )}

      <style>{styles}</style>
    </div>
  );
}

const styles = `
  .rp-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    background: #0a0a12;
    color: #fff;
    overflow: hidden;
  }

  /* Header */
  .rp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    background: rgba(15, 15, 25, 0.95);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    height: 56px;
    flex-shrink: 0;
  }

  .rp-header-left, .rp-header-center, .rp-header-right {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .rp-header-center {
    gap: 24px;
  }

  .rp-replay-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: rgba(59, 130, 246, 0.15);
    border: 1px solid rgba(59, 130, 246, 0.3);
    border-radius: 8px;
    color: #3b82f6;
  }

  .rp-replay-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 1px;
  }

  .rp-session-name {
    font-size: 15px;
    font-weight: 600;
    color: #fff;
  }

  .rp-time-display, .rp-tracker-count {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.7);
  }

  .rp-time-display span {
    font-family: monospace;
    font-weight: 600;
    color: #3b82f6;
  }

  .spinning {
    animation: rp-spin 1s linear infinite;
  }

  @keyframes rp-spin {
    to { transform: rotate(360deg); }
  }

  /* Main Layout */
  .rp-main {
    flex: 1;
    display: grid;
    grid-template-columns: 260px 1fr;
    gap: 8px;
    padding: 8px;
    min-height: 0;
    overflow: hidden;
  }

  .rp-main:has(.rp-sidebar) {
    grid-template-columns: 260px 1fr 260px;
  }

  /* Browser Panel */
  .rp-browser {
    border-radius: 10px;
    overflow: hidden;
  }

  /* Content Area */
  .rp-content {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  /* Empty/Loading/Error States */
  .rp-empty-state, .rp-loading-state, .rp-building-state, .rp-error-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    background: rgba(20, 20, 35, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 10px;
    color: rgba(255, 255, 255, 0.5);
  }

  .rp-empty-title, .rp-building-title, .rp-error-title {
    font-size: 18px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.7);
  }

  .rp-empty-hint, .rp-building-hint {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.4);
  }

  .rp-building-info {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.5);
    font-family: monospace;
  }

  /* Progress bar for frame building */
  .rp-progress-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: 100%;
    max-width: 400px;
    padding: 0 20px;
  }

  .rp-progress-bar {
    width: 100%;
    height: 8px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    overflow: hidden;
  }

  .rp-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #f97316, #fb923c);
    border-radius: 4px;
    transition: width 0.2s ease-out;
  }

  .rp-progress-text {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
    font-family: monospace;
  }

  .rp-error-message {
    font-size: 14px;
    color: #ef4444;
  }

  .rp-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(59, 130, 246, 0.2);
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: rp-spin 1s linear infinite;
  }

  /* Map */
  .rp-map {
    flex: 1;
    position: relative;
    min-height: 0;
    border-radius: 10px;
    overflow: hidden;
    background: rgba(20, 20, 35, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.06);
  }

  .rp-map-btn {
    position: absolute;
    top: 10px;
    z-index: 20;
    width: 36px;
    height: 36px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: rgba(20, 20, 35, 0.9);
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
  }

  .rp-map-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  .rp-map-btn.active {
    background: rgba(0, 200, 255, 0.3);
    color: #00c8ff;
  }

  /* Playback Bar */
  .rp-playback-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: rgba(20, 20, 35, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
  }

  .rp-pb-btn {
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

  .rp-pb-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  .rp-play-btn {
    width: 44px;
    height: 44px;
    background: rgba(59, 130, 246, 0.2);
    border-color: rgba(59, 130, 246, 0.4);
    color: #3b82f6;
  }

  .rp-play-btn:hover {
    background: rgba(59, 130, 246, 0.3);
  }

  .rp-play-btn.playing {
    background: rgba(249, 115, 22, 0.2);
    border-color: rgba(249, 115, 22, 0.4);
    color: #f97316;
  }

  .rp-timeline {
    flex: 1;
    position: relative;
    height: 36px;
    display: flex;
    align-items: center;
  }

  .rp-timeline-slider {
    width: 100%;
    height: 8px;
    appearance: none;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    cursor: pointer;
  }

  .rp-timeline-slider::-webkit-slider-thumb {
    appearance: none;
    width: 16px;
    height: 16px;
    background: #3b82f6;
    border-radius: 50%;
    cursor: grab;
    box-shadow: 0 2px 6px rgba(59, 130, 246, 0.4);
  }

  .rp-timeline-progress {
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    height: 8px;
    background: rgba(59, 130, 246, 0.4);
    border-radius: 4px;
    pointer-events: none;
  }

  .rp-frame-counter {
    font-family: monospace;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
    min-width: 80px;
    text-align: center;
  }

  .rp-speed-select {
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    color: #fff;
    font-size: 12px;
    cursor: pointer;
    outline: none;
  }

  .rp-speed-select option {
    background: #1a1a2e;
  }

  /* Sidebar */
  .rp-sidebar {
    background: rgba(20, 20, 35, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 10px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .rp-section {
    padding: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .rp-section:last-child {
    border-bottom: none;
  }

  .rp-section-grow {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .rp-section-header {
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

  .rp-info-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .rp-info-row {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
  }

  .rp-info-label {
    color: rgba(255, 255, 255, 0.5);
  }

  .rp-info-value {
    color: #fff;
    font-weight: 500;
  }

  .rp-tracker-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .rp-tracker-item {
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

  .rp-tracker-item:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .rp-tracker-item.selected {
    background: rgba(59, 130, 246, 0.1);
    border-color: rgba(59, 130, 246, 0.3);
  }

  .rp-tracker-icon {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.6);
  }

  .rp-tracker-info {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .rp-tracker-id {
    font-size: 12px;
    font-weight: 500;
    color: #fff;
  }

  .rp-tracker-status {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.4);
  }

  .rp-tracker-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .rp-tracker-dot.active {
    background: #22c55e;
    box-shadow: 0 0 6px rgba(34, 197, 94, 0.5);
  }

  .rp-tracker-dot.stale {
    background: #f97316;
  }

  .rp-tracker-dot.no-fix {
    background: #6b7280;
  }

  .rp-empty {
    padding: 16px;
    text-align: center;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.3);
  }

  /* Drone Modal */
  .rp-drone-modal {
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
`;
