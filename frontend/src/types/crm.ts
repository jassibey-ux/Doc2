/**
 * CRM Types for SCENSUS Counter-UAS Platform
 * Defines types for tagging, annotations, search, and dashboard analytics
 */

import { TestSession } from './workflow';

// =============================================================================
// Annotation Types
// =============================================================================

export type AnnotationType = 'note' | 'observation' | 'issue' | 'recommendation';

export interface SessionAnnotation {
  id: string;
  content: string;
  type: AnnotationType;
  timestamp_ref?: string;  // Optional reference to point in session timeline
  author?: string;
  created_at: string;
  updated_at: string;
}

export interface NewAnnotation {
  content: string;
  type: AnnotationType;
  author?: string;
  timestamp_ref?: string;
}

// =============================================================================
// Tag Types
// =============================================================================

export interface TagWithCount {
  tag: string;
  count: number;
}

// =============================================================================
// Search Filters
// =============================================================================

export interface SessionSearchFilters {
  search?: string;
  status?: string[];
  siteId?: string;
  tags?: string[];
  passFail?: string;
  droneProfileId?: string;
  cuasProfileId?: string;
  startDate?: string;
  endDate?: string;
  operatorName?: string;
}

// =============================================================================
// Dashboard Statistics
// =============================================================================

export interface DashboardStats {
  totalSessions: number;
  sessionsByStatus: Record<string, number>;
  sessionsByPassFail: Record<string, number>;
  recentSessions: TestSession[];
  topTags: TagWithCount[];
  sessionsBySite: Array<{ siteId: string; siteName: string; count: number }>;
  sessionsThisMonth: number;
  avgSessionDuration: number | null;
}

// =============================================================================
// Entity Statistics (for Drone/CUAS/Site history)
// =============================================================================

export interface DroneProfileStats {
  profileId: string;
  totalTests: number;
  passCount: number;
  failCount: number;
  successRate: number | null;
  avgTimeToEffect: number | null;
  firstTestDate: string | null;
  lastTestDate: string | null;
}

export interface CUASProfileStats {
  profileId: string;
  totalTests: number;
  passCount: number;
  failCount: number;
  successRate: number | null;
  avgTimeToEffect: number | null;
  avgEffectiveRange: number | null;
  firstTestDate: string | null;
  lastTestDate: string | null;
}

// =============================================================================
// Search Results
// =============================================================================

export interface SearchResults {
  sessions: TestSession[];
  total: number;
  filters?: SessionSearchFilters;
}

// =============================================================================
// Annotation Colors (for UI)
// =============================================================================

export const ANNOTATION_TYPE_COLORS: Record<AnnotationType, string> = {
  note: '#6b7280',        // gray
  observation: '#3b82f6', // blue
  issue: '#ef4444',       // red
  recommendation: '#22c55e', // green
};

export const ANNOTATION_TYPE_LABELS: Record<AnnotationType, string> = {
  note: 'Note',
  observation: 'Observation',
  issue: 'Issue',
  recommendation: 'Recommendation',
};
