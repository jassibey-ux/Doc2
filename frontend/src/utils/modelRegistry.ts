import type { DroneProfile, CUASType } from '../types/workflow';

export interface ModelAsset {
  id: string;
  label: string;
  glbPath: string;
  thumbnailTopPath: string;      // top-down view PNG
  thumbnailProfilePath: string;  // 3/4 angle PNG
  scale: number;                 // Cesium scale factor
  google3dScale: number;         // Google Maps 3D scale (desiredSize / nativeSize)
  google3dSelectedScale?: number; // optional override for selected state in Google 3D
  headingOffset: number;         // degrees added to heading for correct model facing direction
  heightOffset: number;          // meters above ground
}

export const DRONE_MODELS: Record<string, ModelAsset> = {
  quadcopter_generic: {
    id: 'quadcopter_generic',
    label: 'Quadcopter (Generic)',
    glbPath: '/models/drones/quadcopter_generic.glb',
    thumbnailTopPath: '/models/thumbnails/drones/quadcopter_generic_top.png',
    thumbnailProfilePath: '/models/thumbnails/drones/quadcopter_generic_profile.png',
    scale: 1.0,
    google3dScale: 10,
    headingOffset: 0,
    heightOffset: 0.3,
  },
  quadcopter_phantom: {
    id: 'quadcopter_phantom',
    label: 'DJI Phantom Style',
    glbPath: '/models/drones/quadcopter_phantom.glb',
    thumbnailTopPath: '/models/thumbnails/drones/quadcopter_phantom_top.png',
    thumbnailProfilePath: '/models/thumbnails/drones/quadcopter_phantom_profile.png',
    scale: 0.8,
    google3dScale: 10,
    headingOffset: 0,
    heightOffset: 0.2,
  },
  fpv: {
    id: 'fpv',
    label: 'FPV Racing Drone',
    glbPath: '/models/drones/fpv.glb',
    thumbnailTopPath: '/models/thumbnails/drones/fpv_top.png',
    thumbnailProfilePath: '/models/thumbnails/drones/fpv_profile.png',
    scale: 0.6,
    google3dScale: 10,
    headingOffset: 0,
    heightOffset: 0.15,
  },
  fixed_wing: {
    id: 'fixed_wing',
    label: 'Fixed Wing',
    glbPath: '/models/drones/fixed_wing.glb',
    thumbnailTopPath: '/models/thumbnails/drones/fixed_wing_top.png',
    thumbnailProfilePath: '/models/thumbnails/drones/fixed_wing_profile.png',
    scale: 1.5,
    google3dScale: 10,
    headingOffset: 0,
    heightOffset: 0.5,
  },
  hexacopter: {
    id: 'hexacopter',
    label: 'Hexacopter',
    glbPath: '/models/drones/hexacopter.glb',
    thumbnailTopPath: '/models/thumbnails/drones/hexacopter_top.png',
    thumbnailProfilePath: '/models/thumbnails/drones/hexacopter_profile.png',
    scale: 1.2,
    google3dScale: 12,
    headingOffset: 0,
    heightOffset: 0.4,
  },
  vtol: {
    id: 'vtol',
    label: 'VTOL Drone',
    glbPath: '/models/drones/vtol.glb',
    thumbnailTopPath: '/models/thumbnails/drones/vtol_top.png',
    thumbnailProfilePath: '/models/thumbnails/drones/vtol_profile.png',
    scale: 2.0,
    google3dScale: 14,
    headingOffset: 0,
    heightOffset: 0.6,
  },
  octocopter: {
    id: 'octocopter',
    label: 'Octocopter',
    glbPath: '/models/drones/octocopter.glb',
    thumbnailTopPath: '/models/thumbnails/drones/octocopter_top.png',
    thumbnailProfilePath: '/models/thumbnails/drones/octocopter_profile.png',
    scale: 1.5,
    google3dScale: 14,
    headingOffset: 0,
    heightOffset: 0.5,
  },
  animated_drone: {
    id: 'animated_drone',
    label: 'Animated Drone (Sketchfab)',
    glbPath: '/models/drones/animated_drone.glb',
    thumbnailTopPath: '/models/thumbnails/drones/animated_drone_top.png',
    thumbnailProfilePath: '/models/thumbnails/drones/animated_drone_profile.png',
    scale: 1.0,
    google3dScale: 10,
    headingOffset: 0,
    heightOffset: 0.3,
  },
};

export const CUAS_MODELS: Record<string, ModelAsset> = {
  jammer: {
    id: 'jammer',
    label: 'RF Jammer',
    glbPath: '/models/cuas/jammer.glb',
    thumbnailTopPath: '/models/thumbnails/cuas/jammer_top.png',
    thumbnailProfilePath: '/models/thumbnails/cuas/jammer_profile.png',
    scale: 1.0,
    google3dScale: 8,
    google3dSelectedScale: 12,
    headingOffset: 0,
    heightOffset: 0,
  },
  rf_sensor: {
    id: 'rf_sensor',
    label: 'RF Sensor',
    glbPath: '/models/cuas/rf_sensor.glb',
    thumbnailTopPath: '/models/thumbnails/cuas/rf_sensor_top.png',
    thumbnailProfilePath: '/models/thumbnails/cuas/rf_sensor_profile.png',
    scale: 1.0,
    google3dScale: 8,
    google3dSelectedScale: 12,
    headingOffset: 0,
    heightOffset: 0,
  },
  radar: {
    id: 'radar',
    label: 'Radar',
    glbPath: '/models/cuas/radar.glb',
    thumbnailTopPath: '/models/thumbnails/cuas/radar_top.png',
    thumbnailProfilePath: '/models/thumbnails/cuas/radar_profile.png',
    scale: 1.2,
    google3dScale: 9.6,
    google3dSelectedScale: 14.4,
    headingOffset: 0,
    heightOffset: 0,
  },
  eo_ir_camera: {
    id: 'eo_ir_camera',
    label: 'EO/IR Camera',
    glbPath: '/models/cuas/eo_ir_camera.glb',
    thumbnailTopPath: '/models/thumbnails/cuas/eo_ir_camera_top.png',
    thumbnailProfilePath: '/models/thumbnails/cuas/eo_ir_camera_profile.png',
    scale: 0.8,
    google3dScale: 6.4,
    google3dSelectedScale: 9.6,
    headingOffset: 0,
    heightOffset: 0,
  },
  acoustic: {
    id: 'acoustic',
    label: 'Acoustic Sensor',
    glbPath: '/models/cuas/acoustic.glb',
    thumbnailTopPath: '/models/thumbnails/cuas/acoustic_top.png',
    thumbnailProfilePath: '/models/thumbnails/cuas/acoustic_profile.png',
    scale: 0.9,
    google3dScale: 7.2,
    google3dSelectedScale: 10.8,
    headingOffset: 0,
    heightOffset: 0,
  },
  combined: {
    id: 'combined',
    label: 'Combined System',
    glbPath: '/models/cuas/combined.glb',
    thumbnailTopPath: '/models/thumbnails/cuas/combined_top.png',
    thumbnailProfilePath: '/models/thumbnails/cuas/combined_profile.png',
    scale: 1.5,
    google3dScale: 12,
    google3dSelectedScale: 18,
    headingOffset: 0,
    heightOffset: 0,
  },
};

/** Look up drone model by profile fields, with fallback chain */
export function getDroneModel(profile?: DroneProfile): ModelAsset | null {
  if (!profile) return null;

  // Explicit model_3d assignment
  if (profile.model_3d && DRONE_MODELS[profile.model_3d]) {
    return DRONE_MODELS[profile.model_3d];
  }

  // Heuristic: match by make+model name
  const nameLC = `${profile.make} ${profile.model}`.toLowerCase();
  if (nameLC.includes('phantom') || nameLC.includes('mavic')) return DRONE_MODELS.quadcopter_phantom;
  if (nameLC.includes('fpv') || nameLC.includes('racing')) return DRONE_MODELS.fpv;
  if (nameLC.includes('vtol') || nameLC.includes('tilt-rotor') || nameLC.includes('dragonfish') || nameLC.includes('wingtra')) return DRONE_MODELS.vtol;
  if (nameLC.includes('wing')) return DRONE_MODELS.fixed_wing;
  if (nameLC.includes('octo') || nameLC.includes('x8') || nameLC.includes('s1000')) return DRONE_MODELS.octocopter;
  if (nameLC.includes('hex') || nameLC.includes('m600')) return DRONE_MODELS.hexacopter;

  // Fallback by weight class
  if (profile.weight_class === 'medium') return DRONE_MODELS.hexacopter;

  return DRONE_MODELS.quadcopter_generic;
}

/** Look up CUAS model by type */
export function getCUASModel(type?: CUASType): ModelAsset | null {
  if (!type) return null;
  return CUAS_MODELS[type] || null;
}

/** Get all available drone model IDs for dropdowns */
export function getDroneModelOptions(): Array<{ id: string; label: string }> {
  return Object.values(DRONE_MODELS).map(m => ({ id: m.id, label: m.label }));
}

/** Get all available CUAS model IDs for dropdowns */
export function getCUASModelOptions(): Array<{ id: string; label: string }> {
  return Object.values(CUAS_MODELS).map(m => ({ id: m.id, label: m.label }));
}

// ─── Vehicle Models ─────────────────────────────────────────────────────────

export const VEHICLE_MODELS: Record<string, ModelAsset> = {
  suv_response: {
    id: 'suv_response',
    label: 'SUV (Response)',
    glbPath: '/models/vehicles/suv_response.glb',
    thumbnailTopPath: '/models/thumbnails/vehicles/suv_response_top.png',
    thumbnailProfilePath: '/models/thumbnails/vehicles/suv_response_profile.png',
    scale: 1.0,
    google3dScale: 1,
    headingOffset: 0,
    heightOffset: 0,
  },
  pickup_truck: {
    id: 'pickup_truck',
    label: 'Pickup Truck',
    glbPath: '/models/vehicles/pickup_truck.glb',
    thumbnailTopPath: '/models/thumbnails/vehicles/pickup_truck_top.png',
    thumbnailProfilePath: '/models/thumbnails/vehicles/pickup_truck_profile.png',
    scale: 1.0,
    google3dScale: 1,
    headingOffset: 0,
    heightOffset: 0,
  },
  van_command: {
    id: 'van_command',
    label: 'Command Van',
    glbPath: '/models/vehicles/van_command.glb',
    thumbnailTopPath: '/models/thumbnails/vehicles/van_command_top.png',
    thumbnailProfilePath: '/models/thumbnails/vehicles/van_command_profile.png',
    scale: 1.0,
    google3dScale: 1,
    headingOffset: 0,
    heightOffset: 0,
  },
  sedan_patrol: {
    id: 'sedan_patrol',
    label: 'Patrol Sedan',
    glbPath: '/models/vehicles/sedan_patrol.glb',
    thumbnailTopPath: '/models/thumbnails/vehicles/sedan_patrol_top.png',
    thumbnailProfilePath: '/models/thumbnails/vehicles/sedan_patrol_profile.png',
    scale: 1.0,
    google3dScale: 1,
    headingOffset: 0,
    heightOffset: 0,
  },
};

// ─── Equipment Models ───────────────────────────────────────────────────────

export const EQUIPMENT_MODELS: Record<string, ModelAsset> = {
  ground_station: {
    id: 'ground_station',
    label: 'Ground Control Station',
    glbPath: '/models/equipment/ground_station.glb',
    thumbnailTopPath: '/models/thumbnails/equipment/ground_station_top.png',
    thumbnailProfilePath: '/models/thumbnails/equipment/ground_station_profile.png',
    scale: 1.0,
    google3dScale: 1,
    headingOffset: 0,
    heightOffset: 0,
  },
  antenna_tower: {
    id: 'antenna_tower',
    label: 'Antenna Tower',
    glbPath: '/models/equipment/antenna_tower.glb',
    thumbnailTopPath: '/models/thumbnails/equipment/antenna_tower_top.png',
    thumbnailProfilePath: '/models/thumbnails/equipment/antenna_tower_profile.png',
    scale: 1.0,
    google3dScale: 1,
    headingOffset: 0,
    heightOffset: 0,
  },
  generator: {
    id: 'generator',
    label: 'Generator',
    glbPath: '/models/equipment/generator.glb',
    thumbnailTopPath: '/models/thumbnails/equipment/generator_top.png',
    thumbnailProfilePath: '/models/thumbnails/equipment/generator_profile.png',
    scale: 1.0,
    google3dScale: 1,
    headingOffset: 0,
    heightOffset: 0,
  },
  barrier: {
    id: 'barrier',
    label: 'Jersey Barrier',
    glbPath: '/models/equipment/barrier.glb',
    thumbnailTopPath: '/models/thumbnails/equipment/barrier_top.png',
    thumbnailProfilePath: '/models/thumbnails/equipment/barrier_profile.png',
    scale: 1.0,
    google3dScale: 1,
    headingOffset: 0,
    heightOffset: 0,
  },
};

/** Look up vehicle model by ID */
export function getVehicleModel(id: string): ModelAsset | null {
  return VEHICLE_MODELS[id] ?? null;
}

/** Look up equipment model by ID */
export function getEquipmentModel(id: string): ModelAsset | null {
  return EQUIPMENT_MODELS[id] ?? null;
}

/** Get all available vehicle model IDs for dropdowns */
export function getVehicleModelOptions(): Array<{ id: string; label: string }> {
  return Object.values(VEHICLE_MODELS).map(m => ({ id: m.id, label: m.label }));
}

/** Get all available equipment model IDs for dropdowns */
export function getEquipmentModelOptions(): Array<{ id: string; label: string }> {
  return Object.values(EQUIPMENT_MODELS).map(m => ({ id: m.id, label: m.label }));
}
