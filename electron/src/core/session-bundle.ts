/**
 * Session Bundle Export
 * Assembles a portable ZIP bundle containing all session data, metadata, and hashes.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import log from 'electron-log';
import JSZip from 'jszip';
import { getTestSessionById, getSiteById, getCUASProfileById } from './library-store';
import { sessionDataCollector, recoverPositionsFromCSV } from './session-data-collector';

export interface BundleOptions {
  sessionId: string;
  includePDF?: boolean;
  includeGeoJSON?: boolean;
  includeCZML?: boolean;
  includeCSV?: boolean;
  onProgress?: (step: string, percent: number) => void;
}

export interface BundleResult {
  success: boolean;
  buffer?: Buffer;
  filename?: string;
  size_bytes?: number;
  error?: string;
  manifest?: BundleManifest;
}

export interface BundleManifest {
  version: '1.0';
  generated_at: string;
  generator: string;
  session_id: string;
  session_name: string;
  crs: 'EPSG:4326';
  files: ManifestFile[];
}

interface ManifestFile {
  path: string;
  sha256: string;
  size_bytes: number;
  type: string;
}

/** Compute SHA-256 hash of content with canonical LF line endings */
function hashContent(content: string | Buffer): string {
  const normalized = typeof content === 'string'
    ? content.replace(/\r\n/g, '\n')
    : content;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/** Compute SHA-256 hash of a file via streaming */
async function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Generate a session bundle ZIP.
 */
export async function generateSessionBundle(options: BundleOptions): Promise<BundleResult> {
  const { sessionId, onProgress } = options;
  const includeCSV = options.includeCSV !== false;
  const includeGeoJSON = options.includeGeoJSON !== false;
  const includeCZML = options.includeCZML !== false;

  try {
    const session = getTestSessionById(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    const zip = new JSZip();
    const manifestFiles: ManifestFile[] = [];
    const report = (step: string, pct: number) => onProgress?.(step, pct);

    report('Gathering session data...', 5);

    // 1. session.json — full TestSession metadata
    const sessionJson = JSON.stringify(session, null, 2);
    zip.file('session.json', sessionJson);
    manifestFiles.push({
      path: 'session.json',
      sha256: hashContent(sessionJson),
      size_bytes: Buffer.byteLength(sessionJson),
      type: 'metadata',
    });

    // 2. site.json — SiteDefinition if available
    if (session.site_id) {
      const site = getSiteById(session.site_id);
      if (site) {
        const siteJson = JSON.stringify(site, null, 2);
        zip.file('site.json', siteJson);
        manifestFiles.push({
          path: 'site.json',
          sha256: hashContent(siteJson),
          size_bytes: Buffer.byteLength(siteJson),
          type: 'metadata',
        });
      }
    }

    report('Exporting CUAS profiles...', 15);

    // 3. cuas_profiles.json — profiles used in session
    const cuasPlacements = session.cuas_placements || [];
    const profileIds = new Set(cuasPlacements.map(p => p.cuas_profile_id));
    const profiles = Array.from(profileIds)
      .map(id => getCUASProfileById(id))
      .filter((p): p is NonNullable<typeof p> => p != null);

    if (profiles.length > 0) {
      const profilesJson = JSON.stringify(profiles, null, 2);
      zip.file('cuas_profiles.json', profilesJson);
      manifestFiles.push({
        path: 'cuas_profiles.json',
        sha256: hashContent(profilesJson),
        size_bytes: Buffer.byteLength(profilesJson),
        type: 'metadata',
      });
    }

    report('Exporting telemetry CSVs...', 25);

    // 4. telemetry/ — CSV files from session data path or session-data-collector
    if (includeCSV) {
      const telemetryFolder = zip.folder('telemetry')!;

      // Try live_data_path first (file-based sessions)
      if (session.live_data_path && fs.existsSync(session.live_data_path)) {
        const files = fs.readdirSync(session.live_data_path)
          .filter(f => f.endsWith('.csv'));

        for (const file of files) {
          const filePath = path.join(session.live_data_path, file);
          const content = fs.readFileSync(filePath, 'utf-8');
          telemetryFolder.file(file, content);
          manifestFiles.push({
            path: `telemetry/${file}`,
            sha256: hashContent(content),
            size_bytes: Buffer.byteLength(content),
            type: file === 'events.csv' ? 'events' : 'telemetry',
          });
        }
      } else {
        // Fall back to session-data-collector in-memory data
        const tempDir = path.join(require('os').tmpdir(), `scensus-bundle-${sessionId}`);
        try {
          const exportedFiles = await sessionDataCollector.exportToCSV(sessionId, tempDir);
          for (const filePath of exportedFiles) {
            const fileName = path.basename(filePath);
            if (fileName.endsWith('.csv')) {
              const content = fs.readFileSync(filePath, 'utf-8');
              telemetryFolder.file(fileName, content);
              manifestFiles.push({
                path: `telemetry/${fileName}`,
                sha256: hashContent(content),
                size_bytes: Buffer.byteLength(content),
                type: fileName === 'events.csv' ? 'events' : 'telemetry',
              });
            }
          }
        } catch (e) {
          log.warn('[Bundle] Failed to export CSVs from collector:', e);
        } finally {
          // Clean up temp dir
          try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
        }
      }
    }

    report('Generating GeoJSON...', 50);

    // 5. tracks.geojson — via internal generation
    if (includeGeoJSON) {
      try {
        const geojson = generateBundleGeoJSON(session);
        if (geojson) {
          const geojsonStr = JSON.stringify(geojson, null, 2);
          zip.file('tracks.geojson', geojsonStr);
          manifestFiles.push({
            path: 'tracks.geojson',
            sha256: hashContent(geojsonStr),
            size_bytes: Buffer.byteLength(geojsonStr),
            type: 'geojson',
          });
        }
      } catch (e) {
        log.warn('[Bundle] GeoJSON generation failed:', e);
      }
    }

    report('Generating CZML...', 65);

    // 6. replay.czml — via internal generation
    if (includeCZML) {
      try {
        const { generateCZML } = await import('./czml-generator');
        let telemetry = sessionDataCollector.getPositionsByTracker(sessionId);
        if (telemetry.size === 0 && session.live_data_path) {
          telemetry = recoverPositionsFromCSV(session.live_data_path, session.start_time, session.end_time);
        }
        const site = session.site_id ? getSiteById(session.site_id) : undefined;
        const cuasProfiles = Array.from(profileIds)
          .map(id => getCUASProfileById(id))
          .filter((p): p is NonNullable<typeof p> => p != null);

        const czml = generateCZML({
          session,
          telemetry,
          site,
          cuasPlacements,
          cuasProfiles,
        });

        const czmlStr = JSON.stringify(czml, null, 2);
        zip.file('replay.czml', czmlStr);
        manifestFiles.push({
          path: 'replay.czml',
          sha256: hashContent(czmlStr),
          size_bytes: Buffer.byteLength(czmlStr),
          type: 'czml',
        });
      } catch (e) {
        log.warn('[Bundle] CZML generation failed:', e);
      }
    }

    report('Computing hashes...', 85);

    // 7. manifest.json — file listing with SHA-256 hashes
    const manifest: BundleManifest = {
      version: '1.0',
      generated_at: new Date().toISOString(),
      generator: 'SCENSUS Dashboard',
      session_id: sessionId,
      session_name: session.name,
      crs: 'EPSG:4326',
      files: manifestFiles,
    };

    const manifestJson = JSON.stringify(manifest, null, 2);
    zip.file('manifest.json', manifestJson);

    report('Compressing ZIP...', 90);

    // Generate ZIP buffer
    const buffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    // Check size limits
    const sizeMB = buffer.length / (1024 * 1024);
    if (sizeMB > 500) {
      return { success: false, error: `Bundle too large: ${sizeMB.toFixed(0)}MB (max 500MB)` };
    }
    if (sizeMB > 50) {
      log.warn(`[Bundle] Large bundle: ${sizeMB.toFixed(1)}MB for session ${sessionId}`);
    }

    const safeName = session.name.replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 30);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `CUAS_Session_${safeName}_${dateStr}.zip`;

    report('Complete', 100);

    log.info(`[Bundle] Generated ${filename}: ${sizeMB.toFixed(1)}MB, ${manifestFiles.length} files`);

    return {
      success: true,
      buffer,
      filename,
      size_bytes: buffer.length,
      manifest,
    };
  } catch (e: any) {
    log.error('[Bundle] Generation failed:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Generate GeoJSON for the bundle (simplified version of export route logic).
 */
function generateBundleGeoJSON(session: any): any {
  const features: any[] = [];

  let positionsByTracker = sessionDataCollector.getPositionsByTracker(session.id);
  if (positionsByTracker.size === 0 && session.live_data_path) {
    positionsByTracker = recoverPositionsFromCSV(session.live_data_path, session.start_time, session.end_time);
  }
  for (const [trackerId, positions] of positionsByTracker) {
    if (positions.length < 2) continue;

    const coordinates = positions.map((p: any) => [p.longitude, p.latitude, p.altitude_m]);
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates },
      properties: {
        feature_type: 'drone_track',
        tracker_id: trackerId,
        point_count: positions.length,
        start_time: positions[0].timestamp,
        end_time: positions[positions.length - 1].timestamp,
      },
    });
  }

  // CUAS placements
  for (const placement of session.cuas_placements || []) {
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [placement.position.lon, placement.position.lat, placement.position.alt_m || 0],
      },
      properties: {
        feature_type: 'cuas_placement',
        cuas_name: getCUASProfileById(placement.cuas_profile_id)?.name || 'CUAS',
      },
    });
  }

  if (features.length === 0) return null;

  return { type: 'FeatureCollection', features };
}
