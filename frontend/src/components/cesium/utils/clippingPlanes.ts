/**
 * Boundary polygon → Cesium ClippingPlaneCollection
 *
 * Restricts Google 3D tile loading to the site boundary area,
 * reducing API costs and improving visual focus.
 *
 * Strategy:
 * - ≤6 vertices AND convex: one plane per edge (exact boundary clipping)
 * - >6 vertices OR concave: axis-aligned bounding box (4 planes)
 */

import type { GeoPoint } from '../../../types/workflow';

/**
 * Check if a polygon (in lat/lon) is convex using the cross-product test.
 */
function isConvex(points: GeoPoint[]): boolean {
  const n = points.length;
  if (n < 3) return false;

  let sign = 0;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const c = points[(i + 2) % n];
    const cross = (b.lon - a.lon) * (c.lat - b.lat) - (b.lat - a.lat) * (c.lon - b.lon);
    if (cross !== 0) {
      if (sign === 0) {
        sign = cross > 0 ? 1 : -1;
      } else if ((cross > 0 ? 1 : -1) !== sign) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Create ClippingPlaneCollection from a site boundary polygon.
 * Returns null if the boundary is insufficient (< 3 points).
 *
 * @param Cesium - The Cesium module (lazy-loaded)
 * @param boundary - Array of GeoPoints forming the boundary polygon
 * @param buffer - Extra meters of buffer around the boundary (default: 200)
 */
export function createBoundaryClippingPlanes(
  Cesium: any,
  boundary: GeoPoint[],
  buffer: number = 200,
): any | null {
  if (!boundary || boundary.length < 3) return null;

  const useExactEdges = boundary.length <= 6 && isConvex(boundary);

  if (useExactEdges) {
    return createEdgeClippingPlanes(Cesium, boundary, buffer);
  } else {
    return createBBoxClippingPlanes(Cesium, boundary, buffer);
  }
}

/**
 * Create clipping planes from each polygon edge (for convex polygons ≤6 vertices).
 * Each plane's normal points inward so content inside the boundary is kept.
 */
function createEdgeClippingPlanes(Cesium: any, boundary: GeoPoint[], buffer: number): any {
  // Compute centroid for the collection's modelMatrix
  let cLat = 0, cLon = 0;
  for (const p of boundary) { cLat += p.lat; cLon += p.lon; }
  cLat /= boundary.length;
  cLon /= boundary.length;

  const center = Cesium.Cartesian3.fromDegrees(cLon, cLat, 0);

  const planes: any[] = [];
  const n = boundary.length;

  for (let i = 0; i < n; i++) {
    const a = boundary[i];
    const b = boundary[(i + 1) % n];

    // Edge vector in degrees
    const edgeLon = b.lon - a.lon;
    const edgeLat = b.lat - a.lat;

    // Inward normal (perpendicular, pointing into the polygon)
    // For CCW winding: normal = (-edgeLat, edgeLon)
    // For CW winding: normal = (edgeLat, -edgeLon)
    // We'll determine winding from the cross product sign
    let nx = -(edgeLat);
    let ny = edgeLon;

    // Normalize
    const len = Math.sqrt(nx * nx + ny * ny);
    if (len === 0) continue;
    nx /= len;
    ny /= len;

    // Midpoint of this edge
    const midLon = (a.lon + b.lon) / 2;
    const midLat = (a.lat + b.lat) / 2;

    // Distance from center to edge midpoint (in degrees, then scaled to meters)
    const dLon = midLon - cLon;
    const dLat = midLat - cLat;

    // Dot product of (center→midpoint) with normal — if negative, flip normal
    const dot = dLon * ny + dLat * nx;
    if (dot < 0) {
      nx = -nx;
      ny = -ny;
    }

    // Convert normal direction to a Cesium ClippingPlane
    // Use ENU frame at center: x=East, y=North, z=Up
    // nx maps to North (lat direction), ny maps to East (lon direction)
    const planeNormal = new Cesium.Cartesian3(ny, nx, 0);
    Cesium.Cartesian3.normalize(planeNormal, planeNormal);

    // Distance from center to the edge (in meters), plus buffer
    const distDeg = Math.abs(dLon * ny + dLat * nx);
    const distMeters = distDeg * 111320 + buffer;

    planes.push(new Cesium.ClippingPlane(planeNormal, distMeters));
  }

  return new Cesium.ClippingPlaneCollection({
    planes,
    modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(center),
    unionClippingRegions: true,
    edgeColor: Cesium.Color.TRANSPARENT,
    edgeWidth: 0,
  });
}

/**
 * Create axis-aligned bounding box clipping planes (4 planes: N, S, E, W).
 * Used for concave polygons or polygons with >6 vertices.
 */
function createBBoxClippingPlanes(Cesium: any, boundary: GeoPoint[], buffer: number): any {
  let minLat = Infinity, maxLat = -Infinity;
  let minLon = Infinity, maxLon = -Infinity;

  for (const p of boundary) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }

  // Add buffer in degrees
  const bufferDeg = buffer / 111320;
  const cosLat = Math.cos(((minLat + maxLat) / 2 * Math.PI) / 180);
  const bufferDegLon = buffer / (111320 * cosLat);

  minLat -= bufferDeg;
  maxLat += bufferDeg;
  minLon -= bufferDegLon;
  maxLon += bufferDegLon;

  const cLat = (minLat + maxLat) / 2;
  const cLon = (minLon + maxLon) / 2;
  const center = Cesium.Cartesian3.fromDegrees(cLon, cLat, 0);

  // Half-extents in meters
  const halfLatM = ((maxLat - minLat) / 2) * 111320;
  const halfLonM = ((maxLon - minLon) / 2) * 111320 * cosLat;

  // 4 axis-aligned planes in ENU frame (x=East, y=North, z=Up)
  const planes = [
    new Cesium.ClippingPlane(new Cesium.Cartesian3(0, 1, 0), halfLatM),   // North
    new Cesium.ClippingPlane(new Cesium.Cartesian3(0, -1, 0), halfLatM),  // South
    new Cesium.ClippingPlane(new Cesium.Cartesian3(1, 0, 0), halfLonM),   // East
    new Cesium.ClippingPlane(new Cesium.Cartesian3(-1, 0, 0), halfLonM),  // West
  ];

  return new Cesium.ClippingPlaneCollection({
    planes,
    modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(center),
    unionClippingRegions: true,
    edgeColor: Cesium.Color.TRANSPARENT,
    edgeWidth: 0,
  });
}
