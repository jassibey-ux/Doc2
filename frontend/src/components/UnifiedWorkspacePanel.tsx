/**
 * Unified Workspace Panel
 * Docked right-side panel that consolidates:
 * - Alerts & Events
 * - Generate Report
 * - Data Source settings
 */

import { useState, useCallback, useEffect } from 'react';
import {
  AlertTriangle,
  Bell,
  BellOff,
  ChevronDown,
  ChevronRight,
  X,
  CheckCircle,
  AlertCircle,
  Info,
  Trash2,
  FileText,
  Download,
  Check,
  Calendar,
  MapPin,
  Plane,
  Radio,
  BarChart3,
  Clock,
  Target,
  FolderOpen,
  Database,
  Settings,
  Globe,
  Play,
  Square,
  Satellite,
} from 'lucide-react';
import { GlassCard, GlassButton, Badge, GlassDivider } from './ui/GlassUI';
import { useWorkflow } from '../contexts/WorkflowContext';
import { useWebSocket } from '../contexts/WebSocketContext';
import { pathService, ValidateResponse } from '../services/pathService';
import { AlertMessage, TestEvent, EVENT_COLORS, AlertLevel } from '../types/workflow';

interface UnifiedWorkspacePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabId = 'alerts' | 'reports' | 'data-source';

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

export default function UnifiedWorkspacePanel({ isOpen, onClose }: UnifiedWorkspacePanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('alerts');

  // ===== ALERTS STATE (from AlertsPanel) =====
  const { activeSession, testSessions, sites } = useWorkflow();
  const { anomalyAlerts, acknowledgeAnomalyAlert } = useWebSocket();
  const [alerts, setAlerts] = useState<AlertMessage[]>([]);
  const [expandedSection, setExpandedSection] = useState<'alerts' | 'events'>('alerts');
  const [alertsMuted, setAlertsMuted] = useState(false);

  // ===== REPORTS STATE (from ReportPanel) =====
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportGenerated, setReportGenerated] = useState(false);

  // ===== DATA SOURCE STATE (from SettingsPanel) =====
  const [currentPath, setCurrentPath] = useState<string>('');
  const [validation, setValidation] = useState<ValidateResponse | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pathInput, setPathInput] = useState<string>('');
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ===== DEMO MODE STATE =====
  const [demoModeEnabled, setDemoModeEnabled] = useState(false);
  const [demoTrackerIds, setDemoTrackerIds] = useState<string[]>([]);
  const [isTogglingDemo, setIsTogglingDemo] = useState(false);
  const [demoScenarios, setDemoScenarios] = useState<{ id: string; name: string; description: string; trackerCount: number; hasGpsDenial: boolean }[]>([]);
  const [selectedScenario, setSelectedScenario] = useState('default');
  const [activeScenario, setActiveScenario] = useState<string | null>(null);

  // ===== ALERTS LOGIC =====
  useEffect(() => {
    if (anomalyAlerts && anomalyAlerts.length > 0) {
      const newAlerts: AlertMessage[] = anomalyAlerts.map(alert => ({
        id: alert.id,
        type: alert.type,
        level: alert.level,
        message: alert.message,
        timestamp: alert.timestamp,
        tracker_id: alert.tracker_id,
        acknowledged: false,
      }));

      setAlerts(prev => {
        const existingIds = new Set(prev.map(a => a.id));
        const merged = [...prev];
        for (const newAlert of newAlerts) {
          if (!existingIds.has(newAlert.id)) {
            merged.push(newAlert);
          } else {
            const idx = merged.findIndex(a => a.id === newAlert.id);
            if (idx >= 0 && !merged[idx].acknowledged) {
              merged[idx] = { ...newAlert, acknowledged: merged[idx].acknowledged };
            }
          }
        }
        return merged;
      });
    }
  }, [anomalyAlerts]);

  const handleAcknowledge = useCallback((alertId: string) => {
    setAlerts(prev => prev.map(a =>
      a.id === alertId ? { ...a, acknowledged: true } : a
    ));
    acknowledgeAnomalyAlert(alertId);
  }, [acknowledgeAnomalyAlert]);

  const handleDismiss = useCallback((alertId: string) => {
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  }, []);

  const handleAcknowledgeAll = useCallback(() => {
    setAlerts(prev => prev.map(a => ({ ...a, acknowledged: true })));
  }, []);

  const handleClearAcknowledged = useCallback(() => {
    setAlerts(prev => prev.filter(a => !a.acknowledged));
  }, []);

  // ===== DEMO MODE LOGIC =====
  const fetchDemoStatus = async () => {
    try {
      const [statusRes, scenariosRes] = await Promise.all([
        fetch('/api/system/demo-mode'),
        fetch('/api/system/demo-mode/scenarios'),
      ]);
      if (statusRes.ok) {
        const data = await statusRes.json();
        setDemoModeEnabled(data.enabled);
        setDemoTrackerIds(data.trackerIds || []);
        setActiveScenario(data.scenario || null);
        if (data.scenario) setSelectedScenario(data.scenario);
      }
      if (scenariosRes.ok) {
        const scenarios = await scenariosRes.json();
        setDemoScenarios(scenarios);
      }
    } catch (err) {
      console.error('Failed to fetch demo mode status:', err);
    }
  };

  const toggleDemoMode = async () => {
    setIsTogglingDemo(true);
    try {
      const newEnabled = !demoModeEnabled;
      const response = await fetch('/api/system/demo-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newEnabled, scenario: newEnabled ? selectedScenario : undefined }),
      });
      if (response.ok) {
        const data = await response.json();
        setDemoModeEnabled(newEnabled);
        setDemoTrackerIds(data.trackerIds || []);
        setActiveScenario(newEnabled ? (data.scenario || selectedScenario) : null);
      }
    } catch (err) {
      console.error('Failed to toggle demo mode:', err);
    } finally {
      setIsTogglingDemo(false);
    }
  };

  // ===== DATA SOURCE LOGIC =====
  useEffect(() => {
    if (isOpen && activeTab === 'data-source') {
      loadConfig();
      fetchDemoStatus();
    }
  }, [isOpen, activeTab]);

  const loadConfig = async () => {
    setLoadError(null);
    try {
      const cfg = await pathService.getConfig();
      setCurrentPath(cfg.log_root);
      setPathInput(cfg.log_root);
      if (cfg.log_root) {
        validatePath(cfg.log_root);
      }
    } catch (err) {
      setLoadError('Failed to load settings. Please try again.');
    }
  };

  const validatePath = useCallback(async (path: string) => {
    if (!path.trim()) {
      setValidation(null);
      return;
    }

    setIsValidating(true);
    try {
      const result = await pathService.validatePath(path);
      setValidation(result);
    } catch (err) {
      console.error('Validation error:', err);
      setValidation({
        valid: false,
        exists: false,
        is_directory: false,
        sessions: [],
        message: 'Failed to validate path'
      });
    } finally {
      setIsValidating(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (pathInput && pathInput !== currentPath) {
        validatePath(pathInput);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [pathInput, currentPath, validatePath]);

  const handleApplyChanges = async () => {
    if (!pathInput.trim() || !validation?.valid) return;

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const result = await pathService.setLogRoot(pathInput);
      if (result.success) {
        setCurrentPath(pathInput);
        setSaveMessage({ type: 'success', text: result.message || 'Settings saved successfully' });
        setTimeout(() => setSaveMessage(null), 3000);
      } else {
        setSaveMessage({ type: 'error', text: result.message || 'Failed to save settings' });
      }
    } catch (err) {
      console.error('Failed to apply changes:', err);
      setSaveMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleBrowse = async () => {
    try {
      const folder = await pathService.selectFolder();
      if (folder) {
        setPathInput(folder);
        validatePath(folder);
      }
    } catch (err) {
      console.error('Folder picker failed:', err);
    }
  };

  const handleExportCSV = async () => {
    try {
      const blob = await pathService.exportCSV();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scensus_export_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export CSV failed:', err);
    }
  };

  const handleExportKML = async () => {
    try {
      const blob = await pathService.exportKML();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scensus_export_${new Date().toISOString().slice(0, 10)}.kml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export KML failed:', err);
    }
  };

  // ===== REPORTS LOGIC =====
  const completedSessions = testSessions.filter(s => s.status === 'completed' && s.analysis_completed);
  const selectedSession = completedSessions.find(s => s.id === selectedSessionId);
  const sessionSite = selectedSession ? sites.find(s => s.id === selectedSession.site_id) : null;

  const handleGenerateReport = useCallback(async () => {
    if (!selectedSession) return;
    setIsGenerating(true);
    try {
      setReportGenerated(true);
    } finally {
      setIsGenerating(false);
    }
  }, [selectedSession]);

  const handleDownloadHTMLReport = useCallback(async () => {
    if (!selectedSession) return;
    try {
      const response = await fetch(`/api/reports/download/${selectedSession.id}/html`);
      if (!response.ok) throw new Error('Failed to generate report');
      const html = await response.text();
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CUAS_Report_${selectedSession.name.replace(/[^a-zA-Z0-9-_]/g, '_')}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading report:', error);
    }
  }, [selectedSession]);

  const handleDownloadTXTReport = useCallback(async () => {
    if (!selectedSession) return;
    try {
      const response = await fetch(`/api/reports/download/${selectedSession.id}/txt`);
      if (!response.ok) throw new Error('Failed to generate report');
      const text = await response.text();
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CUAS_Report_${selectedSession.name.replace(/[^a-zA-Z0-9-_]/g, '_')}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading TXT report:', error);
    }
  }, [selectedSession]);

  // ===== HELPERS =====
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  const getRelativeTime = (timestamp: string) => {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    return `${Math.floor(diffSec / 3600)}h ago`;
  };

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const unacknowledgedAlerts = alerts.filter(a => !a.acknowledged);
  const events = activeSession?.events || [];
  const hasDataSourceChanges = pathInput !== currentPath;

  // Tab definitions
  const tabs: Array<{ id: TabId; label: string; icon: React.ReactNode; badge?: number }> = [
    { id: 'alerts', label: 'Alerts', icon: <AlertTriangle size={14} />, badge: unacknowledgedAlerts.length },
    { id: 'reports', label: 'Reports', icon: <FileText size={14} /> },
    { id: 'data-source', label: 'Data Source', icon: <Database size={14} /> },
  ];

  // Debug logging
  console.log('[UnifiedWorkspacePanel] render, isOpen:', isOpen);

  // Early return with hidden div when closed (same pattern as DroneDetailPanel)
  if (!isOpen) {
    return <div className="unified-workspace-panel hidden" />;
  }

  return (
    <div className="unified-workspace-panel">
      {/* Header */}
      <div className="panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Settings size={18} style={{ color: '#ff8c00' }} />
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', margin: 0 }}>Workspace</h2>
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
              <span className="tab-badge">{tab.badge > 9 ? '9+' : tab.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="workspace-content">
        {/* ===== ALERTS TAB ===== */}
        {activeTab === 'alerts' && (
          <div className="alerts-tab-content">
            {/* Mute toggle */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
              <button
                onClick={() => setAlertsMuted(!alertsMuted)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: alertsMuted ? '#ef4444' : 'rgba(255,255,255,0.5)',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '11px',
                }}
                title={alertsMuted ? 'Unmute alerts' : 'Mute alerts'}
              >
                {alertsMuted ? <BellOff size={14} /> : <Bell size={14} />}
                {alertsMuted ? 'Muted' : 'Mute'}
              </button>
            </div>

            {/* Alerts Section */}
            <div style={{ marginBottom: '16px' }}>
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: '8px' }}
                onClick={() => setExpandedSection(expandedSection === 'alerts' ? 'events' : 'alerts')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {expandedSection === 'alerts' ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>
                    Active Alerts ({alerts.length})
                  </span>
                </div>
                {unacknowledgedAlerts.length > 0 && (
                  <GlassButton variant="ghost" size="sm" onClick={() => handleAcknowledgeAll()}>
                    <CheckCircle size={12} />
                    Ack All
                  </GlassButton>
                )}
              </div>

              {expandedSection === 'alerts' && (
                <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                  {alerts.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px', color: 'rgba(255,255,255,0.4)' }}>
                      <Bell size={24} style={{ marginBottom: '8px', opacity: 0.5 }} />
                      <div style={{ fontSize: '12px' }}>No active alerts</div>
                    </div>
                  ) : (
                    alerts.map(alert => (
                      <GlassCard
                        key={alert.id}
                        style={{
                          marginBottom: '6px',
                          padding: '10px',
                          borderLeft: `3px solid ${ALERT_COLORS[alert.level]}`,
                          opacity: alert.acknowledged ? 0.6 : 1,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                          <span style={{ color: ALERT_COLORS[alert.level], flexShrink: 0, marginTop: '2px' }}>
                            {ALERT_ICONS[alert.level]}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '12px', color: '#fff', marginBottom: '2px' }}>
                              {alert.message}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>
                                {formatTime(alert.timestamp)}
                              </span>
                              {alert.tracker_id && (
                                <Badge color="blue" size="sm">{alert.tracker_id}</Badge>
                              )}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                            {!alert.acknowledged && (
                              <button
                                onClick={() => handleAcknowledge(alert.id)}
                                style={{ background: 'none', border: 'none', color: '#22c55e', cursor: 'pointer', padding: '2px' }}
                                title="Acknowledge"
                              >
                                <CheckCircle size={14} />
                              </button>
                            )}
                            <button
                              onClick={() => handleDismiss(alert.id)}
                              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: '2px' }}
                              title="Dismiss"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      </GlassCard>
                    ))
                  )}
                  {alerts.filter(a => a.acknowledged).length > 0 && (
                    <GlassButton
                      variant="ghost"
                      size="sm"
                      onClick={handleClearAcknowledged}
                      style={{ width: '100%', marginTop: '4px' }}
                    >
                      <Trash2 size={12} />
                      Clear acknowledged
                    </GlassButton>
                  )}
                </div>
              )}
            </div>

            {/* Events Section */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div
                style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', marginBottom: '8px' }}
                onClick={() => setExpandedSection(expandedSection === 'events' ? 'alerts' : 'events')}
              >
                {expandedSection === 'events' ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', fontWeight: 500, marginLeft: '6px' }}>
                  Event Log ({events.length})
                </span>
              </div>

              {expandedSection === 'events' && (
                <div style={{ flex: 1, overflowY: 'auto', maxHeight: '250px' }}>
                  {events.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px', color: 'rgba(255,255,255,0.4)' }}>
                      <Info size={24} style={{ marginBottom: '8px', opacity: 0.5 }} />
                      <div style={{ fontSize: '12px' }}>No events recorded</div>
                      <div style={{ fontSize: '10px', marginTop: '4px' }}>
                        Use toolbar or shortcuts to mark events
                      </div>
                    </div>
                  ) : (
                    [...events].reverse().map((event: TestEvent) => (
                      <GlassCard
                        key={event.id}
                        style={{
                          marginBottom: '6px',
                          padding: '8px 10px',
                          borderLeft: `3px solid ${EVENT_COLORS[event.type] || '#6b7280'}`,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              color: EVENT_COLORS[event.type] || '#fff',
                              textTransform: 'uppercase',
                            }}>
                              {event.type.replace('_', ' ')}
                            </span>
                            {event.source === 'auto_detected' && (
                              <Badge color="orange" size="sm">AUTO</Badge>
                            )}
                          </div>
                          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>
                            {formatTime(event.timestamp)}
                          </span>
                        </div>
                        {event.note && (
                          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', marginTop: '4px' }}>
                            {event.note}
                          </div>
                        )}
                        {event.tracker_id && (
                          <div style={{ marginTop: '4px' }}>
                            <Badge color="blue" size="sm">{event.tracker_id}</Badge>
                          </div>
                        )}
                      </GlassCard>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Session info */}
            {activeSession && (
              <div style={{
                borderTop: '1px solid rgba(255,255,255,0.1)',
                paddingTop: '12px',
                marginTop: '12px',
                fontSize: '11px',
                color: 'rgba(255,255,255,0.5)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Session:</span>
                  <span style={{ color: '#fff' }}>{activeSession.name}</span>
                </div>
                {activeSession.start_time && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                    <span>Started:</span>
                    <span>{getRelativeTime(activeSession.start_time)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ===== REPORTS TAB ===== */}
        {activeTab === 'reports' && (
          <div className="reports-tab-content">
            {completedSessions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'rgba(255,255,255,0.5)' }}>
                <FileText size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
                <div style={{ fontSize: '13px' }}>No completed sessions</div>
                <div style={{ fontSize: '11px', marginTop: '4px' }}>
                  Complete and analyze a session to generate reports
                </div>
              </div>
            ) : (
              <>
                {/* Session Selection */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                    Select Session
                  </label>
                  <select
                    value={selectedSessionId}
                    onChange={(e) => {
                      setSelectedSessionId(e.target.value);
                      setReportGenerated(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  >
                    <option value="" style={{ background: '#1a1a2e' }}>Choose a session...</option>
                    {completedSessions.map(session => (
                      <option key={session.id} value={session.id} style={{ background: '#1a1a2e' }}>
                        {session.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Session Preview */}
                {selectedSession && (
                  <>
                    <GlassCard style={{ marginBottom: '16px', padding: '12px' }}>
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 500, color: '#fff', marginBottom: '4px' }}>
                          {selectedSession.name}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {selectedSession.metrics?.pass_fail === 'pass' && <Badge color="green" size="sm">PASS</Badge>}
                          {selectedSession.metrics?.pass_fail === 'partial' && <Badge color="yellow" size="sm">PARTIAL</Badge>}
                          {selectedSession.metrics?.pass_fail === 'fail' && <Badge color="red" size="sm">FAIL</Badge>}
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Calendar size={12} style={{ color: 'rgba(255,255,255,0.5)' }} />
                          <span style={{ color: 'rgba(255,255,255,0.7)' }}>
                            {selectedSession.start_time ? formatDate(selectedSession.start_time) : '--'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <MapPin size={12} style={{ color: 'rgba(255,255,255,0.5)' }} />
                          <span style={{ color: 'rgba(255,255,255,0.7)' }}>
                            {sessionSite?.name || 'Unknown Site'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Plane size={12} style={{ color: 'rgba(255,255,255,0.5)' }} />
                          <span style={{ color: 'rgba(255,255,255,0.7)' }}>
                            {selectedSession.tracker_assignments.length} drone(s)
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Radio size={12} style={{ color: 'rgba(255,255,255,0.5)' }} />
                          <span style={{ color: 'rgba(255,255,255,0.7)' }}>
                            {selectedSession.cuas_placements.length} CUAS unit(s)
                          </span>
                        </div>
                      </div>
                    </GlassCard>

                    {/* Report Contents */}
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>
                        Report will include:
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {[
                          { icon: <Target size={12} />, text: 'Test Configuration' },
                          { icon: <BarChart3 size={12} />, text: 'Performance Metrics' },
                          { icon: <Clock size={12} />, text: 'Event Timeline' },
                          { icon: <Radio size={12} />, text: 'Failsafe Analysis' },
                        ].map((item, idx) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Check size={12} style={{ color: '#22c55e' }} />
                            <span style={{ color: 'rgba(255,255,255,0.5)' }}>{item.icon}</span>
                            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>{item.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <GlassDivider />

                    {/* Generate/Download Buttons */}
                    <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {!reportGenerated ? (
                        <GlassButton
                          variant="primary"
                          size="md"
                          onClick={handleGenerateReport}
                          disabled={isGenerating}
                          style={{ width: '100%' }}
                        >
                          <FileText size={16} />
                          {isGenerating ? 'Generating...' : 'Generate Report'}
                        </GlassButton>
                      ) : (
                        <>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            padding: '10px',
                            background: 'rgba(34, 197, 94, 0.1)',
                            borderRadius: '8px',
                            marginBottom: '8px',
                          }}>
                            <Check size={16} style={{ color: '#22c55e' }} />
                            <span style={{ fontSize: '12px', color: '#22c55e' }}>Report Ready</span>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <GlassButton
                              variant="primary"
                              size="md"
                              onClick={handleDownloadHTMLReport}
                              style={{ flex: 1 }}
                            >
                              <Download size={16} />
                              HTML
                            </GlassButton>
                            <GlassButton
                              variant="secondary"
                              size="md"
                              onClick={handleDownloadTXTReport}
                              style={{ flex: 1 }}
                            >
                              <Download size={16} />
                              TXT
                            </GlassButton>
                          </div>
                          <GlassButton
                            variant="ghost"
                            size="sm"
                            onClick={() => setReportGenerated(false)}
                            style={{ width: '100%' }}
                          >
                            Generate New Report
                          </GlassButton>
                        </>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ===== DATA SOURCE TAB ===== */}
        {activeTab === 'data-source' && (
          <div className="data-source-tab-content">
            {/* Demo Mode Section */}
            <GlassCard style={{ marginBottom: '16px', padding: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Satellite size={16} style={{ color: demoModeEnabled ? '#22c55e' : 'rgba(255,255,255,0.5)' }} />
                  <span style={{ fontSize: '13px', fontWeight: 500, color: '#fff' }}>Demo Mode</span>
                  {demoModeEnabled && (
                    <Badge color="green" size="sm">ACTIVE</Badge>
                  )}
                </div>
                <GlassButton
                  variant={demoModeEnabled ? 'secondary' : 'primary'}
                  size="sm"
                  onClick={toggleDemoMode}
                  disabled={isTogglingDemo}
                >
                  {isTogglingDemo ? (
                    <>
                      <div className="loading-spinner-small" />
                      <span style={{ marginLeft: '4px' }}>{demoModeEnabled ? 'Stopping...' : 'Starting...'}</span>
                    </>
                  ) : demoModeEnabled ? (
                    <>
                      <Square size={12} />
                      <span style={{ marginLeft: '4px' }}>Stop</span>
                    </>
                  ) : (
                    <>
                      <Play size={12} />
                      <span style={{ marginLeft: '4px' }}>Start</span>
                    </>
                  )}
                </GlassButton>
              </div>
              {demoScenarios.length > 1 && (
                <div style={{ marginBottom: '8px' }}>
                  <select
                    value={selectedScenario}
                    onChange={(e) => setSelectedScenario(e.target.value)}
                    disabled={demoModeEnabled}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      fontSize: '12px',
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: '6px',
                      color: '#fff',
                      cursor: demoModeEnabled ? 'not-allowed' : 'pointer',
                      opacity: demoModeEnabled ? 0.5 : 1,
                    }}
                  >
                    {demoScenarios.map((s) => (
                      <option key={s.id} value={s.id} style={{ background: '#1a1a2e', color: '#fff' }}>
                        {s.name} ({s.trackerCount} drones{s.hasGpsDenial ? ' + GPS denial' : ''})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                {demoModeEnabled ? (
                  <>
                    Simulating {demoTrackerIds.length} live trackers
                    {activeScenario && activeScenario !== 'default' && (
                      <> &mdash; {demoScenarios.find(s => s.id === activeScenario)?.name || activeScenario}</>
                    )}
                    {demoScenarios.find(s => s.id === activeScenario)?.hasGpsDenial && (
                      <span style={{ color: '#ef4444' }}> (GPS denial zone active)</span>
                    )}
                    <div style={{ marginTop: '4px', color: 'rgba(255,255,255,0.4)' }}>
                      Trackers: {demoTrackerIds.join(', ')}
                    </div>
                  </>
                ) : (
                  'Start demo mode to simulate live tracker data with GPS health variations for testing.'
                )}
              </div>
            </GlassCard>

            <GlassDivider style={{ marginBottom: '16px' }} />

            {/* Load Error */}
            {loadError && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px',
                background: 'rgba(239, 68, 68, 0.1)',
                borderRadius: '8px',
                marginBottom: '16px',
                color: '#ef4444',
                fontSize: '12px',
              }}>
                <AlertCircle size={14} />
                <span>{loadError}</span>
              </div>
            )}

            {/* Path Input */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                Data Source Path
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={pathInput}
                  onChange={(e) => setPathInput(e.target.value)}
                  placeholder="Enter folder path (e.g. C:\Temp)"
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                />
                <GlassButton variant="secondary" size="md" onClick={handleBrowse}>
                  <FolderOpen size={14} />
                </GlassButton>
              </div>
            </div>

            {/* Validation Status */}
            {isValidating ? (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '8px',
                marginBottom: '16px',
                color: 'rgba(255,255,255,0.7)',
                fontSize: '12px',
              }}>
                <div className="loading-spinner-small" />
                <span>Validating...</span>
              </div>
            ) : validation && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px',
                background: validation.valid ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                borderRadius: '8px',
                marginBottom: '16px',
                color: validation.valid ? '#22c55e' : '#ef4444',
                fontSize: '12px',
              }}>
                {validation.valid ? <Check size={14} /> : <AlertCircle size={14} />}
                <span>{validation.message}</span>
              </div>
            )}

            {/* Session Preview */}
            {validation?.valid && validation.sessions.length > 0 && (
              <GlassCard style={{ marginBottom: '16px', padding: '12px' }}>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>
                  Recent Sessions
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {validation.sessions.slice(0, 5).map((session) => (
                    <div key={session.name} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '12px',
                    }}>
                      <span style={{ color: '#fff' }}>{session.name}</span>
                      <span style={{ color: 'rgba(255,255,255,0.5)' }}>{session.file_count} files</span>
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}

            <GlassDivider />

            {/* Export Section */}
            <div style={{ marginTop: '16px', marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Download size={12} />
                Export Data
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <GlassButton variant="secondary" size="md" onClick={handleExportCSV} style={{ flex: 1 }}>
                  <FileText size={14} />
                  CSV
                </GlassButton>
                <GlassButton variant="secondary" size="md" onClick={handleExportKML} style={{ flex: 1 }}>
                  <Globe size={14} />
                  KML
                </GlassButton>
              </div>
            </div>

            {/* Save Message */}
            {saveMessage && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px',
                background: saveMessage.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                borderRadius: '8px',
                marginBottom: '16px',
                color: saveMessage.type === 'success' ? '#22c55e' : '#ef4444',
                fontSize: '12px',
              }}>
                {saveMessage.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
                <span>{saveMessage.text}</span>
              </div>
            )}

            {/* Apply Button */}
            <GlassButton
              variant="primary"
              size="md"
              onClick={handleApplyChanges}
              disabled={!hasDataSourceChanges || !validation?.valid || isSaving}
              style={{ width: '100%' }}
            >
              {isSaving ? 'Applying...' : 'Apply Changes'}
            </GlassButton>
          </div>
        )}
      </div>
    </div>
  );
}
