/**
 * Location tracking service.
 *
 * Provides foreground location updates for operator position reporting.
 * Positions are sent to the backend (or queued offline) at a configurable interval.
 */

import * as Location from 'expo-location';
import { apiFetch, checkConnection } from './api';
import { enqueue } from './offline-queue';

let watchSubscription: Location.LocationSubscription | null = null;
let activeSessionId: string | null = null;
let actorId: string | null = null;

export interface PositionUpdate {
  lat: number;
  lon: number;
  alt_m: number | null;
  heading_deg: number | null;
  speed_mps: number | null;
  gps_accuracy_m: number | null;
  timestamp: string;
}

type PositionCallback = (position: PositionUpdate) => void;
let onPositionUpdate: PositionCallback | null = null;

export function setPositionCallback(cb: PositionCallback | null): void {
  onPositionUpdate = cb;
}

export async function requestPermissions(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

export async function startTracking(
  sessionId: string,
  actorIdParam: string,
  intervalMs: number = 2000,
): Promise<void> {
  if (watchSubscription) await stopTracking();

  activeSessionId = sessionId;
  actorId = actorIdParam;

  watchSubscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: intervalMs,
      distanceInterval: 1, // meters
    },
    (location) => {
      const position: PositionUpdate = {
        lat: location.coords.latitude,
        lon: location.coords.longitude,
        alt_m: location.coords.altitude,
        heading_deg: location.coords.heading,
        speed_mps: location.coords.speed,
        gps_accuracy_m: location.coords.accuracy,
        timestamp: new Date(location.timestamp).toISOString(),
      };

      onPositionUpdate?.(position);
      sendPosition(position);
    },
  );
}

export async function stopTracking(): Promise<void> {
  if (watchSubscription) {
    watchSubscription.remove();
    watchSubscription = null;
  }
  activeSessionId = null;
  actorId = null;
}

export function isTracking(): boolean {
  return watchSubscription !== null;
}

async function sendPosition(position: PositionUpdate): Promise<void> {
  if (!activeSessionId || !actorId) return;

  const payload = {
    session_id: activeSessionId,
    actor_id: actorId,
    ...position,
    source: 'gps',
  };

  const online = await checkConnection();
  if (online) {
    try {
      await apiFetch(`/api/v2/sessions/${activeSessionId}/operator-positions`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch {
      await enqueue('operator_position', payload);
    }
  } else {
    await enqueue('operator_position', payload);
  }
}
