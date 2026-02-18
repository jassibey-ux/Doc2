/**
 * useEventAlerts — Alert generation hook watching live drone data.
 *
 * Generates alerts for:
 * - Geofence breach:     Position outside assigned zone radius
 * - Battery low:         drone.low_battery === true
 * - Signal lost:         drone.is_stale === true
 * - Proximity warning:   Two drones within 50m (haversine)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { DroneSummary } from '../../../types/drone';
import type { EventAlert, GeofenceZone } from '../../../types/blueUas';
import { haversineDistance } from '../../../utils/geo';

const PROXIMITY_THRESHOLD_M = 50;
const ALERT_DEDUP_WINDOW_MS = 30_000; // Don't re-fire same alert type for same drone within 30s

interface UseEventAlertsReturn {
  alerts: EventAlert[];
  unacknowledgedCount: number;
  acknowledgeAlert: (id: string) => void;
  acknowledgeAll: () => void;
}

export function useEventAlerts(
  drones: Map<string, DroneSummary>,
  geofenceZones: GeofenceZone[],
): UseEventAlertsReturn {
  const [alerts, setAlerts] = useState<EventAlert[]>([]);
  const lastAlertRef = useRef<Map<string, number>>(new Map()); // key -> timestamp of last alert
  let idCounter = useRef(0);

  // Generate a dedup key for (droneId, alertType)
  const dedupKey = (trackerId: string, type: string) => `${trackerId}:${type}`;

  // Check if we should emit an alert (dedup)
  const shouldEmit = (key: string): boolean => {
    const last = lastAlertRef.current.get(key);
    if (last && Date.now() - last < ALERT_DEDUP_WINDOW_MS) return false;
    lastAlertRef.current.set(key, Date.now());
    return true;
  };

  const makeAlert = (
    type: EventAlert['type'],
    severity: EventAlert['severity'],
    trackerId: string,
    message: string,
  ): EventAlert => ({
    id: `alert-${++idCounter.current}-${Date.now()}`,
    type,
    severity,
    trackerId,
    message,
    timestamp: Date.now(),
    acknowledged: false,
  });

  // Run alert checks whenever drones change
  useEffect(() => {
    const droneList = Array.from(drones.values());
    const newAlerts: EventAlert[] = [];

    for (const drone of droneList) {
      // Battery low
      if (drone.low_battery) {
        const key = dedupKey(drone.tracker_id, 'battery_low');
        if (shouldEmit(key)) {
          const name = drone.alias ?? drone.tracker_id;
          newAlerts.push(makeAlert(
            'battery_low', 'warning', drone.tracker_id,
            `${name} battery is low${drone.battery_mv ? ` (${(drone.battery_mv / 1000).toFixed(1)}V)` : ''}`,
          ));
        }
      }

      // Signal lost
      if (drone.is_stale) {
        const key = dedupKey(drone.tracker_id, 'signal_lost');
        if (shouldEmit(key)) {
          const name = drone.alias ?? drone.tracker_id;
          newAlerts.push(makeAlert(
            'signal_lost', 'critical', drone.tracker_id,
            `${name} signal lost — no data for ${drone.age_seconds}s`,
          ));
        }
      }

      // Geofence breach: check if drone is outside all authorized corridors
      if (drone.lat != null && drone.lon != null && geofenceZones.length > 0) {
        const authorizedZones = geofenceZones.filter(z => z.type === 'authorized_corridor' && z.active);
        if (authorizedZones.length > 0) {
          const inAnyZone = authorizedZones.some(zone => {
            if (zone.center && zone.radiusM) {
              const dist = haversineDistance(drone.lat!, drone.lon!, zone.center.lat, zone.center.lng);
              return dist <= zone.radiusM;
            }
            return true; // If polygon-based, assume compliant for now
          });
          if (!inAnyZone) {
            const key = dedupKey(drone.tracker_id, 'geofence_breach');
            if (shouldEmit(key)) {
              const name = drone.alias ?? drone.tracker_id;
              newAlerts.push(makeAlert(
                'geofence_breach', 'critical', drone.tracker_id,
                `${name} is outside authorized flight corridor`,
              ));
            }
          }
        }
      }
    }

    // Proximity warnings: O(n^2) pairwise check
    for (let i = 0; i < droneList.length; i++) {
      const a = droneList[i];
      if (a.lat == null || a.lon == null || a.is_stale) continue;
      for (let j = i + 1; j < droneList.length; j++) {
        const b = droneList[j];
        if (b.lat == null || b.lon == null || b.is_stale) continue;
        const dist = haversineDistance(a.lat, a.lon, b.lat, b.lon);
        if (dist < PROXIMITY_THRESHOLD_M) {
          // Use sorted pair as key for dedup
          const pair = [a.tracker_id, b.tracker_id].sort().join('+');
          const key = `proximity:${pair}`;
          if (shouldEmit(key)) {
            const nameA = a.alias ?? a.tracker_id;
            const nameB = b.alias ?? b.tracker_id;
            newAlerts.push(makeAlert(
              'proximity_warning', 'warning', a.tracker_id,
              `${nameA} and ${nameB} are within ${Math.round(dist)}m of each other`,
            ));
          }
        }
      }
    }

    if (newAlerts.length > 0) {
      setAlerts(prev => [...newAlerts, ...prev].slice(0, 200)); // cap at 200
    }
  }, [drones, geofenceZones]);

  const unacknowledgedCount = alerts.filter(a => !a.acknowledged).length;

  const acknowledgeAlert = useCallback((id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, acknowledged: true } : a));
  }, []);

  const acknowledgeAll = useCallback(() => {
    setAlerts(prev => prev.map(a => ({ ...a, acknowledged: true })));
  }, []);

  return { alerts, unacknowledgedCount, acknowledgeAlert, acknowledgeAll };
}
