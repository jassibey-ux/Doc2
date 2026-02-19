/**
 * EventSidebar — 56px icon strip on the left edge.
 *
 * Fleet (Users), Zones (Shield), Alerts (Bell) buttons.
 * Matching main app Sidebar.tsx glass morphism pattern.
 */

import React from 'react';
import { Users, Shield, Bell } from 'lucide-react';

export type EventPanel = 'fleet' | 'zones' | 'alerts';

interface EventSidebarProps {
  activePanel: EventPanel | null;
  onPanelChange: (panel: EventPanel | null) => void;
  alertCount: number;
}

const BUTTONS: Array<{ id: EventPanel; icon: typeof Users; tooltip: string }> = [
  { id: 'fleet',  icon: Users,  tooltip: 'Fleet' },
  { id: 'zones',  icon: Shield, tooltip: 'Zones' },
  { id: 'alerts', icon: Bell,   tooltip: 'Alerts' },
];

const EventSidebar: React.FC<EventSidebarProps> = ({
  activePanel,
  onPanelChange,
  alertCount,
}) => {
  const handleClick = (id: EventPanel) => {
    onPanelChange(activePanel === id ? null : id);
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
      background: 'rgba(10, 10, 20, 0.6)',
      borderRight: '1px solid rgba(255,255,255,0.06)',
    }}>
      {BUTTONS.map(({ id, icon: Icon, tooltip }) => {
        const isActive = activePanel === id;
        const showBadge = id === 'alerts' && alertCount > 0;

        return (
          <button
            key={id}
            onClick={() => handleClick(id)}
            title={tooltip}
            style={{
              position: 'relative',
              width: 42,
              height: 42,
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              border: isActive
                ? '1px solid rgba(255,255,255,0.25)'
                : '1px solid rgba(255,255,255,0.08)',
              background: isActive
                ? 'rgba(59, 130, 246, 0.2)'
                : 'rgba(255,255,255,0.04)',
              color: isActive ? '#60a5fa' : '#9ca3af',
              transition: 'all 0.2s ease',
            }}
          >
            <Icon size={18} />
            {showBadge && (
              <span style={{
                position: 'absolute', top: -3, right: -3,
                minWidth: 16, height: 16, borderRadius: 8,
                background: '#ef4444', color: '#fff',
                fontSize: 9, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 3px',
              }}>
                {alertCount > 9 ? '9+' : alertCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default EventSidebar;
