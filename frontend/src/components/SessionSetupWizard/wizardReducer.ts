import type { WizardState, WizardAction } from './wizardTypes';

export const initialWizardState: WizardState = {
  currentStep: 0,
  selectedSiteId: null,
  isCreatingNewSite: false,
  newSiteName: '',
  droneAssignments: [],
  cuasPlacements: [],
  placementMode: false,
  selectedCuasProfileId: null,
  sessionName: '',
  operatorName: '',
  weatherNotes: '',
  isSubmitting: false,
  error: null,
};

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, currentStep: action.step, error: null };

    case 'NEXT_STEP':
      return { ...state, currentStep: Math.min(state.currentStep + 1, 3), error: null };

    case 'PREVIOUS_STEP':
      return { ...state, currentStep: Math.max(state.currentStep - 1, 0), error: null };

    case 'SELECT_SITE':
      return {
        ...state,
        selectedSiteId: action.siteId,
        isCreatingNewSite: false,
        newSiteName: '',
      };

    case 'START_NEW_SITE':
      return {
        ...state,
        isCreatingNewSite: true,
        selectedSiteId: null,
      };

    case 'SET_NEW_SITE_NAME':
      return { ...state, newSiteName: action.name };

    case 'CANCEL_NEW_SITE':
      return {
        ...state,
        isCreatingNewSite: false,
        newSiteName: '',
      };

    case 'ADD_DRONE_ASSIGNMENT':
      return {
        ...state,
        droneAssignments: [...state.droneAssignments, action.assignment],
      };

    case 'UPDATE_DRONE_ASSIGNMENT':
      return {
        ...state,
        droneAssignments: state.droneAssignments.map(a =>
          a.trackerId === action.trackerId ? { ...a, ...action.updates } : a
        ),
      };

    case 'REMOVE_DRONE_ASSIGNMENT':
      return {
        ...state,
        droneAssignments: state.droneAssignments.filter(a => a.trackerId !== action.trackerId),
      };

    case 'SET_PLACEMENT_MODE':
      return {
        ...state,
        placementMode: action.active,
        selectedCuasProfileId: action.cuasProfileId || null,
      };

    case 'ADD_CUAS_PLACEMENT':
      return {
        ...state,
        cuasPlacements: [...state.cuasPlacements, action.placement],
        placementMode: false,
        selectedCuasProfileId: null,
      };

    case 'UPDATE_CUAS_PLACEMENT':
      return {
        ...state,
        cuasPlacements: state.cuasPlacements.map(p =>
          p.id === action.placementId ? { ...p, ...action.updates } : p
        ),
      };

    case 'REMOVE_CUAS_PLACEMENT':
      return {
        ...state,
        cuasPlacements: state.cuasPlacements.filter(p => p.id !== action.placementId),
      };

    case 'SET_SESSION_NAME':
      return { ...state, sessionName: action.name };

    case 'SET_OPERATOR_NAME':
      return { ...state, operatorName: action.name };

    case 'SET_WEATHER_NOTES':
      return { ...state, weatherNotes: action.notes };

    case 'SET_SUBMITTING':
      return { ...state, isSubmitting: action.isSubmitting };

    case 'SET_ERROR':
      return { ...state, error: action.error };

    case 'RESET':
      return initialWizardState;

    case 'QUICK_START':
      return {
        ...initialWizardState,
        currentStep: 3, // Jump to Review step
        selectedSiteId: action.siteId,
        isCreatingNewSite: action.siteId === null && action.newSiteName.length > 0,
        newSiteName: action.newSiteName,
        droneAssignments: action.droneAssignments,
        sessionName: action.sessionName,
      };

    case 'LOAD_TEMPLATE':
      return {
        ...initialWizardState,
        currentStep: 0, // Stay on step 1, user reviews and proceeds
        selectedSiteId: action.siteId,
        droneAssignments: action.droneAssignments,
        cuasPlacements: action.cuasPlacements,
        sessionName: action.sessionName,
        weatherNotes: action.weatherNotes,
      };

    default:
      return state;
  }
}

// Validation helpers - accepts step number for flexibility
export function validateStep(state: WizardState, step: number): boolean {
  switch (step) {
    case 0: // Site
      if (state.isCreatingNewSite) {
        return state.newSiteName.trim().length > 0;
      }
      return state.selectedSiteId !== null;

    case 1: // Drones
      return state.droneAssignments.length > 0;

    case 2: // CUAS
      // Not blocking - CUAS placement is optional
      return true;

    case 3: // Review
      return state.sessionName.trim().length > 0 && state.droneAssignments.length > 0;

    default:
      return false;
  }
}

// Generate a default session name
export function generateSessionName(siteName: string): string {
  const date = new Date().toISOString().split('T')[0];
  const siteSlug = siteName.replace(/\s+/g, '-').substring(0, 20);
  return `${date}_${siteSlug}_Test`;
}

// Get validation message for a step
export function getValidationMessage(state: WizardState, step: number): string | null {
  switch (step) {
    case 0: // Site
      if (state.isCreatingNewSite && state.newSiteName.trim().length === 0) {
        return 'Enter a name for the new site';
      }
      if (!state.isCreatingNewSite && state.selectedSiteId === null) {
        return 'Select a site or create a new one';
      }
      return null;

    case 1: // Drones
      if (state.droneAssignments.length === 0) {
        return 'Assign at least one tracker to a drone';
      }
      return null;

    case 2: // CUAS
      // CUAS placement is optional
      return null;

    case 3: // Review
      if (state.sessionName.trim().length === 0) {
        return 'Enter a session name';
      }
      if (state.droneAssignments.length === 0) {
        return 'Go back and assign at least one tracker';
      }
      return null;

    default:
      return null;
  }
}
