/**
 * AI Analysis API Routes
 * Endpoints for Claude-powered session analysis
 */

import { Router, Request, Response } from 'express';
import log from 'electron-log';
import {
  getTestSessionById,
  updateTestSession,
  getSiteById,
  getCUASProfiles,
  getDroneProfiles,
} from '../../core/library-store';
import {
  analyzeSession,
  analyzeEngagementInsight,
  followUpQuery,
  testConnection,
  FollowUpMessage,
} from '../../core/ai-analysis';
import { loadConfig } from '../../core/config';
import { CUASProfile, DroneProfile } from '../../core/models/workflow';

export function aiAnalysisRoutes(): Router {
  const router = Router();

  // POST /api/ai-analysis/test-connection
  router.post('/ai-analysis/test-connection', async (req: Request, res: Response) => {
    try {
      const { api_key, model } = req.body;
      const key = api_key || loadConfig().anthropic_api_key;
      if (!key) {
        res.status(400).json({ success: false, error: 'No API key provided' });
        return;
      }
      const result = await testConnection(key, model || 'claude-sonnet-4-latest');
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/test-sessions/:id/ai-analysis — Full session analysis
  router.post('/test-sessions/:id/ai-analysis', async (req: Request, res: Response) => {
    try {
      const session = getTestSessionById(req.params.id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      if (!session.analysis_completed || !session.metrics) {
        res.status(400).json({ error: 'Run standard analysis first' });
        return;
      }

      const config = loadConfig();
      if (!config.anthropic_api_key) {
        res.status(400).json({ error: 'Anthropic API key not configured' });
        return;
      }

      // Load related data
      const site = session.site_id ? getSiteById(session.site_id) : undefined;

      const cuasProfilesList = getCUASProfiles();
      const cuasProfiles = new Map<string, CUASProfile>();
      for (const p of cuasProfilesList) {
        cuasProfiles.set(p.id, p);
      }

      const droneProfilesList = getDroneProfiles();
      const droneProfiles = new Map<string, DroneProfile>();
      for (const p of droneProfilesList) {
        droneProfiles.set(p.id, p);
      }

      // Run analysis
      const analysis = await analyzeSession(
        session,
        site || undefined,
        cuasProfiles,
        droneProfiles,
      );

      // Persist result
      updateTestSession(session.id, { ai_analysis: analysis });

      res.json({
        success: true,
        analysis,
      });
    } catch (err: any) {
      log.error(`[AI Analysis Route] Session analysis failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/test-sessions/:id/ai-analysis — Retrieve stored analysis
  router.get('/test-sessions/:id/ai-analysis', (req: Request, res: Response) => {
    const session = getTestSessionById(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (!session.ai_analysis) {
      res.status(404).json({ error: 'No AI analysis available' });
      return;
    }

    res.json({ analysis: session.ai_analysis });
  });

  // POST /api/engagements/:sessionId/:engagementId/ai-insight — Per-engagement insight
  router.post('/engagements/:sessionId/:engagementId/ai-insight', async (req: Request, res: Response) => {
    try {
      const session = getTestSessionById(req.params.sessionId);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      const engagement = session.engagements?.find(e => e.id === req.params.engagementId);
      if (!engagement) {
        res.status(404).json({ error: 'Engagement not found' });
        return;
      }

      if (!engagement.metrics) {
        res.status(400).json({ error: 'Engagement has no metrics' });
        return;
      }

      // Resolve profiles
      const cuasProfilesList = getCUASProfiles();
      const cuasProfile = engagement.cuas_placement_id
        ? (() => {
            const placement = session.cuas_placements.find(p => p.id === engagement.cuas_placement_id);
            return placement ? cuasProfilesList.find(p => p.id === placement.cuas_profile_id) : undefined;
          })()
        : undefined;

      const droneProfilesList = getDroneProfiles();
      const firstTarget = engagement.targets?.[0];
      const assignment = firstTarget
        ? session.tracker_assignments.find(a => a.tracker_id === firstTarget.tracker_id)
        : undefined;
      const droneProfile = assignment
        ? droneProfilesList.find(p => p.id === assignment.drone_profile_id)
        : undefined;

      const result = await analyzeEngagementInsight(engagement, cuasProfile, droneProfile);

      // Store insight on engagement
      const engagements = session.engagements || [];
      const idx = engagements.findIndex(e => e.id === engagement.id);
      if (idx >= 0) {
        engagements[idx].ai_insight = result.insight;
        updateTestSession(session.id, { engagements });
      }

      res.json({
        success: true,
        insight: result.insight,
        input_tokens: result.input_tokens,
        output_tokens: result.output_tokens,
      });
    } catch (err: any) {
      log.error(`[AI Analysis Route] Engagement insight failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/test-sessions/:id/ai-followup — Follow-up question
  router.post('/test-sessions/:id/ai-followup', async (req: Request, res: Response) => {
    try {
      const session = getTestSessionById(req.params.id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      if (!session.ai_analysis) {
        res.status(400).json({ error: 'Run AI analysis first' });
        return;
      }

      const { question, conversation_history } = req.body;
      if (!question) {
        res.status(400).json({ error: 'Question is required' });
        return;
      }

      const site = session.site_id ? getSiteById(session.site_id) : undefined;

      const cuasProfilesList = getCUASProfiles();
      const cuasProfiles = new Map<string, CUASProfile>();
      for (const p of cuasProfilesList) {
        cuasProfiles.set(p.id, p);
      }

      const droneProfilesList = getDroneProfiles();
      const droneProfiles = new Map<string, DroneProfile>();
      for (const p of droneProfilesList) {
        droneProfiles.set(p.id, p);
      }

      const result = await followUpQuery(
        session,
        session.ai_analysis,
        (conversation_history || []) as FollowUpMessage[],
        question,
        site || undefined,
        cuasProfiles,
        droneProfiles,
      );

      res.json({
        success: true,
        answer: result.answer,
        input_tokens: result.input_tokens,
        output_tokens: result.output_tokens,
      });
    } catch (err: any) {
      log.error(`[AI Analysis Route] Follow-up failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
