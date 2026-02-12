/**
 * Configuration management.
 * Loads/saves config from %LOCALAPPDATA%\SCENSUS\config.json
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import log from 'electron-log';

export interface AppConfig {
  log_root_folder: string;
  active_event: string | null;
  port: number;
  bind_host: string;
  stale_seconds: number;
  enable_map: boolean;
  low_battery_mv: number;
  critical_battery_mv: number;
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

const DEFAULT_CONFIG: AppConfig = {
  log_root_folder: getDefaultLogFolder(),
  active_event: null,
  port: 8082,
  bind_host: '127.0.0.1',
  stale_seconds: 60,
  enable_map: true,
  low_battery_mv: 3300,
  critical_battery_mv: 3000,
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
