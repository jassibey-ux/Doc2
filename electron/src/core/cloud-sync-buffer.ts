/**
 * SQLite-backed Store-and-Forward Buffer for Cloud Sync
 *
 * Replaces the in-memory BufferedRecord[] with a crash-safe SQLite buffer.
 * Pattern ported from bridge/buffer.py — WAL mode, 7-day purge, retry tracking.
 *
 * Records survive Electron crashes, network outages, and restarts.
 * On startup, any records from a prior crash are automatically re-queued.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import log from 'electron-log';

// Use better-sqlite3 for synchronous, crash-safe operations
import Database from 'better-sqlite3';

const SEVEN_DAYS_S = 86400 * 7;

export interface BufferedRow {
  id: number;
  payload: Record<string, unknown>;
  retries: number;
}

export class CloudSyncBuffer {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor(dbPath?: string) {
    if (dbPath) {
      this.dbPath = dbPath;
    } else {
      const cfgDir = process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, 'SCENSUS')
        : path.join(os.homedir(), '.scensus');
      this.dbPath = path.join(cfgDir, 'cloud_sync_buffer.db');
    }
  }

  /** Open the database and create tables if needed. */
  open(): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS buffer (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payload TEXT NOT NULL,
        created_at REAL NOT NULL,
        retry_count INTEGER DEFAULT 0,
        last_retry_at REAL DEFAULT 0
      )
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_buffer_created
      ON buffer(created_at)
    `);

    log.info(`Cloud sync buffer opened: ${this.dbPath}`);
  }

  /** Close the database connection. */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /** Add records to the buffer. Returns count enqueued. */
  enqueue(records: Record<string, unknown>[]): number {
    if (!this.db || records.length === 0) return 0;

    const now = Date.now() / 1000;
    const insert = this.db.prepare(
      'INSERT INTO buffer (payload, created_at) VALUES (?, ?)'
    );

    const insertMany = this.db.transaction((recs: Record<string, unknown>[]) => {
      for (const rec of recs) {
        insert.run(JSON.stringify(rec), now);
      }
    });

    insertMany(records);
    return records.length;
  }

  /** Dequeue the oldest un-pushed records. */
  dequeue(batchSize: number = 100): BufferedRow[] {
    if (!this.db) return [];

    const rows = this.db
      .prepare('SELECT id, payload, retry_count FROM buffer ORDER BY id ASC LIMIT ?')
      .all(batchSize) as { id: number; payload: string; retry_count: number }[];

    const results: BufferedRow[] = [];
    for (const row of rows) {
      try {
        results.push({
          id: row.id,
          payload: JSON.parse(row.payload),
          retries: row.retry_count,
        });
      } catch {
        log.warn(`Corrupt buffer row ${row.id}, removing`);
        this.db.prepare('DELETE FROM buffer WHERE id = ?').run(row.id);
      }
    }
    return results;
  }

  /** Remove successfully pushed records. */
  ack(ids: number[]): void {
    if (!this.db || ids.length === 0) return;

    const placeholders = ids.map(() => '?').join(',');
    this.db.prepare(`DELETE FROM buffer WHERE id IN (${placeholders})`).run(...ids);
  }

  /** Mark records as failed (increment retry count). */
  nack(ids: number[]): void {
    if (!this.db || ids.length === 0) return;

    const now = Date.now() / 1000;
    const placeholders = ids.map(() => '?').join(',');
    this.db
      .prepare(
        `UPDATE buffer SET retry_count = retry_count + 1, last_retry_at = ? WHERE id IN (${placeholders})`
      )
      .run(now, ...ids);
  }

  /** Return number of records waiting to be pushed. */
  pendingCount(): number {
    if (!this.db) return 0;
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM buffer').get() as { cnt: number };
    return row.cnt;
  }

  /** Remove records older than maxAgeS (default: 7 days). Returns count removed. */
  purgeOld(maxAgeS: number = SEVEN_DAYS_S): number {
    if (!this.db) return 0;

    const cutoff = Date.now() / 1000 - maxAgeS;
    const result = this.db.prepare('DELETE FROM buffer WHERE created_at < ?').run(cutoff);
    return result.changes;
  }
}
