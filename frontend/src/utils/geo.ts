/**
 * Shared Geospatial Utility Module
 * Canonical implementations of distance, bearing, midpoint, and formatting functions.
 * All other modules should import from here instead of duplicating geo math.
 */

const EARTH_RADIUS_M = 6371000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Haversine distance between two lat/lon points, in meters.
 */
export function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * 3D slant range: sqrt(horizontal² + altitudeDelta²)
 */
export function slantRange(
  lat1: number, lon1: number, alt1: number,
  lat2: number, lon2: number, alt2: number,
): number {
  const h = haversineDistance(lat1, lon1, lat2, lon2);
  const dAlt = alt2 - alt1;
  return Math.sqrt(h * h + dAlt * dAlt);
}

/**
 * Initial bearing from point 1 to point 2, in degrees [0, 360).
 */
export function bearing(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Great-circle midpoint between two lat/lon points.
 */
export function midpoint(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): { lat: number; lon: number } {
  const φ1 = toRad(lat1);
  const λ1 = toRad(lon1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);

  const Bx = Math.cos(φ2) * Math.cos(Δλ);
  const By = Math.cos(φ2) * Math.sin(Δλ);

  const φm = Math.atan2(
    Math.sin(φ1) + Math.sin(φ2),
    Math.sqrt((Math.cos(φ1) + Bx) ** 2 + By ** 2),
  );
  const λm = λ1 + Math.atan2(By, Math.cos(φ1) + Bx);

  return { lat: toDeg(φm), lon: toDeg(λm) };
}

/**
 * Destination point given start, bearing (degrees), and distance (meters).
 * Returns { lat, lon }.
 */
export function destinationPoint(
  lat: number, lon: number,
  bearingDeg: number, distanceM: number,
): { lat: number; lon: number } {
  const δ = distanceM / EARTH_RADIUS_M;
  const θ = toRad(bearingDeg);
  const φ1 = toRad(lat);
  const λ1 = toRad(lon);

  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ),
  );
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
    );

  return { lat: toDeg(φ2), lon: toDeg(λ2) };
}

/**
 * Angle off boresight: absolute angular difference between CUAS heading and bearing to target.
 * Returns [0, 180].
 */
export function angleOffBoresight(cuasHeadingDeg: number, bearingDeg: number): number {
  let diff = Math.abs(bearingDeg - cuasHeadingDeg) % 360;
  if (diff > 180) diff = 360 - diff;
  return diff;
}

/**
 * Human-readable distance string: "450m" or "1.2km"
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

/**
 * Human-readable bearing: "045° NE"
 */
export function formatBearing(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(deg / 45) % 8;
  return `${String(Math.round(deg)).padStart(3, '0')}° ${dirs[idx]}`;
}
