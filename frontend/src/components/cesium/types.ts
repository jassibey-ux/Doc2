/**
 * Unified CesiumGlobeViewer types
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
} from '../../types/workflow';

/** Viewer operating mode — determines which features are active */
export type ViewerMode = 'setup' | 'live' | 'replay' | 'analysis' | 'preview';

/** Tile provider for 3D buildings */
export type TileMode = 'osm' | 'google3d';

/** Cesium types — lazy loaded, use `any` until module arrives */
export type CesiumViewer = any;
export type CesiumModule = any;

export interface CesiumGlobeViewerProps {
  mode: ViewerMode;
  site?: SiteDefinition | null;
  tileMode?: TileMode;
  enableBoundaryClipping?: boolean;

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

  // Screenshot capture (preview/setup modes)
  onCaptureScreenshots?: (screenshots: Array<{ label: string; base64: string; cameraState: CameraState3D }>) => void;

  // Lifecycle
  onReady?: () => void;
  onClose?: () => void;
}
