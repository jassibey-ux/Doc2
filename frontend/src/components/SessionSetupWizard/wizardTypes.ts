// Wizard state and action types

export interface DroneAssignment {
  trackerId: string;
  droneProfileId: string;
  color: string;
  targetAltitude?: number;
}

export interface CUASPlacementData {
  id: string;
  cuasProfileId: string;
  position: { lat: number; lon: number };
  heightAgl: number;
  orientation: number;
}

export interface WizardState {
  currentStep: number;

  // Step 1: Site
  selectedSiteId: string | null;
  isCreatingNewSite: boolean;
  newSiteName: string;

  // Step 2: Drones
  droneAssignments: DroneAssignment[];

  // Step 3: CUAS
  cuasPlacements: CUASPlacementData[];
  placementMode: boolean;
  selectedCuasProfileId: string | null;

  // Step 4: Review
  sessionName: string;
  operatorName: string;
  weatherNotes: string;

  // UI state
  isSubmitting: boolean;
  error: string | null;
}

export type WizardAction =
  | { type: 'SET_STEP'; step: number }
  | { type: 'NEXT_STEP' }
  | { type: 'PREVIOUS_STEP' }
  | { type: 'SELECT_SITE'; siteId: string }
  | { type: 'START_NEW_SITE' }
  | { type: 'SET_NEW_SITE_NAME'; name: string }
  | { type: 'CANCEL_NEW_SITE' }
  | { type: 'ADD_DRONE_ASSIGNMENT'; assignment: DroneAssignment }
  | { type: 'UPDATE_DRONE_ASSIGNMENT'; trackerId: string; updates: Partial<DroneAssignment> }
  | { type: 'REMOVE_DRONE_ASSIGNMENT'; trackerId: string }
  | { type: 'SET_PLACEMENT_MODE'; active: boolean; cuasProfileId?: string }
  | { type: 'ADD_CUAS_PLACEMENT'; placement: CUASPlacementData }
  | { type: 'UPDATE_CUAS_PLACEMENT'; placementId: string; updates: Partial<CUASPlacementData> }
  | { type: 'REMOVE_CUAS_PLACEMENT'; placementId: string }
  | { type: 'SET_SESSION_NAME'; name: string }
  | { type: 'SET_OPERATOR_NAME'; name: string }
  | { type: 'SET_WEATHER_NOTES'; notes: string }
  | { type: 'SET_SUBMITTING'; isSubmitting: boolean }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'RESET' }
  | { type: 'QUICK_START'; siteId: string | null; newSiteName: string; droneAssignments: DroneAssignment[]; sessionName: string }
  | { type: 'LOAD_TEMPLATE'; siteId: string | null; droneAssignments: DroneAssignment[]; cuasPlacements: CUASPlacementData[]; sessionName: string; weatherNotes: string };

// Track colors for drone assignment
export const TRACK_COLORS = [
  '#ff8c00', // orange
  '#00c8ff', // cyan
  '#ff6b6b', // red
  '#4ecdc4', // teal
  '#f7dc6f', // yellow
  '#bb8fce', // purple
  '#58d68d', // green
  '#5dade2', // blue
] as const;
