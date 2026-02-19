/**
 * Library Storage Service
 * Handles persistent JSON storage for Sites, Drone Profiles, CUAS Profiles, and Test Sessions
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import log from 'electron-log';
import {
  SiteDefinition,
  DroneProfile,
  CUASProfile,
  TestSession,
  TestTemplate,
  SessionAnnotation,
  AnnotationType,
  TrackerAlias,
} from './models/workflow';
import {
  SEED_SITES,
  SEED_DRONE_PROFILES,
  SEED_CUAS_PROFILES,
  needsSeedData,
} from './seed-data';

// Generate unique IDs
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Get the library storage directory
function getLibraryPath(): string {
  const userDataPath = app?.getPath?.('userData') || process.env.HOME || '.';
  const libraryPath = path.join(userDataPath, 'libraries');

  // Ensure directory exists
  if (!fs.existsSync(libraryPath)) {
    fs.mkdirSync(libraryPath, { recursive: true });
    log.info(`Created library directory: ${libraryPath}`);
  }

  return libraryPath;
}

// In-memory cache: keyed by filename → array of items
// Single-process Electron app, so cache IS the source of truth once loaded.
// Eliminates read-modify-write race conditions.
const cache = new Map<string, unknown[]>();

// Generic JSON file operations (with in-memory cache)
function readJsonFile<T>(filename: string, defaultValue: T[]): T[] {
  // Check cache first
  const cached = cache.get(filename);
  if (cached !== undefined) {
    return cached as T[];
  }

  // Cache miss — load from disk
  const filePath = path.join(getLibraryPath(), filename);
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(data) as T[];
      cache.set(filename, parsed);
      return parsed;
    }
  } catch (error) {
    log.error(`Error reading ${filename}:`, error);
  }
  cache.set(filename, defaultValue);
  return defaultValue;
}

function writeJsonFile<T>(filename: string, data: T[]): void {
  const filePath = path.join(getLibraryPath(), filename);
  const tempPath = `${filePath}.tmp`;

  // Update cache immediately (source of truth)
  cache.set(filename, data);

  try {
    // Write to temp file first for atomic operation
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempPath, filePath);
    log.info(`Saved ${filename} (${data.length} items)`);
  } catch (error) {
    log.error(`Error writing ${filename}:`, error);
    // Clean up temp file if it exists
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
    throw error;
  }
}

// =============================================================================
// Seed Data Initialization
// =============================================================================

let seedDataInitialized = false;

/**
 * Initialize seed data on first run if libraries are empty
 */
function initializeSeedDataIfNeeded(): void {
  if (seedDataInitialized) return;
  seedDataInitialized = true;

  const sitesCount = readJsonFile<SiteDefinition>(SITES_FILE, []).length;
  const droneProfilesCount = readJsonFile<DroneProfile>(DRONE_PROFILES_FILE, []).length;
  const cuasProfilesCount = readJsonFile<CUASProfile>(CUAS_PROFILES_FILE, []).length;

  if (needsSeedData(sitesCount, droneProfilesCount, cuasProfilesCount)) {
    log.info('First run detected - initializing seed data...');

    // Seed sites if empty
    if (sitesCount === 0) {
      const now = new Date().toISOString();
      const seededSites: SiteDefinition[] = SEED_SITES.map(site => ({
        ...site,
        created_at: now,
        updated_at: now,
      }));
      writeJsonFile(SITES_FILE, seededSites);
      log.info(`Seeded ${seededSites.length} demo sites`);
    }

    // Seed drone profiles if empty
    if (droneProfilesCount === 0) {
      const now = new Date().toISOString();
      const seededProfiles: DroneProfile[] = SEED_DRONE_PROFILES.map(profile => ({
        ...profile,
        created_at: now,
        updated_at: now,
      }));
      writeJsonFile(DRONE_PROFILES_FILE, seededProfiles);
      log.info(`Seeded ${seededProfiles.length} demo drone profiles`);
    }

    // Seed CUAS profiles if empty
    if (cuasProfilesCount === 0) {
      const now = new Date().toISOString();
      const seededProfiles: CUASProfile[] = SEED_CUAS_PROFILES.map(profile => ({
        ...profile,
        created_at: now,
        updated_at: now,
      }));
      writeJsonFile(CUAS_PROFILES_FILE, seededProfiles);
      log.info(`Seeded ${seededProfiles.length} demo CUAS profiles`);
    }

    log.info('Seed data initialization complete');
  }
}

// =============================================================================
// Site Library
// =============================================================================

const SITES_FILE = 'sites.json';
const DRONE_PROFILES_FILE = 'drone-profiles.json';
const CUAS_PROFILES_FILE = 'cuas-profiles.json';

export function getSites(): SiteDefinition[] {
  initializeSeedDataIfNeeded();
  return readJsonFile<SiteDefinition>(SITES_FILE, []);
}

export function getSiteById(id: string): SiteDefinition | undefined {
  return getSites().find(s => s.id === id);
}

export function createSite(site: Omit<SiteDefinition, 'id' | 'created_at' | 'updated_at'>): SiteDefinition {
  const sites = getSites();
  const now = new Date().toISOString();

  const newSite: SiteDefinition = {
    ...site,
    id: generateId(),
    created_at: now,
    updated_at: now,
  };

  sites.push(newSite);
  writeJsonFile(SITES_FILE, sites);

  return newSite;
}

export function updateSite(id: string, updates: Partial<SiteDefinition>): SiteDefinition | undefined {
  const sites = getSites();
  const index = sites.findIndex(s => s.id === id);

  if (index === -1) {
    return undefined;
  }

  sites[index] = {
    ...sites[index],
    ...updates,
    id, // Prevent ID from being changed
    updated_at: new Date().toISOString(),
  };

  writeJsonFile(SITES_FILE, sites);
  return sites[index];
}

export function deleteSite(id: string): boolean {
  const sites = getSites();
  const filtered = sites.filter(s => s.id !== id);

  if (filtered.length === sites.length) {
    return false;
  }

  writeJsonFile(SITES_FILE, filtered);
  return true;
}

export function duplicateSite(id: string, newName: string): SiteDefinition | undefined {
  const site = getSiteById(id);
  if (!site) return undefined;

  const { id: _, created_at: __, updated_at: ___, ...siteData } = site;
  return createSite({ ...siteData, name: newName });
}

// =============================================================================
// Drone Profile Library
// =============================================================================

export function getDroneProfiles(): DroneProfile[] {
  initializeSeedDataIfNeeded();
  return readJsonFile<DroneProfile>(DRONE_PROFILES_FILE, []);
}

export function getDroneProfileById(id: string): DroneProfile | undefined {
  return getDroneProfiles().find(p => p.id === id);
}

export function createDroneProfile(profile: Omit<DroneProfile, 'id' | 'created_at' | 'updated_at'>): DroneProfile {
  const profiles = getDroneProfiles();
  const now = new Date().toISOString();

  const newProfile: DroneProfile = {
    ...profile,
    id: generateId(),
    created_at: now,
    updated_at: now,
  };

  profiles.push(newProfile);
  writeJsonFile(DRONE_PROFILES_FILE, profiles);

  return newProfile;
}

export function updateDroneProfile(id: string, updates: Partial<DroneProfile>): DroneProfile | undefined {
  const profiles = getDroneProfiles();
  const index = profiles.findIndex(p => p.id === id);

  if (index === -1) {
    return undefined;
  }

  profiles[index] = {
    ...profiles[index],
    ...updates,
    id,
    updated_at: new Date().toISOString(),
  };

  writeJsonFile(DRONE_PROFILES_FILE, profiles);
  return profiles[index];
}

export function deleteDroneProfile(id: string): boolean {
  const profiles = getDroneProfiles();
  const filtered = profiles.filter(p => p.id !== id);

  if (filtered.length === profiles.length) {
    return false;
  }

  writeJsonFile(DRONE_PROFILES_FILE, filtered);
  return true;
}

// =============================================================================
// CUAS Profile Library
// =============================================================================

export function getCUASProfiles(): CUASProfile[] {
  initializeSeedDataIfNeeded();
  return readJsonFile<CUASProfile>(CUAS_PROFILES_FILE, []);
}

export function getCUASProfileById(id: string): CUASProfile | undefined {
  return getCUASProfiles().find(p => p.id === id);
}

export function createCUASProfile(profile: Omit<CUASProfile, 'id' | 'created_at' | 'updated_at'>): CUASProfile {
  const profiles = getCUASProfiles();
  const now = new Date().toISOString();

  const newProfile: CUASProfile = {
    ...profile,
    id: generateId(),
    created_at: now,
    updated_at: now,
  };

  profiles.push(newProfile);
  writeJsonFile(CUAS_PROFILES_FILE, profiles);

  return newProfile;
}

export function updateCUASProfile(id: string, updates: Partial<CUASProfile>): CUASProfile | undefined {
  const profiles = getCUASProfiles();
  const index = profiles.findIndex(p => p.id === id);

  if (index === -1) {
    return undefined;
  }

  profiles[index] = {
    ...profiles[index],
    ...updates,
    id,
    updated_at: new Date().toISOString(),
  };

  writeJsonFile(CUAS_PROFILES_FILE, profiles);
  return profiles[index];
}

export function deleteCUASProfile(id: string): boolean {
  const profiles = getCUASProfiles();
  const filtered = profiles.filter(p => p.id !== id);

  if (filtered.length === profiles.length) {
    return false;
  }

  writeJsonFile(CUAS_PROFILES_FILE, filtered);
  return true;
}

// =============================================================================
// Test Session Library
// =============================================================================

const TEST_SESSIONS_FILE = 'test-sessions.json';

export function getTestSessions(): TestSession[] {
  return readJsonFile<TestSession>(TEST_SESSIONS_FILE, []);
}

export function getTestSessionById(id: string): TestSession | undefined {
  return getTestSessions().find(s => s.id === id);
}

export function getTestSessionsBySite(siteId: string): TestSession[] {
  return getTestSessions().filter(s => s.site_id === siteId);
}

export function createTestSession(session: Omit<TestSession, 'id' | 'created_at' | 'updated_at'>): TestSession {
  const sessions = getTestSessions();
  const now = new Date().toISOString();

  const newSession: TestSession = {
    ...session,
    id: generateId(),
    created_at: now,
    updated_at: now,
  };

  sessions.push(newSession);
  writeJsonFile(TEST_SESSIONS_FILE, sessions);

  return newSession;
}

export function updateTestSession(id: string, updates: Partial<TestSession>): TestSession | undefined {
  const sessions = getTestSessions();
  const index = sessions.findIndex(s => s.id === id);

  if (index === -1) {
    return undefined;
  }

  sessions[index] = {
    ...sessions[index],
    ...updates,
    id,
    updated_at: new Date().toISOString(),
  };

  writeJsonFile(TEST_SESSIONS_FILE, sessions);
  return sessions[index];
}

export function deleteTestSession(id: string): boolean {
  const sessions = getTestSessions();
  const filtered = sessions.filter(s => s.id !== id);

  if (filtered.length === sessions.length) {
    return false;
  }

  writeJsonFile(TEST_SESSIONS_FILE, filtered);
  return true;
}

export function addEventToSession(sessionId: string, event: Omit<TestSession['events'][0], 'id'>): TestSession | undefined {
  const session = getTestSessionById(sessionId);
  if (!session) return undefined;

  const newEvent = {
    ...event,
    id: generateId(),
  };

  return updateTestSession(sessionId, {
    events: [...session.events, newEvent],
  });
}

export function removeEventFromSession(sessionId: string, eventId: string): TestSession | undefined {
  const session = getTestSessionById(sessionId);
  if (!session) return undefined;

  return updateTestSession(sessionId, {
    events: session.events.filter(e => e.id !== eventId),
  });
}

// =============================================================================
// Test Template Library
// =============================================================================

const TEST_TEMPLATES_FILE = 'test-templates.json';

export function getTestTemplates(): TestTemplate[] {
  return readJsonFile<TestTemplate>(TEST_TEMPLATES_FILE, []);
}

export function getTestTemplateById(id: string): TestTemplate | undefined {
  return getTestTemplates().find(t => t.id === id);
}

export function createTestTemplate(template: Omit<TestTemplate, 'id' | 'created_at' | 'updated_at'>): TestTemplate {
  const templates = getTestTemplates();
  const now = new Date().toISOString();

  const newTemplate: TestTemplate = {
    ...template,
    id: generateId(),
    created_at: now,
    updated_at: now,
  };

  templates.push(newTemplate);
  writeJsonFile(TEST_TEMPLATES_FILE, templates);

  return newTemplate;
}

export function updateTestTemplate(id: string, updates: Partial<TestTemplate>): TestTemplate | undefined {
  const templates = getTestTemplates();
  const index = templates.findIndex(t => t.id === id);

  if (index === -1) {
    return undefined;
  }

  templates[index] = {
    ...templates[index],
    ...updates,
    id,
    updated_at: new Date().toISOString(),
  };

  writeJsonFile(TEST_TEMPLATES_FILE, templates);
  return templates[index];
}

export function deleteTestTemplate(id: string): boolean {
  const templates = getTestTemplates();
  const filtered = templates.filter(t => t.id !== id);

  if (filtered.length === templates.length) {
    return false;
  }

  writeJsonFile(TEST_TEMPLATES_FILE, filtered);
  return true;
}

// =============================================================================
// Utility Functions
// =============================================================================

export function getLibraryStats(): {
  sites: number;
  droneProfiles: number;
  cuasProfiles: number;
  testSessions: number;
  testTemplates: number;
} {
  return {
    sites: getSites().length,
    droneProfiles: getDroneProfiles().length,
    cuasProfiles: getCUASProfiles().length,
    testSessions: getTestSessions().length,
    testTemplates: getTestTemplates().length,
  };
}

export function exportLibraries(): {
  sites: SiteDefinition[];
  droneProfiles: DroneProfile[];
  cuasProfiles: CUASProfile[];
  testSessions: TestSession[];
  testTemplates: TestTemplate[];
} {
  return {
    sites: getSites(),
    droneProfiles: getDroneProfiles(),
    cuasProfiles: getCUASProfiles(),
    testSessions: getTestSessions(),
    testTemplates: getTestTemplates(),
  };
}

export function importLibraries(data: {
  sites?: SiteDefinition[];
  droneProfiles?: DroneProfile[];
  cuasProfiles?: CUASProfile[];
  testTemplates?: TestTemplate[];
}): void {
  if (data.sites) {
    writeJsonFile(SITES_FILE, data.sites);
  }
  if (data.droneProfiles) {
    writeJsonFile(DRONE_PROFILES_FILE, data.droneProfiles);
  }
  if (data.cuasProfiles) {
    writeJsonFile(CUAS_PROFILES_FILE, data.cuasProfiles);
  }
  if (data.testTemplates) {
    writeJsonFile(TEST_TEMPLATES_FILE, data.testTemplates);
  }
}

// =============================================================================
// CRM: Tagging System
// =============================================================================

export function addTagToSession(sessionId: string, tag: string): TestSession | undefined {
  const session = getTestSessionById(sessionId);
  if (!session) return undefined;

  const normalizedTag = tag.trim().toLowerCase();
  if (!normalizedTag) return session;

  const currentTags = session.tags || [];
  if (currentTags.includes(normalizedTag)) return session;

  return updateTestSession(sessionId, {
    tags: [...currentTags, normalizedTag],
  });
}

export function removeTagFromSession(sessionId: string, tag: string): TestSession | undefined {
  const session = getTestSessionById(sessionId);
  if (!session) return undefined;

  const normalizedTag = tag.trim().toLowerCase();
  const currentTags = session.tags || [];

  return updateTestSession(sessionId, {
    tags: currentTags.filter(t => t !== normalizedTag),
  });
}

export function getSessionTags(sessionId: string): string[] {
  const session = getTestSessionById(sessionId);
  return session?.tags || [];
}

export function getAllTags(): { tag: string; count: number }[] {
  const sessions = getTestSessions();
  const tagCounts = new Map<string, number>();

  for (const session of sessions) {
    for (const tag of session.tags || []) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }

  return Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

export function getSessionsByTag(tag: string): TestSession[] {
  const normalizedTag = tag.trim().toLowerCase();
  return getTestSessions().filter(s => s.tags?.includes(normalizedTag));
}

// =============================================================================
// CRM: Annotation System
// =============================================================================

export function addAnnotationToSession(
  sessionId: string,
  content: string,
  type: AnnotationType = 'note',
  author?: string,
  timestampRef?: string,
): TestSession | undefined {
  const session = getTestSessionById(sessionId);
  if (!session) return undefined;

  const now = new Date().toISOString();
  const annotation: SessionAnnotation = {
    id: generateId(),
    content,
    type,
    author,
    timestamp_ref: timestampRef,
    created_at: now,
    updated_at: now,
  };

  const currentAnnotations = session.annotations || [];
  return updateTestSession(sessionId, {
    annotations: [...currentAnnotations, annotation],
  });
}

export function updateAnnotation(
  sessionId: string,
  annotationId: string,
  content: string,
): TestSession | undefined {
  const session = getTestSessionById(sessionId);
  if (!session) return undefined;

  const annotations = session.annotations || [];
  const index = annotations.findIndex(a => a.id === annotationId);
  if (index === -1) return undefined;

  const updatedAnnotations = [...annotations];
  updatedAnnotations[index] = {
    ...updatedAnnotations[index],
    content,
    updated_at: new Date().toISOString(),
  };

  return updateTestSession(sessionId, { annotations: updatedAnnotations });
}

export function removeAnnotationFromSession(
  sessionId: string,
  annotationId: string,
): TestSession | undefined {
  const session = getTestSessionById(sessionId);
  if (!session) return undefined;

  const annotations = session.annotations || [];
  return updateTestSession(sessionId, {
    annotations: annotations.filter(a => a.id !== annotationId),
  });
}

export function getSessionAnnotations(
  sessionId: string,
  type?: AnnotationType,
): SessionAnnotation[] {
  const session = getTestSessionById(sessionId);
  if (!session) return [];

  const annotations = session.annotations || [];
  if (type) {
    return annotations.filter(a => a.type === type);
  }
  return annotations;
}

// =============================================================================
// CRM: Search and Filter
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

export function searchSessions(filters: SessionSearchFilters): TestSession[] {
  let sessions = getTestSessions();

  // Text search across name, notes, operator
  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    sessions = sessions.filter(s =>
      s.name.toLowerCase().includes(searchLower) ||
      s.operator_name?.toLowerCase().includes(searchLower) ||
      s.weather_notes?.toLowerCase().includes(searchLower) ||
      s.post_test_notes?.toLowerCase().includes(searchLower)
    );
  }

  // Status filter
  if (filters.status && filters.status.length > 0) {
    sessions = sessions.filter(s => filters.status!.includes(s.status));
  }

  // Site filter
  if (filters.siteId) {
    sessions = sessions.filter(s => s.site_id === filters.siteId);
  }

  // Tags filter (all tags must match)
  if (filters.tags && filters.tags.length > 0) {
    sessions = sessions.filter(s => {
      const sessionTags = s.tags || [];
      return filters.tags!.every(t => sessionTags.includes(t.toLowerCase()));
    });
  }

  // Pass/Fail filter
  if (filters.passFail) {
    sessions = sessions.filter(s => s.metrics?.pass_fail === filters.passFail);
  }

  // Drone profile filter
  if (filters.droneProfileId) {
    sessions = sessions.filter(s =>
      s.tracker_assignments.some(a => a.drone_profile_id === filters.droneProfileId)
    );
  }

  // CUAS profile filter
  if (filters.cuasProfileId) {
    sessions = sessions.filter(s =>
      s.cuas_placements.some(p => p.cuas_profile_id === filters.cuasProfileId)
    );
  }

  // Date range filter
  if (filters.startDate) {
    const startMs = new Date(filters.startDate).getTime();
    sessions = sessions.filter(s => {
      const sessionStart = s.start_time ? new Date(s.start_time).getTime() : 0;
      return sessionStart >= startMs;
    });
  }

  if (filters.endDate) {
    const endMs = new Date(filters.endDate).getTime();
    sessions = sessions.filter(s => {
      const sessionStart = s.start_time ? new Date(s.start_time).getTime() : Infinity;
      return sessionStart <= endMs;
    });
  }

  // Operator filter
  if (filters.operatorName) {
    const opLower = filters.operatorName.toLowerCase();
    sessions = sessions.filter(s =>
      s.operator_name?.toLowerCase().includes(opLower)
    );
  }

  // Sort by created_at descending
  sessions.sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return sessions;
}

// =============================================================================
// CRM: Dashboard Analytics
// =============================================================================

export interface DashboardStats {
  totalSessions: number;
  sessionsByStatus: Record<string, number>;
  sessionsByPassFail: Record<string, number>;
  recentSessions: TestSession[];
  topTags: { tag: string; count: number }[];
  sessionsBySite: { siteId: string; siteName: string; count: number }[];
  sessionsThisMonth: number;
  avgSessionDuration: number | null;
}

export function getDashboardStats(): DashboardStats {
  const sessions = getTestSessions();
  const sites = getSites();

  // Sessions by status
  const sessionsByStatus: Record<string, number> = {};
  for (const session of sessions) {
    sessionsByStatus[session.status] = (sessionsByStatus[session.status] || 0) + 1;
  }

  // Sessions by pass/fail
  const sessionsByPassFail: Record<string, number> = { pass: 0, fail: 0, partial: 0, pending: 0 };
  for (const session of sessions) {
    const result = session.metrics?.pass_fail || 'pending';
    sessionsByPassFail[result] = (sessionsByPassFail[result] || 0) + 1;
  }

  // Recent sessions (last 5)
  const recentSessions = [...sessions]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  // Top tags
  const topTags = getAllTags().slice(0, 10);

  // Sessions by site
  const siteCounts = new Map<string, number>();
  for (const session of sessions) {
    if (session.site_id) {
      siteCounts.set(session.site_id, (siteCounts.get(session.site_id) || 0) + 1);
    }
  }
  const sessionsBySite = Array.from(siteCounts.entries())
    .map(([siteId, count]) => {
      const site = sites.find(s => s.id === siteId);
      return { siteId, siteName: site?.name || 'Unknown', count };
    })
    .sort((a, b) => b.count - a.count);

  // Sessions this month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const sessionsThisMonth = sessions.filter(s =>
    new Date(s.created_at) >= startOfMonth
  ).length;

  // Average duration
  const durationsWithData = sessions
    .filter(s => s.duration_seconds && s.duration_seconds > 0)
    .map(s => s.duration_seconds!);
  const avgSessionDuration = durationsWithData.length > 0
    ? durationsWithData.reduce((a, b) => a + b, 0) / durationsWithData.length
    : null;

  return {
    totalSessions: sessions.length,
    sessionsByStatus,
    sessionsByPassFail,
    recentSessions,
    topTags,
    sessionsBySite,
    sessionsThisMonth,
    avgSessionDuration,
  };
}

// =============================================================================
// CRM: Entity History (Sessions by Drone/CUAS)
// =============================================================================

export function getSessionsByDroneProfile(droneProfileId: string): TestSession[] {
  return getTestSessions().filter(s =>
    s.tracker_assignments.some(a => a.drone_profile_id === droneProfileId)
  );
}

export function getSessionsByCUASProfile(cuasProfileId: string): TestSession[] {
  return getTestSessions().filter(s =>
    s.cuas_placements.some(p => p.cuas_profile_id === cuasProfileId)
  );
}

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

export function getDroneProfileStats(droneProfileId: string): DroneProfileStats {
  const sessions = getSessionsByDroneProfile(droneProfileId);

  const passCount = sessions.filter(s => s.metrics?.pass_fail === 'pass').length;
  const failCount = sessions.filter(s => s.metrics?.pass_fail === 'fail').length;
  const totalWithResult = passCount + failCount;

  const timesToEffect = sessions
    .filter(s => s.metrics?.time_to_effect_s != null)
    .map(s => s.metrics!.time_to_effect_s!);

  const dates = sessions
    .filter(s => s.start_time)
    .map(s => new Date(s.start_time!).getTime())
    .sort((a, b) => a - b);

  return {
    profileId: droneProfileId,
    totalTests: sessions.length,
    passCount,
    failCount,
    successRate: totalWithResult > 0 ? (passCount / totalWithResult) * 100 : null,
    avgTimeToEffect: timesToEffect.length > 0
      ? timesToEffect.reduce((a, b) => a + b, 0) / timesToEffect.length
      : null,
    firstTestDate: dates.length > 0 ? new Date(dates[0]).toISOString() : null,
    lastTestDate: dates.length > 0 ? new Date(dates[dates.length - 1]).toISOString() : null,
  };
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

export function getCUASProfileStats(cuasProfileId: string): CUASProfileStats {
  const sessions = getSessionsByCUASProfile(cuasProfileId);

  const passCount = sessions.filter(s => s.metrics?.pass_fail === 'pass').length;
  const failCount = sessions.filter(s => s.metrics?.pass_fail === 'fail').length;
  const totalWithResult = passCount + failCount;

  const timesToEffect = sessions
    .filter(s => s.metrics?.time_to_effect_s != null)
    .map(s => s.metrics!.time_to_effect_s!);

  const effectiveRanges = sessions
    .filter(s => s.metrics?.effective_range_m != null)
    .map(s => s.metrics!.effective_range_m!);

  const dates = sessions
    .filter(s => s.start_time)
    .map(s => new Date(s.start_time!).getTime())
    .sort((a, b) => a - b);

  return {
    profileId: cuasProfileId,
    totalTests: sessions.length,
    passCount,
    failCount,
    successRate: totalWithResult > 0 ? (passCount / totalWithResult) * 100 : null,
    avgTimeToEffect: timesToEffect.length > 0
      ? timesToEffect.reduce((a, b) => a + b, 0) / timesToEffect.length
      : null,
    avgEffectiveRange: effectiveRanges.length > 0
      ? effectiveRanges.reduce((a, b) => a + b, 0) / effectiveRanges.length
      : null,
    firstTestDate: dates.length > 0 ? new Date(dates[0]).toISOString() : null,
    lastTestDate: dates.length > 0 ? new Date(dates[dates.length - 1]).toISOString() : null,
  };
}

// =============================================================================
// Tracker Alias Library (Global persistent naming for tracker IDs)
// =============================================================================

const TRACKER_ALIASES_FILE = 'tracker-aliases.json';

export function getTrackerAliases(): TrackerAlias[] {
  return readJsonFile<TrackerAlias>(TRACKER_ALIASES_FILE, []);
}

export function getTrackerAliasById(id: string): TrackerAlias | undefined {
  return getTrackerAliases().find(a => a.id === id);
}

export function getTrackerAliasByTrackerId(trackerId: string): TrackerAlias | undefined {
  return getTrackerAliases().find(a => a.tracker_id === trackerId);
}

export function createTrackerAlias(alias: Omit<TrackerAlias, 'id' | 'created_at' | 'updated_at'>): TrackerAlias {
  const aliases = getTrackerAliases();
  const now = new Date().toISOString();

  // Check if alias already exists for this tracker_id
  const existing = aliases.find(a => a.tracker_id === alias.tracker_id);
  if (existing) {
    throw new Error(`Alias already exists for tracker ${alias.tracker_id}`);
  }

  const newAlias: TrackerAlias = {
    ...alias,
    id: generateId(),
    created_at: now,
    updated_at: now,
  };

  aliases.push(newAlias);
  writeJsonFile(TRACKER_ALIASES_FILE, aliases);

  log.info(`Created tracker alias: ${alias.alias} for tracker ${alias.tracker_id}`);
  return newAlias;
}

export function updateTrackerAlias(id: string, updates: Partial<TrackerAlias>): TrackerAlias | undefined {
  const aliases = getTrackerAliases();
  const index = aliases.findIndex(a => a.id === id);

  if (index === -1) {
    return undefined;
  }

  // If updating tracker_id, check for conflicts
  if (updates.tracker_id && updates.tracker_id !== aliases[index].tracker_id) {
    const conflict = aliases.find(a => a.tracker_id === updates.tracker_id && a.id !== id);
    if (conflict) {
      throw new Error(`Alias already exists for tracker ${updates.tracker_id}`);
    }
  }

  aliases[index] = {
    ...aliases[index],
    ...updates,
    id, // Prevent ID from being changed
    updated_at: new Date().toISOString(),
  };

  writeJsonFile(TRACKER_ALIASES_FILE, aliases);
  log.info(`Updated tracker alias: ${aliases[index].alias} for tracker ${aliases[index].tracker_id}`);
  return aliases[index];
}

export function deleteTrackerAlias(id: string): boolean {
  const aliases = getTrackerAliases();
  const filtered = aliases.filter(a => a.id !== id);

  if (filtered.length === aliases.length) {
    return false;
  }

  writeJsonFile(TRACKER_ALIASES_FILE, filtered);
  log.info(`Deleted tracker alias with id: ${id}`);
  return true;
}

/**
 * Get display name for a tracker - returns alias if set, otherwise tracker_id
 */
export function getTrackerDisplayName(trackerId: string): string {
  const alias = getTrackerAliasByTrackerId(trackerId);
  return alias?.alias ?? trackerId;
}
