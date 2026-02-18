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

interface DroneState {
  trackerId: string;
  currentLat: number;
  currentLng: number;
  currentAlt: number;
  targetLat: number;
  targetLng: number;
  targetAlt: number;
  heading: number;
  lastUpdateTime: number;
  markerEl: any;
  modelEl: any | null;
  isStale: boolean;
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
      isStale?: boolean;
      modelSrc?: string;
      displayName?: string;
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

    state.targetLat = lat;
    state.targetLng = lng;
    state.targetAlt = alt;
    state.heading = newHeading;
    state.lastUpdateTime = now;
    state.isStale = options?.isStale ?? false;
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
        // Could update marker color here for stale indication
      }

      // Exponential smoothing interpolation
      const dx = state.targetLat - state.currentLat;
      const dy = state.targetLng - state.currentLng;
      const dz = state.targetAlt - state.currentAlt;

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
            heading: state.heading - 90,
            tilt: 0,
            roll: 0,
          };
        }
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
      isStale?: boolean;
      modelSrc?: string;
      displayName?: string;
    },
  ): DroneState {
    const { Marker3DInteractiveElement, Model3DInteractiveElement } = this.maps3dLib;

    const pos = { lat, lng, altitude: alt };

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

    // Optional 3D model
    let modelEl: any = null;
    if (options?.modelSrc && Model3DInteractiveElement) {
      modelEl = new Model3DInteractiveElement();
      modelEl.setAttribute('data-layer', 'drone-anim');
      modelEl.setAttribute('data-drone-id', trackerId);
      modelEl.src = options.modelSrc;
      modelEl.position = pos;
      modelEl.altitudeMode = 'RELATIVE_TO_MESH';
      modelEl.orientation = { heading: (options?.heading ?? 0) - 90, tilt: 0, roll: 0 };
      modelEl.scale = 10;

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
      lastUpdateTime: Date.now(),
      markerEl: marker,
      modelEl,
      isStale: options?.isStale ?? false,
    };
  }
}
