import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWebSocket } from '../contexts/WebSocketContext';
import { SessionProvider, useSessions } from '../contexts/SessionContext';
import { GlassButton, Badge } from './ui/GlassUI';
import SessionBrowser from './SessionBrowser';
import MapComponent from './Map';
import DroneDetailPanel from './DroneDetailPanel';
import type { DroneSummary, PositionPoint } from '../types/drone';
import { ArrowLeft, Map as MapIcon, Radio, Wifi, WifiOff, Play, Pause, SkipBack, Database, FileText } from 'lucide-react';

function MonitoringConsoleContent() {
  const navigate = useNavigate();
  const {
    drones: liveDrones,
    droneHistory: liveHistory,
    connectionStatus,
    activeEvent,
  } = useWebSocket();

  const {
    selectedSession,
    selectedFile,
    sessionHistory,
    loadSessionHistory,
    loadFileHistory,
    selectFile,
    loading: sessionLoading,
  } = useSessions();

  // View mode: 'live' or 'session'
  const [viewMode, setViewMode] = useState<'live' | 'session'>('live');

  // Selected drone
  const [selectedDroneId, setSelectedDroneId] = useState<string | null>(null);

  // Timeline state for session view
  const [sessionCurrentTime, setSessionCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const playIntervalRef = useRef<number | null>(null);

  // Convert session history to drone/history format
  const sessionData = useMemo(() => {
    console.log('[MonitoringConsole] sessionData memo running, sessionHistory:', sessionHistory ? 'exists' : 'null');
    if (!sessionHistory || !sessionHistory.tracks) {
      console.log('[MonitoringConsole] No session history or tracks');
      return { drones: new globalThis.Map<string, DroneSummary>(), history: new globalThis.Map<string, PositionPoint[]>() };
    }

    const drones = new globalThis.Map<string, DroneSummary>();
    const history = new globalThis.Map<string, PositionPoint[]>();

    for (const [trackerId, points] of Object.entries(sessionHistory.tracks)) {
      if (!points || points.length === 0) continue;

      // Convert to PositionPoint format
      const positionPoints: PositionPoint[] = points.map(p => ({
        lat: p.lat,
        lon: p.lon,
        alt_m: p.alt_m,
        timestamp: p.timestamp_ms,
      }));

      history.set(trackerId, positionPoints);

      // Get the latest point for the drone summary
      const latestPoint = points[points.length - 1];
      drones.set(trackerId, {
        tracker_id: trackerId,
        lat: latestPoint.lat,
        lon: latestPoint.lon,
        alt_m: latestPoint.alt_m,
        rssi_dbm: latestPoint.rssi_dbm,
        fix_valid: true,
        is_stale: false,
        age_seconds: 0,
        last_update: latestPoint.timestamp,
      });
    }

    console.log('[MonitoringConsole] sessionData created:', { drones: drones.size, history: history.size });
    return { drones, history };
  }, [sessionHistory]);

  // Calculate timeline bounds from session
  const sessionTimelineBounds = useMemo(() => {
    if (!sessionHistory || !sessionHistory.start_time || !sessionHistory.end_time) {
      return { start: Date.now(), end: Date.now() };
    }
    return {
      start: new Date(sessionHistory.start_time).getTime(),
      end: new Date(sessionHistory.end_time).getTime(),
    };
  }, [sessionHistory]);

  // Get current position for each drone at the current timeline time
  const sessionDronesAtTime = useMemo(() => {
    console.log('[MonitoringConsole] sessionDronesAtTime memo running:', { viewMode, hasHistory: !!sessionHistory, sessionCurrentTime });
    if (viewMode !== 'session' || !sessionHistory) {
      return new globalThis.Map<string, DroneSummary>();
    }

    const drones = new globalThis.Map<string, DroneSummary>();
    // Use end_time from session if sessionCurrentTime is not yet set (race condition fix)
    const targetTime = sessionCurrentTime > 0
      ? sessionCurrentTime
      : (sessionHistory.end_time ? new Date(sessionHistory.end_time).getTime() : Date.now());
    console.log('[MonitoringConsole] Using targetTime:', targetTime);

    for (const [trackerId, points] of Object.entries(sessionHistory.tracks)) {
      if (!points || points.length === 0) continue;

      // Find the point closest to (but not after) the current time
      let bestPoint = points[0];
      for (const point of points) {
        if (point.timestamp_ms <= targetTime) {
          bestPoint = point;
        } else {
          break; // Points are sorted by time
        }
      }

      // Only show if point is within reasonable time of current
      if (bestPoint.timestamp_ms <= targetTime) {
        drones.set(trackerId, {
          tracker_id: trackerId,
          lat: bestPoint.lat,
          lon: bestPoint.lon,
          alt_m: bestPoint.alt_m,
          rssi_dbm: bestPoint.rssi_dbm,
          fix_valid: true,
          is_stale: false,
          age_seconds: 0,
          last_update: bestPoint.timestamp,
        });
      } else {
        console.log('[MonitoringConsole] Skipping drone', trackerId, 'bestPoint.timestamp_ms:', bestPoint.timestamp_ms, 'targetTime:', targetTime);
      }
    }

    console.log('[MonitoringConsole] sessionDronesAtTime result:', drones.size, 'drones');
    return drones;
  }, [viewMode, sessionHistory, sessionCurrentTime]);

  // Decide which data to show
  const displayDrones = viewMode === 'session' ? sessionDronesAtTime : liveDrones;
  const displayHistory = viewMode === 'session' ? sessionData.history : liveHistory;
  const displayTimelineStart = viewMode === 'session' ? sessionTimelineBounds.start : Date.now() - 3600000;
  const displayTimelineEnd = viewMode === 'session' ? sessionTimelineBounds.end : Date.now();
  // Use end_time as fallback when sessionCurrentTime is not yet set
  const displayCurrentTime = viewMode === 'session'
    ? (sessionCurrentTime > 0 ? sessionCurrentTime : sessionTimelineBounds.end)
    : Date.now();

  console.log('[MonitoringConsole] Display values:', {
    viewMode,
    dronesCount: displayDrones.size,
    historyCount: displayHistory.size,
    timelineStart: displayTimelineStart,
    timelineEnd: displayTimelineEnd,
    currentTime: displayCurrentTime,
  });

  // Get selected drone from current view data
  const selectedDrone = selectedDroneId ? displayDrones.get(selectedDroneId) : null;

  // Handle drone click on map
  const handleDroneClick = useCallback((droneId: string) => {
    setSelectedDroneId(droneId);
  }, []);

  // Handle tracker selection from session browser
  const handleSelectTracker = useCallback((trackerId: string, sessionName?: string) => {
    // If we have a session context, switch to session view
    if (sessionName) {
      setViewMode('session');
      loadSessionHistory(sessionName, trackerId);
    }
    setSelectedDroneId(trackerId);
  }, [loadSessionHistory]);

  // Handle file selection from session browser
  const handleSelectFile = useCallback((filePath: string, fileName: string) => {
    console.log('[MonitoringConsole] handleSelectFile called:', filePath, fileName);
    setViewMode('session');
    selectFile({ name: fileName, path: filePath, size_bytes: 0, modified: '' });
    loadFileHistory(filePath);
  }, [loadFileHistory, selectFile]);

  // Switch to session view when session is selected
  useEffect(() => {
    if (selectedSession) {
      setViewMode('session');
      loadSessionHistory(selectedSession.name);
    }
  }, [selectedSession, loadSessionHistory]);

  // Initialize timeline to end when session loads
  useEffect(() => {
    if (sessionHistory && sessionHistory.end_time) {
      setSessionCurrentTime(new Date(sessionHistory.end_time).getTime());
      setIsPlaying(false);
    }
  }, [sessionHistory]);

  // Playback logic
  useEffect(() => {
    if (isPlaying && viewMode === 'session') {
      playIntervalRef.current = window.setInterval(() => {
        setSessionCurrentTime(prev => {
          const newTime = prev + 1000; // Advance 1 second per tick
          if (newTime >= sessionTimelineBounds.end) {
            setIsPlaying(false);
            return sessionTimelineBounds.end;
          }
          return newTime;
        });
      }, 100); // 10x speed playback
    } else {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
    }

    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    };
  }, [isPlaying, viewMode, sessionTimelineBounds.end]);

  // Format time for display
  const formatTime = (timestamp: number | null): string => {
    if (!timestamp) return '--:--:--';
    return new Date(timestamp).toLocaleTimeString('en-US', { hour12: false });
  };

  // Timeline slider value (0-100)
  const getSliderValue = (): number => {
    const total = displayTimelineEnd - displayTimelineStart;
    if (total <= 0) return 100;
    const current = displayCurrentTime - displayTimelineStart;
    return Math.min(100, Math.max(0, (current / total) * 100));
  };

  // Handle slider change
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (viewMode !== 'session') return;
    const percent = parseFloat(e.target.value);
    const total = displayTimelineEnd - displayTimelineStart;
    const newTime = displayTimelineStart + (total * percent / 100);
    setSessionCurrentTime(newTime);
    setIsPlaying(false);
  };

  // Go live
  const handleGoLive = () => {
    setViewMode('live');
    setIsPlaying(false);
  };

  // Jump to start
  const handleJumpToStart = () => {
    if (viewMode === 'session') {
      setSessionCurrentTime(sessionTimelineBounds.start);
      setIsPlaying(false);
    }
  };

  // Toggle play/pause
  const handlePlayPause = () => {
    if (viewMode === 'session') {
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div className="mc-container">
      {/* Header */}
      <header className="mc-header">
        <div className="mc-header-left">
          <GlassButton variant="ghost" size="sm" onClick={() => navigate('/')}>
            <ArrowLeft size={14} />
            Back
          </GlassButton>
          <div className="mc-brand">
            <span className="mc-brand-name">SCENSUS</span>
            <span className="mc-brand-title">Monitoring Console</span>
          </div>
        </div>

        <div className="mc-header-center">
          {viewMode === 'session' && selectedFile ? (
            <div className="mc-event-badge file-mode">
              <FileText size={12} />
              <span>{selectedFile.name}</span>
              <Badge color="orange" size="sm">FILE</Badge>
            </div>
          ) : viewMode === 'session' && selectedSession ? (
            <div className="mc-event-badge session-mode">
              <Database size={12} />
              <span>{selectedSession.name}</span>
              <Badge color="blue" size="sm">SESSION</Badge>
            </div>
          ) : activeEvent ? (
            <div className="mc-event-badge">
              <MapIcon size={12} />
              <span>{activeEvent}</span>
              <Badge color="green" size="sm">LIVE</Badge>
            </div>
          ) : null}
        </div>

        <div className="mc-header-right">
          <div className="mc-status">
            {connectionStatus === 'connected' ? (
              <><Wifi size={12} className="status-ok" /><span>Connected</span></>
            ) : (
              <><WifiOff size={12} className="status-err" /><span>Disconnected</span></>
            )}
          </div>
          <div className="mc-status">
            <Radio size={12} />
            <span>{displayDrones.size} Trackers</span>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="mc-main">
        {/* Left Panel - Sessions */}
        <aside className="mc-sidebar mc-left">
          <SessionBrowser
            onSelectTracker={handleSelectTracker}
            onSelectFile={handleSelectFile}
          />
        </aside>

        {/* Center - Map */}
        <main className="mc-center">
          <div className="mc-map">
            {sessionLoading ? (
              <div className="mc-loading">
                <div className="mc-loading-spinner" />
                <span>Loading session data...</span>
              </div>
            ) : (
              <MapComponent
                drones={displayDrones}
                droneHistory={displayHistory}
                selectedDroneId={selectedDroneId}
                onDroneClick={handleDroneClick}
                currentTime={displayCurrentTime}
                timelineStart={displayTimelineStart}
              />
            )}
          </div>

          {/* Compact Timeline */}
          <div className="mc-timeline">
            <div className="mc-timeline-controls">
              <button
                className="mc-tl-btn"
                onClick={handleJumpToStart}
                title="Jump to start"
                disabled={viewMode !== 'session'}
              >
                <SkipBack size={14} />
              </button>
              <button
                className="mc-tl-btn"
                onClick={handlePlayPause}
                title={isPlaying ? 'Pause' : 'Play'}
                disabled={viewMode !== 'session'}
              >
                {isPlaying ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <button
                className={`mc-tl-live ${viewMode === 'live' ? 'active' : ''}`}
                onClick={handleGoLive}
              >
                LIVE
              </button>
            </div>

            <div className="mc-timeline-slider">
              <span className="mc-tl-time">{formatTime(displayTimelineStart)}</span>
              <input
                type="range"
                min="0"
                max="100"
                step="0.1"
                value={getSliderValue()}
                onChange={handleSliderChange}
                className="mc-slider"
                disabled={viewMode !== 'session'}
              />
              <span className="mc-tl-time">{formatTime(displayCurrentTime)}</span>
            </div>
          </div>
        </main>

        {/* Right Panel - Drone Info */}
        <aside className="mc-sidebar mc-right">
          {selectedDrone ? (
            <div className="mc-drone-info">
              <DroneDetailPanel
                drone={selectedDrone}
                onClose={() => setSelectedDroneId(null)}
                onOpenCamera={() => {}}
              />
            </div>
          ) : (
            <div className="mc-no-selection">
              <Radio size={32} strokeWidth={1} />
              <p>Select a tracker</p>
              <span>Click on a tracker on the map or select from sessions</span>
            </div>
          )}
        </aside>
      </div>

      <style>{`
        .mc-container {
          display: flex;
          flex-direction: column;
          height: 100vh;
          width: 100vw;
          background: #0a0a12;
          color: #fff;
          overflow: hidden;
        }

        /* Header */
        .mc-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 16px;
          background: rgba(15, 15, 25, 0.95);
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          height: 48px;
          flex-shrink: 0;
        }

        .mc-header-left, .mc-header-right {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .mc-brand {
          display: flex;
          align-items: baseline;
          gap: 8px;
        }

        .mc-brand-name {
          font-size: 16px;
          font-weight: 700;
          color: #ff8c00;
          letter-spacing: 1.5px;
        }

        .mc-brand-title {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.5);
        }

        .mc-event-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          background: rgba(255, 140, 0, 0.1);
          border: 1px solid rgba(255, 140, 0, 0.2);
          border-radius: 12px;
          font-size: 11px;
        }

        .mc-event-badge.session-mode {
          background: rgba(59, 130, 246, 0.1);
          border-color: rgba(59, 130, 246, 0.3);
        }

        .mc-event-badge.file-mode {
          background: rgba(168, 85, 247, 0.1);
          border-color: rgba(168, 85, 247, 0.3);
        }

        .mc-status {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.6);
        }

        .status-ok { color: #22c55e; }
        .status-err { color: #ef4444; }

        /* Main Layout */
        .mc-main {
          flex: 1;
          display: grid;
          grid-template-columns: 260px 1fr 280px;
          gap: 8px;
          padding: 8px;
          min-height: 0;
          overflow: hidden;
        }

        /* Sidebars */
        .mc-sidebar {
          background: rgba(20, 20, 35, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 10px;
          overflow: hidden;
        }

        .mc-left {
          display: flex;
          flex-direction: column;
        }

        .mc-right {
          display: flex;
          flex-direction: column;
        }

        .mc-drone-info {
          flex: 1;
          overflow-y: auto;
        }

        .mc-no-selection {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 24px;
          color: rgba(255, 255, 255, 0.3);
        }

        .mc-no-selection p {
          margin-top: 12px;
          font-size: 14px;
          color: rgba(255, 255, 255, 0.6);
        }

        .mc-no-selection span {
          font-size: 11px;
          margin-top: 4px;
        }

        /* Center */
        .mc-center {
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-width: 0;
          min-height: 0;
          overflow: hidden;
        }

        .mc-map {
          flex: 1;
          position: relative;
          min-height: 0;
          border-radius: 10px;
          overflow: hidden;
          background: rgba(20, 20, 35, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.06);
        }

        .mc-loading {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          color: rgba(255, 255, 255, 0.6);
          font-size: 13px;
        }

        .mc-loading-spinner {
          width: 32px;
          height: 32px;
          border: 3px solid rgba(255, 140, 0, 0.2);
          border-top-color: #ff8c00;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Timeline */
        .mc-timeline {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 12px;
          background: rgba(20, 20, 35, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 10px;
          height: 44px;
          flex-shrink: 0;
        }

        .mc-timeline-controls {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .mc-tl-btn {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          color: rgba(255, 255, 255, 0.7);
          cursor: pointer;
          transition: all 0.15s;
        }

        .mc-tl-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }

        .mc-tl-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .mc-tl-live {
          padding: 4px 10px;
          font-size: 10px;
          font-weight: 600;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          color: rgba(255, 255, 255, 0.6);
          cursor: pointer;
          transition: all 0.15s;
        }

        .mc-tl-live:hover {
          background: rgba(34, 197, 94, 0.1);
          border-color: rgba(34, 197, 94, 0.3);
          color: #22c55e;
        }

        .mc-tl-live.active {
          background: rgba(34, 197, 94, 0.2);
          border-color: rgba(34, 197, 94, 0.4);
          color: #22c55e;
        }

        .mc-timeline-slider {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .mc-tl-time {
          font-size: 11px;
          font-family: monospace;
          color: rgba(255, 255, 255, 0.5);
          min-width: 60px;
        }

        .mc-tl-time:last-child {
          text-align: right;
          color: #ff8c00;
        }

        .mc-slider {
          flex: 1;
          height: 4px;
          -webkit-appearance: none;
          appearance: none;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 2px;
          cursor: pointer;
        }

        .mc-slider:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .mc-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 12px;
          height: 12px;
          background: #ff8c00;
          border-radius: 50%;
          cursor: pointer;
        }

        .mc-slider::-moz-range-thumb {
          width: 12px;
          height: 12px;
          background: #ff8c00;
          border-radius: 50%;
          cursor: pointer;
          border: none;
        }
      `}</style>
    </div>
  );
}

export default function MonitoringConsole() {
  return (
    <SessionProvider>
      <MonitoringConsoleContent />
    </SessionProvider>
  );
}
