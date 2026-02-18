/**
 * CameraPresetsOverlay — Compact camera preset buttons, absolute-positioned top-left of map.
 *
 * Overview, Orbit Venue, Follow Drone (when selected), Reset, Labels toggle.
 */

import React from 'react';
import { Eye, RotateCw, Crosshair, RotateCcw, Tag } from 'lucide-react';

interface CameraPresetsOverlayProps {
  onOverview: () => void;
  onOrbitVenue: () => void;
  onFollowDrone: () => void;
  onReset: () => void;
  showLabels: boolean;
  onToggleLabels: () => void;
  hasDroneSelected: boolean;
}

const PRESETS: Array<{
  id: string;
  icon: typeof Eye;
  label: string;
  key: keyof Pick<CameraPresetsOverlayProps, 'onOverview' | 'onOrbitVenue' | 'onFollowDrone' | 'onReset'>;
  requiresDrone?: boolean;
}> = [
  { id: 'overview', icon: Eye,        label: 'Overview',     key: 'onOverview' },
  { id: 'orbit',    icon: RotateCw,   label: 'Orbit Venue',  key: 'onOrbitVenue' },
  { id: 'follow',   icon: Crosshair,  label: 'Follow Drone', key: 'onFollowDrone', requiresDrone: true },
  { id: 'reset',    icon: RotateCcw,  label: 'Reset',        key: 'onReset' },
];

const CameraPresetsOverlay: React.FC<CameraPresetsOverlayProps> = (props) => {
  const { showLabels, onToggleLabels, hasDroneSelected } = props;

  return (
    <div style={{
      position: 'absolute',
      top: 12,
      left: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      zIndex: 5,
    }}>
      {PRESETS.map(({ id, icon: Icon, label, key, requiresDrone }) => {
        if (requiresDrone && !hasDroneSelected) return null;
        return (
          <PresetButton
            key={id}
            icon={<Icon size={15} />}
            label={label}
            onClick={props[key]}
          />
        );
      })}

      {/* Labels toggle */}
      <PresetButton
        icon={<Tag size={15} />}
        label={showLabels ? 'Labels: ON' : 'Labels: OFF'}
        onClick={onToggleLabels}
        active={showLabels}
      />
    </div>
  );
};

const PresetButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}> = ({ icon, label, onClick, active }) => (
  <button
    onClick={onClick}
    title={label}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '5px 10px',
      borderRadius: 6,
      border: `1px solid ${active ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.15)'}`,
      background: active ? 'rgba(59,130,246,0.25)' : 'rgba(10, 10, 20, 0.8)',
      backdropFilter: 'blur(12px)',
      color: active ? '#60a5fa' : '#d1d5db',
      fontSize: 11,
      fontWeight: 500,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      transition: 'all 0.15s ease',
    }}
  >
    {icon}
    {label}
  </button>
);

export default CameraPresetsOverlay;
