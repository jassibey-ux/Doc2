/**
 * useClientDemoMode — Frontend-only synthetic drone generator.
 * No backend dependency. Produces 4 drones with distinct movement patterns
 * around a hardcoded SF center, plus 2 geofence zones.
 *
 * Accepts `enabled: boolean` — starts/stops the 1-second tick interval.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { DroneSummary, PositionPoint } from '../../../types/drone';
import type { GeofenceZone } from '../../../types/blueUas';
import { destinationPoint } from '../../../utils/geo';

// SF center
const CENTER_LAT = 37.7749;
const CENTER_LON = -122.4194;

const TICK_MS = 1000;
const MAX_HISTORY = 500;

// Drone definitions
interface DemoDroneConfig {
  id: string;
  alias: string;
  pattern: 'circle' | 'circle-ccw' | 'figure8' | 'square';
  radiusM: number;
  altM: number;
  speedMps: number;
  initialBatteryMv: number;
  batteryDrainPerTick: number;
}

const DRONE_CONFIGS: DemoDroneConfig[] = [
  {
    id: 'demo-uav-01',
    alias: 'Patrol Alpha',
    pattern: 'circle',
    radiusM: 200,
    altM: 50,
    speedMps: 8,
    initialBatteryMv: 16200,
    batteryDrainPerTick: 2,
  },
  {
    id: 'demo-uav-02',
    alias: 'Patrol Bravo',
    pattern: 'circle-ccw',
    radiusM: 350,
    altM: 80,
    speedMps: 10,
    initialBatteryMv: 14800,
    batteryDrainPerTick: 3,
  },
  {
    id: 'demo-uav-03',
    alias: 'Recon Charlie',
    pattern: 'figure8',
    radiusM: 280,
    altM: 40,
    speedMps: 6,
    initialBatteryMv: 11200, // starts low for alert testing
    batteryDrainPerTick: 5,
  },
  {
    id: 'demo-uav-04',
    alias: 'Overwatch Delta',
    pattern: 'square',
    radiusM: 250,
    altM: 100,
    speedMps: 7,
    initialBatteryMv: 15600,
    batteryDrainPerTick: 2,
  },
];

// Low battery threshold (matches backend: 11.1V = 11100mV)
const LOW_BATTERY_MV = 11100;

function computePosition(
  config: DemoDroneConfig,
  tick: number,
): { lat: number; lon: number; heading: number } {
  // Angular speed: speed / circumference * 360
  const circumference = 2 * Math.PI * config.radiusM;
  const degreesPerTick = (config.speedMps / circumference) * 360;
  const angle = tick * degreesPerTick;

  switch (config.pattern) {
    case 'circle': {
      const bearing = angle % 360;
      const pos = destinationPoint(CENTER_LAT, CENTER_LON, bearing, config.radiusM);
      return { ...pos, heading: (bearing + 90) % 360 };
    }
    case 'circle-ccw': {
      const bearing = (360 - (angle % 360)) % 360;
      const pos = destinationPoint(CENTER_LAT, CENTER_LON, bearing, config.radiusM);
      return { ...pos, heading: (bearing - 90 + 360) % 360 };
    }
    case 'figure8': {
      // Lissajous: x = R*sin(t), y = R*sin(2t)/2
      const t = (angle * Math.PI) / 180;
      const xOffset = config.radiusM * Math.sin(t);
      const yOffset = (config.radiusM / 2) * Math.sin(2 * t);
      // Convert offsets to lat/lon
      const latOffset = yOffset / 111320;
      const lonOffset = xOffset / (111320 * Math.cos((CENTER_LAT * Math.PI) / 180));
      const lat = CENTER_LAT + latOffset;
      const lon = CENTER_LON + lonOffset;
      // Approximate heading from velocity
      const dx = config.radiusM * Math.cos(t);
      const dy = config.radiusM * Math.cos(2 * t);
      const heading = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
      return { lat, lon, heading };
    }
    case 'square': {
      // 4-waypoint patrol: N, E, S, W at radius distance
      const waypoints = [0, 90, 180, 270].map(b =>
        destinationPoint(CENTER_LAT, CENTER_LON, b, config.radiusM),
      );
      const totalPerimeter = 4 * config.radiusM * 2; // approximate
      const distAlongPath = ((tick * config.speedMps) % totalPerimeter);
      const segmentLen = totalPerimeter / 4;
      const segIdx = Math.floor(distAlongPath / segmentLen) % 4;
      const frac = (distAlongPath % segmentLen) / segmentLen;
      const from = waypoints[segIdx];
      const to = waypoints[(segIdx + 1) % 4];
      const lat = from.lat + (to.lat - from.lat) * frac;
      const lon = from.lon + (to.lon - from.lon) * frac;
      const heading = [90, 180, 270, 0][segIdx];
      return { lat, lon, heading };
    }
  }
}

interface UseClientDemoModeReturn {
  demoDrones: Map<string, DroneSummary>;
  demoDroneHistory: Map<string, PositionPoint[]>;
  demoGeofenceZones: GeofenceZone[];
  demoSiteCenter: { lat: number; lon: number };
  isDemoActive: boolean;
}

export function useClientDemoMode(enabled: boolean): UseClientDemoModeReturn {
  const [demoDrones, setDemoDrones] = useState<Map<string, DroneSummary>>(new Map());
  const [demoDroneHistory, setDemoDroneHistory] = useState<Map<string, PositionPoint[]>>(new Map());
  const tickRef = useRef(0);
  const batteryRef = useRef<Map<string, number>>(new Map());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    tickRef.current = 0;
    batteryRef.current.clear();
    setDemoDrones(new Map());
    setDemoDroneHistory(new Map());
  }, []);

  useEffect(() => {
    if (!enabled) {
      cleanup();
      return;
    }

    // Initialize batteries
    for (const cfg of DRONE_CONFIGS) {
      batteryRef.current.set(cfg.id, cfg.initialBatteryMv);
    }

    const tick = () => {
      tickRef.current++;
      const t = tickRef.current;
      const now = new Date().toISOString();

      const nextDrones = new Map<string, DroneSummary>();
      const historyUpdates: Array<{ id: string; point: PositionPoint }> = [];

      for (const cfg of DRONE_CONFIGS) {
        const { lat, lon, heading } = computePosition(cfg, t);
        const battery = (batteryRef.current.get(cfg.id) ?? cfg.initialBatteryMv) - cfg.batteryDrainPerTick;
        batteryRef.current.set(cfg.id, Math.max(battery, 8000));

        const drone: DroneSummary = {
          tracker_id: cfg.id,
          alias: cfg.alias,
          lat,
          lon,
          alt_m: cfg.altM,
          rssi_dbm: -45 - Math.floor(Math.random() * 15),
          fix_valid: true,
          is_stale: false,
          age_seconds: 0,
          last_update: now,
          battery_mv: battery,
          speed_mps: cfg.speedMps + (Math.random() - 0.5) * 2,
          heading_deg: heading,
          low_battery: battery < LOW_BATTERY_MV,
          battery_critical: battery < 9500,
        };
        nextDrones.set(cfg.id, drone);

        historyUpdates.push({
          id: cfg.id,
          point: { lat, lon, alt_m: cfg.altM, timestamp: Date.now() },
        });
      }

      setDemoDrones(nextDrones);

      setDemoDroneHistory(prev => {
        const next = new Map(prev);
        for (const { id, point } of historyUpdates) {
          const existing = next.get(id) ?? [];
          const updated = [...existing, point];
          next.set(id, updated.length > MAX_HISTORY ? updated.slice(-MAX_HISTORY) : updated);
        }
        return next;
      });
    };

    // Fire immediately, then every second
    tick();
    intervalRef.current = setInterval(tick, TICK_MS);

    return cleanup;
  }, [enabled, cleanup]);

  const demoGeofenceZones: GeofenceZone[] = [
    {
      id: 'demo-zone-auth',
      name: 'Authorized Flight Corridor',
      type: 'authorized_corridor',
      center: { lat: CENTER_LAT, lng: CENTER_LON },
      radiusM: 500,
      minAltitudeM: 30,
      maxAltitudeM: 120,
      fillColor: 'rgba(34, 197, 94, 0.15)',
      strokeColor: '#22c55e',
      fillOpacity: 0.15,
      extruded: true,
      active: true,
    },
    {
      id: 'demo-zone-restricted',
      name: 'Restricted Airspace',
      type: 'restricted_airspace',
      center: { lat: CENTER_LAT - 0.003, lng: CENTER_LON + 0.001 },
      radiusM: 200,
      minAltitudeM: 0,
      maxAltitudeM: 400,
      fillColor: 'rgba(239, 68, 68, 0.2)',
      strokeColor: '#ef4444',
      fillOpacity: 0.2,
      extruded: true,
      active: true,
    },
  ];

  return {
    demoDrones,
    demoDroneHistory,
    demoGeofenceZones,
    demoSiteCenter: { lat: CENTER_LAT, lon: CENTER_LON },
    isDemoActive: enabled && demoDrones.size > 0,
  };
}
