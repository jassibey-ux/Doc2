/**
 * Offline Sync Queue
 *
 * Stores operations in SQLite when the backend is unreachable.
 * Flushes the queue via POST /api/v2/mobile/sync when connectivity returns.
 */

import * as SQLite from 'expo-sqlite';
import { apiFetch, checkConnection } from './api';

export interface QueuedOperation {
  id: number;
  type: string;
  payload: string; // JSON
  created_at: string;
  retries: number;
}

let db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('scensus_queue');
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        retries INTEGER NOT NULL DEFAULT 0
      );
    `);
  }
  return db;
}

/** Enqueue an operation for eventual sync. */
export async function enqueue(type: string, payload: Record<string, unknown>): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    'INSERT INTO sync_queue (type, payload) VALUES (?, ?)',
    type,
    JSON.stringify(payload),
  );
}

/** Get the number of queued operations. */
export async function queueSize(): Promise<number> {
  const database = await getDb();
  const row = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM sync_queue',
  );
  return row?.count ?? 0;
}

/** Get all queued operations. */
export async function getQueued(): Promise<QueuedOperation[]> {
  const database = await getDb();
  return database.getAllAsync<QueuedOperation>(
    'SELECT * FROM sync_queue ORDER BY id ASC LIMIT 100',
  );
}

/**
 * Attempt to flush the queue to the backend.
 * Returns the number of successfully synced operations.
 */
export async function flushQueue(): Promise<number> {
  const online = await checkConnection();
  if (!online) return 0;

  const items = await getQueued();
  if (items.length === 0) return 0;

  const operations = items.map((item) => ({
    id: String(item.id),
    type: item.type,
    payload: JSON.parse(item.payload),
  }));

  try {
    const result = await apiFetch<{
      total: number;
      succeeded: number;
      failed: number;
      results: Array<{ id: string; status: string; detail?: string }>;
    }>('/api/v2/mobile/sync', {
      method: 'POST',
      body: JSON.stringify({ operations }),
    });

    const database = await getDb();

    // Remove successfully synced items
    const succeededIds = result.results
      .filter((r) => r.status === 'ok')
      .map((r) => Number(r.id));

    if (succeededIds.length > 0) {
      const placeholders = succeededIds.map(() => '?').join(',');
      await database.runAsync(
        `DELETE FROM sync_queue WHERE id IN (${placeholders})`,
        ...succeededIds,
      );
    }

    // Increment retry count for failed items
    const failedIds = result.results
      .filter((r) => r.status === 'error')
      .map((r) => Number(r.id));

    if (failedIds.length > 0) {
      const placeholders = failedIds.map(() => '?').join(',');
      await database.runAsync(
        `UPDATE sync_queue SET retries = retries + 1 WHERE id IN (${placeholders})`,
        ...failedIds,
      );
    }

    return result.succeeded;
  } catch {
    return 0;
  }
}

/** Clear all queued operations (e.g., on logout). */
export async function clearQueue(): Promise<void> {
  const database = await getDb();
  await database.runAsync('DELETE FROM sync_queue');
}
