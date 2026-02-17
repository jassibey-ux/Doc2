import { useReducer, useEffect, useCallback, useState, lazy, Suspense } from 'react';
import { X, Zap, Target } from 'lucide-react';
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

const Site3DViewer = lazy(() => import('../Site3DViewer'));

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
  // When true, hide MapView's CesiumMap to prevent dual instances
  onWizardOpenChange?: (isOpen: boolean) => void;
}

const STEP_TITLES = ['Site', 'Drones', 'CUAS', 'Review'];

// Default globe site (shows Earth when no site selected)
const DEFAULT_GLOBE_SITE: SiteDefinition = {
  id: '__default_globe__',
  name: 'Globe',
  environment_type: 'open_field',
  center: { lat: 30, lon: 0 },
  boundary_polygon: [],
  markers: [],
  zones: [],
  created_at: '',
  updated_at: '',
};

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
  onWizardOpenChange,
}: SessionSetupWizardProps) {
  const [state, dispatch] = useReducer(wizardReducer, initialWizardState);
  const { showToast } = useToast();
  const { selectSite } = useWorkflow();

  // CUAS placement mode: which placement ID is being placed on the 3D map
  const [activePlacingCuasId, setActivePlacingCuasId] = useState<string | null>(null);

  // Notify parent when wizard opens/closes (for dual instance prevention)
  useEffect(() => {
    onWizardOpenChange?.(isOpen);
  }, [isOpen, onWizardOpenChange]);

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
      setActivePlacingCuasId(null);
    }
  }, [isOpen]);

  // Sync wizard site selection to WorkflowContext
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

  // Escape key cancels CUAS placement mode
  useEffect(() => {
    if (!activePlacingCuasId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActivePlacingCuasId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePlacingCuasId]);

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
    selectSite(null);
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

  // Handle CUAS placement on 2D map (old pathway, kept for compat)
  const handlePlaceOnMap = useCallback((placementId: string) => {
    onRequestCuasPlacement?.(placementId);
  }, [onRequestCuasPlacement]);

  // Handle CUAS placement on 3D viewer (new pathway)
  const handlePlaceOn3D = useCallback((placementId: string) => {
    setActivePlacingCuasId(placementId);
  }, []);

  // Handle 3D map click for CUAS placement
  const handleCuasPlacedOn3D = useCallback((position: { lat: number; lon: number; alt_m: number }) => {
    if (!activePlacingCuasId) return;
    dispatch({
      type: 'UPDATE_CUAS_PLACEMENT',
      placementId: activePlacingCuasId,
      updates: {
        position: { lat: position.lat, lon: position.lon },
      },
    });
    setActivePlacingCuasId(null);
  }, [activePlacingCuasId]);

  // Quick Start - auto-fill defaults and jump to review
  const handleQuickStart = useCallback(() => {
    const defaultProfile = droneProfiles[0];
    const droneAssignments = Array.from(liveTrackers.keys()).map((trackerId, index) => ({
      trackerId,
      droneProfileId: defaultProfile?.id || 'default',
      color: TRACK_COLORS[index % TRACK_COLORS.length],
    }));

    const siteId = sites[0]?.id || null;
    const siteName = sites[0]?.name || 'Quick Test';
    const newSiteName = siteId ? '' : siteName;

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

  // Validation
  const isCurrentStepValid = validateStep(state, state.currentStep);
  const validationMessage = getValidationMessage(state, state.currentStep);
  const canStartSession =
    validateStep(state, 0) &&
    validateStep(state, 1) &&
    validateStep(state, 3);

  if (!isOpen || isMinimizedForPlacement) {
    return null;
  }

  // Derive the current site for the 3D viewer
  const currentSite = state.selectedSiteId
    ? sites.find(s => s.id === state.selectedSiteId) ?? DEFAULT_GLOBE_SITE
    : DEFAULT_GLOBE_SITE;

  // Build CUAS placements in Site3DViewer format for live preview
  const viewer3DCuasPlacements = state.cuasPlacements.map(p => ({
    id: p.id,
    cuas_profile_id: p.cuasProfileId,
    position: { lat: p.position.lat, lon: p.position.lon },
    height_agl_m: p.heightAgl,
    orientation_deg: p.orientation,
    active: true,
  }));

  // 3D viewer mode: interactive on step 2 when placing, preview otherwise
  const viewer3DMode = (state.currentStep === 2 && activePlacingCuasId) ? 'interactive' : 'preview';

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
            onPlaceOn3D={handlePlaceOn3D}
            selectedSite={state.selectedSiteId ? sites.find(s => s.id === state.selectedSiteId) : undefined}
            cuasProfilesList={cuasProfiles}
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
        flexDirection: 'row',
      }}
    >
      {/* ── Left Panel: Wizard (450px) ── */}
      <GlassPanel
        className="wizard-container"
        style={{
          width: '450px',
          minWidth: '450px',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(10, 15, 26, 0.98)',
          borderRight: '1px solid rgba(255, 140, 0, 0.2)',
          borderRadius: 0,
          boxShadow: '4px 0 24px rgba(0, 0, 0, 0.4)',
          zIndex: 1,
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

      {/* ── Right Area: 3D Site Viewer ── */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          background: '#0a0a0a',
        }}
      >
        <Suspense
          fallback={
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                background: '#0a0a0a',
                color: '#888',
                fontSize: 14,
              }}
            >
              Loading 3D Viewer...
            </div>
          }
        >
          <Site3DViewer
            site={currentSite}
            cuasPlacements={viewer3DCuasPlacements}
            cuasProfiles={cuasProfiles}
            mode={viewer3DMode as 'preview' | 'interactive'}
            tileMode="osm"
            initialCameraState={currentSite.camera_state_3d}
            onCuasPlaced={handleCuasPlacedOn3D}
          />
        </Suspense>

        {/* CUAS Placement Banner — shown when placing on 3D map */}
        {activePlacingCuasId && (
          <div
            style={{
              position: 'absolute',
              top: 16,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 24px',
              background: 'rgba(249, 115, 22, 0.95)',
              borderRadius: 12,
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
              animation: 'fadeIn 0.3s ease',
            }}
          >
            <Target
              size={20}
              color="#fff"
              style={{ animation: 'pulse 1.5s ease-in-out infinite' }}
            />
            <span style={{ color: '#fff', fontWeight: 500, fontSize: 14 }}>
              Click on 3D map to place CUAS — press Escape to cancel
            </span>
            <button
              onClick={() => setActivePlacingCuasId(null)}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                borderRadius: 6,
                color: '#fff',
                padding: '4px 12px',
                fontSize: 12,
                cursor: 'pointer',
                marginLeft: 8,
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Pulsing border on 3D panel during placement */}
        {activePlacingCuasId && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              border: '2px solid rgba(249, 115, 22, 0.6)',
              borderRadius: 0,
              pointerEvents: 'none',
              animation: 'pulse-border 1.5s ease-in-out infinite',
            }}
          />
        )}

        {/* Step indicator overlay on 3D area */}
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            right: 16,
            zIndex: 10,
            padding: '6px 12px',
            background: 'rgba(0, 0, 0, 0.6)',
            borderRadius: 8,
            fontSize: 11,
            color: 'rgba(255, 255, 255, 0.5)',
          }}
        >
          {currentSite.id === '__default_globe__'
            ? 'Select a site to view in 3D'
            : currentSite.name}
        </div>
      </div>

      {/* Inline style for pulse-border animation */}
      <style>{`
        @keyframes pulse-border {
          0%, 100% { border-color: rgba(249, 115, 22, 0.3); }
          50% { border-color: rgba(249, 115, 22, 0.8); }
        }
      `}</style>
    </div>
  );
}
