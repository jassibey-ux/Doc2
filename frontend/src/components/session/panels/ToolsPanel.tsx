/**
 * ToolsPanel — Tab 4: Camera feeds + 3D object placement + Settings + Mode toggle
 *
 * Secondary/setup features used between engagements.
 */

import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Camera, Box, Settings, Map, Table2 } from 'lucide-react';

interface ToolsPanelProps {
  tacticalMode: boolean;
  onOpenLog?: () => void;
}

const ToolsPanel: React.FC<ToolsPanelProps> = ({ tacticalMode, onOpenLog }) => {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const textColor = tacticalMode ? '#4ade80' : '#e5e7eb';
  const dimColor = tacticalMode ? 'rgba(74,222,128,0.5)' : '#6b7280';

  return (
    <div style={{ padding: '8px 0', fontSize: 12, color: textColor }}>
      {/* Raw Data Table */}
      <ToolSection
        icon={<Table2 size={14} />}
        title="Data Analysis"
        tacticalMode={tacticalMode}
      >
        <div style={{ padding: '8px 14px' }}>
          <button
            onClick={() => sessionId && navigate(`/session/${sessionId}/table`)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '8px 12px',
              borderRadius: 6,
              background: tacticalMode ? 'rgba(34,197,94,0.1)' : 'rgba(96,165,250,0.12)',
              border: `1px solid ${tacticalMode ? 'rgba(34,197,94,0.25)' : 'rgba(96,165,250,0.25)'}`,
              color: tacticalMode ? '#4ade80' : '#60a5fa',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Table2 size={13} />
            View Raw Telemetry Table
          </button>
          <div style={{ fontSize: 10, color: dimColor, marginTop: 6, lineHeight: 1.4 }}>
            Full Excel-like table of all telemetry data with sorting, filtering, and CSV export.
          </div>
          {onOpenLog && (
            <button
              onClick={onOpenLog}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '8px 12px',
                marginTop: 6,
                borderRadius: 6,
                background: tacticalMode ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${tacticalMode ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.08)'}`,
                color: tacticalMode ? 'rgba(74,222,128,0.7)' : '#d1d5db',
                fontSize: 11,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Live Data Log
            </button>
          )}
        </div>
      </ToolSection>

      {/* Camera feeds placeholder */}
      <ToolSection
        icon={<Camera size={14} />}
        title="Camera Feeds"
        tacticalMode={tacticalMode}
      >
        <div style={{ padding: '12px 14px', color: dimColor, fontSize: 11, fontStyle: 'italic' }}>
          No camera feeds configured
        </div>
      </ToolSection>

      {/* 3D Object placement placeholder */}
      <ToolSection
        icon={<Box size={14} />}
        title="Place Objects"
        tacticalMode={tacticalMode}
      >
        <div style={{ padding: '12px 14px', color: dimColor, fontSize: 11 }}>
          <div style={{ marginBottom: 6 }}>
            Place vehicles, equipment, and markers on the 3D map.
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4,
          }}>
            {['SUV', 'Pickup', 'Van', 'Barrier'].map(label => (
              <button
                key={label}
                style={{
                  padding: '6px 8px', borderRadius: 6,
                  background: tacticalMode ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${tacticalMode ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.08)'}`,
                  color: dimColor, cursor: 'pointer',
                  fontSize: 10, textAlign: 'center',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </ToolSection>

      {/* Map settings */}
      <ToolSection
        icon={<Map size={14} />}
        title="Map Settings"
        tacticalMode={tacticalMode}
      >
        <div style={{ padding: '8px 14px', color: dimColor, fontSize: 11 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" defaultChecked style={{ accentColor: tacticalMode ? '#4ade80' : '#3b82f6' }} />
            Show drone labels
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 6 }}>
            <input type="checkbox" defaultChecked style={{ accentColor: tacticalMode ? '#4ade80' : '#3b82f6' }} />
            Show flight tracks
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 6 }}>
            <input type="checkbox" defaultChecked style={{ accentColor: tacticalMode ? '#4ade80' : '#3b82f6' }} />
            Show CUAS coverage
          </label>
        </div>
      </ToolSection>

      {/* General settings */}
      <ToolSection
        icon={<Settings size={14} />}
        title="Session Settings"
        tacticalMode={tacticalMode}
      >
        <div style={{ padding: '8px 14px', color: dimColor, fontSize: 11 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Keyboard shortcuts</span>
            <span style={{ fontFamily: 'monospace', fontSize: 10 }}>Enabled</span>
          </div>
          <div style={{
            marginTop: 8, padding: 8, borderRadius: 6,
            background: tacticalMode ? 'rgba(34,197,94,0.04)' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${tacticalMode ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.04)'}`,
            fontFamily: 'monospace', fontSize: 9, lineHeight: 1.8,
          }}>
            <div><kbd style={kbdStyle}>J</kbd> Jam  <kbd style={kbdStyle}>E</kbd> Engage  <kbd style={kbdStyle}>D</kbd> Disengage</div>
            <div><kbd style={kbdStyle}>L</kbd> Launch  <kbd style={kbdStyle}>R</kbd> Recover  <kbd style={kbdStyle}>F</kbd> Failsafe</div>
            <div><kbd style={kbdStyle}>N</kbd> Note  <kbd style={kbdStyle}>T</kbd> Tactical  <kbd style={kbdStyle}>ESC</kbd> Deselect</div>
          </div>
        </div>
      </ToolSection>
    </div>
  );
};

const kbdStyle: React.CSSProperties = {
  padding: '1px 4px', borderRadius: 3,
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.15)',
  fontSize: 9,
};

const ToolSection: React.FC<{
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  tacticalMode: boolean;
}> = ({ icon, title, children, tacticalMode }) => {
  const dimColor = tacticalMode ? 'rgba(74,222,128,0.5)' : '#6b7280';
  const borderColor = tacticalMode ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.06)';

  return (
    <div style={{ borderBottom: `1px solid ${borderColor}` }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 14px', color: dimColor,
      }}>
        {icon}
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  );
};

export default ToolsPanel;
