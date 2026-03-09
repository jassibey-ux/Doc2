/**
 * AI Analysis Module
 * Prepares session data for Claude analysis and processes responses.
 * Pure post-processing layer — never recomputes metrics, only interprets them.
 */

import log from 'electron-log';
import {
  TestSession,
  Engagement,
  EngagementMetrics,
  SessionMetrics,
  CUASProfile,
  DroneProfile,
  SiteDefinition,
  AIAnalysisResult,
  AIEngagementFinding,
} from './models/workflow';
import { loadConfig } from './config';

// =============================================================================
// Payload Preparation
// =============================================================================

interface AnalysisPayloadRun {
  run_number: number;
  engagement_id: string;
  cuas_name?: string;
  target_tracker_ids: string[];
  target_drone_names: string[];
  metrics: EngagementMetrics;
  bearing_deg?: number;
  angle_off_boresight_deg?: number;
  denial_consistency_pct?: number;
  engagement_duration_s?: number;
}

interface AnalysisPayload {
  session_name: string;
  site_name?: string;
  environment_type?: string;
  cuas_systems: Array<{
    name: string;
    vendor: string;
    type: string;
    claimed_range_m: number;
    antenna_pattern?: string;
    capabilities: string[];
    orientation_deg?: number;
  }>;
  drones: Array<{
    name: string;
    make: string;
    model: string;
    expected_failsafe: string;
    weight_class: string;
  }>;
  session_metrics: SessionMetrics;
  runs: AnalysisPayloadRun[];
  operator_notes?: string;
  weather_notes?: string;
}

/**
 * Build analysis payload from existing computed data.
 * Maps from already-computed EngagementMetrics + SessionMetrics.
 */
export function prepareAnalysisPayload(
  session: TestSession,
  site?: SiteDefinition,
  cuasProfiles?: Map<string, CUASProfile>,
  droneProfiles?: Map<string, DroneProfile>,
): AnalysisPayload {
  // Build CUAS systems array
  const cuasSystems = (session.cuas_placements || []).map(placement => {
    const profile = cuasProfiles?.get(placement.cuas_profile_id);
    return {
      name: profile?.name || placement.cuas_profile_id,
      vendor: profile?.vendor || 'Unknown',
      type: profile?.type || 'jammer',
      claimed_range_m: profile?.effective_range_m || 0,
      antenna_pattern: profile?.antenna_pattern,
      capabilities: profile?.capabilities || [],
      orientation_deg: placement.orientation_deg,
    };
  });

  // Build drones array
  const drones = (session.tracker_assignments || []).map(assignment => {
    const profile = droneProfiles?.get(assignment.drone_profile_id);
    return {
      name: profile?.name || assignment.drone_profile_id,
      make: profile?.make || 'Unknown',
      model: profile?.model || 'Unknown',
      expected_failsafe: profile?.expected_failsafe || 'unknown',
      weight_class: profile?.weight_class || 'unknown',
    };
  });

  // Build runs from engagements
  const runs: AnalysisPayloadRun[] = (session.engagements || [])
    .filter(e => e.status === 'complete' && e.metrics)
    .map(engagement => ({
      run_number: engagement.run_number || 0,
      engagement_id: engagement.id,
      cuas_name: engagement.cuas_name,
      target_tracker_ids: (engagement.targets || []).map(t => t.tracker_id),
      target_drone_names: (engagement.targets || []).map(t => {
        const assignment = session.tracker_assignments.find(a => a.tracker_id === t.tracker_id);
        const profile = assignment ? droneProfiles?.get(assignment.drone_profile_id) : undefined;
        return profile?.name || t.tracker_id;
      }),
      metrics: engagement.metrics!,
      bearing_deg: engagement.metrics?.denial_bearing_deg,
      angle_off_boresight_deg: engagement.metrics?.denial_angle_off_boresight_deg,
      denial_consistency_pct: engagement.metrics?.denial_consistency_pct,
      engagement_duration_s: engagement.metrics?.denial_duration_s,
    }));

  return {
    session_name: session.name,
    site_name: site?.name,
    environment_type: site?.environment_type,
    cuas_systems: cuasSystems,
    drones,
    session_metrics: session.metrics || {
      total_flight_time_s: 0,
      time_under_jamming_s: 0,
      failsafe_triggered: false,
    },
    runs,
    operator_notes: session.post_test_notes,
    weather_notes: session.weather_notes,
  };
}

// =============================================================================
// System Prompt
// =============================================================================

export function buildSystemPrompt(): string {
  return `You are a CUAS (Counter-Unmanned Aircraft System) effectiveness analyst. You analyze GPS denial test session data to assess jammer performance, drone behavior, and operational effectiveness.

You receive pre-computed metrics from deterministic analysis — do NOT recompute numbers. Your role is to INTERPRET what the numbers mean operationally.

Your analysis must be structured as JSON with these fields:
- executive_summary: 2-4 sentence overview of the session results. Lead with the operational conclusion.
- per_engagement: Array of findings per engagement run, each with:
  - engagement_id: ID of the engagement
  - run_number: Run number
  - finding: 1-2 sentence key finding for this engagement
  - detail: 2-4 sentence detailed explanation
  - pass_fail_reasoning: Why this engagement passed/failed/was inconclusive, considering context
  - anomalies: Array of any anomalies noted (empty array if none)
- cross_engagement_analysis: If multiple engagements, 2-4 sentences comparing across runs. Look for patterns: range vs bearing correlation, consistency, degradation over time. Omit if only 1 engagement.
- operational_assessment: Object with:
  - strengths: Array of operational strengths observed
  - weaknesses: Array of operational weaknesses or gaps
  - coverage_gaps: Array of coverage gaps identified (bearings, altitudes, ranges with no effect)
  - placement_recommendations: Array of actionable placement/orientation suggestions
- drone_behavior_analysis: 2-3 sentences on how the drone(s) responded to denial. Did failsafes trigger? Was behavior consistent with expected failsafe? Any unexpected behavior?
- data_quality_notes: Array of any data quality concerns (missing data, inconsistencies, sensor issues). Empty array if data looks clean.
- recommended_followup: Array of suggested next tests or investigations.

Key interpretation guidelines:
- Time to effect <5s is excellent, <15s is good, >30s is concerning
- Recovery time >10s suggests sustained denial effectiveness
- Lateral drift >50m during denial indicates the drone lost navigation
- If angle off boresight >45°, reduced range is EXPECTED for directional systems — score relative to the antenna pattern
- Denial consistency >80% indicates reliable denial, <50% indicates intermittent effect
- If claimed range is known, compare effective range as a percentage
- If failsafe was expected but didn't trigger, this is a significant finding
- If multiple engagements show decreasing range over time, consider antenna heating or environmental changes

Respond ONLY with valid JSON. No markdown, no code blocks, no explanation outside the JSON.`;
}

// =============================================================================
// Claude API Call
// =============================================================================

/**
 * Send analysis payload to Claude and parse the structured response.
 */
export async function analyzeSession(
  session: TestSession,
  site?: SiteDefinition,
  cuasProfiles?: Map<string, CUASProfile>,
  droneProfiles?: Map<string, DroneProfile>,
): Promise<AIAnalysisResult> {
  const config = loadConfig();
  const apiKey = config.anthropic_api_key;
  if (!apiKey) {
    throw new Error('Anthropic API key not configured');
  }

  const model = config.anthropic_model || 'claude-sonnet-4-latest';
  const payload = prepareAnalysisPayload(session, site, cuasProfiles, droneProfiles);

  log.info(`[AI Analysis] Analyzing session ${session.id} with model ${model}`);
  log.info(`[AI Analysis] Payload: ${payload.runs.length} engagements, ${payload.drones.length} drones`);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: buildSystemPrompt(),
      messages: [
        {
          role: 'user',
          content: `Analyze this CUAS test session:\n\n${JSON.stringify(payload, null, 2)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    log.error(`[AI Analysis] API error ${response.status}: ${errorBody}`);
    throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
  }

  const result: any = await response.json();

  const textContent = result.content?.find((c: any) => c.type === 'text');
  if (!textContent?.text) {
    throw new Error('No text content in Claude response');
  }

  const inputTokens = result.usage?.input_tokens || 0;
  const outputTokens = result.usage?.output_tokens || 0;

  log.info(`[AI Analysis] Response received: ${inputTokens} input, ${outputTokens} output tokens`);

  // Parse the structured JSON response
  let parsed: any;
  try {
    parsed = JSON.parse(textContent.text);
  } catch {
    log.warn('[AI Analysis] Failed to parse JSON response, returning raw text');
    // Return a minimal result with raw text as executive summary
    return {
      executive_summary: textContent.text,
      per_engagement: [],
      operational_assessment: { strengths: [], weaknesses: [] },
      model,
      analyzed_at: new Date().toISOString(),
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    };
  }

  return {
    executive_summary: parsed.executive_summary || '',
    per_engagement: (parsed.per_engagement || []).map((e: any) => ({
      engagement_id: e.engagement_id || '',
      run_number: e.run_number,
      finding: e.finding || '',
      detail: e.detail || '',
      pass_fail_reasoning: e.pass_fail_reasoning,
      anomalies: e.anomalies || [],
    })),
    cross_engagement_analysis: parsed.cross_engagement_analysis,
    operational_assessment: {
      strengths: parsed.operational_assessment?.strengths || [],
      weaknesses: parsed.operational_assessment?.weaknesses || [],
      coverage_gaps: parsed.operational_assessment?.coverage_gaps,
      placement_recommendations: parsed.operational_assessment?.placement_recommendations,
    },
    drone_behavior_analysis: parsed.drone_behavior_analysis,
    data_quality_notes: parsed.data_quality_notes || [],
    recommended_followup: parsed.recommended_followup || [],
    model,
    analyzed_at: new Date().toISOString(),
    input_tokens: inputTokens,
    output_tokens: outputTokens,
  };
}

// =============================================================================
// Per-Engagement Quick Insight
// =============================================================================

/**
 * Generate a quick AI insight for a single completed engagement.
 * Lightweight call (~500 tokens in, ~200 tokens out).
 */
export async function analyzeEngagementInsight(
  engagement: Engagement,
  cuasProfile?: CUASProfile,
  droneProfile?: DroneProfile,
): Promise<{ insight: string; input_tokens: number; output_tokens: number }> {
  const config = loadConfig();
  const apiKey = config.anthropic_api_key;
  if (!apiKey) {
    throw new Error('Anthropic API key not configured');
  }

  const model = config.anthropic_model || 'claude-sonnet-4-latest';
  const metrics = engagement.metrics;
  if (!metrics) {
    throw new Error('Engagement has no metrics');
  }

  const prompt = `Provide a 1-2 sentence operational assessment of this CUAS engagement result. Be specific and quantitative.

Engagement: Run #${engagement.run_number || '?'}
CUAS: ${cuasProfile?.name || engagement.cuas_name || 'Unknown'} (${cuasProfile?.type || 'jammer'}, claimed range: ${cuasProfile?.effective_range_m || '?'}m)
Drone: ${droneProfile?.name || 'Unknown'} (expected failsafe: ${droneProfile?.expected_failsafe || '?'})
Time to effect: ${metrics.time_to_effect_s != null ? `${metrics.time_to_effect_s}s` : 'N/A'}
Effective range: ${metrics.effective_range_m != null ? `${metrics.effective_range_m}m` : 'N/A'}
Denial consistency: ${metrics.denial_consistency_pct != null ? `${metrics.denial_consistency_pct}%` : 'N/A'}
Bearing: ${metrics.denial_bearing_deg != null ? `${metrics.denial_bearing_deg}°` : 'N/A'}
Angle off boresight: ${metrics.denial_angle_off_boresight_deg != null ? `${metrics.denial_angle_off_boresight_deg}°` : 'N/A'}
Max drift: ${metrics.max_drift_m != null ? `${metrics.max_drift_m}m` : 'N/A'}
Failsafe: ${metrics.failsafe_triggered ? `triggered (${metrics.failsafe_type || 'unknown'})` : 'not triggered'}
Result: ${metrics.pass_fail || 'unknown'}

Respond with ONLY the 1-2 sentence assessment. No JSON, no markdown.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const result: any = await response.json();
  const textContent = result.content?.find((c: any) => c.type === 'text');

  return {
    insight: textContent?.text || 'Analysis unavailable.',
    input_tokens: result.usage?.input_tokens || 0,
    output_tokens: result.usage?.output_tokens || 0,
  };
}

// =============================================================================
// Follow-Up Query
// =============================================================================

export interface FollowUpMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Send a follow-up question about the session with conversation history.
 */
export async function followUpQuery(
  session: TestSession,
  previousAnalysis: AIAnalysisResult,
  conversationHistory: FollowUpMessage[],
  question: string,
  site?: SiteDefinition,
  cuasProfiles?: Map<string, CUASProfile>,
  droneProfiles?: Map<string, DroneProfile>,
): Promise<{ answer: string; input_tokens: number; output_tokens: number }> {
  const config = loadConfig();
  const apiKey = config.anthropic_api_key;
  if (!apiKey) {
    throw new Error('Anthropic API key not configured');
  }

  const model = config.anthropic_model || 'claude-sonnet-4-latest';
  const payload = prepareAnalysisPayload(session, site, cuasProfiles, droneProfiles);

  const systemPrompt = `You are a CUAS effectiveness analyst having a follow-up conversation about a test session analysis. The session data and your previous analysis are provided for context. Answer questions concisely and specifically. Reference specific metrics and engagement numbers where relevant.`;

  // Build message history
  const messages: Array<{ role: string; content: string }> = [
    {
      role: 'user',
      content: `Session data:\n${JSON.stringify(payload, null, 2)}\n\nPrevious analysis:\n${JSON.stringify(previousAnalysis, null, 2)}`,
    },
    {
      role: 'assistant',
      content: 'I\'ve reviewed the session data and my previous analysis. What would you like to know?',
    },
    ...conversationHistory.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: question },
  ];

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: systemPrompt,
      messages,
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const result: any = await response.json();
  const textContent = result.content?.find((c: any) => c.type === 'text');

  return {
    answer: textContent?.text || 'Unable to generate response.',
    input_tokens: result.usage?.input_tokens || 0,
    output_tokens: result.usage?.output_tokens || 0,
  };
}

// =============================================================================
// Test Connection
// =============================================================================

export async function testConnection(
  apiKey: string,
  model: string = 'claude-sonnet-4-latest',
): Promise<{ success: boolean; model: string; error?: string }> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 16,
        messages: [{ role: 'user', content: 'Reply with "ok"' }],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return { success: false, model, error: `${response.status}: ${body.slice(0, 200)}` };
    }

    return { success: true, model };
  } catch (err: any) {
    return { success: false, model, error: err.message };
  }
}
