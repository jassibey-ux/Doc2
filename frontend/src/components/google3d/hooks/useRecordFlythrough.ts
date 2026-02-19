/**
 * useRecordFlythrough — Capture a site flythrough as a sequence of PNG frames.
 *
 * Generates waypoints around the site boundary polygon, runs a guided camera
 * tour via the Google3DViewerHandle, and captures screenshots at regular
 * intervals during the animation. The resulting frames are stored as base64 PNG
 * data URLs and can be downloaded individually or as a batch.
 */

import { useState, useCallback, useRef } from 'react';
import type { GeoPoint } from '../../../types/workflow';
import type { Google3DViewerHandle } from '../Google3DViewer';
import type { TourWaypoint } from './useGoogle3DCameraController';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FlythroughFrame {
  /** Zero-based index of the frame in the sequence */
  index: number;
  /** base64 PNG data URL */
  dataUrl: string;
  /** Timestamp (ms) relative to tour start when the frame was captured */
  capturedAtMs: number;
}

export interface RecordFlythroughOptions {
  /** Total tour duration in milliseconds (default 20000) */
  durationMs?: number;
  /** Camera altitude in metres above ground (default 300) */
  altitudeM?: number;
  /** Camera tilt in degrees — 0 is straight down, 90 is horizon (default 60) */
  tiltDeg?: number;
  /** Camera range from the waypoint center in metres (default 600) */
  rangeM?: number;
  /** Number of waypoints to generate around the perimeter (default 12, clamped 8-16) */
  waypointCount?: number;
  /** Interval between frame captures in milliseconds (default 500) */
  captureIntervalMs?: number;
}

export interface UseRecordFlythroughReturn {
  /** True while the recording / capture process is running */
  isRecording: boolean;
  /** 0-1 progress fraction during recording */
  progress: number;
  /** The captured frames from the most recent recording */
  frames: FlythroughFrame[];
  /** First frame data URL for use as a thumbnail preview (or null) */
  thumbnailUrl: string | null;
  /** Kick off a recording session */
  recordFlythrough: (
    viewerRef: React.RefObject<Google3DViewerHandle | null>,
    containerRef: React.RefObject<HTMLDivElement | null>,
    boundary: GeoPoint[],
    options?: RecordFlythroughOptions,
  ) => Promise<FlythroughFrame[]>;
  /** Download all captured frames as individual PNG files */
  downloadFrames: () => void;
  /** Download a single frame by index */
  downloadFrame: (index: number) => void;
  /** Reset state and discard captured frames */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Compute the centroid of a polygon defined by GeoPoints. */
function polygonCentroid(points: GeoPoint[]): { lat: number; lon: number } {
  let latSum = 0;
  let lonSum = 0;
  for (const p of points) {
    latSum += p.lat;
    lonSum += p.lon;
  }
  return { lat: latSum / points.length, lon: lonSum / points.length };
}

/** Degrees -> Radians */
function deg2rad(d: number): number {
  return (d * Math.PI) / 180;
}

/** Radians -> Degrees */
function rad2deg(r: number): number {
  return (r * 180) / Math.PI;
}

/**
 * Calculate the heading (bearing) in degrees from `from` to `to`.
 * 0 = north, 90 = east, 180 = south, 270 = west.
 */
function headingFromTo(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
): number {
  const dLon = deg2rad(toLon - fromLon);
  const lat1 = deg2rad(fromLat);
  const lat2 = deg2rad(toLat);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const bearing = rad2deg(Math.atan2(y, x));
  return (bearing + 360) % 360;
}

/**
 * Sample `count` equidistant points along the perimeter of a polygon.
 *
 * If the polygon has fewer vertices than `count`, intermediate positions are
 * linearly interpolated along each edge.
 */
function samplePerimeterPoints(
  boundary: GeoPoint[],
  count: number,
): { lat: number; lon: number }[] {
  if (boundary.length < 2) return [];

  // Close the polygon if not already closed
  const ring = [...boundary];
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first.lat !== last.lat || first.lon !== last.lon) {
    ring.push(first);
  }

  // Compute cumulative segment lengths (using simple Euclidean on lat/lon —
  // sufficient at the scale of a site boundary, typically < 1 km).
  const segLengths: number[] = [];
  let totalLength = 0;
  for (let i = 1; i < ring.length; i++) {
    const dLat = ring[i].lat - ring[i - 1].lat;
    const dLon = ring[i].lon - ring[i - 1].lon;
    const len = Math.sqrt(dLat * dLat + dLon * dLon);
    segLengths.push(len);
    totalLength += len;
  }

  if (totalLength === 0) {
    // Degenerate polygon — return copies of the first point
    return Array.from({ length: count }, () => ({
      lat: first.lat,
      lon: first.lon,
    }));
  }

  const step = totalLength / count;
  const result: { lat: number; lon: number }[] = [];
  let accumulated = 0;
  let segIdx = 0;
  let segUsed = 0; // how far into the current segment we've consumed

  for (let i = 0; i < count; i++) {
    const target = step * i;

    // Advance along segments until we reach the target distance
    while (
      segIdx < segLengths.length - 1 &&
      accumulated + segLengths[segIdx] - segUsed < target - accumulated
    ) {
      accumulated += segLengths[segIdx] - segUsed;
      segIdx++;
      segUsed = 0;
    }

    const remaining = target - accumulated;
    const segLen = segLengths[segIdx];
    const t = segLen > 0 ? (segUsed + remaining) / segLen : 0;
    const clampedT = Math.min(Math.max(t, 0), 1);

    const a = ring[segIdx];
    const b = ring[segIdx + 1];
    result.push({
      lat: a.lat + (b.lat - a.lat) * clampedT,
      lon: a.lon + (b.lon - a.lon) * clampedT,
    });
  }

  return result;
}

/**
 * Build tour waypoints that orbit the boundary polygon.
 *
 * Each waypoint is positioned on the perimeter and faces toward the polygon
 * centroid, producing a smooth flyaround effect.
 */
function buildTourWaypoints(
  boundary: GeoPoint[],
  options: RecordFlythroughOptions,
): TourWaypoint[] {
  const {
    durationMs = 20_000,
    altitudeM = 300,
    tiltDeg = 60,
    rangeM = 600,
    waypointCount: rawCount = 12,
  } = options;

  const count = Math.max(8, Math.min(16, rawCount));
  const center = polygonCentroid(boundary);
  const perimeterPts = samplePerimeterPoints(boundary, count);
  const perWpDuration = Math.round(durationMs / count);

  return perimeterPts.map((pt) => {
    const heading = headingFromTo(pt.lat, pt.lon, center.lat, center.lon);
    return {
      lat: pt.lat,
      lng: pt.lon,
      altitude: altitudeM,
      range: rangeM,
      tilt: tiltDeg,
      heading,
      durationMs: perWpDuration,
    };
  });
}

// ---------------------------------------------------------------------------
// Utility: trigger a browser download from a data URL
// ---------------------------------------------------------------------------

function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useRecordFlythrough(): UseRecordFlythroughReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [frames, setFrames] = useState<FlythroughFrame[]>([]);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  // Internal refs to allow the capture loop to be cancelled
  const recordingRef = useRef(false);
  const captureTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --------------------------------------------------
  // Reset
  // --------------------------------------------------
  const reset = useCallback(() => {
    recordingRef.current = false;
    if (captureTimerRef.current) {
      clearInterval(captureTimerRef.current);
      captureTimerRef.current = null;
    }
    setIsRecording(false);
    setProgress(0);
    setFrames([]);
    setThumbnailUrl(null);
  }, []);

  // --------------------------------------------------
  // Record
  // --------------------------------------------------
  const recordFlythrough = useCallback(
    async (
      viewerRef: React.RefObject<Google3DViewerHandle | null>,
      _containerRef: React.RefObject<HTMLDivElement | null>,
      boundary: GeoPoint[],
      options: RecordFlythroughOptions = {},
    ): Promise<FlythroughFrame[]> => {
      const viewer = viewerRef.current;
      if (!viewer || boundary.length < 3) {
        console.warn('[useRecordFlythrough] Viewer ref or boundary invalid');
        return [];
      }

      // Resolve options
      const durationMs = options.durationMs ?? 20_000;
      const captureIntervalMs = options.captureIntervalMs ?? 500;

      // Build waypoints
      const waypoints = buildTourWaypoints(boundary, options);
      if (waypoints.length === 0) return [];

      // Prepare recording state
      reset();
      setIsRecording(true);
      recordingRef.current = true;

      const captured: FlythroughFrame[] = [];
      const startTime = Date.now();

      // Start the guided tour on the viewer
      viewer.guidedTour(waypoints);

      // Capture loop — runs at the specified interval until the tour
      // duration has elapsed or recording is cancelled.
      return new Promise<FlythroughFrame[]>((resolve) => {
        const captureFrame = async () => {
          if (!recordingRef.current) return;

          const elapsedMs = Date.now() - startTime;
          const currentProgress = Math.min(elapsedMs / durationMs, 1);
          setProgress(currentProgress);

          // Stop when tour duration exceeded
          if (elapsedMs >= durationMs + captureIntervalMs) {
            finish();
            return;
          }

          try {
            const dataUrl = await viewer.captureScreenshot();
            if (dataUrl && recordingRef.current) {
              const frame: FlythroughFrame = {
                index: captured.length,
                dataUrl,
                capturedAtMs: elapsedMs,
              };
              captured.push(frame);

              // Update thumbnail from first captured frame
              if (captured.length === 1) {
                setThumbnailUrl(dataUrl);
              }
            }
          } catch (err) {
            console.warn('[useRecordFlythrough] Frame capture error:', err);
          }
        };

        const finish = () => {
          recordingRef.current = false;
          if (captureTimerRef.current) {
            clearInterval(captureTimerRef.current);
            captureTimerRef.current = null;
          }
          setFrames(captured);
          setProgress(1);
          setIsRecording(false);
          resolve(captured);
        };

        // Take the first frame immediately, then continue at interval
        captureFrame();
        captureTimerRef.current = setInterval(captureFrame, captureIntervalMs);

        // Safety timeout — guarantee we stop even if events misfire
        setTimeout(() => {
          if (recordingRef.current) {
            finish();
          }
        }, durationMs + 2000);
      });
    },
    [reset],
  );

  // --------------------------------------------------
  // Download helpers
  // --------------------------------------------------

  const downloadFrame = useCallback(
    (index: number) => {
      const frame = frames[index];
      if (!frame) return;
      const padded = String(frame.index).padStart(4, '0');
      downloadDataUrl(frame.dataUrl, `flythrough-frame-${padded}.png`);
    },
    [frames],
  );

  const downloadFrames = useCallback(() => {
    if (frames.length === 0) return;

    // Download each frame with a small stagger to avoid browser throttling
    frames.forEach((frame, i) => {
      setTimeout(() => {
        const padded = String(frame.index).padStart(4, '0');
        downloadDataUrl(frame.dataUrl, `flythrough-frame-${padded}.png`);
      }, i * 150);
    });
  }, [frames]);

  return {
    isRecording,
    progress,
    frames,
    thumbnailUrl,
    recordFlythrough,
    downloadFrames,
    downloadFrame,
    reset,
  };
}
