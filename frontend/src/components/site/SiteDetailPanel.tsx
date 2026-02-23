/**
 * SiteDetailPanel — Slide-in detail view for a selected site.
 *
 * Shows name, metadata, markers, zones, and action buttons (Edit, View 3D, Delete).
 */

import React from 'react';
import {
  X,
  Edit3,
  Trash2,
  Box,
  Copy,
  MapPin,
  Target,
  Navigation,
  Flag,
  Eye,
  Hexagon,
  Film,
} from 'lucide-react';
import { GlassButton, Badge, GlassDivider } from '../ui/GlassUI';
import type { SiteDefinition, MarkerType } from '../../types/workflow';

const MARKER_TYPE_ICONS: Record<MarkerType, React.ReactNode> = {
  command_post: <Target size={12} />,
  launch_point: <Navigation size={12} />,
  recovery_zone: <Flag size={12} />,
  observation: <Eye size={12} />,
  custom: <MapPin size={12} />,
};

interface SiteDetailPanelProps {
  site: SiteDefinition;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onView3D: () => void;
  onDuplicate?: () => void;
  onRecordFlythrough?: () => void;
}

const SiteDetailPanel: React.FC<SiteDetailPanelProps> = ({
  site,
  onClose,
  onEdit,
  onDelete,
  onView3D,
  onDuplicate,
  onRecordFlythrough,
}) => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      animation: 'slideIn 200ms ease',
    }}>
      {/* Header with close */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{
          fontSize: 15,
          fontWeight: 600,
          color: '#fff',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {site.name}
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255, 255, 255, 0.4)',
            cursor: 'pointer',
            padding: 4,
          }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Thumbnail */}
      {site.thumbnail_base64 && (
        <div style={{
          width: '100%',
          height: 140,
          borderRadius: 10,
          overflow: 'hidden',
          background: `url(${site.thumbnail_base64}) center/cover`,
        }} />
      )}

      {/* Metadata badges */}
      <div style={{
        display: 'flex',
        gap: 6,
        flexWrap: 'wrap',
      }}>
        <Badge color="blue" size="sm">
          {site.environment_type.replace('_', ' ')}
        </Badge>
        <Badge color="green" size="sm">3D</Badge>
        {site.boundary_polygon?.length > 0 && (
          <Badge color="gray" size="sm">
            {site.boundary_polygon.length} vertices
          </Badge>
        )}
      </div>

      {/* Location info */}
      {site.center && (
        <div style={{
          fontSize: 11,
          color: 'rgba(255, 255, 255, 0.4)',
          fontFamily: 'monospace',
        }}>
          {site.center.lat.toFixed(6)}, {site.center.lon.toFixed(6)}
        </div>
      )}

      <GlassDivider />

      {/* Markers */}
      <div>
        <div style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'rgba(255, 255, 255, 0.6)',
          marginBottom: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}>
          <MapPin size={12} />
          Markers ({site.markers?.length || 0})
        </div>
        {site.markers && site.markers.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {site.markers.map(marker => (
              <div
                key={marker.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  borderRadius: 6,
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                }}
              >
                {MARKER_TYPE_ICONS[marker.type] || <MapPin size={12} />}
                <span style={{ fontSize: 12, color: '#fff', flex: 1 }}>
                  {marker.name}
                </span>
                <span style={{
                  fontSize: 10,
                  color: 'rgba(255, 255, 255, 0.3)',
                  textTransform: 'capitalize',
                }}>
                  {marker.type.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.3)' }}>
            No markers defined
          </div>
        )}
      </div>

      {/* Zones */}
      <div>
        <div style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'rgba(255, 255, 255, 0.6)',
          marginBottom: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}>
          <Hexagon size={12} />
          Zones ({site.zones?.length || 0})
        </div>
        {site.zones && site.zones.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {site.zones.map(zone => (
              <div
                key={zone.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  borderRadius: 6,
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                }}
              >
                <div style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  background: zone.color,
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: 12, color: '#fff', flex: 1 }}>
                  {zone.name}
                </span>
                <span style={{
                  fontSize: 10,
                  color: 'rgba(255, 255, 255, 0.3)',
                  textTransform: 'capitalize',
                }}>
                  {zone.type.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.3)' }}>
            No zones defined
          </div>
        )}
      </div>

      {/* Notes */}
      {site.rf_notes && (
        <>
          <GlassDivider />
          <div>
            <div style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'rgba(255, 255, 255, 0.6)',
              marginBottom: 4,
            }}>
              RF Notes
            </div>
            <div style={{
              fontSize: 12,
              color: 'rgba(255, 255, 255, 0.5)',
              lineHeight: 1.4,
            }}>
              {site.rf_notes}
            </div>
          </div>
        </>
      )}

      <GlassDivider />

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6 }}>
        <GlassButton variant="primary" size="sm" onClick={onEdit} style={{ flex: 1 }}>
          <Edit3 size={13} />
          Edit
        </GlassButton>
        <GlassButton variant="secondary" size="sm" onClick={onView3D} style={{ flex: 1 }}>
          <Box size={13} />
          3D View
        </GlassButton>
        {onDuplicate && (
          <GlassButton variant="ghost" size="sm" onClick={onDuplicate} style={{ flexShrink: 0 }}>
            <Copy size={13} />
          </GlassButton>
        )}
        <GlassButton
          variant="ghost"
          size="sm"
          onClick={onDelete}
          style={{ color: '#ef4444', flexShrink: 0 }}
        >
          <Trash2 size={13} />
        </GlassButton>
      </div>

      {/* Record Flythrough — only shown if site has boundary */}
      {onRecordFlythrough && site.boundary_polygon && site.boundary_polygon.length >= 3 && (
        <GlassButton variant="ghost" size="sm" onClick={onRecordFlythrough} style={{ width: '100%' }}>
          <Film size={13} />
          Record Flythrough
        </GlassButton>
      )}

      {/* Timestamps */}
      <div style={{
        fontSize: 10,
        color: 'rgba(255, 255, 255, 0.25)',
        display: 'flex',
        justifyContent: 'space-between',
      }}>
        <span>Created: {new Date(site.created_at).toLocaleDateString()}</span>
        <span>Updated: {new Date(site.updated_at).toLocaleDateString()}</span>
      </div>
    </div>
  );
};

export default SiteDetailPanel;
