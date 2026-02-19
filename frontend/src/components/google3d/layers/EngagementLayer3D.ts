/**
 * EngagementLayer3D — Engagement lines between CUAS systems and drones.
 *
 * Cesium used PolylineDashMaterial for engagement lines;
 * Google 3D uses outerColor + outerWidth for a dual-tone bordered effect
 * that visually distinguishes engagement lines from drone tracks.
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

      // Engagement line with dual-tone (outerColor mimics dashed pattern)
      const coords = [
        {
          lat: cuasPos.lat,
          lng: cuasPos.lng,
          altitude: cuasPos.alt ?? 5,
        },
        {
          lat: drone.lat,
          lng: drone.lon,
          altitude: drone.alt_m ?? 50,
        },
      ];

      const polyline = new Polyline3DElement();
      polyline.setAttribute('data-layer', ENGAGEMENT_TAG);
      polyline.setAttribute('data-engagement-id', engagement.id);
      polyline.coordinates = coords;
      polyline.altitudeMode = 'RELATIVE_TO_MESH';

      if (isActive && hasBurst) {
        // Active jamming — pulsing red
        polyline.strokeColor = '#ef4444';
        polyline.strokeWidth = 3;
        polyline.outerColor = '#7f1d1d';
        polyline.outerWidth = 6;
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

      // Distance label at midpoint
      if (showLabels && Marker3DElement) {
        const midLat = (cuasPos.lat + drone.lat) / 2;
        const midLng = (cuasPos.lng + drone.lon) / 2;
        const midAlt = ((cuasPos.alt ?? 5) + (drone.alt_m ?? 50)) / 2;

        // Compute distance
        const dLat = (drone.lat - cuasPos.lat) * 111320;
        const dLon = (drone.lon - cuasPos.lng) * 111320 * Math.cos(cuasPos.lat * Math.PI / 180);
        const dAlt = (drone.alt_m ?? 50) - (cuasPos.alt ?? 5);
        const dist = Math.round(Math.sqrt(dLat * dLat + dLon * dLon + dAlt * dAlt));

        const label = new Marker3DElement();
        label.setAttribute('data-layer', ENGAGEMENT_TAG);
        label.position = { lat: midLat, lng: midLng, altitude: midAlt };
        label.altitudeMode = 'RELATIVE_TO_MESH';
        label.title = `${dist}m`;
        label.collisionBehavior = 'OPTIONAL_AND_HIDES_LOWER_PRIORITY';
        label.zIndex = 50;
        mapEl.append(label);
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
