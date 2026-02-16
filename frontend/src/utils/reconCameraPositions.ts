import { haversineDistance, destinationPoint } from './geo';
import type { SiteDefinition, CameraState3D } from '../types/workflow';

export interface ReconCameraPosition {
  label: string;
  cameraState: CameraState3D;
}

/**
 * Compute 7 camera positions around a site for recon screenshots:
 * North, East, South, West, NE oblique, SW oblique, Overhead
 */
export function computeReconPositions(site: SiteDefinition): ReconCameraPosition[] {
  const center = site.center;

  // Compute site radius from boundary polygon
  let maxDist = 200; // minimum 200m
  for (const pt of site.boundary_polygon) {
    const d = haversineDistance(center.lat, center.lon, pt.lat, pt.lon);
    if (d > maxDist) maxDist = d;
  }

  const cameraDistance = maxDist * 2.0; // offset from center
  const cameraHeight = maxDist * 1.5; // height above ground
  const obliquePitch = -30; // degrees
  const overheadPitch = -90;

  const cardinalAngles = [
    { label: 'North', bearing: 0, heading: 180 },
    { label: 'East', bearing: 90, heading: 270 },
    { label: 'South', bearing: 180, heading: 0 },
    { label: 'West', bearing: 270, heading: 90 },
  ];

  const obliqueAngles = [
    { label: 'NE Oblique', bearing: 45, heading: 225 },
    { label: 'SW Oblique', bearing: 225, heading: 45 },
  ];

  const positions: ReconCameraPosition[] = [];

  // Cardinal positions
  for (const { label, bearing: b, heading } of cardinalAngles) {
    const pos = destinationPoint(center.lat, center.lon, b, cameraDistance);
    positions.push({
      label,
      cameraState: {
        longitude: pos.lon,
        latitude: pos.lat,
        height: cameraHeight,
        heading,
        pitch: obliquePitch,
        roll: 0,
      },
    });
  }

  // Oblique positions (higher, further back)
  for (const { label, bearing: b, heading } of obliqueAngles) {
    const pos = destinationPoint(center.lat, center.lon, b, cameraDistance * 1.2);
    positions.push({
      label,
      cameraState: {
        longitude: pos.lon,
        latitude: pos.lat,
        height: cameraHeight * 1.5,
        heading,
        pitch: obliquePitch - 10,
        roll: 0,
      },
    });
  }

  // Overhead position
  positions.push({
    label: 'Overhead',
    cameraState: {
      longitude: center.lon,
      latitude: center.lat,
      height: cameraHeight * 2.5,
      heading: 0,
      pitch: overheadPitch,
      roll: 0,
    },
  });

  return positions;
}
