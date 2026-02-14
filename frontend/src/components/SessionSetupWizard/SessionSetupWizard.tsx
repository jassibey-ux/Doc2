import { useReducer, useEffect, useCallback } from 'react';
import { X, Zap } from 'lucide-react';
import { GlassPanel, GlassButton } from '../ui/GlassUI';
import { wizardReducer, initialWizardState, validateStep, generateSessionName, getValidationMessage } from './wizardReducer';
import { useToast } from '../../contexts/ToastContext';
import { useWorkflow } from '../../contexts/WorkflowContext';
import WizardNavigation from './WizardNavigation';
import WizardStepSite from './WizardStepSite';
import WizardStepDrones from './WizardStepDrones';
import WizardStepCUAS from './WizardStepCUAS';
import WizardStepReview from './WizardStepReview';
import { TRACK_COLORS } from './wizardTypes';
import type { SiteDefinition, DroneProfile, CUASProfile } from '../../types/workflow';
import type { DroneSummary } from '../../types/drone';

interface SessionSetupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onStartSession: (sessionData: {
    name: string;
    siteId: string | null;
    newSiteName: string | null;
    droneAssignments: Array<{
      trackerId: string;
      droneProfileId: string;
      color: string;
      targetAltitude?: number;
    }>;
    cuasPlacements: Array<{
      id: string;
      cuasProfileId: string;
      position: { lat: number; lon: number };
      heightAgl: number;
      orientation: number;
    }>;
    operatorName: string;
    weatherNotes: string;
  }) => Promise<void>;
  sites: SiteDefinition[];
  droneProfiles: DroneProfile[];
  cuasProfiles: CUASProfile[];
  liveTrackers: Map<string, DroneSummary>;
  mapCenter?: { lat: number; lon: number };
  // CUAS map placement callback
  onRequestCuasPlacement?: (placementId: string) => void;
  // Incoming placement coordinates from map click
  pendingCuasPlacement?: { placementId: string; lat: number; lon: number } | null;
  onCuasPlacementHandled?: () => void;
  // When true, wizard is hidden (user is placing CUAS on map)
  isMinimizedForPlacement?: boolean;
  // Expose wizard CUAS placements to parent for map rendering
  onWizardPlacementsChanged?: (placements: Array<{ id: string; cuasProfileId: string; position: { lat: number; lon: number }; orientation: number }>) => void;
}

const STEP_TITLES = ['Site', 'Drones', 'CUAS', 'Review'];

export default function SessionSetupWizard({
  isOpen,
  onClose,
  onStartSession,
  sites,
  droneProfiles,
  cuasProfiles,
  liveTrackers,
  mapCenter = { lat: 0, lon: 0 },
  onRequestCuasPlacement,
  pendingCuasPlacement,
  onCuasPlacementHandled,
  isMinimizedForPlacement = false,
  onWizardPlacementsChanged,
}: SessionSetupWizardProps) {
  const [state, dispatch] = useReducer(wizardReducer, initialWizardState);
  const { showToast } = useToast();
  const { selectSite } = useWorkflow();

  // Generate default session name when reaching review step
  useEffect(() => {
    if (state.currentStep === 3 && !state.sessionName) {
      const selectedSite = state.selectedSiteId
        ? sites.find(s => s.id === state.selectedSiteId)
        : null;
      const siteName = selectedSite?.name || state.newSiteName || 'Test';
      const defaultName = generateSessionName(siteName);
      dispatch({ type: 'SET_SESSION_NAME', name: defaultName });
    }
  }, [state.currentStep, state.sessionName, state.selectedSiteId, state.newSiteName, sites]);

  // Reset wizard when closed
  useEffect(() => {
    if (!isOpen) {
      dispatch({ type: 'RESET' });
    }
  }, [isOpen]);

  // Sync wizard site selection to WorkflowContext
  // This triggers the map to fly to the site and show its boundary
  useEffect(() => {
    if (isOpen && state.selectedSiteId) {
      const site = sites.find(s => s.id === state.selectedSiteId);
      if (site) {
        selectSite(site);
      }
    }
  }, [isOpen, state.selectedSiteId, sites, selectSite]);

  // Broadcast wizard CUAS placements to parent for map preview
  useEffect(() => {
    if (isOpen && onWizardPlacementsChanged) {
      onWizardPlacementsChanged(state.cuasPlacements);
    }
    if (!isOpen && onWizardPlacementsChanged) {
      onWizardPlacementsChanged([]);
    }
  }, [isOpen, state.cuasPlacements, onWizardPlacementsChanged]);

  // Handle incoming CUAS placement from map click
  useEffect(() => {
    if (pendingCuasPlacement) {
      dispatch({
        type: 'UPDATE_CUAS_PLACEMENT',
        placementId: pendingCuasPlacement.placementId,
        updates: {
          position: {
            lat: pendingCuasPlacement.lat,
            lon: pendingCuasPlacement.lon,
          },
        },
      });
      onCuasPlacementHandled?.();
    }
  }, [pendingCuasPlacement, onCuasPlacementHandled]);

  const handleNext = useCallback(() => {
    if (state.currentStep < 3) {
      dispatch({ type: 'NEXT_STEP' });
    }
  }, [state.currentStep]);

  const handleBack = useCallback(() => {
    if (state.currentStep > 0) {
      dispatch({ type: 'PREVIOUS_STEP' });
    }
  }, [state.currentStep]);

  const handleCancel = useCallback(() => {
    selectSite(null);  // Clear site selection when wizard closes
    onClose();
  }, [onClose, selectSite]);

  const handleStartSession = useCallback(async () => {
    if (state.isSubmitting) return;

    dispatch({ type: 'SET_SUBMITTING', isSubmitting: true });
    dispatch({ type: 'SET_ERROR', error: null });

    try {
      await onStartSession({
        name: state.sessionName,
        siteId: state.selectedSiteId,
        newSiteName: state.isCreatingNewSite ? state.newSiteName : null,
        droneAssignments: state.droneAssignments,
        cuasPlacements: state.cuasPlacements,
        operatorName: state.operatorName,
        weatherNotes: state.weatherNotes,
      });
      showToast('success', `Session "${state.sessionName}" started`);
      onClose();
    } catch (error) {
      console.error('Failed to start session:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to start session';
      dispatch({ type: 'SET_ERROR', error: errorMessage });
      dispatch({ type: 'SET_SUBMITTING', isSubmitting: false });
      showToast('error', errorMessage);
    }
  }, [state, onStartSession, onClose, showToast]);

  // Handle CUAS placement on map
  const handlePlaceOnMap = useCallback((placementId: string) => {
    onRequestCuasPlacement?.(placementId);
  }, [onRequestCuasPlacement]);

  // Quick Start - auto-fill defaults and jump to review
  const handleQuickStart = useCallback(() => {
    // Auto-assign all live trackers to first drone profile
    const defaultProfile = droneProfiles[0];
    const droneAssignments = Array.from(liveTrackers.keys()).map((trackerId, index) => ({
      trackerId,
      droneProfileId: defaultProfile?.id || 'default',
      color: TRACK_COLORS[index % TRACK_COLORS.length],
    }));

    // Use first site or create temp name
    const siteId = sites[0]?.id || null;
    const siteName = sites[0]?.name || 'Quick Test';
    const newSiteName = siteId ? '' : siteName;

    // Generate session name
    const timestamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
    const sessionName = `Quick_${timestamp}`;

    dispatch({
      type: 'QUICK_START',
      siteId,
      newSiteName,
      droneAssignments,
      sessionName,
    });
  }, [droneProfiles, liveTrackers, sites]);

  // Check if current step is valid
  const isCurrentStepValid = validateStep(state, state.currentStep);

  // Get validation message for current step
  const validationMessage = getValidationMessage(state, state.currentStep);

  // Check if all required steps are valid
  const canStartSession =
    validateStep(state, 0) &&
    validateStep(state, 1) &&
    validateStep(state, 3);

  // Hide wizard completely when closed or when user is placing CUAS on map
  if (!isOpen || isMinimizedForPlacement) {
    return null;
  }

  const renderStep = () => {
    switch (state.currentStep) {
      case 0:
        return <WizardStepSite state={state} dispatch={dispatch} sites={sites} />;
      case 1:
        return (
          <WizardStepDrones
            state={state}
            dispatch={dispatch}
            liveTrackers={liveTrackers}
            droneProfiles={droneProfiles}
          />
        );
      case 2:
        return (
          <WizardStepCUAS
            state={state}
            dispatch={dispatch}
            cuasProfiles={cuasProfiles}
            mapCenter={mapCenter}
            onPlaceOnMap={handlePlaceOnMap}
          />
        );
      case 3:
        return (
          <WizardStepReview
            state={state}
            dispatch={dispatch}
            sites={sites}
            droneProfiles={droneProfiles}
            cuasProfiles={cuasProfiles}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div
      className="wizard-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wizard-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <GlassPanel
        className="wizard-container"
        style={{
          width: '100%',
          maxWidth: '600px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(10, 15, 26, 0.98)',
          border: '1px solid rgba(255, 140, 0, 0.2)',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <div>
            <h1
              id="wizard-title"
              style={{
                fontSize: '20px',
                fontWeight: 600,
                color: '#fff',
                margin: 0,
              }}
            >
              New Test Session
            </h1>
            <p
              style={{
                fontSize: '13px',
                color: 'rgba(255, 255, 255, 0.5)',
                margin: 0,
                marginTop: '4px',
              }}
            >
              Step {state.currentStep + 1} of 4: {STEP_TITLES[state.currentStep]}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Quick Start link - only on step 0 with trackers available */}
            {state.currentStep === 0 && liveTrackers.size > 0 && (
              <button
                onClick={handleQuickStart}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  background: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  borderRadius: '6px',
                  color: '#22c55e',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(34, 197, 94, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(34, 197, 94, 0.1)';
                }}
              >
                <Zap size={14} />
                Quick Start
              </button>
            )}
            <GlassButton
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              aria-label="Close wizard"
              style={{ color: 'rgba(255, 255, 255, 0.5)' }}
            >
              <X size={20} />
            </GlassButton>
          </div>
        </div>

        {/* Step Content */}
        <div
          style={{
            flex: 1,
            padding: '24px',
            overflowY: 'auto',
          }}
        >
          {renderStep()}
        </div>

        {/* Navigation Footer */}
        <div style={{ padding: '0 24px 24px' }}>
          <WizardNavigation
            currentStep={state.currentStep}
            canProceed={state.currentStep === 3 ? canStartSession : isCurrentStepValid}
            isSubmitting={state.isSubmitting}
            validationMessage={validationMessage}
            onNext={handleNext}
            onBack={handleBack}
            onCancel={handleCancel}
            onSubmit={handleStartSession}
          />
        </div>
      </GlassPanel>
    </div>
  );
}
