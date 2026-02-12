/**
 * SD Card Merge API Routes
 * Handles SD card file upload, parsing, and track merging
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import log from 'electron-log';
import {
  parseSDCardFile,
  mergeTrackData,
  getSDCardTrackSeparate,
  detectConnectionGaps,
  ParsedSDCardData,
  MergedTrack,
  RawGPSPoint,
  EnhancedPositionPoint,
} from '../../core/sd-card-merge';
import { getTestSessionById, updateTestSession } from '../../core/library-store';
import { sessionDataCollector } from '../../core/session-data-collector';

// Configure multer for file uploads
const getUploadDir = () => {
  const userDataPath = app?.getPath?.('userData') || process.env.HOME || '.';
  const uploadDir = path.join(userDataPath, 'sd-uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  return uploadDir;
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, getUploadDir());
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.random().toString(36).substring(7);
    cb(null, `sd-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.csv', '.log', '.txt', '.bin'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV, LOG, TXT, and BIN files are allowed'));
    }
  },
});

// Store parsed SD card data in memory for active sessions
const parsedSDCardCache = new Map<string, ParsedSDCardData>();

export function sdMergeRoutes(): Router {
  const router = Router();

  /**
   * POST /sd-merge/upload
   * Upload and parse an SD card file
   */
  router.post('/sd-merge/upload', upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const trackerId = req.body.tracker_id || 'unknown';
      const sessionId = req.body.session_id;

      log.info(`Parsing SD card file: ${req.file.filename} for tracker ${trackerId}`);

      // Parse the SD card file
      const parsed = parseSDCardFile(req.file.path, trackerId);

      if (!parsed) {
        // Clean up the uploaded file
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'Failed to parse SD card file' });
      }

      // Cache the parsed data
      const cacheKey = `${sessionId || 'default'}-${trackerId}`;
      parsedSDCardCache.set(cacheKey, parsed);

      // Update session if provided
      if (sessionId) {
        const session = getTestSessionById(sessionId);
        if (session) {
          const sdPaths = session.sd_card_paths || [];
          if (!sdPaths.includes(req.file.path)) {
            sdPaths.push(req.file.path);
          }
          updateTestSession(sessionId, {
            sd_card_paths: sdPaths,
            sd_card_merged: false,
          });
        }
      }

      res.json({
        success: true,
        filename: parsed.filename,
        tracker_id: parsed.tracker_id,
        start_time: new Date(parsed.start_time_ms).toISOString(),
        end_time: new Date(parsed.end_time_ms).toISOString(),
        metadata: parsed.metadata,
      });
    } catch (error: any) {
      log.error('SD card upload error:', error);
      res.status(500).json({ error: error.message || 'Failed to upload SD card file' });
    }
  });

  /**
   * POST /sd-merge/merge
   * Merge SD card data with live track data
   */
  router.post('/sd-merge/merge', async (req: Request, res: Response) => {
    try {
      const { session_id, tracker_id, live_points } = req.body;

      if (!tracker_id) {
        return res.status(400).json({ error: 'tracker_id is required' });
      }

      // Get cached SD card data
      const cacheKey = `${session_id || 'default'}-${tracker_id}`;
      const sdCardData = parsedSDCardCache.get(cacheKey) || null;

      // Get live points - first check if explicitly provided, then check session collector
      let livePointsData = live_points || [];

      // If no live_points provided but session_id is given, get from session data collector
      if (livePointsData.length === 0 && session_id) {
        const positionsByTracker = sessionDataCollector.getPositionsByTracker(session_id);
        const trackerPositions = positionsByTracker.get(tracker_id) || [];
        livePointsData = trackerPositions;
        log.info(`Retrieved ${livePointsData.length} live points from session collector for tracker ${tracker_id}`);
      }

      // Convert live points to RawGPSPoint format
      const liveData: RawGPSPoint[] = livePointsData.map((p: any) => ({
        lat: p.lat ?? p.latitude,
        lon: p.lon ?? p.longitude,
        alt_m: p.alt_m ?? p.altitude_m ?? p.alt ?? null,
        baro_alt_m: p.baro_alt_m ?? null,
        timestamp_ms: p.timestamp_ms ?? (p.timestamp ? new Date(p.timestamp).getTime() : Date.now()),
        hdop: p.hdop ?? null,
        satellites: p.satellites ?? null,
        speed_mps: p.speed_mps ?? p.speed_ms ?? null,
        course_deg: p.course_deg ?? p.heading_deg ?? null,
        fix_valid: p.fix_valid ?? true,
      }));

      // Perform merge
      const merged = mergeTrackData(liveData, sdCardData, tracker_id);

      // Update session if provided
      if (session_id) {
        const session = getTestSessionById(session_id);
        if (session && (sdCardData || liveData.length > 0)) {
          updateTestSession(session_id, {
            sd_card_merged: true,
          });
        }
      }

      res.json({
        success: true,
        merged,
        live_points_count: liveData.length,
        sd_points_count: sdCardData?.points?.length || 0,
      });
    } catch (error: any) {
      log.error('SD card merge error:', error);
      res.status(500).json({ error: error.message || 'Failed to merge track data' });
    }
  });

  /**
   * POST /sd-merge/preview
   * Get SD card data as a separate track for dual-track visualization
   * Returns the SD card track alongside detected gaps in live data
   */
  router.post('/sd-merge/preview', async (req: Request, res: Response) => {
    try {
      const { session_id, tracker_id, time_offset } = req.body;

      if (!tracker_id) {
        return res.status(400).json({ error: 'tracker_id is required' });
      }

      // Get cached SD card data
      const cacheKey = `${session_id || 'default'}-${tracker_id}`;
      const sdCardData = parsedSDCardCache.get(cacheKey);

      if (!sdCardData) {
        return res.status(404).json({
          error: 'No SD card data found for this tracker. Please upload an SD card file first.',
        });
      }

      // Convert to separate track with optional time offset
      const timeOffset = parseInt(time_offset) || 0;
      const sdCardTrack = getSDCardTrackSeparate(sdCardData, timeOffset);

      // Get live points to detect gaps
      let livePoints: RawGPSPoint[] = [];
      if (session_id) {
        const positionsByTracker = sessionDataCollector.getPositionsByTracker(session_id);
        const trackerPositions = positionsByTracker.get(tracker_id) || [];
        livePoints = trackerPositions.map((p: any) => ({
          lat: p.lat ?? p.latitude,
          lon: p.lon ?? p.longitude,
          alt_m: p.alt_m ?? p.altitude_m ?? null,
          baro_alt_m: p.baro_alt_m ?? null,
          timestamp_ms: p.timestamp_ms ?? (p.timestamp ? new Date(p.timestamp).getTime() : Date.now()),
          hdop: p.hdop ?? null,
          satellites: p.satellites ?? null,
          speed_mps: p.speed_mps ?? p.speed_ms ?? null,
          course_deg: p.course_deg ?? p.heading_deg ?? null,
          fix_valid: p.fix_valid ?? true,
        }));
      }

      // Detect gaps where SD card has data but live doesn't
      const connectionGaps = detectConnectionGaps(livePoints, sdCardData);

      log.info(`SD card preview for ${tracker_id}: ${sdCardTrack.length} points, ${connectionGaps.length} gaps detected`);

      res.json({
        success: true,
        tracker_id,
        sd_card_track: sdCardTrack,
        time_range: {
          start_ms: sdCardData.start_time_ms + timeOffset,
          end_ms: sdCardData.end_time_ms + timeOffset,
          start: new Date(sdCardData.start_time_ms + timeOffset).toISOString(),
          end: new Date(sdCardData.end_time_ms + timeOffset).toISOString(),
        },
        connection_gaps: connectionGaps,
        live_points_count: livePoints.length,
        sd_points_count: sdCardTrack.length,
        time_offset_applied: timeOffset,
      });
    } catch (error: any) {
      log.error('SD card preview error:', error);
      res.status(500).json({ error: error.message || 'Failed to preview SD card track' });
    }
  });

  /**
   * GET /sd-merge/live-data/:sessionId
   * Get recorded live data for a session
   */
  router.get('/sd-merge/live-data/:sessionId', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const trackerId = req.query.tracker_id as string | undefined;

      const positionsByTracker = sessionDataCollector.getPositionsByTracker(sessionId);
      const summary = sessionDataCollector.getSessionSummary(sessionId);

      if (trackerId) {
        const positions = positionsByTracker.get(trackerId) || [];
        res.json({
          session_id: sessionId,
          tracker_id: trackerId,
          positions,
          point_count: positions.length,
        });
      } else {
        // Return all trackers
        const trackers: { tracker_id: string; point_count: number }[] = [];
        for (const [id, positions] of positionsByTracker) {
          trackers.push({ tracker_id: id, point_count: positions.length });
        }

        res.json({
          session_id: sessionId,
          trackers,
          total_points: summary?.totalPositions || 0,
          summary,
        });
      }
    } catch (error: any) {
      log.error('Get live data error:', error);
      res.status(500).json({ error: error.message || 'Failed to get live data' });
    }
  });

  /**
   * GET /sd-merge/status/:sessionId
   * Get SD card merge status for a session
   */
  router.get('/sd-merge/status/:sessionId', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const session = getTestSessionById(sessionId);

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Get all cached SD data for this session
      const sdFiles: { tracker_id: string; filename: string; points: number }[] = [];
      for (const [key, data] of parsedSDCardCache.entries()) {
        if (key.startsWith(sessionId)) {
          sdFiles.push({
            tracker_id: data.tracker_id,
            filename: data.filename,
            points: data.points.length,
          });
        }
      }

      res.json({
        session_id: sessionId,
        sd_card_paths: session.sd_card_paths || [],
        sd_card_merged: session.sd_card_merged,
        parsed_files: sdFiles,
      });
    } catch (error: any) {
      log.error('SD card status error:', error);
      res.status(500).json({ error: error.message || 'Failed to get SD card status' });
    }
  });

  /**
   * DELETE /sd-merge/cache/:sessionId
   * Clear cached SD card data for a session
   */
  router.delete('/sd-merge/cache/:sessionId', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      let cleared = 0;

      for (const key of parsedSDCardCache.keys()) {
        if (key.startsWith(sessionId)) {
          parsedSDCardCache.delete(key);
          cleared++;
        }
      }

      res.json({ success: true, cleared });
    } catch (error: any) {
      log.error('SD card cache clear error:', error);
      res.status(500).json({ error: error.message || 'Failed to clear cache' });
    }
  });

  return router;
}
