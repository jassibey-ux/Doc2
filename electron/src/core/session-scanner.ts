/**
 * Session scanning and discovery.
 * Scans configured folder for CSV/NMEA data files.
 */

import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log';

export interface SessionInfo {
  name: string;
  path: string;
  last_activity: string | null;
  file_count: number;
  is_active: boolean;
  size_bytes: number;
}

export class SessionScanner {
  private activeThresholdMs: number;

  constructor(
    private logRoot: string,
    activeThresholdMinutes = 30
  ) {
    this.activeThresholdMs = activeThresholdMinutes * 60 * 1000;
  }

  scanSessions(): SessionInfo[] {
    if (!fs.existsSync(this.logRoot)) {
      return [];
    }

    const session = this.analyzeFolder(this.logRoot);
    return session ? [session] : [];
  }

  private analyzeFolder(folderPath: string): SessionInfo | null {
    try {
      const entries = fs.readdirSync(folderPath);
      const dataFiles = entries.filter((f) => {
        const ext = path.extname(f).toLowerCase();
        return ['.csv', '.nmea', '.kml', '.kmz'].includes(ext);
      });

      if (dataFiles.length === 0) return null;

      let lastActivity: Date | null = null;
      let totalSize = 0;

      for (const file of dataFiles) {
        try {
          const stat = fs.statSync(path.join(folderPath, file));
          totalSize += stat.size;
          const mtime = stat.mtime;
          if (!lastActivity || mtime > lastActivity) {
            lastActivity = mtime;
          }
        } catch {
          continue;
        }
      }

      if (!lastActivity) return null;

      const timeSinceActivity = Date.now() - lastActivity.getTime();
      const isActive = timeSinceActivity <= this.activeThresholdMs;

      return {
        name: path.basename(folderPath),
        path: folderPath,
        last_activity: lastActivity.toISOString(),
        file_count: dataFiles.length,
        is_active: isActive,
        size_bytes: totalSize,
      };
    } catch (e) {
      log.error(`Error analyzing folder ${folderPath}:`, e);
      return null;
    }
  }

  findMostRecentActive(): SessionInfo | null {
    const sessions = this.scanSessions();
    return sessions.length > 0 ? sessions[0] : null;
  }
}
