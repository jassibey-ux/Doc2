/**
 * TanStack Table column definitions for telemetry data.
 */

import { createColumnHelper } from '@tanstack/react-table';
import type { TelemetryRow, ColumnPresetDef, ColumnPreset } from './types';
import {
  satelliteColor,
  hdopColor,
  rssiColor,
  batteryColor,
  fixColor,
  qualityColor,
} from './cellColors';

function jamActiveColor(active: boolean | undefined): { bg: string; text: string } {
  if (active == null) return { bg: 'transparent', text: '' };
  return active
    ? { bg: 'rgba(239,68,68,0.12)', text: '#f87171' }
    : { bg: 'rgba(34,197,94,0.12)', text: '#4ade80' };
}

const col = createColumnHelper<TelemetryRow>();

/** Format ISO timestamp to HH:MM:SS.mmm */
function fmtTime(iso: string | null): string {
  if (!iso) return '--';
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

function fmtNum(v: number | null, decimals = 1): string {
  if (v == null) return '--';
  return v.toFixed(decimals);
}

function fmtCoord(v: number | null): string {
  if (v == null) return '--';
  return v.toFixed(6);
}

function fmtInt(v: number | null): string {
  if (v == null) return '--';
  return String(Math.round(v));
}

export type CellColorFn = (row: TelemetryRow) => { bg: string; text: string };

/** Metadata attached to each column for cell coloring */
export interface ColumnMeta {
  colorFn?: CellColorFn;
  width: number;
}

export const columns = [
  col.accessor('timestamp', {
    header: 'Time',
    cell: (info) => fmtTime(info.getValue()),
    meta: { width: 90 } as ColumnMeta,
  }),
  col.accessor('time_gps', {
    header: 'GPS Time',
    cell: (info) => fmtTime(info.getValue()),
    meta: { width: 90 } as ColumnMeta,
  }),
  col.accessor('tracker_id', {
    header: 'Tracker',
    cell: (info) => info.getValue(),
    meta: { width: 80 } as ColumnMeta,
  }),
  col.accessor('lat', {
    header: 'Lat',
    cell: (info) => fmtCoord(info.getValue()),
    meta: { width: 95 } as ColumnMeta,
  }),
  col.accessor('lon', {
    header: 'Lon',
    cell: (info) => fmtCoord(info.getValue()),
    meta: { width: 95 } as ColumnMeta,
  }),
  col.accessor('alt_m', {
    header: 'GPS Alt',
    cell: (info) => fmtNum(info.getValue(), 1),
    meta: { width: 60 } as ColumnMeta,
  }),
  col.accessor('speed_mps', {
    header: 'Speed',
    cell: (info) => fmtNum(info.getValue(), 1),
    meta: { width: 60 } as ColumnMeta,
  }),
  col.accessor('course_deg', {
    header: 'Course',
    cell: (info) => fmtNum(info.getValue(), 1),
    meta: { width: 60 } as ColumnMeta,
  }),
  col.accessor('hdop', {
    header: 'HDOP',
    cell: (info) => fmtNum(info.getValue(), 1),
    meta: {
      width: 55,
      colorFn: (row: TelemetryRow) => hdopColor(row.hdop),
    } as ColumnMeta,
  }),
  col.accessor('satellites', {
    header: 'Sats',
    cell: (info) => fmtInt(info.getValue()),
    meta: {
      width: 50,
      colorFn: (row: TelemetryRow) => satelliteColor(row.satellites),
    } as ColumnMeta,
  }),
  col.accessor('rssi_dbm', {
    header: 'RSSI',
    cell: (info) => fmtInt(info.getValue()),
    meta: {
      width: 60,
      colorFn: (row: TelemetryRow) => rssiColor(row.rssi_dbm),
    } as ColumnMeta,
  }),
  col.accessor('baro_alt_m', {
    header: 'Baro Alt',
    cell: (info) => fmtNum(info.getValue(), 1),
    meta: { width: 65 } as ColumnMeta,
  }),
  col.accessor('baro_temp_c', {
    header: 'Temp',
    cell: (info) => fmtNum(info.getValue(), 1),
    meta: { width: 50 } as ColumnMeta,
  }),
  col.accessor('baro_press_hpa', {
    header: 'Press',
    cell: (info) => fmtNum(info.getValue(), 1),
    meta: { width: 60 } as ColumnMeta,
  }),
  col.accessor('fix_valid', {
    header: 'Fix',
    cell: (info) => info.getValue() ? 'YES' : 'NO',
    meta: {
      width: 45,
      colorFn: (row: TelemetryRow) => fixColor(row.fix_valid),
    } as ColumnMeta,
  }),
  col.accessor('battery_mv', {
    header: 'Battery',
    cell: (info) => fmtInt(info.getValue()),
    meta: {
      width: 65,
      colorFn: (row: TelemetryRow) => batteryColor(row.battery_mv),
    } as ColumnMeta,
  }),
  col.accessor('latency_ms', {
    header: 'Latency',
    cell: (info) => fmtInt(info.getValue()),
    meta: { width: 60 } as ColumnMeta,
  }),
  col.accessor('gps_quality', {
    header: 'Quality',
    cell: (info) => info.getValue() ?? '--',
    meta: {
      width: 65,
      colorFn: (row: TelemetryRow) => qualityColor(row.gps_quality),
    } as ColumnMeta,
  }),
  col.accessor('engagement_id', {
    header: 'Engage ID',
    cell: (info) => {
      const v = info.getValue();
      if (!v) return '--';
      // Show last 6 chars for brevity
      return v.length > 8 ? `…${v.slice(-6)}` : v;
    },
    meta: { width: 75 } as ColumnMeta,
  }),
  col.accessor('jam_active', {
    header: 'Jam',
    cell: (info) => {
      const v = info.getValue();
      if (v == null) return '--';
      return v ? 'ON' : 'OFF';
    },
    meta: {
      width: 45,
      colorFn: (row: TelemetryRow) => jamActiveColor(row.jam_active),
    } as ColumnMeta,
  }),
  col.accessor('cuas_distance_m', {
    header: 'CUAS Dist',
    cell: (info) => fmtInt(info.getValue() ?? null),
    meta: { width: 70 } as ColumnMeta,
  }),
  col.accessor('alt_delta_m', {
    header: 'Alt \u0394',
    cell: (info) => {
      const v = info.getValue();
      if (v == null) return '--';
      return `${v >= 0 ? '+' : ''}${v.toFixed(1)}`;
    },
    meta: { width: 60 } as ColumnMeta,
  }),
  col.accessor('event_type', {
    header: 'Event',
    cell: (info) => info.getValue() ?? '--',
    meta: { width: 80 } as ColumnMeta,
  }),
];

/** Column IDs for each preset */
export const COLUMN_PRESETS: ColumnPresetDef[] = [
  {
    id: 'overview',
    label: 'Overview',
    columns: ['timestamp', 'tracker_id', 'lat', 'lon', 'alt_m', 'speed_mps', 'fix_valid'],
  },
  {
    id: 'gps',
    label: 'GPS Diagnostics',
    columns: ['timestamp', 'tracker_id', 'lat', 'lon', 'hdop', 'satellites', 'fix_valid', 'baro_alt_m', 'gps_quality'],
  },
  {
    id: 'signal',
    label: 'Signal Analysis',
    columns: ['timestamp', 'tracker_id', 'rssi_dbm', 'hdop', 'satellites', 'battery_mv', 'latency_ms', 'speed_mps'],
  },
  {
    id: 'engagement',
    label: 'Engagement',
    columns: ['timestamp', 'tracker_id', 'engagement_id', 'jam_active', 'event_type', 'cuas_distance_m', 'alt_delta_m', 'fix_valid', 'hdop', 'satellites', 'rssi_dbm'],
  },
  {
    id: 'all',
    label: 'All Columns',
    columns: [], // empty = show all
  },
];

/** Get column visibility map for a preset */
export function getVisibilityForPreset(preset: ColumnPreset): Record<string, boolean> {
  const def = COLUMN_PRESETS.find((p) => p.id === preset);
  if (!def || def.columns.length === 0) {
    // All columns visible
    return {};
  }
  const visibility: Record<string, boolean> = {};
  const allIds = columns.map((c) => (c as any).accessorKey as string);
  for (const id of allIds) {
    visibility[id] = def.columns.includes(id);
  }
  return visibility;
}
