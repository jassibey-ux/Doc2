/**
 * Analysis Panel
 * Displays test session metrics and analysis results
 */

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  Clock,
  Target,
  Check,
  X,
  RefreshCw,
  Download,
  ChevronDown,
  ChevronRight,
  Activity,
  Navigation,
  WifiOff,
  Plane,
} from 'lucide-react';
import { GlassPanel, GlassCard, GlassButton, Badge, GlassDivider } from './ui/GlassUI';
import TrackerMetricsDisplay from './TrackerMetricsDisplay';
import { useWorkflow } from '../contexts/WorkflowContext';
import { useWebSocket } from '../contexts/WebSocketContext';
import { SessionMetrics } from '../types/workflow';

interface AnalysisPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface MetricCard {
  label: string;
  value: string | number | null;
  unit?: string;
  icon: React.ReactNode;
  color: string;
  good?: boolean;
}

export default function AnalysisPanel({ isOpen, onClose }: AnalysisPanelProps) {
  const { activeSession, testSessions, updateTestSession } = useWorkflow();
  const { drones } = useWebSocket();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [metrics, setMetrics] = useState<SessionMetrics | null>(null);
  const [expandedSection, setExpandedSection] = useState<'metrics' | 'events' | 'quality'>('metrics');
  const [expandedTrackerSection, setExpandedTrackerSection] = useState(true);

  // Get session to analyze (active or most recent completed)
  const session = activeSession?.status === 'completed' || activeSession?.status === 'analyzing'
    ? activeSession
    : testSessions.find(s => s.status === 'completed' || s.status === 'analyzing');

  // Run analysis
  const handleAnalyze = useCallback(async () => {
    if (!session) return;

    setIsAnalyzing(true);
    try {
      // Update session status
      await updateTestSession(session.id, { status: 'analyzing' });

      // In a real implementation, this would call the backend analysis API
      // For now, we'll simulate with the session's existing metrics or generate mock data
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Generate mock metrics if none exist
      const mockMetrics: SessionMetrics = session.metrics || {
        total_flight_time_s: session.events.length > 0
          ? (new Date(session.events[session.events.length - 1].timestamp).getTime() -
             new Date(session.events[0].timestamp).getTime()) / 1000
          : 300,
        time_under_jamming_s: session.events.filter(e => e.type === 'jam_on').length * 60,
        time_to_effect_s: 2.3,
        time_to_full_denial_s: 4.8,
        recovery_time_s: 8.2,
        effective_range_m: 850,
        max_altitude_under_jam_m: 45,
        altitude_delta_m: 12.5,
        max_lateral_drift_m: 25.3,
        connection_loss_duration_s: 15,
        failsafe_triggered: true,
        failsafe_type: 'rth',
        failsafe_expected: 'rth',
        pass_fail: 'pass',
      };

      setMetrics(mockMetrics);

      // Update session with analysis results
      await updateTestSession(session.id, {
        status: 'completed',
        analysis_completed: true,
        metrics: mockMetrics,
      });
    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setIsAnalyzing(false);
    }
  }, [session, updateTestSession]);

  // Load metrics when session changes
  useEffect(() => {
    if (session?.metrics) {
      setMetrics(session.metrics);
    } else {
      setMetrics(null);
    }
  }, [session]);

  // Format time
  const formatTime = (seconds: number | null | undefined): string => {
    if (seconds === null || seconds === undefined) return '--';
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs.toFixed(0)}s`;
  };

  // Format distance
  const formatDistance = (meters: number | null | undefined): string => {
    if (meters === null || meters === undefined) return '--';
    if (meters < 1000) return `${meters.toFixed(1)}m`;
    return `${(meters / 1000).toFixed(2)}km`;
  };

  // Get pass/fail badge
  const getPassFailBadge = (status: string | undefined) => {
    switch (status) {
      case 'pass':
        return <Badge color="green" size="sm">PASS</Badge>;
      case 'fail':
        return <Badge color="red" size="sm">FAIL</Badge>;
      case 'partial':
        return <Badge color="yellow" size="sm">PARTIAL</Badge>;
      default:
        return <Badge color="gray" size="sm">--</Badge>;
    }
  };

  // Build metric cards
  const metricCards: MetricCard[] = metrics ? [
    {
      label: 'Time to Effect',
      value: formatTime(metrics.time_to_effect_s),
      icon: <Clock size={16} />,
      color: metrics.time_to_effect_s && metrics.time_to_effect_s < 5 ? '#22c55e' : '#f59e0b',
      good: metrics.time_to_effect_s !== undefined && metrics.time_to_effect_s < 5,
    },
    {
      label: 'Recovery Time',
      value: formatTime(metrics.recovery_time_s),
      icon: <RefreshCw size={16} />,
      color: metrics.recovery_time_s && metrics.recovery_time_s < 15 ? '#22c55e' : '#f59e0b',
    },
    {
      label: 'Effective Range',
      value: formatDistance(metrics.effective_range_m),
      icon: <Target size={16} />,
      color: '#3b82f6',
    },
    {
      label: 'Max Lateral Drift',
      value: formatDistance(metrics.max_lateral_drift_m),
      icon: <Navigation size={16} />,
      color: metrics.max_lateral_drift_m && metrics.max_lateral_drift_m < 50 ? '#22c55e' : '#ef4444',
    },
    {
      label: 'Altitude Delta',
      value: formatDistance(metrics.altitude_delta_m),
      icon: <Activity size={16} />,
      color: '#a855f7',
    },
    {
      label: 'Jamming Duration',
      value: formatTime(metrics.time_under_jamming_s),
      icon: <WifiOff size={16} />,
      color: '#ef4444',
    },
  ] : [];

  if (!isOpen) return null;

  return (
    <div
      className="analysis-panel"
      style={{
        position: 'absolute',
        right: '20px',
        top: '20px',
        width: '360px',
        maxHeight: 'calc(100vh - 140px)',
        zIndex: 100,
      }}
    >
      <GlassPanel style={{ padding: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BarChart3 size={18} style={{ color: '#a855f7' }} />
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>
              Analysis
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.5)',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* No session */}
        {!session ? (
          <div style={{ textAlign: 'center', padding: '24px', color: 'rgba(255,255,255,0.5)' }}>
            <BarChart3 size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
            <div style={{ fontSize: '13px' }}>No session to analyze</div>
            <div style={{ fontSize: '11px', marginTop: '4px' }}>
              Complete a test session to view analysis
            </div>
          </div>
        ) : (
          <>
            {/* Session Info */}
            <GlassCard style={{ marginBottom: '12px', padding: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: '#fff', marginBottom: '4px' }}>
                    {session.name}
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                    {session.events.length} events recorded
                  </div>
                </div>
                {metrics && getPassFailBadge(metrics.pass_fail)}
              </div>
            </GlassCard>

            {/* Analyze Button */}
            {!metrics && (
              <GlassButton
                variant="primary"
                size="md"
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                style={{ width: '100%', marginBottom: '16px' }}
              >
                <BarChart3 size={16} />
                {isAnalyzing ? 'Analyzing...' : 'Run Analysis'}
              </GlassButton>
            )}

            {/* Metrics Section */}
            {metrics && (
              <>
                <div
                  style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', marginBottom: '8px' }}
                  onClick={() => setExpandedSection(expandedSection === 'metrics' ? 'events' : 'metrics')}
                >
                  {expandedSection === 'metrics' ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', fontWeight: 500, marginLeft: '6px' }}>
                    Key Metrics
                  </span>
                </div>

                {expandedSection === 'metrics' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                    {metricCards.map((card, idx) => (
                      <GlassCard key={idx} style={{ padding: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                          <span style={{ color: card.color }}>{card.icon}</span>
                          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>
                            {card.label}
                          </span>
                        </div>
                        <div style={{ fontSize: '18px', fontWeight: 600, color: card.color }}>
                          {card.value}
                        </div>
                      </GlassCard>
                    ))}
                  </div>
                )}

                <GlassDivider />

                {/* Failsafe Section */}
                <div style={{ marginTop: '12px', marginBottom: '12px' }}>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', fontWeight: 500, marginBottom: '8px' }}>
                    Failsafe Assessment
                  </div>
                  <GlassCard style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {metrics.failsafe_triggered ? (
                          <Check size={16} style={{ color: '#22c55e' }} />
                        ) : (
                          <X size={16} style={{ color: '#ef4444' }} />
                        )}
                        <span style={{ fontSize: '12px', color: '#fff' }}>
                          {metrics.failsafe_triggered ? 'Failsafe Triggered' : 'No Failsafe'}
                        </span>
                      </div>
                      {metrics.failsafe_type && (
                        <Badge color="blue" size="sm">
                          {metrics.failsafe_type.toUpperCase()}
                        </Badge>
                      )}
                    </div>
                    {metrics.failsafe_expected && (
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                        Expected: {metrics.failsafe_expected.toUpperCase()}
                        {metrics.failsafe_type === metrics.failsafe_expected ? (
                          <span style={{ color: '#22c55e', marginLeft: '8px' }}>✓ Match</span>
                        ) : (
                          <span style={{ color: '#f59e0b', marginLeft: '8px' }}>✗ Mismatch</span>
                        )}
                      </div>
                    )}
                  </GlassCard>
                </div>

                {/* Summary */}
                <GlassCard style={{
                  padding: '12px',
                  borderLeft: `3px solid ${
                    metrics.pass_fail === 'pass' ? '#22c55e' :
                    metrics.pass_fail === 'partial' ? '#f59e0b' : '#ef4444'
                  }`,
                }}>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: '#fff', marginBottom: '4px' }}>
                    Test Summary
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>
                    {metrics.pass_fail === 'pass' && (
                      <>CUAS system demonstrated effective drone denial with expected failsafe behavior.</>
                    )}
                    {metrics.pass_fail === 'partial' && (
                      <>CUAS system showed partial effectiveness. Failsafe behavior differed from expected.</>
                    )}
                    {metrics.pass_fail === 'fail' && (
                      <>CUAS system did not achieve effective drone denial within test parameters.</>
                    )}
                  </div>
                </GlassCard>

                {/* Per-Tracker Analysis Section */}
                {session && session.tracker_assignments && session.tracker_assignments.length > 0 && (
                  <>
                    <GlassDivider style={{ marginTop: '12px' }} />
                    <div style={{ marginTop: '12px' }}>
                      <div
                        style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', marginBottom: '8px' }}
                        onClick={() => setExpandedTrackerSection(!expandedTrackerSection)}
                      >
                        {expandedTrackerSection ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <Plane size={14} style={{ marginLeft: '6px', color: '#22c55e' }} />
                        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', fontWeight: 500, marginLeft: '6px' }}>
                          Per-Tracker Analysis ({session.tracker_assignments.length})
                        </span>
                      </div>

                      {expandedTrackerSection && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                          {session.tracker_assignments.map(assignment => {
                            const liveDrone = drones.get(assignment.tracker_id);
                            const displayName = liveDrone?.alias || assignment.tracker_id;
                            const isStale = liveDrone?.is_stale ?? true;

                            return (
                              <GlassCard key={assignment.tracker_id} style={{ padding: '10px' }}>
                                <div style={{
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  color: '#fff',
                                  marginBottom: '8px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                }}>
                                  <Plane size={12} style={{ color: isStale ? '#ef4444' : '#22c55e' }} />
                                  {displayName}
                                </div>
                                <TrackerMetricsDisplay
                                  sessionId={session.id}
                                  trackerId={assignment.tracker_id}
                                  compact={true}
                                />
                              </GlassCard>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Export Button */}
                <GlassButton
                  variant="ghost"
                  size="md"
                  onClick={() => {/* Would export report */}}
                  style={{ width: '100%', marginTop: '12px' }}
                >
                  <Download size={16} />
                  Export Report
                </GlassButton>

                {/* Re-analyze Button */}
                <GlassButton
                  variant="ghost"
                  size="sm"
                  onClick={handleAnalyze}
                  disabled={isAnalyzing}
                  style={{ width: '100%', marginTop: '8px' }}
                >
                  <RefreshCw size={14} />
                  {isAnalyzing ? 'Analyzing...' : 'Re-analyze'}
                </GlassButton>
              </>
            )}
          </>
        )}
      </GlassPanel>
    </div>
  );
}
