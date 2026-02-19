/**
 * TelemetryTableToolbar — Column presets, tracker filter, search, export, row count.
 */

import React from 'react';
import { Download, Search } from 'lucide-react';
import { COLUMN_PRESETS, getVisibilityForPreset } from './columns';
import type { ColumnPreset, TelemetryRow } from './types';
import type { VisibilityState, RowSelectionState } from '@tanstack/react-table';

interface ToolbarProps {
  /** Active column preset */
  preset: ColumnPreset;
  onPresetChange: (p: ColumnPreset) => void;
  onColumnVisibilityChange: (v: VisibilityState) => void;
  /** All unique tracker IDs in dataset */
  trackerIds: string[];
  /** Currently selected tracker filter (null = all) */
  trackerFilter: string | null;
  onTrackerFilterChange: (id: string | null) => void;
  /** Global search */
  globalFilter: string;
  onGlobalFilterChange: (v: string) => void;
  /** Row counts */
  totalRows: number;
  filteredRows: number;
  /** Selection state for export */
  rowSelection: RowSelectionState;
  /** Full filtered data for CSV export */
  filteredData: TelemetryRow[];
  /** All data for export-all */
  allData: TelemetryRow[];
}

function exportCSV(rows: TelemetryRow[], filename: string) {
  const headers = [
    'timestamp', 'time_gps', 'tracker_id', 'lat', 'lon', 'alt_m',
    'speed_mps', 'course_deg', 'hdop', 'satellites', 'rssi_dbm',
    'baro_alt_m', 'baro_temp_c', 'baro_press_hpa', 'fix_valid',
    'battery_mv', 'latency_ms', 'gps_quality',
  ];

  const csvRows = [headers.join(',')];
  for (const r of rows) {
    csvRows.push([
      r.timestamp, r.time_gps ?? '', r.tracker_id,
      r.lat ?? '', r.lon ?? '', r.alt_m ?? '',
      r.speed_mps ?? '', r.course_deg ?? '', r.hdop ?? '',
      r.satellites ?? '', r.rssi_dbm ?? '', r.baro_alt_m ?? '',
      r.baro_temp_c ?? '', r.baro_press_hpa ?? '', r.fix_valid,
      r.battery_mv ?? '', r.latency_ms ?? '', r.gps_quality ?? '',
    ].join(','));
  }

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const TelemetryTableToolbar: React.FC<ToolbarProps> = ({
  preset,
  onPresetChange,
  onColumnVisibilityChange,
  trackerIds,
  trackerFilter,
  onTrackerFilterChange,
  globalFilter,
  onGlobalFilterChange,
  totalRows,
  filteredRows,
  rowSelection,
  filteredData,
  allData,
}) => {
  const selectedCount = Object.keys(rowSelection).length;

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const p = e.target.value as ColumnPreset;
    onPresetChange(p);
    onColumnVisibilityChange(getVisibilityForPreset(p));
  };

  const handleExport = () => {
    const isFiltered = filteredData.length !== allData.length;
    const rows = isFiltered ? filteredData : allData;
    const label = isFiltered ? 'filtered' : 'all';
    exportCSV(rows, `telemetry_${label}_${Date.now()}.csv`);
  };

  const handleExportSelected = () => {
    const selected = filteredData.filter((r) => rowSelection[r.id]);
    exportCSV(selected, `telemetry_selected_${Date.now()}.csv`);
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        background: '#111118',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        flexWrap: 'wrap',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Column preset */}
      <select
        value={preset}
        onChange={handlePresetChange}
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 6,
          color: '#d1d5db',
          padding: '4px 8px',
          fontSize: 11,
          cursor: 'pointer',
        }}
      >
        {COLUMN_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>

      {/* Tracker filter */}
      <select
        value={trackerFilter ?? '__all__'}
        onChange={(e) =>
          onTrackerFilterChange(e.target.value === '__all__' ? null : e.target.value)
        }
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 6,
          color: '#d1d5db',
          padding: '4px 8px',
          fontSize: 11,
          cursor: 'pointer',
        }}
      >
        <option value="__all__">All Trackers</option>
        {trackerIds.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>

      {/* Global search */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 6,
          padding: '3px 8px',
          flex: '0 1 200px',
        }}
      >
        <Search size={12} color="#6b7280" />
        <input
          type="text"
          value={globalFilter}
          onChange={(e) => onGlobalFilterChange(e.target.value)}
          placeholder="Search..."
          style={{
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#d1d5db',
            fontSize: 11,
            width: '100%',
          }}
        />
      </div>

      {/* Row count */}
      <div
        style={{
          fontSize: 10,
          color: '#6b7280',
          marginLeft: 'auto',
          whiteSpace: 'nowrap',
        }}
      >
        {filteredRows === totalRows
          ? `${totalRows.toLocaleString()} rows`
          : `${filteredRows.toLocaleString()} / ${totalRows.toLocaleString()} rows`}
        {selectedCount > 0 && ` (${selectedCount} selected)`}
      </div>

      {/* Export buttons */}
      <button
        onClick={handleExport}
        title="Export all rows"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 6,
          color: '#d1d5db',
          padding: '4px 8px',
          fontSize: 10,
          cursor: 'pointer',
        }}
      >
        <Download size={11} />
        Export
      </button>

      {selectedCount > 0 && (
        <button
          onClick={handleExportSelected}
          title="Export selected rows"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            background: 'rgba(96,165,250,0.15)',
            border: '1px solid rgba(96,165,250,0.3)',
            borderRadius: 6,
            color: '#60a5fa',
            padding: '4px 8px',
            fontSize: 10,
            cursor: 'pointer',
          }}
        >
          <Download size={11} />
          Export Selected
        </button>
      )}
    </div>
  );
};

export default TelemetryTableToolbar;
