/**
 * TelemetryTable — Core TanStack Table component for raw telemetry data.
 *
 * Features: sorting, global filter, column resize, virtual scrolling,
 * row selection, engagement row highlighting, per-cell coloring.
 */

import React, { useMemo, useRef, useCallback } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
  type RowSelectionState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { columns, type ColumnMeta } from './columns';
import type { TelemetryRow } from './types';

const ROW_HEIGHT = 28;
const OVERSCAN = 20;

interface TelemetryTableProps {
  data: TelemetryRow[];
  sorting: SortingState;
  onSortingChange: (s: SortingState | ((prev: SortingState) => SortingState)) => void;
  globalFilter: string;
  onGlobalFilterChange: (v: string) => void;
  columnFilters: ColumnFiltersState;
  onColumnFiltersChange: (f: ColumnFiltersState | ((prev: ColumnFiltersState) => ColumnFiltersState)) => void;
  columnVisibility: VisibilityState;
  onColumnVisibilityChange: (v: VisibilityState | ((prev: VisibilityState) => VisibilityState)) => void;
  rowSelection: RowSelectionState;
  onRowSelectionChange: (s: RowSelectionState | ((prev: RowSelectionState) => RowSelectionState)) => void;
  onRowClick?: (row: TelemetryRow) => void;
  highlightedTimestamp?: number | null;
}

const TelemetryTable: React.FC<TelemetryTableProps> = ({
  data,
  sorting,
  onSortingChange,
  globalFilter,
  onGlobalFilterChange,
  columnFilters,
  onColumnFiltersChange,
  columnVisibility,
  onColumnVisibilityChange,
  rowSelection,
  onRowSelectionChange,
  onRowClick,
  highlightedTimestamp,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
    onSortingChange,
    onGlobalFilterChange,
    onColumnFiltersChange,
    onColumnVisibilityChange,
    onRowSelectionChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    enableRowSelection: true,
    getRowId: (row) => row.id,
  });

  const { rows } = table.getRowModel();

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  const handleRowClick = useCallback(
    (row: TelemetryRow) => {
      onRowClick?.(row);
    },
    [onRowClick],
  );

  // Compute the set of highlighted row IDs
  const highlightedRowId = useMemo(() => {
    if (highlightedTimestamp == null) return null;
    // Find closest row by timestamp
    let closest: TelemetryRow | null = null;
    let minDiff = Infinity;
    for (const row of data) {
      const diff = Math.abs(row.timestamp_ms - highlightedTimestamp);
      if (diff < minDiff) {
        minDiff = diff;
        closest = row;
      }
    }
    return closest?.id ?? null;
  }, [data, highlightedTimestamp]);

  return (
    <div
      ref={parentRef}
      style={{
        flex: 1,
        overflow: 'auto',
        background: '#0a0a0a',
        fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', monospace",
        fontSize: 11,
      }}
    >
      {/* Header */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: '#111118',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {table.getHeaderGroups().map((headerGroup) => (
          <div key={headerGroup.id} style={{ display: 'flex' }}>
            {headerGroup.headers.map((header) => {
              const meta = header.column.columnDef.meta as ColumnMeta | undefined;
              const canSort = header.column.getCanSort();
              const sorted = header.column.getIsSorted();
              return (
                <div
                  key={header.id}
                  style={{
                    width: header.getSize(),
                    minWidth: meta?.width ?? 50,
                    flexShrink: 0,
                    padding: '6px 6px',
                    cursor: canSort ? 'pointer' : 'default',
                    userSelect: 'none',
                    color: '#9ca3af',
                    fontWeight: 600,
                    fontSize: 10,
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                    borderRight: '1px solid rgba(255,255,255,0.04)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    position: 'relative',
                  }}
                  onClick={header.column.getToggleSortingHandler()}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {sorted === 'asc' && <span style={{ color: '#60a5fa' }}>▲</span>}
                  {sorted === 'desc' && <span style={{ color: '#60a5fa' }}>▼</span>}
                  {/* Resize handle */}
                  <div
                    onMouseDown={header.getResizeHandler()}
                    onTouchStart={header.getResizeHandler()}
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: 4,
                      cursor: 'col-resize',
                      background: header.column.getIsResizing()
                        ? 'rgba(96,165,250,0.5)'
                        : 'transparent',
                    }}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Virtual rows */}
      <div style={{ height: totalSize, position: 'relative' }}>
        {virtualRows.map((virtualRow) => {
          const row = rows[virtualRow.index];
          const original = row.original;
          const isHighlighted = original.id === highlightedRowId;
          const isSelected = row.getIsSelected();

          // Engagement border coloring
          let leftBorder = 'none';
          if (original.inJamBurst) {
            leftBorder = '3px solid #ef4444';
          } else if (original.inEngagement) {
            leftBorder = '3px solid #06b6d4';
          }

          // Background
          let rowBg = virtualRow.index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)';
          if (original.inJamBurst) {
            rowBg = 'rgba(239,68,68,0.06)';
          }
          if (isHighlighted) {
            rowBg = 'rgba(96,165,250,0.15)';
          }
          if (isSelected) {
            rowBg = 'rgba(96,165,250,0.1)';
          }

          return (
            <div
              key={row.id}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: ROW_HEIGHT,
                transform: `translateY(${virtualRow.start}px)`,
                display: 'flex',
                alignItems: 'center',
                background: rowBg,
                borderLeft: leftBorder,
                borderBottom: '1px solid rgba(255,255,255,0.03)',
                cursor: onRowClick ? 'pointer' : 'default',
                transition: 'background 0.1s',
              }}
              onClick={() => handleRowClick(original)}
            >
              {row.getVisibleCells().map((cell) => {
                const meta = cell.column.columnDef.meta as ColumnMeta | undefined;
                const colorFn = meta?.colorFn;
                const colors = colorFn ? colorFn(original) : null;
                return (
                  <div
                    key={cell.id}
                    style={{
                      width: cell.column.getSize(),
                      minWidth: meta?.width ?? 50,
                      flexShrink: 0,
                      padding: '0 6px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      background: colors?.bg || 'transparent',
                      color: colors?.text || '#d1d5db',
                      borderRight: '1px solid rgba(255,255,255,0.02)',
                    }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {rows.length === 0 && (
        <div
          style={{
            padding: 40,
            textAlign: 'center',
            color: '#6b7280',
            fontSize: 13,
          }}
        >
          No telemetry data available
        </div>
      )}
    </div>
  );
};

export default TelemetryTable;
