import { useState, useMemo } from 'react';
import { useSessions, Session } from '../contexts/SessionContext';
import { GlassCard, GlassInput, Badge, GlassDivider, StatusDot } from './ui/GlassUI';
import { Folder, FileText, RefreshCw, Search, ChevronRight, Clock, Database, Radio } from 'lucide-react';

interface SessionBrowserProps {
  onSelectTracker?: (trackerId: string, sessionName?: string) => void;
  onSelectFile?: (filePath: string, fileName: string) => void;
}

export default function SessionBrowser({ onSelectTracker, onSelectFile }: SessionBrowserProps) {
  const {
    sessions,
    selectedSession,
    sessionFiles,
    loading,
    refreshSessions,
    selectSession,
  } = useSessions();

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  // Filter sessions by search query
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;

    const query = searchQuery.toLowerCase();
    return sessions.filter(
      (s) =>
        s.name.toLowerCase().includes(query) ||
        s.tracker_ids.some((id) => id.toLowerCase().includes(query))
    );
  }, [sessions, searchQuery]);

  // Format file size
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Format relative time
  const formatRelativeTime = (isoDate: string): string => {
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
  };

  // Handle session click
  const handleSessionClick = (session: Session) => {
    if (selectedSession?.name === session.name) {
      // Toggle expand/collapse
      setExpandedSession(expandedSession === session.name ? null : session.name);
    } else {
      selectSession(session);
      setExpandedSession(session.name);
    }
  };

  // Handle tracker click
  const handleTrackerClick = (e: React.MouseEvent, trackerId: string, sessionName: string) => {
    e.stopPropagation(); // Prevent event bubbling to parent card
    onSelectTracker?.(trackerId, sessionName);
  };

  // Handle file click
  const handleFileClick = (e: React.MouseEvent, filePath: string, fileName: string) => {
    e.stopPropagation(); // Prevent event bubbling to parent card
    e.preventDefault();
    console.log('[SessionBrowser] File clicked:', filePath, fileName);
    if (onSelectFile) {
      onSelectFile(filePath, fileName);
    }
  };

  return (
    <div className="session-browser">
      {/* Header */}
      <div className="session-browser-header">
        <div className="header-title">
          <Folder size={18} />
          <span>Sessions</span>
        </div>
        <button
          className="refresh-btn"
          onClick={refreshSessions}
          disabled={loading}
          title="Refresh sessions"
        >
          <RefreshCw size={14} className={loading ? 'spinning' : ''} />
        </button>
      </div>

      {/* Search */}
      <div className="session-search">
        <Search size={14} className="search-icon" />
        <GlassInput
          placeholder="Search sessions or trackers..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ paddingLeft: '32px' }}
        />
      </div>

      {/* Session List */}
      <div className="session-list">
        {filteredSessions.length === 0 ? (
          <div className="empty-state">
            <Folder size={32} />
            <p>{searchQuery ? 'No matching sessions' : 'No sessions found'}</p>
          </div>
        ) : (
          filteredSessions.map((session) => (
            <div key={session.name} className="session-item-wrapper">
              <GlassCard
                selected={selectedSession?.name === session.name}
                onClick={() => handleSessionClick(session)}
                style={{ marginBottom: '8px' }}
              >
                <div className="session-item">
                  <div className="session-info">
                    <div className="session-name">
                      <ChevronRight
                        size={14}
                        className={`expand-icon ${expandedSession === session.name ? 'expanded' : ''}`}
                      />
                      <span>{session.name}</span>
                      {session.is_active && (
                        <StatusDot status="online" size={6} />
                      )}
                    </div>
                    <div className="session-meta">
                      <span className="meta-item">
                        <FileText size={11} />
                        {session.file_count} files
                      </span>
                      <span className="meta-item">
                        <Radio size={11} />
                        {session.tracker_count} trackers
                      </span>
                      <span className="meta-item">
                        <Clock size={11} />
                        {formatRelativeTime(session.last_modified)}
                      </span>
                    </div>
                  </div>
                  <div className="session-badges">
                    {session.is_active && (
                      <Badge color="green" size="sm">LIVE</Badge>
                    )}
                    <span className="session-size">{formatSize(session.total_size_bytes)}</span>
                  </div>
                </div>
              </GlassCard>

              {/* Expanded Content - Trackers */}
              {expandedSession === session.name && (
                <div className="session-expanded">
                  <div className="tracker-list">
                    <div className="tracker-list-header">
                      <Radio size={12} />
                      <span>Trackers</span>
                    </div>
                    {session.tracker_ids.map((trackerId) => (
                      <div
                        key={trackerId}
                        className="tracker-item"
                        onClick={(e) => handleTrackerClick(e, trackerId, session.name)}
                      >
                        <span className="tracker-id">{trackerId}</span>
                        <ChevronRight size={12} />
                      </div>
                    ))}
                  </div>

                  {/* Files list */}
                  {sessionFiles.length > 0 && (
                    <>
                      <GlassDivider style={{ margin: '8px 0' }} />
                      <div className="files-list">
                        <div className="files-header">
                          <Database size={12} />
                          <span>Files ({sessionFiles.length})</span>
                        </div>
                        <div className="files-scroll">
                          {sessionFiles.map((file) => (
                            <div
                              key={file.name}
                              className="file-item clickable"
                              onClick={(e) => handleFileClick(e, file.path, file.name)}
                            >
                              <FileText size={12} />
                              <span className="file-name">{file.name}</span>
                              <span className="file-size">{formatSize(file.size_bytes)}</span>
                              <ChevronRight size={10} className="file-arrow" />
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <style>{`
        .session-browser {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
        }

        .session-browser-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .header-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          font-size: 14px;
          color: #fff;
        }

        .refresh-btn {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          padding: 6px;
          color: rgba(255, 255, 255, 0.7);
          cursor: pointer;
          transition: all 0.2s;
        }

        .refresh-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }

        .refresh-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .refresh-btn .spinning {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .session-search {
          position: relative;
          padding: 12px 16px;
        }

        .search-icon {
          position: absolute;
          left: 26px;
          top: 50%;
          transform: translateY(-50%);
          color: rgba(255, 255, 255, 0.4);
        }

        .session-list {
          flex: 1;
          overflow-y: auto;
          padding: 0 16px 16px;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 20px;
          color: rgba(255, 255, 255, 0.4);
          text-align: center;
        }

        .empty-state p {
          margin-top: 12px;
          font-size: 13px;
        }

        .session-item {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .session-info {
          flex: 1;
          min-width: 0;
        }

        .session-name {
          display: flex;
          align-items: center;
          gap: 6px;
          font-weight: 500;
          font-size: 13px;
          color: #fff;
          margin-bottom: 6px;
        }

        .expand-icon {
          transition: transform 0.2s;
          color: rgba(255, 255, 255, 0.5);
        }

        .expand-icon.expanded {
          transform: rotate(90deg);
        }

        .session-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }

        .meta-item {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
        }

        .session-badges {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 6px;
        }

        .session-size {
          font-size: 10px;
          color: rgba(255, 255, 255, 0.4);
        }

        .session-expanded {
          padding: 12px 16px;
          margin-left: 20px;
          margin-bottom: 8px;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 8px;
          border-left: 2px solid rgba(255, 140, 0, 0.4);
        }

        .tracker-list-header,
        .files-header {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.6);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
        }

        .tracker-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 10px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 6px;
          margin-bottom: 4px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .tracker-item:hover {
          background: rgba(255, 140, 0, 0.1);
        }

        .tracker-id {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.8);
          font-family: monospace;
        }

        .files-list {
          margin-top: 4px;
        }

        .files-scroll {
          max-height: 200px;
          overflow-y: auto;
        }

        .file-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 8px;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.6);
          border-radius: 4px;
          margin-bottom: 2px;
        }

        .file-item.clickable {
          cursor: pointer;
          transition: all 0.15s;
        }

        .file-item.clickable:hover {
          background: rgba(255, 140, 0, 0.15);
          color: rgba(255, 255, 255, 0.9);
        }

        .file-item.clickable:hover .file-arrow {
          opacity: 1;
          color: #ff8c00;
        }

        .file-name {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .file-size {
          color: rgba(255, 255, 255, 0.4);
          font-size: 10px;
        }

        .file-arrow {
          opacity: 0.3;
          transition: all 0.15s;
        }
      `}</style>
    </div>
  );
}
