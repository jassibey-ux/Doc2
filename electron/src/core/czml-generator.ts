/**
 * CZML Generator — Creates Cesium Language (CZML) documents from session data
 *
 * CZML is a JSON-based format for describing time-dynamic scenes in CesiumJS.
 * Generated files can be loaded directly into CesiumJS viewers, Cesium Ion Stories,
 * or converted for Google Earth.
 */

import type { TrackerPosition } from './mock-tracker-provider';
import type {
  TestSession,
  SiteDefinition,
  CUASPlacement,
  CUASProfile,
  Engagement,
  TestEvent,
} from './models/workflow';

export interface CZMLGeneratorInput {
  session: TestSession;
  telemetry: Map<string, TrackerPosition[]>;
  site?: SiteDefinition;
  cuasPlacements: CUASPlacement[];
  cuasProfiles: CUASProfile[];
}

// Track colors matching CesiumMap
const TRACK_COLORS = [
  [0, 200, 255, 255],   // #00c8ff
  [255, 107, 107, 255],  // #ff6b6b
  [78, 205, 196, 255],   // #4ecdc4
  [247, 220, 111, 255],  // #f7dc6f
  [187, 143, 206, 255],  // #bb8fce
  [88, 214, 141, 255],   // #58d68d
  [248, 181, 0, 255],    // #f8b500
  [93, 173, 226, 255],   // #5dade2
];

function toISOInterval(start: string, end: string): string {
  return `${start}/${end}`;
}

function rgbaToCesium(rgba: number[]): { rgba: number[] } {
  return { rgba };
}

/**
 * Generate a CZML document from session data.
 * Returns an array of CZML packets (the standard CZML format).
 */
export function generateCZML(input: CZMLGeneratorInput): object[] {
  const { session, telemetry, site, cuasPlacements, cuasProfiles } = input;
  const packets: object[] = [];

  const sessionStart = session.start_time || session.created_at;
  const sessionEnd = session.end_time || session.updated_at;

  // ── Document packet (clock) ──
  packets.push({
    id: 'document',
    name: session.name,
    version: '1.0',
    clock: {
      interval: toISOInterval(sessionStart, sessionEnd),
      currentTime: sessionStart,
      multiplier: 1,
      range: 'LOOP_STOP',
      step: 'SYSTEM_CLOCK_MULTIPLIER',
    },
  });

  // ── Drone tracks ──
  let colorIndex = 0;
  for (const [trackerId, positions] of telemetry) {
    if (positions.length < 2) continue;

    const color = TRACK_COLORS[colorIndex % TRACK_COLORS.length];
    colorIndex++;

    // Build sampled position (epoch + flat array of [time_offset, lon, lat, alt, ...])
    const epoch = positions[0].timestamp;
    const epochMs = new Date(epoch).getTime();
    const cartographicDegrees: number[] = [];

    for (const p of positions) {
      const offsetSec = (new Date(p.timestamp).getTime() - epochMs) / 1000;
      cartographicDegrees.push(offsetSec, p.longitude, p.latitude, p.altitude_m);
    }

    const firstPos = positions[0];
    const lastPos = positions[positions.length - 1];
    const availability = toISOInterval(firstPos.timestamp, lastPos.timestamp);

    packets.push({
      id: `drone-${trackerId}`,
      name: `Drone ${trackerId}`,
      availability,
      position: {
        epoch,
        cartographicDegrees,
        interpolationAlgorithm: 'LAGRANGE',
        interpolationDegree: 1,
      },
      point: {
        color: rgbaToCesium(color),
        pixelSize: 8,
        outlineColor: rgbaToCesium([255, 255, 255, 200]),
        outlineWidth: 1,
        heightReference: 'NONE',
      },
      path: {
        material: {
          solidColor: {
            color: rgbaToCesium(color),
          },
        },
        width: 2,
        leadTime: 0,
        trailTime: 600,
        resolution: 1,
      },
      label: {
        text: trackerId,
        font: '11px monospace',
        fillColor: rgbaToCesium([255, 255, 255, 255]),
        outlineColor: rgbaToCesium([0, 0, 0, 255]),
        outlineWidth: 2,
        style: 'FILL_AND_OUTLINE',
        verticalOrigin: 'BOTTOM',
        pixelOffset: { cartesian2: [0, -12] },
      },
    });
  }

  // ── CUAS placements ──
  for (const placement of cuasPlacements) {
    const profile = cuasProfiles.find(p => p.id === placement.cuas_profile_id);
    const range = profile?.effective_range_m || 500;
    const name = profile?.name || 'CUAS';

    packets.push({
      id: `cuas-${placement.id}`,
      name,
      position: {
        cartographicDegrees: [
          placement.position.lon,
          placement.position.lat,
          (placement.position.alt_m || 0) + placement.height_agl_m,
        ],
      },
      cylinder: {
        length: range * 2,
        topRadius: range,
        bottomRadius: 0,
        material: {
          solidColor: {
            color: rgbaToCesium([249, 115, 22, 30]),
          },
        },
        outline: true,
        outlineColor: rgbaToCesium([249, 115, 22, 120]),
        numberOfVerticalLines: 0,
      },
      point: {
        color: rgbaToCesium([249, 115, 22, 230]),
        pixelSize: 12,
        outlineColor: rgbaToCesium([0, 0, 0, 255]),
        outlineWidth: 2,
      },
      label: {
        text: name,
        font: '12px monospace',
        fillColor: rgbaToCesium([249, 115, 22, 255]),
        outlineColor: rgbaToCesium([0, 0, 0, 255]),
        outlineWidth: 2,
        style: 'FILL_AND_OUTLINE',
        verticalOrigin: 'BOTTOM',
        pixelOffset: { cartesian2: [0, -16] },
      },
    });
  }

  // ── Engagement lines ──
  const engagements = session.engagements || [];
  for (const eng of engagements) {
    if (!eng.engage_timestamp) continue;

    const engStart = eng.engage_timestamp;
    const engEnd = eng.disengage_timestamp || sessionEnd;
    const availability = toISOInterval(engStart, engEnd);

    const placement = cuasPlacements.find(p => p.id === eng.cuas_placement_id);
    if (!placement) continue;

    const cuasLon = eng.cuas_lon ?? placement.position.lon;
    const cuasLat = eng.cuas_lat ?? placement.position.lat;
    const cuasAlt = (eng.cuas_alt_m ?? placement.height_agl_m) + 2;

    for (const target of eng.targets || []) {
      if (target.drone_lat == null || target.drone_lon == null) continue;

      const droneAlt = target.initial_altitude_m || 50;

      // Engagement line with time-availability
      packets.push({
        id: `engagement-${eng.id}-${target.tracker_id}`,
        name: `Engagement: ${eng.name || eng.id}`,
        availability,
        polyline: {
          positions: {
            cartographicDegrees: [
              cuasLon, cuasLat, cuasAlt,
              target.drone_lon, target.drone_lat, droneAlt,
            ],
          },
          material: {
            solidColor: {
              color: rgbaToCesium([239, 68, 68, 200]),
            },
          },
          width: 2,
        },
      });
    }
  }

  // ── Session events as billboard markers ──
  const events = session.events || [];
  for (const event of events) {
    const eventColor = getEventColor(event.type);
    const label = event.type.replace(/_/g, ' ').toUpperCase();

    packets.push({
      id: `event-${event.id}`,
      name: `${label}${event.note ? ': ' + event.note : ''}`,
      availability: toISOInterval(event.timestamp, event.timestamp),
      label: {
        text: label,
        font: 'bold 10px monospace',
        fillColor: rgbaToCesium(eventColor),
        outlineColor: rgbaToCesium([0, 0, 0, 255]),
        outlineWidth: 2,
        style: 'FILL_AND_OUTLINE',
        showBackground: true,
        backgroundColor: rgbaToCesium([0, 0, 0, 180]),
        verticalOrigin: 'BOTTOM',
        pixelOffset: { cartesian2: [0, -24] },
      },
    });

    // If event references a tracker, try to place it at tracker position
    if (event.tracker_id) {
      const positions = telemetry.get(event.tracker_id);
      if (positions) {
        const eventTime = new Date(event.timestamp).getTime();
        const nearest = positions.reduce((best, p) => {
          const dt = Math.abs(new Date(p.timestamp).getTime() - eventTime);
          const bestDt = Math.abs(new Date(best.timestamp).getTime() - eventTime);
          return dt < bestDt ? p : best;
        });

        (packets[packets.length - 1] as any).position = {
          cartographicDegrees: [
            nearest.longitude,
            nearest.latitude,
            nearest.altitude_m + 10,
          ],
        };
      }
    }
  }

  // ── Site boundary polygon ──
  if (site?.boundary_polygon && site.boundary_polygon.length >= 3) {
    const boundaryCoords: number[] = [];
    for (const p of site.boundary_polygon) {
      boundaryCoords.push(p.lon, p.lat, 0);
    }
    // Close the ring
    boundaryCoords.push(
      site.boundary_polygon[0].lon,
      site.boundary_polygon[0].lat,
      0,
    );

    packets.push({
      id: 'site-boundary',
      name: site.name,
      polygon: {
        positions: {
          cartographicDegrees: boundaryCoords,
        },
        material: {
          solidColor: {
            color: rgbaToCesium([255, 140, 0, 25]),
          },
        },
        outline: true,
        outlineColor: rgbaToCesium([255, 140, 0, 200]),
        height: 0,
      },
    });
  }

  return packets;
}

function getEventColor(type: string): number[] {
  switch (type) {
    case 'jam_on': return [239, 68, 68, 255];
    case 'jam_off': return [249, 115, 22, 255];
    case 'engage': return [6, 182, 212, 255];
    case 'disengage': return [139, 92, 246, 255];
    case 'launch': return [34, 197, 94, 255];
    case 'recover': return [59, 130, 246, 255];
    case 'failsafe': return [234, 179, 8, 255];
    case 'gps_lost': return [220, 38, 38, 255];
    case 'gps_acquired': return [22, 163, 74, 255];
    default: return [255, 255, 255, 200];
  }
}
