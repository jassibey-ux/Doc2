/**
 * SessionAnalysisView
 * Dedicated view for post-test session analysis
 * Accessed via /session/:id/analysis route
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  ArrowLeft,
  FileText,
  Play,
  MapPin,
  Plane,
  Radio,
  Calendar,
  User,
  Cloud,
  Box,
} from 'lucide-react';
import { GlassPanel, GlassCard, GlassButton, Badge } from './ui/GlassUI';
import { useWorkflow } from '../contexts/WorkflowContext';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useCRM } from '../contexts/CRMContext';
import Map3DViewer from './Map3DViewer';
import TrackLegend from './TrackLegend';
import TagInput from './crm/TagInput';
import AnnotationList from './crm/AnnotationList';
import RangeOverTimeChart from './RangeOverTimeChart';
import GPSQualityChart from './GPSQualityChart';
import type { SessionMetrics, TestEvent, TestSession, Engagement, CUASPlacement, CUASProfile } from '../types/workflow';
import type { SessionAnnotation } from '../types/crm';

export default function SessionAnalysisView() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const {
    testSessions,
    sites,
    droneProfiles,
    cuasProfiles,
    updateTestSession,
  } = useWorkflow();
  const { droneHistory } = useWebSocket();

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [detailSession, setDetailSession] = useState<TestSession | null>(null);
  const [show3DView, setShow3DView] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string>('metrics');
  const [sessionTags, setSessionTags] = useState<string[]>([]);
  const [sessionAnnotations, setSessionAnnotations] = useState<SessionAnnotation[]>([]);
  const [sessionEngagements, setSessionEngagements] = useState<Engagement[]>([]);
  const [chartHoverTimestamp, setChartHoverTimestamp] = useState<number | null>(null);

  const { getSessionTags, getSessionAnnotations } = useCRM();
  const [analysisData, setAnalysisData] = useState<{
    tracker_count: number;
    total_points: number;
    duration_seconds: number;
    jamming_windows: Array<{ start_time_ms: number; end_time_ms: number; duration_s: number }>;
    total_jamming_time_s: number;
    trackers: Array<{
      tracker_id: string;
      point_count: number;
      metrics: Record<string, unknown>;
    }>;
  } | null>(null);

  // Find the session — prefer detail session (has full data from DETAIL endpoint)
  const session = useMemo(() => {
    if (detailSession?.id === sessionId) return detailSession;
    return testSessions.find(s => s.id === sessionId);
  }, [testSessions, sessionId, detailSession]);

  // Get related data - handle null/empty site_id
  const site = useMemo(() => {
    if (session?.site_id && session.site_id !== '' && session.site_id !== null) {
      return sites.find(s => s.id === session.site_id) || null;
    }
    return null;
  }, [session, sites]);

  const assignedDrones = useMemo(() => {
    if (!session) return [];
    return (session.tracker_assignments || []).map(assignment => {
      const profile = droneProfiles.find(p => p.id === assignment.drone_profile_id);
      return { assignment, profile };
    });
  }, [session, droneProfiles]);

  const assignedCuas = useMemo(() => {
    if (!session) return [];
    return (session.cuas_placements || []).map(placement => {
      const profile = cuasProfiles.find(p => p.id === placement.cuas_profile_id);
      return { placement, profile };
    });
  }, [session, cuasProfiles]);

  // Get timeline info from session times (not just events)
  const timelineInfo = useMemo(() => {
    if (!session) {
      return { start: Date.now(), end: Date.now(), duration: 0 };
    }

    // Use session start/end times if available
    const sessionStart = session.start_time
      ? new Date(session.start_time).getTime()
      : new Date(session.created_at).getTime();

    const sessionEnd = session.end_time
      ? new Date(session.end_time).getTime()
      : (session.events || []).length > 0
        ? Math.max(...(session.events || []).map(e => new Date(e.timestamp).getTime()))
        : sessionStart;

    const duration = (sessionEnd - sessionStart) / 1000;

    return { start: sessionStart, end: sessionEnd, duration: Math.max(0, duration) };
  }, [session]);

  // Fetch full session data from DETAIL endpoint (includes tracker_assignments, cuas_placements, events)
  useEffect(() => {
    if (!sessionId) return;
    fetch(`/api/v2/sessions/${sessionId}`)
      .then(res => res.json())
      .then(data => {
        if (data?.id) {
          setDetailSession(data);
        }
      })
      .catch(err => {
        console.error('Failed to fetch session detail:', err);
      });
  }, [sessionId]);

  // Load tags and annotations for CRM
  useEffect(() => {
    if (!sessionId) return;

    getSessionTags(sessionId).then(setSessionTags);
    getSessionAnnotations(sessionId).then(setSessionAnnotations);
  }, [sessionId, getSessionTags, getSessionAnnotations]);

  // Fetch analysis data from API
  useEffect(() => {
    if (!sessionId) return;

    fetch(`/api/v2/sessions/${sessionId}/metrics`)
      .then(res => res.json())
      .then(data => {
        setAnalysisData(data);
        console.log('Analysis data loaded:', data);
      })
      .catch(err => {
        console.error('Failed to fetch analysis:', err);
      });

    // Fetch engagements
    fetch(`/api/v2/sessions/${sessionId}/engagements`)
      .then(res => res.json())
      .then(data => {
        const engagements = Array.isArray(data) ? data : data?.engagements;
        if (Array.isArray(engagements)) {
          setSessionEngagements(engagements);
        }
      })
      .catch(err => {
        console.error('Failed to fetch engagements:', err);
      });
  }, [sessionId]);

  // Run analysis
  const handleAnalyze = useCallback(async () => {
    if (!session) return;

    setIsAnalyzing(true);
    try {
      // First, trigger the analysis on the backend
      await updateTestSession(session.id, { status: 'analyzing' });

      // Fetch the analysis results from the API
      const response = await fetch(`/api/v2/sessions/${session.id}/compute-metrics`);
      const analysisResult = await response.json();

      setAnalysisData(analysisResult);

      // Build metrics from analysis data
      const trackerMetrics = analysisResult.trackers?.[0]?.metrics;
      const metrics: SessionMetrics = {
        total_flight_time_s: analysisResult.duration_seconds || timelineInfo.duration,
        time_under_jamming_s: analysisResult.total_jamming_time_s || 0,
        time_to_effect_s: trackerMetrics?.time_to_effect_s ?? undefined,
        time_to_full_denial_s: trackerMetrics?.time_to_full_denial_s ?? undefined,
        recovery_time_s: trackerMetrics?.recovery_time_s ?? undefined,
        effective_range_m: trackerMetrics?.effective_range_m ?? undefined,
        max_altitude_under_jam_m: trackerMetrics?.max_altitude_under_jam_m ?? undefined,
        altitude_delta_m: trackerMetrics?.altitude_delta_m ?? undefined,
        max_lateral_drift_m: trackerMetrics?.max_lateral_drift_m ?? undefined,
        connection_loss_duration_s: trackerMetrics?.connection_loss_duration_s ?? undefined,
        failsafe_triggered: trackerMetrics?.failsafe_triggered ?? false,
        failsafe_type: trackerMetrics?.failsafe_type ?? undefined,
        failsafe_expected: trackerMetrics?.failsafe_expected ?? undefined,
        pass_fail: trackerMetrics?.pass_fail ?? (analysisResult.total_points > 0 ? 'partial' : 'pending'),
      };

      await updateTestSession(session.id, {
        status: 'completed',
        analysis_completed: true,
        metrics,
      });
    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setIsAnalyzing(false);
    }
  }, [session, timelineInfo, updateTestSession]);

  // Handle report download - uses GET endpoint that matches backend
  const handleDownloadReport = useCallback(async (format: 'html' | 'txt') => {
    if (!session) return;

    try {
      const response = await fetch(`/api/reports/download/${session.id}/${format}`, {
        method: 'GET',
      });

      if (!response.ok) throw new Error('Report generation failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${session.name.replace(/\s+/g, '_')}_report.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error: unknown) {
      console.error('Report download failed:', error instanceof Error ? error.message : error);
    }
  }, [session]);

  // Format time
  const formatTime = (seconds: number | null | undefined): string => {
    if (seconds === null || seconds === undefined) return '--';
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${Math.round(secs)}s`;
  };

  // Format distance
  const formatDistance = (meters: number | null | undefined): string => {
    if (meters === null || meters === undefined) return '--';
    if (meters < 1000) return `${meters.toFixed(1)}m`;
    return `${(meters / 1000).toFixed(2)}km`;
  };

  // Get event type badge color
  const getEventBadgeColor = (type: string): 'blue' | 'gray' | 'green' | 'orange' | 'red' | 'yellow' => {
    switch (type) {
      case 'jam_on': return 'red';
      case 'jam_off': return 'green';
      case 'launch': return 'blue';
      case 'recover': return 'orange';
      case 'failsafe': return 'yellow';
      default: return 'gray';
    }
  };

  // Get pass/fail badge
  const getPassFailBadge = (status: string | undefined) => {
    switch (status) {
      case 'pass':
        return <Badge color="green" size="md">PASS</Badge>;
      case 'fail':
        return <Badge color="red" size="md">FAIL</Badge>;
      case 'partial':
        return <Badge color="yellow" size="md">PARTIAL</Badge>;
      default:
        return <Badge color="gray" size="md">PENDING</Badge>;
    }
  };

  if (!session) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: 'linear-gradient(135deg, #0a0a1a 0%, #1a1a2e 100%)',
          color: '#fff',
        }}
      >
        <BarChart3 size={48} style={{ opacity: 0.5, marginBottom: '16px' }} />
        <div style={{ fontSize: '18px', marginBottom: '8px' }}>Session not found</div>
        <GlassButton variant="ghost" onClick={() => navigate('/')}>
          <ArrowLeft size={16} />
          Back to Dashboard
        </GlassButton>
      </div>
    );
  }

  const metrics = session.metrics;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a0a1a 0%, #1a1a2e 100%)',
        color: '#fff',
        padding: '24px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <GlassButton variant="ghost" onClick={() => navigate('/')}>
            <ArrowLeft size={18} />
          </GlassButton>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 600, margin: 0 }}>{session.name}</h1>
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginTop: '4px' }}>
              Session Analysis
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {metrics && getPassFailBadge(metrics.pass_fail)}
          <GlassButton variant="ghost" onClick={() => setShow3DView(!show3DView)}>
            <Box size={16} />
            {show3DView ? 'Hide 3D' : 'View 3D'}
          </GlassButton>
        </div>
      </div>

      {/* 3D View Overlay */}
      {show3DView && (
        <Map3DViewer
          droneHistory={droneHistory}
          currentTime={timelineInfo.end}
          timelineStart={timelineInfo.start}
          onClose={() => setShow3DView(false)}
          showQualityColors={true}
          site={site}
          cuasPlacements={session?.cuas_placements || []}
          cuasProfiles={cuasProfiles}
        />
      )}

      {/* Main Content Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
        {/* Left Column - Session Info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Session Details */}
          <GlassPanel style={{ padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <FileText size={16} style={{ color: '#a855f7' }} />
              <span style={{ fontSize: '13px', fontWeight: 500 }}>Session Details</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={14} style={{ color: 'rgba(255,255,255,0.5)' }} />
                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>
                  {new Date(session.created_at).toLocaleDateString()} at{' '}
                  {new Date(session.created_at).toLocaleTimeString()}
                </span>
              </div>
              {session.operator_name && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <User size={14} style={{ color: 'rgba(255,255,255,0.5)' }} />
                  <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>
                    {session.operator_name}
                  </span>
                </div>
              )}
              {session.weather_notes && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Cloud size={14} style={{ color: 'rgba(255,255,255,0.5)' }} />
                  <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>
                    {session.weather_notes}
                  </span>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={14} style={{ color: 'rgba(255,255,255,0.5)' }} />
                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>
                  Duration: {formatTime(timelineInfo.duration)}
                </span>
              </div>
            </div>
          </GlassPanel>

          {/* Site Info */}
          <GlassPanel style={{ padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <MapPin size={16} style={{ color: '#3b82f6' }} />
              <span style={{ fontSize: '13px', fontWeight: 500 }}>Test Site</span>
            </div>
            {site ? (
              <div>
                <div style={{ fontSize: '14px', color: '#fff', marginBottom: '4px' }}>{site.name}</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                  {site.environment_type.replace(/_/g, ' ')}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>No site assigned</div>
            )}
          </GlassPanel>

          {/* Drones */}
          <GlassPanel style={{ padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Plane size={16} style={{ color: '#22c55e' }} />
              <span style={{ fontSize: '13px', fontWeight: 500 }}>Test Drones ({assignedDrones.length})</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {assignedDrones.map(({ assignment, profile }) => (
                <GlassCard key={assignment.id} style={{ padding: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        background: assignment.session_color || '#00c8ff',
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '12px', color: '#fff' }}>
                        {profile?.model || 'Unknown Drone'}
                      </div>
                      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>
                        {assignment.tracker_id}
                      </div>
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>
          </GlassPanel>

          {/* CUAS Systems */}
          <GlassPanel style={{ padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Radio size={16} style={{ color: '#ef4444' }} />
              <span style={{ fontSize: '13px', fontWeight: 500 }}>CUAS Systems ({assignedCuas.length})</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {assignedCuas.map(({ placement, profile }) => (
                <GlassCard key={placement.id} style={{ padding: '10px' }}>
                  <div style={{ fontSize: '12px', color: '#fff' }}>
                    {profile?.name || 'Unknown CUAS'}
                  </div>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>
                    {profile?.frequency_ranges?.join(', ') || 'N/A'} | {profile?.effective_range_m}m range
                  </div>
                </GlassCard>
              ))}
            </div>
          </GlassPanel>
        </div>

        {/* Center Column - Metrics */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Data Summary from API */}
          {analysisData && (
            <GlassPanel style={{ padding: '16px' }}>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>
                Recorded Data: {analysisData.tracker_count} tracker(s), {analysisData.total_points} total points
              </div>
            </GlassPanel>
          )}

          {/* Analysis Actions */}
          {!metrics && (
            <GlassPanel style={{ padding: '16px', textAlign: 'center' }}>
              <BarChart3 size={32} style={{ color: '#a855f7', marginBottom: '12px' }} />
              <div style={{ fontSize: '14px', marginBottom: '16px' }}>
                Run analysis to calculate performance metrics
              </div>
              <GlassButton
                variant="primary"
                size="lg"
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                style={{ width: '100%' }}
              >
                <Play size={18} />
                {isAnalyzing ? 'Analyzing...' : 'Run Analysis'}
              </GlassButton>
            </GlassPanel>
          )}

          {/* Metrics Grid */}
          {metrics && (
            <>
              <GlassPanel style={{ padding: '16px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    marginBottom: expandedSection === 'metrics' ? '12px' : 0,
                  }}
                  onClick={() => setExpandedSection(expandedSection === 'metrics' ? '' : 'metrics')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <BarChart3 size={16} style={{ color: '#a855f7' }} />
                    <span style={{ fontSize: '13px', fontWeight: 500 }}>Performance Metrics</span>
                  </div>
                  {expandedSection === 'metrics' ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </div>

                {expandedSection === 'metrics' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <MetricCard
                      icon={<Clock size={16} />}
                      label="Time to Effect"
                      value={formatTime(metrics.time_to_effect_s)}
                      color={metrics.time_to_effect_s && metrics.time_to_effect_s < 5 ? '#22c55e' : '#f59e0b'}
                    />
                    <MetricCard
                      icon={<RefreshCw size={16} />}
                      label="Recovery Time"
                      value={formatTime(metrics.recovery_time_s)}
                      color={metrics.recovery_time_s && metrics.recovery_time_s < 15 ? '#22c55e' : '#f59e0b'}
                    />
                    <MetricCard
                      icon={<Target size={16} />}
                      label="Effective Range"
                      value={formatDistance(metrics.effective_range_m)}
                      color="#3b82f6"
                    />
                    <MetricCard
                      icon={<Navigation size={16} />}
                      label="Max Lateral Drift"
                      value={formatDistance(metrics.max_lateral_drift_m)}
                      color={metrics.max_lateral_drift_m && metrics.max_lateral_drift_m < 50 ? '#22c55e' : '#ef4444'}
                    />
                    <MetricCard
                      icon={<Activity size={16} />}
                      label="Altitude Delta"
                      value={formatDistance(metrics.altitude_delta_m)}
                      color="#a855f7"
                    />
                    <MetricCard
                      icon={<WifiOff size={16} />}
                      label="Jamming Duration"
                      value={formatTime(metrics.time_under_jamming_s)}
                      color="#ef4444"
                    />
                  </div>
                )}
              </GlassPanel>

              {/* Failsafe Assessment */}
              <GlassPanel style={{ padding: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '12px' }}>
                  Failsafe Assessment
                </div>
                <GlassCard style={{ padding: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {metrics.failsafe_triggered ? (
                        <Check size={20} style={{ color: '#22c55e' }} />
                      ) : (
                        <X size={20} style={{ color: '#ef4444' }} />
                      )}
                      <span style={{ fontSize: '14px' }}>
                        {metrics.failsafe_triggered ? 'Failsafe Triggered' : 'No Failsafe Response'}
                      </span>
                    </div>
                    {metrics.failsafe_type && (
                      <Badge color="blue" size="md">
                        {metrics.failsafe_type.toUpperCase()}
                      </Badge>
                    )}
                  </div>
                  {metrics.failsafe_expected && (
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
                      Expected: <strong>{metrics.failsafe_expected.toUpperCase()}</strong>
                      {metrics.failsafe_type === metrics.failsafe_expected ? (
                        <span style={{ color: '#22c55e', marginLeft: '12px' }}>
                          <Check size={14} style={{ verticalAlign: 'middle' }} /> Match
                        </span>
                      ) : (
                        <span style={{ color: '#f59e0b', marginLeft: '12px' }}>
                          <X size={14} style={{ verticalAlign: 'middle' }} /> Mismatch
                        </span>
                      )}
                    </div>
                  )}
                </GlassCard>
              </GlassPanel>

              {/* Test Summary */}
              <GlassPanel
                style={{
                  padding: '16px',
                  borderLeft: `4px solid ${
                    metrics.pass_fail === 'pass' ? '#22c55e' :
                    metrics.pass_fail === 'partial' ? '#f59e0b' : '#ef4444'
                  }`,
                }}
              >
                <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>
                  Test Summary
                </div>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
                  {metrics.pass_fail === 'pass' && (
                    <>CUAS system demonstrated effective drone denial with expected failsafe behavior. The system achieved full denial within acceptable time parameters.</>
                  )}
                  {metrics.pass_fail === 'partial' && (
                    <>CUAS system showed partial effectiveness. Failsafe behavior differed from expected configuration. Consider reviewing system settings.</>
                  )}
                  {metrics.pass_fail === 'fail' && (
                    <>CUAS system did not achieve effective drone denial within test parameters. Further investigation and adjustment recommended.</>
                  )}
                </div>
              </GlassPanel>

              {/* Re-analyze */}
              <GlassButton
                variant="ghost"
                size="md"
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                style={{ width: '100%' }}
              >
                <RefreshCw size={16} />
                {isAnalyzing ? 'Analyzing...' : 'Re-run Analysis'}
              </GlassButton>
            </>
          )}

          {/* Engagements Summary */}
          {sessionEngagements.length > 0 && (
            <GlassPanel style={{ padding: '16px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  marginBottom: expandedSection === 'engagements' ? '12px' : 0,
                }}
                onClick={() => setExpandedSection(expandedSection === 'engagements' ? '' : 'engagements')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Target size={16} style={{ color: '#06b6d4' }} />
                  <span style={{ fontSize: '13px', fontWeight: 500 }}>
                    Engagements ({sessionEngagements.length})
                  </span>
                </div>
                {expandedSection === 'engagements' ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </div>

              {expandedSection === 'engagements' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {sessionEngagements.map(eng => (
                    <div key={eng.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <EngagementSummaryCard
                        engagement={eng}
                        cuasProfiles={cuasProfiles}
                        cuasPlacements={session?.cuas_placements || []}
                        formatTime={formatTime}
                        formatDistance={formatDistance}
                      />
                      {/* Range Over Time + GPS Quality Charts per engagement */}
                      {eng.cuas_placement_id && eng.targets[0]?.tracker_id && sessionId && (
                        <>
                          <RangeOverTimeChart
                            sessionId={sessionId}
                            cuasPlacementId={eng.cuas_placement_id}
                            trackerId={eng.targets[0].tracker_id}
                            hoverTimestamp={chartHoverTimestamp}
                            onHoverTimestamp={setChartHoverTimestamp}
                          />
                          <GPSQualityChart
                            sessionId={sessionId}
                            cuasPlacementId={eng.cuas_placement_id}
                            trackerId={eng.targets[0].tracker_id}
                            hoverTimestamp={chartHoverTimestamp}
                            onHoverTimestamp={setChartHoverTimestamp}
                          />
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </GlassPanel>
          )}
        </div>

        {/* Right Column - Events & Reports */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Events Timeline */}
          <GlassPanel style={{ padding: '16px', flex: 1 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                marginBottom: expandedSection === 'events' ? '12px' : 0,
              }}
              onClick={() => setExpandedSection(expandedSection === 'events' ? '' : 'events')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Activity size={16} style={{ color: '#3b82f6' }} />
                <span style={{ fontSize: '13px', fontWeight: 500 }}>
                  Events ({(session.events || []).length})
                </span>
              </div>
              {expandedSection === 'events' ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </div>

            {expandedSection === 'events' && (
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {(session.events || []).length === 0 ? (
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '20px' }}>
                    No events recorded
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {(session.events || []).map((event, idx) => (
                      <EventItem key={event.id || idx} event={event} getBadgeColor={getEventBadgeColor} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </GlassPanel>

          {/* Session Tags */}
          <GlassPanel style={{ padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <span style={{ fontSize: '13px', fontWeight: 500 }}>Tags</span>
            </div>
            <TagInput
              sessionId={sessionId || ''}
              tags={sessionTags}
              onTagsChanged={(tags) => setSessionTags(tags)}
            />
          </GlassPanel>

          {/* Session Annotations */}
          <GlassPanel style={{ padding: '16px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                marginBottom: expandedSection === 'annotations' ? '12px' : 0,
              }}
              onClick={() => setExpandedSection(expandedSection === 'annotations' ? '' : 'annotations')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 500 }}>
                  Annotations ({sessionAnnotations.length})
                </span>
              </div>
              {expandedSection === 'annotations' ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </div>
            {expandedSection === 'annotations' && (
              <AnnotationList
                sessionId={sessionId || ''}
                annotations={sessionAnnotations}
                onAnnotationsChanged={() => {
                  if (sessionId) {
                    getSessionAnnotations(sessionId).then(setSessionAnnotations);
                  }
                }}
              />
            )}
          </GlassPanel>

          {/* Track Quality Legend */}
          <GlassPanel style={{ padding: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '12px' }}>Track Quality Guide</div>
            <TrackLegend visible={true} compact={false} showSDOnly={true} />
          </GlassPanel>

          {/* Report Export */}
          <GlassPanel style={{ padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Download size={16} style={{ color: '#f59e0b' }} />
              <span style={{ fontSize: '13px', fontWeight: 500 }}>Export Report</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <GlassButton
                variant="secondary"
                size="md"
                onClick={() => handleDownloadReport('html')}
                style={{ width: '100%' }}
              >
                <FileText size={16} />
                Download HTML Report
              </GlassButton>
              <GlassButton
                variant="ghost"
                size="md"
                onClick={() => handleDownloadReport('txt')}
                style={{ width: '100%' }}
              >
                <FileText size={16} />
                Download Text Report
              </GlassButton>
            </div>
          </GlassPanel>
        </div>
      </div>
    </div>
  );
}

// Metric Card Component
interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}

function MetricCard({ icon, label, value, color }: MetricCardProps) {
  return (
    <GlassCard style={{ padding: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
        <span style={{ color }}>{icon}</span>
        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>{label}</span>
      </div>
      <div style={{ fontSize: '20px', fontWeight: 600, color }}>{value}</div>
    </GlassCard>
  );
}

// Event Item Component
type BadgeColor = 'blue' | 'gray' | 'green' | 'orange' | 'red' | 'yellow';

interface EventItemProps {
  event: TestEvent;
  getBadgeColor: (type: string) => BadgeColor;
}

function EventItem({ event, getBadgeColor }: EventItemProps) {
  return (
    <GlassCard style={{ padding: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Badge color={getBadgeColor(event.type)} size="sm">
            {event.type.replace(/_/g, ' ').toUpperCase()}
          </Badge>
          {event.tracker_id && (
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
              {event.tracker_id}
            </span>
          )}
        </div>
        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>
          {new Date(event.timestamp).toLocaleTimeString()}
        </span>
      </div>
      {event.note && (
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', marginTop: '6px' }}>
          {event.note}
        </div>
      )}
    </GlassCard>
  );
}

// Engagement Summary Card for analysis view
interface EngagementSummaryCardProps {
  engagement: Engagement;
  cuasProfiles: CUASProfile[];
  cuasPlacements: CUASPlacement[];
  formatTime: (seconds: number | null | undefined) => string;
  formatDistance: (meters: number | null | undefined) => string;
}

function EngagementSummaryCard({ engagement, cuasProfiles, cuasPlacements, formatTime, formatDistance }: EngagementSummaryCardProps) {
  const placement = cuasPlacements.find(p => p.id === engagement.cuas_placement_id);
  const profile = placement ? cuasProfiles.find(p => p.id === placement.cuas_profile_id) : null;
  const cuasName = profile?.name || 'Unknown CUAS';
  const targetNames = engagement.targets.map(t => t.tracker_id).join(', ');
  const m = engagement.metrics;

  const statusColor = engagement.status === 'complete' ? '#22c55e' : engagement.status === 'aborted' ? '#f97316' : '#06b6d4';

  return (
    <GlassCard
      style={{
        padding: '14px',
        borderLeft: `3px solid ${statusColor}`,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 500, color: '#fff' }}>
            {engagement.name || `${cuasName} → ${targetNames}`}
          </div>
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>
            {engagement.engage_timestamp && new Date(engagement.engage_timestamp).toLocaleTimeString()}
            {engagement.disengage_timestamp && ` — ${new Date(engagement.disengage_timestamp).toLocaleTimeString()}`}
          </div>
        </div>
        <Badge
          color={engagement.status === 'complete' ? 'green' : engagement.status === 'aborted' ? 'orange' : 'blue'}
          size="sm"
        >
          {engagement.status.toUpperCase()}
        </Badge>
      </div>

      {/* Initial geometry */}
      {engagement.targets[0]?.initial_range_m && (
        <div style={{ display: 'flex', gap: '16px', marginBottom: '8px', fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>
          <span>Range: {Math.round(engagement.targets[0].initial_range_m)}m</span>
          {engagement.targets[0].initial_bearing_deg !== undefined && (
            <span>Bearing: {Math.round(engagement.targets[0].initial_bearing_deg)}°</span>
          )}
          {engagement.targets[0].angle_off_boresight_deg !== undefined && (
            <span>AoB: {Math.round(engagement.targets[0].angle_off_boresight_deg)}°</span>
          )}
        </div>
      )}

      {/* Metrics grid */}
      {m && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', marginBottom: '2px' }}>TTE</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#06b6d4' }}>{formatTime(m.time_to_effect_s)}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', marginBottom: '2px' }}>Range</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#3b82f6' }}>{formatDistance(m.effective_range_m)}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', marginBottom: '2px' }}>Recovery</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#22c55e' }}>{formatTime(m.recovery_time_s)}</div>
          </div>
          {m.denial_consistency_pct !== undefined && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', marginBottom: '2px' }}>Denial</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#ef4444' }}>{Math.round(m.denial_consistency_pct)}%</div>
            </div>
          )}
          {m.max_lateral_drift_m !== undefined && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', marginBottom: '2px' }}>Drift</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#f59e0b' }}>{formatDistance(m.max_lateral_drift_m)}</div>
            </div>
          )}
          {m.pass_fail && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', marginBottom: '2px' }}>Result</div>
              <Badge
                color={m.pass_fail === 'pass' ? 'green' : m.pass_fail === 'fail' ? 'red' : 'yellow'}
                size="md"
              >
                {m.pass_fail.toUpperCase()}
              </Badge>
            </div>
          )}
        </div>
      )}
    </GlassCard>
  );
}
