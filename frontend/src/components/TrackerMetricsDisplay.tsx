/**
 * TrackerMetricsDisplay Component
 * Displays per-tracker CUAS effectiveness metrics
 */

import { useState, useEffect } from 'react';
import {
  Clock,
  Target,
  Satellite,
  Navigation,
  Activity,
  AlertTriangle,
  TrendingDown,
} from 'lucide-react';
import { GlassCard, Badge, DataRow } from './ui/GlassUI';
import type { TrackerSessionMetrics } from '../types/workflow';

interface TrackerMetricsDisplayProps {
  sessionId: string;
  trackerId: string;
  compact?: boolean;
}

// Format time duration
function formatTime(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '--';
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(0)}s`;
}

// Format distance
function formatDistance(meters: number | null): string {
  if (meters === null || meters === undefined) return '--';
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)}km`;
  return `${meters.toFixed(0)}m`;
}

// Mini sparkline for RSSI degradation visualization
function RSSISparkline({ data }: { data: Array<{ rssi_dbm: number }> }) {
  if (data.length < 2) return null;

  const values = data.map(d => d.rssi_dbm);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const width = 100;
  const height = 24;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke="#ef4444"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
      {/* Start and end dots */}
      <circle cx={0} cy={height - ((values[0] - min) / range) * (height - 4) - 2} r="3" fill="#ef4444" />
      <circle
        cx={width}
        cy={height - ((values[values.length - 1] - min) / range) * (height - 4) - 2}
        r="3"
        fill="#ef4444"
      />
    </svg>
  );
}

export default function TrackerMetricsDisplay({
  sessionId,
  trackerId,
  compact = false,
}: TrackerMetricsDisplayProps) {
  const [metrics, setMetrics] = useState<TrackerSessionMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchMetrics = async () => {
      try {
        const response = await fetch(
          `/api/test-sessions/${sessionId}/tracker-metrics?tracker_id=${trackerId}`
        );
        if (response.ok && !cancelled) {
          const data = await response.json();
          if (data.tracker_metrics && data.tracker_metrics.length > 0) {
            setMetrics(data.tracker_metrics[0]);
          }
          setError(null);
        } else if (!cancelled) {
          setError('Failed to load metrics');
        }
      } catch (err) {
        if (!cancelled) setError('Failed to load metrics');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchMetrics();

    // Poll during active sessions every 5 seconds
    const interval = setInterval(fetchMetrics, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId, trackerId]);

  if (loading) {
    return (
      <div style={{ padding: '12px', textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>
        <div className="loading-spinner-small" style={{ margin: '0 auto' }} />
      </div>
    );
  }

  if (error || !metrics) {
    return null; // Don't show anything if no metrics available
  }

  // Check if we have any meaningful data
  const hasData = metrics.time_to_effect_s !== null ||
    metrics.effective_range_m !== null ||
    metrics.total_denial_duration_s > 0 ||
    metrics.denial_event_count > 0;

  if (!hasData && compact) {
    return (
      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', padding: '4px 0' }}>
        No CUAS metrics yet
      </div>
    );
  }

  // Compact mode - show badges
  if (compact) {
    return (
      <div className="tracker-metrics-compact">
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {metrics.time_to_effect_s !== null && (
            <Badge
              color={metrics.time_to_effect_s < 5 ? 'green' : metrics.time_to_effect_s < 15 ? 'yellow' : 'red'}
              size="sm"
            >
              <Clock size={10} style={{ marginRight: '3px' }} />
              {formatTime(metrics.time_to_effect_s)}
            </Badge>
          )}
          {metrics.effective_range_m !== null && (
            <Badge color="blue" size="sm">
              <Target size={10} style={{ marginRight: '3px' }} />
              {formatDistance(metrics.effective_range_m)}
            </Badge>
          )}
          {metrics.total_denial_duration_s > 0 && (
            <Badge color="red" size="sm">
              <AlertTriangle size={10} style={{ marginRight: '3px' }} />
              {formatTime(metrics.total_denial_duration_s)}
            </Badge>
          )}
          {metrics.recovery_time_s !== null && (
            <Badge
              color={metrics.recovery_time_s < 10 ? 'green' : 'yellow'}
              size="sm"
            >
              Recovery: {formatTime(metrics.recovery_time_s)}
            </Badge>
          )}
        </div>
      </div>
    );
  }

  // Full mode - detailed cards
  return (
    <div className="tracker-metrics-full">
      <GlassCard style={{ padding: '12px' }}>
        <div style={{
          fontSize: '11px',
          fontWeight: 600,
          color: '#ff8c00',
          marginBottom: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <Target size={12} />
          CUAS Effectiveness Metrics
        </div>

        {/* Time Metrics Row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
          <div style={{ padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={10} /> Time to Effect
            </div>
            <div style={{
              fontSize: '16px',
              fontWeight: 600,
              color: metrics.time_to_effect_s !== null
                ? (metrics.time_to_effect_s < 5 ? '#22c55e' : metrics.time_to_effect_s < 15 ? '#eab308' : '#ef4444')
                : 'rgba(255,255,255,0.3)',
            }}>
              {formatTime(metrics.time_to_effect_s)}
            </div>
          </div>
          <div style={{ padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Activity size={10} /> Recovery Time
            </div>
            <div style={{
              fontSize: '16px',
              fontWeight: 600,
              color: metrics.recovery_time_s !== null
                ? (metrics.recovery_time_s < 10 ? '#22c55e' : '#eab308')
                : 'rgba(255,255,255,0.3)',
            }}>
              {formatTime(metrics.recovery_time_s)}
            </div>
          </div>
        </div>

        {/* Range & Denial Row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
          <div style={{ padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Target size={10} /> Effective Range
            </div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: '#3b82f6' }}>
              {formatDistance(metrics.effective_range_m)}
            </div>
          </div>
          <div style={{ padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <AlertTriangle size={10} /> Denial Duration
            </div>
            <div style={{
              fontSize: '16px',
              fontWeight: 600,
              color: metrics.total_denial_duration_s > 0 ? '#ef4444' : 'rgba(255,255,255,0.3)',
            }}>
              {formatTime(metrics.total_denial_duration_s)}
              {metrics.denial_event_count > 0 && (
                <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginLeft: '4px' }}>
                  ({metrics.denial_event_count} events)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Drift Metrics Row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
          <div>
            <DataRow
              label={<span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Navigation size={10} /> Max Drift</span>}
              value={
                <span style={{ color: metrics.max_lateral_drift_m > 50 ? '#ef4444' : '#fff' }}>
                  {formatDistance(metrics.max_lateral_drift_m)}
                </span>
              }
            />
          </div>
          <div>
            <DataRow
              label={<span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Activity size={10} /> Alt Delta</span>}
              value={formatDistance(metrics.altitude_delta_m)}
            />
          </div>
        </div>

        {/* GPS Quality Summary */}
        <div style={{
          padding: '8px',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: '6px',
          marginBottom: metrics.rssi_history_before_loss.length > 0 ? '10px' : 0,
        }}>
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px' }}>
            GPS Quality During Session
          </div>
          <div style={{ display: 'flex', gap: '12px', fontSize: '11px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Satellite size={10} />
              Sats: {metrics.avg_satellites?.toFixed(0) ?? '--'}
            </span>
            <span>
              HDOP: {metrics.avg_hdop?.toFixed(1) ?? '--'}
            </span>
            <span style={{
              color: metrics.gps_availability_percent > 90 ? '#22c55e'
                : metrics.gps_availability_percent > 70 ? '#eab308' : '#ef4444',
            }}>
              Avail: {metrics.gps_availability_percent.toFixed(0)}%
            </span>
          </div>
        </div>

        {/* RSSI Degradation Chart */}
        {metrics.rssi_history_before_loss.length > 1 && (
          <div style={{ padding: '8px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <TrendingDown size={10} />
              RSSI Before GPS Loss ({metrics.rssi_history_before_loss.length} samples)
            </div>
            <RSSISparkline data={metrics.rssi_history_before_loss} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>
              <span>{metrics.rssi_history_before_loss[0].rssi_dbm} dBm</span>
              <span>{metrics.rssi_history_before_loss[metrics.rssi_history_before_loss.length - 1].rssi_dbm} dBm</span>
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
