/**
 * GeofenceLayer3D — Renders geofence zones as 3D extruded polygons.
 *
 * Uses @turf/circle for geodesically accurate circular geofences.
 * Zones are rendered as semi-transparent extruded volumes showing
 * the 3D airspace corridor (minAlt → maxAlt).
 */

import circle from '@turf/circle';
import type { GeofenceZone } from '../../../types/blueUas';
import type { Map3DElementRef } from '../hooks/useGoogle3DMap';

const GEOFENCE_TAG = 'geofence-layer';

/**
 * Render geofence zones on the map.
 * Returns a cleanup function.
 */
export function renderGeofenceZones(
  maps3dLib: any,
  mapEl: Map3DElementRef,
  zones?: GeofenceZone[],
): () => void {
  cleanupGeofences(mapEl);

  if (!zones || zones.length === 0 || !maps3dLib) {
    return () => cleanupGeofences(mapEl);
  }

  const { Polygon3DElement } = maps3dLib;

  for (const zone of zones) {
    if (!zone.active) continue;

    let coordinates: Array<{ lat: number; lng: number; altitude: number }>;

    if (zone.polygon && zone.polygon.length >= 3) {
      // Explicit polygon coordinates
      coordinates = zone.polygon.map(p => ({
        lat: p.lat,
        lng: p.lng,
        altitude: zone.minAltitudeM,
      }));
    } else if (zone.center && zone.radiusM) {
      // Generate geodesic circle using Turf.js
      const radiusKm = zone.radiusM / 1000;
      const circleGeoJSON = circle(
        [zone.center.lng, zone.center.lat],
        radiusKm,
        { units: 'kilometers', steps: 64 },
      );

      const ring = circleGeoJSON.geometry.coordinates[0];
      coordinates = ring.map(([lng, lat]: [number, number]) => ({
        lat,
        lng,
        altitude: zone.minAltitudeM,
      }));
    } else {
      continue; // Skip invalid zones
    }

    const polygon = new Polygon3DElement();
    polygon.setAttribute('data-layer', GEOFENCE_TAG);
    polygon.setAttribute('data-zone-id', zone.id);
    polygon.outerCoordinates = coordinates;
    polygon.altitudeMode = 'RELATIVE_TO_GROUND';
    polygon.fillColor = zone.fillColor;
    polygon.strokeColor = zone.strokeColor;
    polygon.strokeWidth = 2;

    if (zone.extruded) {
      polygon.extruded = true;
      // Set top altitude to create a 3D volume
      // The polygon coordinates set the base altitude;
      // extruded height is the difference between max and min
      const extrudeHeight = zone.maxAltitudeM - zone.minAltitudeM;
      polygon.extrudedHeight = extrudeHeight > 0 ? extrudeHeight : 100;
    }

    mapEl.append(polygon);
  }

  return () => cleanupGeofences(mapEl);
}

/**
 * Flash a geofence zone (e.g., on breach alert).
 * Temporarily changes the fill to bright red, then reverts.
 */
export function flashGeofenceZone(
  mapEl: Map3DElementRef,
  zoneId: string,
  durationMs: number = 2000,
): void {
  if (!mapEl) return;

  const polygon = mapEl.querySelector(`[data-zone-id="${zoneId}"]`);
  if (!polygon) return;

  const originalFill = polygon.fillColor;
  const originalStroke = polygon.strokeColor;

  polygon.fillColor = 'rgba(239, 68, 68, 0.5)';
  polygon.strokeColor = '#ef4444';

  setTimeout(() => {
    polygon.fillColor = originalFill;
    polygon.strokeColor = originalStroke;
  }, durationMs);
}

function cleanupGeofences(mapEl: Map3DElementRef): void {
  if (!mapEl) return;
  const existing = mapEl.querySelectorAll(`[data-layer="${GEOFENCE_TAG}"]`);
  existing.forEach((el: Element) => el.remove());
}
