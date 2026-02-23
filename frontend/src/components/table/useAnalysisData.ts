/**
 * useAnalysisData — Fetch full session telemetry from the REST API.
 * Marks rows with engagement/burst overlays + computes engagement context fields.
 * Merges engagement events as synthetic rows.
 */

import { useState, useEffect, useMemo } from 'react';
import type { TelemetryRow } from './types';
import type { Engagement } from '../../types/workflow';

interface AnalysisDataResult {
  data: TelemetryRow[];
  engagements: Engagement[];
  trackerIds: string[];
  sessionName: string;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/** Compute 3D distance in meters between two geo positions. */
function computeDistance(
  lat1: number, lon1: number, alt1: number,
  lat2: number, lon2: number, alt2: number,
): number {
  const dLat = (lat2 - lat1) * 111320;
  const dLon = (lon2 - lon1) * 111320 * Math.cos(lat1 * Math.PI / 180);
  const dAlt = alt2 - alt1;
  return Math.sqrt(dLat * dLat + dLon * dLon + dAlt * dAlt);
}

export function useAnalysisData(sessionId: string | undefined): AnalysisDataResult {
  const [rawData, setRawData] = useState<TelemetryRow[]>([]);
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [sessionName, setSessionName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchCount, setFetchCount] = useState(0);

  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetch(`/api/test-sessions/${sessionId}/raw-telemetry`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        setRawData(json.positions ?? []);
        setEngagements(json.engagements ?? []);
        setSessionName(json.session_name ?? '');
        setIsLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId, fetchCount]);

  // Mark engagement/burst rows + compute engagement context fields + inject event rows
  const data = useMemo(() => {
    if (rawData.length === 0 || engagements.length === 0) return rawData;

    // Precompute engagement windows with associated data
    interface EngWindow {
      engId: string;
      startMs: number;
      endMs: number;
      cuasLat: number | null;
      cuasLon: number | null;
      cuasAlt: number;
      trackerIds: Set<string>;
      initialAltitudes: Map<string, number>;
    }
    interface BurstWindow {
      startMs: number;
      endMs: number;
    }

    const engWindows: EngWindow[] = [];
    const burstWindows: BurstWindow[] = [];
    const eventRows: TelemetryRow[] = [];

    for (const eng of engagements) {
      if (!eng.engage_timestamp) continue;
      const startMs = new Date(eng.engage_timestamp).getTime();
      const endMs = eng.disengage_timestamp
        ? new Date(eng.disengage_timestamp).getTime()
        : Date.now();

      const targets = Array.isArray(eng.targets) ? eng.targets : [];
      const trackerIds = new Set(targets.map(t => t.tracker_id));
      const initialAltitudes = new Map<string, number>();
      for (const t of targets) {
        if (t.initial_altitude_m != null) {
          initialAltitudes.set(t.tracker_id, t.initial_altitude_m);
        }
      }

      engWindows.push({
        engId: eng.id,
        startMs,
        endMs,
        cuasLat: eng.cuas_lat ?? null,
        cuasLon: eng.cuas_lon ?? null,
        cuasAlt: eng.cuas_alt_m ?? 5,
        trackerIds,
        initialAltitudes,
      });

      // Inject ENGAGE event row
      const engTrackerId = targets[0]?.tracker_id ?? 'CUAS';
      eventRows.push(makeEventRow(startMs, engTrackerId, eng.id, 'ENGAGE'));

      // Inject DISENGAGE event row
      if (eng.disengage_timestamp) {
        eventRows.push(makeEventRow(
          new Date(eng.disengage_timestamp).getTime(),
          engTrackerId, eng.id, 'DISENGAGE',
        ));
      }

      for (const burst of eng.bursts || []) {
        if (!burst.jam_on_at) continue;
        const bStart = new Date(burst.jam_on_at).getTime();
        const bEnd = burst.jam_off_at
          ? new Date(burst.jam_off_at).getTime()
          : Date.now();
        burstWindows.push({ startMs: bStart, endMs: bEnd });

        // Inject JAM_ON / JAM_OFF event rows
        eventRows.push(makeEventRow(bStart, engTrackerId, eng.id, 'JAM_ON'));
        if (burst.jam_off_at) {
          eventRows.push(makeEventRow(bEnd, engTrackerId, eng.id, 'JAM_OFF'));
        }
      }
    }

    // Process telemetry rows with engagement context
    const enrichedRows = rawData.map((row) => {
      const ts = row.timestamp_ms;

      // Find matching engagement window for this row's tracker
      const matchedEng = engWindows.find(
        (w) => ts >= w.startMs && ts <= w.endMs && w.trackerIds.has(row.tracker_id),
      );
      const inEngagement = !!matchedEng;
      const inJamBurst = burstWindows.some(
        (w) => ts >= w.startMs && ts <= w.endMs,
      );

      if (!inEngagement && !inJamBurst) return row;

      const enriched: TelemetryRow = {
        ...row,
        inEngagement,
        inJamBurst,
      };

      if (matchedEng) {
        enriched.engagement_id = matchedEng.engId;
        enriched.jam_active = inJamBurst;

        // Compute CUAS distance
        if (matchedEng.cuasLat != null && matchedEng.cuasLon != null && row.lat != null && row.lon != null) {
          enriched.cuas_distance_m = Math.round(computeDistance(
            matchedEng.cuasLat, matchedEng.cuasLon, matchedEng.cuasAlt,
            row.lat, row.lon, row.alt_m ?? 50,
          ));
        }

        // Compute altitude delta
        const initAlt = matchedEng.initialAltitudes.get(row.tracker_id);
        if (initAlt != null && row.alt_m != null) {
          enriched.alt_delta_m = row.alt_m - initAlt;
        }
      }

      return enriched;
    });

    // Merge event rows and sort by timestamp
    const allRows = [...enrichedRows, ...eventRows];
    allRows.sort((a, b) => a.timestamp_ms - b.timestamp_ms);

    return allRows;
  }, [rawData, engagements]);

  const trackerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of rawData) ids.add(r.tracker_id);
    return Array.from(ids).sort();
  }, [rawData]);

  const refetch = () => setFetchCount((c) => c + 1);

  return { data, engagements, trackerIds, sessionName, isLoading, error, refetch };
}

/** Create a synthetic event row. */
function makeEventRow(tsMs: number, trackerId: string, engId: string, eventType: string): TelemetryRow {
  return {
    id: `event_${eventType}_${tsMs}_${engId}`,
    tracker_id: trackerId,
    timestamp: new Date(tsMs).toISOString(),
    timestamp_ms: tsMs,
    time_gps: null,
    lat: null,
    lon: null,
    alt_m: null,
    speed_mps: null,
    course_deg: null,
    hdop: null,
    satellites: null,
    rssi_dbm: null,
    baro_alt_m: null,
    baro_temp_c: null,
    baro_press_hpa: null,
    fix_valid: true,
    battery_mv: null,
    latency_ms: null,
    gps_quality: null,
    engagement_id: engId,
    event_type: eventType,
  };
}
