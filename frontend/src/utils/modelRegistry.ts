import type { DroneProfile, CUASType } from '../types/workflow';

export interface ModelAsset {
  id: string;
  label: string;
  glbPath: string;
  thumbnailTopPath: string;      // top-down view PNG
  thumbnailProfilePath: string;  // 3/4 angle PNG
  scale: number;
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
    heightOffset: 0,
  },
  quadcopter_phantom: {
    id: 'quadcopter_phantom',
    label: 'DJI Phantom Style',
    glbPath: '/models/drones/quadcopter_phantom.glb',
    thumbnailTopPath: '/models/thumbnails/drones/quadcopter_phantom_top.png',
    thumbnailProfilePath: '/models/thumbnails/drones/quadcopter_phantom_profile.png',
    scale: 0.8,
    heightOffset: 0,
  },
  fpv: {
    id: 'fpv',
    label: 'FPV Racing Drone',
    glbPath: '/models/drones/fpv.glb',
    thumbnailTopPath: '/models/thumbnails/drones/fpv_top.png',
    thumbnailProfilePath: '/models/thumbnails/drones/fpv_profile.png',
    scale: 0.6,
    heightOffset: 0,
  },
  fixed_wing: {
    id: 'fixed_wing',
    label: 'Fixed Wing',
    glbPath: '/models/drones/fixed_wing.glb',
    thumbnailTopPath: '/models/thumbnails/drones/fixed_wing_top.png',
    thumbnailProfilePath: '/models/thumbnails/drones/fixed_wing_profile.png',
    scale: 1.5,
    heightOffset: 0,
  },
  hexacopter: {
    id: 'hexacopter',
    label: 'Hexacopter',
    glbPath: '/models/drones/hexacopter.glb',
    thumbnailTopPath: '/models/thumbnails/drones/hexacopter_top.png',
    thumbnailProfilePath: '/models/thumbnails/drones/hexacopter_profile.png',
    scale: 1.2,
    heightOffset: 0,
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
    heightOffset: 0,
  },
  rf_sensor: {
    id: 'rf_sensor',
    label: 'RF Sensor',
    glbPath: '/models/cuas/rf_sensor.glb',
    thumbnailTopPath: '/models/thumbnails/cuas/rf_sensor_top.png',
    thumbnailProfilePath: '/models/thumbnails/cuas/rf_sensor_profile.png',
    scale: 1.0,
    heightOffset: 0,
  },
  radar: {
    id: 'radar',
    label: 'Radar',
    glbPath: '/models/cuas/radar.glb',
    thumbnailTopPath: '/models/thumbnails/cuas/radar_top.png',
    thumbnailProfilePath: '/models/thumbnails/cuas/radar_profile.png',
    scale: 1.2,
    heightOffset: 0,
  },
  eo_ir_camera: {
    id: 'eo_ir_camera',
    label: 'EO/IR Camera',
    glbPath: '/models/cuas/eo_ir_camera.glb',
    thumbnailTopPath: '/models/thumbnails/cuas/eo_ir_camera_top.png',
    thumbnailProfilePath: '/models/thumbnails/cuas/eo_ir_camera_profile.png',
    scale: 0.8,
    heightOffset: 0,
  },
  acoustic: {
    id: 'acoustic',
    label: 'Acoustic Sensor',
    glbPath: '/models/cuas/acoustic.glb',
    thumbnailTopPath: '/models/thumbnails/cuas/acoustic_top.png',
    thumbnailProfilePath: '/models/thumbnails/cuas/acoustic_profile.png',
    scale: 0.9,
    heightOffset: 0,
  },
  combined: {
    id: 'combined',
    label: 'Combined System',
    glbPath: '/models/cuas/combined.glb',
    thumbnailTopPath: '/models/thumbnails/cuas/combined_top.png',
    thumbnailProfilePath: '/models/thumbnails/cuas/combined_profile.png',
    scale: 1.5,
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
  if (nameLC.includes('wing') || nameLC.includes('vtol')) return DRONE_MODELS.fixed_wing;
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
