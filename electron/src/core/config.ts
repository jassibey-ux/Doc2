/**
 * Configuration management.
 * Loads/saves config from %LOCALAPPDATA%\SCENSUS\config.json
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import log from 'electron-log';

export interface GPSDenialThresholds {
  /** HDOP value above which GPS is considered degraded (default: 5.0) */
  hdop_degraded: number;
  /** HDOP value above which GPS is considered lost (default: 20.0) */
  hdop_lost: number;
  /** Satellite count below which GPS is considered degraded (default: 4) */
  satellites_degraded: number;
  /** Satellite count below which GPS is considered lost (default: 2) */
  satellites_lost: number;
  /** Duration in seconds of fix loss before emitting gps_lost event (default: 3) */
  fix_loss_duration_s: number;
  /** Duration in seconds of degraded quality before emitting gps_degraded event (default: 5) */
  degraded_duration_s: number;
}

export interface AppConfig {
  log_root_folder: string;
  active_event: string | null;
  port: number;
  bind_host: string;
  stale_seconds: number;
  enable_map: boolean;
  low_battery_mv: number;
  critical_battery_mv: number;
  /** GPS denial detection thresholds */
  gps_denial_thresholds: GPSDenialThresholds;
  /** Whether to auto-compute metrics when session completes */
  auto_compute_metrics: boolean;

  // --- AI Analysis ---
  /** Anthropic API key for Claude AI analysis (optional, stored locally) */
  anthropic_api_key?: string;
  /** Claude model to use for AI analysis (default: 'claude-sonnet-4-latest') */
  anthropic_model?: string;
  /** Whether user has consented to sending data to Anthropic API */
  ai_analysis_consent?: boolean;

  // --- Ops Mode ---
  /** Enable operational mode (network-accessible, IFF, CoT, deconfliction) */
  ops_mode: boolean;
  /** Bind address when ops_mode is true (default '0.0.0.0' for network access) */
  ops_bind_host: string;
  /** UDP port for CoT (Cursor on Target) message reception */
  cot_listen_port: number;
  /** Enable the CoT UDP listener */
  cot_enabled: boolean;
  /** Multicast group for CoT reception (optional, e.g. '239.2.3.1') */
  cot_multicast_group?: string;
  /** Proximity threshold in meters for IFF auto-correlation */
  iff_proximity_threshold_m: number;
}

// Platform-specific default log folder
function getDefaultLogFolder(): string {
  if (process.platform === 'darwin') {
    // macOS: Use Documents folder
    return path.join(os.homedir(), 'Documents', 'SCENSUS_Logs');
  } else if (process.platform === 'win32') {
    // Windows: Use C:\Temp or Documents fallback
    return 'C:\\Temp';
  } else {
    // Linux/other: Use home folder
    return path.join(os.homedir(), 'SCENSUS_Logs');
  }
}

export const DEFAULT_GPS_DENIAL_THRESHOLDS: GPSDenialThresholds = {
  hdop_degraded: 5.0,
  hdop_lost: 20.0,
  satellites_degraded: 4,
  satellites_lost: 2,
  fix_loss_duration_s: 3,
  degraded_duration_s: 5,
};

const DEFAULT_CONFIG: AppConfig = {
  log_root_folder: getDefaultLogFolder(),
  active_event: null,
  port: 8082,
  bind_host: '127.0.0.1',
  stale_seconds: 60,
  enable_map: true,
  low_battery_mv: 3300,
  critical_battery_mv: 3000,
  gps_denial_thresholds: { ...DEFAULT_GPS_DENIAL_THRESHOLDS },
  auto_compute_metrics: true,

  // Ops Mode defaults
  ops_mode: false,
  ops_bind_host: '0.0.0.0',
  cot_listen_port: 4242,
  cot_enabled: false,
  cot_multicast_group: undefined,
  iff_proximity_threshold_m: 50,
};

export function getConfigPath(): string {
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    const configDir = path.join(localAppData, 'SCENSUS');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    return path.join(configDir, 'config.json');
  }

  // Fallback for non-Windows or dev mode
  return path.join(os.homedir(), '.scensus', 'config.json');
}

export function loadConfig(configPath?: string): AppConfig {
  const cfgPath = configPath || getConfigPath();

  if (fs.existsSync(cfgPath)) {
    try {
      const data = fs.readFileSync(cfgPath, 'utf-8');
      const parsed = JSON.parse(data);
      return { ...DEFAULT_CONFIG, ...parsed };
    } catch (e) {
      log.warn(`Failed to load config from ${cfgPath}:`, e);
      return { ...DEFAULT_CONFIG };
    }
  }

  return { ...DEFAULT_CONFIG };
}

export function saveConfigAtomic(config: Partial<AppConfig>, configPath?: string): boolean {
  const cfgPath = configPath || getConfigPath();
  const configDir = path.dirname(cfgPath);

  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Load existing config and merge
    const existing = loadConfig(cfgPath);
    const merged = { ...existing, ...config };

    // Write to temp file first
    const tempPath = cfgPath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(merged, null, 2), 'utf-8');

    // Backup existing
    if (fs.existsSync(cfgPath)) {
      const backupPath = cfgPath + '.bak';
      fs.copyFileSync(cfgPath, backupPath);
    }

    // Rename temp to target
    fs.renameSync(tempPath, cfgPath);
    return true;
  } catch (e) {
    log.error(`Failed to save config:`, e);
    return false;
  }
}
