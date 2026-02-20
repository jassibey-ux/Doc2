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
import { getDroneModel } from '../../../utils/modelRegistry';
import { computePitch, computeRoll } from '../../../utils/flightDynamics';

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
    const modelPath = modelAsset
      ? `${baseUrl}${modelAsset.glbPath.replace(/^\//, '')}`
      : `${baseUrl}models/drones/quadcopter_generic.glb`;
    const modelScale = modelAsset?.google3dScale ?? 10;

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

    // Render 3D GLB model (use Model3DElement with property assignment — constructor
    // options pattern doesn't reliably render in Google 3D alpha API)
    {
      const { Model3DElement } = maps3dLib;
      const ModelClass = Model3DElement ?? Model3DInteractiveElement;
      if (ModelClass) {
        try {
          const model = new ModelClass();
          model.setAttribute('data-layer', DRONE_TAG);
          model.setAttribute('data-drone-id', trackerId);
          model.src = modelPath;
          model.position = {
            lat: currentPos.lat,
            lng: currentPos.lon,
            altitude: (currentPos.alt_m ?? 50) + (modelAsset?.heightOffset ?? 0),
          };
          model.altitudeMode = 'RELATIVE_TO_GROUND';
          model.orientation = { heading: headingDeg - 90, tilt: pitchDeg, roll: rollDeg };
          model.scale = isSelected ? modelScale * 1.3 : modelScale;
          attachDroneClickHandler(model, trackerId, onDroneClick);
          mapEl.append(model);
        } catch {
          // Model3DElement may not be available in all alpha API versions
        }
      }
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

    // Always-visible floating label (separate Marker3DElement with HTML content)
    if (showLabels) {
      const { Marker3DElement } = maps3dLib;
      if (Marker3DElement) {
        const displayName = summary?.alias ?? trackerId;
        const alt = currentPos.alt_m != null ? `${Math.round(currentPos.alt_m)}m` : '?m';
        const staleTag = isStale ? ' [STALE]' : '';
        const labelText = `${displayName} · ${alt}${staleTag}`;

        const labelMarker = new Marker3DElement();
        labelMarker.setAttribute('data-layer', DRONE_TAG);
        labelMarker.setAttribute('data-drone-id', trackerId);
        labelMarker.position = {
          lat: currentPos.lat,
          lng: currentPos.lon,
          altitude: (currentPos.alt_m ?? 50) + 15,
        };
        labelMarker.altitudeMode = 'RELATIVE_TO_MESH';
        labelMarker.collisionBehavior = 'OPTIONAL_AND_HIDES_LOWER_PRIORITY';
        labelMarker.zIndex = isSelected ? 1001 : 101;

        const labelDiv = document.createElement('div');
        labelDiv.style.cssText = [
          'background: rgba(0,0,0,0.75)',
          'color: #fff',
          'font: 600 11px/1.2 system-ui, sans-serif',
          'padding: 3px 7px',
          'border-radius: 4px',
          'white-space: nowrap',
          'pointer-events: none',
          `border: 1px solid ${isSelected ? '#f59e0b' : 'rgba(255,255,255,0.2)'}`,
          `box-shadow: 0 1px 4px rgba(0,0,0,0.4)`,
        ].join(';');
        labelDiv.textContent = labelText;
        labelMarker.append(labelDiv);
        mapEl.append(labelMarker);
      }
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
