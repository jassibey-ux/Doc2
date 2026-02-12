/**
 * Replay Session Selector - Modal for selecting a saved session to replay
 */

import { useState, useEffect } from 'react';
import { GlassButton, Badge } from './ui/GlassUI';
import {
  X,
  History,
  Folder,
  Clock,
  Radio,
  Database,
  RefreshCw,
  Search,
  Play,
} from 'lucide-react';

interface ReplaySession {
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

interface ReplaySessionSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (sessionId: string) => void;
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

export default function ReplaySessionSelector({
  isOpen,
  onClose,
  onSelect,
}: ReplaySessionSelectorProps) {
  const [sessions, setSessions] = useState<ReplaySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // Fetch sessions when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchSessions();
    }
  }, [isOpen]);

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

  // Handle session click
  const handleSessionClick = (session: ReplaySession) => {
    setSelectedSessionId(session.session_id);
  };

  // Handle replay button
  const handleReplay = () => {
    if (selectedSessionId) {
      onSelect(selectedSessionId);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="rss-overlay" onClick={onClose}>
      <div className="rss-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="rss-header">
          <div className="rss-title">
            <History size={20} />
            <span>Replay Session</span>
          </div>
          <button className="rss-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Search bar */}
        <div className="rss-search">
          <Search size={14} className="rss-search-icon" />
          <input
            type="text"
            placeholder="Search sessions..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="rss-search-input"
          />
          <button
            className="rss-refresh"
            onClick={fetchSessions}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'spinning' : ''} />
          </button>
        </div>

        {/* Session list */}
        <div className="rss-content">
          {loading ? (
            <div className="rss-loading">
              <div className="rss-spinner" />
              <span>Loading sessions...</span>
            </div>
          ) : error ? (
            <div className="rss-error">
              <span>{error}</span>
              <GlassButton variant="secondary" size="sm" onClick={fetchSessions}>
                Retry
              </GlassButton>
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="rss-empty">
              <Folder size={32} />
              <span>{searchQuery ? 'No matching sessions' : 'No sessions found'}</span>
              <span className="rss-empty-hint">
                Record a test session to enable replay
              </span>
            </div>
          ) : (
            <div className="rss-list">
              {filteredSessions.map(session => (
                <div
                  key={session.session_id}
                  className={`rss-item ${selectedSessionId === session.session_id ? 'selected' : ''}`}
                  onClick={() => handleSessionClick(session)}
                  onDoubleClick={() => onSelect(session.session_id)}
                >
                  <div className="rss-item-main">
                    <div className="rss-item-name">{session.name}</div>
                    <div className="rss-item-meta">
                      <span className="rss-meta-item">
                        <Clock size={11} />
                        {formatDuration(session.duration_seconds)}
                      </span>
                      <span className="rss-meta-item">
                        <Radio size={11} />
                        {session.tracker_ids.length} trackers
                      </span>
                      <span className="rss-meta-item">
                        <Database size={11} />
                        {session.total_records.toLocaleString()} records
                      </span>
                    </div>
                    <div className="rss-item-trackers">
                      {session.tracker_ids.slice(0, 3).map(id => (
                        <Badge key={id} color="gray" size="sm">{id}</Badge>
                      ))}
                      {session.tracker_ids.length > 3 && (
                        <Badge color="gray" size="sm">+{session.tracker_ids.length - 3}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="rss-item-right">
                    <span className="rss-item-date">
                      {formatRelativeTime(session.start_time)}
                    </span>
                    <span className="rss-item-size">{formatSize(session.size_bytes)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="rss-footer">
          <span className="rss-count">
            {filteredSessions.length} session{filteredSessions.length !== 1 ? 's' : ''} available
          </span>
          <div className="rss-actions">
            <GlassButton variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </GlassButton>
            <GlassButton
              variant="primary"
              size="sm"
              onClick={handleReplay}
              disabled={!selectedSessionId}
              style={{
                background: selectedSessionId ? 'rgba(59, 130, 246, 0.2)' : undefined,
                borderColor: selectedSessionId ? 'rgba(59, 130, 246, 0.4)' : undefined,
                color: selectedSessionId ? '#3b82f6' : undefined,
              }}
            >
              <Play size={14} />
              Replay
            </GlassButton>
          </div>
        </div>
      </div>

      <style>{`
        .rss-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .rss-modal {
          background: rgba(20, 20, 35, 0.98);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          width: 90%;
          max-width: 560px;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        }

        .rss-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .rss-title {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 16px;
          font-weight: 600;
          color: #fff;
        }

        .rss-title svg {
          color: #3b82f6;
        }

        .rss-close {
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.5);
          cursor: pointer;
          padding: 6px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s;
        }

        .rss-close:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }

        .rss-search {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .rss-search-icon {
          color: rgba(255, 255, 255, 0.4);
        }

        .rss-search-input {
          flex: 1;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          padding: 8px 12px;
          color: #fff;
          font-size: 13px;
          outline: none;
        }

        .rss-search-input::placeholder {
          color: rgba(255, 255, 255, 0.4);
        }

        .rss-search-input:focus {
          border-color: rgba(59, 130, 246, 0.4);
        }

        .rss-refresh {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          padding: 8px;
          color: rgba(255, 255, 255, 0.6);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s;
        }

        .rss-refresh:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }

        .rss-refresh:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .rss-refresh .spinning {
          animation: rss-spin 1s linear infinite;
        }

        @keyframes rss-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .rss-content {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
          min-height: 200px;
        }

        .rss-loading, .rss-error, .rss-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 40px 20px;
          color: rgba(255, 255, 255, 0.5);
          text-align: center;
        }

        .rss-spinner {
          width: 32px;
          height: 32px;
          border: 3px solid rgba(59, 130, 246, 0.2);
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: rss-spin 1s linear infinite;
        }

        .rss-empty-hint {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.3);
        }

        .rss-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .rss-item {
          display: flex;
          justify-content: space-between;
          padding: 12px 14px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid transparent;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .rss-item:hover {
          background: rgba(255, 255, 255, 0.05);
        }

        .rss-item.selected {
          background: rgba(59, 130, 246, 0.1);
          border-color: rgba(59, 130, 246, 0.3);
        }

        .rss-item-main {
          flex: 1;
          min-width: 0;
        }

        .rss-item-name {
          font-size: 14px;
          font-weight: 500;
          color: #fff;
          margin-bottom: 6px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .rss-item-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 8px;
        }

        .rss-meta-item {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
        }

        .rss-item-trackers {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }

        .rss-item-right {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 4px;
          margin-left: 16px;
        }

        .rss-item-date {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.4);
        }

        .rss-item-size {
          font-size: 10px;
          color: rgba(255, 255, 255, 0.3);
        }

        .rss-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 20px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .rss-count {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.4);
        }

        .rss-actions {
          display: flex;
          gap: 8px;
        }
      `}</style>
    </div>
  );
}
