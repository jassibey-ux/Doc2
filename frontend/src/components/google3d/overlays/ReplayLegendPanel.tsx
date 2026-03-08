/**
 * ReplayLegendPanel — Overlay legend for replay mode showing GPS quality colors,
 * engagement line status, and toggle controls.
 */

import { useState, useEffect } from 'react';

interface ReplayLegendPanelProps {
  visible?: boolean;
  onToggleVisibility?: (visible: boolean) => void;
}

const QUALITY_ITEMS = [
  { label: 'Good (HDOP < 2)', color: '#22c55e' },
  { label: 'Degraded (HDOP 2–5)', color: '#eab308' },
  { label: 'Poor (HDOP > 5)', color: '#ef4444' },
  { label: 'Unknown', color: '#6b7280' },
];

const ENGAGEMENT_ITEMS = [
  { label: 'GPS Lost', color: '#ef4444', width: 4 },
  { label: 'GPS Degraded', color: '#eab308', width: 3 },
  { label: 'GPS Healthy', color: '#22c55e', width: 3 },
  { label: 'Jamming Active', color: '#22c55e', width: 3.5 },
  { label: 'Complete', color: '#6b7280', width: 1.5 },
];

const STORAGE_KEY = 'replay_legend_visible';

export default function ReplayLegendPanel({ visible: externalVisible, onToggleVisibility }: ReplayLegendPanelProps) {
  const [isVisible, setIsVisible] = useState(() => {
    if (externalVisible !== undefined) return externalVisible;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored !== 'false';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (externalVisible !== undefined) setIsVisible(externalVisible);
  }, [externalVisible]);

  const toggle = () => {
    const next = !isVisible;
    setIsVisible(next);
    onToggleVisibility?.(next);
    try { localStorage.setItem(STORAGE_KEY, String(next)); } catch {}
  };

  return (
    <div style={{
      position: 'absolute', top: 8, right: 48, zIndex: 10,
      display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4,
    }}>
      {/* Toggle button */}
      <button
        onClick={toggle}
        style={{
          background: 'rgba(10, 15, 26, 0.85)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 6,
          padding: '4px 10px',
          color: isVisible ? '#3b82f6' : 'rgba(255,255,255,0.5)',
          cursor: 'pointer',
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        Legend
      </button>

      {/* Panel content */}
      {isVisible && (
        <div style={{
          width: 220,
          background: 'rgba(10, 15, 26, 0.9)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 10,
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}>
          {/* GPS Quality section */}
          <div>
            <div style={{
              fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.5)',
              textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6,
            }}>
              GPS Quality
            </div>
            {QUALITY_ITEMS.map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <div style={{
                  width: 24, height: 4, borderRadius: 2,
                  background: item.color, flexShrink: 0,
                }} />
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>{item.label}</span>
              </div>
            ))}
          </div>

          {/* Engagement Lines section */}
          <div>
            <div style={{
              fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.5)',
              textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6,
            }}>
              Engagement Lines
            </div>
            {ENGAGEMENT_ITEMS.map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <div style={{
                  width: 24, height: item.width, borderRadius: 1,
                  background: item.color, flexShrink: 0,
                }} />
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
