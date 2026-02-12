/**
 * TrackLegend Component
 * Displays a legend for GPS quality-based track coloring
 */

import { Signal, SignalLow, SignalZero, Download, HardDrive } from 'lucide-react';
import { QUALITY_COLORS } from '../utils/trackSegmentation';

interface TrackLegendProps {
  visible?: boolean;
  showSDOnly?: boolean;
  compact?: boolean;
  /** Show SD Card track entry for dual-track visualization */
  showSDCardTrack?: boolean;
  /** Current visibility state of SD Card track layer */
  sdCardTrackVisible?: boolean;
  /** Callback to toggle SD Card track visibility */
  onSDCardTrackToggle?: (visible: boolean) => void;
}

interface LegendItem {
  key: string;
  label: string;
  color: string;
  icon: React.ReactNode;
  dashed?: boolean;
  description?: string;
}

export default function TrackLegend({
  visible = true,
  showSDOnly = false,
  compact = false,
  showSDCardTrack = false,
  sdCardTrackVisible = true,
  onSDCardTrackToggle,
}: TrackLegendProps) {
  if (!visible) return null;

  const legendItems: LegendItem[] = [
    {
      key: 'good',
      label: 'Good GPS',
      color: QUALITY_COLORS.good,
      icon: <Signal size={14} />,
      description: 'Strong signal, HDOP < 2',
    },
    {
      key: 'degraded',
      label: 'Degraded',
      color: QUALITY_COLORS.degraded,
      icon: <SignalLow size={14} />,
      description: 'Weak signal, HDOP 2-5',
    },
    {
      key: 'lost',
      label: 'GPS Lost',
      color: QUALITY_COLORS.lost,
      icon: <SignalZero size={14} />,
      dashed: true,
      description: 'No GPS fix',
    },
  ];

  if (showSDOnly) {
    legendItems.push({
      key: 'sd_only',
      label: 'SD Card',
      color: QUALITY_COLORS.sd_only,
      icon: <Download size={14} />,
      description: 'From SD card data',
    });
  }

  if (compact) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '6px 10px',
          background: 'rgba(20, 20, 35, 0.9)',
          borderRadius: '6px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          fontSize: '11px',
        }}
      >
        {legendItems.map(item => (
          <div
            key={item.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              color: 'rgba(255, 255, 255, 0.8)',
            }}
          >
            <div
              style={{
                width: '16px',
                height: '3px',
                background: item.dashed
                  ? `repeating-linear-gradient(90deg, ${item.color} 0px, ${item.color} 4px, transparent 4px, transparent 8px)`
                  : item.color,
                borderRadius: '1px',
              }}
            />
            <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>{item.label}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'rgba(20, 20, 35, 0.95)',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        padding: '10px 12px',
        minWidth: '160px',
      }}
    >
      <div
        style={{
          fontSize: '11px',
          fontWeight: 600,
          color: 'rgba(255, 255, 255, 0.5)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: '8px',
        }}
      >
        Track Quality
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        {legendItems.map(item => (
          <div
            key={item.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
            title={item.description}
          >
            {/* Line sample */}
            <div
              style={{
                width: '24px',
                height: '4px',
                background: item.dashed
                  ? `repeating-linear-gradient(90deg, ${item.color} 0px, ${item.color} 4px, transparent 4px, transparent 8px)`
                  : item.color,
                borderRadius: '2px',
                boxShadow: `0 0 4px ${item.color}40`,
              }}
            />

            {/* Icon */}
            <div style={{ color: item.color, display: 'flex', alignItems: 'center' }}>
              {item.icon}
            </div>

            {/* Label */}
            <span
              style={{
                fontSize: '12px',
                color: 'rgba(255, 255, 255, 0.8)',
              }}
            >
              {item.label}
            </span>
          </div>
        ))}
      </div>

      {/* SD Card Track Section (for dual-track visualization) */}
      {showSDCardTrack && (
        <>
          <div
            style={{
              height: '1px',
              background: 'rgba(255, 255, 255, 0.1)',
              margin: '10px 0 8px 0',
            }}
          />
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'rgba(255, 255, 255, 0.5)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '8px',
            }}
          >
            SD Card Data
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: onSDCardTrackToggle ? 'pointer' : 'default',
              padding: '4px 6px',
              marginLeft: '-6px',
              marginRight: '-6px',
              borderRadius: '4px',
              background: sdCardTrackVisible ? 'rgba(249, 115, 22, 0.1)' : 'transparent',
              transition: 'background 0.2s ease',
            }}
            onClick={() => onSDCardTrackToggle?.(!sdCardTrackVisible)}
            title="Click to toggle SD Card track visibility"
          >
            {/* Toggle indicator */}
            {onSDCardTrackToggle && (
              <div
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '3px',
                  border: `2px solid ${sdCardTrackVisible ? '#f97316' : 'rgba(255, 255, 255, 0.3)'}`,
                  background: sdCardTrackVisible ? '#f97316' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                }}
              >
                {sdCardTrackVisible && (
                  <div style={{ color: '#fff', fontSize: '8px', fontWeight: 'bold' }}>✓</div>
                )}
              </div>
            )}

            {/* Line sample */}
            <div
              style={{
                width: '24px',
                height: '4px',
                background: '#f97316',
                borderRadius: '2px',
                boxShadow: `0 0 4px rgba(249, 115, 22, 0.4)`,
                opacity: sdCardTrackVisible ? 1 : 0.4,
              }}
            />

            {/* Icon */}
            <div
              style={{
                color: '#f97316',
                display: 'flex',
                alignItems: 'center',
                opacity: sdCardTrackVisible ? 1 : 0.4,
              }}
            >
              <HardDrive size={14} />
            </div>

            {/* Label */}
            <span
              style={{
                fontSize: '12px',
                color: sdCardTrackVisible ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.4)',
              }}
            >
              SD Card Track
            </span>
          </div>
          <div
            style={{
              fontSize: '10px',
              color: 'rgba(255, 255, 255, 0.4)',
              marginTop: '4px',
              marginLeft: onSDCardTrackToggle ? '20px' : '0',
            }}
          >
            Recorded locally during connection loss
          </div>
        </>
      )}
    </div>
  );
}
