import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import type { DroneSummary, WebSocketMessage, PositionPoint } from '../types/drone';
import type { EventType, AlertLevel, EnhancedPositionPoint, JamBurst } from '../types/workflow';

type ConnectionStatus = 'connected' | 'disconnected' | 'connecting';

// Time range options for the timeline
export type TimeRange = '1h' | '4h' | '24h';

// New file alert type
export interface NewFileAlert {
  filename: string;
  timestamp: string;
}

// Anomaly alert from backend
export interface AnomalyAlert {
  id: string;
  type: EventType;
  level: AlertLevel;
  tracker_id: string;
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// Replay frame notifications
export interface ReplayFramesReady {
  sessionId: string;
  frameCount: number;
}

export interface ReplayFramesError {
  sessionId: string;
  error: string;
}

export interface ReplayBuildProgress {
  sessionId: string;
  frameIndex: number;
  totalFrames: number;
  percent: number;
}

interface WebSocketContextType {
  drones: Map<string, DroneSummary>;
  droneHistory: Map<string, PositionPoint[]>;
  connectionStatus: ConnectionStatus;
  activeEvent: string | null;
  reconnect: () => void;
  timeRange: TimeRange;
  setTimeRange: (range: TimeRange) => void;
  currentTime: number; // Unix timestamp in ms (for timeline scrubber)
  setCurrentTime: (time: number) => void;
  isLive: boolean;
  setIsLive: (live: boolean) => void;
  timelineStart: number; // Earliest timestamp in history
  timelineEnd: number; // Latest timestamp (now if live)
  newFileAlert: NewFileAlert | null; // Alert when new log file is detected
  clearNewFileAlert: () => void;
  // Anomaly alerts
  anomalyAlerts: AnomalyAlert[];
  latestAnomalyAlert: AnomalyAlert | null;
  clearLatestAnomalyAlert: () => void;
  acknowledgeAnomalyAlert: (alertId: string) => void;
  // Replay frame notifications
  replayFramesReady: ReplayFramesReady | null;
  replayFramesError: ReplayFramesError | null;
  replayBuildProgress: ReplayBuildProgress | null;
  clearReplayFramesReady: () => void;
  clearReplayFramesError: () => void;
  clearReplayBuildProgress: () => void;
  // SD Card tracks for dual-track visualization
  sdCardTracks: Map<string, EnhancedPositionPoint[]>;
  setSDCardTrack: (trackerId: string, points: EnhancedPositionPoint[]) => void;
  clearSDCardTrack: (trackerId: string) => void;
  clearAllSDCardTracks: () => void;
  showSDCardTracks: boolean;
  setShowSDCardTracks: (show: boolean) => void;
  // Jam burst and engagement callback registration
  setOnBurstOpened: (cb: ((burst: JamBurst) => void) | undefined) => void;
  setOnBurstClosed: (cb: ((burst: JamBurst) => void) | undefined) => void;
  setOnEngagementMetricsReady: (cb: ((data: { engagement_id: string }) => void) | undefined) => void;
  setOnGpsDenialDetected: (cb: ((data: { engagement_id: string; burst_id: string; tracker_id: string }) => void) | undefined) => void;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}

interface WebSocketProviderProps {
  children: React.ReactNode;
}

// Max history points per drone (to prevent memory issues)
const MAX_HISTORY_POINTS = 10000;

// Get time range in milliseconds
function getTimeRangeMs(range: TimeRange): number {
  switch (range) {
    case '1h': return 60 * 60 * 1000;
    case '4h': return 4 * 60 * 60 * 1000;
    case '24h': return 24 * 60 * 60 * 1000;
  }
}

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const [drones, setDrones] = useState<Map<string, DroneSummary>>(new Map());
  const [droneHistory, setDroneHistory] = useState<Map<string, PositionPoint[]>>(new Map());
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [activeEvent, setActiveEvent] = useState<string | null>(null);
  const [newFileAlert, setNewFileAlert] = useState<NewFileAlert | null>(null);

  // Anomaly alerts state
  const [anomalyAlerts, setAnomalyAlerts] = useState<AnomalyAlert[]>([]);
  const [latestAnomalyAlert, setLatestAnomalyAlert] = useState<AnomalyAlert | null>(null);

  // Replay frame notifications state
  const [replayFramesReady, setReplayFramesReady] = useState<ReplayFramesReady | null>(null);
  const [replayFramesError, setReplayFramesError] = useState<ReplayFramesError | null>(null);
  const [replayBuildProgress, setReplayBuildProgress] = useState<ReplayBuildProgress | null>(null);

  // Timeline state
  const [timeRange, setTimeRange] = useState<TimeRange>('1h');
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const [isLive, setIsLive] = useState<boolean>(true);

  // SD Card tracks for dual-track visualization (separate from live tracks)
  const [sdCardTracks, setSDCardTracks] = useState<Map<string, EnhancedPositionPoint[]>>(new Map());
  const [showSDCardTracks, setShowSDCardTracks] = useState<boolean>(true);

  // Clear the new file alert
  const clearNewFileAlert = useCallback(() => {
    setNewFileAlert(null);
  }, []);

  // Clear the latest anomaly alert (dismiss toast)
  const clearLatestAnomalyAlert = useCallback(() => {
    setLatestAnomalyAlert(null);
  }, []);

  // Acknowledge an anomaly alert
  const acknowledgeAnomalyAlert = useCallback((alertId: string) => {
    setAnomalyAlerts(prev =>
      prev.map(alert =>
        alert.id === alertId ? { ...alert, acknowledged: true } as AnomalyAlert : alert
      )
    );
  }, []);

  // Clear replay frame notifications
  const clearReplayFramesReady = useCallback(() => {
    setReplayFramesReady(null);
  }, []);

  const clearReplayFramesError = useCallback(() => {
    setReplayFramesError(null);
  }, []);

  const clearReplayBuildProgress = useCallback(() => {
    setReplayBuildProgress(null);
  }, []);

  // SD Card track management callbacks
  const setSDCardTrack = useCallback((trackerId: string, points: EnhancedPositionPoint[]) => {
    setSDCardTracks(prev => {
      const next = new Map(prev);
      next.set(trackerId, points);
      return next;
    });
  }, []);

  const clearSDCardTrack = useCallback((trackerId: string) => {
    setSDCardTracks(prev => {
      const next = new Map(prev);
      next.delete(trackerId);
      return next;
    });
  }, []);

  const clearAllSDCardTracks = useCallback(() => {
    setSDCardTracks(new Map());
  }, []);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttempts = useRef(0);
  const isLiveRef = useRef(isLive);

  // Callback refs for burst and engagement events
  const onBurstOpenedRef = useRef<((burst: JamBurst) => void) | undefined>(undefined);
  const onBurstClosedRef = useRef<((burst: JamBurst) => void) | undefined>(undefined);
  const onEngagementMetricsReadyRef = useRef<((data: { engagement_id: string }) => void) | undefined>(undefined);
  const onGpsDenialDetectedRef = useRef<((data: { engagement_id: string; burst_id: string; tracker_id: string }) => void) | undefined>(undefined);

  // Callback registration setters (update refs so WebSocket handler sees latest)
  const setOnBurstOpened = useCallback((cb: ((burst: JamBurst) => void) | undefined) => {
    onBurstOpenedRef.current = cb;
  }, []);
  const setOnBurstClosed = useCallback((cb: ((burst: JamBurst) => void) | undefined) => {
    onBurstClosedRef.current = cb;
  }, []);
  const setOnEngagementMetricsReady = useCallback((cb: ((data: { engagement_id: string }) => void) | undefined) => {
    onEngagementMetricsReadyRef.current = cb;
  }, []);
  const setOnGpsDenialDetected = useCallback((cb: ((data: { engagement_id: string; burst_id: string; tracker_id: string }) => void) | undefined) => {
    onGpsDenialDetectedRef.current = cb;
  }, []);

  // Calculate timeline bounds based on history
  const getTimelineBounds = useCallback(() => {
    let earliest = Date.now();
    let latest = Date.now();

    for (const positions of droneHistory.values()) {
      if (positions.length > 0) {
        const first = positions[0].timestamp;
        const last = positions[positions.length - 1].timestamp;
        if (first < earliest) earliest = first;
        if (last > latest) latest = last;
      }
    }

    // Adjust based on time range
    const rangeMs = getTimeRangeMs(timeRange);
    const rangeStart = Math.max(earliest, latest - rangeMs);

    return { start: rangeStart, end: latest };
  }, [droneHistory, timeRange]);

  const timelineBounds = useMemo(() => getTimelineBounds(), [getTimelineBounds]);
  const { start: timelineStart, end: timelineEnd } = timelineBounds;

  // Keep currentTime at latest when in live mode — use interval instead of effect on timelineEnd
  // to avoid infinite render loop (getTimelineBounds uses Date.now() which changes every render)
  useEffect(() => {
    if (!isLive) return;
    setCurrentTime(timelineEnd);
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [isLive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep isLiveRef in sync so the WebSocket handler always has the current value
  useEffect(() => {
    isLiveRef.current = isLive;
  }, [isLive]);

  // Add position to history
  const addPositionToHistory = useCallback((trackerId: string, lat: number, lon: number, altM: number | null, lastUpdate: string) => {
    const timestamp = new Date(lastUpdate).getTime();

    setDroneHistory(prev => {
      const next = new Map(prev);
      const existing = next.get(trackerId) || [];

      // Don't add duplicate timestamps
      if (existing.length > 0 && existing[existing.length - 1].timestamp === timestamp) {
        return prev;
      }

      const newPositions = [...existing, { lat, lon, alt_m: altM, timestamp }];

      // Trim to max points
      if (newPositions.length > MAX_HISTORY_POINTS) {
        newPositions.splice(0, newPositions.length - MAX_HISTORY_POINTS);
      }

      next.set(trackerId, newPositions);
      return next;
    });
  }, []);

  const connect = useCallback(() => {
    // Clear any existing reconnection timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.close();
    }

    setConnectionStatus('connecting');

    // Determine WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setConnectionStatus('connected');
      reconnectAttempts.current = 0;
    };

    ws.onclose = (event) => {
      console.log('WebSocket disconnected:', event.code, event.reason);
      setConnectionStatus('disconnected');
      wsRef.current = null;

      // Don't auto-reconnect during replay
      if (!isLiveRef.current) return;

      // Attempt to reconnect with exponential backoff
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
      reconnectAttempts.current++;

      console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current})`);
      reconnectTimeoutRef.current = window.setTimeout(connect, delay);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);

        switch (message.type) {
          case 'tracker_updated': {
            if (!isLiveRef.current) break;  // Skip live updates during replay
            const data = message.data as unknown as DroneSummary;
            setDrones(prev => {
              const next = new Map(prev);
              next.set(data.tracker_id, data);
              return next;
            });
            // Add to position history if we have valid coordinates
            if (data.lat !== null && data.lon !== null) {
              addPositionToHistory(data.tracker_id, data.lat, data.lon, data.alt_m, data.last_update);
            }
            break;
          }

          case 'tracker_stale': {
            const { tracker_id, age_seconds } = message.data as { tracker_id: string; age_seconds: number };
            setDrones(prev => {
              const next = new Map(prev);
              const existing = next.get(tracker_id);
              if (existing) {
                next.set(tracker_id, { ...existing, is_stale: true, age_seconds });
              }
              return next;
            });
            break;
          }

          case 'active_event_changed': {
            const { event_name } = message.data as { event_name: string };
            setActiveEvent(event_name);
            break;
          }

          case 'config_changed': {
            // Could trigger a refetch of config if needed
            console.log('Config changed:', message.data);
            break;
          }

          case 'replay_state': {
            // Handle replay state updates
            console.log('Replay state:', message.data);
            break;
          }

          case 'new_file_detected': {
            const { filename, timestamp } = message.data as { filename: string; timestamp: string };
            console.log('New file detected:', filename);
            setNewFileAlert({ filename, timestamp });
            break;
          }

          case 'anomaly_alert': {
            const alert = message.data as unknown as AnomalyAlert;
            console.log('Anomaly alert:', alert.type, alert.tracker_id, alert.message);

            // Add to alerts list (keep last 100)
            setAnomalyAlerts(prev => {
              const newAlerts = [alert, ...prev];
              if (newAlerts.length > 100) {
                newAlerts.pop();
              }
              return newAlerts;
            });

            // Set as latest for toast notification
            setLatestAnomalyAlert(alert);
            break;
          }

          case 'replay_frames_ready': {
            const { session_id, frame_count } = message.data as { session_id: string; frame_count: number };
            console.log('Replay frames ready:', session_id, frame_count);
            setReplayFramesReady({ sessionId: session_id, frameCount: frame_count });
            break;
          }

          case 'replay_frames_error': {
            const { session_id, error } = message.data as { session_id: string; error: string };
            console.log('Replay frames error:', session_id, error);
            setReplayFramesError({ sessionId: session_id, error });
            break;
          }

          case 'replay_build_progress': {
            const { session_id, frame_index, total_frames, percent } = message.data as {
              session_id: string;
              frame_index: number;
              total_frames: number;
              percent: number;
            };
            setReplayBuildProgress({
              sessionId: session_id,
              frameIndex: frame_index,
              totalFrames: total_frames,
              percent,
            });
            break;
          }

          case 'engagement_started':
          case 'engagement_completed': {
            // Engagement lifecycle — trigger same refresh as burst events
            console.log(`Engagement ${message.type}:`, message.data.engagement_id);
            onEngagementMetricsReadyRef.current?.({ engagement_id: message.data.engagement_id as string });
            break;
          }

          case 'burst_opened': {
            const burst = message.data as unknown as JamBurst;
            console.log('Burst opened:', burst.id);
            onBurstOpenedRef.current?.(burst);
            break;
          }

          case 'burst_closed': {
            const burst = message.data as unknown as JamBurst;
            console.log('Burst closed:', burst.id);
            onBurstClosedRef.current?.(burst);
            break;
          }

          case 'engagement_metrics_ready': {
            const data = message.data as { engagement_id: string };
            console.log('Engagement metrics ready:', data.engagement_id);
            onEngagementMetricsReadyRef.current?.(data);
            break;
          }

          case 'gps_denial_detected': {
            const data = message.data as { engagement_id: string; burst_id: string; tracker_id: string };
            console.log('GPS denial detected:', data.engagement_id, data.burst_id, data.tracker_id);
            onGpsDenialDetectedRef.current?.(data);
            break;
          }

          default:
            console.log('Unknown message type:', message.type);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };
  }, [addPositionToHistory]);

  const reconnect = useCallback(() => {
    reconnectAttempts.current = 0;
    connect();
  }, [connect]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  // Increment age_seconds every second between WS updates
  useEffect(() => {
    const timer = setInterval(() => {
      setDrones(prev => {
        const next = new Map(prev);
        if (next.size === 0) return prev;
        for (const [id, drone] of next) {
          next.set(id, { ...drone, age_seconds: (drone.age_seconds ?? 0) + 1 });
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Keep-alive ping
  useEffect(() => {
    const interval = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send('ping');
      }
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const value: WebSocketContextType = {
    drones,
    droneHistory,
    connectionStatus,
    activeEvent,
    reconnect,
    timeRange,
    setTimeRange,
    currentTime,
    setCurrentTime,
    isLive,
    setIsLive,
    timelineStart,
    timelineEnd,
    newFileAlert,
    clearNewFileAlert,
    anomalyAlerts,
    latestAnomalyAlert,
    clearLatestAnomalyAlert,
    acknowledgeAnomalyAlert,
    replayFramesReady,
    replayFramesError,
    replayBuildProgress,
    clearReplayFramesReady,
    clearReplayFramesError,
    clearReplayBuildProgress,
    // SD Card tracks for dual-track visualization
    sdCardTracks,
    setSDCardTrack,
    clearSDCardTrack,
    clearAllSDCardTracks,
    showSDCardTracks,
    setShowSDCardTracks,
    // Jam burst and engagement callback registration
    setOnBurstOpened,
    setOnBurstClosed,
    setOnEngagementMetricsReady,
    setOnGpsDenialDetected,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}
