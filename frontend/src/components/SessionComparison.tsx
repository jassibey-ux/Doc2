/**
 * Session Comparison Component (A4)
 * Side-by-side comparison of two sessions' metrics with overlay tracks
 */

import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, GitCompare, X, ArrowUp, ArrowDown, Minus } from 'lucide-react';

interface SessionComparisonData {
  session_id: string;
  name: string;
  status: string;
  site_name: string | null;
  start_time: string | null;
  duration_seconds: number | null;
  drone_names: string[];
  cuas_names: string[];
  tracker_count: number;
  event_count: number;
  metrics: Record<string, number | string | boolean | null> | null;
  analysis_completed: boolean;
}

interface ComparisonResponse {
  sessions: SessionComparisonData[];
  comparison: Record<string, (number | string | null)[]>;
  metric_keys: string[];
}

interface SessionOption {
  id: string;
  name: string;
  status: string;
  start_time?: string;
}

interface SessionComparisonProps {
  isOpen: boolean;
  onClose: () => void;
}

const METRIC_LABELS: Record<string, string> = {
  total_flight_time_s: 'Total Flight Time',
  time_under_jamming_s: 'Time Under Jamming',
  time_to_effect_s: 'Time to Effect',
  time_to_full_denial_s: 'Time to Full Denial',
  recovery_time_s: 'Recovery Time',
  effective_range_m: 'Effective Range',
  max_lateral_drift_m: 'Max Lateral Drift',
  altitude_delta_m: 'Altitude Delta',
  pass_fail: 'Pass/Fail',
};

const METRIC_UNITS: Record<string, string> = {
  total_flight_time_s: 's',
  time_under_jamming_s: 's',
  time_to_effect_s: 's',
  time_to_full_denial_s: 's',
  recovery_time_s: 's',
  effective_range_m: 'm',
  max_lateral_drift_m: 'm',
  altitude_delta_m: 'm',
  pass_fail: '',
};

// For these metrics, lower is better
const LOWER_IS_BETTER = new Set([
  'time_to_effect_s',
  'time_to_full_denial_s',
  'recovery_time_s',
  'max_lateral_drift_m',
  'altitude_delta_m',
]);

function formatMetricValue(key: string, value: number | string | null): string {
  if (value === null || value === undefined) return '—';
  if (key === 'pass_fail') return String(value).toUpperCase();
  if (typeof value === 'number') return value.toFixed(1);
  return String(value);
}

function getDeltaIndicator(key: string, values: (number | string | null)[]): React.ReactNode {
  if (values.length < 2 || key === 'pass_fail') return null;
  const v1 = values[0];
  const v2 = values[1];
  if (typeof v1 !== 'number' || typeof v2 !== 'number') return null;

  const diff = v2 - v1;
  if (Math.abs(diff) < 0.1) return <Minus size={12} style={{ color: '#6b7280' }} />;

  const isBetter = LOWER_IS_BETTER.has(key) ? diff < 0 : diff > 0;
  const color = isBetter ? '#22c55e' : '#ef4444';
  const Icon = diff > 0 ? ArrowUp : ArrowDown;

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: '2px', color, fontSize: '11px' }}>
      <Icon size={12} />
      {Math.abs(diff).toFixed(1)}
    </span>
  );
}

export default function SessionComparison({ isOpen, onClose }: SessionComparisonProps) {
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(['', '']);
  const [comparisonData, setComparisonData] = useState<ComparisonResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch available sessions
  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/test-sessions')
      .then(r => r.json())
      .then(data => {
        const opts = (Array.isArray(data) ? data : []).map((s: any) => ({
          id: s.id,
          name: s.name,
          status: s.status,
          start_time: s.start_time,
        }));
        setSessions(opts);
      })
      .catch(() => setSessions([]));
  }, [isOpen]);

  // Fetch comparison when both sessions are selected
  const handleCompare = useCallback(async () => {
    const ids = selectedIds.filter(Boolean);
    if (ids.length < 2) {
      setError('Select at least 2 sessions to compare');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/sessions/compare?ids=${ids.join(',')}`);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Comparison failed');
      }
      const data = await response.json();
      setComparisonData(data);
    } catch (err: any) {
      setError(err.message);
      setComparisonData(null);
    } finally {
      setLoading(false);
    }
  }, [selectedIds]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.7)',
      zIndex: 2000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        background: '#1a1a2e',
        border: '1px solid rgba(255,107,0,0.3)',
        borderRadius: '12px',
        width: '90%',
        maxWidth: '900px',
        maxHeight: '85vh',
        overflow: 'auto',
        padding: '24px',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <GitCompare size={20} style={{ color: '#ff6b00' }} />
            <h2 style={{ color: '#fff', margin: 0, fontSize: '18px' }}>Session Comparison</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {/* Session Selection */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          {[0, 1].map(i => (
            <select
              key={i}
              value={selectedIds[i]}
              onChange={e => {
                const newIds = [...selectedIds];
                newIds[i] = e.target.value;
                setSelectedIds(newIds);
              }}
              style={{
                flex: 1,
                background: '#0d0d1a',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '6px',
                color: '#fff',
                padding: '8px 12px',
                fontSize: '13px',
              }}
            >
              <option value="">Select Session {i + 1}...</option>
              {sessions.map(s => (
                <option key={s.id} value={s.id} disabled={selectedIds.includes(s.id) && selectedIds[i] !== s.id}>
                  {s.name} ({s.status})
                </option>
              ))}
            </select>
          ))}
          <button
            onClick={handleCompare}
            disabled={loading || selectedIds.filter(Boolean).length < 2}
            style={{
              background: '#ff6b00',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 20px',
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.6 : 1,
              fontWeight: 600,
              fontSize: '13px',
            }}
          >
            {loading ? 'Comparing...' : 'Compare'}
          </button>
        </div>

        {error && (
          <div style={{ color: '#ef4444', fontSize: '13px', marginBottom: '12px', padding: '8px', background: 'rgba(239,68,68,0.1)', borderRadius: '6px' }}>
            {error}
          </div>
        )}

        {/* Comparison Table */}
        {comparisonData && (
          <div style={{ overflowX: 'auto' }}>
            {/* Session Info */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px', color: '#999', fontSize: '12px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    Session Info
                  </th>
                  {comparisonData.sessions.map(s => (
                    <th key={s.session_id} style={{ textAlign: 'center', padding: '8px', color: '#ff6b00', fontSize: '13px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      {s.name}
                    </th>
                  ))}
                  {comparisonData.sessions.length === 2 && (
                    <th style={{ textAlign: 'center', padding: '8px', color: '#999', fontSize: '12px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      Delta
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: '6px 8px', color: '#aaa', fontSize: '12px' }}>Site</td>
                  {comparisonData.sessions.map(s => (
                    <td key={s.session_id} style={{ padding: '6px 8px', color: '#fff', fontSize: '12px', textAlign: 'center' }}>
                      {s.site_name || '—'}
                    </td>
                  ))}
                  {comparisonData.sessions.length === 2 && <td />}
                </tr>
                <tr>
                  <td style={{ padding: '6px 8px', color: '#aaa', fontSize: '12px' }}>Duration</td>
                  {comparisonData.sessions.map(s => (
                    <td key={s.session_id} style={{ padding: '6px 8px', color: '#fff', fontSize: '12px', textAlign: 'center' }}>
                      {s.duration_seconds ? `${Math.round(s.duration_seconds)}s` : '—'}
                    </td>
                  ))}
                  {comparisonData.sessions.length === 2 && <td />}
                </tr>
                <tr>
                  <td style={{ padding: '6px 8px', color: '#aaa', fontSize: '12px' }}>CUAS</td>
                  {comparisonData.sessions.map(s => (
                    <td key={s.session_id} style={{ padding: '6px 8px', color: '#fff', fontSize: '12px', textAlign: 'center' }}>
                      {s.cuas_names.join(', ') || '—'}
                    </td>
                  ))}
                  {comparisonData.sessions.length === 2 && <td />}
                </tr>
              </tbody>
            </table>

            {/* Metrics Comparison */}
            <h3 style={{ color: '#fff', fontSize: '14px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BarChart3 size={16} style={{ color: '#ff6b00' }} />
              Metrics Comparison
            </h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px', color: '#999', fontSize: '12px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    Metric
                  </th>
                  {comparisonData.sessions.map(s => (
                    <th key={s.session_id} style={{ textAlign: 'center', padding: '8px', color: '#ff6b00', fontSize: '12px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      {s.name}
                    </th>
                  ))}
                  {comparisonData.sessions.length === 2 && (
                    <th style={{ textAlign: 'center', padding: '8px', color: '#999', fontSize: '12px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      Delta
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {comparisonData.metric_keys.map(key => (
                  <tr key={key} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '8px', color: '#aaa', fontSize: '12px' }}>
                      {METRIC_LABELS[key] || key}
                      {METRIC_UNITS[key] && (
                        <span style={{ color: '#666', marginLeft: '4px' }}>({METRIC_UNITS[key]})</span>
                      )}
                    </td>
                    {comparisonData.comparison[key]?.map((val, i) => (
                      <td key={i} style={{
                        padding: '8px',
                        color: key === 'pass_fail'
                          ? (val === 'pass' ? '#22c55e' : val === 'fail' ? '#ef4444' : '#f59e0b')
                          : '#fff',
                        fontSize: '13px',
                        textAlign: 'center',
                        fontWeight: key === 'pass_fail' ? 600 : 400,
                      }}>
                        {formatMetricValue(key, val)}
                      </td>
                    ))}
                    {comparisonData.sessions.length === 2 && (
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        {getDeltaIndicator(key, comparisonData.comparison[key] || [])}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!comparisonData && !loading && !error && (
          <div style={{ textAlign: 'center', color: '#666', padding: '40px', fontSize: '14px' }}>
            Select two sessions above and click Compare to see side-by-side metrics
          </div>
        )}
      </div>
    </div>
  );
}
