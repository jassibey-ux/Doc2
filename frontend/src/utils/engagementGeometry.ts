/**
 * Shared Engagement Geometry Module
 * Computes engagement line geometries (CUAS→drone) and converts them to GeoJSON
 * for rendering on Map.tsx, Map3DViewer.tsx, and CesiumMap.tsx.
 */

import type { Engagement, JamBurst, CUASPlacement } from '../types/workflow';
import type { DroneSummary } from '../types/drone';
import {
  haversineDistance,
  slantRange,
  bearing,
  midpoint,
  formatDistance,
  formatBearing,
} from './geo';

// 8-color palette for multi-engagement deconfliction
const ENGAGEMENT_COLORS = [
  '#06b6d4', // cyan
  '#8b5cf6', // purple
  '#f59e0b', // amber
  '#10b981', // emerald
  '#ec4899', // pink
  '#3b82f6', // blue
  '#f97316', // orange
  '#14b8a6', // teal
];

export interface EngagementLineGeometry {
  engagementId: string;
  trackerId: string;
  emitterLat: number;
  emitterLon: number;
  emitterAlt: number;
  droneLat: number;
  droneLon: number;
  droneAlt: number;
  horizontalRangeM: number;
  slantRangeM: number;
  bearingDeg: number;
  altitudeDeltaM: number;
  midpoint: { lat: number; lon: number };
  isJamming: boolean;
  lineColor: string;
  distanceLabel: string;
  engagementIndex: number;
  cuasName: string;
  engageTimestamp?: string;
}

/**
 * Compute engagement line geometries from live state.
 * Works identically for all 3 map components.
 */
export function computeEngagementGeometries(
  activeEngagements: Engagement[] | undefined,
  activeBursts: Map<string, JamBurst> | undefined,
  cuasPlacements: CUASPlacement[],
  drones: Map<string, DroneSummary>,
): EngagementLineGeometry[] {
  if (!activeEngagements || activeEngagements.length === 0) return [];

  const geometries: EngagementLineGeometry[] = [];
  let engIdx = 0;

  for (const eng of activeEngagements) {
    if (eng.status !== 'active') continue;

    const activeBurst = activeBursts?.get(eng.id);
    const isJamming = !!activeBurst;

    // Resolve emitter position: burst snapshot → engagement snapshot → placement lookup
    let emitterLat = eng.cuas_lat;
    let emitterLon = eng.cuas_lon;
    const emitterAlt = eng.cuas_alt_m ?? 0;

    if (isJamming && activeBurst.emitter_lat != null && activeBurst.emitter_lon != null) {
      emitterLat = activeBurst.emitter_lat;
      emitterLon = activeBurst.emitter_lon;
    }

    if (emitterLat == null || emitterLon == null) {
      const placement = cuasPlacements.find(p => p.id === eng.cuas_placement_id);
      if (!placement) continue;
      emitterLat = placement.position.lat;
      emitterLon = placement.position.lon;
    }

    for (const target of (eng.targets ?? [])) {
      const drone = drones.get(target.tracker_id);
      if (!drone || drone.lat == null || drone.lon == null) continue;

      const droneLat = drone.lat;
      const droneLon = drone.lon!;
      const droneAlt = drone.alt_m ?? 0;

      const hRange = haversineDistance(emitterLat, emitterLon, droneLat, droneLon);
      const sRange = slantRange(emitterLat, emitterLon, emitterAlt, droneLat, droneLon, droneAlt);
      const brg = bearing(emitterLat, emitterLon, droneLat, droneLon);
      const mid = midpoint(emitterLat, emitterLon, droneLat, droneLon);
      const altDelta = droneAlt - emitterAlt;

      // Line color: red when jamming, otherwise GPS-health-based
      let lineColor: string;
      if (isJamming) {
        lineColor = '#ef4444';
      } else {
        const gpsHealth = drone.gps_health?.health_status ?? 'healthy';
        lineColor = gpsHealth === 'healthy' ? '#22c55e' : gpsHealth === 'degraded' ? '#eab308' : '#ef4444';
      }

      // Build label with elapsed timer
      let label = `${formatDistance(hRange)} | ${formatBearing(brg)}`;
      if (eng.engage_timestamp) {
        const elapsedMs = Date.now() - new Date(eng.engage_timestamp).getTime();
        const elapsedSec = Math.max(0, Math.floor(elapsedMs / 1000));
        const m = Math.floor(elapsedSec / 60);
        const s = elapsedSec % 60;
        label += ` | ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      }

      geometries.push({
        engagementId: eng.id,
        trackerId: target.tracker_id,
        emitterLat,
        emitterLon,
        emitterAlt,
        droneLat,
        droneLon,
        droneAlt,
        horizontalRangeM: hRange,
        slantRangeM: sRange,
        bearingDeg: brg,
        altitudeDeltaM: altDelta,
        midpoint: mid,
        isJamming,
        lineColor,
        distanceLabel: label,
        engagementIndex: engIdx,
        cuasName: eng.cuas_name ?? eng.name ?? 'CUAS',
        engageTimestamp: eng.engage_timestamp ?? undefined,
      });
    }

    engIdx++;
  }

  return geometries;
}

/**
 * Get a unique per-engagement color from the palette.
 */
export function engagementColor(index: number): string {
  return ENGAGEMENT_COLORS[index % ENGAGEMENT_COLORS.length];
}

/**
 * Convert engagement geometries to GeoJSON FeatureCollection
 * (LineString for lines + Point for midpoint labels).
 * Compatible with MapLibre GL sources.
 */
export function engagementGeometriesToGeoJSON(
  geometries: EngagementLineGeometry[],
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  for (const g of geometries) {
    // Line feature
    features.push({
      type: 'Feature',
      properties: {
        color: g.lineColor,
        rangeM: Math.round(g.horizontalRangeM),
        trackerId: g.trackerId,
        engagementId: g.engagementId,
        type: 'line',
        isJamming: g.isJamming,
        engagementIndex: g.engagementIndex,
        cuasName: g.cuasName,
        bearingDeg: Math.round(g.bearingDeg),
        slantRangeM: Math.round(g.slantRangeM),
        altitudeDeltaM: Math.round(g.altitudeDeltaM),
        engageTimestamp: g.engageTimestamp ?? null,
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [g.emitterLon, g.emitterLat],
          [g.droneLon, g.droneLat],
        ],
      },
    });

    // Midpoint label feature
    features.push({
      type: 'Feature',
      properties: {
        label: g.distanceLabel,
        type: 'label',
        isJamming: g.isJamming,
        engagementId: g.engagementId,
        trackerId: g.trackerId,
        engagementIndex: g.engagementIndex,
        cuasName: g.cuasName,
        rangeM: Math.round(g.horizontalRangeM),
        bearingDeg: Math.round(g.bearingDeg),
        slantRangeM: Math.round(g.slantRangeM),
        altitudeDeltaM: Math.round(g.altitudeDeltaM),
        engageTimestamp: g.engageTimestamp ?? null,
      },
      geometry: {
        type: 'Point',
        coordinates: [g.midpoint.lon, g.midpoint.lat],
      },
    });
  }

  return { type: 'FeatureCollection', features };
}
