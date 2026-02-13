/**
 * Python Backend Process Manager
 *
 * Spawns and manages the Python FastAPI backend as a child process.
 * Used for backend convergence: Electron Express handles v1 routes,
 * Python handles /api/v2/* (terrain, RF, SQLAlchemy, CRM).
 */

import { ChildProcess, spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import log from 'electron-log';

const PYTHON_PORT = 8083;

interface PythonBackendOptions {
  port?: number;
  pythonPath?: string;
  logRootFolder?: string;
}

class PythonBackendManager {
  private process: ChildProcess | null = null;
  private port: number;
  private pythonPath: string;
  private logRootFolder: string;
  private _ready = false;
  private _startPromise: Promise<boolean> | null = null;

  constructor(options?: PythonBackendOptions) {
    this.port = options?.port || PYTHON_PORT;
    this.pythonPath = options?.pythonPath || this._findPython();
    this.logRootFolder = options?.logRootFolder || '';
  }

  get isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }

  get isReady(): boolean {
    return this._ready;
  }

  /** Start the Python backend as a subprocess. */
  async start(): Promise<boolean> {
    if (this.isRunning) {
      log.info('[python-backend] Already running');
      return true;
    }

    if (this._startPromise) return this._startPromise;

    this._startPromise = this._doStart();
    const result = await this._startPromise;
    this._startPromise = null;
    return result;
  }

  /** Stop the Python backend. */
  stop(): void {
    if (!this.process) return;

    log.info('[python-backend] Stopping...');
    this._ready = false;

    try {
      // Try graceful shutdown first
      this.process.kill('SIGTERM');

      // Force kill after 5 seconds
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          log.warn('[python-backend] Force killing');
          this.process.kill('SIGKILL');
        }
      }, 5000);
    } catch (e) {
      log.warn('[python-backend] Error stopping:', e);
    }

    this.process = null;
  }

  private async _doStart(): Promise<boolean> {
    log.info(`[python-backend] Starting on port ${this.port}...`);

    const args = [
      '-m', 'logtail_dashboard',
      '--port', this.port.toString(),
      '--host', '127.0.0.1',
      '--no-browser',
    ];

    if (this.logRootFolder) {
      args.push('--log-root', this.logRootFolder);
    }

    try {
      this.process = spawn(this.pythonPath, args, {
        cwd: this._getProjectRoot(),
        env: {
          ...process.env,
          SCENSUS_NO_BROWSER: '1',
          PYTHONUNBUFFERED: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // Forward stdout/stderr to electron-log
      this.process.stdout?.on('data', (data: Buffer) => {
        const line = data.toString().trim();
        if (line) log.info(`[python] ${line}`);
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        const line = data.toString().trim();
        if (line) log.warn(`[python] ${line}`);
      });

      this.process.on('error', (err) => {
        log.error(`[python-backend] Process error: ${err.message}`);
        this._ready = false;
        this.process = null;
      });

      this.process.on('exit', (code, signal) => {
        log.info(`[python-backend] Exited with code=${code} signal=${signal}`);
        this._ready = false;
        this.process = null;
      });

      // Wait for the backend to become responsive
      const ready = await this._waitForReady(15000);
      this._ready = ready;

      if (ready) {
        log.info(`[python-backend] Ready on port ${this.port}`);
      } else {
        log.error('[python-backend] Failed to start within timeout');
        this.stop();
      }

      return ready;
    } catch (e: any) {
      log.error(`[python-backend] Spawn failed: ${e.message}`);
      return false;
    }
  }

  /** Poll the health endpoint until it responds. */
  private async _waitForReady(timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    const url = `http://127.0.0.1:${this.port}/api/v2/health`;

    while (Date.now() - start < timeoutMs) {
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(2000),
        });
        if (response.ok) return true;
      } catch {
        // Not ready yet
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    return false;
  }

  /** Find Python executable. */
  private _findPython(): string {
    // Check common locations
    const candidates = [
      'python3',
      'python',
      // Virtual env
      path.join(this._getProjectRoot(), '.venv', 'bin', 'python'),
      path.join(this._getProjectRoot(), '.venv', 'Scripts', 'python.exe'),
      // System paths
      '/usr/bin/python3',
      '/usr/local/bin/python3',
    ];

    for (const candidate of candidates) {
      try {
        const { execSync } = require('child_process');
        execSync(`${candidate} --version`, { stdio: 'ignore' });
        return candidate;
      } catch {
        continue;
      }
    }

    return 'python3'; // Default, let it fail with a clear error
  }

  /** Get project root directory (where logtail_dashboard package lives). */
  private _getProjectRoot(): string {
    // In development: two levels up from electron/src/core/
    const devRoot = path.resolve(__dirname, '..', '..', '..');
    if (fs.existsSync(path.join(devRoot, 'logtail_dashboard'))) {
      return devRoot;
    }

    // In production: check resources
    const resourceRoot = path.resolve(process.resourcesPath || '', '..');
    if (fs.existsSync(path.join(resourceRoot, 'logtail_dashboard'))) {
      return resourceRoot;
    }

    return devRoot;
  }
}

// Singleton
let _manager: PythonBackendManager | null = null;

export function getPythonBackend(options?: PythonBackendOptions): PythonBackendManager {
  if (!_manager) {
    _manager = new PythonBackendManager(options);
  }
  return _manager;
}

export { PythonBackendManager };
