/**
 * ModelPickerPopover — Reusable 3×3 model grid for drone/CUAS/vehicle/equipment selection.
 *
 * Modes:
 *  - 'inline': renders grid directly (for config panels)
 *  - 'popover': renders in a portal-based floating panel with backdrop dismiss
 */

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  DRONE_MODELS,
  CUAS_MODELS,
  VEHICLE_MODELS,
  EQUIPMENT_MODELS,
  type ModelAsset,
} from '../utils/modelRegistry';

export type ModelCategory = 'drone' | 'cuas' | 'vehicle' | 'equipment';

interface ModelPickerPopoverProps {
  modelCategory: ModelCategory;
  selectedModelId?: string;
  onSelect: (modelId: string | undefined) => void;
  showAuto?: boolean;
  mode: 'inline' | 'popover';
  isOpen?: boolean;
  onClose?: () => void;
  anchorEl?: HTMLElement | null;
}

const CATEGORY_REGISTRIES: Record<ModelCategory, Record<string, ModelAsset>> = {
  drone: DRONE_MODELS,
  cuas: CUAS_MODELS,
  vehicle: VEHICLE_MODELS,
  equipment: EQUIPMENT_MODELS,
};

const ModelPickerPopover: React.FC<ModelPickerPopoverProps> = ({
  modelCategory,
  selectedModelId,
  onSelect,
  showAuto = true,
  mode,
  isOpen,
  onClose,
  anchorEl,
}) => {
  const models = Object.values(CATEGORY_REGISTRIES[modelCategory]);

  const grid = (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
      {/* Auto-detect option */}
      {showAuto && (
        <button
          onClick={() => {
            onSelect(undefined);
            onClose?.();
          }}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
            padding: '8px 4px', borderRadius: '8px', cursor: 'pointer',
            border: !selectedModelId ? '2px solid #ff8c00' : '1px solid rgba(255,255,255,0.1)',
            background: !selectedModelId ? 'rgba(255,140,0,0.15)' : 'rgba(255,255,255,0.05)',
            color: '#fff', fontSize: '10px',
          }}
        >
          <div style={{
            width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '24px', opacity: 0.7,
          }}>
            {'\u2728'}
          </div>
          <span>Auto</span>
        </button>
      )}

      {models.map(m => {
        const isSel = selectedModelId === m.id;
        return (
          <button
            key={m.id}
            onClick={() => {
              onSelect(m.id);
              onClose?.();
            }}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
              padding: '8px 4px', borderRadius: '8px', cursor: 'pointer',
              border: isSel ? '2px solid #ff8c00' : '1px solid rgba(255,255,255,0.1)',
              background: isSel ? 'rgba(255,140,0,0.15)' : 'rgba(255,255,255,0.05)',
              color: '#fff', fontSize: '10px',
            }}
          >
            <img
              src={`${import.meta.env.BASE_URL ?? '/'}${m.thumbnailProfilePath.replace(/^\//, '')}`}
              alt={m.label}
              style={{ width: 48, height: 48, objectFit: 'contain' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <span style={{ textAlign: 'center', lineHeight: '1.2' }}>
              {m.label.replace(/ *\(.*\)/, '')}
            </span>
          </button>
        );
      })}
    </div>
  );

  if (mode === 'inline') return grid;

  // Popover mode
  if (!isOpen) return null;

  return createPortal(
    <PopoverContainer anchorEl={anchorEl} onClose={onClose}>
      <div style={{
        padding: '12px',
        background: 'rgba(15, 15, 25, 0.98)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: '12px',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        maxWidth: '280px',
        minWidth: '250px',
      }}>
        <div style={{
          fontSize: '11px',
          fontWeight: 600,
          color: 'rgba(255, 255, 255, 0.5)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: '8px',
        }}>
          Select 3D Model
        </div>
        {grid}
      </div>
    </PopoverContainer>,
    document.body,
  );
};

/** Popover positioning wrapper with backdrop dismiss */
const PopoverContainer: React.FC<{
  anchorEl?: HTMLElement | null;
  onClose?: () => void;
  children: React.ReactNode;
}> = ({ anchorEl, onClose, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useEffect(() => {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const popoverWidth = 280;
    let left = rect.left;
    let top = rect.bottom + 6;

    // Keep within viewport
    if (left + popoverWidth > window.innerWidth - 16) {
      left = window.innerWidth - popoverWidth - 16;
    }
    if (top + 300 > window.innerHeight) {
      top = rect.top - 306;
    }

    setPos({ top, left });
  }, [anchorEl]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 9998,
          background: 'rgba(0,0,0,0.3)',
        }}
      />
      {/* Popover */}
      <div
        ref={ref}
        style={{
          position: 'fixed',
          top: pos.top,
          left: pos.left,
          zIndex: 9999,
        }}
      >
        {children}
      </div>
    </>
  );
};

export default ModelPickerPopover;
