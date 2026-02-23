/**
 * Google 3D Viewer types — mirrors CesiumGlobeViewer props interface
 * so consumers can swap viewers with a single import change.
 */

import type { PositionPoint, DroneSummary } from '../../types/drone';
import type {
  EnhancedPositionPoint,
  CUASPlacement,
  CUASProfile,
  SiteDefinition,
  Engagement,
  JamBurst,
  CameraState3D,
  DroneProfile,
  GeoPoint,
  AssetPlacement,
} from '../../types/workflow';
import type { GeofenceZone, BlueUASDroneInfo } from '../../types/blueUas';

/** Viewer operating mode — same as Cesium viewer */
export type ViewerMode = 'setup' | 'live' | 'replay' | 'analysis' | 'preview' | 'event' | 'siteCreation';

/** Props interface matching CesiumGlobeViewerProps + event extensions */
export interface Google3DViewerProps {
  mode: ViewerMode;
  site?: SiteDefinition | null;

  // Camera
  initialCameraState?: CameraState3D;
  onCameraStateChange?: (state: CameraState3D) => void;

  // CUAS
  cuasPlacements?: CUASPlacement[];
  cuasProfiles?: CUASProfile[];
  cuasJamStates?: Map<string, boolean>;
  onCuasClick?: (cuasPlacementId: string) => void;
  engagementModeCuasId?: string | null;

  // Click-to-place (setup mode)
  onCuasPlaced?: (position: { lat: number; lon: number; alt_m: number }) => void;

  // Asset placements (vehicles/equipment)
  assetPlacements?: AssetPlacement[];

  // Drone tracks
  droneHistory?: Map<string, PositionPoint[]>;
  enhancedHistory?: Map<string, EnhancedPositionPoint[]>;
  currentTime?: number;
  timelineStart?: number;
  currentDroneData?: Map<string, DroneSummary>;
  selectedDroneId?: string | null;
  onDroneClick?: (droneId: string) => void;
  droneProfiles?: DroneProfile[];
  droneProfileMap?: Map<string, DroneProfile>;

  // Engagements
  engagements?: Engagement[];
  activeBursts?: Map<string, JamBurst>;
  onEngagementClick?: (engagementId: string) => void;

  // Screenshot capture (preview/setup modes)
  onCaptureScreenshots?: (screenshots: Array<{
    label: string; base64: string; cameraState: CameraState3D;
  }>) => void;

  // Label visibility (when controlled externally, e.g. event mode)
  showLabels?: boolean;

  // Event mode extensions (Blue UAS)
  geofenceZones?: GeofenceZone[];
  blueUasDrones?: Map<string, BlueUASDroneInfo>;

  // Place intelligence (event mode — click building → fetch place info)
  onPlaceClick?: (place: { displayName: string; types: string[]; formattedAddress?: string }) => void;

  // Boundary drawing (siteCreation mode)
  onBoundaryDrawn?: (vertices: GeoPoint[]) => void;
  initialBoundary?: GeoPoint[];
  drawingMode?: 'boundary' | 'zone' | 'marker' | null;
  onMarkerPlaced?: (position: GeoPoint) => void;

  // Lifecycle
  onReady?: () => void;
  onClose?: () => void;
}

/** Camera state for Google 3D Maps (lat/lng/altitude + heading/tilt/range) */
export interface Google3DCameraState {
  lat: number;
  lng: number;
  altitude: number;
  heading: number;
  tilt: number;
  range: number;
}

/**
 * Convert CesiumGlobeViewer CameraState3D to Google 3D camera params.
 * Cesium pitch: -90=nadir, 0=horizon → Google tilt: 0=nadir, 90=horizon
 */
export function cesiumToGoogle3DCamera(cam: CameraState3D): Google3DCameraState {
  return {
    lat: cam.latitude,
    lng: cam.longitude,
    altitude: cam.height,
    heading: cam.heading,
    tilt: cam.pitch + 90, // Cesium -90 nadir → Google 0 nadir
    range: Math.max(cam.height * 2, 500), // Approximate; Cesium doesn't have explicit range
  };
}

/**
 * Convert Google 3D camera state back to CesiumGlobeViewer CameraState3D.
 */
export function google3DToCesiumCamera(cam: Google3DCameraState): CameraState3D {
  return {
    latitude: cam.lat,
    longitude: cam.lng,
    height: cam.altitude,
    heading: cam.heading,
    pitch: cam.tilt - 90, // Google 0 nadir → Cesium -90 nadir
    roll: 0, // Google 3D has no roll
  };
}
