/**
 * BoundaryDrawingToolbar — Floating toolbar anchored bottom-center of 3D viewer.
 *
 * Shows vertex count, Undo, Close Polygon, Cancel during drawing;
 * Confirm, Redraw, Cancel during editing.
 * Dark glassmorphism style matching existing overlay patterns.
 */

import React from 'react';
import type { DrawingState } from '../hooks/useGoogle3DBoundaryDrawing';

interface BoundaryDrawingToolbarProps {
  drawingState: DrawingState;
  vertexCount: number;
  canClose: boolean;
  canUndo: boolean;
  onUndo: () => void;
  onClosePolygon: () => void;
  onConfirm: () => void;
  onRedraw: () => void;
  onCancel: () => void;
}

const BoundaryDrawingToolbar: React.FC<BoundaryDrawingToolbarProps> = ({
  drawingState,
  vertexCount,
  canClose,
  canUndo,
  onUndo,
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

      {drawingState === 'drawing' ? (
        <>
          <ToolbarButton
            label="Undo"
            shortcut="⌫"
            disabled={!canUndo}
            onClick={onUndo}
          />
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
