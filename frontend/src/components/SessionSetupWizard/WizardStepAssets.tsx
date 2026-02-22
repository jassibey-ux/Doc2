/**
 * WizardStepAssets — Optional step for placing vehicles and equipment on the map.
 *
 * Two sections: Vehicles (4 models) and Equipment (4 models).
 * Select a model from the thumbnail grid, it creates a placement with default position.
 */

import { useState } from 'react';
import { Trash2, ChevronDown, ChevronUp, Car, Wrench } from 'lucide-react';
import { GlassCard, GlassButton, GlassInput } from '../ui/GlassUI';
import type { WizardState, WizardAction, AssetPlacementData } from './wizardTypes';
import type { SiteDefinition } from '../../types/workflow';
import { VEHICLE_MODELS, EQUIPMENT_MODELS, type ModelAsset } from '../../utils/modelRegistry';

interface WizardStepAssetsProps {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  mapCenter?: { lat: number; lon: number };
  selectedSite?: SiteDefinition;
}

export default function WizardStepAssets({
  state,
  dispatch,
  mapCenter = { lat: 0, lon: 0 },
  selectedSite,
}: WizardStepAssetsProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Prefer site center for ground assets; fall back to mapCenter (drone average)
  const effectiveCenter = selectedSite?.center
    ? { lat: selectedSite.center.lat, lon: selectedSite.center.lon }
    : (mapCenter.lat !== 0 || mapCenter.lon !== 0)
      ? mapCenter
      : { lat: 0, lon: 0 };

  const handleAddAsset = (assetType: 'vehicle' | 'equipment', model: ModelAsset) => {
    const newPlacement: AssetPlacementData = {
      id: `asset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      assetType,
      modelId: model.id,
      label: model.label,
      position: { ...effectiveCenter },
      orientation: 0,
    };
    dispatch({ type: 'ADD_ASSET_PLACEMENT', placement: newPlacement });
    setExpandedId(newPlacement.id);
  };

  const handleRemove = (placementId: string) => {
    dispatch({ type: 'REMOVE_ASSET_PLACEMENT', placementId });
    if (expandedId === placementId) setExpandedId(null);
  };

  const handleUpdate = (placementId: string, updates: Partial<AssetPlacementData>) => {
    dispatch({ type: 'UPDATE_ASSET_PLACEMENT', placementId, updates });
  };

  const vehicles = Object.values(VEHICLE_MODELS);
  const equipment = Object.values(EQUIPMENT_MODELS);

  const renderModelGrid = (models: ModelAsset[], assetType: 'vehicle' | 'equipment') => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
      {models.map(m => (
        <button
          key={m.id}
          onClick={() => handleAddAsset(assetType, m)}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
            padding: '8px 4px', borderRadius: '8px', cursor: 'pointer',
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.05)',
            color: '#fff', fontSize: '9px',
          }}
        >
          <img
            src={`${import.meta.env.BASE_URL ?? '/'}${m.thumbnailProfilePath.replace(/^\//, '')}`}
            alt={m.label}
            style={{ width: 40, height: 40, objectFit: 'contain' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <span style={{ textAlign: 'center', lineHeight: '1.2' }}>
            {m.label.replace(/ *\(.*\)/, '')}
          </span>
        </button>
      ))}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div>
        <h2 style={{
          fontSize: '18px', fontWeight: 600, color: '#fff',
          margin: 0, marginBottom: '8px',
        }}>
          Place Vehicles & Equipment
        </h2>
        <p style={{
          fontSize: '13px', color: 'rgba(255, 255, 255, 0.6)', margin: 0,
        }}>
          Optionally add ground vehicles and equipment to the scene. Click a model to place it.
        </p>
      </div>

      {/* Vehicles Section */}
      <div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px',
          fontSize: '12px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.7)',
          textTransform: 'uppercase', letterSpacing: '0.5px',
        }}>
          <Car size={14} /> Vehicles
        </div>
        {renderModelGrid(vehicles, 'vehicle')}
      </div>

      {/* Equipment Section */}
      <div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px',
          fontSize: '12px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.7)',
          textTransform: 'uppercase', letterSpacing: '0.5px',
        }}>
          <Wrench size={14} /> Equipment
        </div>
        {renderModelGrid(equipment, 'equipment')}
      </div>

      {/* Placed Assets List */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: '8px',
        maxHeight: '200px', overflowY: 'auto',
      }}>
        {state.assetPlacements.length === 0 ? (
          <div style={{
            padding: '20px', textAlign: 'center',
            color: 'rgba(255, 255, 255, 0.4)', fontSize: '12px',
            border: '1px dashed rgba(255, 255, 255, 0.1)', borderRadius: '8px',
          }}>
            No assets placed — This step is optional
          </div>
        ) : (
          state.assetPlacements.map(p => {
            const registry = p.assetType === 'vehicle' ? VEHICLE_MODELS : EQUIPMENT_MODELS;
            const model = registry[p.modelId];
            const isExpanded = expandedId === p.id;

            return (
              <GlassCard
                key={p.id}
                style={{
                  padding: '10px 14px',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  background: 'rgba(59, 130, 246, 0.05)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {model && (
                      <img
                        src={`${import.meta.env.BASE_URL ?? '/'}${model.thumbnailProfilePath.replace(/^\//, '')}`}
                        alt={model.label}
                        style={{ width: 28, height: 28, objectFit: 'contain', borderRadius: 4 }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    )}
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: '#fff' }}>
                        {p.label}
                      </div>
                      <div style={{
                        fontSize: '10px', color: 'rgba(255,255,255,0.4)',
                        textTransform: 'capitalize',
                      }}>
                        {p.assetType}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <GlassButton
                      variant="ghost" size="sm"
                      onClick={() => setExpandedId(isExpanded ? null : p.id)}
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </GlassButton>
                    <GlassButton
                      variant="ghost" size="sm"
                      onClick={() => handleRemove(p.id)}
                      style={{ color: '#ef4444' }}
                    >
                      <Trash2 size={14} />
                    </GlassButton>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{
                    marginTop: '10px', paddingTop: '10px',
                    borderTop: '1px solid rgba(255,255,255,0.1)',
                    display: 'flex', flexDirection: 'column', gap: '8px',
                  }}>
                    <div>
                      <label style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '2px' }}>
                        Label
                      </label>
                      <GlassInput
                        value={p.label}
                        onChange={(e) => handleUpdate(p.id, { label: e.target.value })}
                        style={{ fontSize: '12px' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '2px' }}>
                          Latitude
                        </label>
                        <GlassInput
                          type="number" step="0.000001"
                          value={p.position.lat}
                          onChange={(e) => handleUpdate(p.id, {
                            position: { ...p.position, lat: parseFloat(e.target.value) || 0 },
                          })}
                          style={{ fontSize: '11px' }}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '2px' }}>
                          Longitude
                        </label>
                        <GlassInput
                          type="number" step="0.000001"
                          value={p.position.lon}
                          onChange={(e) => handleUpdate(p.id, {
                            position: { ...p.position, lon: parseFloat(e.target.value) || 0 },
                          })}
                          style={{ fontSize: '11px' }}
                        />
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '2px' }}>
                        Orientation (deg)
                      </label>
                      <GlassInput
                        type="number" min="0" max="360"
                        value={p.orientation}
                        onChange={(e) => handleUpdate(p.id, {
                          orientation: parseFloat(e.target.value) || 0,
                        })}
                        style={{ fontSize: '11px', width: '100px' }}
                      />
                    </div>
                  </div>
                )}
              </GlassCard>
            );
          })
        )}
      </div>

      {/* Summary */}
      <div style={{
        padding: '12px 16px',
        background: 'rgba(59, 130, 246, 0.05)',
        borderRadius: '8px',
        border: '1px solid rgba(59, 130, 246, 0.2)',
        fontSize: '13px',
        color: 'rgba(255, 255, 255, 0.7)',
      }}>
        {state.assetPlacements.length === 0 ? (
          <span>No assets placed — This step is optional</span>
        ) : (
          <span>
            {state.assetPlacements.length} asset{state.assetPlacements.length !== 1 ? 's' : ''} placed
          </span>
        )}
      </div>
    </div>
  );
}
