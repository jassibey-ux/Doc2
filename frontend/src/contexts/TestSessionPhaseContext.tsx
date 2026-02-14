import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useWorkflow } from './WorkflowContext';
import type { TestSession, Engagement, JamBurst, SessionActor } from '../types/workflow';
import { useToast } from './ToastContext';

// Session phases
export type SessionPhase = 'idle' | 'planning' | 'active' | 'capturing' | 'analyzing' | 'completed';

// Sub-states for the 'active' phase — drives engagement-aware UI behavior
export type ActiveSubState =
  | 'no_engagements'       // Session started, no engagement created yet
  | 'engagement_active'    // At least one engagement in progress
  | 'between_engagements'  // All engagements paused/complete, session still active
  | 'all_complete';        // All planned engagements done, ready to stop

// Wizard session data collected during setup
export interface WizardSessionData {
  name: string;
  siteId: string | null;
  droneAssignments: Array<{
    trackerId: string;
    droneProfileId: string;
    color: string;
    targetAltitude?: number;
  }>;
  cuasPlacements: Array<{
    cuasProfileId: string;
    position: { lat: number; lon: number };
    heightAgl: number;
    orientation: number;
  }>;
  operatorName: string;
  weatherNotes: string;
}

// CUAS jam states during active session
export type CUASJamStates = Map<string, boolean>;

// Context type
interface TestSessionPhaseContextType {
  // Current phase
  currentPhase: SessionPhase;
  activeSubState: ActiveSubState;
  activeSessionId: string | null;
  activeSession: TestSession | null;

  // Phase timing
  phaseStartTime: number | null;
  phaseDuration: number;

  // Wizard state
  wizardOpen: boolean;
  wizardStep: number;
  wizardData: WizardSessionData;

  // CUAS jam states during active session
  cuasJamStates: CUASJamStates;

  // Wizard actions
  openWizard: () => void;
  closeWizard: () => void;
  setWizardStep: (step: number) => void;
  updateWizardData: (data: Partial<WizardSessionData>) => void;
  resetWizard: () => void;

  // Phase transitions
  startTest: (sessionId: string) => Promise<TestSession | null>;
  stopTest: () => Promise<void>;
  beginCapture: () => void;
  completeCapture: () => void;
  runAnalysis: () => Promise<void>;
  completeSession: () => void;
  clearActiveSession: () => void;
  loadSessionById: (sessionId: string) => Promise<void>;

  // CUAS jam controls
  toggleJamState: (cuasPlacementId: string) => Promise<boolean>;
  setJamState: (cuasPlacementId: string, isJamming: boolean) => Promise<void>;

  // Engagement controls
  engagements: Engagement[];
  activeEngagements: Map<string, Engagement>;
  createEngagement: (cuasPlacementId: string, targetTrackerIds: string[], name?: string) => Promise<Engagement | null>;
  quickEngage: (cuasPlacementId?: string) => Promise<Engagement | null>;
  engage: (engagementId: string) => Promise<Engagement | null>;
  disengage: (engagementId: string) => Promise<Engagement | null>;
  abortEngagement: (engagementId: string) => Promise<void>;
  refreshEngagements: () => Promise<void>;

  // Jam burst controls
  activeBursts: Map<string, JamBurst>;
  jamOn: (engagementId: string) => Promise<JamBurst | null>;
  jamOff: (engagementId: string) => Promise<JamBurst | null>;

  // Session actor controls
  sessionActors: SessionActor[];
  createActor: (data: { name: string; callsign?: string; lat?: number; lon?: number; heading_deg?: number; tracker_unit_id?: string }) => Promise<SessionActor | null>;
  updateActorPosition: (actorId: string, lat: number, lon: number, heading?: number) => Promise<void>;
  refreshActors: () => Promise<void>;
}

// Storage keys for persistence
const STORAGE_KEYS = {
  ACTIVE_SESSION_ID: 'scensus_active_session_id',
  CURRENT_PHASE: 'scensus_current_phase',
  PHASE_START_TIME: 'scensus_phase_start_time',
  WIZARD_DATA: 'scensus_wizard_data',
  WIZARD_STEP: 'scensus_wizard_step',
  CUAS_JAM_STATES: 'scensus_cuas_jam_states',
  ENGAGEMENTS: 'scensus_engagements',
};

// Default wizard data
const DEFAULT_WIZARD_DATA: WizardSessionData = {
  name: '',
  siteId: null,
  droneAssignments: [],
  cuasPlacements: [],
  operatorName: '',
  weatherNotes: '',
};

const TestSessionPhaseContext = createContext<TestSessionPhaseContextType | null>(null);

export function useTestSessionPhase() {
  const context = useContext(TestSessionPhaseContext);
  if (!context) {
    throw new Error('useTestSessionPhase must be used within a TestSessionPhaseProvider');
  }
  return context;
}

interface TestSessionPhaseProviderProps {
  children: React.ReactNode;
}

export function TestSessionPhaseProvider({ children }: TestSessionPhaseProviderProps) {
  const { testSessions, activeSession: workflowActiveSession, startSession, stopSession, addEvent } = useWorkflow();
  const { showToast } = useToast();

  // Phase state
  const [currentPhase, setCurrentPhase] = useState<SessionPhase>('idle');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [localActiveSession, setLocalActiveSession] = useState<TestSession | null>(null);
  const [phaseStartTime, setPhaseStartTime] = useState<number | null>(null);
  const [phaseDuration, setPhaseDuration] = useState(0);
  const [finalDuration, setFinalDuration] = useState<number | null>(null);

  // Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardData, setWizardData] = useState<WizardSessionData>(DEFAULT_WIZARD_DATA);

  // CUAS jam states
  const [cuasJamStates, setCuasJamStates] = useState<CUASJamStates>(new Map());

  // Engagement state
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [activeBursts, setActiveBursts] = useState<Map<string, JamBurst>>(new Map());
  const [sessionActors, setSessionActors] = useState<SessionActor[]>([]);
  const activeEngagements = useMemo(() => {
    const map = new Map<string, Engagement>();
    engagements
      .filter(e => e.status === 'active')
      .forEach(e => map.set(e.id, e));
    return map;
  }, [engagements]);

  // Compute engagement-aware sub-state for the active phase
  const activeSubState: ActiveSubState = useMemo(() => {
    if (currentPhase !== 'active') return 'no_engagements';
    if (engagements.length === 0) return 'no_engagements';
    if (activeEngagements.size > 0) return 'engagement_active';
    // All engagements exist but none are active
    const allDone = engagements.every(e => e.status === 'complete' || e.status === 'aborted');
    if (allDone) return 'all_complete';
    return 'between_engagements';
  }, [currentPhase, engagements, activeEngagements]);

  // Timer ref for phase duration
  const durationTimerRef = useRef<number | null>(null);

  // Get active session - prefer localActiveSession (from DETAIL endpoint) when it has richer data
  const activeSession = useMemo(() => {
    if (!activeSessionId) return workflowActiveSession;

    // Prefer localActiveSession if it has cuas_placements (fetched from DETAIL endpoint)
    if (localActiveSession?.id === activeSessionId && (localActiveSession.cuas_placements?.length ?? 0) > 0) {
      return localActiveSession;
    }

    // Fall back to workflowActiveSession if it matches
    if (workflowActiveSession?.id === activeSessionId) {
      return workflowActiveSession;
    }

    // Try testSessions lookup
    const fromSessions = testSessions.find(s => s.id === activeSessionId);
    if (fromSessions) return fromSessions;

    // Final fallback to localActiveSession even without cuas_placements
    return localActiveSession;
  }, [activeSessionId, workflowActiveSession, testSessions, localActiveSession]);

  // Sync localActiveSession with workflowActiveSession — but only if local doesn't already have richer data
  useEffect(() => {
    if (workflowActiveSession && activeSessionId && workflowActiveSession.id === activeSessionId) {
      // Don't overwrite localActiveSession if it has cuas_placements from DETAIL endpoint
      if ((localActiveSession?.cuas_placements?.length ?? 0) === 0) {
        setLocalActiveSession(workflowActiveSession);
      }
    }
  }, [workflowActiveSession, activeSessionId, localActiveSession]);

  // Restore state from localStorage on mount
  useEffect(() => {
    const savedSessionId = localStorage.getItem(STORAGE_KEYS.ACTIVE_SESSION_ID);
    const savedPhaseRaw = localStorage.getItem(STORAGE_KEYS.CURRENT_PHASE);
    const savedPhaseStartTime = localStorage.getItem(STORAGE_KEYS.PHASE_START_TIME);
    const savedWizardData = localStorage.getItem(STORAGE_KEYS.WIZARD_DATA);
    const savedWizardStep = localStorage.getItem(STORAGE_KEYS.WIZARD_STEP);
    const savedJamStates = localStorage.getItem(STORAGE_KEYS.CUAS_JAM_STATES);

    // Validate saved phase against known values
    const validPhases: SessionPhase[] = ['idle', 'planning', 'active', 'capturing', 'analyzing', 'completed'];
    const savedPhase: SessionPhase | null = savedPhaseRaw && validPhases.includes(savedPhaseRaw as SessionPhase)
      ? (savedPhaseRaw as SessionPhase)
      : null;

    if (savedSessionId && savedPhase && savedPhase !== 'idle') {
      if (savedPhase === 'completed') {
        // Keep session ID so completed sessions can be revisited,
        // but reset phase to idle so RecordingBar doesn't show
        console.log('[TestSessionPhase] Completed session found on startup — keeping ID, resetting phase to idle');
        setActiveSessionId(savedSessionId);
        localStorage.setItem(STORAGE_KEYS.CURRENT_PHASE, 'idle');
        localStorage.removeItem(STORAGE_KEYS.PHASE_START_TIME);
        localStorage.removeItem(STORAGE_KEYS.CUAS_JAM_STATES);
      } else {
        setActiveSessionId(savedSessionId);
        setCurrentPhase(savedPhase);

        if (savedPhaseStartTime) {
          setPhaseStartTime(parseInt(savedPhaseStartTime, 10));
        }
      }
    }

    if (savedWizardData) {
      try {
        setWizardData(JSON.parse(savedWizardData));
      } catch (e) {
        console.error('Failed to parse saved wizard data:', e);
      }
    }

    if (savedWizardStep) {
      setWizardStep(parseInt(savedWizardStep, 10));
    }

    // Restore jam states from namespaced key (per-session) or legacy key
    const jamStatesKey = savedSessionId
      ? `${STORAGE_KEYS.CUAS_JAM_STATES}_${savedSessionId}`
      : STORAGE_KEYS.CUAS_JAM_STATES;
    const restoredJamStates = localStorage.getItem(jamStatesKey) || savedJamStates;
    if (restoredJamStates) {
      try {
        const parsed = JSON.parse(restoredJamStates);
        setCuasJamStates(new Map(Object.entries(parsed)));
      } catch (e) {
        console.error('Failed to parse saved jam states:', e);
      }
    }
  }, []);

  // Update phase duration timer
  useEffect(() => {
    // When completed, preserve the final duration - don't reset to 0
    if (currentPhase === 'completed') {
      // Use finalDuration if set, otherwise keep current phaseDuration
      if (finalDuration !== null) {
        setPhaseDuration(finalDuration);
      }
      return;
    }

    // When idle, reset to 0
    if (currentPhase === 'idle') {
      setPhaseDuration(0);
      return;
    }

    // For active phases, run the timer
    if (phaseStartTime) {
      const updateDuration = () => {
        setPhaseDuration(Math.floor((Date.now() - phaseStartTime) / 1000));
      };

      updateDuration();
      durationTimerRef.current = window.setInterval(updateDuration, 1000);

      return () => {
        if (durationTimerRef.current) {
          clearInterval(durationTimerRef.current);
        }
      };
    }
  }, [phaseStartTime, currentPhase, finalDuration]);

  // Persist state to localStorage
  const persistState = useCallback((
    sessionId: string | null,
    phase: SessionPhase,
    startTime: number | null
  ) => {
    if (sessionId) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_SESSION_ID, sessionId);
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION_ID);
    }

    localStorage.setItem(STORAGE_KEYS.CURRENT_PHASE, phase);

    if (startTime) {
      localStorage.setItem(STORAGE_KEYS.PHASE_START_TIME, String(startTime));
    } else {
      localStorage.removeItem(STORAGE_KEYS.PHASE_START_TIME);
    }
  }, []);

  // Sync currentPhase with session status when viewing an active session
  // This ensures JAM button appears even when navigating directly to SessionConsole
  useEffect(() => {
    if (activeSession) {
      // If we have an active session with 'active' status but phase is not 'active', sync it
      if (activeSession.status === 'active' && currentPhase !== 'active') {
        console.log('[TestSessionPhase] Syncing phase to active based on session status');
        setCurrentPhase('active');
        // Set phase start time if not already set
        if (!phaseStartTime) {
          const startTime = activeSession.start_time ? new Date(activeSession.start_time).getTime() : Date.now();
          setPhaseStartTime(startTime);
        }
        persistState(activeSession.id, 'active', phaseStartTime || Date.now());
      }
      // Similarly, if session is completed but phase is not, sync it
      else if (activeSession.status === 'completed' && currentPhase !== 'completed') {
        console.log('[TestSessionPhase] Syncing phase to completed based on session status');
        setCurrentPhase('completed');
        setPhaseStartTime(null);
        persistState(activeSession.id, 'completed', null);
      }
    }
  }, [activeSession, currentPhase, phaseStartTime, persistState]);

  // Persist wizard data
  const persistWizardData = useCallback((data: WizardSessionData, step: number) => {
    localStorage.setItem(STORAGE_KEYS.WIZARD_DATA, JSON.stringify(data));
    localStorage.setItem(STORAGE_KEYS.WIZARD_STEP, String(step));
  }, []);

  // Persist jam states — namespaced per session to prevent leakage between sessions
  const persistJamStates = useCallback((states: CUASJamStates) => {
    const obj: Record<string, boolean> = {};
    states.forEach((value, key) => {
      obj[key] = value;
    });
    const key = activeSessionId
      ? `${STORAGE_KEYS.CUAS_JAM_STATES}_${activeSessionId}`
      : STORAGE_KEYS.CUAS_JAM_STATES;
    localStorage.setItem(key, JSON.stringify(obj));
  }, [activeSessionId]);

  // Clear wizard persistence
  const clearWizardPersistence = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.WIZARD_DATA);
    localStorage.removeItem(STORAGE_KEYS.WIZARD_STEP);
  }, []);

  // Wizard actions
  const openWizard = useCallback(() => {
    setWizardOpen(true);
    setCurrentPhase('planning');
    persistState(null, 'planning', null);
  }, [persistState]);

  const closeWizard = useCallback(() => {
    setWizardOpen(false);
    if (currentPhase === 'planning') {
      setCurrentPhase('idle');
      persistState(null, 'idle', null);
    }
  }, [currentPhase, persistState]);

  const updateWizardData = useCallback((data: Partial<WizardSessionData>) => {
    setWizardData(prev => {
      const next = { ...prev, ...data };
      persistWizardData(next, wizardStep);
      return next;
    });
  }, [wizardStep, persistWizardData]);

  const setWizardStepWithPersist = useCallback((step: number) => {
    setWizardStep(step);
    persistWizardData(wizardData, step);
  }, [wizardData, persistWizardData]);

  const resetWizard = useCallback(() => {
    setWizardStep(0);
    setWizardData(DEFAULT_WIZARD_DATA);
    clearWizardPersistence();
  }, [clearWizardPersistence]);

  // Phase transitions
  const startTest = useCallback(async (sessionId: string): Promise<TestSession | null> => {
    try {
      const session = await startSession(sessionId);
      if (session) {
        const now = Date.now();
        setActiveSessionId(sessionId);
        setLocalActiveSession(session); // Set immediately for RecordingBar
        setCurrentPhase('active');
        setPhaseStartTime(now);
        setWizardOpen(false);

        // Initialize jam states for all CUAS placements
        const initialJamStates = new Map<string, boolean>();
        session.cuas_placements?.forEach(placement => {
          initialJamStates.set(placement.id, false);
        });
        setCuasJamStates(initialJamStates);

        persistState(sessionId, 'active', now);
        clearWizardPersistence();
        persistJamStates(initialJamStates);

        return session;
      }
      return null;
    } catch (error) {
      console.error('Failed to start test:', error);
      throw error;
    }
  }, [startSession, persistState, clearWizardPersistence, persistJamStates]);

  const stopTest = useCallback(async () => {
    if (!activeSessionId) return;

    try {
      // FIRST: Capture final duration BEFORE any state changes
      // This ensures the duration is preserved when phase transitions
      const calculatedDuration = phaseStartTime
        ? Math.floor((Date.now() - phaseStartTime) / 1000)
        : 0;
      setFinalDuration(calculatedDuration);

      // Transition to capturing (saving) phase briefly
      setCurrentPhase('capturing');
      persistState(activeSessionId, 'capturing', Date.now());

      // Stop the session (this triggers CSV export on the backend)
      // 30s timeout prevents UI from hanging on slow backend responses
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Stop session timed out after 30s')), 30_000)
      );
      const result = await Promise.race([stopSession(activeSessionId), timeoutPromise]);

      // Transition to completed after successful stop
      if (result) {
        // Update localActiveSession with the stopped session (includes end_time)
        setLocalActiveSession(result.session);

        setCurrentPhase('completed');
        setPhaseStartTime(null);
        persistState(activeSessionId, 'completed', null);
        localStorage.removeItem(STORAGE_KEYS.CUAS_JAM_STATES);
        localStorage.removeItem(`${STORAGE_KEYS.CUAS_JAM_STATES}_${activeSessionId}`);
      }
    } catch (error) {
      console.error('Failed to stop test:', error);
      // Revert to active phase if stop failed
      setCurrentPhase('active');
      setFinalDuration(null);
      persistState(activeSessionId, 'active', phaseStartTime);
      throw error;
    }
  }, [activeSessionId, stopSession, persistState, phaseStartTime]);

  const beginCapture = useCallback(() => {
    if (!activeSessionId) return;
    const now = Date.now();
    setCurrentPhase('capturing');
    setPhaseStartTime(now);
    persistState(activeSessionId, 'capturing', now);
  }, [activeSessionId, persistState]);

  const completeCapture = useCallback(() => {
    if (!activeSessionId) return;
    const now = Date.now();
    setCurrentPhase('analyzing');
    setPhaseStartTime(now);
    persistState(activeSessionId, 'analyzing', now);
  }, [activeSessionId, persistState]);

  const runAnalysis = useCallback(async () => {
    if (!activeSessionId) return;

    try {
      // Call analysis API endpoint
      const response = await fetch(`/api/v2/sessions/${activeSessionId}/compute-metrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });

      if (!response.ok) {
        throw new Error('Analysis failed');
      }

      // Analysis complete, transition to completed
      completeSession();
    } catch (error) {
      console.error('Analysis failed:', error);
      throw error;
    }
  }, [activeSessionId]);

  const completeSession = useCallback(() => {
    setCurrentPhase('completed');
    setPhaseStartTime(null);
    persistState(activeSessionId, 'completed', null);
    localStorage.removeItem(STORAGE_KEYS.CUAS_JAM_STATES);
    if (activeSessionId) localStorage.removeItem(`${STORAGE_KEYS.CUAS_JAM_STATES}_${activeSessionId}`);
  }, [activeSessionId, persistState]);

  const clearActiveSession = useCallback(() => {
    setActiveSessionId(null);
    setLocalActiveSession(null);
    setCurrentPhase('idle');
    setPhaseStartTime(null);
    setPhaseDuration(0);
    setCuasJamStates(new Map());
    resetWizard();

    localStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION_ID);
    localStorage.removeItem(STORAGE_KEYS.CURRENT_PHASE);
    localStorage.removeItem(STORAGE_KEYS.PHASE_START_TIME);
    localStorage.removeItem(STORAGE_KEYS.CUAS_JAM_STATES);
  }, [resetWizard]);

  // Load a session by ID (used when navigating directly to SessionConsole via URL)
  // Always fetches from DETAIL endpoint to get full data including cuas_placements
  const loadSessionById = useCallback(async (sessionId: string) => {
    try {
      // Fetch full session from DETAIL endpoint (includes cuas_placements, tracker_assignments, etc.)
      const res = await fetch(`/api/v2/sessions/${sessionId}`);
      let session: TestSession | undefined;

      if (res.ok) {
        session = await res.json();
        console.log('[TestSessionPhase] Fetched full session from API:', sessionId,
          'cuas_placements:', session?.cuas_placements?.length ?? 0,
          'tracker_assignments:', session?.tracker_assignments?.length ?? 0);
      } else {
        // Fallback to local testSessions array
        console.warn('[TestSessionPhase] DETAIL fetch failed, falling back to local data');
        session = testSessions.find(s => s.id === sessionId);
      }

      if (session) {
        console.log('[TestSessionPhase] Loading session by ID:', sessionId, 'status:', session.status);
        setActiveSessionId(sessionId);
        setLocalActiveSession(session);

        // Set phase based on session status
        if (session.status === 'active') {
          setCurrentPhase('active');
          const startTime = session.start_time ? new Date(session.start_time).getTime() : Date.now();
          setPhaseStartTime(startTime);
          persistState(sessionId, 'active', startTime);

          // Initialize jam states for CUAS placements
          const initialJamStates = new Map<string, boolean>();
          session.cuas_placements?.forEach(placement => {
            initialJamStates.set(placement.id, false);
          });
          setCuasJamStates(initialJamStates);
          persistJamStates(initialJamStates);
        } else if (session.status === 'completed') {
          setCurrentPhase('completed');
          setPhaseStartTime(null);
          persistState(sessionId, 'completed', null);
        }
      } else {
        console.warn('[TestSessionPhase] Session not found:', sessionId);
      }
    } catch (err) {
      console.error('[TestSessionPhase] Error loading session:', err);
      // Last resort fallback
      const session = testSessions.find(s => s.id === sessionId);
      if (session) {
        setActiveSessionId(sessionId);
        setLocalActiveSession(session);
      }
    }
  }, [testSessions, persistState, persistJamStates]);

  // CUAS jam controls
  const toggleJamState = useCallback(async (cuasPlacementId: string): Promise<boolean> => {
    if (!activeSessionId || currentPhase !== 'active') {
      return cuasJamStates.get(cuasPlacementId) || false;
    }

    const currentState = cuasJamStates.get(cuasPlacementId) || false;
    const newState = !currentState;

    // Get CUAS placement for rich metadata
    const cuasPlacement = activeSession?.cuas_placements?.find(p => p.id === cuasPlacementId);

    // Build enhanced metadata with snapshot of current state
    const metadata: Record<string, unknown> = {
      // CUAS location for reference
      cuas_position: cuasPlacement ? {
        lat: cuasPlacement.position.lat,
        lon: cuasPlacement.position.lon,
        height_agl_m: cuasPlacement.height_agl_m,
      } : null,
      // Precise timestamp for correlation
      timestamp_ms: Date.now(),
      // Session context
      session_duration_s: phaseStartTime ? Math.floor((Date.now() - phaseStartTime) / 1000) : 0,
    };

    // Add event to session with enhanced metadata
    const eventType = newState ? 'jam_on' : 'jam_off';
    await addEvent(activeSessionId, {
      type: eventType,
      timestamp: new Date().toISOString(),
      source: 'manual',
      cuas_id: cuasPlacementId,
      metadata,
    });

    // Update local state
    setCuasJamStates(prev => {
      const next = new Map(prev);
      next.set(cuasPlacementId, newState);
      persistJamStates(next);
      return next;
    });

    return newState;
  }, [activeSessionId, currentPhase, cuasJamStates, addEvent, persistJamStates, activeSession, phaseStartTime]);

  const setJamState = useCallback(async (cuasPlacementId: string, isJamming: boolean) => {
    if (!activeSessionId || currentPhase !== 'active') return;

    const currentState = cuasJamStates.get(cuasPlacementId) || false;
    if (currentState === isJamming) return;

    // Get CUAS placement for rich metadata
    const cuasPlacement = activeSession?.cuas_placements?.find(p => p.id === cuasPlacementId);

    // Build enhanced metadata with snapshot of current state
    const metadata: Record<string, unknown> = {
      // CUAS location for reference
      cuas_position: cuasPlacement ? {
        lat: cuasPlacement.position.lat,
        lon: cuasPlacement.position.lon,
        height_agl_m: cuasPlacement.height_agl_m,
      } : null,
      // Precise timestamp for correlation
      timestamp_ms: Date.now(),
      // Session context
      session_duration_s: phaseStartTime ? Math.floor((Date.now() - phaseStartTime) / 1000) : 0,
    };

    // Add event to session with enhanced metadata
    const eventType = isJamming ? 'jam_on' : 'jam_off';
    await addEvent(activeSessionId, {
      type: eventType,
      timestamp: new Date().toISOString(),
      source: 'manual',
      cuas_id: cuasPlacementId,
      metadata,
    });

    // Update local state
    setCuasJamStates(prev => {
      const next = new Map(prev);
      next.set(cuasPlacementId, isJamming);
      persistJamStates(next);
      return next;
    });
  }, [activeSessionId, currentPhase, cuasJamStates, addEvent, persistJamStates, activeSession, phaseStartTime]);

  // Refresh full session data (events, placements, etc.) from DETAIL endpoint
  const refreshSession = useCallback(async () => {
    if (!activeSessionId) return;
    try {
      const res = await fetch(`/api/v2/sessions/${activeSessionId}`);
      if (res.ok) {
        const session: TestSession = await res.json();
        setLocalActiveSession(session);
      }
    } catch (error) {
      console.error('Failed to refresh session:', error);
    }
  }, [activeSessionId]);

  // Engagement actions
  const refreshEngagements = useCallback(async () => {
    if (!activeSessionId) return;
    try {
      const response = await fetch(`/api/v2/sessions/${activeSessionId}/engagements`);
      if (response.ok) {
        const data = await response.json();
        const engList: Engagement[] = data.engagements || [];
        setEngagements(engList);

        // Compute activeBursts from engagement bursts (open bursts where jam_off_at is null)
        const openBursts = new Map<string, JamBurst>();
        for (const eng of engList) {
          if (eng.bursts) {
            const openBurst = eng.bursts.find(b => !b.jam_off_at);
            if (openBurst) {
              openBursts.set(eng.id, openBurst);
            }
          }
        }
        setActiveBursts(openBursts);
      }
    } catch (error) {
      console.error('Failed to refresh engagements:', error);
    }
  }, [activeSessionId]);

  // Refresh engagements when active session changes
  useEffect(() => {
    if (activeSessionId && currentPhase === 'active') {
      refreshEngagements();
    }
  }, [activeSessionId, currentPhase, refreshEngagements]);

  const createEngagement = useCallback(async (
    cuasPlacementId: string,
    targetTrackerIds: string[],
    name?: string,
  ): Promise<Engagement | null> => {
    if (!activeSessionId) return null;
    try {
      const response = await fetch(`/api/v2/sessions/${activeSessionId}/engagements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cuas_placement_id: cuasPlacementId,
          name,
          targets: targetTrackerIds.map(tid => ({
            tracker_id: tid,
            role: 'primary_target',
          })),
        }),
      });
      if (!response.ok) throw new Error('Failed to create engagement');
      const engagement = await response.json();
      await refreshEngagements();
      return engagement;
    } catch (error) {
      console.error('Failed to create engagement:', error);
      return null;
    }
  }, [activeSessionId, refreshEngagements]);

  const quickEngage = useCallback(async (cuasPlacementId?: string): Promise<Engagement | null> => {
    if (!activeSessionId) return null;
    try {
      const response = await fetch(`/api/v2/sessions/${activeSessionId}/engagements/quick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cuas_placement_id: cuasPlacementId || undefined,
        }),
      });
      if (!response.ok) throw new Error('Failed to quick engage');
      const engagement = await response.json();

      // Sync local jam state to match backend (burst auto-created)
      if (engagement.cuas_placement_id) {
        setCuasJamStates(prev => {
          const next = new Map(prev);
          next.set(engagement.cuas_placement_id, true);
          persistJamStates(next);
          return next;
        });
      }

      await refreshEngagements();
      await refreshSession();
      return engagement;
    } catch (error) {
      console.error('Failed to quick engage:', error);
      return null;
    }
  }, [activeSessionId, refreshEngagements, refreshSession, persistJamStates]);

  const engageAction = useCallback(async (engagementId: string): Promise<Engagement | null> => {
    try {
      const response = await fetch(`/api/v2/engagements/${engagementId}/engage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) throw new Error('Failed to engage');
      const engagement = await response.json();

      // Auto-sync JAM state
      if (engagement.cuas_placement_id) {
        await setJamState(engagement.cuas_placement_id, true);
      }

      await refreshEngagements();
      await refreshSession();
      return engagement;
    } catch (error) {
      console.error('Failed to engage:', error);
      return null;
    }
  }, [refreshEngagements, refreshSession, setJamState]);

  const disengageAction = useCallback(async (engagementId: string): Promise<Engagement | null> => {
    try {
      const response = await fetch(`/api/v2/engagements/${engagementId}/disengage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) throw new Error('Failed to disengage');
      const engagement = await response.json();

      // Auto-sync JAM state off
      if (engagement.cuas_placement_id) {
        await setJamState(engagement.cuas_placement_id, false);
      }

      await refreshEngagements();
      await refreshSession();
      return engagement;
    } catch (error) {
      console.error('Failed to disengage:', error);
      return null;
    }
  }, [refreshEngagements, refreshSession, setJamState]);

  const abortEngagement = useCallback(async (engagementId: string): Promise<void> => {
    try {
      const response = await fetch(`/api/v2/engagements/${engagementId}/abort`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) throw new Error('Failed to abort engagement');

      // Find the engagement to get CUAS placement ID
      const eng = engagements.find(e => e.id === engagementId);
      if (eng?.cuas_placement_id) {
        await setJamState(eng.cuas_placement_id, false);
      }

      await refreshEngagements();
    } catch (error) {
      console.error('Failed to abort engagement:', error);
    }
  }, [engagements, refreshEngagements, setJamState]);

  // Jam burst controls
  const jamOn = useCallback(async (engagementId: string): Promise<JamBurst | null> => {
    try {
      const response = await fetch(`/api/v2/engagements/${engagementId}/jam-on`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) throw new Error('Failed to start jam burst');
      const burst: JamBurst = await response.json();
      setActiveBursts(prev => {
        const next = new Map(prev);
        next.set(engagementId, burst);
        return next;
      });
      showToast('success', 'JAM ON — burst started');
      await refreshSession();
      return burst;
    } catch (error) {
      console.error('Failed to start jam burst:', error);
      showToast('error', 'Failed to start jam burst');
      return null;
    }
  }, [showToast, refreshSession]);

  const jamOff = useCallback(async (engagementId: string): Promise<JamBurst | null> => {
    try {
      const response = await fetch(`/api/v2/engagements/${engagementId}/jam-off`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) throw new Error('Failed to stop jam burst');
      const burst: JamBurst = await response.json();
      setActiveBursts(prev => {
        const next = new Map(prev);
        next.delete(engagementId);
        return next;
      });
      showToast('info', `JAM OFF — burst ${burst.duration_s ? burst.duration_s.toFixed(1) + 's' : 'ended'}`);
      await refreshSession();
      return burst;
    } catch (error) {
      console.error('Failed to stop jam burst:', error);
      showToast('error', 'Failed to stop jam burst');
      return null;
    }
  }, [showToast, refreshSession]);

  // Session actor controls
  const refreshActors = useCallback(async () => {
    if (!activeSessionId) return;
    try {
      const response = await fetch(`/api/v2/sessions/${activeSessionId}/actors`);
      if (response.ok) {
        const data = await response.json();
        setSessionActors(data.actors || data);
      }
    } catch (error) {
      console.error('Failed to refresh actors:', error);
    }
  }, [activeSessionId]);

  const createActor = useCallback(async (data: {
    name: string;
    callsign?: string;
    lat?: number;
    lon?: number;
    heading_deg?: number;
    tracker_unit_id?: string;
  }): Promise<SessionActor | null> => {
    if (!activeSessionId) return null;
    try {
      const response = await fetch(`/api/v2/sessions/${activeSessionId}/actors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to create actor');
      const actor: SessionActor = await response.json();
      await refreshActors();
      showToast('success', `Actor created: ${actor.name}`);
      return actor;
    } catch (error) {
      console.error('Failed to create actor:', error);
      showToast('error', 'Failed to create actor');
      return null;
    }
  }, [activeSessionId, refreshActors, showToast]);

  const updateActorPosition = useCallback(async (
    actorId: string,
    lat: number,
    lon: number,
    heading?: number,
  ): Promise<void> => {
    try {
      const body: Record<string, number> = { lat, lon };
      if (heading !== undefined) body.heading_deg = heading;
      const response = await fetch(`/api/v2/actors/${actorId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error('Failed to update actor position');
    } catch (error) {
      console.error('Failed to update actor position:', error);
    }
  }, []);

  // Refresh actors when active session changes
  useEffect(() => {
    if (activeSessionId && currentPhase === 'active') {
      refreshActors();
    }
  }, [activeSessionId, currentPhase, refreshActors]);

  const value: TestSessionPhaseContextType = {
    currentPhase,
    activeSubState,
    activeSessionId,
    activeSession: activeSession || null,
    phaseStartTime,
    // Use finalDuration for completed sessions, otherwise use live phaseDuration
    phaseDuration: currentPhase === 'completed' ? (finalDuration ?? phaseDuration) : phaseDuration,
    wizardOpen,
    wizardStep,
    wizardData,
    cuasJamStates,
    openWizard,
    closeWizard,
    setWizardStep: setWizardStepWithPersist,
    updateWizardData,
    resetWizard,
    startTest,
    stopTest,
    beginCapture,
    completeCapture,
    runAnalysis,
    completeSession,
    clearActiveSession,
    loadSessionById,
    toggleJamState,
    setJamState,
    engagements,
    activeEngagements,
    createEngagement,
    quickEngage,
    engage: engageAction,
    disengage: disengageAction,
    abortEngagement,
    refreshEngagements,
    activeBursts,
    jamOn,
    jamOff,
    sessionActors,
    createActor,
    updateActorPosition,
    refreshActors,
  };

  return (
    <TestSessionPhaseContext.Provider value={value}>
      {children}
    </TestSessionPhaseContext.Provider>
  );
}
