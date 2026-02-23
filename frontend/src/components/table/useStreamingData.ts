/**
 * useStreamingData — Subscribes to WebSocket tracker updates
 * and maintains a ring buffer of TelemetryRow entries for live display.
 * Optionally marks rows with engagement context.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useWebSocket } from '../../contexts/WebSocketContext';
import type { DroneSummary } from '../../types/drone';
import type { TelemetryRow } from './types';
import type { Engagement } from '../../types/workflow';

const MAX_ENTRIES = 2000;

/** Compute 3D distance in meters. */
function computeDistanceFast(
  lat1: number, lon1: number, alt1: number,
  lat2: number, lon2: number, alt2: number,
): number {
  const dLat = (lat2 - lat1) * 111320;
  const dLon = (lon2 - lon1) * 111320 * Math.cos(lat1 * Math.PI / 180);
  const dAlt = alt2 - alt1;
  return Math.sqrt(dLat * dLat + dLon * dLon + dAlt * dAlt);
}

function droneToRow(
  drone: DroneSummary,
  activeEngagements?: Map<string, Engagement>,
): TelemetryRow {
  const tsMs = new Date(drone.last_update).getTime();
  const row: TelemetryRow = {
    id: `${drone.tracker_id}_${tsMs}`,
    tracker_id: drone.tracker_id,
    timestamp: drone.last_update,
    timestamp_ms: tsMs,
    time_gps: null,
    lat: drone.lat,
    lon: drone.lon,
    alt_m: drone.alt_m,
    speed_mps: drone.speed_mps ?? null,
    course_deg: drone.heading_deg ?? null,
    hdop: drone.gps_health?.hdop ?? null,
    satellites: drone.gps_health?.satellites ?? null,
    rssi_dbm: drone.rssi_dbm,
    baro_alt_m: null,
    baro_temp_c: null,
    baro_press_hpa: null,
    fix_valid: drone.fix_valid,
    battery_mv: drone.battery_mv ?? null,
    latency_ms: null,
    gps_quality: drone.gps_health?.health_status ?? null,
  };

  // Mark engagement context if available
  if (activeEngagements && activeEngagements.size > 0) {
    for (const [engId, eng] of activeEngagements) {
      const target = (eng.targets ?? []).find(t => t.tracker_id === drone.tracker_id);
      if (!target) continue;

      row.inEngagement = true;
      row.engagement_id = engId;

      // Check if currently jamming
      const hasActiveBurst = eng.bursts?.some(b => b.jam_on_at && !b.jam_off_at);
      row.jam_active = hasActiveBurst ?? false;
      row.inJamBurst = hasActiveBurst ?? false;

      // Compute CUAS distance
      if (eng.cuas_lat != null && eng.cuas_lon != null && drone.lat != null && drone.lon != null) {
        row.cuas_distance_m = Math.round(computeDistanceFast(
          eng.cuas_lat, eng.cuas_lon, eng.cuas_alt_m ?? 5,
          drone.lat, drone.lon, drone.alt_m ?? 50,
        ));
      }

      // Compute altitude delta
      if (target.initial_altitude_m != null && drone.alt_m != null) {
        row.alt_delta_m = drone.alt_m - target.initial_altitude_m;
      }

      break; // Only match first engagement
    }
  }

  return row;
}

interface StreamingDataResult {
  entries: TelemetryRow[];
  /** Total entries received (including those evicted from buffer) */
  totalReceived: number;
  clear: () => void;
}

export function useStreamingData(
  /** Set of tracker IDs to capture (empty = all trackers) */
  trackerFilter?: Set<string>,
  /** Active engagements to mark rows with engagement context */
  activeEngagements?: Map<string, Engagement>,
): StreamingDataResult {
  const { drones } = useWebSocket();
  const [entries, setEntries] = useState<TelemetryRow[]>([]);
  const totalRef = useRef(0);
  const lastSeenRef = useRef(new Map<string, string>());

  // Watch for drone updates and append new rows
  useEffect(() => {
    const newRows: TelemetryRow[] = [];

    for (const [trackerId, drone] of drones) {
      // Skip if not in filter
      if (trackerFilter && trackerFilter.size > 0 && !trackerFilter.has(trackerId)) {
        continue;
      }
      // Deduplicate: skip if last_update hasn't changed
      const prevUpdate = lastSeenRef.current.get(trackerId);
      if (prevUpdate === drone.last_update) continue;
      lastSeenRef.current.set(trackerId, drone.last_update);

      newRows.push(droneToRow(drone, activeEngagements));
    }

    if (newRows.length === 0) return;

    totalRef.current += newRows.length;

    setEntries((prev) => {
      const combined = [...prev, ...newRows];
      if (combined.length > MAX_ENTRIES) {
        return combined.slice(combined.length - MAX_ENTRIES);
      }
      return combined;
    });
  }, [drones, trackerFilter, activeEngagements]);

  const clear = useCallback(() => {
    setEntries([]);
    totalRef.current = 0;
    lastSeenRef.current.clear();
  }, []);

  return { entries, totalReceived: totalRef.current, clear };
}
