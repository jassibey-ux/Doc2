import type { ModelAsset } from './modelRegistry';

/** Preload model files into browser cache */
export async function preloadModels(assets: ModelAsset[]): Promise<void> {
  await Promise.allSettled(
    assets.map(asset => fetch(asset.glbPath, { method: 'HEAD' }).catch(() => {}))
  );
}

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
 */
export function createModelOrientation(
  Cesium: any,
  longitude: number,
  latitude: number,
  altitude: number,
  headingDeg: number
): any {
  const position = Cesium.Cartesian3.fromDegrees(longitude, latitude, altitude);
  const hpr = new Cesium.HeadingPitchRoll(
    Cesium.Math.toRadians(headingDeg),
    0,
    0
  );
  return Cesium.Transforms.headingPitchRollQuaternion(position, hpr);
}
