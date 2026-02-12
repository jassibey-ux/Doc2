/**
 * Report Generator
 * Generates HTML and DOCX reports for test sessions
 */

import * as fs from 'fs';
import * as path from 'path';
import log from 'electron-log';
import { getTrackerDisplayName } from './library-store';

// Import types
interface GeoPoint {
  lat: number;
  lon: number;
  alt_m?: number;
}

interface TestEvent {
  id: string;
  type: string;
  timestamp: string;
  source: string;
  cuas_id?: string;
  tracker_id?: string;
  note?: string;
  metadata?: Record<string, unknown>;
}

interface SessionMetrics {
  total_flight_time_s: number;
  time_under_jamming_s: number;
  time_to_effect_s?: number;
  time_to_full_denial_s?: number;
  recovery_time_s?: number;
  effective_range_m?: number;
  max_altitude_under_jam_m?: number;
  altitude_delta_m?: number;
  max_lateral_drift_m?: number;
  connection_loss_duration_s?: number;
  failsafe_triggered: boolean;
  failsafe_type?: string;
  failsafe_expected?: string;
  pass_fail?: 'pass' | 'fail' | 'partial';
}

interface TrackerAssignment {
  id: string;
  tracker_id: string;
  drone_profile_id: string;
  session_color: string;
  target_altitude_m?: number;
  flight_plan?: string;
  assigned_at: string;
}

interface CUASPlacement {
  id: string;
  cuas_profile_id: string;
  position: GeoPoint;
  height_agl_m: number;
  orientation_deg: number;
  elevation_deg?: number;
  active: boolean;
  notes?: string;
}

interface TestSession {
  id: string;
  name: string;
  site_id: string;
  status: string;
  tracker_assignments: TrackerAssignment[];
  cuas_placements: CUASPlacement[];
  start_time?: string;
  end_time?: string;
  events: TestEvent[];
  live_data_path?: string;
  sd_card_merged: boolean;
  sd_card_paths?: string[];
  analysis_completed: boolean;
  metrics?: SessionMetrics;
  report_path?: string;
  operator_name?: string;
  weather_notes?: string;
  post_test_notes?: string;
  classification?: string;
  created_at: string;
  updated_at: string;
}

interface SiteDefinition {
  id: string;
  name: string;
  environment_type: string;
  center: GeoPoint;
}

interface DroneProfile {
  id: string;
  name: string;
  make: string;
  model: string;
}

interface CUASProfile {
  id: string;
  name: string;
  vendor: string;
  type: string;
  effective_range_m: number;
}

export interface ReportData {
  session: TestSession;
  site?: SiteDefinition;
  droneProfiles: Map<string, DroneProfile>;
  cuasProfiles: Map<string, CUASProfile>;
  mapImageBase64?: string;
  chartImageBase64?: string;
}

export interface ReportOptions {
  includeEvents?: boolean;
  includeMetrics?: boolean;
  includeMap?: boolean;
  includeCharts?: boolean;
  classification?: string;
}

const DEFAULT_OPTIONS: ReportOptions = {
  includeEvents: true,
  includeMetrics: true,
  includeMap: true,
  includeCharts: true,
};

/**
 * Format duration in seconds to human readable string
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) {
    return `${minutes}m ${secs.toFixed(0)}s`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

/**
 * Format timestamp to readable date/time
 */
function formatTimestamp(ts: string): string {
  try {
    const date = new Date(ts);
    return date.toLocaleString();
  } catch {
    return ts;
  }
}

/**
 * Get event type display name
 */
function getEventTypeName(type: string): string {
  const names: Record<string, string> = {
    jam_on: 'JAM ON',
    jam_off: 'JAM OFF',
    launch: 'LAUNCH',
    recover: 'RECOVER',
    failsafe: 'FAILSAFE',
    note: 'NOTE',
    gps_lost: 'GPS LOST',
    gps_acquired: 'GPS ACQUIRED',
    altitude_anomaly: 'ALTITUDE ANOMALY',
    position_jump: 'POSITION JUMP',
    geofence_breach: 'GEOFENCE BREACH',
    link_lost: 'LINK LOST',
    link_restored: 'LINK RESTORED',
    custom: 'CUSTOM',
  };
  return names[type] || type.toUpperCase();
}

/**
 * Get pass/fail badge color
 */
function getPassFailColor(result?: string): string {
  switch (result) {
    case 'pass': return '#22c55e';
    case 'fail': return '#ef4444';
    case 'partial': return '#eab308';
    default: return '#6b7280';
  }
}

/**
 * Generate HTML report
 */
export function generateHTMLReport(data: ReportData, options: ReportOptions = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { session, site, droneProfiles, cuasProfiles, mapImageBase64, chartImageBase64 } = data;

  const classification = opts.classification || session.classification || '';
  const passFailColor = getPassFailColor(session.metrics?.pass_fail);

  let html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Report: ${escapeHtml(session.name)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
      line-height: 1.5;
      color: #1f2937;
      background: #fff;
      padding: 40px;
    }
    .report-header {
      text-align: center;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 2px solid #1f2937;
    }
    .classification {
      font-size: 14px;
      font-weight: bold;
      color: #dc2626;
      text-transform: uppercase;
      letter-spacing: 2px;
      margin-bottom: 10px;
    }
    .report-title {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 5px;
    }
    .report-subtitle {
      font-size: 14px;
      color: #6b7280;
    }
    .section {
      margin-bottom: 25px;
    }
    .section-title {
      font-size: 14px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #374151;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 5px;
      margin-bottom: 12px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
    }
    .info-item {
      display: flex;
      flex-direction: column;
    }
    .info-label {
      font-size: 10px;
      text-transform: uppercase;
      color: #6b7280;
      letter-spacing: 0.5px;
    }
    .info-value {
      font-size: 13px;
      font-weight: 500;
    }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 15px;
    }
    .metric-card {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 12px;
      text-align: center;
    }
    .metric-value {
      font-size: 20px;
      font-weight: 700;
      color: #1f2937;
    }
    .metric-label {
      font-size: 10px;
      text-transform: uppercase;
      color: #6b7280;
      margin-top: 2px;
    }
    .pass-fail-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 4px;
      font-weight: 600;
      text-transform: uppercase;
      color: white;
    }
    .event-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }
    .event-table th,
    .event-table td {
      border: 1px solid #e5e7eb;
      padding: 8px;
      text-align: left;
    }
    .event-table th {
      background: #f3f4f6;
      font-weight: 600;
      text-transform: uppercase;
      font-size: 10px;
    }
    .event-type {
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 10px;
    }
    .event-type.jam_on, .event-type.jam_off { background: #fef2f2; color: #dc2626; }
    .event-type.launch { background: #f0fdf4; color: #16a34a; }
    .event-type.recover { background: #eff6ff; color: #2563eb; }
    .event-type.failsafe { background: #fefce8; color: #ca8a04; }
    .event-type.gps_lost, .event-type.link_lost { background: #fef2f2; color: #991b1b; }
    .event-type.gps_acquired, .event-type.link_restored { background: #f0fdf4; color: #166534; }
    .map-image {
      width: 100%;
      max-height: 400px;
      object-fit: contain;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
    }
    .chart-image {
      width: 100%;
      max-height: 300px;
      object-fit: contain;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      margin-top: 15px;
    }
    .equipment-list {
      list-style: none;
    }
    .equipment-item {
      padding: 8px 0;
      border-bottom: 1px solid #e5e7eb;
    }
    .equipment-item:last-child { border-bottom: none; }
    .equipment-name { font-weight: 500; }
    .equipment-detail { font-size: 11px; color: #6b7280; }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      color: #6b7280;
      font-size: 10px;
    }
    @media print {
      body { padding: 20px; }
      .section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="report-header">
    ${classification ? `<div class="classification">${escapeHtml(classification)}</div>` : ''}
    <h1 class="report-title">CUAS Test Report</h1>
    <div class="report-subtitle">${escapeHtml(session.name)}</div>
  </div>

  <div class="section">
    <h2 class="section-title">Session Information</h2>
    <div class="info-grid">
      <div class="info-item">
        <span class="info-label">Session ID</span>
        <span class="info-value">${escapeHtml(session.id)}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Site</span>
        <span class="info-value">${escapeHtml(site?.name || 'Unknown')}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Start Time</span>
        <span class="info-value">${session.start_time ? formatTimestamp(session.start_time) : 'N/A'}</span>
      </div>
      <div class="info-item">
        <span class="info-label">End Time</span>
        <span class="info-value">${session.end_time ? formatTimestamp(session.end_time) : 'N/A'}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Operator</span>
        <span class="info-value">${escapeHtml(session.operator_name || 'N/A')}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Status</span>
        <span class="info-value">${escapeHtml(session.status.toUpperCase())}</span>
      </div>
    </div>
    ${session.weather_notes ? `
      <div style="margin-top: 12px;">
        <span class="info-label">Weather Notes</span>
        <p style="margin-top: 4px;">${escapeHtml(session.weather_notes)}</p>
      </div>
    ` : ''}
  </div>
`;

  // Metrics section
  if (opts.includeMetrics && session.metrics) {
    const m = session.metrics;
    html += `
  <div class="section">
    <h2 class="section-title">Test Results</h2>
    ${m.pass_fail ? `
      <div style="margin-bottom: 15px;">
        <span class="pass-fail-badge" style="background: ${passFailColor}">
          ${m.pass_fail.toUpperCase()}
        </span>
      </div>
    ` : ''}
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-value">${formatDuration(m.total_flight_time_s)}</div>
        <div class="metric-label">Total Flight Time</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${formatDuration(m.time_under_jamming_s)}</div>
        <div class="metric-label">Time Under Jamming</div>
      </div>
      ${m.time_to_effect_s !== undefined ? `
        <div class="metric-card">
          <div class="metric-value">${formatDuration(m.time_to_effect_s)}</div>
          <div class="metric-label">Time to Effect</div>
        </div>
      ` : ''}
      ${m.effective_range_m !== undefined ? `
        <div class="metric-card">
          <div class="metric-value">${m.effective_range_m.toFixed(0)}m</div>
          <div class="metric-label">Effective Range</div>
        </div>
      ` : ''}
      ${m.max_altitude_under_jam_m !== undefined ? `
        <div class="metric-card">
          <div class="metric-value">${m.max_altitude_under_jam_m.toFixed(1)}m</div>
          <div class="metric-label">Max Altitude Under Jam</div>
        </div>
      ` : ''}
      ${m.max_lateral_drift_m !== undefined ? `
        <div class="metric-card">
          <div class="metric-value">${m.max_lateral_drift_m.toFixed(1)}m</div>
          <div class="metric-label">Max Lateral Drift</div>
        </div>
      ` : ''}
    </div>
    ${m.failsafe_triggered ? `
      <div style="margin-top: 15px;">
        <strong>Failsafe:</strong> ${escapeHtml(m.failsafe_type || 'Triggered')}
        ${m.failsafe_expected ? ` (Expected: ${escapeHtml(m.failsafe_expected)})` : ''}
      </div>
    ` : ''}
  </div>
`;
  }

  // Equipment section
  html += `
  <div class="section">
    <h2 class="section-title">Equipment</h2>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
      <div>
        <h3 style="font-size: 12px; margin-bottom: 8px;">Drones (${session.tracker_assignments.length})</h3>
        <ul class="equipment-list">
          ${session.tracker_assignments.map(a => {
            const profile = droneProfiles.get(a.drone_profile_id);
            const displayName = getTrackerDisplayName(a.tracker_id);
            const showTrackerId = displayName !== a.tracker_id;
            return `
              <li class="equipment-item">
                <div class="equipment-name">${escapeHtml(displayName)}</div>
                <div class="equipment-detail">
                  ${showTrackerId ? `#${escapeHtml(a.tracker_id)} • ` : ''}${profile ? `${escapeHtml(profile.make)} ${escapeHtml(profile.model)}` : 'Unknown Profile'}
                  ${a.target_altitude_m ? ` • Target: ${a.target_altitude_m}m` : ''}
                </div>
              </li>
            `;
          }).join('')}
        </ul>
      </div>
      <div>
        <h3 style="font-size: 12px; margin-bottom: 8px;">CUAS Systems (${session.cuas_placements.length})</h3>
        <ul class="equipment-list">
          ${session.cuas_placements.map(p => {
            const profile = cuasProfiles.get(p.cuas_profile_id);
            return `
              <li class="equipment-item">
                <div class="equipment-name">${escapeHtml(profile?.name || 'Unknown')}</div>
                <div class="equipment-detail">
                  ${profile ? `${escapeHtml(profile.vendor)} • ${escapeHtml(profile.type)}` : ''}
                  • Range: ${profile?.effective_range_m || 0}m • Orient: ${p.orientation_deg}°
                </div>
              </li>
            `;
          }).join('')}
        </ul>
      </div>
    </div>
  </div>
`;

  // Map image
  if (opts.includeMap && mapImageBase64) {
    html += `
  <div class="section">
    <h2 class="section-title">Flight Track</h2>
    <img src="${mapImageBase64}" alt="Flight Track Map" class="map-image" />
  </div>
`;
  }

  // Chart image
  if (opts.includeCharts && chartImageBase64) {
    html += `
  <div class="section">
    <h2 class="section-title">Analysis Charts</h2>
    <img src="${chartImageBase64}" alt="Analysis Charts" class="chart-image" />
  </div>
`;
  }

  // Events section
  if (opts.includeEvents && session.events.length > 0) {
    html += `
  <div class="section">
    <h2 class="section-title">Event Log (${session.events.length} events)</h2>
    <table class="event-table">
      <thead>
        <tr>
          <th style="width: 140px;">Time</th>
          <th style="width: 120px;">Type</th>
          <th style="width: 80px;">Source</th>
          <th>Details</th>
        </tr>
      </thead>
      <tbody>
        ${session.events.map(e => {
          const trackerDisplay = e.tracker_id ? getTrackerDisplayName(e.tracker_id) : null;
          const showTrackerId = trackerDisplay && trackerDisplay !== e.tracker_id;
          return `
          <tr>
            <td>${formatTimestamp(e.timestamp)}</td>
            <td><span class="event-type ${e.type}">${getEventTypeName(e.type)}</span></td>
            <td>${escapeHtml(e.source)}</td>
            <td>
              ${trackerDisplay ? `Tracker: ${escapeHtml(trackerDisplay)}${showTrackerId ? ` (#${escapeHtml(e.tracker_id!)})` : ''}` : ''}
              ${e.cuas_id ? `CUAS: ${escapeHtml(e.cuas_id)}` : ''}
              ${e.note ? `<br/>${escapeHtml(e.note)}` : ''}
            </td>
          </tr>
        `}).join('')}
      </tbody>
    </table>
  </div>
`;
  }

  // Post-test notes
  if (session.post_test_notes) {
    html += `
  <div class="section">
    <h2 class="section-title">Post-Test Notes</h2>
    <p>${escapeHtml(session.post_test_notes)}</p>
  </div>
`;
  }

  // Footer
  html += `
  <div class="footer">
    <p>Generated by SCENSUS Dashboard on ${new Date().toLocaleString()}</p>
    ${classification ? `<p class="classification">${escapeHtml(classification)}</p>` : ''}
  </div>
</body>
</html>
`;

  return html;
}

/**
 * Generate plain text report (for DOCX conversion)
 */
export function generateTextReport(data: ReportData, options: ReportOptions = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { session, site, droneProfiles, cuasProfiles } = data;

  const classification = opts.classification || session.classification || '';
  const divider = '═'.repeat(60);
  const subDivider = '─'.repeat(40);

  let text = '';

  // Header
  if (classification) {
    text += `${classification.toUpperCase()}\n\n`;
  }
  text += `${divider}\n`;
  text += `CUAS TEST REPORT\n`;
  text += `${session.name}\n`;
  text += `${divider}\n\n`;

  // Session Info
  text += `SESSION INFORMATION\n${subDivider}\n`;
  text += `Session ID:     ${session.id}\n`;
  text += `Site:           ${site?.name || 'Unknown'}\n`;
  text += `Start Time:     ${session.start_time ? formatTimestamp(session.start_time) : 'N/A'}\n`;
  text += `End Time:       ${session.end_time ? formatTimestamp(session.end_time) : 'N/A'}\n`;
  text += `Operator:       ${session.operator_name || 'N/A'}\n`;
  text += `Status:         ${session.status.toUpperCase()}\n`;
  if (session.weather_notes) {
    text += `Weather:        ${session.weather_notes}\n`;
  }
  text += '\n';

  // Metrics
  if (opts.includeMetrics && session.metrics) {
    const m = session.metrics;
    text += `TEST RESULTS\n${subDivider}\n`;
    if (m.pass_fail) {
      text += `Overall Result: ${m.pass_fail.toUpperCase()}\n\n`;
    }
    text += `Total Flight Time:      ${formatDuration(m.total_flight_time_s)}\n`;
    text += `Time Under Jamming:     ${formatDuration(m.time_under_jamming_s)}\n`;
    if (m.time_to_effect_s !== undefined) {
      text += `Time to Effect:         ${formatDuration(m.time_to_effect_s)}\n`;
    }
    if (m.effective_range_m !== undefined) {
      text += `Effective Range:        ${m.effective_range_m.toFixed(0)}m\n`;
    }
    if (m.max_altitude_under_jam_m !== undefined) {
      text += `Max Alt Under Jam:      ${m.max_altitude_under_jam_m.toFixed(1)}m\n`;
    }
    if (m.max_lateral_drift_m !== undefined) {
      text += `Max Lateral Drift:      ${m.max_lateral_drift_m.toFixed(1)}m\n`;
    }
    if (m.failsafe_triggered) {
      text += `Failsafe Triggered:     ${m.failsafe_type || 'Yes'}`;
      if (m.failsafe_expected) {
        text += ` (Expected: ${m.failsafe_expected})`;
      }
      text += '\n';
    }
    text += '\n';
  }

  // Equipment
  text += `EQUIPMENT\n${subDivider}\n`;
  text += `\nDrones (${session.tracker_assignments.length}):\n`;
  session.tracker_assignments.forEach((a, i) => {
    const profile = droneProfiles.get(a.drone_profile_id);
    const displayName = getTrackerDisplayName(a.tracker_id);
    const showTrackerId = displayName !== a.tracker_id;
    text += `  ${i + 1}. ${displayName}`;
    if (showTrackerId) {
      text += ` (#${a.tracker_id})`;
    }
    if (profile) {
      text += ` - ${profile.make} ${profile.model}`;
    }
    if (a.target_altitude_m) {
      text += ` (Target: ${a.target_altitude_m}m)`;
    }
    text += '\n';
  });

  text += `\nCUAS Systems (${session.cuas_placements.length}):\n`;
  session.cuas_placements.forEach((p, i) => {
    const profile = cuasProfiles.get(p.cuas_profile_id);
    text += `  ${i + 1}. ${profile?.name || 'Unknown'}`;
    if (profile) {
      text += ` - ${profile.vendor} ${profile.type}`;
    }
    text += ` (Range: ${profile?.effective_range_m || 0}m, Orient: ${p.orientation_deg}°)\n`;
  });
  text += '\n';

  // Events
  if (opts.includeEvents && session.events.length > 0) {
    text += `EVENT LOG (${session.events.length} events)\n${subDivider}\n`;
    session.events.forEach(e => {
      text += `${formatTimestamp(e.timestamp).padEnd(22)} ${getEventTypeName(e.type).padEnd(18)} ${e.source.padEnd(10)}`;
      if (e.tracker_id) {
        const trackerDisplay = getTrackerDisplayName(e.tracker_id);
        const showId = trackerDisplay !== e.tracker_id;
        text += ` [${trackerDisplay}${showId ? ` (#${e.tracker_id})` : ''}]`;
      }
      if (e.cuas_id) text += ` [CUAS: ${e.cuas_id}]`;
      if (e.note) text += ` - ${e.note}`;
      text += '\n';
    });
    text += '\n';
  }

  // Post-test notes
  if (session.post_test_notes) {
    text += `POST-TEST NOTES\n${subDivider}\n`;
    text += `${session.post_test_notes}\n\n`;
  }

  // Footer
  text += `${divider}\n`;
  text += `Generated by SCENSUS Dashboard on ${new Date().toLocaleString()}\n`;
  if (classification) {
    text += `${classification.toUpperCase()}\n`;
  }

  return text;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Save HTML report to file
 */
export async function saveHTMLReport(
  data: ReportData,
  outputPath: string,
  options?: ReportOptions
): Promise<string> {
  const html = generateHTMLReport(data, options);
  await fs.promises.writeFile(outputPath, html, 'utf-8');
  log.info(`HTML report saved: ${outputPath}`);
  return outputPath;
}

/**
 * Save text report to file
 */
export async function saveTextReport(
  data: ReportData,
  outputPath: string,
  options?: ReportOptions
): Promise<string> {
  const text = generateTextReport(data, options);
  await fs.promises.writeFile(outputPath, text, 'utf-8');
  log.info(`Text report saved: ${outputPath}`);
  return outputPath;
}

/**
 * Generate report filename based on session
 */
export function generateReportFilename(session: TestSession, extension: string): string {
  const date = new Date().toISOString().split('T')[0];
  const safeName = session.name.replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 30);
  return `CUAS_Report_${safeName}_${date}.${extension}`;
}
