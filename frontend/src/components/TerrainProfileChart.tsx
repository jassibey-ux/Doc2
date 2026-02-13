/**
 * Terrain Profile Chart
 *
 * Interactive terrain cross-section chart.
 * Click two points on map → see elevation profile with LOS line and Fresnel zone.
 */

import React, { useState, useEffect, useRef } from 'react';

interface ProfileData {
  distances_m: number[];
  elevations_m: number[];
  lats: number[];
  lons: number[];
  total_distance_m: number;
}

interface LOSResult {
  is_visible: boolean;
  obstruction_distance_m: number | null;
  obstruction_elevation_m: number | null;
  los_clearance_m: number[];
}

interface Props {
  lat1: number;
  lon1: number;
  height1_m: number;
  lat2: number;
  lon2: number;
  height2_m: number;
  frequency_mhz?: number;
  onClose?: () => void;
}

const API_BASE = '';

const TerrainProfileChart: React.FC<Props> = ({
  lat1, lon1, height1_m,
  lat2, lon2, height2_m,
  frequency_mhz = 1575.42,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [los, setLos] = useState<LOSResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [profileRes, losRes] = await Promise.all([
          fetch(`${API_BASE}/api/v2/terrain/profile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lat1, lon1, lat2, lon2, num_points: 200,
            }),
          }),
          fetch(`${API_BASE}/api/v2/terrain/los-check`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lat1, lon1, height1_m,
              lat2, lon2, height2_m,
              num_points: 200,
            }),
          }),
        ]);

        if (profileRes.ok) setProfile(await profileRes.json());
        if (losRes.ok) setLos(await losRes.json());
      } catch (e) {
        console.error('Failed to fetch terrain data:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [lat1, lon1, height1_m, lat2, lon2, height2_m]);

  useEffect(() => {
    if (!profile || !canvasRef.current) return;

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

    const distances = profile.distances_m;
    const elevations = profile.elevations_m;
    const maxDist = profile.total_distance_m;
    const maxElev = Math.max(...elevations, elevations[0] + height1_m, elevations[elevations.length - 1] + height2_m) + 20;
    const minElev = Math.min(...elevations) - 10;
    const elevRange = maxElev - minElev;

    const toX = (d: number) => PAD.left + (d / maxDist) * plotW;
    const toY = (e: number) => PAD.top + plotH - ((e - minElev) / elevRange) * plotH;

    // Grid lines
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.5;
    const numGridY = 5;
    for (let i = 0; i <= numGridY; i++) {
      const elev = minElev + (i / numGridY) * elevRange;
      const y = toY(elev);
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(W - PAD.right, y);
      ctx.stroke();

      ctx.fillStyle = '#888';
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.round(elev)}m`, PAD.left - 5, y + 4);
    }

    // Distance labels
    const numGridX = 5;
    for (let i = 0; i <= numGridX; i++) {
      const d = (i / numGridX) * maxDist;
      const x = toX(d);
      ctx.beginPath();
      ctx.moveTo(x, PAD.top);
      ctx.lineTo(x, H - PAD.bottom);
      ctx.stroke();

      ctx.fillStyle = '#888';
      ctx.textAlign = 'center';
      ctx.fillText(`${(d / 1000).toFixed(1)}km`, x, H - PAD.bottom + 15);
    }

    // Terrain fill
    ctx.beginPath();
    ctx.moveTo(toX(distances[0]), toY(elevations[0]));
    for (let i = 1; i < distances.length; i++) {
      ctx.lineTo(toX(distances[i]), toY(elevations[i]));
    }
    ctx.lineTo(toX(distances[distances.length - 1]), H - PAD.bottom);
    ctx.lineTo(toX(distances[0]), H - PAD.bottom);
    ctx.closePath();
    ctx.fillStyle = 'rgba(139, 92, 46, 0.6)';
    ctx.fill();

    // Terrain outline
    ctx.beginPath();
    ctx.moveTo(toX(distances[0]), toY(elevations[0]));
    for (let i = 1; i < distances.length; i++) {
      ctx.lineTo(toX(distances[i]), toY(elevations[i]));
    }
    ctx.strokeStyle = '#a67c52';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // LOS line
    const obs_y = toY(elevations[0] + height1_m);
    const tgt_y = toY(elevations[elevations.length - 1] + height2_m);
    ctx.beginPath();
    ctx.moveTo(toX(0), obs_y);
    ctx.lineTo(toX(maxDist), tgt_y);
    ctx.strokeStyle = los?.is_visible ? 'rgba(34, 197, 94, 0.8)' : 'rgba(239, 68, 68, 0.8)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // First Fresnel zone (if frequency provided)
    if (frequency_mhz) {
      const wavelength = 299792458 / (frequency_mhz * 1e6);
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(96, 165, 250, 0.4)';
      ctx.lineWidth = 1;

      // Upper Fresnel
      for (let i = 0; i < distances.length; i++) {
        const d1 = distances[i];
        const d2 = maxDist - d1;
        if (d1 <= 0 || d2 <= 0) continue;
        const f1 = Math.sqrt(wavelength * d1 * d2 / (d1 + d2));
        const frac = d1 / maxDist;
        const losElev = (elevations[0] + height1_m) + frac * ((elevations[elevations.length - 1] + height2_m) - (elevations[0] + height1_m));
        const x = toX(d1);
        const y = toY(losElev + f1);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Lower Fresnel
      ctx.beginPath();
      for (let i = 0; i < distances.length; i++) {
        const d1 = distances[i];
        const d2 = maxDist - d1;
        if (d1 <= 0 || d2 <= 0) continue;
        const f1 = Math.sqrt(wavelength * d1 * d2 / (d1 + d2));
        const frac = d1 / maxDist;
        const losElev = (elevations[0] + height1_m) + frac * ((elevations[elevations.length - 1] + height2_m) - (elevations[0] + height1_m));
        const x = toX(d1);
        const y = toY(losElev - f1);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Observer & target markers
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(toX(0), obs_y, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    ctx.arc(toX(maxDist), tgt_y, 5, 0, Math.PI * 2);
    ctx.fill();

    // Obstruction marker
    if (los && !los.is_visible && los.obstruction_distance_m != null && los.obstruction_elevation_m != null) {
      const ox = toX(los.obstruction_distance_m);
      const oy = toY(los.obstruction_elevation_m);
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(ox, oy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ef4444';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('obstruction', ox, oy - 8);
    }

    // Hover crosshair
    if (hoverIdx !== null && hoverIdx >= 0 && hoverIdx < distances.length) {
      const hx = toX(distances[hoverIdx]);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hx, PAD.top);
      ctx.lineTo(hx, H - PAD.bottom);
      ctx.stroke();

      const elev = elevations[hoverIdx];
      ctx.fillStyle = '#fff';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(
        `${(distances[hoverIdx] / 1000).toFixed(2)}km  ${Math.round(elev)}m`,
        hx + 5,
        PAD.top + 15,
      );
    }

    // Title
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    const losLabel = los?.is_visible ? 'LOS: CLEAR' : 'LOS: BLOCKED';
    const losColor = los?.is_visible ? '#22c55e' : '#ef4444';
    ctx.fillText('Terrain Profile', PAD.left, 18);
    ctx.fillStyle = losColor;
    ctx.textAlign = 'right';
    ctx.fillText(losLabel, W - PAD.right, 18);

  }, [profile, los, hoverIdx, height1_m, height2_m, frequency_mhz]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!profile || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const PAD_LEFT = 60;
    const PAD_RIGHT = 20;
    const plotW = canvasRef.current.width - PAD_LEFT - PAD_RIGHT;
    const frac = (x - PAD_LEFT) / plotW;
    if (frac >= 0 && frac <= 1) {
      setHoverIdx(Math.round(frac * (profile.distances_m.length - 1)));
    } else {
      setHoverIdx(null);
    }
  };

  return (
    <div
      style={{
        background: '#111',
        border: '1px solid #333',
        borderRadius: 8,
        padding: 8,
        position: 'relative',
      }}
    >
      {onClose && (
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 4,
            right: 8,
            background: 'none',
            border: 'none',
            color: '#888',
            cursor: 'pointer',
            fontSize: 16,
          }}
        >
          x
        </button>
      )}

      {loading ? (
        <div style={{ color: '#888', textAlign: 'center', padding: 40 }}>
          Loading terrain profile...
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          width={700}
          height={300}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIdx(null)}
          style={{ width: '100%', cursor: 'crosshair' }}
        />
      )}

      {profile && (
        <div style={{ display: 'flex', gap: 16, padding: '4px 8px', fontSize: 11, color: '#aaa' }}>
          <span>Distance: {(profile.total_distance_m / 1000).toFixed(2)} km</span>
          <span>Min elev: {Math.round(Math.min(...profile.elevations_m))} m</span>
          <span>Max elev: {Math.round(Math.max(...profile.elevations_m))} m</span>
          {los && <span>LOS: {los.is_visible ? 'Clear' : 'Blocked'}</span>}
        </div>
      )}
    </div>
  );
};

export default TerrainProfileChart;
