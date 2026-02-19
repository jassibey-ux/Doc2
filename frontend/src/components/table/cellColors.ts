/**
 * 3-tier discrete cell colors for telemetry diagnostic columns.
 * Returns [background, text] color pairs for table cells.
 */

type ColorPair = { bg: string; text: string };

const GREEN: ColorPair = { bg: 'rgba(34,197,94,0.12)', text: '#4ade80' };
const YELLOW: ColorPair = { bg: 'rgba(234,179,8,0.12)', text: '#facc15' };
const RED: ColorPair = { bg: 'rgba(239,68,68,0.12)', text: '#f87171' };
const NEUTRAL: ColorPair = { bg: 'transparent', text: '' };

export function satelliteColor(sats: number | null): ColorPair {
  if (sats == null) return NEUTRAL;
  if (sats >= 8) return GREEN;
  if (sats >= 4) return YELLOW;
  return RED;
}

export function hdopColor(hdop: number | null): ColorPair {
  if (hdop == null) return NEUTRAL;
  if (hdop < 2) return GREEN;
  if (hdop <= 5) return YELLOW;
  return RED;
}

export function rssiColor(rssi: number | null): ColorPair {
  if (rssi == null) return NEUTRAL;
  if (rssi > -70) return GREEN;
  if (rssi >= -90) return YELLOW;
  return RED;
}

export function batteryColor(mv: number | null): ColorPair {
  if (mv == null) return NEUTRAL;
  if (mv > 3700) return GREEN;
  if (mv >= 3400) return YELLOW;
  return RED;
}

export function fixColor(valid: boolean): ColorPair {
  return valid ? GREEN : RED;
}

export function qualityColor(quality: string | null): ColorPair {
  if (!quality) return NEUTRAL;
  switch (quality) {
    case 'good':
    case 'healthy': return GREEN;
    case 'degraded': return YELLOW;
    case 'poor':
    case 'lost': return RED;
    default: return NEUTRAL;
  }
}
