/**
 * GeoJSON Generator — Creates RFC 7946 GeoJSON FeatureCollections from session data
 *
 * Produces the following feature layers:
 * - drone_track: LineString per tracker (flight path)
 * - cuas_placement: Point per CUAS system
 * - cuas_coverage: Polygon per CUAS coverage area (circle approximation)
 * - engagement_line: LineString from CUAS to target drone
 * - site_boundary: Polygon of site perimeter
 * - site_zone: Polygon per defined zone (jammer_zone, approach_corridor, etc.)
 * - site_marker: Point per site marker (command_post, launch_point, etc.)
 * - asset_placement: Point per vehicle/equipment placement
 * - session_metadata: Point at site center with session summary properties
 */

import type { TrackerPosition } from './mock-tracker-provider';
import type {
  TestSession,
  SiteDefinition,
  CUASProfile,
  AssetPlacement,
} from './models/workflow';

export interface GeoJSONGeneratorInput {
  session: TestSession;
  positionsByTracker: Map<string, TrackerPosition[]>;
  site?: SiteDefinition;
  cuasProfiles: Map<string, CUASProfile>;
}

interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: string;
    coordinates: any;
  };
  properties: Record<string, unknown>;
}

interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

/**
 * Generate a GeoJSON FeatureCollection from session data.
 */
export function generateGeoJSON(input: GeoJSONGeneratorInput): GeoJSONFeatureCollection {
  const { session, positionsByTracker, site, cuasProfiles } = input;
  const features: GeoJSONFeature[] = [];

  // --- Drone tracks (LineString per tracker) ---
  for (const [trackerId, positions] of positionsByTracker) {
    if (positions.length < 2) continue;

    const coordinates = positions.map(p => [p.longitude, p.latitude, p.altitude_m]);
    const speeds = positions.map(p => p.speed_ms).filter(s => s != null);
    const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;

    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates },
      properties: {
        feature_type: 'drone_track',
        tracker_id: trackerId,
        point_count: positions.length,
        start_time: positions[0].timestamp,
        end_time: positions[positions.length - 1].timestamp,
        avg_speed_mps: Math.round(avgSpeed * 100) / 100,
      },
    });
  }

  // --- CUAS placements (Point + coverage Polygon) ---
  const cuasPlacements = session.cuas_placements || [];
  for (const placement of cuasPlacements) {
    const profile = cuasProfiles.get(placement.cuas_profile_id);
    const range = profile?.effective_range_m || 0;

    // CUAS Point
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [placement.position.lon, placement.position.lat, placement.position.alt_m || 0],
      },
      properties: {
        feature_type: 'cuas_placement',
        cuas_name: profile?.name || 'Unknown CUAS',
        cuas_vendor: profile?.vendor || '',
        cuas_type: profile?.type || '',
        orientation_deg: placement.orientation_deg,
        effective_range_m: range,
        height_agl_m: placement.height_agl_m,
        active: placement.active,
      },
    });

    // CUAS coverage polygon (36-point circle approximation)
    if (range > 0) {
      const coverageCoords: number[][] = [];
      for (let i = 0; i <= 36; i++) {
        const angle = (i % 36) * (2 * Math.PI / 36);
        const dLat = (range * Math.cos(angle)) / 111320;
        const dLon = (range * Math.sin(angle)) / (111320 * Math.cos(placement.position.lat * Math.PI / 180));
        coverageCoords.push([
          placement.position.lon + dLon,
          placement.position.lat + dLat,
        ]);
      }

      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [coverageCoords] },
        properties: {
          feature_type: 'cuas_coverage',
          cuas_name: profile?.name || 'Unknown CUAS',
          range_m: range,
          antenna_pattern: profile?.antenna_pattern || 'omni',
        },
      });
    }
  }

  // --- Engagement lines (LineString from CUAS to target) ---
  const engagements = session.engagements || [];
  for (const eng of engagements) {
    const placement = cuasPlacements.find(p => p.id === eng.cuas_placement_id);
    if (!placement) continue;

    const engProfile = cuasProfiles.get(placement.cuas_profile_id);

    for (const target of eng.targets || []) {
      const cuasLon = eng.cuas_lon ?? placement.position.lon;
      const cuasLat = eng.cuas_lat ?? placement.position.lat;
      const droneLat = target.drone_lat;
      const droneLon = target.drone_lon;

      if (droneLat == null || droneLon == null) continue;

      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [cuasLon, cuasLat],
            [droneLon, droneLat],
          ],
        },
        properties: {
          feature_type: 'engagement_line',
          engagement_id: eng.id,
          cuas_name: engProfile?.name || 'CUAS',
          target_tracker_id: target.tracker_id,
          range_m: target.initial_range_m,
          bearing_deg: target.initial_bearing_deg,
          engage_timestamp: eng.engage_timestamp,
          disengage_timestamp: eng.disengage_timestamp,
          pass_fail: eng.metrics?.pass_fail,
        },
      });
    }
  }

  // --- Site boundary (Polygon) ---
  if (site && site.boundary_polygon && site.boundary_polygon.length >= 3) {
    const boundaryCoords = site.boundary_polygon.map(p => [p.lon, p.lat]);
    boundaryCoords.push(boundaryCoords[0]); // Close ring

    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [boundaryCoords] },
      properties: {
        feature_type: 'site_boundary',
        site_name: site.name,
        environment_type: site.environment_type,
      },
    });
  }

  // --- Site zones (Polygon per zone) ---
  if (site?.zones) {
    for (const zone of site.zones) {
      if (!zone.polygon || zone.polygon.length < 3) continue;

      const zoneCoords = zone.polygon.map(p => [p.lon, p.lat]);
      zoneCoords.push(zoneCoords[0]); // Close ring

      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [zoneCoords] },
        properties: {
          feature_type: 'site_zone',
          zone_name: zone.name,
          zone_type: zone.type,
          color: zone.color,
          opacity: zone.opacity,
          notes: zone.notes,
        },
      });
    }
  }

  // --- Site markers (Point per marker) ---
  if (site?.markers) {
    for (const marker of site.markers) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [marker.position.lon, marker.position.lat, marker.position.alt_m || 0],
        },
        properties: {
          feature_type: 'site_marker',
          marker_name: marker.name,
          marker_type: marker.type,
          notes: marker.notes,
        },
      });
    }
  }

  // --- Asset placements (Point per vehicle/equipment) ---
  const assetPlacements: AssetPlacement[] = session.asset_placements || [];
  for (const asset of assetPlacements) {
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [asset.position.lon, asset.position.lat, asset.position.alt_m || 0],
      },
      properties: {
        feature_type: 'asset_placement',
        asset_type: asset.asset_type,
        label: asset.label,
        model_id: asset.model_id,
        orientation_deg: asset.orientation_deg,
        notes: asset.notes,
      },
    });
  }

  // --- Session metadata (Point at site center) ---
  const centerLat = site?.center?.lat;
  const centerLon = site?.center?.lon;
  if (centerLat != null && centerLon != null) {
    let totalPositions = 0;
    for (const positions of positionsByTracker.values()) {
      totalPositions += positions.length;
    }

    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [centerLon, centerLat],
      },
      properties: {
        feature_type: 'session_metadata',
        session_id: session.id,
        session_name: session.name,
        site_name: site?.name,
        status: session.status,
        start_time: session.start_time,
        end_time: session.end_time,
        duration_seconds: session.duration_seconds,
        tracker_count: positionsByTracker.size,
        total_positions: totalPositions,
        cuas_count: cuasPlacements.length,
        engagement_count: engagements.length,
        operator_name: session.operator_name,
        weather_notes: session.weather_notes,
      },
    });
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}
