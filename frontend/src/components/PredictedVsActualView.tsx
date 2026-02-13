/**
 * Predicted vs Actual View
 *
 * Overlays ITM-predicted coverage on actual GPS denial zones from session telemetry.
 * Shows confusion matrix, accuracy metrics, and delta heatmap.
 *
 * Colors:
 *   Green  = True Positive (correctly predicted denial)
 *   Blue   = True Negative (correctly predicted no denial)
 *   Yellow = False Positive (predicted denial but wasn't)
 *   Red    = False Negative (missed denial - model underestimated)
 */

import React, { useState, useEffect, useCallback } from 'react';

interface ComparisonResult {
  true_positive: number;
  true_negative: number;
  false_positive: number;
  false_negative: number;
  accuracy_pct: number;
  precision_pct: number;
  recall_pct: number;
  total_cells_with_data: number;
  grid: number[][];
  grid_size: [number, number];
  bounds: {
    min_lat: number;
    max_lat: number;
    min_lon: number;
    max_lon: number;
  };
  predicted_stats: {
    effective_pct: number;
    threshold_db: number;
  };
}

interface Props {
  sessionId: string;
  onClose?: () => void;
}

const API_BASE = '';

const PredictedVsActualView: React.FC<Props> = ({ sessionId, onClose }) => {
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolution, setResolution] = useState(100);

  const fetchComparison = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `${API_BASE}/api/v2/sessions/${sessionId}/predicted-vs-actual?resolution_m=${resolution}`
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: 'Failed' }));
        throw new Error(data.detail || `HTTP ${res.status}`);
      }
      setResult(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [sessionId, resolution]);

  useEffect(() => {
    fetchComparison();
  }, [fetchComparison]);

  const metricStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '8px 16px',
    background: '#222',
    borderRadius: 6,
    minWidth: 80,
  };

  const renderConfusionMatrix = () => {
    if (!result) return null;

    const cellStyle = (bg: string): React.CSSProperties => ({
      padding: '12px 16px',
      background: bg,
      textAlign: 'center',
      fontWeight: 'bold',
      fontFamily: 'monospace',
      fontSize: 16,
    });

    const headerStyle: React.CSSProperties = {
      padding: '8px 12px',
      textAlign: 'center',
      color: '#aaa',
      fontSize: 11,
      fontWeight: 'bold',
    };

    return (
      <table style={{ borderCollapse: 'collapse', margin: '12px 0' }}>
        <thead>
          <tr>
            <td style={headerStyle}></td>
            <td style={headerStyle}>Actual: Denied</td>
            <td style={headerStyle}>Actual: Normal</td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={headerStyle}>Predicted: Denied</td>
            <td style={cellStyle('rgba(34, 197, 94, 0.3)')}>
              <div style={{ color: '#22c55e' }}>{result.true_positive}</div>
              <div style={{ fontSize: 9, color: '#888' }}>True Positive</div>
            </td>
            <td style={cellStyle('rgba(234, 179, 8, 0.3)')}>
              <div style={{ color: '#eab308' }}>{result.false_positive}</div>
              <div style={{ fontSize: 9, color: '#888' }}>False Positive</div>
            </td>
          </tr>
          <tr>
            <td style={headerStyle}>Predicted: Normal</td>
            <td style={cellStyle('rgba(239, 68, 68, 0.3)')}>
              <div style={{ color: '#ef4444' }}>{result.false_negative}</div>
              <div style={{ fontSize: 9, color: '#888' }}>False Negative</div>
            </td>
            <td style={cellStyle('rgba(96, 165, 250, 0.3)')}>
              <div style={{ color: '#60a5fa' }}>{result.true_negative}</div>
              <div style={{ fontSize: 9, color: '#888' }}>True Negative</div>
            </td>
          </tr>
        </tbody>
      </table>
    );
  };

  return (
    <div
      style={{
        background: '#1a1a1a',
        border: '1px solid #333',
        borderRadius: 8,
        padding: 16,
        maxWidth: 500,
        position: 'relative',
      }}
    >
      {onClose && (
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 4, right: 8,
            background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 16,
          }}
        >
          x
        </button>
      )}

      <h4 style={{ color: '#f97316', margin: '0 0 12px', fontSize: 14 }}>
        Predicted vs Actual Comparison
      </h4>

      {/* Resolution control */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <label style={{ color: '#888', fontSize: 11 }}>Resolution:</label>
        <select
          value={resolution}
          onChange={(e) => setResolution(Number(e.target.value))}
          style={{
            background: '#222', color: '#fff', border: '1px solid #444',
            borderRadius: 4, padding: '2px 6px', fontSize: 11,
          }}
        >
          <option value={50}>50m</option>
          <option value={100}>100m</option>
          <option value={200}>200m</option>
        </select>
      </div>

      {loading ? (
        <div style={{ color: '#888', textAlign: 'center', padding: 40 }}>
          Computing comparison...
        </div>
      ) : error ? (
        <div style={{ color: '#ef4444', padding: 20, textAlign: 'center' }}>
          {error}
        </div>
      ) : result ? (
        <>
          {/* Metrics bar */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={metricStyle}>
              <span style={{ color: '#22c55e', fontSize: 20, fontWeight: 'bold' }}>
                {result.accuracy_pct}%
              </span>
              <span style={{ color: '#888', fontSize: 10 }}>Accuracy</span>
            </div>
            <div style={metricStyle}>
              <span style={{ color: '#60a5fa', fontSize: 20, fontWeight: 'bold' }}>
                {result.precision_pct}%
              </span>
              <span style={{ color: '#888', fontSize: 10 }}>Precision</span>
            </div>
            <div style={metricStyle}>
              <span style={{ color: '#f59e0b', fontSize: 20, fontWeight: 'bold' }}>
                {result.recall_pct}%
              </span>
              <span style={{ color: '#888', fontSize: 10 }}>Recall</span>
            </div>
            <div style={metricStyle}>
              <span style={{ color: '#ccc', fontSize: 20, fontWeight: 'bold' }}>
                {result.total_cells_with_data}
              </span>
              <span style={{ color: '#888', fontSize: 10 }}>Cells</span>
            </div>
          </div>

          {/* Confusion matrix */}
          {renderConfusionMatrix()}

          {/* Legend */}
          <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
            {[
              { color: '#22c55e', label: 'True Positive (model correct: denied)' },
              { color: '#60a5fa', label: 'True Negative (model correct: normal)' },
              { color: '#eab308', label: 'False Positive (over-predicted)' },
              { color: '#ef4444', label: 'False Negative (under-predicted)' },
            ].map(({ color, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
                <span style={{ color: '#888', fontSize: 10 }}>{label}</span>
              </div>
            ))}
          </div>

          {/* Model notes */}
          <div style={{ marginTop: 12, padding: 8, background: '#222', borderRadius: 4, fontSize: 11, color: '#888' }}>
            Model predicted {result.predicted_stats.effective_pct}% effective coverage
            (J/S threshold: {result.predicted_stats.threshold_db} dB).
            {result.false_negative > result.false_positive && (
              <span style={{ color: '#ef4444' }}>
                {' '}Model under-predicts denial zones - consider increasing clutter loss or power estimates.
              </span>
            )}
            {result.false_positive > result.false_negative && (
              <span style={{ color: '#eab308' }}>
                {' '}Model over-predicts denial zones - consider decreasing EIRP or adjusting terrain parameters.
              </span>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
};

export default PredictedVsActualView;
