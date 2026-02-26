/**
 * EngagementLayer3D — Engagement lines between CUAS systems and drones.
 *
 * Uses shared geo utilities (haversine, slant range, bearing) for consistent
 * distance/bearing values across all map views (2D, Cesium, Google 3D).
 *
 * 3D-specific features (not shared):
 * - Polyline3DElement with altitude + outerColor glow
 * - Marker3DElement with collision behavior + 3D label positioning
 * - GPS denial pin icon near drone when fix_valid is false
 * - Status label near drone showing GPS + altitude delta + freshness
 */

import type { Engagement, CUASPlacement, JamBurst } from '../../../types/workflow';
import type { DroneSummary } from '../../../types/drone';
import type { Map3DElementRef } from '../hooks/useGoogle3DMap';
import {
  slantRange,
  bearing,
  formatDistance,
  formatBearing,
} from '../../../utils/geo';

const ENGAGEMENT_TAG = 'engagement-layer';

interface EngagementLayerOptions {
  engagements: Engagement[];
  activeBursts?: Map<string, JamBurst>;
  cuasPlacements: CUASPlacement[];
  currentDroneData: Map<string, DroneSummary>;
  showLabels?: boolean;
  /** Callback when an engagement line is clicked. */
  onEngagementClick?: (engagementId: string) => void;
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

  const { engagements, activeBursts, cuasPlacements, currentDroneData, showLabels = true, onEngagementClick } = options;

  if (!engagements || engagements.length === 0 || !maps3dLib) {
    return () => cleanupEngagements(mapEl);
  }

  const { Polyline3DInteractiveElement, Marker3DElement } = maps3dLib;

  // Build placement lookup
  const placementMap = new Map<string, CUASPlacement>();
  cuasPlacements.forEach(p => placementMap.set(p.id, p));

  for (const engagement of engagements) {
    if (engagement.status === 'planned') continue;

    // Find CUAS position
    const cuasPos = getCuasPosition(engagement, placementMap);
    if (!cuasPos) continue;

    // Draw line to each target
    for (const target of (engagement.targets ?? [])) {
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

      const polyline = new Polyline3DInteractiveElement();
      polyline.setAttribute('data-layer', ENGAGEMENT_TAG);
      polyline.setAttribute('data-engagement-id', engagement.id);
      polyline.coordinates = coords;
      polyline.altitudeMode = 'RELATIVE_TO_MESH';

      // Line colors: 5 states based on engagement status, jamming, and GPS health
      if (isActive && hasBurst && gpsLost) {
        // Active + GPS denied + jamming — bright red, wide glow
        polyline.strokeColor = '#ef4444';
        polyline.strokeWidth = 4;
        polyline.outerColor = '#991b1b';
        polyline.outerWidth = 8;
      } else if (isActive && hasBurst) {
        // Active + jamming — red
        polyline.strokeColor = '#ef4444';
        polyline.strokeWidth = 3.5;
        polyline.outerColor = '#7f1d1d';
        polyline.outerWidth = 7;
      } else if (isActive && gpsLost) {
        // Active + GPS lost (no jam) — red
        polyline.strokeColor = '#ef4444';
        polyline.strokeWidth = 3;
        polyline.outerColor = '#991b1b';
        polyline.outerWidth = 6;
      } else if (isActive) {
        // Active, no jam — color by GPS health
        const gpsStatus = drone.gps_health?.health_status ?? 'healthy';
        if (gpsStatus === 'degraded') {
          polyline.strokeColor = '#eab308';
          polyline.outerColor = '#854d0e';
        } else {
          // healthy (or unknown)
          polyline.strokeColor = '#22c55e';
          polyline.outerColor = '#166534';
        }
        polyline.strokeWidth = 3;
        polyline.outerWidth = 6;
      } else {
        // Completed/historical — gray
        polyline.strokeColor = '#6b7280';
        polyline.strokeWidth = 1.5;
        polyline.outerColor = '#1f2937';
        polyline.outerWidth = 3;
      }

      polyline.drawsOccludedSegments = true;
      if (onEngagementClick) {
        polyline.addEventListener('gmp-click', () => onEngagementClick(engagement.id));
      }
      mapEl.append(polyline);

      if (!showLabels || !Marker3DElement) continue;

      // Compute distance + bearing using shared geo utilities (haversine, not flat-earth)
      const sRange = Math.round(slantRange(
        cuasPos.lat, cuasPos.lng, cuasAlt,
        drone.lat, drone.lon, droneAlt,
      ));
      const brg = bearing(cuasPos.lat, cuasPos.lng, drone.lat, drone.lon);

      // Build label consistent with shared engagementGeometry module
      let distLabelText = `${formatDistance(sRange)} | ${formatBearing(brg)}`;
      if (engagement.engage_timestamp) {
        const elapsedMs = Date.now() - new Date(engagement.engage_timestamp).getTime();
        const elapsedSec = Math.max(0, Math.floor(elapsedMs / 1000));
        const m = Math.floor(elapsedSec / 60);
        const s = elapsedSec % 60;
        distLabelText += ` | ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      }

      // 1. Distance label at midpoint
      const midPos = lerpPos(cuasPos.lat, cuasPos.lng, cuasAlt, drone.lat, drone.lon, droneAlt, 0.5);
      const distLabel = new Marker3DElement();
      distLabel.setAttribute('data-layer', ENGAGEMENT_TAG);
      distLabel.position = midPos;
      distLabel.altitudeMode = 'RELATIVE_TO_MESH';
      distLabel.title = distLabelText;
      distLabel.collisionBehavior = 'OPTIONAL_AND_HIDES_LOWER_PRIORITY';
      distLabel.drawsWhenOccluded = true;
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
      statusLabel.drawsWhenOccluded = true;
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
          gpsPin.drawsWhenOccluded = true;
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
          gpsMarker.drawsWhenOccluded = true;
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
