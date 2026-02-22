/**
 * ModelThumbnailButton — Clickable thumbnail that opens a ModelPickerPopover.
 *
 * Shows the resolved model thumbnail, or a sparkle "Auto" icon if no explicit model is set.
 * Click opens the popover for selection.
 */

import React, { useState, useRef } from 'react';
import ModelPickerPopover, { type ModelCategory } from './ModelPickerPopover';
import {
  DRONE_MODELS,
  CUAS_MODELS,
  VEHICLE_MODELS,
  EQUIPMENT_MODELS,
  type ModelAsset,
} from '../utils/modelRegistry';

interface ModelThumbnailButtonProps {
  modelCategory: ModelCategory;
  currentModelId?: string;
  onModelChange: (modelId: string | undefined) => void;
  size?: number;
  showLabel?: boolean;
  showAuto?: boolean;
}

const CATEGORY_REGISTRIES: Record<ModelCategory, Record<string, ModelAsset>> = {
  drone: DRONE_MODELS,
  cuas: CUAS_MODELS,
  vehicle: VEHICLE_MODELS,
  equipment: EQUIPMENT_MODELS,
};

const ModelThumbnailButton: React.FC<ModelThumbnailButtonProps> = ({
  modelCategory,
  currentModelId,
  onModelChange,
  size = 40,
  showLabel = false,
  showAuto = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const registry = CATEGORY_REGISTRIES[modelCategory];
  const asset = currentModelId ? registry[currentModelId] : null;

  return (
    <>
      <button
        ref={btnRef}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(true);
        }}
        title={asset?.label ?? 'Auto-detect model'}
        style={{
          width: size,
          height: size,
          borderRadius: '8px',
          cursor: 'pointer',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          background: 'rgba(255, 255, 255, 0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          overflow: 'hidden',
          flexShrink: 0,
          position: 'relative',
        }}
      >
        {asset ? (
          <img
            src={`${import.meta.env.BASE_URL ?? '/'}${asset.thumbnailProfilePath.replace(/^\//, '')}`}
            alt={asset.label}
            style={{
              maxWidth: '90%',
              maxHeight: '90%',
              objectFit: 'contain',
            }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <span style={{ fontSize: size * 0.45, opacity: 0.7 }}>{'\u2728'}</span>
        )}
      </button>

      {showLabel && (
        <span style={{
          fontSize: '10px',
          color: 'rgba(255, 255, 255, 0.5)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '80px',
        }}>
          {asset?.label ?? 'Auto'}
        </span>
      )}

      <ModelPickerPopover
        modelCategory={modelCategory}
        selectedModelId={currentModelId}
        onSelect={onModelChange}
        showAuto={showAuto}
        mode="popover"
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorEl={btnRef.current}
      />
    </>
  );
};

export default ModelThumbnailButton;
