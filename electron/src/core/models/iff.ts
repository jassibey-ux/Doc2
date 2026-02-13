/**
 * IFF (Identification Friend or Foe) types and persistent registry.
 * Used in Ops Mode to classify tracked UAS as friendly, hostile, unknown, or neutral.
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import log from 'electron-log';

// =============================================================================
// IFF Enums & Types
// =============================================================================

export enum IFFCategory {
  BLUE = 'BLUE',       // Friendly / known blue force
  RED = 'RED',         // Hostile / threat
  YELLOW = 'YELLOW',   // Unknown / unidentified
  GRAY = 'GRAY',       // Neutral / non-participant
}

export interface UASRegistryEntry {
  id: string;
  tracker_id: string;
  iff_category: IFFCategory;
  drone_type: string;
  callsign: string;
  notes: string;
  icon?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Classification result from the deconfliction engine
 */
export interface IFFClassification {
  tracker_id: string;
  iff_category: IFFCategory;
  confidence: number;          // 0.0 - 1.0
  matched_entry_id: string | null;
  reason: string;
}

/**
 * Detection event from external sources (CoT, sensors, manual)
 */
export interface Detection {
  id: string;
  tracker_id: string | null;
  lat: number;
  lon: number;
  alt_m: number | null;
  speed_mps: number | null;
  course_deg: number | null;
  timestamp: string;
  source: 'cot' | 'sensor' | 'manual' | 'tracker';
  iff_category: IFFCategory;
  classification: IFFClassification | null;
  raw_type?: string;           // Original CoT type or sensor classification
  notes?: string;
  created_at: string;
}

// =============================================================================
// IFF Registry - Persistent JSON Store
// =============================================================================

const IFF_REGISTRY_FILE = 'iff-registry.json';

function generateId(): string {
  return `iff-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function getRegistryDir(): string {
  const userDataPath = app?.getPath?.('userData') || process.env.HOME || '.';
  const registryDir = path.join(userDataPath, 'ops');

  if (!fs.existsSync(registryDir)) {
    fs.mkdirSync(registryDir, { recursive: true });
    log.info(`Created ops directory: ${registryDir}`);
  }

  return registryDir;
}

function getRegistryPath(): string {
  return path.join(getRegistryDir(), IFF_REGISTRY_FILE);
}

function readRegistry(): UASRegistryEntry[] {
  const filePath = getRegistryPath();
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data) as UASRegistryEntry[];
    }
  } catch (error) {
    log.error('Error reading IFF registry:', error);
  }
  return [];
}

function writeRegistry(entries: UASRegistryEntry[]): void {
  const filePath = getRegistryPath();
  const tempPath = `${filePath}.tmp`;

  try {
    fs.writeFileSync(tempPath, JSON.stringify(entries, null, 2), 'utf-8');
    fs.renameSync(tempPath, filePath);
    log.info(`Saved IFF registry (${entries.length} entries)`);
  } catch (error) {
    log.error('Error writing IFF registry:', error);
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
    throw error;
  }
}

// =============================================================================
// IFFRegistry Class
// =============================================================================

export class IFFRegistry {
  private entries: UASRegistryEntry[] = [];
  private loaded = false;

  /**
   * Ensure registry is loaded from disk
   */
  private ensureLoaded(): void {
    if (!this.loaded) {
      this.entries = readRegistry();
      this.loaded = true;
      log.info(`IFF registry loaded: ${this.entries.length} entries`);
    }
  }

  /**
   * Reload registry from disk (useful if external changes occurred)
   */
  reload(): void {
    this.entries = readRegistry();
    this.loaded = true;
  }

  /**
   * Get all registry entries
   */
  getAll(): UASRegistryEntry[] {
    this.ensureLoaded();
    return [...this.entries];
  }

  /**
   * Get a single entry by its ID
   */
  getById(id: string): UASRegistryEntry | undefined {
    this.ensureLoaded();
    return this.entries.find(e => e.id === id);
  }

  /**
   * Get entry by tracker_id. Returns the first match.
   */
  getByTrackerId(trackerId: string): UASRegistryEntry | undefined {
    this.ensureLoaded();
    return this.entries.find(e => e.tracker_id === trackerId);
  }

  /**
   * Get all entries matching a given IFF category
   */
  getByCategory(category: IFFCategory): UASRegistryEntry[] {
    this.ensureLoaded();
    return this.entries.filter(e => e.iff_category === category);
  }

  /**
   * Add a new entry to the registry
   */
  add(data: Omit<UASRegistryEntry, 'id' | 'created_at' | 'updated_at'>): UASRegistryEntry {
    this.ensureLoaded();

    // Check for duplicate tracker_id
    const existing = this.entries.find(e => e.tracker_id === data.tracker_id);
    if (existing) {
      throw new Error(`Registry entry already exists for tracker_id: ${data.tracker_id}`);
    }

    const now = new Date().toISOString();
    const entry: UASRegistryEntry = {
      ...data,
      id: generateId(),
      created_at: now,
      updated_at: now,
    };

    this.entries.push(entry);
    writeRegistry(this.entries);

    log.info(`IFF registry: added ${entry.callsign} (${entry.tracker_id}) as ${entry.iff_category}`);
    return entry;
  }

  /**
   * Update an existing entry
   */
  update(id: string, updates: Partial<Omit<UASRegistryEntry, 'id' | 'created_at'>>): UASRegistryEntry | undefined {
    this.ensureLoaded();

    const index = this.entries.findIndex(e => e.id === id);
    if (index === -1) {
      return undefined;
    }

    // If updating tracker_id, check for conflicts
    if (updates.tracker_id && updates.tracker_id !== this.entries[index].tracker_id) {
      const conflict = this.entries.find(e => e.tracker_id === updates.tracker_id && e.id !== id);
      if (conflict) {
        throw new Error(`Registry entry already exists for tracker_id: ${updates.tracker_id}`);
      }
    }

    this.entries[index] = {
      ...this.entries[index],
      ...updates,
      id, // prevent ID change
      created_at: this.entries[index].created_at, // prevent created_at change
      updated_at: new Date().toISOString(),
    };

    writeRegistry(this.entries);

    log.info(`IFF registry: updated ${this.entries[index].callsign} (${this.entries[index].tracker_id})`);
    return this.entries[index];
  }

  /**
   * Remove an entry by ID
   */
  remove(id: string): boolean {
    this.ensureLoaded();

    const before = this.entries.length;
    this.entries = this.entries.filter(e => e.id !== id);

    if (this.entries.length === before) {
      return false;
    }

    writeRegistry(this.entries);
    log.info(`IFF registry: removed entry ${id}`);
    return true;
  }

  /**
   * Clear all entries (use with caution)
   */
  clear(): void {
    this.entries = [];
    writeRegistry(this.entries);
    log.info('IFF registry: cleared all entries');
  }

  /**
   * Get count of entries by category
   */
  getCategoryCounts(): Record<IFFCategory, number> {
    this.ensureLoaded();
    const counts: Record<IFFCategory, number> = {
      [IFFCategory.BLUE]: 0,
      [IFFCategory.RED]: 0,
      [IFFCategory.YELLOW]: 0,
      [IFFCategory.GRAY]: 0,
    };

    for (const entry of this.entries) {
      counts[entry.iff_category]++;
    }

    return counts;
  }
}

// Singleton instance
export const iffRegistry = new IFFRegistry();
