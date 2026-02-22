/**
 * useSessionData — Centralized data filtering for live session pages.
 *
 * All WebSocket data is filtered through session tracker IDs before
 * reaching any child component. This fixes isolation bugs where
 * SD card tracks and anomaly alerts from unrelated sessions leaked through.
 *
 * Rule: Never pass raw WebSocket data to child components.
 */

import { useMemo, useState, useEffect } from 'react';
import { useWebSocket } from '../../../contexts/WebSocketContext';
import { useWorkflow } from '../../../contexts/WorkflowContext';
import { useTestSessionPhase } from '../../../contexts/TestSessionPhaseContext';
import type { DroneSummary, PositionPoint } from '../../../types/drone';
import type { CUASPlacement, CUASProfile, TestEvent, Engagement, AssetPlacement } from '../../../types/workflow';
import type { AnomalyAlert } from '../../../contexts/WebSocketContext';

export interface SessionData {
  // Filtered live data
  sessionDrones: Map<string, DroneSummary>;
  sessionDroneHistory: Map<string, PositionPoint[]>;
  sessionSDCardTracks: Map<string, any[]>;
  sessionAlerts: AnomalyAlert[];

  // Session metadata
  sessionTrackerIds: Set<string>;
  cuasPlacements: CUASPlacement[];
  assetPlacements: AssetPlacement[];
  cuasProfiles: CUASProfile[];
  events: TestEvent[];
  engagements: Engagement[];
  sessionName: string;
  siteName: string | undefined;
  isLive: boolean;
  isCompleted: boolean;

  // Connection
  connectionStatus: string;
}

export function useSessionData(): SessionData {
  const {
    drones,
    droneHistory,
    sdCardTracks,
    connectionStatus,
    anomalyAlerts,
  } = useWebSocket();

  const {
    selectedSite,
    cuasProfiles,
    sites,
  } = useWorkflow();

  const {
    activeSession,
    currentPhase,
    engagements,
  } = useTestSessionPhase();

  // Historical data for completed sessions
  const [historicalDrones, setHistoricalDrones] = useState<Map<string, DroneSummary>>(new Map());
  const [historicalDroneHistory, setHistoricalDroneHistory] = useState<Map<string, PositionPoint[]>>(new Map());
  const [historicalDataLoaded, setHistoricalDataLoaded] = useState(false);

  const isCompleted = activeSession?.status === 'completed' || activeSession?.status === 'analyzing';
  const isLive = currentPhase === 'active';

  // Tracker IDs assigned to this session
  const sessionTrackerIds = useMemo(() => {
    if (!activeSession?.tracker_assignments) return new Set<string>();
    return new Set(activeSession.tracker_assignments.map(a => a.tracker_id));
  }, [activeSession?.tracker_assignments]);

  // Load historical telemetry for completed sessions
  useEffect(() => {
    if (!isCompleted || !activeSession?.id || historicalDataLoaded) return;

    const fetchHistoricalTelemetry = async () => {
      try {
        const res = await fetch(`/api/v2/sessions/${activeSession.id}/telemetry?downsample=2000`);
        if (!res.ok) return;

        const data = await res.json();
        const tracks: Record<string, Array<{
          lat: number; lon: number; alt_m: number | null;
          timestamp: string | null; speed_mps: number | null;
          hdop: number | null; satellites: number | null; fix_valid: boolean | null;
        }>> = data.tracks || {};

        const newDrones = new Map<string, DroneSummary>();
        const newHistory = new Map<string, PositionPoint[]>();

        for (const [trackerId, points] of Object.entries(tracks)) {
          if (points.length === 0) continue;

          const history: PositionPoint[] = points.map(p => ({
            lat: p.lat,
            lon: p.lon,
            alt_m: p.alt_m,
            timestamp: p.timestamp ? new Date(p.timestamp).getTime() : 0,
          }));
          newHistory.set(trackerId, history);

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
      } catch (err) {
        console.error('[useSessionData] Failed to fetch historical telemetry:', err);
      }
    };

    fetchHistoricalTelemetry();
  }, [isCompleted, activeSession?.id, historicalDataLoaded]);

  // Filter drones by session tracker IDs
  const sessionDrones = useMemo(() => {
    if (isCompleted) return historicalDrones;
    if (sessionTrackerIds.size === 0) return drones;

    const filtered = new Map<string, DroneSummary>();
    for (const [trackerId, drone] of drones) {
      if (sessionTrackerIds.has(trackerId)) {
        filtered.set(trackerId, drone);
      }
    }
    return filtered;
  }, [drones, sessionTrackerIds, isCompleted, historicalDrones]);

  // Filter drone history
  const sessionDroneHistory = useMemo(() => {
    if (isCompleted) return historicalDroneHistory;
    if (sessionTrackerIds.size === 0) return droneHistory;

    const filtered = new Map<string, PositionPoint[]>();
    for (const [trackerId, history] of droneHistory) {
      if (sessionTrackerIds.has(trackerId)) {
        filtered.set(trackerId, history);
      }
    }
    return filtered;
  }, [droneHistory, sessionTrackerIds, isCompleted, historicalDroneHistory]);

  // Filter SD card tracks (FIX: was unfiltered before)
  const sessionSDCardTracks = useMemo(() => {
    if (sessionTrackerIds.size === 0) return sdCardTracks;

    const filtered = new Map<string, any[]>();
    for (const [trackerId, tracks] of sdCardTracks) {
      if (sessionTrackerIds.has(trackerId)) {
        filtered.set(trackerId, tracks);
      }
    }
    return filtered;
  }, [sdCardTracks, sessionTrackerIds]);

  // Filter anomaly alerts (FIX: was unfiltered before)
  const sessionAlerts = useMemo(() => {
    if (sessionTrackerIds.size === 0) return anomalyAlerts;
    return anomalyAlerts.filter(a => sessionTrackerIds.has(a.tracker_id));
  }, [anomalyAlerts, sessionTrackerIds]);

  // CUAS placements from active session
  const cuasPlacements = activeSession?.cuas_placements || [];

  // Asset placements (vehicles/equipment) from active session
  const assetPlacements = activeSession?.asset_placements || [];

  // Events from active session
  const events = activeSession?.events || [];

  // Session site name
  const sessionSite = useMemo(() => {
    if (activeSession?.site_id) {
      const site = sites.find(s => s.id === activeSession.site_id);
      if (site) return site;
    }
    return selectedSite ?? null;
  }, [activeSession, sites, selectedSite]);

  return {
    sessionDrones,
    sessionDroneHistory,
    sessionSDCardTracks,
    sessionAlerts,
    sessionTrackerIds,
    cuasPlacements,
    assetPlacements,
    cuasProfiles,
    events,
    engagements,
    sessionName: activeSession?.name || 'Session',
    siteName: sessionSite?.name,
    isLive,
    isCompleted,
    connectionStatus,
  };
}
