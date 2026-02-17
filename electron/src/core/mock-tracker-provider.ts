/**
 * Mock Tracker Provider
 * Provides simulated drone tracker data for demo mode
 */

import { EventEmitter } from 'events';
import log from 'electron-log';
import type { GpsDenialZone } from './demo-scenarios';

export interface MockTrackerConfig {
  trackerId: string;
  startPosition: [number, number]; // [lon, lat]
  altitude: number;
  speed: number; // m/s
  heading: number; // degrees
  pattern: 'linear' | 'circular' | 'random' | 'waypoints' | 'hover';
  waypoints?: [number, number][];
  extendedWaypoints?: [number, number, number, number][]; // [lon, lat, alt, speed]
  gpsDenialAffected?: boolean;
  color?: string;
}

export interface TrackerPosition {
  tracker_id: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  altitude_m: number;
  speed_ms: number;
  heading_deg: number;
  rssi_dbm: number;
  gps_quality: 'good' | 'degraded' | 'poor';
  source: 'mock' | 'live';
  // GPS health fields for simulation
  hdop: number;
  satellites: number;
  fix_valid: boolean;
  battery_mv: number;
}

interface TrackerState {
  config: MockTrackerConfig;
  position: [number, number];
  heading: number;
  waypointIndex: number;
  hoverTime: number;
  // GPS health simulation state
  gpsHealthPhase: 'healthy' | 'degrading' | 'lost' | 'recovering';
  gpsHealthTimer: number;
  batteryMv: number;
  // Extended waypoint state
  segmentT: number;
  currentAltitude: number;
  currentSpeed: number;
  finished: boolean;
  // GPS denial drift state
  driftLat: number;
  driftLon: number;
}

const EARTH_R = 6_371_000;

/** Haversine distance in meters between two lat/lon points */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r1 = (lat1 * Math.PI) / 180;
  const r2 = (lat2 * Math.PI) / 180;
  const dl = ((lat2 - lat1) * Math.PI) / 180;
  const dn = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dl / 2) ** 2 + Math.cos(r1) * Math.cos(r2) * Math.sin(dn / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(a));
}

/** Bearing in degrees from point 1 to point 2 */
function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r1 = (lat1 * Math.PI) / 180;
  const r2 = (lat2 * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const x = Math.sin(dl) * Math.cos(r2);
  const y = Math.cos(r1) * Math.sin(r2) - Math.sin(r1) * Math.cos(r2) * Math.cos(dl);
  return ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
}

/** Destination point given start lat/lon, bearing (degrees), and distance (meters) */
function destPoint(lat: number, lon: number, brngDeg: number, distM: number): [number, number] {
  const rl = (lat * Math.PI) / 180;
  const rn = (lon * Math.PI) / 180;
  const br = (brngDeg * Math.PI) / 180;
  const d = distM / EARTH_R;
  const nl = Math.asin(Math.sin(rl) * Math.cos(d) + Math.cos(rl) * Math.sin(d) * Math.cos(br));
  const nn = rn + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(rl), Math.cos(d) - Math.sin(rl) * Math.sin(nl));
  return [(nl * 180) / Math.PI, (nn * 180) / Math.PI];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class MockTrackerProvider extends EventEmitter {
  private trackers: Map<string, TrackerState> = new Map();
  private interval: NodeJS.Timeout | null = null;
  private enabled: boolean = false;
  private updateRate: number = 1000; // 1Hz default
  private gpsDenialZones: GpsDenialZone[] = [];

  constructor(updateRateMs: number = 1000) {
    super();
    this.updateRate = updateRateMs;
  }

  /**
   * Set GPS denial zones for spatial degradation
   */
  setGpsDenialZones(zones: GpsDenialZone[]): void {
    this.gpsDenialZones = zones;
    log.info(`Set ${zones.length} GPS denial zone(s)`);
  }

  /**
   * Add a mock tracker with configuration
   */
  addMockTracker(config: MockTrackerConfig): void {
    // Calculate unique offset based on tracker ID for staggered GPS health cycles
    const trackerIndex = this.trackers.size;
    const phaseOffset = trackerIndex * 20; // 20 second offset per tracker

    // Special case for low battery demo tracker
    const isLowBatTracker = config.trackerId.includes('LOW-BAT');
    const initialBattery = isLowBatTracker ? 3100 + Math.random() * 200 : 3800 + Math.random() * 400;

    this.trackers.set(config.trackerId, {
      config,
      position: [...config.startPosition],
      heading: config.heading,
      waypointIndex: 0,
      hoverTime: 0,
      // GPS health simulation - start with different phases for variety
      gpsHealthPhase: 'healthy',
      gpsHealthTimer: phaseOffset, // Staggered offset for phase changes
      batteryMv: initialBattery,
      // Extended waypoint state
      segmentT: 0,
      currentAltitude: config.altitude,
      currentSpeed: config.speed,
      finished: false,
      // GPS denial drift
      driftLat: 0,
      driftLon: 0,
    });
    log.info(`Added mock tracker: ${config.trackerId} (phase offset: ${phaseOffset}s, battery: ${initialBattery}mV)`);
  }

  /**
   * Remove a mock tracker
   */
  removeMockTracker(trackerId: string): void {
    this.trackers.delete(trackerId);
    log.info(`Removed mock tracker: ${trackerId}`);
  }

  /**
   * Get all tracker IDs
   */
  getTrackerIds(): string[] {
    return Array.from(this.trackers.keys());
  }

  /**
   * Check if mock mode is running
   */
  isRunning(): boolean {
    return this.enabled;
  }

  /**
   * Start mock tracker simulation
   */
  start(): void {
    if (this.enabled) {
      log.warn('MockTrackerProvider already running');
      return;
    }

    this.enabled = true;
    log.info(`Starting mock tracker simulation with ${this.trackers.size} trackers`);

    this.interval = setInterval(() => {
      if (!this.enabled) return;

      for (const [trackerId, state] of this.trackers) {
        if (state.finished) continue;
        this.updateTrackerPosition(state);
        const position = this.createPositionUpdate(trackerId, state);
        this.emit('position', position);
      }
    }, this.updateRate);
  }

  /**
   * Stop mock tracker simulation
   */
  stop(): void {
    this.enabled = false;

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    log.info('Stopped mock tracker simulation');
  }

  /**
   * Clear all trackers
   */
  clear(): void {
    this.stop();
    this.trackers.clear();
    this.gpsDenialZones = [];
    log.info('Cleared all mock trackers');
  }

  /**
   * Update tracker position based on pattern
   */
  private updateTrackerPosition(state: TrackerState): void {
    const { config } = state;
    const dt = this.updateRate / 1000;

    // Extended waypoints: segment-progress approach (ported from Python Drone.tick())
    if (config.extendedWaypoints && config.extendedWaypoints.length > 1) {
      this.updateExtendedWaypoints(state, dt);
      return;
    }

    // Speed in degrees (rough conversion: 1 deg ≈ 111km at equator)
    const speedDeg = config.speed / 111000;

    switch (config.pattern) {
      case 'linear':
        state.position[0] += speedDeg * Math.sin((state.heading * Math.PI) / 180);
        state.position[1] += speedDeg * Math.cos((state.heading * Math.PI) / 180);
        break;

      case 'circular':
        // Gradually turn while moving
        state.heading = (state.heading + 2) % 360;
        state.position[0] += speedDeg * Math.sin((state.heading * Math.PI) / 180);
        state.position[1] += speedDeg * Math.cos((state.heading * Math.PI) / 180);
        break;

      case 'waypoints':
        if (config.waypoints && config.waypoints.length > 0) {
          const target = config.waypoints[state.waypointIndex];
          const dx = target[0] - state.position[0];
          const dy = target[1] - state.position[1];
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < speedDeg * 2) {
            // Reached waypoint, move to next
            state.waypointIndex = (state.waypointIndex + 1) % config.waypoints.length;
          } else {
            // Move toward waypoint
            state.heading = (Math.atan2(dx, dy) * 180) / Math.PI;
            state.position[0] += (dx / dist) * speedDeg;
            state.position[1] += (dy / dist) * speedDeg;
          }
        }
        break;

      case 'random':
        // Random heading changes
        state.heading += (Math.random() - 0.5) * 30;
        state.heading = ((state.heading % 360) + 360) % 360;
        state.position[0] += speedDeg * Math.sin((state.heading * Math.PI) / 180);
        state.position[1] += speedDeg * Math.cos((state.heading * Math.PI) / 180);
        break;

      case 'hover':
        // Small random drift while hovering
        state.position[0] += (Math.random() - 0.5) * speedDeg * 0.1;
        state.position[1] += (Math.random() - 0.5) * speedDeg * 0.1;
        state.hoverTime += this.updateRate / 1000;
        break;
    }
  }

  /**
   * Extended waypoints: segment-progress interpolation (ported from Python Drone.tick())
   * Waypoints are [lon, lat, alt, speed]. Progress along each segment is
   * computed from interpolated speed and haversine segment distance.
   */
  private updateExtendedWaypoints(state: TrackerState, dt: number): void {
    const wps = state.config.extendedWaypoints!;

    if (state.waypointIndex + 1 >= wps.length) {
      // Check if the path is a closed loop (first and last waypoints match)
      const first = wps[0];
      const last = wps[wps.length - 1];
      if (first[0] === last[0] && first[1] === last[1]) {
        // Loop: reset to beginning
        state.waypointIndex = 0;
        state.segmentT = 0;
      } else {
        state.finished = true;
        return;
      }
    }

    const w0 = wps[state.waypointIndex];
    const w1 = wps[state.waypointIndex + 1];

    // Haversine distance for the current segment (lat/lon from waypoints)
    const segDist = haversineDistance(w0[1], w0[0], w1[1], w1[0]);
    if (segDist < 0.1) {
      state.waypointIndex++;
      state.segmentT = 0;
      return;
    }

    // Interpolated speed between current and next waypoint
    const interpSpeed = lerp(w0[3], w1[3], state.segmentT);
    state.segmentT += (interpSpeed * dt) / segDist;

    if (state.segmentT >= 1.0) {
      // Arrived at next waypoint
      state.waypointIndex++;
      state.segmentT = 0;
      state.position[0] = w1[0];
      state.position[1] = w1[1];
      state.currentAltitude = w1[2];
      state.currentSpeed = w1[3];

      // Update heading toward the next segment if available
      if (state.waypointIndex + 1 < wps.length) {
        const w2 = wps[state.waypointIndex + 1];
        state.heading = bearingDeg(w1[1], w1[0], w2[1], w2[0]);
      }
      return;
    }

    // Lerp position, altitude, speed
    const t = state.segmentT;
    state.position[0] = lerp(w0[0], w1[0], t);
    state.position[1] = lerp(w0[1], w1[1], t);
    state.currentAltitude = lerp(w0[2], w1[2], t);
    state.currentSpeed = interpSpeed;
    state.heading = bearingDeg(w0[1], w0[0], w1[1], w1[0]);
  }

  /**
   * Create position update with realistic noise and GPS health simulation
   */
  private createPositionUpdate(trackerId: string, state: TrackerState): TrackerPosition {
    const { config } = state;
    const useExtended = !!(config.extendedWaypoints && config.extendedWaypoints.length > 1);

    // --- Spatial GPS denial for affected trackers ---
    if (config.gpsDenialAffected && this.gpsDenialZones.length > 0) {
      return this.createDenialPositionUpdate(trackerId, state, useExtended);
    }

    // --- Standard timer-based GPS health cycling ---
    // Update GPS health phase timer
    state.gpsHealthTimer += this.updateRate / 1000;

    // Simulate GPS health phase transitions for realistic testing
    // Each tracker cycles through health states at different intervals
    const cycleTime = 60; // 60 seconds per full cycle
    const phase = state.gpsHealthTimer % cycleTime;

    // Determine GPS health state based on phase
    // 0-40s: healthy, 40-50s: degrading, 50-55s: lost, 55-60s: recovering
    let hdop: number;
    let satellites: number;
    let fixValid: boolean;
    let gpsQuality: 'good' | 'degraded' | 'poor';

    if (phase < 40) {
      // Healthy GPS
      state.gpsHealthPhase = 'healthy';
      hdop = 1.0 + Math.random() * 0.8; // HDOP 1.0-1.8
      satellites = 8 + Math.floor(Math.random() * 4); // 8-12 satellites
      fixValid = true;
      gpsQuality = 'good';
    } else if (phase < 50) {
      // Degrading GPS
      state.gpsHealthPhase = 'degrading';
      hdop = 3.0 + Math.random() * 3.0; // HDOP 3.0-6.0
      satellites = 4 + Math.floor(Math.random() * 3); // 4-7 satellites
      fixValid = true;
      gpsQuality = 'degraded';
    } else if (phase < 55) {
      // Lost GPS
      state.gpsHealthPhase = 'lost';
      hdop = 10.0 + Math.random() * 5.0; // HDOP 10-15
      satellites = Math.floor(Math.random() * 3); // 0-2 satellites
      fixValid = false;
      gpsQuality = 'poor';
    } else {
      // Recovering GPS
      state.gpsHealthPhase = 'recovering';
      hdop = 2.0 + Math.random() * 2.0; // HDOP 2.0-4.0
      satellites = 5 + Math.floor(Math.random() * 3); // 5-8 satellites
      fixValid = true;
      gpsQuality = 'degraded';
    }

    // Add realistic GPS noise (worse when degraded/lost)
    const noiseFactor = state.gpsHealthPhase === 'healthy' ? 1 : state.gpsHealthPhase === 'lost' ? 5 : 2;
    const latNoise = (Math.random() - 0.5) * 0.00001 * noiseFactor;
    const lonNoise = (Math.random() - 0.5) * 0.00001 * noiseFactor;
    const altNoise = (Math.random() - 0.5) * 2 * noiseFactor;
    const speedNoise = (Math.random() - 0.5) * 1;

    // Simulate varying RSSI based on GPS health (correlated with environment)
    const baseRssi = state.gpsHealthPhase === 'healthy' ? -50 : state.gpsHealthPhase === 'lost' ? -80 : -65;
    const rssiVariation = Math.random() * 10;
    const rssi = baseRssi - rssiVariation;

    // Simulate battery drain
    state.batteryMv -= 0.05; // Slow drain
    if (state.batteryMv < 3000) {
      state.batteryMv = 3800 + Math.random() * 400; // Reset battery for demo
    }

    const altitude = useExtended ? state.currentAltitude : config.altitude;
    const speed = useExtended ? state.currentSpeed : config.speed;

    return {
      tracker_id: trackerId,
      timestamp: new Date().toISOString(),
      latitude: fixValid ? state.position[1] + latNoise : state.position[1],
      longitude: fixValid ? state.position[0] + lonNoise : state.position[0],
      altitude_m: altitude + altNoise,
      speed_ms: Math.max(0, speed + speedNoise),
      heading_deg: state.heading,
      rssi_dbm: rssi,
      gps_quality: gpsQuality,
      source: 'mock',
      hdop,
      satellites,
      fix_valid: fixValid,
      battery_mv: Math.round(state.batteryMv),
    };
  }

  /**
   * Create position update with spatial GPS denial degradation.
   * When the drone is inside a denial zone, GPS quality degrades proportionally
   * to distance from zone center (ported from Python Drone._apply_denial()).
   */
  private createDenialPositionUpdate(
    trackerId: string,
    state: TrackerState,
    useExtended: boolean,
  ): TrackerPosition {
    const { config } = state;

    // Find the nearest denial zone the drone is inside
    let inZone = false;
    let strength = 0;
    let activeZone: GpsDenialZone | null = null;

    for (const zone of this.gpsDenialZones) {
      const dist = haversineDistance(state.position[1], state.position[0], zone.center[1], zone.center[0]);
      if (dist < zone.radiusM) {
        const s = 1.0 - dist / zone.radiusM;
        if (s > strength) {
          strength = s;
          activeZone = zone;
          inZone = true;
        }
      }
    }

    let hdop: number;
    let satellites: number;
    let fixValid: boolean;
    let gpsQuality: 'good' | 'degraded' | 'poor';
    let reportLat = state.position[1];
    let reportLon = state.position[0];

    if (!inZone || !activeZone) {
      // Outside all denial zones — nominal GPS
      hdop = 0.9 + Math.random() * 0.2;
      satellites = 11 + Math.floor(Math.random() * 3);
      fixValid = true;
      gpsQuality = 'good';
      state.driftLat = 0;
      state.driftLon = 0;
    } else {
      // Inside denial zone — degrade proportionally
      const dz = activeZone;
      satellites = Math.max(dz.minSats, Math.floor(lerp(12, dz.minSats, strength)) + Math.floor(Math.random() * (dz.maxSats + 1)));
      hdop = lerp(0.9, dz.hdopMax, strength) + (Math.random() - 0.5) * 2;
      fixValid = Math.random() > 0.3 * strength;

      // Random-walk position drift (smoothed)
      const driftStep = dz.driftM * strength * Math.random();
      const driftBrng = Math.random() * 360;
      const [dl, dn] = destPoint(0, 0, driftBrng, driftStep);
      state.driftLat = state.driftLat * 0.8 + dl * 0.2;
      state.driftLon = state.driftLon * 0.8 + dn * 0.2;

      reportLat += state.driftLat;
      reportLon += state.driftLon;

      gpsQuality = strength > 0.6 ? 'poor' : strength > 0.3 ? 'degraded' : 'good';
    }

    // Minor noise
    const altNoise = (Math.random() - 0.5) * 2;
    const speedNoise = (Math.random() - 0.5) * 1;
    const rssi = -50 - Math.random() * 10;

    state.batteryMv -= 0.05;
    if (state.batteryMv < 3000) {
      state.batteryMv = 3800 + Math.random() * 400;
    }

    const altitude = useExtended ? state.currentAltitude : config.altitude;
    const speed = useExtended ? state.currentSpeed : config.speed;

    return {
      tracker_id: trackerId,
      timestamp: new Date().toISOString(),
      latitude: reportLat,
      longitude: reportLon,
      altitude_m: altitude + altNoise,
      speed_ms: Math.max(0, speed + speedNoise),
      heading_deg: state.heading,
      rssi_dbm: rssi,
      gps_quality: gpsQuality,
      source: 'mock',
      hdop,
      satellites,
      fix_valid: fixValid,
      battery_mv: Math.round(state.batteryMv),
    };
  }

  /**
   * Get default demo tracker configurations
   * Creates 4 trackers with different flight patterns and GPS health scenarios
   */
  static getDefaultDemoTrackers(siteCenter?: [number, number]): MockTrackerConfig[] {
    // Default to San Francisco if no site specified
    const center = siteCenter || [-122.4194, 37.7749];

    return [
      {
        trackerId: 'DEMO-001',
        startPosition: [center[0] + 0.005, center[1] + 0.003],
        altitude: 50,
        speed: 10,
        heading: 45,
        pattern: 'circular',
        color: '#ff6b00', // Orange - will cycle through GPS health states
      },
      {
        trackerId: 'DEMO-002',
        startPosition: [center[0] - 0.003, center[1] + 0.005],
        altitude: 100,
        speed: 15,
        heading: 180,
        pattern: 'waypoints',
        waypoints: [
          [center[0] - 0.003, center[1] + 0.005],
          [center[0] + 0.003, center[1] + 0.005],
          [center[0] + 0.003, center[1] - 0.003],
          [center[0] - 0.003, center[1] - 0.003],
        ],
        color: '#00c8b4', // Cyan - will cycle through GPS health states (offset)
      },
      {
        trackerId: 'DEMO-003',
        startPosition: [center[0] - 0.002, center[1] - 0.004],
        altitude: 30,
        speed: 8,
        heading: 90,
        pattern: 'hover',
        color: '#6366f1', // Indigo - will cycle through GPS health states (offset)
      },
      {
        trackerId: 'DEMO-LOW-BAT',
        startPosition: [center[0] + 0.002, center[1] - 0.003],
        altitude: 40,
        speed: 12,
        heading: 270,
        pattern: 'random',
        color: '#ef4444', // Red - demonstrates low battery warning
      },
    ];
  }

  /**
   * Get current positions of all trackers
   */
  getCurrentPositions(): TrackerPosition[] {
    const positions: TrackerPosition[] = [];

    for (const [trackerId, state] of this.trackers) {
      positions.push(this.createPositionUpdate(trackerId, state));
    }

    return positions;
  }
}

// Singleton instance for global access
let mockProviderInstance: MockTrackerProvider | null = null;

export function getMockTrackerProvider(): MockTrackerProvider {
  if (!mockProviderInstance) {
    mockProviderInstance = new MockTrackerProvider();
  }
  return mockProviderInstance;
}

export function resetMockTrackerProvider(): void {
  if (mockProviderInstance) {
    mockProviderInstance.clear();
    mockProviderInstance = null;
  }
}
