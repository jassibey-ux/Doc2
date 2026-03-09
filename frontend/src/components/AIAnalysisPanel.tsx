/**
 * AIAnalysisPanel
 * Displays Claude-powered analysis results for a test session.
 * Structured: exec summary, per-engagement, cross-engagement,
 * operational assessment, drone behavior, data quality, follow-up.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Brain,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Shield,
  Target,
  MessageSquare,
  Loader2,
  RefreshCw,
  Send,
  Info,
} from 'lucide-react';
import { GlassPanel, GlassCard, GlassButton, Badge } from './ui/GlassUI';

interface AIEngagementFinding {
  engagement_id: string;
  run_number?: number;
  finding: string;
  detail: string;
  pass_fail_reasoning?: string;
  anomalies?: string[];
}

interface AIAnalysisResult {
  executive_summary: string;
  per_engagement: AIEngagementFinding[];
  cross_engagement_analysis?: string;
  operational_assessment: {
    strengths: string[];
    weaknesses: string[];
    coverage_gaps?: string[];
    placement_recommendations?: string[];
  };
  drone_behavior_analysis?: string;
  data_quality_notes?: string[];
  recommended_followup?: string[];
  model: string;
  analyzed_at: string;
  input_tokens: number;
  output_tokens: number;
}

interface AIAnalysisPanelProps {
  sessionId: string;
  analysis: AIAnalysisResult | null;
  onAnalyze: () => void;
  isAnalyzing: boolean;
  analysisEnabled: boolean;
  metricsReady: boolean;
}

export default function AIAnalysisPanel({
  sessionId,
  analysis,
  onAnalyze,
  isAnalyzing,
  analysisEnabled,
  metricsReady,
}: AIAnalysisPanelProps) {
  const [expandedEngagement, setExpandedEngagement] = useState<string | null>(null);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [followUpInput, setFollowUpInput] = useState('');
  const [followUpHistory, setFollowUpHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [consentShown, setConsentShown] = useState(false);

  // Check for consent
  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(cfg => {
        if (!cfg.ai_analysis_consent && !analysis) {
          setConsentShown(true);
        }
      })
      .catch(() => {});
  }, [analysis]);

  const handleConsent = async () => {
    await fetch('/api/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ai_analysis_consent: true }),
    });
    setConsentShown(false);
    onAnalyze();
  };

  const handleFollowUp = useCallback(async () => {
    if (!followUpInput.trim() || followUpLoading) return;

    const question = followUpInput.trim();
    setFollowUpInput('');
    setFollowUpHistory(prev => [...prev, { role: 'user', content: question }]);
    setFollowUpLoading(true);

    try {
      const resp = await fetch(`/api/test-sessions/${sessionId}/ai-followup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          conversation_history: followUpHistory,
        }),
      });
      const data = await resp.json();
      if (data.answer) {
        setFollowUpHistory(prev => [...prev, { role: 'assistant', content: data.answer }]);
      }
    } catch {
      setFollowUpHistory(prev => [...prev, { role: 'assistant', content: 'Failed to get response.' }]);
    } finally {
      setFollowUpLoading(false);
    }
  }, [followUpInput, followUpLoading, followUpHistory, sessionId]);

  // Not configured / not ready states
  if (!analysisEnabled) {
    return (
      <GlassPanel style={{ padding: '24px', textAlign: 'center' }}>
        <Brain size={32} style={{ color: 'rgba(255,255,255,0.3)', marginBottom: '12px' }} />
        <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>AI Analysis Not Available</div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
          Configure your Anthropic API key in Settings to enable AI-powered analysis.
        </div>
      </GlassPanel>
    );
  }

  if (!metricsReady) {
    return (
      <GlassPanel style={{ padding: '24px', textAlign: 'center' }}>
        <Brain size={32} style={{ color: 'rgba(255,255,255,0.3)', marginBottom: '12px' }} />
        <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>Run Analysis First</div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
          Standard metrics must be computed before AI analysis can run.
        </div>
      </GlassPanel>
    );
  }

  // Consent dialog
  if (consentShown && !analysis) {
    return (
      <GlassPanel style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Info size={18} style={{ color: '#06b6d4' }} />
          <span style={{ fontSize: '14px', fontWeight: 600 }}>Data Sharing Consent</span>
        </div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, marginBottom: '16px' }}>
          AI analysis sends session metrics (not raw telemetry) to Anthropic's Claude API for interpretation.
          This includes CUAS specifications, GPS coordinates, and effectiveness metrics.
          Data is processed per Anthropic's data usage policy and is not used for model training.
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <GlassButton variant="primary" size="md" onClick={handleConsent}>
            <Brain size={14} />
            Enable & Analyze
          </GlassButton>
          <GlassButton variant="ghost" size="md" onClick={() => setConsentShown(false)}>
            Cancel
          </GlassButton>
        </div>
      </GlassPanel>
    );
  }

  // No analysis yet — show trigger button
  if (!analysis) {
    return (
      <GlassPanel style={{ padding: '24px', textAlign: 'center' }}>
        <Brain size={32} style={{ color: '#06b6d4', marginBottom: '12px' }} />
        <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>AI-Powered Analysis</div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '16px' }}>
          Get operational insights, failsafe analysis, and placement recommendations powered by Claude.
        </div>
        <GlassButton
          variant="primary"
          size="lg"
          onClick={onAnalyze}
          disabled={isAnalyzing}
          style={{ width: '100%' }}
        >
          {isAnalyzing ? (
            <>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              Analyzing Session...
            </>
          ) : (
            <>
              <Brain size={16} />
              Run AI Analysis
            </>
          )}
        </GlassButton>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </GlassPanel>
    );
  }

  // Analysis results
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Executive Summary */}
      <GlassPanel style={{ padding: '16px', borderLeft: '3px solid #06b6d4' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <Brain size={16} style={{ color: '#06b6d4' }} />
          <span style={{ fontSize: '13px', fontWeight: 600 }}>Executive Summary</span>
          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginLeft: 'auto' }}>
            {analysis.model} | {new Date(analysis.analyzed_at).toLocaleString()}
          </span>
        </div>
        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.85)', lineHeight: 1.6 }}>
          {analysis.executive_summary}
        </div>
      </GlassPanel>

      {/* Per-Engagement Findings */}
      {analysis.per_engagement.length > 0 && (
        <GlassPanel style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <Target size={16} style={{ color: '#f59e0b' }} />
            <span style={{ fontSize: '13px', fontWeight: 600 }}>Per-Engagement Findings</span>
            <Badge color="blue" size="sm">{analysis.per_engagement.length}</Badge>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {analysis.per_engagement.map((eng) => {
              const isExpanded = expandedEngagement === eng.engagement_id;
              return (
                <GlassCard
                  key={eng.engagement_id}
                  style={{ padding: '10px', cursor: 'pointer' }}
                  onClick={() => setExpandedEngagement(isExpanded ? null : eng.engagement_id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span style={{ fontSize: '11px', color: '#06b6d4', fontWeight: 600 }}>
                      Run #{eng.run_number || '?'}
                    </span>
                    <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)', flex: 1 }}>
                      {eng.finding}
                    </span>
                  </div>
                  {isExpanded && (
                    <div style={{ marginTop: '10px', paddingLeft: '22px' }}>
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, marginBottom: '8px' }}>
                        {eng.detail}
                      </div>
                      {eng.pass_fail_reasoning && (
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px' }}>
                          <strong>Pass/Fail Reasoning:</strong> {eng.pass_fail_reasoning}
                        </div>
                      )}
                      {eng.anomalies && eng.anomalies.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          {eng.anomalies.map((a, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#eab308' }}>
                              <AlertTriangle size={10} />
                              {a}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </GlassCard>
              );
            })}
          </div>
        </GlassPanel>
      )}

      {/* Cross-Engagement Analysis */}
      {analysis.cross_engagement_analysis && (
        <GlassPanel style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <Target size={16} style={{ color: '#8b5cf6' }} />
            <span style={{ fontSize: '13px', fontWeight: 600 }}>Cross-Engagement Analysis</span>
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>
            {analysis.cross_engagement_analysis}
          </div>
        </GlassPanel>
      )}

      {/* Operational Assessment */}
      <GlassPanel style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <Shield size={16} style={{ color: '#22c55e' }} />
          <span style={{ fontSize: '13px', fontWeight: 600 }}>Operational Assessment</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {/* Strengths */}
          <div>
            <div style={{ fontSize: '11px', color: '#22c55e', fontWeight: 600, marginBottom: '6px' }}>STRENGTHS</div>
            {analysis.operational_assessment.strengths.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginBottom: '4px' }}>
                <CheckCircle2 size={12} style={{ color: '#22c55e', flexShrink: 0, marginTop: '2px' }} />
                {s}
              </div>
            ))}
          </div>
          {/* Weaknesses */}
          <div>
            <div style={{ fontSize: '11px', color: '#ef4444', fontWeight: 600, marginBottom: '6px' }}>WEAKNESSES</div>
            {analysis.operational_assessment.weaknesses.map((w, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginBottom: '4px' }}>
                <XCircle size={12} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
                {w}
              </div>
            ))}
          </div>
        </div>

        {/* Coverage Gaps */}
        {analysis.operational_assessment.coverage_gaps && analysis.operational_assessment.coverage_gaps.length > 0 && (
          <div style={{ marginTop: '12px' }}>
            <div style={{ fontSize: '11px', color: '#eab308', fontWeight: 600, marginBottom: '6px' }}>COVERAGE GAPS</div>
            {analysis.operational_assessment.coverage_gaps.map((g, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginBottom: '4px' }}>
                <AlertTriangle size={12} style={{ color: '#eab308', flexShrink: 0, marginTop: '2px' }} />
                {g}
              </div>
            ))}
          </div>
        )}

        {/* Placement Recommendations */}
        {analysis.operational_assessment.placement_recommendations && analysis.operational_assessment.placement_recommendations.length > 0 && (
          <div style={{ marginTop: '12px' }}>
            <div style={{ fontSize: '11px', color: '#06b6d4', fontWeight: 600, marginBottom: '6px' }}>PLACEMENT RECOMMENDATIONS</div>
            {analysis.operational_assessment.placement_recommendations.map((r, i) => (
              <div key={i} style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginBottom: '4px', paddingLeft: '18px', position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0, color: '#06b6d4' }}>{i + 1}.</span>
                {r}
              </div>
            ))}
          </div>
        )}
      </GlassPanel>

      {/* Drone Behavior */}
      {analysis.drone_behavior_analysis && (
        <GlassPanel style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <Target size={16} style={{ color: '#f97316' }} />
            <span style={{ fontSize: '13px', fontWeight: 600 }}>Drone Behavior Analysis</span>
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>
            {analysis.drone_behavior_analysis}
          </div>
        </GlassPanel>
      )}

      {/* Data Quality Notes */}
      {analysis.data_quality_notes && analysis.data_quality_notes.length > 0 && (
        <GlassPanel style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <AlertTriangle size={16} style={{ color: '#eab308' }} />
            <span style={{ fontSize: '13px', fontWeight: 600 }}>Data Quality Notes</span>
          </div>
          {analysis.data_quality_notes.map((note, i) => (
            <span key={i} style={{
              display: 'inline-block', marginRight: '6px', marginBottom: '4px',
              padding: '2px 8px', borderRadius: '4px', fontSize: '11px',
              background: 'rgba(234, 179, 8, 0.2)', color: '#fbbf24',
              border: '1px solid rgba(234, 179, 8, 0.3)',
            }}>
              {note}
            </span>
          ))}
        </GlassPanel>
      )}

      {/* Recommended Follow-Up */}
      {analysis.recommended_followup && analysis.recommended_followup.length > 0 && (
        <GlassPanel style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <RefreshCw size={16} style={{ color: '#3b82f6' }} />
            <span style={{ fontSize: '13px', fontWeight: 600 }}>Recommended Follow-Up</span>
          </div>
          {analysis.recommended_followup.map((rec, i) => (
            <div key={i} style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginBottom: '4px', paddingLeft: '18px', position: 'relative' }}>
              <span style={{ position: 'absolute', left: 0, color: '#3b82f6' }}>{i + 1}.</span>
              {rec}
            </div>
          ))}
        </GlassPanel>
      )}

      {/* Follow-Up Chat */}
      <GlassPanel style={{ padding: '16px' }}>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
          onClick={() => setShowFollowUp(!showFollowUp)}
        >
          <MessageSquare size={16} style={{ color: '#06b6d4' }} />
          <span style={{ fontSize: '13px', fontWeight: 600 }}>Ask Follow-Up Questions</span>
          {showFollowUp ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>

        {showFollowUp && (
          <div style={{ marginTop: '12px' }}>
            {/* Conversation history */}
            {followUpHistory.length > 0 && (
              <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {followUpHistory.map((msg, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      lineHeight: 1.5,
                      background: msg.role === 'user' ? 'rgba(6,182,212,0.1)' : 'rgba(255,255,255,0.03)',
                      borderLeft: msg.role === 'assistant' ? '2px solid #06b6d4' : 'none',
                      color: 'rgba(255,255,255,0.8)',
                      alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '90%',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {msg.content}
                  </div>
                ))}
                {followUpLoading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                    <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                    Thinking...
                  </div>
                )}
              </div>
            )}

            {/* Input */}
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                value={followUpInput}
                onChange={(e) => setFollowUpInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleFollowUp()}
                placeholder="Ask about this session..."
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '12px',
                }}
              />
              <GlassButton
                variant="primary"
                size="sm"
                onClick={handleFollowUp}
                disabled={!followUpInput.trim() || followUpLoading}
              >
                <Send size={12} />
              </GlassButton>
            </div>
          </div>
        )}
      </GlassPanel>

      {/* Token usage footer */}
      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>
        Analysis generated by AI — review with qualified personnel | {analysis.input_tokens} input + {analysis.output_tokens} output tokens
      </div>
    </div>
  );
}
