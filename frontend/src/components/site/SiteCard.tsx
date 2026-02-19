/**
 * SiteCard — Visual card with 3D thumbnail for the site gallery.
 *
 * Grid mode: ~190x220px with thumbnail, environment icon, hover/active states.
 * Compact mode: smaller variant for wizard site selection.
 */

import React, { useState } from 'react';
import { MapPin, Wheat, Building2, TreePine, Waves, Mountain, Home } from 'lucide-react';
import type { SiteDefinition, EnvironmentType } from '../../types/workflow';

const ENV_ICONS: Record<EnvironmentType, React.ReactNode> = {
  open_field: <Wheat size={14} />,
  urban: <Building2 size={14} />,
  suburban: <Home size={14} />,
  wooded: <TreePine size={14} />,
  coastal: <Waves size={14} />,
  mountain: <Mountain size={14} />,
};

const ENV_GRADIENTS: Record<EnvironmentType, string> = {
  open_field: 'linear-gradient(135deg, #2d4a1e 0%, #4a7c2e 50%, #6b9f45 100%)',
  urban: 'linear-gradient(135deg, #1a1a2e 0%, #374151 50%, #4b5563 100%)',
  suburban: 'linear-gradient(135deg, #2d3748 0%, #4a5568 50%, #718096 100%)',
  wooded: 'linear-gradient(135deg, #1a3a1a 0%, #2d5a2d 50%, #3d7a3d 100%)',
  coastal: 'linear-gradient(135deg, #0c2d48 0%, #1a5276 50%, #2471a3 100%)',
  mountain: 'linear-gradient(135deg, #2c3e50 0%, #5d6d7e 50%, #85929e 100%)',
};

interface SiteCardProps {
  site: SiteDefinition;
  selected?: boolean;
  compact?: boolean;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onView3D?: () => void;
}

const SiteCard: React.FC<SiteCardProps> = ({
  site,
  selected = false,
  compact = false,
  onClick,
}) => {
  const [hovered, setHovered] = useState(false);

  const thumbnailHeight = compact ? 80 : 120;
  const cardWidth = compact ? 160 : 'auto';

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: cardWidth,
        borderRadius: 12,
        overflow: 'hidden',
        cursor: 'pointer',
        border: selected
          ? '2px solid #f97316'
          : '1px solid rgba(255, 255, 255, 0.08)',
        background: selected
          ? 'rgba(255, 140, 0, 0.08)'
          : 'rgba(255, 255, 255, 0.02)',
        transform: hovered ? 'translateY(-4px) scale(1.02)' : 'translateY(0) scale(1)',
        boxShadow: hovered
          ? '0 8px 24px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 140, 0, 0.4)'
          : '0 2px 8px rgba(0, 0, 0, 0.2)',
        transition: 'all 250ms ease',
      }}
    >
      {/* Thumbnail area */}
      <div style={{
        width: '100%',
        height: thumbnailHeight,
        position: 'relative',
        background: site.thumbnail_base64
          ? `url(${site.thumbnail_base64}) center/cover`
          : ENV_GRADIENTS[site.environment_type] || ENV_GRADIENTS.open_field,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {/* Fallback icon when no thumbnail */}
        {!site.thumbnail_base64 && (
          <MapPin size={compact ? 24 : 32} style={{ color: 'rgba(255, 255, 255, 0.25)' }} />
        )}

        {/* Environment icon badge — top-left */}
        <div style={{
          position: 'absolute',
          top: 8,
          left: 8,
          width: compact ? 22 : 28,
          height: compact ? 22 : 28,
          borderRadius: '50%',
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
        }}>
          {ENV_ICONS[site.environment_type] || <MapPin size={14} />}
        </div>

        {/* 3D badge — top-right */}
        <div style={{
          position: 'absolute',
          top: 8,
          right: 8,
          padding: '2px 6px',
          borderRadius: 4,
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(8px)',
          fontSize: 10,
          fontWeight: 700,
          color: '#22c55e',
          letterSpacing: '0.5px',
        }}>
          3D
        </div>
      </div>

      {/* Info area */}
      <div style={{ padding: compact ? '8px 10px' : '10px 12px' }}>
        <div style={{
          fontSize: compact ? 12 : 13,
          fontWeight: 600,
          color: '#fff',
          marginBottom: 4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {site.name}
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexWrap: 'wrap',
        }}>
          {/* Environment badge */}
          <span style={{
            padding: '1px 6px',
            borderRadius: 4,
            fontSize: 10,
            background: 'rgba(255, 255, 255, 0.06)',
            color: 'rgba(255, 255, 255, 0.6)',
            textTransform: 'capitalize',
          }}>
            {site.environment_type.replace('_', ' ')}
          </span>

          {/* Marker count */}
          {site.markers && site.markers.length > 0 && (
            <span style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.4)' }}>
              {site.markers.length} markers
            </span>
          )}

          {/* Zone count */}
          {site.zones && site.zones.length > 0 && (
            <span style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.4)' }}>
              {site.zones.length} zones
            </span>
          )}
        </div>

        {/* Last session / creation info */}
        {!compact && (
          <div style={{
            fontSize: 10,
            color: 'rgba(255, 255, 255, 0.3)',
            marginTop: 4,
          }}>
            Created {formatRelativeDate(site.created_at)}
          </div>
        )}
      </div>
    </div>
  );
};

function formatRelativeDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffHours < 1) return 'just now';
    if (diffHours < 24) return `${Math.floor(diffHours)}h ago`;
    if (diffDays < 7) return `${Math.floor(diffDays)}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return date.toLocaleDateString();
  } catch {
    return '';
  }
}

export default SiteCard;
