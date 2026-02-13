import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useWorkflow } from './WorkflowContext';
import type { TestSession } from '../types/workflow';

// Session phases
export type SessionPhase = 'idle' | 'planning' | 'active' | 'capturing' | 'analyzing' | 'completed';

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
  loadSessionById: (sessionId: string) => void;

  // CUAS jam controls
  toggleJamState: (cuasPlacementId: string) => Promise<boolean>;
  setJamState: (cuasPlacementId: string, isJamming: boolean) => Promise<void>;
}

// Storage keys for persistence
const STORAGE_KEYS = {
  ACTIVE_SESSION_ID: 'scensus_active_session_id',
  CURRENT_PHASE: 'scensus_current_phase',
  PHASE_START_TIME: 'scensus_phase_start_time',
  WIZARD_DATA: 'scensus_wizard_data',
  WIZARD_STEP: 'scensus_wizard_step',
  CUAS_JAM_STATES: 'scensus_cuas_jam_states',
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

  // Timer ref for phase duration
  const durationTimerRef = useRef<number | null>(null);

  // Get active session with proper memoization - prioritize workflowActiveSession for real-time updates
  const activeSession = useMemo(() => {
    if (!activeSessionId) return workflowActiveSession;

    // Prefer workflowActiveSession if it matches (most up-to-date with events)
    if (workflowActiveSession?.id === activeSessionId) {
      return workflowActiveSession;
    }

    // Try testSessions lookup
    const fromSessions = testSessions.find(s => s.id === activeSessionId);
    if (fromSessions) return fromSessions;

    // Fallback to localActiveSession for immediate display after startTest
    return localActiveSession;
  }, [activeSessionId, workflowActiveSession, testSessions, localActiveSession]);

  // Sync localActiveSession with workflowActiveSession when it changes
  useEffect(() => {
    if (workflowActiveSession && activeSessionId && workflowActiveSession.id === activeSessionId) {
      setLocalActiveSession(workflowActiveSession);
    }
  }, [workflowActiveSession, activeSessionId]);

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
      // Don't restore 'completed' phase - it's stale on app restart
      // The user should start fresh without seeing old completion banners
      if (savedPhase === 'completed') {
        console.log('[TestSessionPhase] Clearing stale completed session on startup');
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION_ID);
        localStorage.removeItem(STORAGE_KEYS.CURRENT_PHASE);
        localStorage.removeItem(STORAGE_KEYS.PHASE_START_TIME);
        localStorage.removeItem(STORAGE_KEYS.CUAS_JAM_STATES);
        // Keep phase as 'idle' (the default)
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

    if (savedJamStates) {
      try {
        const parsed = JSON.parse(savedJamStates);
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

  // Persist jam states
  const persistJamStates = useCallback((states: CUASJamStates) => {
    const obj: Record<string, boolean> = {};
    states.forEach((value, key) => {
      obj[key] = value;
    });
    localStorage.setItem(STORAGE_KEYS.CUAS_JAM_STATES, JSON.stringify(obj));
  }, []);

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
      const result = await stopSession(activeSessionId);

      // Transition to completed after successful stop
      if (result) {
        // Update localActiveSession with the stopped session (includes end_time)
        setLocalActiveSession(result.session);

        setCurrentPhase('completed');
        setPhaseStartTime(null);
        persistState(activeSessionId, 'completed', null);
        localStorage.removeItem(STORAGE_KEYS.CUAS_JAM_STATES);
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
  const loadSessionById = useCallback((sessionId: string) => {
    // Find the session in testSessions
    const session = testSessions.find(s => s.id === sessionId);
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

  const value: TestSessionPhaseContextType = {
    currentPhase,
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
  };

  return (
    <TestSessionPhaseContext.Provider value={value}>
      {children}
    </TestSessionPhaseContext.Provider>
  );
}
