/**
 * createModel3D — Shared factory for creating Google Maps 3D model elements.
 *
 * Centralizes:
 * - Element class selection (Model3DInteractiveElement vs Model3DElement)
 * - Constructor options pattern (with property-assignment fallback)
 * - Heading offset from model registry
 * - Scale from registry (with selected-state override)
 * - altitudeMode: RELATIVE_TO_GROUND for all models
 */

import type { ModelAsset } from '../../../utils/modelRegistry';

export interface CreateModel3DOptions {
  maps3dLib: any;
  asset: ModelAsset;
  baseUrl: string;
  position: { lat: number; lng: number; altitude: number };
  headingDeg: number;
  tiltDeg?: number;
  rollDeg?: number;
  isSelected?: boolean;
  /** Use Model3DElement instead of Model3DInteractiveElement */
  nonInteractive?: boolean;
  /** data-layer attribute value */
  dataLayer?: string;
  /** data-drone-id or data-cuas-id attribute */
  dataId?: { key: string; value: string };
}

/**
 * Create a Google Maps 3D model element with consistent configuration.
 * Returns null if the required element class is unavailable.
 */
export function createModel3D(options: CreateModel3DOptions): any | null {
  const {
    maps3dLib,
    asset,
    baseUrl,
    position,
    headingDeg,
    tiltDeg = 0,
    rollDeg = 0,
    isSelected = false,
    nonInteractive = false,
    dataLayer,
    dataId,
  } = options;

  const ModelClass = nonInteractive
    ? (maps3dLib.Model3DElement ?? maps3dLib.Model3DInteractiveElement)
    : maps3dLib.Model3DInteractiveElement;

  if (!ModelClass) return null;

  const modelPath = `${baseUrl}${asset.glbPath.replace(/^\//, '')}`;
  const scale = isSelected
    ? (asset.google3dSelectedScale ?? asset.google3dScale * 1.3)
    : asset.google3dScale;
  const heading = headingDeg + asset.headingOffset;

  let model: any;
  try {
    // Constructor options pattern (Google Maps 3D best practice)
    model = new ModelClass({
      src: modelPath,
      position,
      altitudeMode: 'RELATIVE_TO_GROUND',
      orientation: { heading, tilt: tiltDeg, roll: rollDeg },
      scale,
    });
  } catch {
    // Property-assignment fallback for older API versions
    try {
      model = new ModelClass();
      model.src = modelPath;
      model.position = position;
      model.altitudeMode = 'RELATIVE_TO_GROUND';
      model.orientation = { heading, tilt: tiltDeg, roll: rollDeg };
      model.scale = scale;
    } catch {
      return null;
    }
  }

  if (dataLayer) model.setAttribute('data-layer', dataLayer);
  if (dataId) model.setAttribute(dataId.key, dataId.value);

  return model;
}
