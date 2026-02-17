/**
 * Demo Scenario Definitions
 * Registry of pre-configured demo scenarios for mock tracker simulation
 */

export interface GpsDenialZone {
  center: [number, number]; // [lon, lat]
  radiusM: number;
  minSats: number;
  maxSats: number;
  hdopMax: number;
  driftM: number;
}

export interface ScenarioTrackerConfig {
  trackerId: string;
  description: string;
  startPosition: [number, number]; // [lon, lat]
  altitude: number;
  speed: number;
  heading: number;
  pattern: 'waypoints';
  extendedWaypoints: [number, number, number, number][]; // [lon, lat, alt, speed]
  gpsDenialAffected?: boolean;
  color?: string;
}

export interface DemoScenario {
  id: string;
  name: string;
  description: string;
  siteCenter: [number, number]; // [lon, lat]
  trackers: ScenarioTrackerConfig[];
  gpsDenialZones?: GpsDenialZone[];
}

const BMO_FIELD_SCENARIO: DemoScenario = {
  id: 'bmo-field',
  name: 'BMO Field, Toronto',
  description: '5 drones approaching BMO Field from multiple directions with GPS denial zone',
  siteCenter: [-79.4186, 43.6332],
  gpsDenialZones: [
    {
      center: [-79.4186, 43.6332],
      radiusM: 400,
      minSats: 0,
      maxSats: 3,
      hdopMax: 25.0,
      driftM: 20.0,
    },
  ],
  trackers: [
    {
      trackerId: 'ALPHA-01',
      description: 'North approach over Exhibition Place — steady descent',
      startPosition: [-79.4180, 43.6420],
      altitude: 80,
      speed: 18,
      heading: 180,
      pattern: 'waypoints',
      gpsDenialAffected: false,
      color: '#ff6b00',
      extendedWaypoints: [
        [-79.4180, 43.6420, 80, 18],
        [-79.4183, 43.6395, 80, 16],
        [-79.4185, 43.6370, 75, 12],
        [-79.4186, 43.6355, 60, 8],
        [-79.4186, 43.6340, 50, 5],
        [-79.4186, 43.6332, 40, 3],
      ],
    },
    {
      trackerId: 'BRAVO-02',
      description: 'East approach from downtown Toronto — high altitude recon',
      startPosition: [-79.3900, 43.6450],
      altitude: 200,
      speed: 25,
      heading: 240,
      pattern: 'waypoints',
      gpsDenialAffected: false,
      color: '#00c8b4',
      extendedWaypoints: [
        [-79.3900, 43.6450, 200, 25],
        [-79.3980, 43.6420, 180, 22],
        [-79.4050, 43.6390, 150, 18],
        [-79.4120, 43.6365, 120, 14],
        [-79.4160, 43.6345, 100, 10],
        [-79.4180, 43.6335, 80, 6],
        [-79.4186, 43.6332, 60, 3],
      ],
    },
    {
      trackerId: 'CHARLIE-03',
      description: 'Southwest from Lake Ontario — GPS denial active',
      startPosition: [-79.4280, 43.6260],
      altitude: 60,
      speed: 20,
      heading: 45,
      pattern: 'waypoints',
      gpsDenialAffected: true,
      color: '#ef4444',
      extendedWaypoints: [
        [-79.4280, 43.6260, 60, 20],
        [-79.4260, 43.6275, 65, 18],
        [-79.4240, 43.6290, 70, 15],
        [-79.4220, 43.6305, 75, 12],
        [-79.4200, 43.6318, 70, 8],
        [-79.4190, 43.6330, 55, 5],
        [-79.4186, 43.6332, 45, 2],
      ],
    },
    {
      trackerId: 'DELTA-04',
      description: 'West approach from Parkdale — low and fast',
      startPosition: [-79.4350, 43.6365],
      altitude: 35,
      speed: 22,
      heading: 90,
      pattern: 'waypoints',
      gpsDenialAffected: false,
      color: '#6366f1',
      extendedWaypoints: [
        [-79.4350, 43.6365, 35, 22],
        [-79.4310, 43.6358, 35, 20],
        [-79.4270, 43.6350, 30, 18],
        [-79.4240, 43.6345, 28, 14],
        [-79.4210, 43.6340, 25, 10],
        [-79.4195, 43.6335, 22, 6],
        [-79.4186, 43.6332, 20, 3],
      ],
    },
    {
      trackerId: 'ECHO-05',
      description: 'Southeast orbit — circling surveillance pattern',
      startPosition: [-79.4120, 43.6290],
      altitude: 120,
      speed: 15,
      heading: 315,
      pattern: 'waypoints',
      gpsDenialAffected: false,
      color: '#eab308',
      extendedWaypoints: [
        [-79.4120, 43.6290, 120, 15],
        [-79.4140, 43.6310, 120, 15],
        [-79.4130, 43.6340, 115, 14],
        [-79.4160, 43.6355, 110, 14],
        [-79.4200, 43.6350, 110, 13],
        [-79.4220, 43.6330, 108, 13],
        [-79.4200, 43.6305, 105, 12],
        [-79.4170, 43.6290, 105, 12],
        [-79.4120, 43.6290, 120, 15], // loop back to start
      ],
    },
  ],
};

const DEFAULT_SCENARIO: DemoScenario = {
  id: 'default',
  name: 'Default (4 drones)',
  description: 'Generic demo with 4 trackers using simple flight patterns',
  siteCenter: [-122.4194, 37.7749],
  trackers: [], // empty signals use of getDefaultDemoTrackers()
};

export const DEMO_SCENARIOS: DemoScenario[] = [DEFAULT_SCENARIO, BMO_FIELD_SCENARIO];

export function getScenarioById(id: string): DemoScenario | undefined {
  return DEMO_SCENARIOS.find((s) => s.id === id);
}
