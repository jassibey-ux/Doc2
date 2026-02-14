/**
 * Session History Panel
 * Right-docked panel showing recent sessions with navigation to session console.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  Clock,
  MapPin,
  CheckCircle,
  PlayCircle,
  AlertTriangle,
  RefreshCw,
  Activity,
} from 'lucide-react';
import { Badge } from './ui/GlassUI';

interface SessionHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SessionSummary {
  id: string;
  name: string;
  status: string;
  site_id?: string;
  start_time?: string;
  end_time?: string;
  duration_seconds?: number;
  operator_name?: string;
  created_at: string;
  site?: { id: string; name: string };
  tags?: string[];
  tracker_assignments_count?: number;
}

interface SessionListResponse {
  items: SessionSummary[];
  total: number;
  skip: number;
  limit: number;
}

const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  active: { color: '#ef4444', icon: <Activity size={10} />, label: 'ACTIVE' },
  completed: { color: '#22c55e', icon: <CheckCircle size={10} />, label: 'COMPLETE' },
  analyzing: { color: '#a855f7', icon: <Clock size={10} />, label: 'ANALYZING' },
  planned: { color: '#3b82f6', icon: <PlayCircle size={10} />, label: 'PLANNED' },
  cancelled: { color: '#6b7280', icon: <AlertTriangle size={10} />, label: 'CANCELLED' },
};

function formatDuration(seconds?: number): string {
  if (!seconds) return '--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function SessionHistoryPanel({ isOpen, onClose }: SessionHistoryPanelProps) {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v2/sessions?limit=50&descending=true');
      if (res.ok) {
        const data: SessionListResponse = await res.json();
        setSessions(data.items);
        setTotal(data.total);
      }
    } catch (err) {
      console.error('[SessionHistoryPanel] Failed to fetch sessions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) fetchSessions();
  }, [isOpen, fetchSessions]);

  const handleSessionClick = (session: SessionSummary) => {
    navigate(`/session/${session.id}/live`);
    onClose();
  };

  if (!isOpen) {
    return <div className="session-history-panel hidden" />;
  }

  return (
    <div className="session-history-panel">
      {/* Header */}
      <div className="shp-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Clock size={18} style={{ color: '#ff8c00' }} />
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', margin: 0 }}>
            Sessions
          </h2>
          <Badge color="gray" size="sm">{total}</Badge>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button onClick={fetchSessions} className="shp-icon-btn" title="Refresh">
            <RefreshCw size={14} className={loading ? 'shp-spin' : ''} />
          </button>
          <button onClick={onClose} className="shp-icon-btn" title="Close">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Session List */}
      <div className="shp-list">
        {loading && sessions.length === 0 ? (
          <div className="shp-empty">Loading sessions...</div>
        ) : sessions.length === 0 ? (
          <div className="shp-empty">No sessions found</div>
        ) : (
          sessions.map(session => {
            const config = STATUS_CONFIG[session.status] || STATUS_CONFIG.planned;
            return (
              <button
                key={session.id}
                className="shp-session-card"
                onClick={() => handleSessionClick(session)}
              >
                <div className="shp-card-top">
                  <span className="shp-session-name">{session.name}</span>
                  <span
                    className="shp-status-badge"
                    style={{ color: config.color, borderColor: `${config.color}40` }}
                  >
                    {config.icon}
                    <span>{config.label}</span>
                  </span>
                </div>
                <div className="shp-card-meta">
                  {session.site?.name && (
                    <span className="shp-meta-item">
                      <MapPin size={10} />
                      {session.site.name}
                    </span>
                  )}
                  <span className="shp-meta-item">
                    <Clock size={10} />
                    {formatDate(session.start_time || session.created_at)}
                  </span>
                  {session.duration_seconds != null && session.duration_seconds > 0 && (
                    <span className="shp-meta-item">
                      {formatDuration(session.duration_seconds)}
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>

      <style>{`
        .session-history-panel {
          position: absolute;
          top: 0;
          right: 0;
          width: 340px;
          height: 100%;
          background: rgba(12, 12, 22, 0.95);
          border-left: 1px solid rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(20px);
          z-index: 200;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .session-history-panel.hidden {
          display: none;
        }
        .shp-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          flex-shrink: 0;
        }
        .shp-icon-btn {
          background: none;
          border: none;
          color: rgba(255,255,255,0.5);
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          display: flex;
          align-items: center;
        }
        .shp-icon-btn:hover {
          color: rgba(255,255,255,0.8);
          background: rgba(255,255,255,0.05);
        }
        .shp-list {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
        }
        .shp-empty {
          padding: 32px 16px;
          text-align: center;
          color: rgba(255,255,255,0.4);
          font-size: 13px;
        }
        .shp-session-card {
          display: flex;
          flex-direction: column;
          gap: 6px;
          width: 100%;
          padding: 12px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 8px;
          cursor: pointer;
          text-align: left;
          color: #fff;
          margin-bottom: 4px;
          transition: all 0.15s ease;
        }
        .shp-session-card:hover {
          background: rgba(255,255,255,0.06);
          border-color: rgba(255, 140, 0, 0.3);
        }
        .shp-card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .shp-session-name {
          font-size: 13px;
          font-weight: 600;
          color: #fff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1;
        }
        .shp-status-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.5px;
          padding: 2px 6px;
          border: 1px solid;
          border-radius: 4px;
          flex-shrink: 0;
        }
        .shp-card-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .shp-meta-item {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          color: rgba(255,255,255,0.45);
        }
        @keyframes shp-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .shp-spin {
          animation: shp-spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
}
