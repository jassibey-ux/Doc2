/**
 * Report Panel
 * Generate and export test session reports
 */

import { useState, useCallback } from 'react';
import {
  FileText,
  Download,
  X,
  Check,
  Calendar,
  MapPin,
  Plane,
  Radio,
  BarChart3,
  Clock,
  Target,
  Brain,
} from 'lucide-react';
import { GlassPanel, GlassCard, GlassButton, Badge, GlassDivider } from './ui/GlassUI';
import { useWorkflow } from '../contexts/WorkflowContext';

interface ReportPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ReportPanel({ isOpen, onClose }: ReportPanelProps) {
  const { testSessions, sites, droneProfiles, cuasProfiles } = useWorkflow();
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportGenerated, setReportGenerated] = useState(false);

  // Get completed sessions
  const completedSessions = testSessions.filter(s => s.status === 'completed' && s.analysis_completed);

  // Get selected session details
  const selectedSession = completedSessions.find(s => s.id === selectedSessionId);
  const sessionSite = selectedSession ? sites.find(s => s.id === selectedSession.site_id) : null;

  // Generate report
  const handleGenerateReport = useCallback(async () => {
    if (!selectedSession) return;

    setIsGenerating(true);
    try {
      // Report is ready immediately - we generate on download
      setReportGenerated(true);
    } finally {
      setIsGenerating(false);
    }
  }, [selectedSession]);

  // Download HTML report
  const handleDownloadHTMLReport = useCallback(async () => {
    if (!selectedSession) return;

    try {
      // Use backend API to generate report
      const response = await fetch(`/api/reports/download/${selectedSession.id}/html`);
      if (!response.ok) {
        throw new Error('Failed to generate report');
      }

      // Get the content
      const html = await response.text();

      // Download
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
      // Fallback to local generation
      const reportHtml = generateHTMLReport(selectedSession, sessionSite, droneProfiles, cuasProfiles);
      const blob = new Blob([reportHtml], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CUAS_Report_${selectedSession.name.replace(/[^a-zA-Z0-9-_]/g, '_')}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }, [selectedSession, sessionSite, droneProfiles, cuasProfiles]);

  // Download TXT report
  const handleDownloadTXTReport = useCallback(async () => {
    if (!selectedSession) return;

    try {
      // Use backend API to generate report
      const response = await fetch(`/api/reports/download/${selectedSession.id}/txt`);
      if (!response.ok) {
        throw new Error('Failed to generate report');
      }

      // Get the content
      const text = await response.text();

      // Download
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

  // Download PDF report
  const handleDownloadPDFReport = useCallback(async () => {
    if (!selectedSession) return;

    try {
      const response = await fetch(`/api/reports/download/${selectedSession.id}/pdf`);
      if (!response.ok) {
        throw new Error('Failed to generate PDF report');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CUAS_Report_${selectedSession.name.replace(/[^a-zA-Z0-9-_]/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading PDF report:', error);
    }
  }, [selectedSession]);

  // Format date
  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!isOpen) return null;

  return (
    <div
      className="report-panel"
      style={{
        position: 'absolute',
        left: '60px',
        top: '20px',
        width: '360px',
        maxHeight: 'calc(100vh - 140px)',
        zIndex: 100,
      }}
    >
      <GlassPanel style={{ padding: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={18} style={{ color: '#22c55e' }} />
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>
              Generate Report
            </span>
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
            <X size={16} />
          </button>
        </div>

        {/* No completed sessions */}
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
                    {/* AI Analysis - only shown when available */}
                    {selectedSession?.ai_analysis ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Check size={12} style={{ color: '#06b6d4' }} />
                        <span style={{ color: 'rgba(255,255,255,0.5)' }}><Brain size={12} /></span>
                        <span style={{ fontSize: '11px', color: '#06b6d4' }}>AI Analysis</span>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.4 }}>
                        <X size={12} style={{ color: 'rgba(255,255,255,0.3)' }} />
                        <span style={{ color: 'rgba(255,255,255,0.3)' }}><Brain size={12} /></span>
                        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>AI Analysis (run analysis first)</span>
                      </div>
                    )}
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
                        <GlassButton
                          variant="primary"
                          size="md"
                          onClick={handleDownloadPDFReport}
                          style={{ flex: 1 }}
                        >
                          <Download size={16} />
                          PDF
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
      </GlassPanel>
    </div>
  );
}

// Generate HTML report content
function generateHTMLReport(
  session: any,
  site: any,
  _droneProfiles: any[],
  _cuasProfiles: any[]
): string {
  const metrics = session.metrics || {};

  const formatTime = (seconds: number | null | undefined): string => {
    if (seconds === null || seconds === undefined) return '--';
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs.toFixed(0)}s`;
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CUAS Test Report - ${session.name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 2px solid #ff8c00;
    }
    .logo { font-size: 24px; font-weight: 700; color: #ff8c00; }
    h1 { font-size: 28px; margin: 10px 0; color: #1a1a2e; }
    .date { color: #666; font-size: 14px; }
    .section { margin-bottom: 30px; }
    .section-title {
      font-size: 18px;
      font-weight: 600;
      color: #1a1a2e;
      margin-bottom: 15px;
      padding-bottom: 5px;
      border-bottom: 1px solid #eee;
    }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
    .metric-card {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 8px;
      border-left: 3px solid #ff8c00;
    }
    .metric-label { font-size: 12px; color: #666; margin-bottom: 5px; }
    .metric-value { font-size: 20px; font-weight: 600; color: #1a1a2e; }
    .pass { color: #22c55e; }
    .fail { color: #ef4444; }
    .partial { color: #f59e0b; }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
    }
    .badge-pass { background: #dcfce7; color: #166534; }
    .badge-fail { background: #fee2e2; color: #991b1b; }
    .badge-partial { background: #fef3c7; color: #92400e; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #f8f9fa; font-weight: 600; }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #eee;
      text-align: center;
      font-size: 12px;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">SCENSUS</div>
    <h1>CUAS Test Report</h1>
    <div class="date">Generated: ${new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    })}</div>
  </div>

  <div class="section">
    <div class="section-title">Test Summary</div>
    <div class="grid">
      <div class="metric-card">
        <div class="metric-label">Session Name</div>
        <div class="metric-value">${session.name}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Result</div>
        <div class="metric-value">
          <span class="badge ${metrics.pass_fail === 'pass' ? 'badge-pass' : metrics.pass_fail === 'partial' ? 'badge-partial' : 'badge-fail'}">
            ${(metrics.pass_fail || 'N/A').toUpperCase()}
          </span>
        </div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Test Site</div>
        <div class="metric-value">${site?.name || 'Unknown'}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Test Date</div>
        <div class="metric-value">${session.start_time ? new Date(session.start_time).toLocaleDateString() : 'N/A'}</div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Performance Metrics</div>
    <div class="grid">
      <div class="metric-card">
        <div class="metric-label">Time to Effect</div>
        <div class="metric-value">${formatTime(metrics.time_to_effect_s)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Recovery Time</div>
        <div class="metric-value">${formatTime(metrics.recovery_time_s)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Effective Range</div>
        <div class="metric-value">${metrics.effective_range_m ? `${metrics.effective_range_m}m` : '--'}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Max Lateral Drift</div>
        <div class="metric-value">${metrics.max_lateral_drift_m ? `${metrics.max_lateral_drift_m}m` : '--'}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Altitude Delta</div>
        <div class="metric-value">${metrics.altitude_delta_m ? `${metrics.altitude_delta_m}m` : '--'}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Jamming Duration</div>
        <div class="metric-value">${formatTime(metrics.time_under_jamming_s)}</div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Failsafe Assessment</div>
    <table>
      <tr>
        <th>Failsafe Triggered</th>
        <td>${metrics.failsafe_triggered ? 'Yes' : 'No'}</td>
      </tr>
      <tr>
        <th>Failsafe Type</th>
        <td>${metrics.failsafe_type?.toUpperCase() || 'N/A'}</td>
      </tr>
      <tr>
        <th>Expected Failsafe</th>
        <td>${metrics.failsafe_expected?.toUpperCase() || 'N/A'}</td>
      </tr>
      <tr>
        <th>Match</th>
        <td class="${metrics.failsafe_type === metrics.failsafe_expected ? 'pass' : 'fail'}">
          ${metrics.failsafe_type === metrics.failsafe_expected ? '✓ Yes' : '✗ No'}
        </td>
      </tr>
    </table>
  </div>

  <div class="section">
    <div class="section-title">Test Configuration</div>
    <table>
      <tr>
        <th>Total Drones</th>
        <td>${session.tracker_assignments?.length || 0}</td>
      </tr>
      <tr>
        <th>CUAS Units</th>
        <td>${session.cuas_placements?.length || 0}</td>
      </tr>
      <tr>
        <th>Events Recorded</th>
        <td>${session.events?.length || 0}</td>
      </tr>
      <tr>
        <th>Operator</th>
        <td>${session.operator_name || 'Not specified'}</td>
      </tr>
    </table>
  </div>

  ${session.post_test_notes ? `
  <div class="section">
    <div class="section-title">Notes</div>
    <p>${session.post_test_notes}</p>
  </div>
  ` : ''}

  <div class="footer">
    <p>SCENSUS CUAS Testing Dashboard</p>
    <p>Report generated automatically. For official documentation, please review with authorized personnel.</p>
  </div>
</body>
</html>
  `;
}
