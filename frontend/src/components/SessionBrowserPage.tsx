/**
 * SessionBrowserPage — Standalone page for browsing and replaying past sessions.
 *
 * Layout:
 * - Header with title + back button
 * - Left panel: ReplaySessionBrowserPanel (session list with search/filter)
 * - Center: Google3DViewer in replay mode
 * - Bottom: TimelineControl (visible when a session is selected and ready)
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { APIProvider } from '@vis.gl/react-google-maps';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useWorkflow } from '../contexts/WorkflowContext';
import { useToast } from '../contexts/ToastContext';
import Google3DViewer from './google3d/Google3DViewer';
import ReplaySessionBrowserPanel from './ReplaySessionBrowserPanel';
import TimelineControl from './TimelineControl';
import { ArrowLeft, History } from 'lucide-react';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

interface SessionMetadata {
  session_id: string;
  name: string;
  duration_seconds: number;
  start_time: string;
  end_time: string;
  tracker_ids: string[];
  total_records: number;
  site_id: string | null;
  site_center: { lat: number; lon: number } | null;
}

type PageState =
  | { status: 'idle' }
  | { status: 'loading'; sessionId: string }
  | { status: 'building'; sessionId: string; metadata: SessionMetadata }
  | { status: 'ready'; sessionId: string; metadata: SessionMetadata; frameCount: number }
  | { status: 'error'; sessionId: string; error: string };

export default function SessionBrowserPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const {
    drones, droneHistory, connectionStatus,
    isLive, setIsLive,
    timeRange, setTimeRange,
    currentTime, setCurrentTime,
    timelineStart, timelineEnd,
    replayFramesReady, replayFramesError,
    clearReplayFramesReady, clearReplayFramesError,
  } = useWebSocket();

  const { cuasProfiles, sites, testSessions } = useWorkflow();

  const [pageState, setPageState] = useState<PageState>({ status: 'idle' });
  const [selectedDroneId, setSelectedDroneId] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Extract metadata early (used by sessionSite memo below)
  const metadata = (pageState.status === 'building' || pageState.status === 'ready')
    ? pageState.metadata : null;

  // Resolve site for current session
  const testSession = useMemo(() => {
    if (pageState.status === 'ready' || pageState.status === 'building') {
      return testSessions.find(s => s.id === pageState.sessionId) || null;
    }
    return null;
  }, [testSessions, pageState]);

  const sessionSite = useMemo(() => {
    // 1. Try library-store lookup
    if (testSession?.site_id) {
      const site = sites.find(s => s.id === testSession.site_id);
      if (site) return site;
    }
    // 2. Try replay metadata site_id
    if (metadata?.site_id) {
      const site = sites.find(s => s.id === metadata.site_id);
      if (site) return site;
    }
    // 3. Build virtual site from replay metadata site_center
    if (metadata?.site_center) {
      return {
        id: 'replay-virtual',
        name: metadata.name || 'Replay Site',
        center: metadata.site_center,
        boundary_polygon: [] as any[],
        markers: [] as any[],
        zones: [] as any[],
        environment_type: 'urban' as const,
        created_at: '',
        updated_at: '',
      };
    }
    // 4. Fallback: use first drone position from droneHistory
    for (const [, history] of droneHistory) {
      if (history.length > 0) {
        const first = history[0];
        if (first.lat != null && first.lon != null) {
          return {
            id: 'replay-drone-fallback',
            name: metadata?.name || 'Replay Site',
            center: { lat: first.lat, lon: first.lon },
            boundary_polygon: [] as any[],
            markers: [] as any[],
            zones: [] as any[],
            environment_type: 'urban' as const,
            created_at: '',
            updated_at: '',
          };
        }
      }
    }
    return null;
  }, [testSession, sites, metadata, droneHistory]);

  const cuasPlacements = testSession?.cuas_placements || [];

  // Timeline values for the 3D viewer
  const mapCurrentTime = useMemo(() => {
    if (pageState.status === 'ready') return currentTime;
    return Date.now();
  }, [pageState.status, currentTime]);

  const mapTimelineStart = useMemo(() => {
    if (pageState.status === 'building' || pageState.status === 'ready') {
      const startTime = pageState.metadata.start_time;
      if (startTime) return new Date(startTime).getTime();
    }
    return Date.now() - 3600000;
  }, [pageState]);

  // Listen for frames ready
  useEffect(() => {
    if (replayFramesReady && pageState.status === 'building') {
      if (replayFramesReady.sessionId === pageState.sessionId) {
        setPageState({
          status: 'ready',
          sessionId: pageState.sessionId,
          metadata: pageState.metadata,
          frameCount: replayFramesReady.frameCount,
        });
        clearReplayFramesReady();
        showToast('success', `Session loaded: ${replayFramesReady.frameCount} frames`);
      }
    }
  }, [replayFramesReady, pageState, clearReplayFramesReady, showToast]);

  // Listen for frames error
  useEffect(() => {
    if (replayFramesError && pageState.status === 'building') {
      if (replayFramesError.sessionId === pageState.sessionId) {
        setPageState({
          status: 'error',
          sessionId: pageState.sessionId,
          error: replayFramesError.error,
        });
        clearReplayFramesError();
        showToast('error', `Failed: ${replayFramesError.error}`);
      }
    }
  }, [replayFramesError, pageState, clearReplayFramesError, showToast]);

  // Handle session selection
  const handleSelectSession = useCallback(async (sessionId: string) => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setPageState({ status: 'loading', sessionId });

    try {
      const res = await fetch(`/api/replay/load/${sessionId}`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to load session');

      const session = data.session;
      const metadata: SessionMetadata = {
        session_id: session.session_id || sessionId,
        name: session.name || sessionId,
        duration_seconds: session.duration_seconds || 0,
        start_time: session.start_time || '',
        end_time: session.end_time || '',
        tracker_ids: session.tracker_ids || [],
        total_records: session.total_records || 0,
        site_id: session.site_id || null,
        site_center: session.site_center || null,
      };

      setPageState({ status: 'building', sessionId, metadata });
    } catch (err: any) {
      setPageState({ status: 'error', sessionId, error: err.message || 'Failed to load' });
      showToast('error', err.message || 'Failed to load session');
    }
  }, [showToast]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      fetch('/api/replay/stop', { method: 'POST' }).catch(() => {});
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const selectedSessionId = pageState.status !== 'idle' ? (pageState as any).sessionId : null;
  const isProcessing = pageState.status === 'loading' || pageState.status === 'building';
  const isReady = pageState.status === 'ready';

  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY} version="alpha">
      <div style={{
        display: 'flex', flexDirection: 'column',
        height: '100vh', background: '#0a0a0a', color: '#fff',
      }}>
        {/* Header */}
        <header style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 16px', height: 52, flexShrink: 0,
          background: 'rgba(15, 15, 25, 0.95)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          <button
            onClick={() => {
              fetch('/api/replay/stop', { method: 'POST' }).catch(() => {});
              navigate('/');
            }}
            style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6, padding: '6px 8px', color: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center',
            }}
          >
            <ArrowLeft size={16} />
          </button>
          <History size={16} style={{ color: '#3b82f6' }} />
          <span style={{ fontSize: 15, fontWeight: 600 }}>Session Browser</span>
          {metadata && (
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginLeft: 8 }}>
              {metadata.name}
            </span>
          )}
          {isProcessing && (
            <span style={{
              fontSize: 11, padding: '3px 8px', borderRadius: 4,
              background: 'rgba(249,115,22,0.2)', color: '#f97316',
              border: '1px solid rgba(249,115,22,0.3)',
            }}>
              {pageState.status === 'loading' ? 'Loading...' : 'Building frames...'}
            </span>
          )}
        </header>

        {/* Main content */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left panel — session list */}
          <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.08)' }}>
            <ReplaySessionBrowserPanel
              selectedSessionId={selectedSessionId}
              onSelectSession={handleSelectSession}
              disabled={isProcessing}
            />
          </div>

          {/* Center — 3D viewer */}
          <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
            {pageState.status === 'idle' ? (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', height: '100%', gap: 12,
                color: 'rgba(255,255,255,0.4)',
              }}>
                <History size={48} />
                <span style={{ fontSize: 18, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>
                  Select a Session
                </span>
                <span style={{ fontSize: 13 }}>
                  Choose a recorded session from the list to replay on the 3D map
                </span>
              </div>
            ) : pageState.status === 'error' ? (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', height: '100%', gap: 12,
                color: 'rgba(255,255,255,0.5)',
              }}>
                <span style={{ fontSize: 16, fontWeight: 600, color: '#ef4444' }}>Error</span>
                <span style={{ fontSize: 13, color: '#ef4444' }}>{pageState.error}</span>
                <button
                  onClick={() => setPageState({ status: 'idle' })}
                  style={{
                    background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.3)',
                    borderRadius: 6, padding: '6px 14px', color: '#3b82f6',
                    cursor: 'pointer', fontSize: 12, marginTop: 8,
                  }}
                >
                  Try Another
                </button>
              </div>
            ) : (
              <Google3DViewer
                mode="replay"
                site={sessionSite}
                droneHistory={droneHistory}
                currentTime={mapCurrentTime}
                timelineStart={mapTimelineStart}
                currentDroneData={drones}
                selectedDroneId={selectedDroneId}
                onDroneClick={setSelectedDroneId}
                cuasPlacements={cuasPlacements}
                cuasProfiles={cuasProfiles}
              />
            )}
          </div>
        </div>

        {/* Bottom timeline (only when session is ready) — flexShrink:0 prevents vertical growth */}
        {isReady && (
          <div style={{ flexShrink: 0, padding: '6px 12px 8px' }}>
            <TimelineControl
              isLive={isLive}
              setIsLive={setIsLive}
              timeRange={timeRange}
              setTimeRange={setTimeRange}
              currentTime={currentTime}
              setCurrentTime={setCurrentTime}
              timelineStart={timelineStart}
              timelineEnd={timelineEnd}
              connectionStatus={connectionStatus}
            />
          </div>
        )}
      </div>
    </APIProvider>
  );
}
