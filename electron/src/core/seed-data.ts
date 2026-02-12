/**
 * Seed Data for SCENSUS Dashboard
 * Provides realistic demo data for first-run experience
 */

import { SiteDefinition, DroneProfile, CUASProfile } from './models/workflow';

/**
 * Demo test sites with realistic boundary polygons
 */
export const SEED_SITES: Omit<SiteDefinition, 'created_at' | 'updated_at'>[] = [
  {
    id: 'demo-site-alpha',
    name: 'Alpha Test Range',
    center: { lat: 37.7749, lon: -122.4194 },
    boundary_polygon: [
      { lat: 37.780, lon: -122.425 },
      { lat: 37.780, lon: -122.410 },
      { lat: 37.770, lon: -122.410 },
      { lat: 37.770, lon: -122.425 },
      { lat: 37.780, lon: -122.425 },
    ],
    markers: [
      {
        id: 'marker-alpha-cp',
        name: 'Command Post',
        type: 'command_post',
        position: { lat: 37.775, lon: -122.420 },
        notes: 'Main operations center',
      },
      {
        id: 'marker-alpha-launch',
        name: 'Launch Point A',
        type: 'launch_point',
        position: { lat: 37.778, lon: -122.415 },
        notes: 'Primary drone launch location',
      },
    ],
    zones: [
      {
        id: 'zone-alpha-test',
        name: 'Primary Test Area',
        type: 'test_area',
        polygon: [
          { lat: 37.778, lon: -122.420 },
          { lat: 37.778, lon: -122.412 },
          { lat: 37.772, lon: -122.412 },
          { lat: 37.772, lon: -122.420 },
        ],
        color: '#3b82f6',
        opacity: 0.3,
        notes: 'Main jamming test area',
      },
    ],
    environment_type: 'open_field',
    rf_notes: 'Demo site - San Francisco area test range for CUAS evaluation',
  },
  {
    id: 'demo-site-bravo',
    name: 'Bravo Urban Environment',
    center: { lat: 34.0522, lon: -118.2437 },
    boundary_polygon: [
      { lat: 34.060, lon: -118.250 },
      { lat: 34.060, lon: -118.235 },
      { lat: 34.045, lon: -118.235 },
      { lat: 34.045, lon: -118.250 },
      { lat: 34.060, lon: -118.250 },
    ],
    markers: [
      {
        id: 'marker-bravo-cp',
        name: 'Urban Command Post',
        type: 'command_post',
        position: { lat: 34.052, lon: -118.245 },
        notes: 'Rooftop operations center',
      },
    ],
    zones: [],
    environment_type: 'urban',
    rf_notes: 'Demo site - Los Angeles urban test environment with building interference',
  },
  {
    id: 'demo-site-charlie',
    name: 'Charlie Open Field',
    center: { lat: 39.7392, lon: -104.9903 },
    boundary_polygon: [
      { lat: 39.745, lon: -105.000 },
      { lat: 39.745, lon: -104.980 },
      { lat: 39.735, lon: -104.980 },
      { lat: 39.735, lon: -105.000 },
      { lat: 39.745, lon: -105.000 },
    ],
    markers: [],
    zones: [],
    environment_type: 'open_field',
    rf_notes: 'Demo site - Denver open field for baseline testing with minimal interference',
  },
];

/**
 * Demo drone profiles covering common threat categories
 */
export const SEED_DRONE_PROFILES: Omit<DroneProfile, 'created_at' | 'updated_at'>[] = [
  {
    id: 'drone-dji-mavic3',
    name: 'DJI Mavic 3',
    make: 'DJI',
    model: 'Mavic 3',
    weight_class: 'mini',
    frequency_bands: ['2.4GHz RC', '5.8GHz video', 'GPS L1'],
    expected_failsafe: 'rth',
    max_speed_mps: 21,
    max_altitude_m: 6000,
    endurance_minutes: 46,
    notes: 'Common consumer drone - primary test platform for standard detection scenarios',
  },
  {
    id: 'drone-dji-m30',
    name: 'DJI Matrice 30T',
    make: 'DJI',
    model: 'Matrice 30T',
    weight_class: 'small',
    frequency_bands: ['2.4GHz RC', '5.8GHz video', 'O3', 'GPS L1', 'GPS L2'],
    expected_failsafe: 'rth',
    max_speed_mps: 23,
    max_altitude_m: 7000,
    endurance_minutes: 41,
    notes: 'Enterprise inspection drone with thermal - tests larger RCS detection',
  },
  {
    id: 'drone-autel-evo2',
    name: 'Autel EVO II Pro',
    make: 'Autel',
    model: 'EVO II Pro',
    weight_class: 'small',
    frequency_bands: ['2.4GHz RC', '5.8GHz video', 'GPS L1'],
    expected_failsafe: 'rth',
    max_speed_mps: 20,
    max_altitude_m: 7000,
    endurance_minutes: 42,
    notes: 'Alternative commercial platform - validates multi-vendor detection',
  },
  {
    id: 'drone-custom-fpv',
    name: 'Custom FPV Racer',
    make: 'Custom Build',
    model: 'FPV 5" Quad',
    weight_class: 'mini',
    frequency_bands: ['5.8GHz video', '2.4GHz RC'],
    expected_failsafe: 'land',
    max_speed_mps: 45,
    max_altitude_m: 500,
    endurance_minutes: 5,
    notes: 'High-speed FPV threat simulation - tests rapid response capabilities',
  },
  {
    id: 'drone-parrot-anafi',
    name: 'Parrot ANAFI USA',
    make: 'Parrot',
    model: 'ANAFI USA',
    weight_class: 'mini',
    frequency_bands: ['2.4GHz RC', '5.8GHz video', 'GPS L1'],
    expected_failsafe: 'rth',
    max_speed_mps: 15,
    max_altitude_m: 4500,
    endurance_minutes: 32,
    notes: 'Government-approved drone - validates non-DJI protocol detection',
  },
  {
    id: 'drone-skydio-2',
    name: 'Skydio 2+',
    make: 'Skydio',
    model: '2+',
    weight_class: 'mini',
    frequency_bands: ['2.4GHz RC', '5.8GHz video', 'GPS L1'],
    expected_failsafe: 'hover',
    max_speed_mps: 17,
    max_altitude_m: 6000,
    endurance_minutes: 27,
    notes: 'Autonomous flight capable - tests detection of AI-driven flight patterns',
  },
];

/**
 * Demo CUAS profiles covering detection and mitigation systems
 */
export const SEED_CUAS_PROFILES: Omit<CUASProfile, 'created_at' | 'updated_at'>[] = [
  {
    id: 'cuas-rf-jammer-alpha',
    name: 'RF Jammer Alpha',
    vendor: 'CUAS Systems Inc',
    model: 'J-1000',
    type: 'jammer',
    capabilities: ['GPS L1', 'WiFi 2.4GHz', 'WiFi 5.8GHz'],
    effective_range_m: 1000,
    beam_width_deg: 60,
    antenna_pattern: 'directional',
    power_output_w: 50,
    antenna_gain_dbi: 12,
    frequency_ranges: ['2.4-2.5GHz', '5.7-5.9GHz', '1.575GHz'],
    notes: 'Primary RF disruption unit - 60deg sector coverage for targeted jamming',
  },
  {
    id: 'cuas-rf-jammer-bravo',
    name: 'RF Jammer Bravo',
    vendor: 'CUAS Systems Inc',
    model: 'J-1500',
    type: 'jammer',
    capabilities: ['GPS L1', 'GPS L2', 'WiFi 2.4GHz', 'WiFi 5.8GHz', '900MHz', '433MHz'],
    effective_range_m: 1500,
    beam_width_deg: 90,
    antenna_pattern: 'sector',
    power_output_w: 100,
    antenna_gain_dbi: 10,
    frequency_ranges: ['0.4-0.5GHz', '0.9-1.0GHz', '2.4-2.5GHz', '5.7-5.9GHz', '1.575GHz', '1.227GHz'],
    notes: 'Extended range sector jammer - covers additional IoT frequencies',
  },
  {
    id: 'cuas-rf-jammer-omni',
    name: 'RF Jammer Omni',
    vendor: 'DefenseTech',
    model: 'O-500',
    type: 'jammer',
    capabilities: ['GPS L1', 'WiFi 2.4GHz', 'WiFi 5.8GHz'],
    effective_range_m: 500,
    beam_width_deg: 360,
    antenna_pattern: 'omni',
    power_output_w: 30,
    antenna_gain_dbi: 2,
    frequency_ranges: ['2.4-2.5GHz', '5.7-5.9GHz', '1.575GHz'],
    notes: 'Omnidirectional jammer - 360deg protection for point defense',
  },
  {
    id: 'cuas-radar-detection',
    name: 'Radar Detection Unit',
    vendor: 'RadarTech Defense',
    model: 'RTD-3000',
    type: 'radar',
    capabilities: ['Drone Detection', 'Track Classification', 'Multi-target'],
    effective_range_m: 3000,
    beam_width_deg: 360,
    antenna_pattern: 'omni',
    notes: 'Primary radar detection - 3km range for early warning',
  },
  {
    id: 'cuas-acoustic-array',
    name: 'Acoustic Sensor Array',
    vendor: 'AudioSense Security',
    model: 'ASA-500',
    type: 'acoustic',
    capabilities: ['Drone Detection', 'Direction Finding', 'Audio Signature Library'],
    effective_range_m: 500,
    beam_width_deg: 360,
    antenna_pattern: 'omni',
    notes: 'Passive acoustic detection - validates audio signature library',
  },
  {
    id: 'cuas-rf-detector',
    name: 'RF Spectrum Analyzer',
    vendor: 'SpectrumWatch',
    model: 'SW-2000',
    type: 'rf_sensor',
    capabilities: ['900MHz Detection', '2.4GHz Detection', '5.8GHz Detection', 'Protocol Analysis'],
    effective_range_m: 2000,
    beam_width_deg: 360,
    antenna_pattern: 'omni',
    frequency_ranges: ['0.9-1.0GHz', '2.4-2.5GHz', '5.7-5.9GHz'],
    notes: 'RF detection unit - identifies drone control signals',
  },
];

/**
 * Check if libraries need seed data
 */
export function needsSeedData(
  sitesCount: number,
  droneProfilesCount: number,
  cuasProfilesCount: number
): boolean {
  return sitesCount === 0 || droneProfilesCount === 0 || cuasProfilesCount === 0;
}
