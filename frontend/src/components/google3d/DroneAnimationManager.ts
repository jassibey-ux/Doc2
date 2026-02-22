/**
 * DroneAnimationManager — Imperative requestAnimationFrame loop for smooth
 * real-time drone position updates on Google 3D Maps.
 *
 * Manages drone model/marker elements outside React's render cycle for
 * performance. Interpolates between position updates for smooth motion.
 *
 * Usage:
 *   const manager = new DroneAnimationManager(mapEl, maps3dLib);
 *   manager.updateDrone(trackerId, newPosition);
 *   manager.start();
 *   // ... later
 *   manager.dispose();
 */

import { bearing } from '../../utils/geo';
import { computePitch, computeRoll, smoothValue } from '../../utils/flightDynamics';
import { createModel3D } from './utils/createModel3D';
import type { ModelAsset } from '../../utils/modelRegistry';

interface DroneState {
  trackerId: string;
  currentLat: number;
  currentLng: number;
  currentAlt: number;
  targetLat: number;
  targetLng: number;
  targetAlt: number;
  heading: number;
  prevHeading: number;
  prevSpeedMps: number;
  currentSpeedMps: number;
  smoothedPitch: number;
  smoothedRoll: number;
  lastUpdateTime: number;
  markerEl: any;
  modelEl: any | null;
  isStale: boolean;
  modelScale: number;
  headingOffset: number;
}

interface DroneAnimationManagerOptions {
  /** Interpolation smoothing factor (0-1). Higher = snappier, lower = smoother */
  smoothing?: number;
  /** After this many ms without update, mark drone as stale */
  staleThresholdMs?: number;
  /** Callback when a drone is clicked */
  onDroneClick?: (droneId: string) => void;
}

export class DroneAnimationManager {
  private mapEl: any;
  private maps3dLib: any;
  private drones = new Map<string, DroneState>();
  private rafId: number | null = null;
  private running = false;
  private smoothing: number;
  private staleThresholdMs: number;
  private onDroneClick?: (droneId: string) => void;

  constructor(
    mapEl: any,
    maps3dLib: any,
    options: DroneAnimationManagerOptions = {},
  ) {
    this.mapEl = mapEl;
    this.maps3dLib = maps3dLib;
    this.smoothing = options.smoothing ?? 0.15;
    this.staleThresholdMs = options.staleThresholdMs ?? 10000;
    this.onDroneClick = options.onDroneClick;
  }

  /** Start the animation loop */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.tick();
  }

  /** Stop the animation loop */
  stop(): void {
    this.running = false;
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /** Clean up all drone elements and stop animation */
  dispose(): void {
    this.stop();
    for (const [, state] of this.drones) {
      state.markerEl?.remove();
      state.modelEl?.remove();
    }
    this.drones.clear();
  }

  /**
   * Update a drone's target position. The animation loop will smoothly
   * interpolate the marker/model to this position.
   */
  updateDrone(
    trackerId: string,
    lat: number,
    lng: number,
    alt: number,
    options?: {
      heading?: number;
      speedMps?: number;
      isStale?: boolean;
      modelSrc?: string;
      displayName?: string;
      modelScale?: number;
      modelAsset?: ModelAsset;
    },
  ): void {
    const now = Date.now();
    let state = this.drones.get(trackerId);

    if (!state) {
      // Create new drone elements
      state = this.createDroneElements(trackerId, lat, lng, alt, options);
      this.drones.set(trackerId, state);
    }

    // Compute heading from previous to new position if not provided
    const newHeading = options?.heading ??
      bearing(state.currentLat, state.currentLng, lat, lng);

    // Track previous values for flight dynamics
    state.prevHeading = state.heading;
    state.prevSpeedMps = state.currentSpeedMps;
    state.currentSpeedMps = options?.speedMps ?? 0;

    state.targetLat = lat;
    state.targetLng = lng;
    state.targetAlt = alt;
    state.heading = newHeading;
    state.lastUpdateTime = now;
    state.isStale = options?.isStale ?? false;
    if (options?.modelScale != null) state.modelScale = options.modelScale;
  }

  /** Remove a drone from the map */
  removeDrone(trackerId: string): void {
    const state = this.drones.get(trackerId);
    if (!state) return;
    state.markerEl?.remove();
    state.modelEl?.remove();
    this.drones.delete(trackerId);
  }

  /** Get all active drone tracker IDs */
  getActiveDrones(): string[] {
    return Array.from(this.drones.keys());
  }

  // ---- Private ----

  private tick = (): void => {
    if (!this.running) return;

    const now = Date.now();

    for (const [, state] of this.drones) {
      // Check for stale drones
      if (now - state.lastUpdateTime > this.staleThresholdMs && !state.isStale) {
        state.isStale = true;
      }

      // Exponential smoothing interpolation
      const dx = state.targetLat - state.currentLat;
      const dy = state.targetLng - state.currentLng;
      const dz = state.targetAlt - state.currentAlt;

      // Compute flight dynamics (pitch/roll)
      const dtSec = (now - state.lastUpdateTime) / 1000 || 0.033; // fallback ~30fps
      const targetPitch = computePitch(state.currentSpeedMps, state.prevSpeedMps, dtSec);
      const targetRoll = computeRoll(state.heading, state.prevHeading, dtSec);
      state.smoothedPitch = smoothValue(state.smoothedPitch, targetPitch, this.smoothing);
      state.smoothedRoll = smoothValue(state.smoothedRoll, targetRoll, this.smoothing);

      // Only update if there's meaningful movement
      if (Math.abs(dx) > 1e-8 || Math.abs(dy) > 1e-8 || Math.abs(dz) > 0.01) {
        state.currentLat += dx * this.smoothing;
        state.currentLng += dy * this.smoothing;
        state.currentAlt += dz * this.smoothing;

        // Update element positions
        const pos = {
          lat: state.currentLat,
          lng: state.currentLng,
          altitude: state.currentAlt,
        };

        if (state.markerEl) {
          state.markerEl.position = pos;
        }
        if (state.modelEl) {
          state.modelEl.position = pos;
          state.modelEl.orientation = {
            heading: state.heading + state.headingOffset,
            tilt: 270 + state.smoothedPitch,
            roll: state.smoothedRoll,
          };
        }
      } else if (state.modelEl) {
        // Even if position hasn't changed, still update orientation for smoothed dynamics
        state.modelEl.orientation = {
          heading: state.heading + state.headingOffset,
          tilt: 270 + state.smoothedPitch,
          roll: state.smoothedRoll,
        };
      }
    }

    this.rafId = requestAnimationFrame(this.tick);
  };

  private createDroneElements(
    trackerId: string,
    lat: number,
    lng: number,
    alt: number,
    options?: {
      heading?: number;
      speedMps?: number;
      isStale?: boolean;
      modelSrc?: string;
      displayName?: string;
      modelScale?: number;
      modelAsset?: ModelAsset;
    },
  ): DroneState {
    const { Marker3DInteractiveElement } = this.maps3dLib;
    const baseUrl = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';

    const pos = { lat, lng, altitude: alt };
    const asset = options?.modelAsset;
    const headingOffset = asset?.headingOffset ?? 0;

    // Marker (always created, serves as label + fallback)
    const marker = new Marker3DInteractiveElement();
    marker.setAttribute('data-layer', 'drone-anim');
    marker.setAttribute('data-drone-id', trackerId);
    marker.position = pos;
    marker.altitudeMode = 'RELATIVE_TO_MESH';
    marker.extruded = true;
    marker.drawsWhenOccluded = true;
    marker.title = options?.displayName ?? trackerId;

    if (this.onDroneClick) {
      const droneId = trackerId;
      const onClick = this.onDroneClick;
      marker.addEventListener('gmp-click', (e: any) => {
        e.stopPropagation?.();
        onClick(droneId);
      });
    }

    this.mapEl.append(marker);

    // 3D model via shared factory (or legacy modelSrc fallback)
    let modelEl: any = null;
    const scale = options?.modelScale ?? asset?.google3dScale ?? 10;
    if (asset) {
      modelEl = createModel3D({
        maps3dLib: this.maps3dLib,
        asset,
        baseUrl,
        position: pos,
        headingDeg: options?.heading ?? 0,
        dataLayer: 'drone-anim',
        dataId: { key: 'data-drone-id', value: trackerId },
      });
    } else if (options?.modelSrc) {
      // Legacy fallback when no ModelAsset is provided
      const { Model3DInteractiveElement } = this.maps3dLib;
      if (Model3DInteractiveElement) {
        try {
          modelEl = new Model3DInteractiveElement({
            src: options.modelSrc,
            position: pos,
            altitudeMode: 'RELATIVE_TO_GROUND',
            orientation: { heading: (options?.heading ?? 0) + headingOffset, tilt: 270, roll: 0 },
            scale,
          });
        } catch {
          try {
            modelEl = new Model3DInteractiveElement();
            modelEl.src = options.modelSrc;
            modelEl.position = pos;
            modelEl.altitudeMode = 'RELATIVE_TO_GROUND';
            modelEl.orientation = { heading: (options?.heading ?? 0) + headingOffset, tilt: 0, roll: 0 };
            modelEl.scale = scale;
          } catch { /* model unavailable */ }
        }
        if (modelEl) {
          modelEl.setAttribute('data-layer', 'drone-anim');
          modelEl.setAttribute('data-drone-id', trackerId);
        }
      }
    }

    if (modelEl) {
      if (this.onDroneClick) {
        const droneId = trackerId;
        const onClick = this.onDroneClick;
        modelEl.addEventListener('gmp-click', (e: any) => {
          e.stopPropagation?.();
          onClick(droneId);
        });
      }
      this.mapEl.append(modelEl);
    }

    return {
      trackerId,
      currentLat: lat,
      currentLng: lng,
      currentAlt: alt,
      targetLat: lat,
      targetLng: lng,
      targetAlt: alt,
      heading: options?.heading ?? 0,
      prevHeading: options?.heading ?? 0,
      prevSpeedMps: 0,
      currentSpeedMps: options?.speedMps ?? 0,
      smoothedPitch: 0,
      smoothedRoll: 0,
      lastUpdateTime: Date.now(),
      markerEl: marker,
      modelEl,
      isStale: options?.isStale ?? false,
      modelScale: scale,
      headingOffset,
    };
  }
}
