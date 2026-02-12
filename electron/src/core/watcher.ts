/**
 * File watching and tailing for log files.
 * Uses chokidar for file system watching.
 */

import * as fs from 'fs';
import * as path from 'path';
import chokidar from 'chokidar';
import log from 'electron-log';
import { TrackerRecord } from './models';
import { CSVParser } from './parser';
import { NMEAParser } from './nmea-parser';
import { KMLImporter } from './kml-import';

export type RecordsCallback = (records: TrackerRecord[]) => void;
export type NewFileCallback = (filePath: string) => void;

class FileOffsetTracker {
  private offsets = new Map<string, number>();

  getOffset(filePath: string): number {
    return this.offsets.get(filePath) || 0;
  }

  setOffset(filePath: string, offset: number): void {
    this.offsets.set(filePath, offset);
  }

  resetOffset(filePath: string): void {
    this.offsets.set(filePath, 0);
  }

  removeFile(filePath: string): void {
    this.offsets.delete(filePath);
  }
}

class LogTailer {
  private csvParser = new CSVParser();
  private nmeaParser = new NMEAParser();
  private kmlImporter = new KMLImporter();
  private offsetTracker = new FileOffsetTracker();
  private headerCache = new Map<string, string>();

  async tailFile(filePath: string): Promise<TrackerRecord[]> {
    if (!fs.existsSync(filePath)) {
      this.offsetTracker.removeFile(filePath);
      return [];
    }

    const ext = path.extname(filePath).toLowerCase();

    // KML/KMZ files are static - always parse completely
    if (ext === '.kml' || ext === '.kmz') {
      return this.parseCompleteFile(filePath);
    }

    try {
      const stat = fs.statSync(filePath);
      const fileSize = stat.size;
      const currentOffset = this.offsetTracker.getOffset(filePath);

      // Handle log rotation
      if (fileSize < currentOffset) {
        this.offsetTracker.resetOffset(filePath);
        return this.parseCompleteFile(filePath);
      }

      // No new data
      if (fileSize === currentOffset) {
        return [];
      }

      if (currentOffset === 0) {
        // First read - parse complete file
        const records = await this.parseCompleteFile(filePath);
        this.offsetTracker.setOffset(filePath, fileSize);

        // Cache header for CSV files
        if (ext === '.csv') {
          const content = fs.readFileSync(filePath, 'utf-8');
          const firstLine = content.split('\n')[0];
          if (firstLine) this.headerCache.set(filePath, firstLine);
        }

        return records;
      }

      // Read new content from offset
      const fd = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(fileSize - currentOffset);
      fs.readSync(fd, buffer, 0, buffer.length, currentOffset);
      fs.closeSync(fd);

      let newContent = buffer.toString('utf-8');

      // Handle partial line
      const lines = newContent.split('\n');
      if (!newContent.endsWith('\n') && lines.length > 1) {
        const incompleteLine = lines.pop()!;
        newContent = lines.join('\n');
        this.offsetTracker.setOffset(filePath, fileSize - Buffer.byteLength(incompleteLine, 'utf-8'));
      } else {
        this.offsetTracker.setOffset(filePath, fileSize);
      }

      return this.parseNewLines(filePath, newContent);
    } catch (e) {
      log.error(`Error tailing file ${filePath}:`, e);
      return [];
    }
  }

  private async parseCompleteFile(filePath: string): Promise<TrackerRecord[]> {
    try {
      const ext = path.extname(filePath).toLowerCase();

      if (ext === '.kmz') {
        const buffer = fs.readFileSync(filePath);
        return this.kmlImporter.parseKMZFile(buffer);
      }

      const content = fs.readFileSync(filePath, 'utf-8');

      if (ext === '.nmea') {
        return this.nmeaParser.parseNMEAContent(content);
      } else if (ext === '.kml') {
        return this.kmlImporter.parseKMLContent(content);
      } else {
        return this.csvParser.parseCSVContent(content);
      }
    } catch (e) {
      log.error(`Error parsing complete file ${filePath}:`, e);
      return [];
    }
  }

  private parseNewLines(filePath: string, newContent: string): TrackerRecord[] {
    if (!newContent.trim()) return [];

    try {
      const ext = path.extname(filePath).toLowerCase();

      if (ext === '.nmea') {
        return this.nmeaParser.parseNMEAContent(newContent);
      }

      // CSV - prepend cached header
      const header = this.headerCache.get(filePath);
      if (!header) {
        // Read header from file
        const content = fs.readFileSync(filePath, 'utf-8');
        const firstLine = content.split('\n')[0];
        if (firstLine) {
          this.headerCache.set(filePath, firstLine);
          return this.csvParser.parseCSVContent(firstLine + '\n' + newContent);
        }
        return [];
      }

      return this.csvParser.parseCSVContent(header + '\n' + newContent);
    } catch (e) {
      log.error(`Error parsing new lines from ${filePath}:`, e);
      return [];
    }
  }
}

export class LogWatcher {
  private tailer = new LogTailer();
  private watcher: chokidar.FSWatcher | null = null;
  private running = false;

  constructor(
    private eventFolder: string,
    private onRecords: RecordsCallback,
    private onNewFile?: NewFileCallback
  ) {}

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Initial scan
    await this.initialScan();

    // Start watching
    this.watcher = chokidar.watch(this.eventFolder, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });

    this.watcher.on('add', (filePath) => this.handleFileChange('add', filePath));
    this.watcher.on('change', (filePath) => this.handleFileChange('change', filePath));

    log.info(`Started watching: ${this.eventFolder}`);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    log.info(`Stopped watching: ${this.eventFolder}`);
  }

  private async initialScan(): Promise<void> {
    if (!fs.existsSync(this.eventFolder)) {
      log.warn(`Event folder does not exist: ${this.eventFolder}`);
      return;
    }

    const extensions = ['.csv', '.nmea', '.kml', '.kmz'];
    const files = fs.readdirSync(this.eventFolder)
      .filter((f) => extensions.includes(path.extname(f).toLowerCase()))
      .map((f) => path.join(this.eventFolder, f));

    log.info(`Initial scan found ${files.length} data files`);

    for (const filePath of files) {
      try {
        const records = await this.tailer.tailFile(filePath);
        if (records.length > 0) {
          log.info(`Initial read: ${records.length} records from ${path.basename(filePath)}`);
          this.onRecords(records);
        }
      } catch (e) {
        log.error(`Error processing ${filePath}:`, e);
      }
    }
  }

  private async handleFileChange(type: 'add' | 'change', filePath: string): Promise<void> {
    const ext = path.extname(filePath).toLowerCase();
    if (!['.csv', '.nmea', '.kml', '.kmz'].includes(ext)) return;

    try {
      if (type === 'add' && this.onNewFile) {
        this.onNewFile(filePath);
      }

      const records = await this.tailer.tailFile(filePath);
      if (records.length > 0) {
        log.info(`Read ${records.length} new records from ${path.basename(filePath)}`);
        this.onRecords(records);
      }
    } catch (e) {
      log.error(`Error handling change for ${filePath}:`, e);
    }
  }
}
