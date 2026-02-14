/**
 * GPSQualityChart
 * Canvas 2D chart showing satellite count (left axis, filled step) and
 * HDOP (right axis, line) over time. Synchronized hover with RangeOverTimeChart.
 */

import { useState, useEffect, useRef } from 'react';
import type { RangeTimelinePoint } from './RangeOverTimeChart';

interface Props {
  sessionId: string;
  cuasPlacementId: string;
  trackerId: string;
  hoverTimestamp?: number | null;
  onHoverTimestamp?: (ts: number | null) => void;
}

export default function GPSQualityChart({
  sessionId,
  cuasPlacementId,
  trackerId,
  hoverTimestamp,
  onHoverTimestamp,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [points, setPoints] = useState<RangeTimelinePoint[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch same data as RangeOverTimeChart (could share via parent, but self-contained is simpler)
  useEffect(() => {
    setLoading(true);
    fetch(`/api/sessions/${sessionId}/range-timeline?cuas_id=${cuasPlacementId}&tracker_id=${trackerId}`)
      .then(res => res.json())
      .then(data => setPoints(data.points || []))
      .catch(err => console.error('[GPSQualityChart] Fetch error:', err))
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
    const PAD = { top: 30, right: 50, bottom: 40, left: 60 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    // Clear
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, W, H);

    const tMin = points[0].timestamp_ms;
    const tMax = points[points.length - 1].timestamp_ms;
    const tRange = Math.max(tMax - tMin, 1);
    const maxSats = 20;
    const maxHdop = 15;

    const toX = (t: number) => PAD.left + ((t - tMin) / tRange) * plotW;
    const toYSats = (s: number) => PAD.top + plotH - (Math.min(s, maxSats) / maxSats) * plotH;
    const toYHdop = (h: number) => PAD.top + plotH - (Math.min(h, maxHdop) / maxHdop) * plotH;

    // Grid lines
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.5;
    const numGridY = 4;
    for (let i = 0; i <= numGridY; i++) {
      const y = PAD.top + (i / numGridY) * plotH;
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(W - PAD.right, y);
      ctx.stroke();

      // Left axis: satellite count
      const sats = Math.round(maxSats * (1 - i / numGridY));
      ctx.fillStyle = '#888';
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${sats}`, PAD.left - 5, y + 4);

      // Right axis: HDOP
      const hdop = (maxHdop * (1 - i / numGridY)).toFixed(1);
      ctx.textAlign = 'left';
      ctx.fillText(hdop, W - PAD.right + 5, y + 4);
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

    // HDOP threshold lines
    // HDOP 2.0 = good threshold (green dashed)
    const hdop2Y = toYHdop(2.0);
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(PAD.left, hdop2Y);
    ctx.lineTo(W - PAD.right, hdop2Y);
    ctx.stroke();

    // HDOP 5.0 = degraded threshold (red dashed)
    const hdop5Y = toYHdop(5.0);
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
    ctx.beginPath();
    ctx.moveTo(PAD.left, hdop5Y);
    ctx.lineTo(W - PAD.right, hdop5Y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Satellite count as filled step segments
    ctx.beginPath();
    ctx.moveTo(toX(points[0].timestamp_ms), toYSats(points[0].satellites));
    for (let i = 1; i < points.length; i++) {
      // Step: horizontal then vertical
      ctx.lineTo(toX(points[i].timestamp_ms), toYSats(points[i - 1].satellites));
      ctx.lineTo(toX(points[i].timestamp_ms), toYSats(points[i].satellites));
    }
    // Close fill to bottom
    ctx.lineTo(toX(points[points.length - 1].timestamp_ms), PAD.top + plotH);
    ctx.lineTo(toX(points[0].timestamp_ms), PAD.top + plotH);
    ctx.closePath();
    ctx.fillStyle = 'rgba(96, 165, 250, 0.15)';
    ctx.fill();

    // Satellite count step outline
    ctx.beginPath();
    ctx.moveTo(toX(points[0].timestamp_ms), toYSats(points[0].satellites));
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(toX(points[i].timestamp_ms), toYSats(points[i - 1].satellites));
      ctx.lineTo(toX(points[i].timestamp_ms), toYSats(points[i].satellites));
    }
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // HDOP line
    ctx.beginPath();
    ctx.moveTo(toX(points[0].timestamp_ms), toYHdop(points[0].hdop));
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(toX(points[i].timestamp_ms), toYHdop(points[i].hdop));
    }
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.stroke();

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
      ctx.fillStyle = '#fff';
      ctx.font = '10px monospace';
      ctx.textAlign = hx > W / 2 ? 'right' : 'left';
      ctx.fillText(
        `Sats: ${closest.satellites}  HDOP: ${closest.hdop.toFixed(1)}  GPS: ${closest.gps_quality}`,
        hx + (hx > W / 2 ? -8 : 8),
        PAD.top + 14,
      );

      // Dots
      ctx.fillStyle = '#60a5fa';
      ctx.beginPath();
      ctx.arc(hx, toYSats(closest.satellites), 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(hx, toYHdop(closest.hdop), 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Axis labels
    ctx.fillStyle = '#60a5fa';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.save();
    ctx.translate(12, PAD.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Satellites', 0, 0);
    ctx.restore();

    ctx.fillStyle = '#f59e0b';
    ctx.save();
    ctx.translate(W - 8, PAD.top + plotH / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillText('HDOP', 0, 0);
    ctx.restore();

    // Title
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('GPS Quality', PAD.left, 18);

  }, [points, hoverTimestamp]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || points.length === 0) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const PAD_LEFT = 60;
    const PAD_RIGHT = 50;
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
          Loading GPS quality data...
        </div>
      </div>
    );
  }

  if (points.length === 0) return null;

  return (
    <div style={{ background: '#111', border: '1px solid #333', borderRadius: 8, padding: 8 }}>
      <canvas
        ref={canvasRef}
        width={700}
        height={200}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => onHoverTimestamp?.(null)}
        style={{ width: '100%', cursor: 'crosshair' }}
      />
    </div>
  );
}
