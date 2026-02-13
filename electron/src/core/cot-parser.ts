/**
 * CoT (Cursor on Target) XML Parser
 * Parses standard CoT XML event messages into typed CotEvent objects.
 * Supports MIL-STD-2525C symbology type codes for UAS classification.
 */

import log from 'electron-log';

// =============================================================================
// CoT Event Types
// =============================================================================

export interface CotEvent {
  uid: string;
  type: string;
  lat: number;
  lon: number;
  alt_m: number | null;
  course_deg: number | null;
  speed_mps: number | null;
  timestamp: string;           // ISO 8601 timestamp (from "time" attribute)
  start_time: string | null;   // "start" attribute
  stale_time: string | null;   // "stale" attribute
  how: string | null;          // How the event was generated (e.g. "m-g" = machine GPS)
  detail_raw: string | null;   // Raw <detail> XML for passthrough
  ce: number | null;           // Circular error (meters)
  le: number | null;           // Linear error (meters)
  hae: number | null;          // Height above ellipsoid (meters)
}

/**
 * Decoded 2525C type affiliation
 */
export type CotAffiliation = 'friendly' | 'hostile' | 'unknown' | 'neutral' | 'other';

/**
 * Mapping of CoT type prefix patterns to affiliations.
 * Standard CoT type format: a-<affiliation>-<battle_dimension>-<function>
 *   Affiliation: f=friendly, h=hostile, u=unknown, n=neutral
 *   Battle dimension: A=air, G=ground, S=sea, etc.
 *
 * MIL-STD-2525C hierarchy:
 *   a-f-A = friendly air
 *   a-h-A = hostile air
 *   a-u-A = unknown air
 *   a-n-A = neutral air
 *   a-f-A-M-F-Q = friendly air, military, fixed wing, UAV
 */
const AFFILIATION_MAP: Record<string, CotAffiliation> = {
  'f': 'friendly',
  'h': 'hostile',
  'u': 'unknown',
  'n': 'neutral',
  'a': 'other',     // assumed friendly (pending)
  'j': 'other',     // joker
  'k': 'other',     // faker
  'o': 'other',     // none specified
  'p': 'other',     // pending
  's': 'other',     // suspect
};

// =============================================================================
// XML Parsing Utilities
// =============================================================================

/**
 * Extract an XML attribute value from a tag string.
 * Simple regex-based extraction; avoids heavy XML parser dependency.
 */
function extractAttr(xml: string, tagName: string, attrName: string): string | null {
  // Match the opening tag of tagName
  const tagPattern = new RegExp(`<${tagName}[\\s][^>]*${attrName}\\s*=\\s*"([^"]*)"`, 'i');
  const match = xml.match(tagPattern);
  return match ? match[1] : null;
}

/**
 * Extract a self-closing tag's attribute from XML.
 */
function extractSelfClosingAttr(xml: string, tagName: string, attrName: string): string | null {
  const tagPattern = new RegExp(`<${tagName}[\\s][^>]*${attrName}\\s*=\\s*"([^"]*)"[^>]*/?>`, 'i');
  const match = xml.match(tagPattern);
  return match ? match[1] : null;
}

/**
 * Extract the inner content of an XML element.
 */
function extractInnerXml(xml: string, tagName: string): string | null {
  const pattern = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'i');
  const match = xml.match(pattern);
  return match ? match[1].trim() : null;
}

/**
 * Extract the full element including open/close tags.
 */
function extractElement(xml: string, tagName: string): string | null {
  // Check for self-closing tag first
  const selfClosing = new RegExp(`<${tagName}[^>]*/\\s*>`, 'i');
  const selfMatch = xml.match(selfClosing);
  if (selfMatch) return selfMatch[0];

  // Check for open/close
  const pattern = new RegExp(`<${tagName}[^>]*>[\\s\\S]*?</${tagName}>`, 'i');
  const match = xml.match(pattern);
  return match ? match[0] : null;
}

/**
 * Parse an ISO datetime or CoT datetime into an ISO string.
 * CoT often uses the format: 2024-01-15T12:00:00Z or 2024-01-15T12:00:00.000Z
 */
function parseCotTime(timeStr: string | null): string | null {
  if (!timeStr) return null;
  try {
    const d = new Date(timeStr);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

function parseFloat2(value: string | null): number | null {
  if (!value) return null;
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}

// =============================================================================
// CoT Parser
// =============================================================================

/**
 * Parse a single CoT XML event message into a CotEvent.
 * Returns null if the XML cannot be parsed.
 *
 * Example CoT XML:
 * <event version="2.0" uid="drone-01" type="a-f-A-M-F-Q"
 *        time="2024-01-15T12:00:00Z" start="2024-01-15T12:00:00Z"
 *        stale="2024-01-15T12:01:00Z" how="m-g">
 *   <point lat="51.5074" lon="-0.1278" hae="100.0" ce="10.0" le="5.0"/>
 *   <detail>
 *     <track course="180.0" speed="15.5"/>
 *     <__group name="Blue" role="Team Member"/>
 *   </detail>
 * </event>
 */
export function parseCotXml(xml: string): CotEvent | null {
  try {
    // Trim and ensure we have something
    xml = xml.trim();
    if (!xml.startsWith('<event') && !xml.startsWith('<?xml')) {
      return null;
    }

    // Strip XML declaration if present
    xml = xml.replace(/<\?xml[^?]*\?>\s*/, '');

    // Extract event attributes
    const uid = extractAttr(xml, 'event', 'uid');
    const type = extractAttr(xml, 'event', 'type');
    const time = extractAttr(xml, 'event', 'time');
    const start = extractAttr(xml, 'event', 'start');
    const stale = extractAttr(xml, 'event', 'stale');
    const how = extractAttr(xml, 'event', 'how');

    if (!uid || !type) {
      log.warn('[CoT] Missing required uid or type in event');
      return null;
    }

    // Extract point attributes
    const lat = parseFloat2(extractSelfClosingAttr(xml, 'point', 'lat'));
    const lon = parseFloat2(extractSelfClosingAttr(xml, 'point', 'lon'));
    const hae = parseFloat2(extractSelfClosingAttr(xml, 'point', 'hae'));
    const ce = parseFloat2(extractSelfClosingAttr(xml, 'point', 'ce'));
    const le = parseFloat2(extractSelfClosingAttr(xml, 'point', 'le'));

    if (lat === null || lon === null) {
      log.warn(`[CoT] Missing lat/lon in event uid=${uid}`);
      return null;
    }

    // Extract track attributes from <detail><track .../></detail>
    const course = parseFloat2(extractSelfClosingAttr(xml, 'track', 'course'));
    const speed = parseFloat2(extractSelfClosingAttr(xml, 'track', 'speed'));

    // Extract raw detail XML for passthrough
    const detailRaw = extractElement(xml, 'detail');

    // Parse timestamp
    const timestamp = parseCotTime(time) || new Date().toISOString();

    return {
      uid,
      type,
      lat,
      lon,
      alt_m: hae,
      course_deg: course,
      speed_mps: speed,
      timestamp,
      start_time: parseCotTime(start),
      stale_time: parseCotTime(stale),
      how,
      detail_raw: detailRaw,
      ce,
      le,
      hae,
    };
  } catch (error) {
    log.error('[CoT] Failed to parse XML:', error);
    return null;
  }
}

/**
 * Parse multiple CoT events from a buffer that may contain several
 * concatenated <event>...</event> messages (common with UDP aggregation).
 */
export function parseCotBuffer(buffer: string): CotEvent[] {
  const events: CotEvent[] = [];

  // Match all <event ...>...</event> blocks
  const eventPattern = /<event[\s\S]*?<\/event>/gi;
  let match: RegExpExecArray | null;

  while ((match = eventPattern.exec(buffer)) !== null) {
    const event = parseCotXml(match[0]);
    if (event) {
      events.push(event);
    }
  }

  return events;
}

/**
 * Determine the IFF affiliation from a CoT type string.
 * CoT types follow: a-<affiliation>-<dimension>-...
 */
export function getCotAffiliation(cotType: string): CotAffiliation {
  if (!cotType) return 'unknown';

  // Atom types start with "a-"
  if (cotType.startsWith('a-')) {
    const parts = cotType.split('-');
    if (parts.length >= 2) {
      const affiliationCode = parts[1].toLowerCase();
      return AFFILIATION_MAP[affiliationCode] || 'unknown';
    }
  }

  // Non-atom types (b=bits, t=tasking, etc.) default to unknown
  return 'unknown';
}

/**
 * Check if a CoT type represents an airborne platform.
 * Air dimension = "A" in position 3 of the type string: a-X-A-...
 */
export function isCotAirborne(cotType: string): boolean {
  if (!cotType) return false;
  const parts = cotType.split('-');
  // a-<affiliation>-<dimension>
  return parts.length >= 3 && parts[2].toUpperCase() === 'A';
}

/**
 * Check if a CoT type represents a UAS/UAV specifically.
 * Standard: a-X-A-M-F-Q (air, military, fixed wing, UAV)
 * Also matches: a-X-A-M-H-Q (air, military, rotary wing, UAV)
 * And generic: a-X-A-C-F-q (air, civilian, fixed wing, UAV)
 */
export function isCotUAS(cotType: string): boolean {
  if (!cotType) return false;
  const upper = cotType.toUpperCase();
  // Check for UAV function code (Q) anywhere in an airborne type
  const parts = upper.split('-');
  if (parts.length < 3) return false;
  if (parts[2] !== 'A') return false; // Must be air
  // Check for Q (UAV) in remaining parts
  return parts.slice(3).includes('Q');
}

/**
 * Get a human-readable description of a CoT type.
 */
export function describeCotType(cotType: string): string {
  if (!cotType) return 'Unknown';

  const parts = cotType.toLowerCase().split('-');
  if (parts[0] !== 'a' || parts.length < 3) return cotType;

  const affiliation = AFFILIATION_MAP[parts[1]] || 'unknown';
  const dimension = {
    'a': 'Air',
    'g': 'Ground',
    's': 'Sea Surface',
    'u': 'Subsurface',
    'p': 'Space',
  }[parts[2]] || parts[2];

  let desc = `${affiliation} ${dimension}`;

  if (parts.length >= 4) {
    const category = {
      'm': 'Military',
      'c': 'Civilian',
      'w': 'Weapon',
    }[parts[3]];
    if (category) desc += ` ${category}`;
  }

  if (isCotUAS(cotType)) {
    desc += ' UAV';
  }

  return desc;
}
