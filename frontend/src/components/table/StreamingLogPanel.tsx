/**
 * StreamingLogPanel — Compact right-panel streaming data log.
 *
 * Vertical card log where each timestamp entry shows ALL fields stacked.
 * Auto-scrolls to latest; scroll up pauses and shows "Jump to latest" pill.
 * Enhanced with engagement context: CUAS distance, jam status, event badges.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { ArrowDown, Trash2 } from 'lucide-react';
import { useStreamingData } from './useStreamingData';
import { satelliteColor, hdopColor, rssiColor, batteryColor, fixColor, qualityColor } from './cellColors';
import type { TelemetryRow } from './types';
import type { Engagement } from '../../types/workflow';

interface StreamingLogPanelProps {
  trackerFilter?: Set<string>;
  onRowClick?: (row: TelemetryRow) => void;
  tacticalMode?: boolean;
  activeEngagements?: Map<string, Engagement>;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

function fmtVal(v: number | null | undefined, suffix = '', decimals = 1): string {
  if (v == null) return '\u2014';
  return `${decimals === 0 ? Math.round(v) : v.toFixed(decimals)}${suffix}`;
}

function fmtCoord(v: number | null): string {
  if (v == null) return '\u2014';
  return v.toFixed(6);
}

const EVENT_BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  JAM_ON:     { bg: 'rgba(239,68,68,0.2)', text: '#ef4444' },
  JAM_OFF:    { bg: 'rgba(34,197,94,0.2)', text: '#22c55e' },
  GPS_LOST:   { bg: 'rgba(239,68,68,0.2)', text: '#ef4444' },
  ENGAGE:     { bg: 'rgba(6,182,212,0.2)', text: '#06b6d4' },
  DISENGAGE:  { bg: 'rgba(107,114,128,0.2)', text: '#9ca3af' },
};

const StreamingLogPanel: React.FC<StreamingLogPanelProps> = ({
  trackerFilter,
  onRowClick,
  tacticalMode = false,
  activeEngagements,
}) => {
  const { entries, totalReceived, clear } = useStreamingData(trackerFilter, activeEngagements);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, autoScroll]);

  // Detect manual scroll
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    setAutoScroll(atBottom);
  }, []);

  const jumpToLatest = useCallback(() => {
    setAutoScroll(true);
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  const dimColor = tacticalMode ? 'rgba(74,222,128,0.5)' : '#6b7280';
  const cardBg = tacticalMode ? 'rgba(34,197,94,0.04)' : 'rgba(255,255,255,0.03)';
  const cardBorder = tacticalMode ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.06)';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          borderBottom: `1px solid ${cardBorder}`,
          fontSize: 10,
          color: dimColor,
          flexShrink: 0,
        }}
      >
        <span>{entries.length} entries ({totalReceived} total)</span>
        <button
          onClick={clear}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            background: 'transparent',
            border: 'none',
            color: dimColor,
            fontSize: 10,
            cursor: 'pointer',
            padding: '2px 4px',
          }}
        >
          <Trash2 size={10} />
          Clear
        </button>
      </div>

      {/* Scrollable log */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '8px 10px',
          position: 'relative',
        }}
      >
        {entries.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              color: dimColor,
              fontSize: 11,
              padding: '24px 0',
              fontStyle: 'italic',
            }}
          >
            Waiting for tracker data...
          </div>
        )}

        {entries.map((entry) => (
          <LogCard
            key={entry.id}
            entry={entry}
            onClick={onRowClick}
            tacticalMode={tacticalMode}
            cardBg={cardBg}
            cardBorder={cardBorder}
            dimColor={dimColor}
          />
        ))}
      </div>

      {/* Jump to latest pill */}
      {!autoScroll && entries.length > 0 && (
        <button
          onClick={jumpToLatest}
          style={{
            position: 'absolute',
            bottom: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '5px 14px',
            borderRadius: 16,
            background: tacticalMode ? 'rgba(34,197,94,0.9)' : 'rgba(96,165,250,0.9)',
            border: 'none',
            color: '#fff',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
            zIndex: 5,
          }}
        >
          <ArrowDown size={12} />
          Jump to latest
        </button>
      )}
    </div>
  );
};

// ─── Log Card ────────────────────────────────────────────────────────────────

interface LogCardProps {
  entry: TelemetryRow;
  onClick?: (row: TelemetryRow) => void;
  tacticalMode: boolean;
  cardBg: string;
  cardBorder: string;
  dimColor: string;
}

const LogCard: React.FC<LogCardProps> = React.memo(
  ({ entry, onClick, tacticalMode, cardBg, cardBorder, dimColor }) => {
    const fixColors = fixColor(entry.fix_valid);
    const isEvent = !!entry.event_type;
    const bg = isEvent
      ? (EVENT_BADGE_COLORS[entry.event_type!]?.bg ?? 'rgba(107,114,128,0.08)')
      : entry.inJamBurst
      ? 'rgba(239,68,68,0.06)'
      : cardBg;

    // Event rows render as compact badges
    if (isEvent) {
      const badgeColor = EVENT_BADGE_COLORS[entry.event_type!] ?? { bg: 'rgba(107,114,128,0.15)', text: '#9ca3af' };
      return (
        <div
          onClick={() => onClick?.(entry)}
          style={{
            background: badgeColor.bg,
            border: `1px solid ${badgeColor.text}40`,
            borderRadius: 6,
            marginBottom: 8,
            padding: '6px 10px',
            cursor: onClick ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{
            fontFamily: "'SF Mono', monospace",
            fontSize: 10,
            color: dimColor,
          }}>
            {fmtTime(entry.timestamp)}
          </span>
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.5,
            color: badgeColor.text,
            textTransform: 'uppercase',
          }}>
            {entry.event_type}
          </span>
          <span style={{ fontSize: 9, color: dimColor }}>
            {entry.tracker_id}
          </span>
        </div>
      );
    }

    return (
      <div
        onClick={() => onClick?.(entry)}
        style={{
          background: bg,
          border: `1px solid ${cardBorder}`,
          borderRadius: 6,
          marginBottom: 8,
          cursor: onClick ? 'pointer' : 'default',
          overflow: 'hidden',
          borderLeft: entry.inJamBurst
            ? '3px solid #ef4444'
            : entry.inEngagement
            ? '3px solid #06b6d4'
            : `1px solid ${cardBorder}`,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 8px',
            borderBottom: `1px solid ${cardBorder}`,
            background: tacticalMode
              ? 'rgba(34,197,94,0.06)'
              : 'rgba(255,255,255,0.03)',
          }}
        >
          <span
            style={{
              fontFamily: "'SF Mono', monospace",
              fontSize: 11,
              fontWeight: 600,
              color: tacticalMode ? '#4ade80' : '#fff',
            }}
          >
            {fmtTime(entry.timestamp)}
          </span>
          <span
            style={{
              fontSize: 10,
              color: dimColor,
              fontWeight: 600,
              letterSpacing: 0.5,
            }}
          >
            {entry.tracker_id}
          </span>
          {/* Engagement context badges */}
          {entry.jam_active && (
            <span style={{
              fontSize: 8, fontWeight: 700, letterSpacing: 0.5,
              padding: '1px 4px', borderRadius: 3,
              background: 'rgba(239,68,68,0.2)', color: '#ef4444',
            }}>
              JAM
            </span>
          )}
          {entry.inEngagement && !entry.jam_active && (
            <span style={{
              fontSize: 8, fontWeight: 700, letterSpacing: 0.5,
              padding: '1px 4px', borderRadius: 3,
              background: 'rgba(6,182,212,0.2)', color: '#06b6d4',
            }}>
              ENG
            </span>
          )}
          <span style={{ marginLeft: 'auto' }}>
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: 2,
                background: fixColors.text,
              }}
            />
          </span>
        </div>

        {/* Field rows */}
        <div style={{ padding: '4px 8px 6px' }}>
          <FieldRow label="lat" value={fmtCoord(entry.lat)} dimColor={dimColor} tacticalMode={tacticalMode} />
          <FieldRow label="lon" value={fmtCoord(entry.lon)} dimColor={dimColor} tacticalMode={tacticalMode} />
          <FieldRow label="alt_m" value={fmtVal(entry.alt_m)} dimColor={dimColor} tacticalMode={tacticalMode} />
          <FieldRow label="speed" value={fmtVal(entry.speed_mps, ' m/s')} dimColor={dimColor} tacticalMode={tacticalMode} />
          <FieldRow label="course" value={fmtVal(entry.course_deg, '\u00B0')} dimColor={dimColor} tacticalMode={tacticalMode} />
          <ColorFieldRow label="sats" value={fmtVal(entry.satellites, '', 0)} color={satelliteColor(entry.satellites)} dimColor={dimColor} tacticalMode={tacticalMode} />
          <ColorFieldRow label="hdop" value={fmtVal(entry.hdop)} color={hdopColor(entry.hdop)} dimColor={dimColor} tacticalMode={tacticalMode} />
          <ColorFieldRow label="rssi" value={fmtVal(entry.rssi_dbm, ' dBm', 0)} color={rssiColor(entry.rssi_dbm)} dimColor={dimColor} tacticalMode={tacticalMode} />
          <ColorFieldRow label="battery" value={fmtVal(entry.battery_mv, ' mV', 0)} color={batteryColor(entry.battery_mv)} dimColor={dimColor} tacticalMode={tacticalMode} />
          <FieldRow label="fix" value={entry.fix_valid ? '\u2713 valid' : '\u2717 lost'} dimColor={dimColor} tacticalMode={tacticalMode} valueColor={fixColor(entry.fix_valid).text} />
          {/* Engagement context fields */}
          {entry.cuas_distance_m != null && (
            <FieldRow label="cuas_dist" value={`${entry.cuas_distance_m}m`} dimColor={dimColor} tacticalMode={tacticalMode} valueColor="#3b82f6" />
          )}
          {entry.alt_delta_m != null && (
            <FieldRow label="alt_delta" value={`${entry.alt_delta_m >= 0 ? '+' : ''}${entry.alt_delta_m.toFixed(1)}m`} dimColor={dimColor} tacticalMode={tacticalMode} valueColor={Math.abs(entry.alt_delta_m) > 20 ? '#eab308' : undefined} />
          )}
          <FieldRow label="baro_alt" value={fmtVal(entry.baro_alt_m)} dimColor={dimColor} tacticalMode={tacticalMode} />
          <FieldRow label="baro_hpa" value={fmtVal(entry.baro_press_hpa)} dimColor={dimColor} tacticalMode={tacticalMode} />
          <FieldRow label="baro_temp" value={fmtVal(entry.baro_temp_c, '\u00B0C')} dimColor={dimColor} tacticalMode={tacticalMode} />
          <FieldRow label="latency" value={fmtVal(entry.latency_ms, ' ms', 0)} dimColor={dimColor} tacticalMode={tacticalMode} />
          <FieldRow label="gps_qual" value={entry.gps_quality ?? '\u2014'} dimColor={dimColor} tacticalMode={tacticalMode} valueColor={entry.gps_quality ? qualityColor(entry.gps_quality).text : undefined} />
        </div>
      </div>
    );
  },
);

// ─── Field row helpers ───────────────────────────────────────────────────────

const FieldRow: React.FC<{
  label: string;
  value: string;
  dimColor: string;
  tacticalMode: boolean;
  valueColor?: string;
}> = ({ label, value, dimColor, tacticalMode, valueColor }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '1px 0',
    }}
  >
    <span style={{ fontSize: 10, color: dimColor }}>{label}</span>
    <span
      style={{
        fontFamily: "'SF Mono', monospace",
        fontSize: 11,
        color: valueColor || (tacticalMode ? '#4ade80' : '#d1d5db'),
      }}
    >
      {value}
    </span>
  </div>
);

const ColorFieldRow: React.FC<{
  label: string;
  value: string;
  color: { bg: string; text: string };
  dimColor: string;
  tacticalMode: boolean;
}> = ({ label, value, color, dimColor, tacticalMode }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '1px 0',
    }}
  >
    <span style={{ fontSize: 10, color: dimColor }}>{label}</span>
    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {color.text && (
        <span
          style={{
            display: 'inline-block',
            width: 7,
            height: 7,
            borderRadius: 2,
            background: color.bg !== 'transparent' ? color.text : 'transparent',
          }}
        />
      )}
      <span
        style={{
          fontFamily: "'SF Mono', monospace",
          fontSize: 11,
          color: color.text || (tacticalMode ? '#4ade80' : '#d1d5db'),
        }}
      >
        {value}
      </span>
    </span>
  </div>
);

export default StreamingLogPanel;
