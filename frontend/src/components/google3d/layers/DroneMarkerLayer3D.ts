/**
 * DroneMarkerLayer3D — Drone current-position markers on Google 3D Map.
 *
 * Renders each active drone as:
 * - Model3DInteractiveElement with GLB model (or Marker3DInteractiveElement fallback)
 * - Label with tracker ID, altitude, speed
 * - Extruded pole from ground to drone altitude
 * - Selection highlighting via model swap (no color blend in Google 3D)
 *
 * For real-time updates, DroneAnimationManager handles position interpolation.
 * This layer handles initial creation and full re-render.
 */

import type { DroneSummary, PositionPoint } from '../../../types/drone';
import type { DroneProfile } from '../../../types/workflow';
import type { Map3DElementRef } from '../hooks/useGoogle3DMap';
import { attachDroneClickHandler } from '../hooks/useGoogle3DClickHandler';
import { bearing } from '../../../utils/geo';

const DRONE_TAG = 'drone-marker-layer';

interface DroneMarkerLayerOptions {
  droneHistory: Map<string, PositionPoint[]>;
  currentTime: number;
  timelineStart: number;
  currentDroneData?: Map<string, DroneSummary>;
  selectedDroneId?: string | null;
  droneProfiles?: DroneProfile[];
  droneProfileMap?: Map<string, DroneProfile>;
  showLabels?: boolean;
  colorMap?: Map<string, string>;
  onDroneClick?: (droneId: string) => void;
}

// Drone status colors
const DRONE_COLORS = {
  active: '#22c55e',
  selected: '#fbbf24',
  stale: '#6b7280',
  emergency: '#ef4444',
};

/**
 * Render drone markers for all tracked drones.
 */
export function renderDroneMarkers(
  maps3dLib: any,
  mapEl: Map3DElementRef,
  options: DroneMarkerLayerOptions,
): () => void {
  cleanupDroneMarkers(mapEl);

  const {
    droneHistory,
    currentTime,
    currentDroneData,
    selectedDroneId,
    droneProfileMap,
    showLabels = true,
    colorMap,
    onDroneClick,
  } = options;

  if (!droneHistory || droneHistory.size === 0 || !maps3dLib) {
    return () => cleanupDroneMarkers(mapEl);
  }

  const { Marker3DInteractiveElement, Model3DInteractiveElement } = maps3dLib;

  for (const [trackerId, positions] of droneHistory) {
    if (positions.length === 0) continue;

    // Get current position (latest point before currentTime)
    const currentPos = getPositionAtTime(positions, currentTime);
    if (!currentPos) continue;

    const summary = currentDroneData?.get(trackerId);
    const isSelected = selectedDroneId === trackerId;
    const isStale = summary?.is_stale ?? false;
    const trackColor = colorMap?.get(trackerId) ?? DRONE_COLORS.active;

    // Compute heading from last two positions
    let headingDeg = summary?.heading_deg ?? 0;
    if (positions.length >= 2 && !summary?.heading_deg) {
      const prev = positions[positions.length - 2];
      const curr = positions[positions.length - 1];
      if (prev.lat !== curr.lat || prev.lon !== curr.lon) {
        headingDeg = bearing(prev.lat, prev.lon, curr.lat, curr.lon);
      }
    }

    // Check if we have a 3D model for this drone
    const profile = findDroneProfile(trackerId, droneProfileMap, currentDroneData);
    const modelPath = profile?.model_3d ? `/models/drones/${profile.model_3d}.glb` : null;

    if (modelPath && Model3DInteractiveElement) {
      // Render as 3D GLB model
      const model = new Model3DInteractiveElement();
      model.setAttribute('data-layer', DRONE_TAG);
      model.setAttribute('data-drone-id', trackerId);
      model.src = modelPath;
      model.position = {
        lat: currentPos.lat,
        lng: currentPos.lon,
        altitude: currentPos.alt_m ?? 50,
      };
      model.altitudeMode = 'RELATIVE_TO_MESH';
      model.orientation = { heading: headingDeg - 90, tilt: 0, roll: 0 };
      model.scale = isSelected ? 15 : 10;
      attachDroneClickHandler(model, trackerId, onDroneClick);
      mapEl.append(model);
    }

    // Always render a marker (either as primary or as label overlay)
    const marker = new Marker3DInteractiveElement();
    marker.setAttribute('data-layer', DRONE_TAG);
    marker.setAttribute('data-drone-id', trackerId);
    marker.position = {
      lat: currentPos.lat,
      lng: currentPos.lon,
      altitude: currentPos.alt_m ?? 50,
    };
    marker.altitudeMode = 'RELATIVE_TO_MESH';
    marker.extruded = true;
    marker.drawsWhenOccluded = true;
    marker.collisionBehavior = 'OPTIONAL_AND_HIDES_LOWER_PRIORITY';
    marker.zIndex = isSelected ? 1000 : 100;

    // Label
    if (showLabels) {
      const displayName = summary?.alias ?? trackerId;
      const alt = currentPos.alt_m != null ? `${Math.round(currentPos.alt_m)}m` : '?m';
      const staleTag = isStale ? ' [STALE]' : '';
      marker.title = `${displayName} · ${alt}${staleTag}`;
    }

    // Pin styling
    const pinColor = isSelected
      ? DRONE_COLORS.selected
      : isStale
        ? DRONE_COLORS.stale
        : trackColor;

    try {
      const pin = new (window as any).google.maps.marker.PinElement({
        background: pinColor,
        borderColor: isSelected ? '#f59e0b' : '#333',
        glyphColor: '#fff',
        scale: isSelected ? 1.3 : 0.9,
      });
      marker.append(pin);
    } catch {
      // PinElement not available
    }

    attachDroneClickHandler(marker, trackerId, onDroneClick);
    mapEl.append(marker);
  }

  return () => cleanupDroneMarkers(mapEl);
}

/** Get the drone position at a given time (binary search for efficiency) */
function getPositionAtTime(positions: PositionPoint[], time: number): PositionPoint | null {
  if (positions.length === 0) return null;

  // If time is beyond all positions, use the latest
  if (time >= positions[positions.length - 1].timestamp) {
    return positions[positions.length - 1];
  }

  // Find the last position before time
  let lo = 0;
  let hi = positions.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (positions[mid].timestamp <= time) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return positions[lo];
}

/** Find drone profile by tracker ID */
function findDroneProfile(
  trackerId: string,
  droneProfileMap?: Map<string, DroneProfile>,
  currentDroneData?: Map<string, DroneSummary>,
): DroneProfile | null {
  if (!droneProfileMap) return null;
  return droneProfileMap.get(trackerId) ?? null;
}

function cleanupDroneMarkers(mapEl: Map3DElementRef): void {
  if (!mapEl) return;
  const existing = mapEl.querySelectorAll(`[data-layer="${DRONE_TAG}"]`);
  existing.forEach((el: Element) => el.remove());
}
