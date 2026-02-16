/**
 * Site Recon Store — filesystem-based storage for 3D site reconnaissance screenshots.
 * Stores metadata JSON + image files per site in userData/site-recon/{siteId}/
 */
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log';

export interface ReconImageMeta {
  id: string;
  label: string;
  filename: string;
  cameraState: {
    longitude: number;
    latitude: number;
    height: number;
    heading: number;
    pitch: number;
    roll: number;
  };
  capturedAt: string;
}

export interface SiteReconData {
  siteId: string;
  captures: ReconImageMeta[];
  capturedAt: string;
  status: 'none' | 'captured' | 'stale';
}

function getReconDir(): string {
  return path.join(app.getPath('userData'), 'site-recon');
}

function getSiteDir(siteId: string): string {
  return path.join(getReconDir(), siteId);
}

function getMetaPath(siteId: string): string {
  return path.join(getSiteDir(siteId), 'meta.json');
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function getReconData(siteId: string): SiteReconData | null {
  const metaPath = getMetaPath(siteId);
  if (!fs.existsSync(metaPath)) return null;
  try {
    const raw = fs.readFileSync(metaPath, 'utf-8');
    return JSON.parse(raw) as SiteReconData;
  } catch (err) {
    log.warn(`[site-recon] Failed to read meta for ${siteId}:`, err);
    return null;
  }
}

export function saveReconImage(
  siteId: string,
  captureId: string,
  label: string,
  base64Data: string,
  cameraState: ReconImageMeta['cameraState']
): ReconImageMeta {
  const siteDir = getSiteDir(siteId);
  ensureDir(siteDir);

  const filename = `${captureId}.png`;
  const imagePath = path.join(siteDir, filename);

  // Strip data URL prefix if present
  const raw = base64Data.replace(/^data:image\/\w+;base64,/, '');
  fs.writeFileSync(imagePath, Buffer.from(raw, 'base64'));

  const meta: ReconImageMeta = {
    id: captureId,
    label,
    filename,
    cameraState,
    capturedAt: new Date().toISOString(),
  };

  // Update metadata
  let reconData = getReconData(siteId);
  if (!reconData) {
    reconData = {
      siteId,
      captures: [],
      capturedAt: new Date().toISOString(),
      status: 'captured',
    };
  }

  // Replace existing capture with same label, or add new
  const existingIdx = reconData.captures.findIndex((c) => c.label === label);
  if (existingIdx >= 0) {
    reconData.captures[existingIdx] = meta;
  } else {
    reconData.captures.push(meta);
  }
  reconData.capturedAt = new Date().toISOString();
  reconData.status = 'captured';

  // Atomic write
  const metaPath = getMetaPath(siteId);
  const tmpPath = metaPath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(reconData, null, 2));
  fs.renameSync(tmpPath, metaPath);

  log.info(`[site-recon] Saved ${label} for site ${siteId}`);
  return meta;
}

export function getReconImagePath(siteId: string, captureId: string): string | null {
  const reconData = getReconData(siteId);
  if (!reconData) return null;
  const capture = reconData.captures.find((c) => c.id === captureId);
  if (!capture) return null;
  const imgPath = path.join(getSiteDir(siteId), capture.filename);
  return fs.existsSync(imgPath) ? imgPath : null;
}

export function deleteRecon(siteId: string): boolean {
  const siteDir = getSiteDir(siteId);
  if (!fs.existsSync(siteDir)) return false;
  try {
    fs.rmSync(siteDir, { recursive: true, force: true });
    log.info(`[site-recon] Deleted recon data for site ${siteId}`);
    return true;
  } catch (err) {
    log.warn(`[site-recon] Failed to delete recon for ${siteId}:`, err);
    return false;
  }
}

export function listReconSites(): string[] {
  const reconDir = getReconDir();
  if (!fs.existsSync(reconDir)) return [];
  return fs.readdirSync(reconDir).filter((name) => {
    const metaPath = path.join(reconDir, name, 'meta.json');
    return fs.existsSync(metaPath);
  });
}
