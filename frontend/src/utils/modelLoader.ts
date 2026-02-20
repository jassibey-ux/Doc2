import type { ModelAsset } from './modelRegistry';
import { DRONE_MODELS, CUAS_MODELS, VEHICLE_MODELS, EQUIPMENT_MODELS } from './modelRegistry';

// ---------------------------------------------------------------------------
// GLB existence cache — avoids 404s in the render loop
// ---------------------------------------------------------------------------

/** Cache: glbPath -> exists (true/false). undefined = not yet checked. */
const modelExistsCache = new Map<string, boolean>();

/** Async check whether a GLB file exists (HEAD request, cached). */
export async function checkModelExists(glbPath: string): Promise<boolean> {
  const cached = modelExistsCache.get(glbPath);
  if (cached !== undefined) return cached;

  try {
    const resp = await fetch(glbPath, { method: 'HEAD' });
    const exists = resp.ok;
    modelExistsCache.set(glbPath, exists);
    return exists;
  } catch {
    modelExistsCache.set(glbPath, false);
    return false;
  }
}

/** Synchronous lookup — returns true/false if already cached, undefined if not yet checked. */
export function isModelCached(glbPath: string): boolean | undefined {
  return modelExistsCache.get(glbPath);
}

/** Batch-check all registered models on Cesium init. */
export async function precheckAllModels(): Promise<void> {
  const allPaths = [
    ...Object.values(DRONE_MODELS).map(m => m.glbPath),
    ...Object.values(CUAS_MODELS).map(m => m.glbPath),
    ...Object.values(VEHICLE_MODELS).map(m => m.glbPath),
    ...Object.values(EQUIPMENT_MODELS).map(m => m.glbPath),
  ];

  await Promise.allSettled(allPaths.map(p => checkModelExists(p)));

  // Log summary
  let available = 0;
  let missing = 0;
  for (const [path, exists] of modelExistsCache) {
    if (exists) available++;
    else {
      missing++;
      console.warn(`[modelLoader] GLB not found: ${path}`);
    }
  }
  console.log(`[modelLoader] Model precheck: ${available} available, ${missing} missing`);
}

// ---------------------------------------------------------------------------
// Preload model files into browser cache
// ---------------------------------------------------------------------------

export async function preloadModels(assets: ModelAsset[]): Promise<void> {
  await Promise.allSettled(
    assets.map(asset => fetch(asset.glbPath, { method: 'HEAD' }).catch(() => {}))
  );
}

// ---------------------------------------------------------------------------
// Cesium helpers
// ---------------------------------------------------------------------------

/**
 * Create Cesium ModelGraphics config for an entity.
 * Returns the options object to spread into entity.model.
 * Must be called after Cesium is loaded (pass the Cesium module).
 */
export function createModelGraphicsOptions(
  Cesium: any,
  asset: ModelAsset,
  _headingDeg: number,
  isSelected: boolean
): Record<string, any> {
  // _headingDeg reserved for future per-entity model rotation
  return {
    uri: asset.glbPath,
    scale: asset.scale,
    minimumPixelSize: 24,
    maximumScale: 100,
    colorBlendMode: Cesium.ColorBlendMode.MIX,
    color: isSelected
      ? Cesium.Color.WHITE.withAlpha(1.0)
      : Cesium.Color.WHITE.withAlpha(0.85),
    silhouetteColor: isSelected
      ? Cesium.Color.ORANGE
      : Cesium.Color.BLACK,
    silhouetteSize: isSelected ? 2.0 : 0.5,
    heightReference: Cesium.HeightReference.NONE,
  };
}

/**
 * Create orientation quaternion for a model entity.
 *
 * @param pitchDeg Pitch in degrees (negative = nose down). Default 0.
 * @param rollDeg Roll in degrees (positive = right bank). Default 0.
 */
export function createModelOrientation(
  Cesium: any,
  longitude: number,
  latitude: number,
  altitude: number,
  headingDeg: number,
  pitchDeg: number = 0,
  rollDeg: number = 0,
): any {
  const position = Cesium.Cartesian3.fromDegrees(longitude, latitude, altitude);
  const hpr = new Cesium.HeadingPitchRoll(
    Cesium.Math.toRadians(headingDeg),
    Cesium.Math.toRadians(pitchDeg),
    Cesium.Math.toRadians(rollDeg),
  );
  return Cesium.Transforms.headingPitchRollQuaternion(position, hpr);
}
