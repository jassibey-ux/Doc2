/**
 * Test Session API Routes
 * CRUD operations for test sessions and event management
 */

import * as fs from 'fs';
import * as path from 'path';
import { Router } from 'express';
import {
  getTestSessions,
  getTestSessionById,
  createTestSession,
  updateTestSession,
  deleteTestSession,
  addEventToSession,
  removeEventFromSession,
  getSiteById,
} from '../../core/library-store';
import { TestSession, TestEvent, SessionStatus } from '../../core/models/workflow';
import { sessionDataCollector, EngagementData } from '../../core/session-data-collector';
import {
  analyzeSession,
  extractJammingWindows,
  autoComputeOnSessionComplete,
  DroneTrackData,
} from '../../core/metrics-engine';
import { calculateTrackerMetrics } from '../../core/tracker-metrics-calculator';
import { TrackerPosition } from '../../core/mock-tracker-provider';
import { loadConfig } from '../../core/config';
import { getDashboardApp } from '../index';
import log from 'electron-log';

export function testSessionRoutes(): Router {
  const router = Router();

  // GET /api/test-sessions - List all sessions
  router.get('/test-sessions', (req, res) => {
    try {
      let sessions = getTestSessions();

      // Optional status filter
      const status = req.query.status as SessionStatus | undefined;
      if (status) {
        sessions = sessions.filter(s => s.status === status);
      }

      // Optional site filter
      const siteId = req.query.site_id as string | undefined;
      if (siteId) {
        sessions = sessions.filter(s => s.site_id === siteId);
      }

      // Sort by created_at descending (newest first)
      sessions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch test sessions' });
    }
  });

  // GET /api/test-sessions/:id - Get session by ID
  router.get('/test-sessions/:id', (req, res) => {
    try {
      const session = getTestSessionById(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Test session not found' });
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch test session' });
    }
  });

  // POST /api/test-sessions - Create new session
  router.post('/test-sessions', (req, res) => {
    try {
      const sessionData = req.body as Omit<TestSession, 'id' | 'created_at' | 'updated_at'>;

      // Validate required fields (site_id is optional)
      if (!sessionData.name) {
        return res.status(400).json({ error: 'Missing required field: name' });
      }

      // Verify site exists only if site_id is provided
      if (sessionData.site_id) {
        const site = getSiteById(sessionData.site_id);
        if (!site) {
          return res.status(400).json({ error: 'Site not found' });
        }
      }

      // Set defaults
      const session = createTestSession({
        ...sessionData,
        status: sessionData.status || 'planning',
        tracker_assignments: sessionData.tracker_assignments || [],
        cuas_placements: sessionData.cuas_placements || [],
        asset_placements: sessionData.asset_placements || [],
        events: sessionData.events || [],
        sd_card_merged: false,
        analysis_completed: false,
      });

      res.status(201).json(session);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create test session' });
    }
  });

  // PUT /api/test-sessions/:id - Update session
  router.put('/test-sessions/:id', (req, res) => {
    try {
      const updates = req.body as Partial<TestSession>;
      const session = updateTestSession(req.params.id, updates);

      if (!session) {
        return res.status(404).json({ error: 'Test session not found' });
      }

      res.json(session);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update test session' });
    }
  });

  // PATCH /api/test-sessions/:id/tracker-assignment/:trackerId - Update model override for a tracker
  router.patch('/test-sessions/:id/tracker-assignment/:trackerId', (req, res) => {
    try {
      const session = getTestSessionById(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Test session not found' });
      }

      const { trackerId } = req.params;
      const { model_3d_override } = req.body;

      const assignments = session.tracker_assignments?.map(a =>
        a.tracker_id === trackerId ? { ...a, model_3d_override } : a
      );

      if (!assignments?.some(a => a.tracker_id === trackerId)) {
        return res.status(404).json({ error: 'Tracker assignment not found' });
      }

      const updated = updateTestSession(req.params.id, { tracker_assignments: assignments });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update tracker assignment' });
    }
  });

  // PATCH /api/test-sessions/:id/cuas-placement/:placementId - Update model override for CUAS
  router.patch('/test-sessions/:id/cuas-placement/:placementId', (req, res) => {
    try {
      const session = getTestSessionById(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Test session not found' });
      }

      const { placementId } = req.params;
      const { model_3d_override } = req.body;

      const placements = session.cuas_placements?.map(p =>
        p.id === placementId ? { ...p, model_3d_override } : p
      );

      if (!placements?.some(p => p.id === placementId)) {
        return res.status(404).json({ error: 'CUAS placement not found' });
      }

      const updated = updateTestSession(req.params.id, { cuas_placements: placements });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update CUAS placement' });
    }
  });

  // DELETE /api/test-sessions/:id - Delete session
  router.delete('/test-sessions/:id', (req, res) => {
    try {
      const deleted = deleteTestSession(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: 'Test session not found' });
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete test session' });
    }
  });

  // POST /api/test-sessions/:id/start - Start live session
  router.post('/test-sessions/:id/start', (req, res) => {
    try {
      const session = getTestSessionById(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Test session not found' });
      }

      if (session.status !== 'planning') {
        return res.status(400).json({ error: 'Session must be in planning status to start' });
      }

      // Extract assigned tracker IDs from tracker_assignments
      const assignedTrackerIds = session.tracker_assignments?.map(a => a.tracker_id) ?? [];
      log.info(`Starting session ${session.id} with ${assignedTrackerIds.length} assigned trackers: ${assignedTrackerIds.join(', ') || 'none (recording all)'}`);

      // Start recording for this session with tracker filter
      sessionDataCollector.startSession(session.id, assignedTrackerIds);

      // Create session directory for CSV export
      const config = loadConfig();
      const safeName = session.name.replace(/[^a-zA-Z0-9-_]/g, '_');
      const sessionDirName = `${safeName}_${Date.now()}`;
      const sessionPath = path.join(config.log_root_folder, 'test-sessions', sessionDirName);

      // Create directory
      fs.mkdirSync(sessionPath, { recursive: true });
      log.info(`Created session directory: ${sessionPath}`);

      const updated = updateTestSession(req.params.id, {
        status: 'active',
        start_time: new Date().toISOString(),
        live_data_path: sessionPath,
      });

      res.json(updated);
    } catch (error) {
      log.error('Failed to start session:', error);
      res.status(500).json({ error: 'Failed to start session' });
    }
  });

  // POST /api/test-sessions/:id/stop - Stop live session
  router.post('/test-sessions/:id/stop', async (req, res) => {
    try {
      const session = getTestSessionById(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Test session not found' });
      }

      if (session.status !== 'active') {
        return res.status(400).json({ error: 'Session must be active to stop' });
      }

      // Stop recording
      sessionDataCollector.stopSession(session.id);

      // Fetch engagements from Python backend before CSV export (15s timeout, 1 retry)
      let fetchedEngagements: any[] = [];
      const fetchEngagementsFromPython = async (): Promise<any[]> => {
        const abortCtrl = new AbortController();
        const fetchTimeout = setTimeout(() => abortCtrl.abort(), 15000);
        try {
          const engRes = await fetch(`http://127.0.0.1:8083/api/v2/sessions/${session.id}/engagements`, {
            signal: abortCtrl.signal,
          });
          if (!engRes.ok) throw new Error(`HTTP ${engRes.status}`);
          const engWrapper = await engRes.json() as any;
          const engJson = engWrapper.engagements || engWrapper || [];
          return Array.isArray(engJson) ? engJson : [];
        } finally {
          clearTimeout(fetchTimeout);
        }
      };

      try {
        fetchedEngagements = await fetchEngagementsFromPython();
      } catch (firstError: any) {
        log.warn(`[CSV Export] First engagement fetch failed: ${firstError.message} — retrying in 1s...`);
        try {
          await new Promise(r => setTimeout(r, 1000));
          fetchedEngagements = await fetchEngagementsFromPython();
        } catch (retryError: any) {
          log.warn(`[CSV Export] Retry also failed: ${retryError.message}`);
        }
      }

      if (fetchedEngagements.length > 0) {
        const engagements: EngagementData[] = fetchedEngagements.map((e: any) => ({
          id: e.id,
          cuas_placement_id: e.cuas_placement_id || undefined,
          cuas_name: e.cuas_name || e.name || undefined,
          target_tracker_ids: (e.targets || []).map((t: any) => t.tracker_id),
          engage_timestamp: e.engage_timestamp || undefined,
          disengage_timestamp: e.disengage_timestamp || undefined,
          jam_on_at: e.jam_on_at || undefined,
          jam_off_at: e.jam_off_at || undefined,
          jam_duration_s: e.jam_duration_s ?? undefined,
          time_to_effect_s: e.time_to_effect_s ?? undefined,
          pass_fail: e.metrics?.pass_fail || undefined,
        }));
        sessionDataCollector.setSessionEngagements(session.id, engagements);
        log.info(`[CSV Export] Fetched ${engagements.length} engagements for session ${session.id}`);

        // Persist full engagement data to JSON store for offline access
        updateTestSession(session.id, { engagements: fetchedEngagements });
        log.info(`[Engagements] Persisted ${fetchedEngagements.length} engagements to JSON store for session ${session.id}`);
      } else {
        log.warn(`[CSV Export] No engagements fetched from Python backend`);
      }

      // Export data to CSV files
      let exportSummary = {
        files_created: [] as string[],
        total_positions: 0,
        trackers_exported: [] as string[],
      };

      if (session.live_data_path) {
        try {
          const createdFiles = await sessionDataCollector.exportToCSV(session.id, session.live_data_path);
          const summary = sessionDataCollector.getSessionSummary(session.id);

          exportSummary = {
            files_created: createdFiles.map(f => path.basename(f)),
            total_positions: summary?.totalPositions || 0,
            trackers_exported: summary?.trackerSummaries.map(t => t.trackerId) || [],
          };

          log.info(`Session ${session.id} exported: ${createdFiles.length} files, ${exportSummary.total_positions} positions`);
        } catch (exportError) {
          log.error('Error exporting session data:', exportError);
          // Continue even if export fails
        }
      }

      // Calculate duration from start_time
      const endTime = Date.now();
      const startTime = session.start_time ? new Date(session.start_time).getTime() : null;
      const duration_seconds = startTime ? Math.floor((endTime - startTime) / 1000) : 0;

      const updated = updateTestSession(req.params.id, {
        status: 'completed',
        end_time: new Date(endTime).toISOString(),
        duration_seconds,
      });

      // Auto-compute metrics on session completion
      let computedMetrics = null;
      try {
        const config = loadConfig();
        if (config.auto_compute_metrics !== false) {
          log.info(`[AutoMetrics] Auto-computing metrics for session ${req.params.id}`);
          computedMetrics = autoComputeOnSessionComplete(req.params.id);
        }
      } catch (metricsError) {
        log.error('Error auto-computing metrics:', metricsError);
      }

      res.json({
        ...updated,
        export_summary: exportSummary,
        metrics: computedMetrics,
      });
    } catch (error) {
      log.error('Failed to stop session:', error);
      res.status(500).json({ error: 'Failed to stop session' });
    }
  });

  // POST /api/test-sessions/:id/analyze - Run analysis on session
  router.post('/test-sessions/:id/analyze', (req, res) => {
    try {
      const session = getTestSessionById(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Test session not found' });
      }

      if (session.status !== 'completed' && session.status !== 'capturing' && session.status !== 'analyzing') {
        return res.status(400).json({ error: 'Session must be completed, capturing, or analyzing status' });
      }

      // Update status to analyzing
      updateTestSession(req.params.id, {
        status: 'analyzing',
      });

      // Auto-compute metrics
      const computedMetrics = autoComputeOnSessionComplete(req.params.id);

      // Update status to completed with metrics
      const updated = updateTestSession(req.params.id, {
        status: computedMetrics ? 'completed' : 'analyzing',
        analysis_completed: computedMetrics !== null,
        metrics: computedMetrics ?? undefined,
      });

      res.json({
        ...updated,
        metrics: computedMetrics,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to start analysis' });
    }
  });

  // GET /api/test-sessions/:id/analysis - Get analysis results
  router.get('/test-sessions/:id/analysis', (req, res) => {
    try {
      const session = getTestSessionById(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Test session not found' });
      }

      // Get recorded live data from session collector
      const positionsByTracker = sessionDataCollector.getPositionsByTracker(req.params.id);
      const sessionSummary = sessionDataCollector.getSessionSummary(req.params.id);

      // Convert recorded positions to DroneTrackData format
      const trackData = new Map<string, DroneTrackData>();

      for (const [trackerId, positions] of positionsByTracker) {
        if (positions.length === 0) continue;

        // Sort by timestamp
        const sortedPositions = [...positions].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        // Convert to enhanced format expected by metrics engine
        const enhancedPoints = sortedPositions.map((p: TrackerPosition) => ({
          lat: p.latitude,
          lon: p.longitude,
          alt_m: p.altitude_m,
          baro_alt_m: null,
          timestamp_ms: new Date(p.timestamp).getTime(),
          hdop: null,
          satellites: null,
          speed_mps: p.speed_ms,
          course_deg: p.heading_deg,
          fix_valid: p.gps_quality !== 'poor',
          rssi_dbm: p.rssi_dbm ?? null,
          quality: (p.gps_quality === 'good' ? 'good' : p.gps_quality === 'degraded' ? 'degraded' : 'lost') as 'good' | 'degraded' | 'lost',
          source: (p.source === 'mock' ? 'live' : p.source) as 'live' | 'sd_card' | 'interpolated',
        }));

        trackData.set(trackerId, {
          tracker_id: trackerId,
          points: enhancedPoints,
          start_time_ms: new Date(sortedPositions[0].timestamp).getTime(),
          end_time_ms: new Date(sortedPositions[sortedPositions.length - 1].timestamp).getTime(),
        });
      }

      // Build CUAS positions map
      const cuasPositions = new Map<string, { lat: number; lon: number }>();
      for (const placement of session.cuas_placements || []) {
        if (placement.position) {
          cuasPositions.set(placement.cuas_profile_id, {
            lat: placement.position.lat,
            lon: placement.position.lon,
          });
        }
      }

      // Run analysis
      let analysisResults;
      if (trackData.size > 0) {
        analysisResults = analyzeSession(session, trackData, cuasPositions);
      }

      // Extract jamming windows
      const jammingWindows = extractJammingWindows(session.events);

      // Build response
      const response = {
        session_id: session.id,
        session_name: session.name,
        status: session.status,
        tracker_count: trackData.size,
        total_points: sessionSummary?.totalPositions || 0,
        duration_seconds: sessionSummary?.duration_seconds || 0,
        jamming_windows: jammingWindows,
        total_jamming_time_s: jammingWindows.reduce((sum, w) => sum + w.duration_s, 0),
        events: session.events,
        trackers: [] as Array<{
          tracker_id: string;
          point_count: number;
          metrics: Record<string, unknown>;
          altitude_profile: Array<{ time_ms: number; alt_m: number }>;
          position_drift: Array<{ time_ms: number; drift_m: number }>;
          gps_quality_changes: Array<{ time_ms: number; quality: string }>;
        }>,
      };

      // Add per-tracker analysis
      if (analysisResults) {
        for (const [trackerId, result] of analysisResults) {
          response.trackers.push({
            tracker_id: trackerId,
            point_count: trackData.get(trackerId)?.points.length || 0,
            metrics: result.metrics as unknown as Record<string, unknown>,
            altitude_profile: result.altitude_profile,
            position_drift: result.position_drift,
            gps_quality_changes: result.gps_quality_changes,
          });
        }
      }

      // If no track data available, provide placeholder metrics for UI
      if (response.trackers.length === 0) {
        // Return minimal structure so UI doesn't break
        log.info(`No track data available for session ${req.params.id} analysis`);
      }

      res.json(response);
    } catch (error) {
      log.error('Analysis error:', error);
      res.status(500).json({ error: 'Failed to get analysis results' });
    }
  });

  // GET /api/test-sessions/:id/tracker-metrics - Get per-tracker CUAS effectiveness metrics
  router.get('/test-sessions/:id/tracker-metrics', (req, res) => {
    try {
      const session = getTestSessionById(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Test session not found' });
      }

      // Optional tracker_id filter
      const filterTrackerId = req.query.tracker_id as string | undefined;

      // Get recorded live data from session collector
      const positionsByTracker = sessionDataCollector.getPositionsByTracker(req.params.id);

      // Get GPS health tracker for fix loss events
      let gpsHealthTracker = null;
      try {
        gpsHealthTracker = getDashboardApp().stateManager.getGPSHealthTracker();
      } catch (e) {
        log.warn('Could not get GPS health tracker:', e);
      }

      // Build track data and fix loss events maps
      const trackDataMap = new Map<string, DroneTrackData>();
      const fixLossEventsMap = new Map<string, import('../../core/models').GPSFixLossEvent[]>();

      for (const [trackerId, positions] of positionsByTracker) {
        // Apply filter if specified
        if (filterTrackerId && trackerId !== filterTrackerId) continue;
        if (positions.length === 0) continue;

        // Sort by timestamp
        const sortedPositions = [...positions].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        // Convert to enhanced format
        const enhancedPoints = sortedPositions.map((p: TrackerPosition) => ({
          lat: p.latitude,
          lon: p.longitude,
          alt_m: p.altitude_m,
          baro_alt_m: null,
          timestamp_ms: new Date(p.timestamp).getTime(),
          hdop: null,
          satellites: null,
          speed_mps: p.speed_ms,
          course_deg: p.heading_deg,
          fix_valid: p.gps_quality !== 'poor',
          rssi_dbm: p.rssi_dbm ?? null,
          quality: (p.gps_quality === 'good' ? 'good' : p.gps_quality === 'degraded' ? 'degraded' : 'lost') as 'good' | 'degraded' | 'lost',
          source: 'live' as 'live' | 'sd_card' | 'interpolated',
        }));

        trackDataMap.set(trackerId, {
          tracker_id: trackerId,
          points: enhancedPoints,
          start_time_ms: new Date(sortedPositions[0].timestamp).getTime(),
          end_time_ms: new Date(sortedPositions[sortedPositions.length - 1].timestamp).getTime(),
        });

        // Get fix loss events for this tracker
        if (gpsHealthTracker) {
          const fixLossEvents = gpsHealthTracker.getFixLossEvents(trackerId);
          fixLossEventsMap.set(trackerId, fixLossEvents);
        }
      }

      // Calculate metrics for each tracker
      const trackerMetrics = [];
      for (const [trackerId, trackData] of trackDataMap) {
        const fixLossEvents = fixLossEventsMap.get(trackerId) ?? [];
        const metrics = calculateTrackerMetrics(
          trackerId,
          session.id,
          trackData,
          session.events,
          session.cuas_placements || [],
          fixLossEvents
        );
        trackerMetrics.push(metrics);
      }

      res.json({
        session_id: session.id,
        tracker_metrics: trackerMetrics,
      });
    } catch (error) {
      log.error('Tracker metrics error:', error);
      res.status(500).json({ error: 'Failed to get tracker metrics' });
    }
  });

  // ==========================================================================
  // Event Management
  // ==========================================================================

  // GET /api/test-sessions/:id/events - Get all events
  router.get('/test-sessions/:id/events', (req, res) => {
    try {
      const session = getTestSessionById(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Test session not found' });
      }

      // Optional type filter
      const type = req.query.type as string | undefined;
      let events = session.events;
      if (type) {
        events = events.filter(e => e.type === type);
      }

      // Sort by timestamp
      events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      res.json(events);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch events' });
    }
  });

  // POST /api/test-sessions/:id/events - Add event
  router.post('/test-sessions/:id/events', (req, res) => {
    try {
      const eventData = req.body as Omit<TestEvent, 'id'>;

      // Validate required fields
      if (!eventData.type || !eventData.timestamp || !eventData.source) {
        return res.status(400).json({ error: 'Missing required fields: type, timestamp, source' });
      }

      const session = addEventToSession(req.params.id, eventData);
      if (!session) {
        return res.status(404).json({ error: 'Test session not found' });
      }

      // Return the newly added event
      const newEvent = session.events[session.events.length - 1];
      res.status(201).json(newEvent);
    } catch (error) {
      res.status(500).json({ error: 'Failed to add event' });
    }
  });

  // DELETE /api/test-sessions/:id/events/:eventId - Remove event
  router.delete('/test-sessions/:id/events/:eventId', (req, res) => {
    try {
      const session = removeEventFromSession(req.params.id, req.params.eventId);
      if (!session) {
        return res.status(404).json({ error: 'Test session or event not found' });
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to remove event' });
    }
  });

  // ==========================================================================
  // Tracker Assignments
  // ==========================================================================

  // POST /api/test-sessions/:id/assign-tracker - Assign tracker to drone
  router.post('/test-sessions/:id/assign-tracker', (req, res) => {
    try {
      const { tracker_id, drone_profile_id, session_color, target_altitude_m, flight_plan } = req.body;

      if (!tracker_id || !drone_profile_id) {
        return res.status(400).json({ error: 'Missing required fields: tracker_id, drone_profile_id' });
      }

      const session = getTestSessionById(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Test session not found' });
      }

      // Check if tracker already assigned
      const existingAssignment = session.tracker_assignments.find(a => a.tracker_id === tracker_id);
      if (existingAssignment) {
        return res.status(400).json({ error: 'Tracker already assigned in this session' });
      }

      const assignment = {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        tracker_id,
        drone_profile_id,
        session_color: session_color || generateColor(session.tracker_assignments.length),
        target_altitude_m,
        flight_plan,
        assigned_at: new Date().toISOString(),
      };

      const updated = updateTestSession(req.params.id, {
        tracker_assignments: [...session.tracker_assignments, assignment],
      });

      res.status(201).json(assignment);
    } catch (error) {
      res.status(500).json({ error: 'Failed to assign tracker' });
    }
  });

  // DELETE /api/test-sessions/:id/assign-tracker/:assignmentId - Remove tracker assignment
  router.delete('/test-sessions/:id/assign-tracker/:assignmentId', (req, res) => {
    try {
      const session = getTestSessionById(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Test session not found' });
      }

      const updated = updateTestSession(req.params.id, {
        tracker_assignments: session.tracker_assignments.filter(a => a.id !== req.params.assignmentId),
      });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to remove tracker assignment' });
    }
  });

  // ==========================================================================
  // CUAS Placements
  // ==========================================================================

  // POST /api/test-sessions/:id/cuas-placement - Add CUAS placement
  router.post('/test-sessions/:id/cuas-placement', (req, res) => {
    try {
      const { cuas_profile_id, position, height_agl_m, orientation_deg, elevation_deg, notes } = req.body;

      if (!cuas_profile_id || !position || typeof height_agl_m !== 'number' || typeof orientation_deg !== 'number') {
        return res.status(400).json({
          error: 'Missing required fields: cuas_profile_id, position, height_agl_m, orientation_deg',
        });
      }

      const session = getTestSessionById(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Test session not found' });
      }

      const placement = {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        cuas_profile_id,
        position,
        height_agl_m,
        orientation_deg,
        elevation_deg,
        active: true,
        notes,
      };

      const updated = updateTestSession(req.params.id, {
        cuas_placements: [...session.cuas_placements, placement],
      });

      res.status(201).json(placement);
    } catch (error) {
      res.status(500).json({ error: 'Failed to add CUAS placement' });
    }
  });

  // PUT /api/test-sessions/:id/cuas-placement/:placementId - Update CUAS placement
  router.put('/test-sessions/:id/cuas-placement/:placementId', (req, res) => {
    try {
      const session = getTestSessionById(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Test session not found' });
      }

      const placementIndex = session.cuas_placements.findIndex(p => p.id === req.params.placementId);
      if (placementIndex === -1) {
        return res.status(404).json({ error: 'CUAS placement not found' });
      }

      const updatedPlacements = [...session.cuas_placements];
      updatedPlacements[placementIndex] = {
        ...updatedPlacements[placementIndex],
        ...req.body,
        id: req.params.placementId, // Prevent ID change
      };

      const updated = updateTestSession(req.params.id, {
        cuas_placements: updatedPlacements,
      });

      res.json(updatedPlacements[placementIndex]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update CUAS placement' });
    }
  });

  // DELETE /api/test-sessions/:id/cuas-placement/:placementId - Remove CUAS placement
  router.delete('/test-sessions/:id/cuas-placement/:placementId', (req, res) => {
    try {
      const session = getTestSessionById(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Test session not found' });
      }

      const updated = updateTestSession(req.params.id, {
        cuas_placements: session.cuas_placements.filter(p => p.id !== req.params.placementId),
      });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to remove CUAS placement' });
    }
  });

  // GET /api/test-sessions/:id/raw-telemetry — Full telemetry for analysis table
  router.get('/test-sessions/:id/raw-telemetry', (req, res) => {
    try {
      const sessionId = req.params.id;
      const session = getTestSessionById(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Test session not found' });
      }

      // Try in-memory data first (active sessions)
      const positionsByTracker = sessionDataCollector.getPositionsByTracker(sessionId);
      const allPositions: any[] = [];

      for (const [trackerId, positions] of positionsByTracker) {
        for (const p of positions) {
          const tsMs = new Date(p.timestamp).getTime();
          allPositions.push({
            id: `${trackerId}_${tsMs}`,
            tracker_id: trackerId,
            timestamp: p.timestamp,
            timestamp_ms: tsMs,
            time_gps: null,
            lat: p.latitude,
            lon: p.longitude,
            alt_m: p.altitude_m,
            speed_mps: p.speed_ms,
            course_deg: p.heading_deg,
            hdop: p.hdop ?? null,
            satellites: p.satellites ?? null,
            rssi_dbm: p.rssi_dbm ?? null,
            baro_alt_m: null,
            baro_temp_c: null,
            baro_press_hpa: null,
            fix_valid: p.fix_valid ?? (p.gps_quality !== 'poor'),
            battery_mv: p.battery_mv ?? null,
            latency_ms: null,
            gps_quality: p.gps_quality,
          });
        }
      }

      // Fallback: read CSV files from disk for completed sessions
      if (allPositions.length === 0 && session.live_data_path && fs.existsSync(session.live_data_path)) {
        const csvFiles = fs.readdirSync(session.live_data_path).filter(f => f.startsWith('tracker_') && f.endsWith('.csv'));
        for (const csvFile of csvFiles) {
          const csvPath = path.join(session.live_data_path, csvFile);
          const content = fs.readFileSync(csvPath, 'utf-8');
          const lines = content.trim().split('\n');
          if (lines.length < 2) continue;

          const headers = lines[0].split(',');
          for (let i = 1; i < lines.length; i++) {
            try {
              const vals = lines[i].split(',');
              const row: Record<string, string> = {};
              headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });

              const timestamp = row.time_local_received || '';
              const tsMs = timestamp ? new Date(timestamp).getTime() : 0;
              const trackerId = row.tracker_id || '';

              allPositions.push({
                id: `${trackerId}_${tsMs}`,
                tracker_id: trackerId,
                timestamp,
                timestamp_ms: tsMs,
                time_gps: row.time_gps || null,
                lat: row.lat ? parseFloat(row.lat) : null,
                lon: row.lon ? parseFloat(row.lon) : null,
                alt_m: row.alt_m ? parseFloat(row.alt_m) : null,
                speed_mps: row.speed_mps ? parseFloat(row.speed_mps) : null,
                course_deg: row.course_deg ? parseFloat(row.course_deg) : null,
                hdop: row.hdop ? parseFloat(row.hdop) : null,
                satellites: row.satellites ? parseInt(row.satellites, 10) : null,
                rssi_dbm: row.rssi_dbm ? parseFloat(row.rssi_dbm) : null,
                baro_alt_m: row.baro_alt_m ? parseFloat(row.baro_alt_m) : null,
                baro_temp_c: row.baro_temp_c ? parseFloat(row.baro_temp_c) : null,
                baro_press_hpa: row.baro_press_hpa ? parseFloat(row.baro_press_hpa) : null,
                fix_valid: row.fix_valid === 'true',
                battery_mv: row.battery_mv ? parseInt(row.battery_mv, 10) : null,
                latency_ms: row.latency_ms ? parseInt(row.latency_ms, 10) : null,
                gps_quality: null,
              });
            } catch (rowErr) {
              console.warn(`Skipping malformed CSV row ${i} in ${csvFile}:`, rowErr);
            }
          }
        }
      }

      // Sort by timestamp
      allPositions.sort((a, b) => a.timestamp_ms - b.timestamp_ms);

      res.json({
        session_id: sessionId,
        session_name: session.name,
        total_count: allPositions.length,
        positions: allPositions,
        engagements: session.engagements ?? [],
        events: session.events ?? [],
      });
    } catch (error) {
      log.error('Failed to get raw telemetry:', error);
      res.status(500).json({ error: 'Failed to get raw telemetry' });
    }
  });

  return router;
}

// Helper function to generate distinct colors for drones
function generateColor(index: number): string {
  const colors = [
    '#ff6b00', // Orange (primary)
    '#00c8b4', // Cyan
    '#6366f1', // Indigo
    '#a855f7', // Purple
    '#22c55e', // Green
    '#f59e0b', // Amber
    '#ef4444', // Red
    '#3b82f6', // Blue
  ];
  return colors[index % colors.length];
}
