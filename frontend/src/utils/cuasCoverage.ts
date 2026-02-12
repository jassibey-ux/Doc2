/**
 * CUAS Coverage Geometry Utilities
 * Generates GeoJSON polygons for visualizing CUAS coverage zones on the map
 */

import type { CUASProfile, CUASPlacement } from '../types/workflow';

// GeoJSON types
interface GeoJSONFeature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: {
    type: 'Polygon' | 'Point';
    coordinates: number[][] | number[][][] | number[];
  };
}

interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Convert radians to degrees
 */
function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/**
 * Calculate a destination point given start point, bearing, and distance
 * Uses the haversine formula
 *
 * @param lat - Latitude in degrees
 * @param lon - Longitude in degrees
 * @param bearing - Bearing in degrees (0 = North, 90 = East)
 * @param distanceMeters - Distance in meters
 * @returns [lon, lat] for GeoJSON (note: lon first!)
 */
function destinationPoint(
  lat: number,
  lon: number,
  bearing: number,
  distanceMeters: number
): [number, number] {
  const earthRadius = 6371000; // meters
  const angularDistance = distanceMeters / earthRadius;
  const bearingRad = toRadians(bearing);
  const latRad = toRadians(lat);
  const lonRad = toRadians(lon);

  const destLatRad = Math.asin(
    Math.sin(latRad) * Math.cos(angularDistance) +
      Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearingRad)
  );

  const destLonRad =
    lonRad +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(latRad),
      Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(destLatRad)
    );

  return [toDegrees(destLonRad), toDegrees(destLatRad)];
}

/**
 * Generate a circle polygon (for omnidirectional coverage)
 *
 * @param centerLat - Center latitude
 * @param centerLon - Center longitude
 * @param radiusMeters - Radius in meters
 * @param numPoints - Number of points to approximate the circle (default 64)
 * @returns Array of [lon, lat] coordinates forming the polygon
 */
function generateCircle(
  centerLat: number,
  centerLon: number,
  radiusMeters: number,
  numPoints: number = 64
): number[][] {
  const coordinates: number[][] = [];

  for (let i = 0; i <= numPoints; i++) {
    const bearing = (i / numPoints) * 360;
    coordinates.push(destinationPoint(centerLat, centerLon, bearing, radiusMeters));
  }

  return coordinates;
}

/**
 * Generate a sector polygon (for directional coverage)
 * Creates a pie-slice shape from the center point
 *
 * @param centerLat - Center latitude
 * @param centerLon - Center longitude
 * @param radiusMeters - Radius in meters
 * @param orientation - Direction the sector is facing (degrees, 0 = North)
 * @param beamWidth - Angular width of the sector (degrees)
 * @param numArcPoints - Number of points on the arc (default 32)
 * @returns Array of [lon, lat] coordinates forming the polygon
 */
function generateSector(
  centerLat: number,
  centerLon: number,
  radiusMeters: number,
  orientation: number,
  beamWidth: number,
  numArcPoints: number = 32
): number[][] {
  const coordinates: number[][] = [];

  // Start at center
  coordinates.push([centerLon, centerLat]);

  // Calculate start and end angles
  const startAngle = orientation - beamWidth / 2;
  const endAngle = orientation + beamWidth / 2;

  // Generate arc points
  for (let i = 0; i <= numArcPoints; i++) {
    const angle = startAngle + (i / numArcPoints) * (endAngle - startAngle);
    coordinates.push(destinationPoint(centerLat, centerLon, angle, radiusMeters));
  }

  // Close back to center
  coordinates.push([centerLon, centerLat]);

  return coordinates;
}

/**
 * Get color for CUAS coverage based on jam state
 */
function getCoverageColor(isActive: boolean, isJamming: boolean): string {
  if (isJamming) {
    return '#ef4444'; // Red when actively jamming
  }
  if (isActive) {
    return '#f97316'; // Orange when active but not jamming
  }
  return '#6b7280'; // Gray when inactive
}

/**
 * Generate GeoJSON for a single CUAS placement's coverage zone
 */
export function generateCUASCoverageFeature(
  placement: CUASPlacement,
  profile: CUASProfile,
  isJamming: boolean = false
): GeoJSONFeature {
  const { position, orientation_deg } = placement;
  const rangeMeters = profile.effective_range_m || 500;
  const beamWidth = profile.beam_width_deg || 360;
  const patternType = profile.antenna_pattern || 'omni';

  // Generate the coverage polygon based on pattern type
  let coordinates: number[][];
  if (patternType === 'omni' || beamWidth >= 360) {
    // Full circle for omnidirectional
    coordinates = generateCircle(position.lat, position.lon, rangeMeters);
  } else if (patternType === 'sector' || beamWidth < 360) {
    // Sector for directional
    coordinates = generateSector(
      position.lat,
      position.lon,
      rangeMeters,
      orientation_deg,
      beamWidth
    );
  } else {
    // Default to circle
    coordinates = generateCircle(position.lat, position.lon, rangeMeters);
  }

  return {
    type: 'Feature',
    properties: {
      id: placement.id,
      cuasProfileId: placement.cuas_profile_id,
      cuasName: profile.name,
      patternType,
      rangeMeters,
      beamWidth,
      orientation: orientation_deg,
      isActive: placement.active,
      isJamming,
      color: getCoverageColor(placement.active, isJamming),
      fillOpacity: isJamming ? 0.4 : 0.2,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [coordinates],
    },
  };
}

/**
 * Generate GeoJSON point feature for CUAS marker position
 */
export function generateCUASMarkerFeature(
  placement: CUASPlacement,
  profile: CUASProfile,
  isJamming: boolean = false
): GeoJSONFeature {
  return {
    type: 'Feature',
    properties: {
      id: placement.id,
      cuasProfileId: placement.cuas_profile_id,
      cuasName: profile.name,
      type: profile.type,
      isActive: placement.active,
      isJamming,
      orientation: placement.orientation_deg,
      color: getCoverageColor(placement.active, isJamming),
    },
    geometry: {
      type: 'Point',
      coordinates: [placement.position.lon, placement.position.lat],
    },
  };
}

/**
 * Generate complete GeoJSON FeatureCollection for all CUAS coverage zones
 */
export function generateCUASCoverageGeoJSON(
  placements: CUASPlacement[],
  profilesMap: Map<string, CUASProfile>,
  jamStates: Map<string, boolean> = new Map()
): GeoJSONFeatureCollection {
  const features: GeoJSONFeature[] = [];

  for (const placement of placements) {
    const profile = profilesMap.get(placement.cuas_profile_id);
    if (!profile) continue;

    const isJamming = jamStates.get(placement.id) || false;
    features.push(generateCUASCoverageFeature(placement, profile, isJamming));
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

/**
 * Generate complete GeoJSON FeatureCollection for all CUAS marker positions
 */
export function generateCUASMarkersGeoJSON(
  placements: CUASPlacement[],
  profilesMap: Map<string, CUASProfile>,
  jamStates: Map<string, boolean> = new Map()
): GeoJSONFeatureCollection {
  const features: GeoJSONFeature[] = [];

  for (const placement of placements) {
    const profile = profilesMap.get(placement.cuas_profile_id);
    if (!profile) continue;

    const isJamming = jamStates.get(placement.id) || false;
    features.push(generateCUASMarkerFeature(placement, profile, isJamming));
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

/**
 * Create profiles lookup map from array
 */
export function createProfilesMap(profiles: CUASProfile[]): Map<string, CUASProfile> {
  const map = new Map<string, CUASProfile>();
  for (const profile of profiles) {
    map.set(profile.id, profile);
  }
  return map;
}
