import React, { useState } from 'react';
import type { DroneProfile, CUASType } from '../types/workflow';
import { getDroneModel, getCUASModel, type ModelAsset } from '../utils/modelRegistry';

interface ModelThumbnailProps {
  type: 'drone' | 'cuas';
  profile?: DroneProfile;
  cuasType?: CUASType;
  size?: number;
  fallbackIcon?: string;  // SVG string or emoji
  view?: 'top' | 'profile';
}

export const ModelThumbnail: React.FC<ModelThumbnailProps> = ({
  type,
  profile,
  cuasType,
  size = 64,
  fallbackIcon = '\u{1F6F8}',
  view = 'profile',
}) => {
  const [imgError, setImgError] = useState(false);

  const asset: ModelAsset | null = type === 'drone'
    ? getDroneModel(profile)
    : getCUASModel(cuasType);

  const thumbnailPath = asset
    ? (view === 'top' ? asset.thumbnailTopPath : asset.thumbnailProfilePath)
    : null;

  if (!thumbnailPath || imgError) {
    return (
      <div
        style={{
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 8,
          fontSize: size * 0.4,
        }}
      >
        {fallbackIcon}
      </div>
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        overflow: 'hidden',
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <img
        src={thumbnailPath}
        alt={asset?.label || 'Model'}
        onError={() => setImgError(true)}
        style={{
          maxWidth: '90%',
          maxHeight: '90%',
          objectFit: 'contain',
        }}
      />
    </div>
  );
};
