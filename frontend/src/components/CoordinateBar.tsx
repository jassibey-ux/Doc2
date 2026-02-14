/**
 * CoordinateBar
 * Displays cursor position in lat/lon (decimal degrees) and MGRS format.
 * Sits at the bottom of the map, left of drone count.
 */

import { forward as mgrsForward } from 'mgrs';

interface CoordinateBarProps {
  lat: number | null;
  lon: number | null;
}

export default function CoordinateBar({ lat, lon }: CoordinateBarProps) {
  if (lat === null || lon === null) return null;

  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  const latStr = `${Math.abs(lat).toFixed(4)}\u00B0 ${latDir}`;
  const lonStr = `${Math.abs(lon).toFixed(4)}\u00B0 ${lonDir}`;

  let mgrsStr = '';
  try {
    // mgrs.forward expects [lon, lat], precision 5 = 1m
    mgrsStr = mgrsForward([lon, lat], 5);
  } catch {
    mgrsStr = '--';
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '0 10px',
        fontSize: '11px',
        fontFamily: 'monospace',
        color: 'rgba(255,255,255,0.8)',
        background: 'rgba(15,15,30,0.7)',
        borderRadius: '4px',
        whiteSpace: 'nowrap',
        userSelect: 'all',
        height: '28px',
      }}
    >
      <span>{latStr}</span>
      <span>{lonStr}</span>
      <span style={{ color: 'rgba(255,255,255,0.3)' }}>|</span>
      <span style={{ color: '#60a5fa' }}>{mgrsStr}</span>
    </div>
  );
}
