/**
 * AnalysisTablePage — Full-viewport Excel-like telemetry analysis view.
 * Route: /session/:sessionId/table
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Table2, RefreshCw, Loader } from 'lucide-react';
import {
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
  type RowSelectionState,
} from '@tanstack/react-table';
import TelemetryTable from './TelemetryTable';
import TelemetryTableToolbar from './TelemetryTableToolbar';
import { useAnalysisData } from './useAnalysisData';
import { getVisibilityForPreset } from './columns';
import type { ColumnPreset, TelemetryRow } from './types';

const AnalysisTablePage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { data, trackerIds, sessionName, isLoading, error, refetch } =
    useAnalysisData(sessionId);

  // Table state
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    getVisibilityForPreset('overview'),
  );
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [preset, setPreset] = useState<ColumnPreset>('overview');
  const [trackerFilter, setTrackerFilter] = useState<string | null>(null);

  // Filter data by selected tracker
  const filteredData = useMemo(() => {
    if (!trackerFilter) return data;
    return data.filter((r) => r.tracker_id === trackerFilter);
  }, [data, trackerFilter]);

  const handleRowClick = useCallback(
    (_row: TelemetryRow) => {
      // Future: sync timeline, flyTo
    },
    [],
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: '#0a0a0a',
        color: '#e5e7eb',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 16px',
          background: '#111118',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => navigate(-1)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6,
            color: '#d1d5db',
            padding: '5px 10px',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          <ArrowLeft size={14} />
          Back
        </button>

        <Table2 size={16} color="#60a5fa" />
        <span style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>
          Session Data
        </span>
        {sessionName && (
          <span style={{ fontSize: 12, color: '#6b7280' }}>
            — {sessionName}
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {isLoading && (
            <Loader
              size={14}
              color="#60a5fa"
              style={{ animation: 'spin 1s linear infinite' }}
            />
          )}
          <button
            onClick={refetch}
            title="Reload data"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6,
              color: '#d1d5db',
              padding: '5px 10px',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={12} />
            Reload
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div
          style={{
            padding: '12px 16px',
            background: 'rgba(239,68,68,0.1)',
            borderBottom: '1px solid rgba(239,68,68,0.2)',
            color: '#f87171',
            fontSize: 12,
          }}
        >
          Failed to load telemetry: {error}
        </div>
      )}

      {/* Toolbar */}
      <TelemetryTableToolbar
        preset={preset}
        onPresetChange={setPreset}
        onColumnVisibilityChange={setColumnVisibility}
        trackerIds={trackerIds}
        trackerFilter={trackerFilter}
        onTrackerFilterChange={setTrackerFilter}
        globalFilter={globalFilter}
        onGlobalFilterChange={setGlobalFilter}
        totalRows={data.length}
        filteredRows={filteredData.length}
        rowSelection={rowSelection}
        filteredData={filteredData}
        allData={data}
      />

      {/* Table */}
      <TelemetryTable
        data={filteredData}
        sorting={sorting}
        onSortingChange={setSorting}
        globalFilter={globalFilter}
        onGlobalFilterChange={setGlobalFilter}
        columnFilters={columnFilters}
        onColumnFiltersChange={setColumnFilters}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        onRowClick={handleRowClick}
      />

      {/* Spin keyframe (inline) */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default AnalysisTablePage;
