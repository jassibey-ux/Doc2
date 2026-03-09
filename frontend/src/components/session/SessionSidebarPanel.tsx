/**
 * SessionSidebarPanel — Collapsible 280px panel that overlays the map.
 *
 * Routes to the correct content panel based on active tab.
 * Animated slide-in/out via CSS transition.
 */

import React from 'react';
import type { SessionPanel } from './SessionSidebar';
import OperationsPanel from './panels/OperationsPanel';
import EngagementPanel from './panels/EngagementPanel';
import ActivityPanel from './panels/ActivityPanel';
import ToolsPanel from './panels/ToolsPanel';
import type { DroneSummary } from '../../types/drone';
import type { DroneProfile, CUASPlacement, CUASProfile, TestEvent, Engagement } from '../../types/workflow';
import type { SessionAlert } from './hooks/useSessionAlerts';

interface SessionSidebarPanelProps {
  activePanel: SessionPanel | null;
  tacticalMode: boolean;

  // Operations panel
  drones: Map<string, DroneSummary>;
  cuasPlacements: CUASPlacement[];
  cuasProfiles: CUASProfile[];
  cuasJamStates: Map<string, boolean>;
  selectedDroneId: string | null;
  selectedCuasId: string | null;
  onSelectDrone: (id: string) => void;
  onSelectCuas: (id: string) => void;
  droneProfileMap?: Map<string, DroneProfile>;

  // Engagements panel
  engagements: Engagement[];
  activeEngagements: Map<string, Engagement>;
  onSelectEngagement: (id: string) => void;
  sessionId?: string;

  // Activity panel
  alerts: SessionAlert[];
  events: TestEvent[];
  onAcknowledgeAlert: (id: string) => void;
  onAcknowledgeAll: () => void;
  onAlertClick: (alert: SessionAlert) => void;

  // Tools panel
  onOpenLog?: () => void;

  // Live drone data for engagement panel
  currentDroneData?: Map<string, DroneSummary>;
}

const PANEL_TITLES: Record<SessionPanel, string> = {
  operations: 'Operations',
  engagements: 'Engagements',
  activity: 'Activity',
  tools: 'Tools',
};

const SessionSidebarPanel: React.FC<SessionSidebarPanelProps> = ({
  activePanel,
  tacticalMode,
  ...props
}) => {
  if (!activePanel) return null;

  return (
    <div style={{
      width: 280,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      background: tacticalMode ? 'rgba(0, 0, 0, 0.9)' : 'rgba(10, 10, 20, 0.92)',
      borderRight: `1px solid ${tacticalMode ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.06)'}`,
      backdropFilter: 'blur(16px)',
      overflow: 'hidden',
    }}>
      {/* Panel header */}
      <div style={{
        padding: '10px 14px',
        borderBottom: `1px solid ${tacticalMode ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.06)'}`,
        display: 'flex', alignItems: 'center',
      }}>
        <span style={{
          fontSize: 12, fontWeight: 700, letterSpacing: 1,
          textTransform: 'uppercase',
          color: tacticalMode ? '#4ade80' : '#9ca3af',
        }}>
          {PANEL_TITLES[activePanel]}
        </span>
      </div>

      {/* Panel content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {activePanel === 'operations' && (
          <OperationsPanel
            drones={props.drones}
            cuasPlacements={props.cuasPlacements}
            cuasProfiles={props.cuasProfiles}
            cuasJamStates={props.cuasJamStates}
            selectedDroneId={props.selectedDroneId}
            selectedCuasId={props.selectedCuasId}
            onSelectDrone={props.onSelectDrone}
            onSelectCuas={props.onSelectCuas}
            tacticalMode={tacticalMode}
            droneProfileMap={props.droneProfileMap}
          />
        )}
        {activePanel === 'engagements' && (
          <EngagementPanel
            engagements={props.engagements}
            activeEngagements={props.activeEngagements}
            onSelectEngagement={props.onSelectEngagement}
            tacticalMode={tacticalMode}
            currentDroneData={props.currentDroneData}
            cuasPlacements={props.cuasPlacements}
            sessionId={props.sessionId}
          />
        )}
        {activePanel === 'activity' && (
          <ActivityPanel
            alerts={props.alerts}
            events={props.events}
            onAcknowledgeAlert={props.onAcknowledgeAlert}
            onAcknowledgeAll={props.onAcknowledgeAll}
            onAlertClick={props.onAlertClick}
            tacticalMode={tacticalMode}
          />
        )}
        {activePanel === 'tools' && (
          <ToolsPanel tacticalMode={tacticalMode} onOpenLog={props.onOpenLog} />
        )}
      </div>
    </div>
  );
};

export default SessionSidebarPanel;
