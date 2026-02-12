/**
 * Replay Session Browser Panel - Left sidebar panel for browsing and selecting sessions
 */

import { useState, useEffect } from 'react';
import { Badge } from './ui/GlassUI';
import {
  History,
  Folder,
  Clock,
  Radio,
  Database,
  RefreshCw,
  Search,
} from 'lucide-react';

export interface ReplaySession {
  session_id: string;
  name: string;
  start_time: string;
  end_time: string;
  duration_seconds: number;
  tracker_ids: string[];
  file_count: number;
  total_records: number;
  size_bytes: number;
}

interface ReplaySessionBrowserPanelProps {
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  disabled?: boolean;
}

// Format duration as HH:MM:SS
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

// Format file size
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Format relative time
function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function ReplaySessionBrowserPanel({
  selectedSessionId,
  onSelectSession,
  disabled = false,
}: ReplaySessionBrowserPanelProps) {
  const [sessions, setSessions] = useState<ReplaySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch sessions on mount
  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/replay/sessions');
      const data = await res.json();

      if (data.sessions) {
        setSessions(data.sessions);
      } else {
        setSessions([]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load sessions');
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  // Filter sessions by search query
  const filteredSessions = sessions.filter(session => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      session.name.toLowerCase().includes(query) ||
      session.session_id.toLowerCase().includes(query) ||
      session.tracker_ids.some(id => id.toLowerCase().includes(query))
    );
  });

  return (
    <div className="rsbp-container">
      {/* Header */}
      <div className="rsbp-header">
        <div className="rsbp-title">
          <History size={16} />
          <span>Sessions</span>
        </div>
        <button
          className="rsbp-refresh"
          onClick={fetchSessions}
          disabled={loading || disabled}
          title="Refresh"
        >
          <RefreshCw size={14} className={loading ? 'spinning' : ''} />
        </button>
      </div>

      {/* Search bar */}
      <div className="rsbp-search">
        <Search size={12} className="rsbp-search-icon" />
        <input
          type="text"
          placeholder="Search..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="rsbp-search-input"
          disabled={disabled}
        />
      </div>

      {/* Session list */}
      <div className="rsbp-content">
        {loading ? (
          <div className="rsbp-loading">
            <div className="rsbp-spinner" />
            <span>Loading...</span>
          </div>
        ) : error ? (
          <div className="rsbp-error">
            <span>{error}</span>
            <button className="rsbp-retry" onClick={fetchSessions}>
              Retry
            </button>
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="rsbp-empty">
            <Folder size={24} />
            <span>{searchQuery ? 'No matches' : 'No sessions'}</span>
          </div>
        ) : (
          <div className="rsbp-list">
            {filteredSessions.map(session => (
              <div
                key={session.session_id}
                className={`rsbp-item ${selectedSessionId === session.session_id ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
                onClick={() => !disabled && onSelectSession(session.session_id)}
              >
                <div className="rsbp-item-name">{session.name}</div>
                <div className="rsbp-item-meta">
                  <span className="rsbp-meta-item">
                    <Clock size={10} />
                    {formatDuration(session.duration_seconds)}
                  </span>
                  <span className="rsbp-meta-item">
                    <Radio size={10} />
                    {session.tracker_ids.length}
                  </span>
                  <span className="rsbp-meta-item">
                    <Database size={10} />
                    {session.total_records.toLocaleString()}
                  </span>
                </div>
                <div className="rsbp-item-trackers">
                  {session.tracker_ids.slice(0, 2).map(id => (
                    <Badge key={id} color="gray" size="sm">{id}</Badge>
                  ))}
                  {session.tracker_ids.length > 2 && (
                    <Badge color="gray" size="sm">+{session.tracker_ids.length - 2}</Badge>
                  )}
                </div>
                <div className="rsbp-item-footer">
                  <span className="rsbp-item-date">{formatRelativeTime(session.start_time)}</span>
                  <span className="rsbp-item-size">{formatSize(session.size_bytes)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="rsbp-footer">
        <span className="rsbp-count">
          {filteredSessions.length} session{filteredSessions.length !== 1 ? 's' : ''}
        </span>
      </div>

      <style>{`
        .rsbp-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: rgba(15, 15, 25, 0.95);
          border-right: 1px solid rgba(255, 255, 255, 0.08);
        }

        .rsbp-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 14px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }

        .rsbp-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 600;
          color: #fff;
        }

        .rsbp-title svg {
          color: #3b82f6;
        }

        .rsbp-refresh {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 5px;
          padding: 5px;
          color: rgba(255, 255, 255, 0.6);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s;
        }

        .rsbp-refresh:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }

        .rsbp-refresh:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .rsbp-refresh .spinning {
          animation: rsbp-spin 1s linear infinite;
        }

        @keyframes rsbp-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .rsbp-search {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .rsbp-search-icon {
          color: rgba(255, 255, 255, 0.3);
        }

        .rsbp-search-input {
          flex: 1;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 5px;
          padding: 6px 10px;
          color: #fff;
          font-size: 12px;
          outline: none;
        }

        .rsbp-search-input::placeholder {
          color: rgba(255, 255, 255, 0.3);
        }

        .rsbp-search-input:focus {
          border-color: rgba(59, 130, 246, 0.4);
        }

        .rsbp-search-input:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .rsbp-content {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
        }

        .rsbp-loading, .rsbp-error, .rsbp-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 30px 15px;
          color: rgba(255, 255, 255, 0.4);
          text-align: center;
          font-size: 12px;
        }

        .rsbp-spinner {
          width: 24px;
          height: 24px;
          border: 2px solid rgba(59, 130, 246, 0.2);
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: rsbp-spin 1s linear infinite;
        }

        .rsbp-retry {
          background: rgba(59, 130, 246, 0.2);
          border: 1px solid rgba(59, 130, 246, 0.3);
          border-radius: 4px;
          padding: 4px 10px;
          color: #3b82f6;
          font-size: 11px;
          cursor: pointer;
          margin-top: 4px;
        }

        .rsbp-retry:hover {
          background: rgba(59, 130, 246, 0.3);
        }

        .rsbp-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .rsbp-item {
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid transparent;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .rsbp-item:hover:not(.disabled) {
          background: rgba(255, 255, 255, 0.05);
        }

        .rsbp-item.selected {
          background: rgba(59, 130, 246, 0.1);
          border-color: rgba(59, 130, 246, 0.3);
        }

        .rsbp-item.disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .rsbp-item-name {
          font-size: 13px;
          font-weight: 500;
          color: #fff;
          margin-bottom: 5px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .rsbp-item-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 6px;
        }

        .rsbp-meta-item {
          display: flex;
          align-items: center;
          gap: 3px;
          font-size: 10px;
          color: rgba(255, 255, 255, 0.45);
        }

        .rsbp-item-trackers {
          display: flex;
          flex-wrap: wrap;
          gap: 3px;
          margin-bottom: 6px;
        }

        .rsbp-item-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .rsbp-item-date {
          font-size: 10px;
          color: rgba(255, 255, 255, 0.35);
        }

        .rsbp-item-size {
          font-size: 9px;
          color: rgba(255, 255, 255, 0.25);
        }

        .rsbp-footer {
          padding: 10px 14px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }

        .rsbp-count {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.35);
        }
      `}</style>
    </div>
  );
}
