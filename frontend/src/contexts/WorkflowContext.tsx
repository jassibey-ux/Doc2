/**
 * Workflow Context
 * Manages CUAS workflow state: Sites, Drone Profiles, CUAS Profiles, Test Sessions
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  SiteDefinition,
  DroneProfile,
  CUASProfile,
  TestSession,
  WorkflowMode,
  TestEvent,
  TrackerAssignment,
  CUASPlacement,
  GeoPoint,
  SiteReconCapture,
  CameraState3D,
} from '../types/workflow';

// Drawing result passed from Map to SiteDefinitionPanel
export interface DrawingResult {
  type: 'polygon' | 'marker' | 'zone';
  points: GeoPoint[];
}

// Export summary returned when session stops
export interface SessionExportSummary {
  sessionId: string;
  sessionName: string;
  filesCreated: string[];
  totalPositions: number;
  outputPath: string;
  exportedAt: string;
}

interface WorkflowContextType {
  // Workflow mode
  workflowMode: WorkflowMode;
  setWorkflowMode: (mode: WorkflowMode) => void;

  // Sites
  sites: SiteDefinition[];
  selectedSite: SiteDefinition | null;
  loadSites: () => Promise<void>;
  selectSite: (site: SiteDefinition | null) => void;
  createSite: (site: Omit<SiteDefinition, 'id' | 'created_at' | 'updated_at'>) => Promise<SiteDefinition>;
  updateSite: (id: string, updates: Partial<SiteDefinition>) => Promise<SiteDefinition | null>;
  deleteSite: (id: string) => Promise<boolean>;

  // Drone Profiles
  droneProfiles: DroneProfile[];
  loadDroneProfiles: () => Promise<void>;
  createDroneProfile: (profile: Omit<DroneProfile, 'id' | 'created_at' | 'updated_at'>) => Promise<DroneProfile>;
  updateDroneProfile: (id: string, updates: Partial<DroneProfile>) => Promise<DroneProfile | null>;
  deleteDroneProfile: (id: string) => Promise<boolean>;

  // CUAS Profiles
  cuasProfiles: CUASProfile[];
  loadCUASProfiles: () => Promise<void>;
  createCUASProfile: (profile: Omit<CUASProfile, 'id' | 'created_at' | 'updated_at'>) => Promise<CUASProfile>;
  updateCUASProfile: (id: string, updates: Partial<CUASProfile>) => Promise<CUASProfile | null>;
  deleteCUASProfile: (id: string) => Promise<boolean>;

  // Test Sessions
  testSessions: TestSession[];
  activeSession: TestSession | null;
  loadTestSessions: () => Promise<void>;
  selectSession: (session: TestSession | null) => void;
  createTestSession: (session: Omit<TestSession, 'id' | 'created_at' | 'updated_at'>) => Promise<TestSession>;
  updateTestSession: (id: string, updates: Partial<TestSession>) => Promise<TestSession | null>;
  deleteTestSession: (id: string) => Promise<boolean>;

  // Session Operations
  startSession: (sessionId: string) => Promise<TestSession | null>;
  stopSession: (sessionId: string) => Promise<{ session: TestSession; exportSummary: SessionExportSummary | null } | null>;
  addEvent: (sessionId: string, event: Omit<TestEvent, 'id'>) => Promise<TestEvent | null>;
  assignTracker: (sessionId: string, assignment: Omit<TrackerAssignment, 'id' | 'assigned_at'>) => Promise<TrackerAssignment | null>;
  addCUASPlacement: (sessionId: string, placement: Omit<CUASPlacement, 'id'>) => Promise<CUASPlacement | null>;

  // Export summary (populated after session stop)
  lastExportSummary: SessionExportSummary | null;
  clearExportSummary: () => void;

  // Drawing state (for site definition)
  isDrawingMode: boolean;
  setIsDrawingMode: (drawing: boolean) => void;
  drawingType: 'polygon' | 'marker' | 'zone' | null;
  setDrawingType: (type: 'polygon' | 'marker' | 'zone' | null) => void;
  pendingDrawingResult: DrawingResult | null;
  setPendingDrawingResult: (result: DrawingResult | null) => void;

  // Site Recon (3D screenshot cache)
  siteReconCaptures: Map<string, SiteReconCapture[]>;
  loadSiteRecon: (siteId: string) => Promise<SiteReconCapture[]>;
  saveSiteReconImage: (siteId: string, captureId: string, base64: string, label: string, cameraState: CameraState3D) => Promise<void>;
  deleteSiteRecon: (siteId: string) => Promise<boolean>;

  // Loading state
  isLoading: boolean;
  error: string | null;
}

const WorkflowContext = createContext<WorkflowContextType | null>(null);

const API_BASE = '/api/v2';

export function WorkflowProvider({ children }: { children: React.ReactNode }) {
  // Workflow mode
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>('execute');

  // Data state
  const [sites, setSites] = useState<SiteDefinition[]>([]);
  const [selectedSite, setSelectedSite] = useState<SiteDefinition | null>(null);
  const [droneProfiles, setDroneProfiles] = useState<DroneProfile[]>([]);
  const [cuasProfiles, setCUASProfiles] = useState<CUASProfile[]>([]);
  const [testSessions, setTestSessions] = useState<TestSession[]>([]);
  const [activeSession, setActiveSession] = useState<TestSession | null>(null);

  // Drawing state
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [drawingType, setDrawingType] = useState<'polygon' | 'marker' | 'zone' | null>(null);
  const [pendingDrawingResult, setPendingDrawingResult] = useState<DrawingResult | null>(null);

  // Loading state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Export summary state
  const [lastExportSummary, setLastExportSummary] = useState<SessionExportSummary | null>(null);

  // Site recon captures cache
  const [siteReconCaptures, setSiteReconCaptures] = useState<Map<string, SiteReconCapture[]>>(new Map());

  const clearExportSummary = useCallback(() => {
    setLastExportSummary(null);
  }, []);

  // ==========================================================================
  // Site Recon (3D screenshot cache — Express v1 routes)
  // ==========================================================================

  const loadSiteRecon = useCallback(async (siteId: string): Promise<SiteReconCapture[]> => {
    try {
      const res = await fetch(`/api/site-recon/${siteId}`);
      if (!res.ok) return [];
      const data = await res.json();
      const captures: SiteReconCapture[] = (data.captures || []).map((c: Record<string, unknown>) => ({
        id: c.id as string,
        label: c.label as string,
        imagePath: `/api/site-recon/${siteId}/images/${c.id}`,
        cameraState: c.cameraState as CameraState3D,
      }));
      setSiteReconCaptures(prev => {
        const next = new Map(prev);
        next.set(siteId, captures);
        return next;
      });
      return captures;
    } catch (err) {
      console.error('[WorkflowContext] loadSiteRecon failed:', err);
      return [];
    }
  }, []);

  const saveSiteReconImage = useCallback(async (
    siteId: string,
    captureId: string,
    base64: string,
    label: string,
    cameraState: CameraState3D,
  ): Promise<void> => {
    const res = await fetch(`/api/site-recon/${siteId}/image`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ captureId, base64, label, cameraState }),
    });
    if (!res.ok) throw new Error('Failed to save recon image');
    // Reload captures for this site
    await loadSiteRecon(siteId);
  }, [loadSiteRecon]);

  const deleteSiteRecon = useCallback(async (siteId: string): Promise<boolean> => {
    const res = await fetch(`/api/site-recon/${siteId}`, { method: 'DELETE' });
    if (!res.ok) return false;
    setSiteReconCaptures(prev => {
      const next = new Map(prev);
      next.delete(siteId);
      return next;
    });
    return true;
  }, []);

  // ==========================================================================
  // Sites — transform between frontend (center: GeoPoint) and API (center_lat/center_lon)
  // ==========================================================================

  /** Convert API site response to frontend SiteDefinition shape */
  const siteFromApi = (apiSite: Record<string, unknown>): SiteDefinition => ({
    ...apiSite,
    center: { lat: apiSite.center_lat as number ?? 0, lon: apiSite.center_lon as number ?? 0 },
    boundary_polygon: Array.isArray(apiSite.boundary_polygon)
      ? apiSite.boundary_polygon
      : (apiSite.boundary_polygon as Record<string, unknown>)?.points ?? [],
  }) as unknown as SiteDefinition;

  /** Convert frontend site to API request shape */
  const siteToApi = (site: Record<string, unknown>) => {
    const { center, boundary_polygon, ...rest } = site;
    const c = center as { lat?: number; lon?: number } | undefined;
    const bp = boundary_polygon as unknown[];
    // If center object exists, use it; otherwise preserve flat center_lat/center_lon from rest
    const centerLat = c?.lat ?? (rest.center_lat as number | undefined) ?? 0;
    const centerLon = c?.lon ?? (rest.center_lon as number | undefined) ?? 0;
    return {
      ...rest,
      center_lat: centerLat,
      center_lon: centerLon,
      boundary_polygon: Array.isArray(bp) && bp.length > 0 ? { points: bp } : null,
    };
  };

  const loadSites = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`${API_BASE}/sites?limit=200`);
      if (!res.ok) throw new Error('Failed to load sites');
      const data = await res.json();
      const items = data.items ?? data;
      setSites(items.map(siteFromApi));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const selectSite = useCallback((site: SiteDefinition | null) => {
    setSelectedSite(site);
  }, []);

  const createSite = useCallback(async (site: Omit<SiteDefinition, 'id' | 'created_at' | 'updated_at'>) => {
    const apiPayload = siteToApi(site as Record<string, unknown>);
    console.log('[WorkflowContext] createSite payload:', JSON.stringify(apiPayload, null, 2));
    const res = await fetch(`${API_BASE}/sites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(apiPayload),
    });
    if (!res.ok) {
      const errorText = await res.text();
      console.error('[WorkflowContext] createSite failed:', res.status, errorText);
      throw new Error(`Failed to create site: ${res.status} ${errorText}`);
    }
    const newSite = siteFromApi(await res.json());
    console.log('[WorkflowContext] createSite success:', newSite.id);
    setSites(prev => [...prev, newSite]);
    return newSite;
  }, []);

  const updateSiteFunc = useCallback(async (id: string, updates: Partial<SiteDefinition>) => {
    const res = await fetch(`${API_BASE}/sites/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(siteToApi(updates as Record<string, unknown>)),
    });
    if (!res.ok) return null;
    const updated = siteFromApi(await res.json());
    setSites(prev => prev.map(s => s.id === id ? updated : s));
    if (selectedSite?.id === id) setSelectedSite(updated);
    return updated;
  }, [selectedSite]);

  const deleteSiteFunc = useCallback(async (id: string) => {
    const res = await fetch(`${API_BASE}/sites/${id}`, { method: 'DELETE' });
    if (!res.ok) return false;
    setSites(prev => prev.filter(s => s.id !== id));
    if (selectedSite?.id === id) setSelectedSite(null);
    return true;
  }, [selectedSite]);

  // ==========================================================================
  // Drone Profiles
  // ==========================================================================

  const loadDroneProfiles = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/drone-profiles?limit=200`);
      if (!res.ok) throw new Error('Failed to load drone profiles');
      const data = await res.json();
      setDroneProfiles(data.items ?? data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    }
  }, []);

  const createDroneProfile = useCallback(async (profile: Omit<DroneProfile, 'id' | 'created_at' | 'updated_at'>) => {
    const res = await fetch(`${API_BASE}/drone-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    if (!res.ok) throw new Error('Failed to create drone profile');
    const newProfile = await res.json();
    setDroneProfiles(prev => [...prev, newProfile]);
    return newProfile;
  }, []);

  const updateDroneProfileFunc = useCallback(async (id: string, updates: Partial<DroneProfile>) => {
    const res = await fetch(`${API_BASE}/drone-profiles/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) return null;
    const updated = await res.json();
    setDroneProfiles(prev => prev.map(p => p.id === id ? updated : p));
    return updated;
  }, []);

  const deleteDroneProfileFunc = useCallback(async (id: string) => {
    const res = await fetch(`${API_BASE}/drone-profiles/${id}`, { method: 'DELETE' });
    if (!res.ok) return false;
    setDroneProfiles(prev => prev.filter(p => p.id !== id));
    return true;
  }, []);

  // ==========================================================================
  // CUAS Profiles
  // ==========================================================================

  const loadCUASProfiles = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/cuas-profiles?limit=200`);
      if (!res.ok) throw new Error('Failed to load CUAS profiles');
      const data = await res.json();
      setCUASProfiles(data.items ?? data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    }
  }, []);

  const createCUASProfile = useCallback(async (profile: Omit<CUASProfile, 'id' | 'created_at' | 'updated_at'>) => {
    const res = await fetch(`${API_BASE}/cuas-profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    if (!res.ok) throw new Error('Failed to create CUAS profile');
    const newProfile = await res.json();
    setCUASProfiles(prev => [...prev, newProfile]);
    return newProfile;
  }, []);

  const updateCUASProfileFunc = useCallback(async (id: string, updates: Partial<CUASProfile>) => {
    const res = await fetch(`${API_BASE}/cuas-profiles/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) return null;
    const updated = await res.json();
    setCUASProfiles(prev => prev.map(p => p.id === id ? updated : p));
    return updated;
  }, []);

  const deleteCUASProfileFunc = useCallback(async (id: string) => {
    const res = await fetch(`${API_BASE}/cuas-profiles/${id}`, { method: 'DELETE' });
    if (!res.ok) return false;
    setCUASProfiles(prev => prev.filter(p => p.id !== id));
    return true;
  }, []);

  // ==========================================================================
  // Test Sessions
  // ==========================================================================

  const loadTestSessions = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/sessions?limit=200`);
      if (!res.ok) throw new Error('Failed to load test sessions');
      const data = await res.json();
      setTestSessions(data.items ?? data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    }
  }, []);

  const selectSession = useCallback((session: TestSession | null) => {
    setActiveSession(session);
  }, []);

  const createTestSession = useCallback(async (session: Omit<TestSession, 'id' | 'created_at' | 'updated_at'>) => {
    const res = await fetch(`${API_BASE}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session),
    });
    if (!res.ok) {
      const errorText = await res.text();
      console.error('[WorkflowContext] createTestSession failed:', res.status, errorText);
      throw new Error(`Failed to create test session: ${res.status} ${errorText}`);
    }
    const newSession = await res.json();
    console.log('[WorkflowContext] createTestSession success:', newSession.id);
    setTestSessions(prev => [newSession, ...prev]);
    return newSession;
  }, []);

  const updateTestSessionFunc = useCallback(async (id: string, updates: Partial<TestSession>) => {
    const res = await fetch(`${API_BASE}/sessions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) return null;
    const updated = await res.json();
    setTestSessions(prev => prev.map(s => s.id === id ? updated : s));
    if (activeSession?.id === id) setActiveSession(updated);
    return updated;
  }, [activeSession]);

  const deleteTestSessionFunc = useCallback(async (id: string) => {
    const res = await fetch(`${API_BASE}/sessions/${id}`, { method: 'DELETE' });
    if (!res.ok) return false;
    setTestSessions(prev => prev.filter(s => s.id !== id));
    if (activeSession?.id === id) setActiveSession(null);
    return true;
  }, [activeSession]);

  // Session operations
  const startSession = useCallback(async (sessionId: string) => {
    console.log('[WorkflowContext] startSession:', sessionId);
    const res = await fetch(`${API_BASE}/sessions/${sessionId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) {
      const errorText = await res.text();
      console.error('[WorkflowContext] startSession failed:', res.status, errorText);
      throw new Error(`Failed to start session: ${res.status} ${errorText}`);
    }
    const data = await res.json();
    console.log('[WorkflowContext] startSession response:', JSON.stringify(data).substring(0, 500));
    // v2 returns the full session directly (not wrapped in {session: ...})
    const updated = data.session ?? data;
    setTestSessions(prev => prev.map(s => s.id === sessionId ? updated : s));
    setActiveSession(updated);
    return updated;
  }, []);

  const stopSession = useCallback(async (sessionId: string) => {
    const res = await fetch(`${API_BASE}/sessions/${sessionId}/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) return null;
    const data = await res.json();

    // v2 returns { session: {...}, export_summary: {...} }
    const session = data.session ?? data;
    setTestSessions(prev => prev.map(s => s.id === sessionId ? session : s));
    setActiveSession(session);

    // Process export summary if present
    const rawSummary = data.export_summary;
    let exportSummary: SessionExportSummary | null = null;
    if (rawSummary) {
      exportSummary = {
        sessionId,
        sessionName: session.name,
        filesCreated: rawSummary.files_created || [],
        totalPositions: rawSummary.total_positions || 0,
        outputPath: rawSummary.output_path || '',
        exportedAt: new Date().toISOString(),
      };
      setLastExportSummary(exportSummary);
    }

    return { session, exportSummary };
  }, []);

  const addEvent = useCallback(async (sessionId: string, event: Omit<TestEvent, 'id'>) => {
    const res = await fetch(`${API_BASE}/sessions/${sessionId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    if (!res.ok) return null;
    const newEvent = await res.json();

    // Update local state
    setTestSessions(prev => prev.map(s => {
      if (s.id === sessionId) {
        return { ...s, events: [...(s.events || []), newEvent] };
      }
      return s;
    }));

    if (activeSession?.id === sessionId) {
      setActiveSession(prev => prev ? { ...prev, events: [...(prev.events || []), newEvent] } : null);
    }

    return newEvent;
  }, [activeSession]);

  const assignTracker = useCallback(async (sessionId: string, assignment: Omit<TrackerAssignment, 'id' | 'assigned_at'>) => {
    const res = await fetch(`${API_BASE}/sessions/${sessionId}/assign-tracker`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(assignment),
    });
    if (!res.ok) return null;
    const newAssignment = await res.json();

    // Refresh session
    const sessionRes = await fetch(`${API_BASE}/sessions/${sessionId}`);
    if (sessionRes.ok) {
      const updated = await sessionRes.json();
      setTestSessions(prev => prev.map(s => s.id === sessionId ? updated : s));
      if (activeSession?.id === sessionId) setActiveSession(updated);
    }

    return newAssignment;
  }, [activeSession]);

  const addCUASPlacement = useCallback(async (sessionId: string, placement: Omit<CUASPlacement, 'id'>) => {
    const res = await fetch(`${API_BASE}/sessions/${sessionId}/cuas-placement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(placement),
    });
    if (!res.ok) return null;
    const newPlacement = await res.json();

    // Refresh session
    const sessionRes = await fetch(`${API_BASE}/sessions/${sessionId}`);
    if (sessionRes.ok) {
      const updated = await sessionRes.json();
      setTestSessions(prev => prev.map(s => s.id === sessionId ? updated : s));
      if (activeSession?.id === sessionId) setActiveSession(updated);
    }

    return newPlacement;
  }, [activeSession]);

  // Load initial data (with defensive error handling)
  useEffect(() => {
    const loadData = async () => {
      try {
        await Promise.allSettled([
          loadSites(),
          loadDroneProfiles(),
          loadCUASProfiles(),
          loadTestSessions(),
        ]);
      } catch (err) {
        console.error('Error loading workflow data:', err);
      }
    };
    loadData();
  }, [loadSites, loadDroneProfiles, loadCUASProfiles, loadTestSessions]);

  const value: WorkflowContextType = {
    workflowMode,
    setWorkflowMode,
    sites,
    selectedSite,
    loadSites,
    selectSite,
    createSite,
    updateSite: updateSiteFunc,
    deleteSite: deleteSiteFunc,
    droneProfiles,
    loadDroneProfiles,
    createDroneProfile,
    updateDroneProfile: updateDroneProfileFunc,
    deleteDroneProfile: deleteDroneProfileFunc,
    cuasProfiles,
    loadCUASProfiles,
    createCUASProfile,
    updateCUASProfile: updateCUASProfileFunc,
    deleteCUASProfile: deleteCUASProfileFunc,
    testSessions,
    activeSession,
    loadTestSessions,
    selectSession,
    createTestSession,
    updateTestSession: updateTestSessionFunc,
    deleteTestSession: deleteTestSessionFunc,
    startSession,
    stopSession,
    addEvent,
    assignTracker,
    addCUASPlacement,
    isDrawingMode,
    setIsDrawingMode,
    drawingType,
    setDrawingType,
    pendingDrawingResult,
    setPendingDrawingResult,
    siteReconCaptures,
    loadSiteRecon,
    saveSiteReconImage,
    deleteSiteRecon,
    isLoading,
    error,
    lastExportSummary,
    clearExportSummary,
  };

  return (
    <WorkflowContext.Provider value={value}>
      {children}
    </WorkflowContext.Provider>
  );
}

export function useWorkflow() {
  const context = useContext(WorkflowContext);
  if (!context) {
    throw new Error('useWorkflow must be used within a WorkflowProvider');
  }
  return context;
}
