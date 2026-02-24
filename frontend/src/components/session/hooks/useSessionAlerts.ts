/**
 * useSessionAlerts — Alert monitoring for live sessions.
 *
 * Combines:
 * - Real-time anomaly alerts from WebSocket (filtered by session)
 * - Session events that represent alerts (geofence_breach, link_lost, etc.)
 * - Local alert generation (signal lost, battery warnings)
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { DroneSummary } from '../../../types/drone';
import type { TestEvent, AlertLevel, EventType } from '../../../types/workflow';
import type { AnomalyAlert } from '../../../contexts/WebSocketContext';

export interface SessionAlert {
  id: string;
  type: string;
  severity: AlertLevel;
  trackerId?: string;
  message: string;
  timestamp: number;
  acknowledged: boolean;
}

interface UseSessionAlertsReturn {
  alerts: SessionAlert[];
  unacknowledgedCount: number;
  acknowledgeAlert: (id: string) => void;
  acknowledgeAll: () => void;
}

const ALERT_DEDUP_WINDOW_MS = 30_000;

const ALERT_EVENT_TYPES: Set<string> = new Set([
  'geofence_breach', 'link_lost', 'gps_lost', 'altitude_anomaly',
  'position_jump', 'failsafe', 'gps_anomaly',
]);

const EVENT_SEVERITY: Partial<Record<EventType, AlertLevel>> = {
  geofence_breach: 'critical',
  link_lost: 'critical',
  gps_lost: 'warning',
  altitude_anomaly: 'warning',
  position_jump: 'warning',
  failsafe: 'critical',
  gps_anomaly: 'warning',
};

export function useSessionAlerts(
  sessionDrones: Map<string, DroneSummary>,
  anomalyAlerts: AnomalyAlert[],
  sessionEvents: TestEvent[],
): UseSessionAlertsReturn {
  const [alerts, setAlerts] = useState<SessionAlert[]>([]);
  const lastAlertRef = useRef<Map<string, number>>(new Map());
  const idCounter = useRef(0);
  const processedEventIds = useRef<Set<string>>(new Set());

  const shouldEmit = useCallback((key: string): boolean => {
    const last = lastAlertRef.current.get(key);
    if (last && Date.now() - last < ALERT_DEDUP_WINDOW_MS) return false;
    lastAlertRef.current.set(key, Date.now());
    return true;
  }, []);

  // Convert anomaly alerts to session alerts
  useEffect(() => {
    const newAlerts: SessionAlert[] = [];
    for (const anomaly of anomalyAlerts) {
      if (!processedEventIds.current.has(anomaly.id)) {
        processedEventIds.current.add(anomaly.id);
        newAlerts.push({
          id: anomaly.id,
          type: anomaly.type,
          severity: anomaly.level,
          trackerId: anomaly.tracker_id,
          message: anomaly.message,
          timestamp: new Date(anomaly.timestamp).getTime(),
          acknowledged: false,
        });
      }
    }
    if (newAlerts.length > 0) {
      setAlerts(prev => [...newAlerts, ...prev].slice(0, 200));
    }
  }, [anomalyAlerts]);

  // Generate alerts from drone state
  useEffect(() => {
    const newAlerts: SessionAlert[] = [];

    for (const drone of sessionDrones.values()) {
      // Signal lost
      if (drone.is_stale) {
        const key = `stale:${drone.tracker_id}`;
        if (shouldEmit(key)) {
          newAlerts.push({
            id: `local-${++idCounter.current}-${Date.now()}`,
            type: 'signal_lost',
            severity: 'critical',
            trackerId: drone.tracker_id,
            message: `${drone.alias ?? drone.tracker_id} signal lost — no data for ${drone.age_seconds}s`,
            timestamp: Date.now(),
            acknowledged: false,
          });
        }
      }
    }

    if (newAlerts.length > 0) {
      setAlerts(prev => [...newAlerts, ...prev].slice(0, 200));
    }
  }, [sessionDrones, shouldEmit]);

  // Convert alert-type session events
  useEffect(() => {
    const newAlerts: SessionAlert[] = [];

    for (const event of sessionEvents) {
      if (ALERT_EVENT_TYPES.has(event.type) && !processedEventIds.current.has(event.id)) {
        processedEventIds.current.add(event.id);
        newAlerts.push({
          id: event.id,
          type: event.type,
          severity: EVENT_SEVERITY[event.type] ?? 'info',
          trackerId: event.tracker_id,
          message: event.note || `${event.type.replace(/_/g, ' ')} detected`,
          timestamp: new Date(event.timestamp).getTime(),
          acknowledged: false,
        });
      }
    }

    if (newAlerts.length > 0) {
      setAlerts(prev => [...newAlerts, ...prev].slice(0, 200));
    }
  }, [sessionEvents]);

  const unacknowledgedCount = useMemo(
    () => alerts.filter(a => !a.acknowledged).length,
    [alerts],
  );

  const acknowledgeAlert = useCallback((id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, acknowledged: true } : a));
  }, []);

  const acknowledgeAll = useCallback(() => {
    setAlerts(prev => prev.map(a => ({ ...a, acknowledged: true })));
  }, []);

  return { alerts, unacknowledgedCount, acknowledgeAlert, acknowledgeAll };
}
