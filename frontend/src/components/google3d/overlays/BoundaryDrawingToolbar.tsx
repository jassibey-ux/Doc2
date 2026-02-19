/**
 * BoundaryDrawingToolbar — Floating toolbar anchored bottom-center of 3D viewer.
 *
 * Shows vertex count, Undo, Close Polygon, Cancel during drawing;
 * Confirm, Redraw, Cancel during editing.
 * Dark glassmorphism style matching existing overlay patterns.
 */

import React from 'react';
import type { DrawingState } from '../hooks/useGoogle3DBoundaryDrawing';
import type { GeoPoint } from '../../../types/workflow';

interface BoundaryDrawingToolbarProps {
  drawingState: DrawingState;
  vertexCount: number;
  vertices?: GeoPoint[];
  canClose: boolean;
  canUndo: boolean;
  canRedo?: boolean;
  onUndo: () => void;
  onRedo?: () => void;
  onClosePolygon: () => void;
  onConfirm: () => void;
  onRedraw: () => void;
  onCancel: () => void;
}

/** Calculate polygon area in km² using Shoelace + Haversine-approximate scaling */
function computeArea(vertices: GeoPoint[]): number {
  if (vertices.length < 3) return 0;
  // Use Shoelace in projected coordinates (m)
  const refLat = vertices[0].lat;
  const cosLat = Math.cos(refLat * Math.PI / 180);
  const toMeters = (p: GeoPoint) => ({
    x: (p.lon - vertices[0].lon) * 111320 * cosLat,
    y: (p.lat - vertices[0].lat) * 110540,
  });
  const pts = vertices.map(toMeters);
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(area / 2) / 1e6; // km²
}

/** Calculate polygon perimeter in km using Haversine */
function computePerimeter(vertices: GeoPoint[]): number {
  if (vertices.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < vertices.length; i++) {
    const j = (i + 1) % vertices.length;
    total += haversineDistance(vertices[i], vertices[j]);
  }
  return total / 1000; // km
}

function haversineDistance(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * sinLon * sinLon;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function formatMetric(value: number, unit: string): string {
  if (value < 1) {
    if (unit === 'km²') return `${(value * 1_000_000).toFixed(0)} m²`;
    return `${(value * 1000).toFixed(0)} m`;
  }
  return `${value.toFixed(2)} ${unit}`;
}

const BoundaryDrawingToolbar: React.FC<BoundaryDrawingToolbarProps> = ({
  drawingState,
  vertexCount,
  vertices,
  canClose,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClosePolygon,
  onConfirm,
  onRedraw,
  onCancel,
}) => {
  if (drawingState === 'idle') return null;

  return (
    <div style={{
      position: 'absolute',
      bottom: 16,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 16px',
      background: 'rgba(15, 15, 30, 0.88)',
      borderRadius: 14,
      border: '1px solid rgba(255, 255, 255, 0.1)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      zIndex: 20,
      maxWidth: 'calc(100% - 32px)',
    }}>
      {/* Mode indicator */}
      <span style={{
        padding: '3px 10px',
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 600,
        background: drawingState === 'drawing'
          ? 'rgba(249, 115, 22, 0.2)'
          : 'rgba(34, 197, 94, 0.2)',
        color: drawingState === 'drawing' ? '#f97316' : '#22c55e',
        border: `1px solid ${drawingState === 'drawing'
          ? 'rgba(249, 115, 22, 0.4)'
          : 'rgba(34, 197, 94, 0.4)'}`,
        whiteSpace: 'nowrap',
      }}>
        {drawingState === 'drawing'
          ? `Drawing — ${vertexCount} ${vertexCount === 1 ? 'vertex' : 'vertices'}`
          : `Editing — ${vertexCount} vertices`}
      </span>

      {/* Divider */}
      <div style={{
        width: 1,
        height: 20,
        background: 'rgba(255, 255, 255, 0.15)',
      }} />

      {/* Area and perimeter display */}
      {vertices && vertices.length >= 3 && (
        <>
          <span style={{
            fontSize: 11,
            color: 'rgba(255, 255, 255, 0.6)',
            whiteSpace: 'nowrap',
            fontFamily: 'monospace',
          }}>
            {formatMetric(computeArea(vertices), 'km²')} | {formatMetric(computePerimeter(vertices), 'km')}
          </span>
          <div style={{
            width: 1,
            height: 20,
            background: 'rgba(255, 255, 255, 0.15)',
          }} />
        </>
      )}

      {drawingState === 'drawing' ? (
        <>
          <ToolbarButton
            label="Undo"
            shortcut="⌘Z"
            disabled={!canUndo}
            onClick={onUndo}
          />
          {onRedo && (
            <ToolbarButton
              label="Redo"
              shortcut="⌘⇧Z"
              disabled={!canRedo}
              onClick={onRedo}
            />
          )}
          <ToolbarButton
            label="Close Polygon"
            disabled={!canClose}
            onClick={onClosePolygon}
            accent
          />
          <ToolbarButton
            label="Cancel"
            onClick={onCancel}
            variant="ghost"
          />
        </>
      ) : (
        <>
          <div style={{
            fontSize: 11,
            color: 'rgba(255, 255, 255, 0.5)',
            whiteSpace: 'nowrap',
          }}>
            Click vertex to select, then click map to move
          </div>
          <ToolbarButton
            label="Confirm"
            onClick={onConfirm}
            accent
          />
          <ToolbarButton
            label="Redraw"
            onClick={onRedraw}
            variant="ghost"
          />
          <ToolbarButton
            label="Cancel"
            onClick={onCancel}
            variant="ghost"
          />
        </>
      )}
    </div>
  );
};

const ToolbarButton: React.FC<{
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onClick: () => void;
  accent?: boolean;
  variant?: 'default' | 'ghost';
}> = ({ label, shortcut, disabled, onClick, accent, variant }) => {
  const isGhost = variant === 'ghost';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '5px 12px',
        borderRadius: 6,
        border: isGhost
          ? '1px solid rgba(255, 255, 255, 0.1)'
          : accent
            ? '1px solid rgba(249, 115, 22, 0.5)'
            : '1px solid rgba(255, 255, 255, 0.15)',
        background: isGhost
          ? 'transparent'
          : accent
            ? 'rgba(249, 115, 22, 0.2)'
            : 'rgba(255, 255, 255, 0.06)',
        color: disabled
          ? 'rgba(255, 255, 255, 0.25)'
          : accent
            ? '#f97316'
            : '#fff',
        fontSize: 12,
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.15s ease',
      }}
    >
      {label}
      {shortcut && (
        <span style={{
          fontSize: 10,
          color: 'rgba(255, 255, 255, 0.35)',
          marginLeft: 2,
        }}>
          {shortcut}
        </span>
      )}
    </button>
  );
};

export default BoundaryDrawingToolbar;
