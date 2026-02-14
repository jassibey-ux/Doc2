/**
 * CoT (Cursor-on-Target) UDP Broadcaster
 *
 * Broadcasts operator position as CoT XML over UDP multicast.
 * This allows the main dashboard's cot-listener to pick up mobile positions
 * without requiring REST connectivity (works on local LAN).
 *
 * NOTE: React Native does not natively support UDP multicast.
 * This module provides the CoT XML generation. Actual UDP sending requires
 * a native module (e.g., react-native-udp) which must be added separately.
 * For now, positions are sent via REST API as the primary transport.
 */

export interface CotPosition {
  uid: string;
  callsign: string;
  lat: number;
  lon: number;
  alt_m: number;
  heading_deg?: number;
  speed_mps?: number;
  ce?: number; // circular error (GPS accuracy)
}

const COT_MULTICAST_GROUP = '239.2.3.1';
const COT_PORT = 6969;

/** Generate a CoT XML event for an operator position. */
export function generateCotXml(position: CotPosition): string {
  const now = new Date();
  const stale = new Date(now.getTime() + 30000); // 30s stale
  const time = now.toISOString();
  const staleTime = stale.toISOString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<event version="2.0" uid="${escapeXml(position.uid)}" type="a-f-G-U-C" time="${time}" start="${time}" stale="${staleTime}" how="m-g">
  <point lat="${position.lat}" lon="${position.lon}" hae="${position.alt_m || 0}" ce="${position.ce || 9999999}" le="9999999" />
  <detail>
    <contact callsign="${escapeXml(position.callsign)}" />
    <track course="${position.heading_deg ?? 0}" speed="${position.speed_mps ?? 0}" />
    <__group name="Cyan" role="Team Member" />
    <precisionlocation geopointsrc="GPS" altsrc="GPS" />
  </detail>
</event>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Get the multicast config for reference. */
export function getCotConfig() {
  return { multicastGroup: COT_MULTICAST_GROUP, port: COT_PORT };
}
