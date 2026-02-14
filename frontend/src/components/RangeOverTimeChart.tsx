/**
 * RangeOverTimeChart
 * Canvas 2D chart showing CUAS-to-drone range over time with GPS quality bands
 * and engagement event markers. Follows TerrainProfileChart pattern.
 */

import { useState, useEffect, useRef } from 'react';

export interface RangeTimelinePoint {
  timestamp_ms: number;
  range_m: number;
  gps_quality: 'good' | 'degraded' | 'poor';
  hdop: number;
  satellites: number;
}

export interface TimelineEvent {
  timestamp_ms: number;
  type: string;
}

interface Props {
  sessionId: string;
  cuasPlacementId: string;
  trackerId: string;
  /** Optional: parent provides hover timestamp for cross-chart sync */
  hoverTimestamp?: number | null;
  onHoverTimestamp?: (ts: number | null) => void;
}

const GPS_COLORS = {
  good: 'rgba(34, 197, 94, 0.12)',
  degraded: 'rgba(234, 179, 8, 0.12)',
  poor: 'rgba(239, 68, 68, 0.12)',
};

const EVENT_COLORS: Record<string, string> = {
  engage: '#06b6d4',
  disengage: '#a855f7',
  jam_on: '#ef4444',
  jam_off: '#22c55e',
};

export default function RangeOverTimeChart({
  sessionId,
  cuasPlacementId,
  trackerId,
  hoverTimestamp,
  onHoverTimestamp,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [points, setPoints] = useState<RangeTimelinePoint[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch data
  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/sessions/${sessionId}/range-timeline?cuas_id=${cuasPlacementId}&tracker_id=${trackerId}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        setPoints(data.points || []);
        setEvents(data.events || []);
      })
      .catch(err => {
        setError(err.message);
        console.error('[RangeOverTimeChart] Fetch error:', err);
      })
      .finally(() => setLoading(false));
  }, [sessionId, cuasPlacementId, trackerId]);

  // Draw chart
  useEffect(() => {
    if (!canvasRef.current || points.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const PAD = { top: 30, right: 20, bottom: 40, left: 60 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    // Clear
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, W, H);

    const tMin = points[0].timestamp_ms;
    const tMax = points[points.length - 1].timestamp_ms;
    const tRange = Math.max(tMax - tMin, 1);
    const maxRange = Math.max(...points.map(p => p.range_m)) * 1.1 || 100;

    const toX = (t: number) => PAD.left + ((t - tMin) / tRange) * plotW;
    const toY = (r: number) => PAD.top + plotH - (r / maxRange) * plotH;

    // GPS quality background bands
    let bandStart = 0;
    let bandQuality = points[0].gps_quality;
    for (let i = 1; i <= points.length; i++) {
      const curQuality = i < points.length ? points[i].gps_quality : bandQuality;
      if (curQuality !== bandQuality || i === points.length) {
        const x1 = toX(points[bandStart].timestamp_ms);
        const x2 = toX(points[Math.min(i, points.length - 1)].timestamp_ms);
        ctx.fillStyle = GPS_COLORS[bandQuality];
        ctx.fillRect(x1, PAD.top, x2 - x1, plotH);
        bandStart = i;
        bandQuality = curQuality;
      }
    }

    // Grid lines
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.5;
    const numGridY = 5;
    for (let i = 0; i <= numGridY; i++) {
      const r = (i / numGridY) * maxRange;
      const y = toY(r);
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(W - PAD.right, y);
      ctx.stroke();
      ctx.fillStyle = '#888';
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.round(r)}m`, PAD.left - 5, y + 4);
    }

    // Time labels
    const numGridX = 6;
    for (let i = 0; i <= numGridX; i++) {
      const t = tMin + (i / numGridX) * tRange;
      const x = toX(t);
      ctx.beginPath();
      ctx.moveTo(x, PAD.top);
      ctx.lineTo(x, H - PAD.bottom);
      ctx.stroke();
      ctx.fillStyle = '#888';
      ctx.textAlign = 'center';
      const d = new Date(t);
      ctx.fillText(
        `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`,
        x,
        H - PAD.bottom + 15,
      );
    }

    // Range line
    ctx.beginPath();
    ctx.moveTo(toX(points[0].timestamp_ms), toY(points[0].range_m));
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(toX(points[i].timestamp_ms), toY(points[i].range_m));
    }
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Range line glow
    ctx.beginPath();
    ctx.moveTo(toX(points[0].timestamp_ms), toY(points[0].range_m));
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(toX(points[i].timestamp_ms), toY(points[i].range_m));
    }
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.3)';
    ctx.lineWidth = 6;
    ctx.filter = 'blur(2px)';
    ctx.stroke();
    ctx.filter = 'none';

    // Event markers (vertical dashed lines)
    for (const evt of events) {
      if (evt.timestamp_ms < tMin || evt.timestamp_ms > tMax) continue;
      const x = toX(evt.timestamp_ms);
      ctx.strokeStyle = EVENT_COLORS[evt.type] || '#888';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x, PAD.top);
      ctx.lineTo(x, H - PAD.bottom);
      ctx.stroke();
      ctx.setLineDash([]);

      // Event label
      ctx.fillStyle = EVENT_COLORS[evt.type] || '#888';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(evt.type.replace(/_/g, ' ').toUpperCase(), x, PAD.top - 5);
    }

    // Hover crosshair
    const hTs = hoverTimestamp;
    if (hTs !== null && hTs !== undefined && hTs >= tMin && hTs <= tMax) {
      const hx = toX(hTs);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hx, PAD.top);
      ctx.lineTo(hx, H - PAD.bottom);
      ctx.stroke();

      // Find closest point
      let closest = points[0];
      let minDist = Math.abs(points[0].timestamp_ms - hTs);
      for (const p of points) {
        const d = Math.abs(p.timestamp_ms - hTs);
        if (d < minDist) {
          minDist = d;
          closest = p;
        }
      }

      // Tooltip
      const d = new Date(closest.timestamp_ms);
      const timeStr = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
      const label = `${timeStr} \u2014 ${Math.round(closest.range_m)}m \u2014 GPS: ${closest.gps_quality} \u2014 HDOP: ${closest.hdop.toFixed(1)} \u2014 ${closest.satellites} sats`;

      ctx.fillStyle = '#fff';
      ctx.font = '10px monospace';
      ctx.textAlign = hx > W / 2 ? 'right' : 'left';
      ctx.fillText(label, hx + (hx > W / 2 ? -8 : 8), PAD.top + 14);

      // Dot on line
      const cy = toY(closest.range_m);
      ctx.fillStyle = '#06b6d4';
      ctx.beginPath();
      ctx.arc(hx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Title
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Range Over Time', PAD.left, 18);

    ctx.fillStyle = '#888';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(trackerId, W - PAD.right, 18);

  }, [points, events, hoverTimestamp, trackerId]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || points.length === 0) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const PAD_LEFT = 60;
    const PAD_RIGHT = 20;
    const plotW = canvasRef.current.width - PAD_LEFT - PAD_RIGHT;
    const frac = (x - PAD_LEFT) / plotW;
    if (frac >= 0 && frac <= 1) {
      const tMin = points[0].timestamp_ms;
      const tMax = points[points.length - 1].timestamp_ms;
      onHoverTimestamp?.(tMin + frac * (tMax - tMin));
    } else {
      onHoverTimestamp?.(null);
    }
  };

  if (loading) {
    return (
      <div style={{ background: '#111', border: '1px solid #333', borderRadius: 8, padding: 8 }}>
        <div style={{ color: '#888', textAlign: 'center', padding: 30, fontSize: 12 }}>
          Loading range timeline...
        </div>
      </div>
    );
  }

  if (error || points.length === 0) {
    return (
      <div style={{ background: '#111', border: '1px solid #333', borderRadius: 8, padding: 8 }}>
        <div style={{ color: '#666', textAlign: 'center', padding: 30, fontSize: 12 }}>
          {error ? `Error: ${error}` : 'No range data available for this engagement'}
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: '#111', border: '1px solid #333', borderRadius: 8, padding: 8 }}>
      <canvas
        ref={canvasRef}
        width={700}
        height={250}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => onHoverTimestamp?.(null)}
        style={{ width: '100%', cursor: 'crosshair' }}
      />
    </div>
  );
}
