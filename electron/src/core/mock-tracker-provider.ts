/**
 * Mock Tracker Provider
 * Provides simulated drone tracker data for demo mode
 */

import { EventEmitter } from 'events';
import log from 'electron-log';

export interface MockTrackerConfig {
  trackerId: string;
  startPosition: [number, number]; // [lon, lat]
  altitude: number;
  speed: number; // m/s
  heading: number; // degrees
  pattern: 'linear' | 'circular' | 'random' | 'waypoints' | 'hover';
  waypoints?: [number, number][];
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
}

export class MockTrackerProvider extends EventEmitter {
  private trackers: Map<string, TrackerState> = new Map();
  private interval: NodeJS.Timeout | null = null;
  private enabled: boolean = false;
  private updateRate: number = 1000; // 1Hz default

  constructor(updateRateMs: number = 1000) {
    super();
    this.updateRate = updateRateMs;
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
    log.info('Cleared all mock trackers');
  }

  /**
   * Update tracker position based on pattern
   */
  private updateTrackerPosition(state: TrackerState): void {
    const { config } = state;
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
   * Create position update with realistic noise and GPS health simulation
   */
  private createPositionUpdate(trackerId: string, state: TrackerState): TrackerPosition {
    const { config } = state;

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

    return {
      tracker_id: trackerId,
      timestamp: new Date().toISOString(),
      latitude: fixValid ? state.position[1] + latNoise : state.position[1],
      longitude: fixValid ? state.position[0] + lonNoise : state.position[0],
      altitude_m: config.altitude + altNoise,
      speed_ms: Math.max(0, config.speed + speedNoise),
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
