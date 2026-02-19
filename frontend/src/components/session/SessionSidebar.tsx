/**
 * SessionSidebar — 56px icon strip on the left edge.
 *
 * 4 tabs: Operations (Plane), Engagements (Target), Activity (Clock), Tools (Wrench)
 * Follows EventSidebar pattern from event/ directory.
 */

import React from 'react';
import { Plane, Crosshair, Clock, Wrench } from 'lucide-react';

export type SessionPanel = 'operations' | 'engagements' | 'activity' | 'tools';

interface SessionSidebarProps {
  activePanel: SessionPanel | null;
  onPanelChange: (panel: SessionPanel | null) => void;
  alertCount: number;
  activeEngagementCount: number;
  tacticalMode: boolean;
}

const BUTTONS: Array<{
  id: SessionPanel;
  icon: typeof Plane;
  tooltip: string;
  badgeKey?: 'alert' | 'engagement';
}> = [
  { id: 'operations',   icon: Plane,     tooltip: 'Operations (Trackers & CUAS)' },
  { id: 'engagements',  icon: Crosshair, tooltip: 'Engagements', badgeKey: 'engagement' },
  { id: 'activity',     icon: Clock,     tooltip: 'Activity (Alerts & Events)', badgeKey: 'alert' },
  { id: 'tools',        icon: Wrench,    tooltip: 'Tools' },
];

const SessionSidebar: React.FC<SessionSidebarProps> = ({
  activePanel,
  onPanelChange,
  alertCount,
  activeEngagementCount,
  tacticalMode,
}) => {
  const handleClick = (id: SessionPanel) => {
    onPanelChange(activePanel === id ? null : id);
  };

  const getBadgeCount = (badgeKey?: string): number => {
    if (badgeKey === 'alert') return alertCount;
    if (badgeKey === 'engagement') return activeEngagementCount;
    return 0;
  };

  const getBadgeColor = (badgeKey?: string): string => {
    if (badgeKey === 'alert') return '#ef4444';
    if (badgeKey === 'engagement') return '#06b6d4';
    return '#6b7280';
  };

  return (
    <div style={{
      width: 56,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
      paddingTop: 12,
      background: tacticalMode
        ? 'rgba(0, 0, 0, 0.8)'
        : 'rgba(10, 10, 20, 0.6)',
      borderRight: `1px solid ${tacticalMode ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.06)'}`,
    }}>
      {BUTTONS.map(({ id, icon: Icon, tooltip, badgeKey }) => {
        const isActive = activePanel === id;
        const badgeCount = getBadgeCount(badgeKey);
        const showBadge = badgeCount > 0;

        const activeColor = tacticalMode ? '#4ade80' : '#60a5fa';
        const inactiveColor = tacticalMode ? 'rgba(74,222,128,0.5)' : '#9ca3af';

        return (
          <button
            key={id}
            onClick={() => handleClick(id)}
            title={tooltip}
            style={{
              position: 'relative',
              width: tacticalMode ? 48 : 42,
              height: tacticalMode ? 48 : 42,
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              border: isActive
                ? `1px solid ${tacticalMode ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.25)'}`
                : `1px solid ${tacticalMode ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.08)'}`,
              background: isActive
                ? (tacticalMode ? 'rgba(34,197,94,0.15)' : 'rgba(59, 130, 246, 0.2)')
                : (tacticalMode ? 'rgba(34,197,94,0.04)' : 'rgba(255,255,255,0.04)'),
              color: isActive ? activeColor : inactiveColor,
              transition: 'all 0.2s ease',
            }}
          >
            <Icon size={18} />
            {showBadge && (
              <span style={{
                position: 'absolute', top: -3, right: -3,
                minWidth: 16, height: 16, borderRadius: 8,
                background: getBadgeColor(badgeKey), color: '#fff',
                fontSize: 9, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 3px',
              }}>
                {badgeCount > 9 ? '9+' : badgeCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default SessionSidebar;
