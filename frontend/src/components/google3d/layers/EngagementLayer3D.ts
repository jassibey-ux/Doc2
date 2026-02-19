/**
 * EngagementLayer3D — Engagement lines between CUAS systems and drones.
 *
 * Enhanced with:
 * - Granular line colors based on GPS/connection/burst state
 * - GPS denial pin icon near drone when fix_valid is false
 * - Status label near drone showing GPS + altitude delta + freshness
 * - Distance label at midpoint
 */

import type { Engagement, CUASPlacement, JamBurst } from '../../../types/workflow';
import type { DroneSummary } from '../../../types/drone';
import type { Map3DElementRef } from '../hooks/useGoogle3DMap';

const ENGAGEMENT_TAG = 'engagement-layer';

interface EngagementLayerOptions {
  engagements: Engagement[];
  activeBursts?: Map<string, JamBurst>;
  cuasPlacements: CUASPlacement[];
  currentDroneData: Map<string, DroneSummary>;
  showLabels?: boolean;
}

/** Compute 3D distance in meters between two geo positions. */
function computeDistance(
  lat1: number, lon1: number, alt1: number,
  lat2: number, lon2: number, alt2: number,
): number {
  const dLat = (lat2 - lat1) * 111320;
  const dLon = (lon2 - lon1) * 111320 * Math.cos(lat1 * Math.PI / 180);
  const dAlt = alt2 - alt1;
  return Math.sqrt(dLat * dLat + dLon * dLon + dAlt * dAlt);
}

/** Interpolate position along the line from CUAS to drone (0=CUAS, 1=drone). */
function lerpPos(
  cuasLat: number, cuasLng: number, cuasAlt: number,
  droneLat: number, droneLon: number, droneAlt: number,
  t: number,
): { lat: number; lng: number; altitude: number } {
  return {
    lat: cuasLat + (droneLat - cuasLat) * t,
    lng: cuasLng + (droneLon - cuasLng) * t,
    altitude: cuasAlt + (droneAlt - cuasAlt) * t,
  };
}

/**
 * Render engagement lines between CUAS and target drones.
 */
export function renderEngagementLayer(
  maps3dLib: any,
  mapEl: Map3DElementRef,
  options: EngagementLayerOptions,
): () => void {
  cleanupEngagements(mapEl);

  const { engagements, activeBursts, cuasPlacements, currentDroneData, showLabels = true } = options;

  if (!engagements || engagements.length === 0 || !maps3dLib) {
    return () => cleanupEngagements(mapEl);
  }

  const { Polyline3DElement, Marker3DElement } = maps3dLib;

  // Build placement lookup
  const placementMap = new Map<string, CUASPlacement>();
  cuasPlacements.forEach(p => placementMap.set(p.id, p));

  for (const engagement of engagements) {
    if (engagement.status === 'planned') continue;

    // Find CUAS position
    const cuasPos = getCuasPosition(engagement, placementMap);
    if (!cuasPos) continue;

    // Draw line to each target
    for (const target of engagement.targets) {
      const drone = currentDroneData.get(target.tracker_id);
      if (!drone?.lat || !drone?.lon) continue;

      const isActive = engagement.status === 'active';
      const hasBurst = activeBursts?.has(engagement.id);
      const gpsLost = !drone.fix_valid;
      const isStale = drone.is_stale || (drone.age_seconds != null && drone.age_seconds > 3);

      // Engagement line coordinates
      const cuasAlt = cuasPos.alt ?? 5;
      const droneAlt = drone.alt_m ?? 50;
      const coords = [
        { lat: cuasPos.lat, lng: cuasPos.lng, altitude: cuasAlt },
        { lat: drone.lat, lng: drone.lon, altitude: droneAlt },
      ];

      const polyline = new Polyline3DElement();
      polyline.setAttribute('data-layer', ENGAGEMENT_TAG);
      polyline.setAttribute('data-engagement-id', engagement.id);
      polyline.coordinates = coords;
      polyline.altitudeMode = 'RELATIVE_TO_MESH';

      // Granular line colors based on state
      if (isActive && hasBurst && gpsLost) {
        // Active burst + GPS denied — bright red thick
        polyline.strokeColor = '#ef4444';
        polyline.strokeWidth = 4;
        polyline.outerColor = '#991b1b';
        polyline.outerWidth = 7;
      } else if (isActive && hasBurst) {
        // Active burst, GPS still OK — red solid
        polyline.strokeColor = '#ef4444';
        polyline.strokeWidth = 3;
        polyline.outerColor = '#7f1d1d';
        polyline.outerWidth = 6;
      } else if (isActive && isStale) {
        // Active engagement, connection concern — yellow
        polyline.strokeColor = '#eab308';
        polyline.strokeWidth = 2;
        polyline.outerColor = '#713f12';
        polyline.outerWidth = 4;
      } else if (isActive) {
        // Active engagement, no burst — orange
        polyline.strokeColor = '#f97316';
        polyline.strokeWidth = 2;
        polyline.outerColor = '#431407';
        polyline.outerWidth = 4;
      } else {
        // Complete/historical — gray
        polyline.strokeColor = '#6b7280';
        polyline.strokeWidth = 1.5;
        polyline.outerColor = '#1f2937';
        polyline.outerWidth = 3;
      }

      mapEl.append(polyline);

      if (!showLabels || !Marker3DElement) continue;

      // Compute distance
      const dist = Math.round(computeDistance(
        cuasPos.lat, cuasPos.lng, cuasAlt,
        drone.lat, drone.lon, droneAlt,
      ));

      // 1. Distance label at midpoint
      const midPos = lerpPos(cuasPos.lat, cuasPos.lng, cuasAlt, drone.lat, drone.lon, droneAlt, 0.5);
      const distLabel = new Marker3DElement();
      distLabel.setAttribute('data-layer', ENGAGEMENT_TAG);
      distLabel.position = midPos;
      distLabel.altitudeMode = 'RELATIVE_TO_MESH';
      distLabel.title = `${dist}m`;
      distLabel.collisionBehavior = 'OPTIONAL_AND_HIDES_LOWER_PRIORITY';
      distLabel.zIndex = 100;
      mapEl.append(distLabel);

      // Only add extra labels for active engagements
      if (!isActive) continue;

      // 2. Status label near drone (75% along line)
      const altDelta = droneAlt - (target.initial_altitude_m ?? droneAlt);
      const altDeltaStr = altDelta >= 0 ? `+${Math.round(altDelta)}m` : `${Math.round(altDelta)}m`;
      const gpsStr = gpsLost ? 'GPS:LOST' : 'GPS:OK';
      const staleStr = isStale ? ' · STALE' : '';
      const statusTitle = `${gpsStr} · Alt:${altDeltaStr}${staleStr}`;

      const statusPos = lerpPos(cuasPos.lat, cuasPos.lng, cuasAlt, drone.lat, drone.lon, droneAlt, 0.75);
      const statusLabel = new Marker3DElement();
      statusLabel.setAttribute('data-layer', ENGAGEMENT_TAG);
      statusLabel.position = statusPos;
      statusLabel.altitudeMode = 'RELATIVE_TO_MESH';
      statusLabel.title = statusTitle;
      statusLabel.collisionBehavior = 'OPTIONAL_AND_HIDES_LOWER_PRIORITY';
      statusLabel.zIndex = 90;
      mapEl.append(statusLabel);

      // 3. GPS denial pin — only when GPS is lost
      if (gpsLost) {
        const gpsPinPos = lerpPos(cuasPos.lat, cuasPos.lng, cuasAlt, drone.lat, drone.lon, droneAlt, 0.85);
        try {
          // Use Marker3DElement with a red pin glyph for GPS denial indicator
          const gpsPin = new Marker3DElement();
          gpsPin.setAttribute('data-layer', ENGAGEMENT_TAG);
          gpsPin.position = gpsPinPos;
          gpsPin.altitudeMode = 'RELATIVE_TO_MESH';
          gpsPin.title = 'GPS DENIED';
          gpsPin.zIndex = 110;

          // Create a custom glyph element for the pin
          const pinEl = document.createElement('div');
          pinEl.style.cssText = 'width:20px;height:20px;border-radius:50%;background:#ef4444;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;color:#fff;border:2px solid #991b1b;';
          pinEl.textContent = '✕';

          // Try to use slot="default" for custom content
          const slotEl = document.createElement('div');
          slotEl.setAttribute('slot', 'default');
          slotEl.appendChild(pinEl);
          gpsPin.appendChild(slotEl);

          mapEl.append(gpsPin);
        } catch {
          // Fallback: just use a title-only marker if custom DOM fails
          const gpsMarker = new Marker3DElement();
          gpsMarker.setAttribute('data-layer', ENGAGEMENT_TAG);
          gpsMarker.position = gpsPinPos;
          gpsMarker.altitudeMode = 'RELATIVE_TO_MESH';
          gpsMarker.title = '✕ GPS DENIED';
          gpsMarker.zIndex = 110;
          mapEl.append(gpsMarker);
        }
      }
    }
  }

  return () => cleanupEngagements(mapEl);
}

function getCuasPosition(
  engagement: Engagement,
  placementMap: Map<string, CUASPlacement>,
): { lat: number; lng: number; alt: number } | null {
  // Try engagement's own CUAS position first
  if (engagement.cuas_lat != null && engagement.cuas_lon != null) {
    return {
      lat: engagement.cuas_lat,
      lng: engagement.cuas_lon,
      alt: engagement.cuas_alt_m ?? 5,
    };
  }

  // Fall back to placement position
  if (engagement.cuas_placement_id) {
    const placement = placementMap.get(engagement.cuas_placement_id);
    if (placement?.position) {
      return {
        lat: placement.position.lat,
        lng: placement.position.lon,
        alt: placement.height_agl_m ?? 5,
      };
    }
  }

  return null;
}

function cleanupEngagements(mapEl: Map3DElementRef): void {
  if (!mapEl) return;
  const existing = mapEl.querySelectorAll(`[data-layer="${ENGAGEMENT_TAG}"]`);
  existing.forEach((el: Element) => el.remove());
}
