/**
 * DroneMarkerLayer3D — Drone current-position markers on Google 3D Map.
 *
 * Renders each active drone as:
 * - Model3DElement with GLB model (property assignment pattern)
 * - Marker3DInteractiveElement pin with extruded pole from ground to altitude
 * - Hover label (title tooltip) with tracker ID, altitude, stale status
 * - Selection highlighting via model scale (no color blend in Google 3D)
 *
 * For real-time updates, DroneAnimationManager handles position interpolation.
 * This layer handles initial creation and full re-render.
 */

import type { DroneSummary, PositionPoint } from '../../../types/drone';
import type { DroneProfile } from '../../../types/workflow';
import type { Map3DElementRef } from '../hooks/useGoogle3DMap';
import { attachDroneClickHandler } from '../hooks/useGoogle3DClickHandler';
import { bearing } from '../../../utils/geo';
import { getDroneModel } from '../../../utils/modelRegistry';
import { computePitch, computeRoll } from '../../../utils/flightDynamics';
import { createModel3D } from '../utils/createModel3D';

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

  const { Marker3DInteractiveElement } = maps3dLib;
  const baseUrl = import.meta.env.BASE_URL ?? '/';

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

    // Resolve 3D model from profile → registry (always returns a profile with fallback)
    const profile = findDroneProfile(trackerId, droneProfileMap, currentDroneData);
    const modelAsset = getDroneModel(profile);

    // Compute pitch/roll from recent positions
    let pitchDeg = 0;
    let rollDeg = 0;
    if (positions.length >= 2) {
      const prev = positions.length >= 3 ? positions[positions.length - 3] : positions[positions.length - 2];
      const curr = positions[positions.length - 1];
      const dtSec = (curr.timestamp - prev.timestamp) / 1000;
      if (dtSec > 0) {
        const prevSpeed = summary?.speed_mps ?? 0;
        const currSpeed = summary?.speed_mps ?? 0;
        pitchDeg = computePitch(currSpeed, prevSpeed, dtSec);

        const prevHeading = bearing(prev.lat, prev.lon, curr.lat, curr.lon);
        rollDeg = computeRoll(headingDeg, prevHeading, dtSec);
      }
    }

    // Render 3D GLB model via shared factory
    if (modelAsset) {
      const model = createModel3D({
        maps3dLib,
        asset: modelAsset,
        baseUrl,
        position: {
          lat: currentPos.lat,
          lng: currentPos.lon,
          altitude: (currentPos.alt_m ?? 50) + modelAsset.heightOffset,
        },
        headingDeg,
        tiltDeg: pitchDeg,
        rollDeg,
        isSelected,
        dataLayer: DRONE_TAG,
        dataId: { key: 'data-drone-id', value: trackerId },
      });
      if (model) {
        attachDroneClickHandler(model, trackerId, onDroneClick);
        mapEl.append(model);
      }
    }

    // Always render a marker (pin + extruded pole from ground to drone)
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
    marker.collisionBehavior = 'REQUIRED';
    marker.zIndex = isSelected ? 1000 : 100;

    // Hover label (Google 3D alpha API does not support custom HTML content
    // in markers — title tooltip is the only reliable label mechanism)
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

    // Heading vector polyline (Fix 3.5) — 200m forward projection
    if (headingDeg != null && !isStale && currentPos.lat && currentPos.lon) {
      try {
        const headingRad = (headingDeg * Math.PI) / 180;
        const projDistDeg = 200 / 111320; // ~200m in degrees
        const endLat = currentPos.lat + projDistDeg * Math.cos(headingRad);
        const endLon = currentPos.lon + projDistDeg * Math.sin(headingRad) / Math.cos(currentPos.lat * Math.PI / 180);
        const { Polyline3DElement } = maps3dLib;
        if (Polyline3DElement) {
          const headingLine = new Polyline3DElement();
          headingLine.setAttribute('data-layer', DRONE_TAG);
          headingLine.coordinates = [
            { lat: currentPos.lat, lng: currentPos.lon, altitude: (currentPos.alt_m ?? 50) },
            { lat: endLat, lng: endLon, altitude: (currentPos.alt_m ?? 50) },
          ];
          headingLine.altitudeMode = 'RELATIVE_TO_MESH';
          headingLine.strokeColor = trackColor;
          headingLine.strokeWidth = 2;
          headingLine.outerColor = 'rgba(0,0,0,0.5)';
          headingLine.outerWidth = 1;
          mapEl.append(headingLine);
        }
      } catch { /* heading vector optional */ }
    }

    // Speed vector polyline (Fix 4.7) — length proportional to speed
    const speedMps = summary?.speed_mps ?? 0;
    if (speedMps > 0 && headingDeg != null && !isStale) {
      try {
        const speedLengthM = speedMps * 10; // 10-second projection
        const headingRad = (headingDeg * Math.PI) / 180;
        const projDistDeg = speedLengthM / 111320;
        const endLat = currentPos.lat + projDistDeg * Math.cos(headingRad);
        const endLon = currentPos.lon + projDistDeg * Math.sin(headingRad) / Math.cos(currentPos.lat * Math.PI / 180);
        const { Polyline3DElement } = maps3dLib;
        if (Polyline3DElement) {
          const speedLine = new Polyline3DElement();
          speedLine.setAttribute('data-layer', DRONE_TAG);
          speedLine.coordinates = [
            { lat: currentPos.lat, lng: currentPos.lon, altitude: (currentPos.alt_m ?? 50) + 1 },
            { lat: endLat, lng: endLon, altitude: (currentPos.alt_m ?? 50) + 1 },
          ];
          speedLine.altitudeMode = 'RELATIVE_TO_MESH';
          speedLine.strokeColor = `${trackColor}88`; // Semi-transparent
          speedLine.strokeWidth = 1;
          mapEl.append(speedLine);
        }
      } catch { /* speed vector optional */ }
    }
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

/** Default synthetic profile for unassigned trackers */
const DEFAULT_DRONE_PROFILE: DroneProfile = {
  id: '__default__',
  name: 'Generic Drone',
  make: 'Unknown',
  model: 'Unknown',
  weight_class: 'mini',
  model_3d: 'quadcopter_generic',
  frequency_bands: [],
  expected_failsafe: 'rth',
  created_at: '',
  updated_at: '',
};

/** Find drone profile by tracker ID, falling back to default */
function findDroneProfile(
  trackerId: string,
  droneProfileMap?: Map<string, DroneProfile>,
  _currentDroneData?: Map<string, DroneSummary>,
): DroneProfile {
  if (droneProfileMap) {
    const profile = droneProfileMap.get(trackerId);
    if (profile) return profile;
  }
  return DEFAULT_DRONE_PROFILE;
}

function cleanupDroneMarkers(mapEl: Map3DElementRef): void {
  if (!mapEl) return;
  const existing = mapEl.querySelectorAll(`[data-layer="${DRONE_TAG}"]`);
  existing.forEach((el: Element) => el.remove());
}
