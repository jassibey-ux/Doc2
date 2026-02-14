/**
 * Cloud Sync Module (Electron-integrated alternative to standalone bridge)
 *
 * Watches the same CSV folder as the main watcher, buffers records,
 * and pushes them to the cloud API with HMAC signing.
 * Integrated into the Electron app — toggle on/off from settings.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import log from 'electron-log';

export interface CloudSyncConfig {
  enabled: boolean;
  cloud_url: string;
  api_key: string;
  organization_id: string;
  push_interval_ms: number;
  batch_size: number;
  max_retry_attempts: number;
}

export interface SyncStatus {
  enabled: boolean;
  connected: boolean;
  pending_records: number;
  last_push_at: string | null;
  last_error: string | null;
  consecutive_failures: number;
}

const DEFAULT_CLOUD_SYNC_CONFIG: CloudSyncConfig = {
  enabled: false,
  cloud_url: 'https://api.scensus.io',
  api_key: '',
  organization_id: '',
  push_interval_ms: 5000,
  batch_size: 100,
  max_retry_attempts: 5,
};

import { CloudSyncBuffer } from './cloud-sync-buffer';

class CloudSyncManager {
  private config: CloudSyncConfig;
  private sqliteBuffer: CloudSyncBuffer;
  private pushTimer: ReturnType<typeof setInterval> | null = null;
  private consecutiveFailures = 0;
  private lastPushAt: string | null = null;
  private lastError: string | null = null;

  constructor() {
    this.config = { ...DEFAULT_CLOUD_SYNC_CONFIG };
    this.sqliteBuffer = new CloudSyncBuffer();
    this.loadConfig();
  }

  /** Load cloud sync config from disk. */
  private loadConfig(): void {
    try {
      const cfgDir = process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, 'SCENSUS')
        : path.join(os.homedir(), '.scensus');
      const cfgPath = path.join(cfgDir, 'cloud_sync.json');

      if (fs.existsSync(cfgPath)) {
        const data = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
        this.config = { ...DEFAULT_CLOUD_SYNC_CONFIG, ...data };
      }
    } catch (e) {
      log.warn('Failed to load cloud sync config:', e);
    }
  }

  /** Save cloud sync config to disk. */
  saveConfig(updates: Partial<CloudSyncConfig>): void {
    this.config = { ...this.config, ...updates };

    try {
      const cfgDir = process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, 'SCENSUS')
        : path.join(os.homedir(), '.scensus');

      if (!fs.existsSync(cfgDir)) {
        fs.mkdirSync(cfgDir, { recursive: true });
      }

      const cfgPath = path.join(cfgDir, 'cloud_sync.json');
      fs.writeFileSync(cfgPath, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (e) {
      log.error('Failed to save cloud sync config:', e);
    }
  }

  getConfig(): CloudSyncConfig {
    return { ...this.config };
  }

  /** Start the push loop. Opens SQLite buffer and re-queues crash survivors. */
  start(): void {
    if (!this.config.enabled || this.pushTimer) return;

    this.sqliteBuffer.open();

    // Purge records older than 7 days
    const purged = this.sqliteBuffer.purgeOld();
    if (purged > 0) {
      log.info(`Cloud sync: purged ${purged} records older than 7 days`);
    }

    const pending = this.sqliteBuffer.pendingCount();
    if (pending > 0) {
      log.info(`Cloud sync: ${pending} records from prior session ready for push`);
    }

    log.info(`Cloud sync started → ${this.config.cloud_url}`);
    this.pushTimer = setInterval(() => this.pushBatch(), this.config.push_interval_ms);
  }

  /** Stop the push loop and close the buffer. */
  stop(): void {
    if (this.pushTimer) {
      clearInterval(this.pushTimer);
      this.pushTimer = null;
    }
    this.sqliteBuffer.close();
    log.info('Cloud sync stopped');
  }

  /** Enqueue tracker records for cloud push (persisted to SQLite). */
  enqueue(records: Record<string, unknown>[]): void {
    if (!this.config.enabled) return;
    this.sqliteBuffer.enqueue(records);
  }

  /** Get current sync status. */
  getStatus(): SyncStatus {
    return {
      enabled: this.config.enabled,
      connected: this.consecutiveFailures === 0 && this.lastPushAt !== null,
      pending_records: this.sqliteBuffer.pendingCount(),
      last_push_at: this.lastPushAt,
      last_error: this.lastError,
      consecutive_failures: this.consecutiveFailures,
    };
  }

  /** Push a batch of records to the cloud. */
  private async pushBatch(): Promise<void> {
    const batch = this.sqliteBuffer.dequeue(this.config.batch_size);
    if (batch.length === 0) return;

    const ids = batch.map((b) => b.id);
    const records = batch.map((b) => b.payload);

    const success = await this.httpPush(records);

    if (success) {
      this.sqliteBuffer.ack(ids);
      this.consecutiveFailures = 0;
      this.lastPushAt = new Date().toISOString();
      this.lastError = null;
      const remaining = this.sqliteBuffer.pendingCount();
      log.info(`Cloud sync: pushed ${batch.length} records (${remaining} remaining)`);
    } else {
      this.consecutiveFailures++;
      this.sqliteBuffer.nack(ids);

      // Check if any records have exceeded max retries and drop them
      const maxRetries = this.config.max_retry_attempts;
      const overRetried = batch.filter((b) => b.retries >= maxRetries);
      if (overRetried.length > 0) {
        const dropIds = overRetried.map((b) => b.id);
        this.sqliteBuffer.ack(dropIds); // Remove permanently
        log.warn(`Cloud sync: dropping ${dropIds.length} records after ${maxRetries} retries`);
      }
    }
  }

  /** HTTP POST with HMAC signing. */
  private async httpPush(records: Record<string, unknown>[]): Promise<boolean> {
    const urlPath = '/api/v2/telemetry/ingest';
    const url = this.config.cloud_url.replace(/\/+$/, '') + urlPath;

    const payload = JSON.stringify({
      organization_id: this.config.organization_id,
      records,
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Organization-ID': this.config.organization_id,
    };

    // HMAC signing
    if (this.config.api_key) {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const bodyHash = crypto.createHash('sha256').update(payload).digest('hex');
      const message = `POST\n${urlPath}\n${timestamp}\n${bodyHash}`;
      const signature = crypto
        .createHmac('sha256', this.config.api_key)
        .update(message)
        .digest('hex');

      headers['X-HMAC-Signature'] = signature;
      headers['X-HMAC-Timestamp'] = timestamp;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: payload,
        signal: AbortSignal.timeout(30000),
      });

      if (response.ok) {
        return true;
      }

      const text = await response.text().catch(() => '');
      this.lastError = `HTTP ${response.status}: ${text.substring(0, 200)}`;
      log.warn(`Cloud sync push failed: ${this.lastError}`);
      return false;
    } catch (e: any) {
      this.lastError = e.message || 'Network error';
      log.warn(`Cloud sync push error: ${this.lastError}`);
      return false;
    }
  }
}

// Singleton instance
export const cloudSyncManager = new CloudSyncManager();
