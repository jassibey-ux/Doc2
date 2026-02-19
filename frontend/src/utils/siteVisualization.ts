/**
 * Site Visualization Geometry Utilities
 * Generates GeoJSON for visualizing site boundaries, zones, and markers on the map
 */

import type { SiteDefinition, ZoneType, MarkerType, GeoPoint } from '../types/workflow';
import type { FeatureCollection, Feature, Polygon, Point } from 'geojson';

/**
 * Calculate the center point of a polygon
 */
export function calculatePolygonCenter(points: GeoPoint[]): GeoPoint {
  if (points.length === 0) {
    return { lat: 0, lon: 0 };
  }
  if (points.length < 3) {
    const sumLat = points.reduce((sum, p) => sum + p.lat, 0);
    const sumLon = points.reduce((sum, p) => sum + p.lon, 0);
    return { lat: sumLat / points.length, lon: sumLon / points.length };
  }

  // Weighted centroid using Shoelace formula — accurate for concave polygons
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    const cross = points[i].lat * points[j].lon - points[j].lat * points[i].lon;
    area += cross;
    cx += (points[i].lat + points[j].lat) * cross;
    cy += (points[i].lon + points[j].lon) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-12) {
    // Degenerate polygon — fall back to simple average
    const sumLat = points.reduce((sum, p) => sum + p.lat, 0);
    const sumLon = points.reduce((sum, p) => sum + p.lon, 0);
    return { lat: sumLat / points.length, lon: sumLon / points.length };
  }
  cx /= (6 * area);
  cy /= (6 * area);
  return { lat: cx, lon: cy };
}

// Zone type colors
const ZONE_COLORS: Record<ZoneType, string> = {
  jammer_zone: '#ef4444',      // Red
  approach_corridor: '#3b82f6', // Blue
  exclusion: '#f97316',        // Orange
  test_area: '#22c55e',        // Green
  custom: '#a855f7',           // Purple
};

// Marker type icons (for styling)
const MARKER_COLORS: Record<MarkerType, string> = {
  command_post: '#3b82f6',     // Blue
  launch_point: '#22c55e',     // Green
  recovery_zone: '#f97316',    // Orange
  observation: '#a855f7',      // Purple
  custom: '#6b7280',           // Gray
};

/**
 * Generate GeoJSON for site boundary polygon
 */
export function generateSiteBoundaryGeoJSON(
  site: SiteDefinition | null | undefined
): FeatureCollection<Polygon> {
  if (!site || !site.boundary_polygon || site.boundary_polygon.length < 3) {
    return { type: 'FeatureCollection', features: [] };
  }

  // Convert to [lon, lat] format and close the polygon
  const coordinates: [number, number][] = site.boundary_polygon.map(p => [p.lon, p.lat]);
  // Close the polygon by adding the first point at the end
  if (coordinates.length > 0) {
    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      coordinates.push([first[0], first[1]]);
    }
  }

  const feature: Feature<Polygon> = {
    type: 'Feature',
    properties: {
      id: site.id,
      name: site.name,
      type: 'boundary',
      environmentType: site.environment_type,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [coordinates],
    },
  };

  return {
    type: 'FeatureCollection',
    features: [feature],
  };
}

/**
 * Generate GeoJSON for site zones
 */
export function generateSiteZonesGeoJSON(
  site: SiteDefinition | null | undefined
): FeatureCollection<Polygon> {
  if (!site || !site.zones || site.zones.length === 0) {
    return { type: 'FeatureCollection', features: [] };
  }

  const features: Feature<Polygon>[] = [];

  for (const zone of site.zones) {
    if (!zone.polygon || zone.polygon.length < 3) continue;

    // Convert to [lon, lat] format and close the polygon
    const coordinates: [number, number][] = zone.polygon.map(p => [p.lon, p.lat]);
    if (coordinates.length > 0) {
      const first = coordinates[0];
      const last = coordinates[coordinates.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        coordinates.push([first[0], first[1]]);
      }
    }

    features.push({
      type: 'Feature',
      properties: {
        id: zone.id,
        name: zone.name,
        type: zone.type,
        color: zone.color || ZONE_COLORS[zone.type] || '#6b7280',
        opacity: zone.opacity ?? 0.3,
        notes: zone.notes,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [coordinates],
      },
    });
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

/**
 * Generate GeoJSON for site markers
 */
export function generateSiteMarkersGeoJSON(
  site: SiteDefinition | null | undefined
): FeatureCollection<Point> {
  if (!site || !site.markers || site.markers.length === 0) {
    return { type: 'FeatureCollection', features: [] };
  }

  const features: Feature<Point>[] = [];

  for (const marker of site.markers) {
    if (!marker.position) continue;

    features.push({
      type: 'Feature',
      properties: {
        id: marker.id,
        name: marker.name,
        type: marker.type,
        color: MARKER_COLORS[marker.type] || '#ff8c00',
        icon: marker.icon,
        notes: marker.notes,
      },
      geometry: {
        type: 'Point',
        coordinates: [marker.position.lon, marker.position.lat],
      },
    });
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

/**
 * Generate site center point GeoJSON (for label/icon)
 */
export function generateSiteCenterGeoJSON(
  site: SiteDefinition | null | undefined
): FeatureCollection<Point> {
  if (!site || !site.center) {
    return { type: 'FeatureCollection', features: [] };
  }

  const feature: Feature<Point> = {
    type: 'Feature',
    properties: {
      id: site.id,
      name: site.name,
      type: 'center',
    },
    geometry: {
      type: 'Point',
      coordinates: [site.center.lon, site.center.lat],
    },
  };

  return {
    type: 'FeatureCollection',
    features: [feature],
  };
}

/**
 * Calculate bounds for a site (for fitBounds)
 */
export function calculateSiteBounds(
  site: SiteDefinition | null | undefined
): [[number, number], [number, number]] | null {
  if (!site || !site.boundary_polygon || site.boundary_polygon.length === 0) {
    return null;
  }

  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  for (const point of site.boundary_polygon) {
    minLon = Math.min(minLon, point.lon);
    maxLon = Math.max(maxLon, point.lon);
    minLat = Math.min(minLat, point.lat);
    maxLat = Math.max(maxLat, point.lat);
  }

  // Return in [sw, ne] format for maplibre
  return [[minLon, minLat], [maxLon, maxLat]];
}
