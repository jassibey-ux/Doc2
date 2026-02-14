/**
 * CRM Context
 * Manages CRM state: tagging, annotations, search, and dashboard analytics
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import { TestSession } from '../types/workflow';
import {
  DashboardStats,
  SessionSearchFilters,
  TagWithCount,
  SessionAnnotation,
  AnnotationType,
} from '../types/crm';

interface CRMContextType {
  // Dashboard
  dashboardStats: DashboardStats | null;
  dashboardLoading: boolean;
  loadDashboardStats: () => Promise<void>;

  // Search
  searchFilters: SessionSearchFilters;
  setSearchFilters: (filters: SessionSearchFilters) => void;
  searchResults: TestSession[];
  isSearching: boolean;
  searchSessions: (filters?: SessionSearchFilters) => Promise<void>;

  // Tags
  allTags: TagWithCount[];
  tagsLoading: boolean;
  loadAllTags: () => Promise<void>;
  addTag: (sessionId: string, tag: string) => Promise<string[] | null>;
  removeTag: (sessionId: string, tag: string) => Promise<string[] | null>;
  getSessionTags: (sessionId: string) => Promise<string[]>;

  // Annotations
  addAnnotation: (
    sessionId: string,
    content: string,
    type?: AnnotationType,
    author?: string,
    timestampRef?: string
  ) => Promise<SessionAnnotation | null>;
  updateAnnotation: (
    sessionId: string,
    annotationId: string,
    content: string
  ) => Promise<SessionAnnotation | null>;
  removeAnnotation: (sessionId: string, annotationId: string) => Promise<boolean>;
  getSessionAnnotations: (sessionId: string, type?: AnnotationType) => Promise<SessionAnnotation[]>;

  // Entity History
  loadEntitySessions: (
    entityType: 'drone-profiles' | 'cuas-profiles' | 'sites',
    entityId: string
  ) => Promise<TestSession[]>;

  // Error state
  error: string | null;
  clearError: () => void;
}

const CRMContext = createContext<CRMContextType | null>(null);

const API_BASE = '/api/v2';

export function CRMProvider({ children }: { children: React.ReactNode }) {
  // Dashboard state
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  // Search state
  const [searchFilters, setSearchFiltersState] = useState<SessionSearchFilters>({});
  const [searchResults, setSearchResults] = useState<TestSession[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Tags state
  const [allTags, setAllTags] = useState<TagWithCount[]>([]);
  const [tagsLoading, setTagsLoading] = useState(false);

  // Error state
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // ==========================================================================
  // Dashboard
  // ==========================================================================

  const loadDashboardStats = useCallback(async () => {
    try {
      setDashboardLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE}/dashboard`);
      if (!res.ok) throw new Error('Failed to load dashboard stats');
      const data = await res.json();
      setDashboardStats(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  // ==========================================================================
  // Search
  // ==========================================================================

  const setSearchFilters = useCallback((filters: SessionSearchFilters) => {
    setSearchFiltersState(filters);
  }, []);

  const searchSessions = useCallback(async (filters?: SessionSearchFilters) => {
    try {
      setIsSearching(true);
      setError(null);

      const filtersToUse = filters ?? searchFilters;
      const res = await fetch(`${API_BASE}/sessions/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filtersToUse),
      });

      if (!res.ok) throw new Error('Failed to search sessions');
      const data = await res.json();
      setSearchResults(data.sessions || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to search sessions');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [searchFilters]);

  // ==========================================================================
  // Tags
  // ==========================================================================

  const loadAllTags = useCallback(async () => {
    try {
      setTagsLoading(true);
      const res = await fetch(`${API_BASE}/tags`);
      if (!res.ok) throw new Error('Failed to load tags');
      const data = await res.json();
      setAllTags(data.tags || []);
    } catch (err: unknown) {
      console.error('Failed to load tags:', err);
    } finally {
      setTagsLoading(false);
    }
  }, []);

  const addTag = useCallback(async (sessionId: string, tag: string): Promise<string[] | null> => {
    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag }),
      });

      if (!res.ok) throw new Error('Failed to add tag');
      const data = await res.json();

      // Refresh all tags to update counts
      await loadAllTags();

      return data.tags;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add tag');
      return null;
    }
  }, [loadAllTags]);

  const removeTag = useCallback(async (sessionId: string, tag: string): Promise<string[] | null> => {
    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}/tags/${encodeURIComponent(tag)}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to remove tag');
      const data = await res.json();

      // Refresh all tags to update counts
      await loadAllTags();

      return data.tags;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to remove tag');
      return null;
    }
  }, [loadAllTags]);

  const getSessionTags = useCallback(async (sessionId: string): Promise<string[]> => {
    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}/tags`);
      if (!res.ok) throw new Error('Failed to get session tags');
      const data = await res.json();
      return data.tags || [];
    } catch (err: unknown) {
      console.error('Failed to get session tags:', err);
      return [];
    }
  }, []);

  // ==========================================================================
  // Annotations
  // ==========================================================================

  const addAnnotation = useCallback(async (
    sessionId: string,
    content: string,
    type: AnnotationType = 'note',
    author?: string,
    timestampRef?: string
  ): Promise<SessionAnnotation | null> => {
    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          type,
          author,
          timestamp_ref: timestampRef,
        }),
      });

      if (!res.ok) throw new Error('Failed to add annotation');
      return await res.json();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add annotation');
      return null;
    }
  }, []);

  const updateAnnotation = useCallback(async (
    sessionId: string,
    annotationId: string,
    content: string
  ): Promise<SessionAnnotation | null> => {
    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}/annotations/${annotationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (!res.ok) throw new Error('Failed to update annotation');
      return await res.json();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update annotation');
      return null;
    }
  }, []);

  const removeAnnotation = useCallback(async (
    sessionId: string,
    annotationId: string
  ): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/sessions/${sessionId}/annotations/${annotationId}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to remove annotation');
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to remove annotation');
      return false;
    }
  }, []);

  const getSessionAnnotations = useCallback(async (
    sessionId: string,
    type?: AnnotationType
  ): Promise<SessionAnnotation[]> => {
    try {
      const url = type
        ? `${API_BASE}/sessions/${sessionId}/annotations?type=${type}`
        : `${API_BASE}/sessions/${sessionId}/annotations`;

      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to get annotations');
      const data = await res.json();
      return data.annotations || [];
    } catch (err: unknown) {
      console.error('Failed to get annotations:', err);
      return [];
    }
  }, []);

  // ==========================================================================
  // Entity History
  // ==========================================================================

  const loadEntitySessions = useCallback(async (
    entityType: 'drone-profiles' | 'cuas-profiles' | 'sites',
    entityId: string
  ): Promise<TestSession[]> => {
    try {
      const res = await fetch(`${API_BASE}/${entityType}/${entityId}/sessions`);
      if (!res.ok) throw new Error('Failed to load entity sessions');
      return await res.json();
    } catch (err: unknown) {
      console.error('Failed to load entity sessions:', err);
      return [];
    }
  }, []);

  // ==========================================================================
  // Context Value
  // ==========================================================================

  const value: CRMContextType = {
    // Dashboard
    dashboardStats,
    dashboardLoading,
    loadDashboardStats,

    // Search
    searchFilters,
    setSearchFilters,
    searchResults,
    isSearching,
    searchSessions,

    // Tags
    allTags,
    tagsLoading,
    loadAllTags,
    addTag,
    removeTag,
    getSessionTags,

    // Annotations
    addAnnotation,
    updateAnnotation,
    removeAnnotation,
    getSessionAnnotations,

    // Entity History
    loadEntitySessions,

    // Error
    error,
    clearError,
  };

  return <CRMContext.Provider value={value}>{children}</CRMContext.Provider>;
}

export function useCRM(): CRMContextType {
  const context = useContext(CRMContext);
  if (!context) {
    throw new Error('useCRM must be used within a CRMProvider');
  }
  return context;
}
