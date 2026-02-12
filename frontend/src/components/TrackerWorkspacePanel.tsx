/**
 * Tracker Workspace Panel
 * Right-docked panel for comprehensive tracker monitoring
 *
 * Features:
 * - Tab 1: Trackers - List view with fleet stats, detail view when selected
 * - Tab 2: Alerts - Filtered anomaly alerts with time-based filtering
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  X,
  Zap,
  Search,
  ChevronLeft,
  MapPin,
  Navigation,
  Satellite,
  Radio,
  Battery,
  Thermometer,
  Clock,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle,
  Bell,
  Pencil,
  Check,
} from 'lucide-react';
import { GlassCard, Badge, StatusDot, DataRow, GlassInput } from './ui/GlassUI';
import { GPSHealthIndicator, GPSHealthBadge } from './GPSHealthIndicator';
import TrackerMetricsDisplay from './TrackerMetricsDisplay';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useTestSessionPhase } from '../contexts/TestSessionPhaseContext';
import type { DroneState, DroneSummary } from '../types/drone';
import type { AlertLevel } from '../types/workflow';

interface TrackerWorkspacePanelProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTrackerId?: string | null;
  onSelectTracker?: (id: string | null) => void;
}

type TabId = 'trackers' | 'alerts';
type TimeFilter = '1h' | '4h' | '24h' | 'all';

// Alert icons and colors
const ALERT_ICONS: Record<AlertLevel, React.ReactNode> = {
  info: <Info size={14} />,
  warning: <AlertCircle size={14} />,
  critical: <AlertTriangle size={14} />,
};

const ALERT_COLORS: Record<AlertLevel, string> = {
  info: '#3b82f6',
  warning: '#f59e0b',
  critical: '#ef4444',
};

export default function TrackerWorkspacePanel({
  isOpen,
  onClose,
  selectedTrackerId,
  onSelectTracker,
}: TrackerWorkspacePanelProps) {
  const { drones, anomalyAlerts, acknowledgeAnomalyAlert } = useWebSocket();
  const { activeSessionId } = useTestSessionPhase();

  // Tab state
  const [activeTab, setActiveTab] = useState<TabId>('trackers');

  // Trackers tab state
  const [searchQuery, setSearchQuery] = useState('');
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const [fullTrackerState, setFullTrackerState] = useState<DroneState | null>(null);
  const [isLoadingState, setIsLoadingState] = useState(false);

  // Alerts tab state
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('4h');
  const [acknowledgedAlerts, setAcknowledgedAlerts] = useState<Set<string>>(new Set());

  // Use external or internal selection
  const effectiveSelectedId = selectedTrackerId ?? internalSelectedId;

  // Handle tracker selection
  const handleSelectTracker = useCallback((trackerId: string | null) => {
    setInternalSelectedId(trackerId);
    onSelectTracker?.(trackerId);
  }, [onSelectTracker]);

  // Fetch full tracker state when selected
  useEffect(() => {
    if (!effectiveSelectedId) {
      setFullTrackerState(null);
      return;
    }

    let cancelled = false;
    const fetchState = async () => {
      setIsLoadingState(true);
      try {
        const response = await fetch(`/api/trackers/${effectiveSelectedId}`);
        if (response.ok && !cancelled) {
          const data = await response.json();
          setFullTrackerState(data);
        }
      } catch (err) {
        console.error('Failed to fetch tracker state:', err);
      } finally {
        if (!cancelled) setIsLoadingState(false);
      }
    };

    fetchState();

    // Poll every 2 seconds
    const interval = setInterval(fetchState, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [effectiveSelectedId]);

  // Fleet stats
  const fleetStats = useMemo(() => {
    let active = 0, stale = 0, gpsHealthy = 0, gpsDegraded = 0, gpsLost = 0;
    for (const drone of drones.values()) {
      if (drone.is_stale) stale++;
      else active++;

      const gpsStatus = drone.gps_health?.health_status ?? 'healthy';
      if (gpsStatus === 'healthy') gpsHealthy++;
      else if (gpsStatus === 'degraded') gpsDegraded++;
      else gpsLost++;
    }
    return { active, stale, gpsHealthy, gpsDegraded, gpsLost, total: drones.size };
  }, [drones]);

  // Filtered and sorted trackers
  const sortedTrackers = useMemo(() => {
    const list = Array.from(drones.values());

    // Filter by search (matches both alias and tracker_id)
    const filtered = searchQuery
      ? list.filter(d => {
          const query = searchQuery.toLowerCase();
          const matchesId = d.tracker_id.toLowerCase().includes(query);
          const matchesAlias = d.alias?.toLowerCase().includes(query) ?? false;
          return matchesId || matchesAlias;
        })
      : list;

    // Sort: active first, then by ID
    return filtered.sort((a, b) => {
      if (a.is_stale !== b.is_stale) return a.is_stale ? 1 : -1;
      return a.tracker_id.localeCompare(b.tracker_id, undefined, { numeric: true });
    });
  }, [drones, searchQuery]);

  // Filtered alerts
  const filteredAlerts = useMemo(() => {
    let result = [...anomalyAlerts];

    // Filter by selected tracker
    if (effectiveSelectedId) {
      result = result.filter(a => a.tracker_id === effectiveSelectedId);
    }

    // Filter by time
    const now = Date.now();
    const cutoffs: Record<TimeFilter, number> = {
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      'all': Infinity,
    };
    const cutoff = now - cutoffs[timeFilter];
    result = result.filter(a => new Date(a.timestamp).getTime() > cutoff);

    // Sort by timestamp descending
    return result.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [anomalyAlerts, effectiveSelectedId, timeFilter]);

  // Unacknowledged alert count
  const unacknowledgedCount = useMemo(() => {
    return anomalyAlerts.filter(a => !acknowledgedAlerts.has(a.id)).length;
  }, [anomalyAlerts, acknowledgedAlerts]);

  // Handle alert acknowledge
  const handleAcknowledge = useCallback((alertId: string) => {
    setAcknowledgedAlerts(prev => new Set([...prev, alertId]));
    acknowledgeAnomalyAlert(alertId);
  }, [acknowledgeAnomalyAlert]);

  // Format helpers
  const formatAge = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
  };

  const formatCoords = (lat: number | null, lon: number | null): string => {
    if (lat === null || lon === null) return 'No position';
    return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  };

  const formatTime = (timestamp: string): string => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  // Tab definitions
  const tabs = [
    { id: 'trackers' as TabId, label: 'Trackers', icon: <Zap size={14} />, badge: drones.size },
    { id: 'alerts' as TabId, label: 'Alerts', icon: <Bell size={14} />, badge: unacknowledgedCount },
  ];

  // Early return when closed
  if (!isOpen) {
    return <div className="tracker-workspace-panel hidden" />;
  }

  return (
    <div className="tracker-workspace-panel">
      {/* Header */}
      <div className="panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Zap size={18} style={{ color: '#ff8c00' }} />
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', margin: 0 }}>
            Tracker Monitor
          </h2>
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
          <X size={18} />
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="workspace-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`workspace-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="tab-badge">{tab.badge > 99 ? '99+' : tab.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="workspace-content">
        {/* ===== TRACKERS TAB ===== */}
        {activeTab === 'trackers' && (
          <div className="trackers-tab-content">
            {/* Detail View */}
            {effectiveSelectedId && fullTrackerState ? (
              <TrackerDetailView
                tracker={fullTrackerState}
                isLoading={isLoadingState}
                onBack={() => handleSelectTracker(null)}
                activeSessionId={activeSessionId}
              />
            ) : (
              /* List View */
              <>
                {/* Fleet Stats Header */}
                <div className="fleet-stats-header">
                  <div className="fleet-stat">
                    <div className="fleet-stat-value" style={{ color: '#22c55e' }}>{fleetStats.active}</div>
                    <div className="fleet-stat-label">Active</div>
                  </div>
                  <div className="fleet-stat">
                    <div className="fleet-stat-value" style={{ color: fleetStats.stale > 0 ? '#ef4444' : 'rgba(255,255,255,0.3)' }}>
                      {fleetStats.stale}
                    </div>
                    <div className="fleet-stat-label">Stale</div>
                  </div>
                  <div className="fleet-stat">
                    <div className="fleet-stat-value">
                      <span style={{ color: '#22c55e' }}>{fleetStats.gpsHealthy}</span>
                      <span style={{ color: 'rgba(255,255,255,0.3)' }}>/</span>
                      <span style={{ color: fleetStats.gpsDegraded > 0 ? '#eab308' : 'rgba(255,255,255,0.3)' }}>{fleetStats.gpsDegraded}</span>
                      <span style={{ color: 'rgba(255,255,255,0.3)' }}>/</span>
                      <span style={{ color: fleetStats.gpsLost > 0 ? '#ef4444' : 'rgba(255,255,255,0.3)' }}>{fleetStats.gpsLost}</span>
                    </div>
                    <div className="fleet-stat-label">GPS Health</div>
                  </div>
                </div>

                {/* Search */}
                <div style={{ marginBottom: '12px' }}>
                  <div className="relative">
                    <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)' }} />
                    <GlassInput
                      placeholder="Search trackers..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      style={{ paddingLeft: '36px' }}
                    />
                  </div>
                </div>

                {/* Tracker List */}
                <div className="tracker-list" style={{ overflowY: 'auto', flex: 1 }}>
                  {sortedTrackers.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'rgba(255,255,255,0.4)' }}>
                      <Zap size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
                      <div style={{ fontSize: '14px', marginBottom: '4px' }}>No Trackers</div>
                      <div style={{ fontSize: '12px' }}>
                        {searchQuery ? 'No trackers match your search' : 'Waiting for tracker data...'}
                      </div>
                    </div>
                  ) : (
                    sortedTrackers.map(tracker => (
                      <TrackerListItem
                        key={tracker.tracker_id}
                        tracker={tracker}
                        isSelected={effectiveSelectedId === tracker.tracker_id}
                        onClick={() => handleSelectTracker(tracker.tracker_id)}
                        formatAge={formatAge}
                        formatCoords={formatCoords}
                      />
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ===== ALERTS TAB ===== */}
        {activeTab === 'alerts' && (
          <div className="alerts-tab-content">
            {/* Time Filter */}
            <div className="alert-time-filter">
              {(['1h', '4h', '24h', 'all'] as TimeFilter[]).map(tf => (
                <button
                  key={tf}
                  className={`time-filter-btn ${timeFilter === tf ? 'active' : ''}`}
                  onClick={() => setTimeFilter(tf)}
                >
                  {tf === 'all' ? 'All' : tf.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Selected Tracker Indicator */}
            {effectiveSelectedId && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                background: 'rgba(255, 140, 0, 0.1)',
                border: '1px solid rgba(255, 140, 0, 0.3)',
                borderRadius: '8px',
                marginBottom: '12px',
              }}>
                <span style={{ fontSize: '12px', color: '#ff8c00' }}>
                  Showing alerts for #{effectiveSelectedId}
                </span>
                <button
                  onClick={() => handleSelectTracker(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(255,255,255,0.5)',
                    cursor: 'pointer',
                    padding: '2px',
                    fontSize: '11px',
                  }}
                >
                  Clear
                </button>
              </div>
            )}

            {/* Alert List */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {filteredAlerts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'rgba(255,255,255,0.4)' }}>
                  <Bell size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
                  <div style={{ fontSize: '14px', marginBottom: '4px' }}>No Alerts</div>
                  <div style={{ fontSize: '12px' }}>
                    {effectiveSelectedId
                      ? `No alerts for tracker #${effectiveSelectedId}`
                      : 'No alerts in the selected time range'}
                  </div>
                </div>
              ) : (
                filteredAlerts.map(alert => (
                  <GlassCard
                    key={alert.id}
                    style={{
                      marginBottom: '8px',
                      padding: '12px',
                      borderLeft: `3px solid ${ALERT_COLORS[alert.level]}`,
                      opacity: acknowledgedAlerts.has(alert.id) ? 0.6 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <span style={{ color: ALERT_COLORS[alert.level], flexShrink: 0, marginTop: '2px' }}>
                        {ALERT_ICONS[alert.level]}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', color: '#fff', marginBottom: '4px' }}>
                          {alert.message}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>
                            {formatTime(alert.timestamp)}
                          </span>
                          {!effectiveSelectedId && alert.tracker_id && (
                            <Badge color="blue" size="sm">#{alert.tracker_id}</Badge>
                          )}
                          <Badge
                            color={alert.level === 'critical' ? 'red' : alert.level === 'warning' ? 'yellow' : 'blue'}
                            size="sm"
                          >
                            {alert.type.replace(/_/g, ' ').toUpperCase()}
                          </Badge>
                        </div>
                      </div>
                      {!acknowledgedAlerts.has(alert.id) && (
                        <button
                          onClick={() => handleAcknowledge(alert.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#22c55e',
                            cursor: 'pointer',
                            padding: '2px',
                          }}
                          title="Acknowledge"
                        >
                          <CheckCircle size={16} />
                        </button>
                      )}
                    </div>
                  </GlassCard>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Tracker List Item Component
// ============================================================================

interface TrackerListItemProps {
  tracker: DroneSummary;
  isSelected: boolean;
  onClick: () => void;
  formatAge: (s: number) => string;
  formatCoords: (lat: number | null, lon: number | null) => string;
}

function TrackerListItem({ tracker, isSelected, onClick, formatAge, formatCoords }: TrackerListItemProps) {
  // Display alias if set, otherwise show tracker_id
  const displayName = tracker.alias || `#${tracker.tracker_id}`;
  const showSecondaryId = !!tracker.alias; // Show tracker_id as secondary if alias is set

  return (
    <div
      className={`tracker-list-item ${isSelected ? 'selected' : ''} ${tracker.is_stale ? 'stale' : ''}`}
      onClick={onClick}
    >
      <StatusDot status={tracker.is_stale ? 'offline' : 'online'} pulse={!tracker.is_stale} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>{displayName}</span>
          {showSecondaryId && (
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>#{tracker.tracker_id}</span>
          )}
          {tracker.is_stale && <Badge color="red" size="sm">LOST</Badge>}
          {tracker.battery_critical && <Badge color="red" size="sm">CRITICAL</Badge>}
          {tracker.low_battery && !tracker.battery_critical && <Badge color="yellow" size="sm">LOW BAT</Badge>}
          {tracker.gps_health && !tracker.is_stale && <GPSHealthBadge health={tracker.gps_health} />}
        </div>
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
          {tracker.is_stale && tracker.last_known_lat && tracker.last_known_lon
            ? `Last: ${formatCoords(tracker.last_known_lat, tracker.last_known_lon)}`
            : formatCoords(tracker.lat, tracker.lon)}
        </div>
      </div>

      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
          {formatAge(tracker.age_seconds)}
        </div>
        {tracker.rssi_dbm !== null && (
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>
            {tracker.rssi_dbm} dBm
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Tracker Detail View Component
// ============================================================================

interface TrackerDetailViewProps {
  tracker: DroneState;
  isLoading: boolean;
  onBack: () => void;
  onAliasUpdated?: () => void;
  activeSessionId?: string | null;
}

function TrackerDetailView({ tracker, isLoading, onBack, onAliasUpdated, activeSessionId }: TrackerDetailViewProps) {
  // Alias editing state
  const [isEditingAlias, setIsEditingAlias] = useState(false);
  const [aliasValue, setAliasValue] = useState(tracker.alias || '');
  const [aliasId, setAliasId] = useState<string | null>(null);
  const [isSavingAlias, setIsSavingAlias] = useState(false);

  // Fetch existing alias on mount
  useEffect(() => {
    const fetchAlias = async () => {
      try {
        const response = await fetch(`/api/tracker-aliases/by-tracker/${tracker.tracker_id}`);
        if (response.ok) {
          const data = await response.json();
          setAliasValue(data.alias || '');
          setAliasId(data.id || null);
        } else if (response.status === 404) {
          // No alias exists yet
          setAliasValue('');
          setAliasId(null);
        }
      } catch (err) {
        console.error('Failed to fetch tracker alias:', err);
      }
    };
    fetchAlias();
  }, [tracker.tracker_id]);

  // Handle save alias
  const handleSaveAlias = async () => {
    if (isSavingAlias) return;
    setIsSavingAlias(true);

    try {
      const trimmedAlias = aliasValue.trim();

      if (aliasId) {
        // Update existing alias
        if (trimmedAlias) {
          const response = await fetch(`/api/tracker-aliases/${aliasId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ alias: trimmedAlias }),
          });
          if (!response.ok) throw new Error('Failed to update alias');
        } else {
          // Delete alias if empty
          const response = await fetch(`/api/tracker-aliases/${aliasId}`, {
            method: 'DELETE',
          });
          if (!response.ok) throw new Error('Failed to delete alias');
          setAliasId(null);
        }
      } else if (trimmedAlias) {
        // Create new alias
        const response = await fetch('/api/tracker-aliases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tracker_id: tracker.tracker_id,
            alias: trimmedAlias,
          }),
        });
        if (!response.ok) throw new Error('Failed to create alias');
        const data = await response.json();
        setAliasId(data.id);
      }

      setIsEditingAlias(false);
      onAliasUpdated?.();
    } catch (err) {
      console.error('Failed to save alias:', err);
    } finally {
      setIsSavingAlias(false);
    }
  };

  // Handle cancel edit
  const handleCancelEdit = () => {
    setAliasValue(tracker.alias || '');
    setIsEditingAlias(false);
  };

  // Handle key press in input
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveAlias();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const formatVoltage = (mv: number | null): string => {
    if (mv === null) return 'N/A';
    return `${(mv / 1000).toFixed(2)}V`;
  };

  const formatCoord = (value: number | null, type: 'lat' | 'lon'): string => {
    if (value === null) return 'N/A';
    const dir = type === 'lat' ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W');
    return `${Math.abs(value).toFixed(6)}° ${dir}`;
  };

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
    return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
  };

  const batteryPercent = tracker.battery_mv
    ? Math.max(0, Math.min(100, ((tracker.battery_mv - 3000) / 1200) * 100))
    : null;

  return (
    <div className="tracker-detail-view">
      {/* Header */}
      <div className="tracker-detail-header">
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.7)',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <ChevronLeft size={18} />
          <span style={{ fontSize: '12px' }}>Back</span>
        </button>
        {isLoading && (
          <div className="loading-spinner-small" style={{ marginLeft: 'auto' }} />
        )}
      </div>

      {/* Editable Alias Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        {isEditingAlias ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="text"
              value={aliasValue}
              onChange={(e) => setAliasValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter alias name..."
              autoFocus
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255, 140, 0, 0.5)',
                borderRadius: '6px',
                padding: '8px 12px',
                color: '#fff',
                fontSize: '16px',
                fontWeight: 600,
                outline: 'none',
              }}
            />
            <button
              onClick={handleSaveAlias}
              disabled={isSavingAlias}
              style={{
                background: 'rgba(34, 197, 94, 0.2)',
                border: '1px solid rgba(34, 197, 94, 0.5)',
                borderRadius: '6px',
                padding: '8px',
                cursor: isSavingAlias ? 'wait' : 'pointer',
                color: '#22c55e',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Save"
            >
              <Check size={16} />
            </button>
            <button
              onClick={handleCancelEdit}
              disabled={isSavingAlias}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '6px',
                padding: '8px',
                cursor: 'pointer',
                color: 'rgba(255,255,255,0.7)',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Cancel"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px', fontWeight: 600, color: '#fff' }}>
                  {aliasValue || `#${tracker.tracker_id}`}
                </span>
                <button
                  onClick={() => setIsEditingAlias(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(255,255,255,0.4)',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    transition: 'color 0.2s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#ff8c00')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}
                  title="Edit alias"
                >
                  <Pencil size={14} />
                </button>
              </div>
              {aliasValue && (
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>
                  Tracker #{tracker.tracker_id}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {/* Status Section */}
        <div className="detail-section">
          <div className="detail-section-title">
            <Zap size={12} />
            Status
          </div>
          <GlassCard style={{ padding: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <StatusDot status={tracker.is_stale ? 'offline' : 'online'} pulse={!tracker.is_stale} />
              <span style={{ color: tracker.is_stale ? '#ef4444' : '#22c55e', fontWeight: 500 }}>
                {tracker.is_stale ? 'Offline' : 'Online'}
              </span>
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginLeft: 'auto' }}>
                {Math.round(tracker.age_seconds)}s ago
              </span>
            </div>
            {tracker.is_stale && tracker.stale_since && (
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                Lost since: {new Date(tracker.stale_since).toLocaleString()}
              </div>
            )}
          </GlassCard>
        </div>

        {/* Position Section */}
        <div className="detail-section">
          <div className="detail-section-title">
            <MapPin size={12} />
            Position
          </div>
          <GlassCard style={{ padding: '12px' }}>
            <DataRow label="Latitude" value={formatCoord(tracker.lat, 'lat')} />
            <DataRow label="Longitude" value={formatCoord(tracker.lon, 'lon')} />
            <DataRow label="Altitude" value={tracker.alt_m !== null ? `${tracker.alt_m.toFixed(1)} m` : 'N/A'} />
            {tracker.is_stale && tracker.last_known_lat && (
              <>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', margin: '8px 0' }} />
                <div style={{ fontSize: '11px', color: '#f59e0b', marginBottom: '4px' }}>Last Known Position:</div>
                <DataRow label="Latitude" value={formatCoord(tracker.last_known_lat, 'lat')} />
                <DataRow label="Longitude" value={formatCoord(tracker.last_known_lon, 'lon')} />
              </>
            )}
          </GlassCard>
        </div>

        {/* GPS Health Section */}
        {tracker.gps_health && (
          <div className="detail-section">
            <div className="detail-section-title">
              <Satellite size={12} />
              GPS Health
            </div>
            <GPSHealthIndicator health={tracker.gps_health} />
            <GlassCard style={{ padding: '12px', marginTop: '8px' }}>
              <DataRow label="HDOP" value={tracker.hdop?.toFixed(1) ?? 'N/A'} />
              <DataRow label="Satellites" value={tracker.satellites?.toString() ?? 'N/A'} />
              <DataRow label="Fix Type" value={tracker.gps_health.fix_type.toUpperCase()} />
              <DataRow label="Health Score" value={`${tracker.gps_health.health_score}/100`} />
              <DataRow label="Fix Availability" value={`${tracker.gps_health.fix_availability_percent.toFixed(1)}%`} />
              <DataRow label="Fix Loss Events" value={tracker.gps_health.total_fix_loss_events.toString()} />
              {tracker.gps_health.current_loss_duration_ms !== null && (
                <DataRow
                  label="Lost For"
                  value={
                    <span style={{ color: '#ef4444', animation: 'pulse 2s infinite' }}>
                      {formatDuration(tracker.gps_health.current_loss_duration_ms)}
                    </span>
                  }
                />
              )}
            </GlassCard>
          </div>
        )}

        {/* CUAS Effectiveness Metrics Section (during active sessions) */}
        {activeSessionId && (
          <div className="detail-section">
            <TrackerMetricsDisplay
              sessionId={activeSessionId}
              trackerId={tracker.tracker_id}
              compact={false}
            />
          </div>
        )}

        {/* Telemetry Section */}
        <div className="detail-section">
          <div className="detail-section-title">
            <Navigation size={12} />
            Telemetry
          </div>
          <GlassCard style={{ padding: '12px' }}>
            <DataRow label="Speed" value={tracker.speed_mps !== null ? `${tracker.speed_mps.toFixed(1)} m/s` : 'N/A'} />
            <DataRow label="Heading" value={tracker.course_deg !== null ? `${tracker.course_deg.toFixed(0)}°` : 'N/A'} />
          </GlassCard>
        </div>

        {/* Signal Section */}
        <div className="detail-section">
          <div className="detail-section-title">
            <Radio size={12} />
            Signal
          </div>
          <GlassCard style={{ padding: '12px' }}>
            <DataRow label="RSSI" value={tracker.rssi_dbm !== null ? `${tracker.rssi_dbm} dBm` : 'N/A'} />
            <DataRow label="Latency" value={tracker.latency_ms !== null ? `${tracker.latency_ms} ms` : 'N/A'} />
          </GlassCard>
        </div>

        {/* Battery Section */}
        <div className="detail-section">
          <div className="detail-section-title">
            <Battery size={12} />
            Battery
          </div>
          <GlassCard style={{ padding: '12px' }}>
            <DataRow label="Voltage" value={formatVoltage(tracker.battery_mv)} />
            {batteryPercent !== null && (
              <div style={{ marginTop: '8px' }}>
                <div style={{
                  height: '8px',
                  background: 'rgba(255,255,255,0.1)',
                  borderRadius: '4px',
                  overflow: 'hidden',
                }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${batteryPercent}%`,
                      background: batteryPercent > 50 ? '#22c55e' : batteryPercent > 20 ? '#eab308' : '#ef4444',
                      borderRadius: '4px',
                      transition: 'width 0.3s',
                    }}
                  />
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginTop: '4px', textAlign: 'right' }}>
                  {batteryPercent.toFixed(0)}%
                </div>
              </div>
            )}
            {(tracker.low_battery || tracker.battery_critical) && (
              <div style={{
                marginTop: '8px',
                padding: '8px',
                background: tracker.battery_critical ? 'rgba(239, 68, 68, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                border: `1px solid ${tracker.battery_critical ? 'rgba(239, 68, 68, 0.3)' : 'rgba(234, 179, 8, 0.3)'}`,
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <AlertTriangle size={14} style={{ color: tracker.battery_critical ? '#ef4444' : '#eab308' }} />
                <span style={{ fontSize: '12px', color: tracker.battery_critical ? '#ef4444' : '#eab308' }}>
                  {tracker.battery_critical ? 'Critical Battery!' : 'Low Battery Warning'}
                </span>
              </div>
            )}
          </GlassCard>
        </div>

        {/* Barometric Section */}
        {(tracker.baro_alt_m !== null || tracker.baro_temp_c !== null || tracker.baro_press_hpa !== null) && (
          <div className="detail-section">
            <div className="detail-section-title">
              <Thermometer size={12} />
              Barometric
            </div>
            <GlassCard style={{ padding: '12px' }}>
              <DataRow label="Baro Altitude" value={tracker.baro_alt_m !== null ? `${tracker.baro_alt_m.toFixed(1)} m` : 'N/A'} />
              <DataRow label="Temperature" value={tracker.baro_temp_c !== null ? `${tracker.baro_temp_c.toFixed(1)}°C` : 'N/A'} />
              <DataRow label="Pressure" value={tracker.baro_press_hpa !== null ? `${tracker.baro_press_hpa.toFixed(1)} hPa` : 'N/A'} />
            </GlassCard>
          </div>
        )}

        {/* Timestamps Section */}
        <div className="detail-section">
          <div className="detail-section-title">
            <Clock size={12} />
            Timestamps
          </div>
          <GlassCard style={{ padding: '12px' }}>
            <DataRow label="Local Received" value={new Date(tracker.time_local_received).toLocaleString()} />
            {tracker.time_gps && (
              <DataRow label="GPS Time" value={new Date(tracker.time_gps).toLocaleString()} />
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
