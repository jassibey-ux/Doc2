/**
 * CUAS Profile Panel
 * Manage CUAS system profiles (jammers, sensors, radar, etc.)
 */

import { useState, useCallback } from 'react';
import {
  Radio,
  Plus,
  Trash2,
  Save,
  X,
  Edit3,
  Zap,
  Radar,
  Volume2,
  Camera,
  Layers,
} from 'lucide-react';
import { GlassPanel, GlassCard, GlassButton, GlassInput, Badge, GlassDivider } from './ui/GlassUI';
import { ModelThumbnail } from './ModelThumbnail';
import { getCUASModelOptions } from '../utils/modelRegistry';
import { useWorkflow } from '../contexts/WorkflowContext';
import {
  CUASProfile,
  CUASType,
  AntennaPattern,
} from '../types/workflow';

interface CUASProfilePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const CUAS_TYPES: { value: CUASType; label: string; icon: React.ReactNode }[] = [
  { value: 'jammer', label: 'RF Jammer', icon: <Zap size={14} /> },
  { value: 'rf_sensor', label: 'RF Sensor', icon: <Radio size={14} /> },
  { value: 'radar', label: 'Radar', icon: <Radar size={14} /> },
  { value: 'eo_ir_camera', label: 'EO/IR Camera', icon: <Camera size={14} /> },
  { value: 'acoustic', label: 'Acoustic', icon: <Volume2 size={14} /> },
  { value: 'combined', label: 'Combined System', icon: <Layers size={14} /> },
];

const ANTENNA_PATTERNS: { value: AntennaPattern; label: string }[] = [
  { value: 'omni', label: 'Omnidirectional' },
  { value: 'directional', label: 'Directional' },
  { value: 'sector', label: 'Sector' },
];

const CAPABILITY_OPTIONS = [
  'GPS L1',
  'GPS L2',
  'GLONASS',
  'Galileo',
  'WiFi 2.4GHz',
  'WiFi 5.8GHz',
  'RC 2.4GHz',
  'RC 900MHz',
  'LTE/4G',
  '5G',
  'ISM Band',
];

export default function CUASProfilePanel({ isOpen, onClose }: CUASProfilePanelProps) {
  const {
    cuasProfiles,
    createCUASProfile,
    updateCUASProfile,
    deleteCUASProfile,
  } = useWorkflow();

  const [isEditing, setIsEditing] = useState(false);
  const [editedProfile, setEditedProfile] = useState<Partial<CUASProfile> | null>(null);
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Start editing
  const handleEdit = useCallback((profile: CUASProfile) => {
    setEditedProfile({ ...profile });
    setSelectedCapabilities(profile.capabilities || []);
    setIsEditing(true);
  }, []);

  // Start creating new
  const handleNew = useCallback(() => {
    setEditedProfile({
      name: '',
      vendor: '',
      type: 'jammer',
      capabilities: [],
      effective_range_m: 500,
      antenna_pattern: 'omni',
    });
    setSelectedCapabilities([]);
    setIsEditing(true);
  }, []);

  // Save
  const handleSave = useCallback(async () => {
    if (!editedProfile || !editedProfile.name || !editedProfile.vendor) return;

    const profileData = {
      ...editedProfile,
      capabilities: selectedCapabilities,
    };

    setSaveError(null);
    try {
      if (editedProfile.id) {
        await updateCUASProfile(editedProfile.id, profileData);
      } else {
        await createCUASProfile(profileData as Omit<CUASProfile, 'id' | 'created_at' | 'updated_at'>);
      }
      setIsEditing(false);
      setEditedProfile(null);
    } catch (err) {
      console.error('Failed to save CUAS profile:', err);
      setSaveError(err instanceof Error ? err.message : 'Failed to save profile');
    }
  }, [editedProfile, selectedCapabilities, createCUASProfile, updateCUASProfile]);

  // Cancel
  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setEditedProfile(null);
  }, []);

  // Delete
  const handleDelete = useCallback(async (profile: CUASProfile) => {
    if (!confirm(`Delete "${profile.name}"?`)) return;
    await deleteCUASProfile(profile.id);
  }, [deleteCUASProfile]);

  // Toggle capability
  const toggleCapability = useCallback((cap: string) => {
    setSelectedCapabilities(prev =>
      prev.includes(cap) ? prev.filter(c => c !== cap) : [...prev, cap]
    );
  }, []);

  // Get icon for CUAS type
  const getTypeIcon = (type: CUASType) => {
    const found = CUAS_TYPES.find(t => t.value === type);
    return found?.icon || <Radio size={14} />;
  };

  // Get color for CUAS type
  const getTypeColor = (type: CUASType): 'red' | 'blue' | 'green' | 'orange' | 'gray' => {
    switch (type) {
      case 'jammer': return 'red';
      case 'rf_sensor': return 'blue';
      case 'radar': return 'green';
      case 'eo_ir_camera': return 'orange';
      case 'acoustic': return 'gray';
      case 'combined': return 'orange';
      default: return 'gray';
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="side-panel"
      style={{
        position: 'absolute',
        left: '60px',
        top: '20px',
        width: '320px',
        maxHeight: 'calc(100vh - 140px)',
        zIndex: 100,
      }}
    >
      <GlassPanel style={{ padding: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Radio size={18} style={{ color: '#ff8c00' }} />
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>
              {isEditing ? (editedProfile?.id ? 'Edit CUAS' : 'New CUAS') : 'CUAS Systems'}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: '4px' }}
          >
            <X size={16} />
          </button>
        </div>

        {isEditing ? (
          // Edit Form
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {/* Name */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                System Name *
              </label>
              <GlassInput
                placeholder="e.g., DroneShield DroneGun"
                value={editedProfile?.name || ''}
                onChange={(e) => setEditedProfile(prev => prev ? { ...prev, name: e.target.value } : null)}
              />
            </div>

            {/* Vendor & Model */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                  Vendor *
                </label>
                <GlassInput
                  placeholder="DroneShield"
                  value={editedProfile?.vendor || ''}
                  onChange={(e) => setEditedProfile(prev => prev ? { ...prev, vendor: e.target.value } : null)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                  Model
                </label>
                <GlassInput
                  placeholder="MK3"
                  value={editedProfile?.model || ''}
                  onChange={(e) => setEditedProfile(prev => prev ? { ...prev, model: e.target.value } : null)}
                />
              </div>
            </div>

            {/* System Type */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                System Type
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                {CUAS_TYPES.map(ct => (
                  <button
                    key={ct.value}
                    onClick={() => setEditedProfile(prev => prev ? { ...prev, type: ct.value } : null)}
                    style={{
                      padding: '8px',
                      borderRadius: '6px',
                      border: editedProfile?.type === ct.value ? '1px solid #ff8c00' : '1px solid rgba(255,255,255,0.1)',
                      background: editedProfile?.type === ct.value ? 'rgba(255,140,0,0.2)' : 'rgba(255,255,255,0.05)',
                      color: '#fff',
                      fontSize: '11px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    {ct.icon}
                    {ct.label}
                  </button>
                ))}
              </div>
            </div>

            <GlassDivider />

            {/* Range & Coverage */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                  Effective Range (m) *
                </label>
                <GlassInput
                  type="number"
                  placeholder="500"
                  value={editedProfile?.effective_range_m?.toString() || ''}
                  onChange={(e) => setEditedProfile(prev => prev ? { ...prev, effective_range_m: parseFloat(e.target.value) || 0 } : null)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                  Beam Width (deg)
                </label>
                <GlassInput
                  type="number"
                  placeholder="60"
                  value={editedProfile?.beam_width_deg?.toString() || ''}
                  onChange={(e) => setEditedProfile(prev => prev ? { ...prev, beam_width_deg: parseFloat(e.target.value) || undefined } : null)}
                />
              </div>
            </div>

            {/* Antenna Pattern */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                Antenna Pattern
              </label>
              <div style={{ display: 'flex', gap: '6px' }}>
                {ANTENNA_PATTERNS.map(ap => (
                  <button
                    key={ap.value}
                    onClick={() => setEditedProfile(prev => prev ? { ...prev, antenna_pattern: ap.value } : null)}
                    style={{
                      flex: 1,
                      padding: '6px',
                      borderRadius: '6px',
                      border: editedProfile?.antenna_pattern === ap.value ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                      background: editedProfile?.antenna_pattern === ap.value ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                      color: '#fff',
                      fontSize: '10px',
                      cursor: 'pointer',
                    }}
                  >
                    {ap.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 3D Model */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                3D Model
              </label>
              <select
                value={editedProfile?.model_3d || ''}
                onChange={(e) => setEditedProfile(prev => prev ? { ...prev, model_3d: e.target.value || null as any } : null)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '13px',
                  outline: 'none',
                }}
              >
                <option value="" style={{ background: '#1a1a2e' }}>Auto-detect by type</option>
                {getCUASModelOptions().map(opt => (
                  <option key={opt.id} value={opt.id} style={{ background: '#1a1a2e' }}>{opt.label}</option>
                ))}
              </select>
            </div>

            <GlassDivider />

            {/* Capabilities (for jammers) */}
            {(editedProfile?.type === 'jammer' || editedProfile?.type === 'combined') && (
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                  Jamming Capabilities
                </label>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {CAPABILITY_OPTIONS.map(cap => (
                    <button
                      key={cap}
                      onClick={() => toggleCapability(cap)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        border: selectedCapabilities.includes(cap) ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.1)',
                        background: selectedCapabilities.includes(cap) ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)',
                        color: '#fff',
                        fontSize: '10px',
                        cursor: 'pointer',
                      }}
                    >
                      {cap}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Power (for jammers) */}
            {editedProfile?.type === 'jammer' && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                    Power Output (W)
                  </label>
                  <GlassInput
                    type="number"
                    placeholder="10"
                    value={editedProfile?.power_output_w?.toString() || ''}
                    onChange={(e) => setEditedProfile(prev => prev ? { ...prev, power_output_w: parseFloat(e.target.value) || undefined } : null)}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                    Antenna Gain (dBi)
                  </label>
                  <GlassInput
                    type="number"
                    placeholder="6"
                    value={editedProfile?.antenna_gain_dbi?.toString() || ''}
                    onChange={(e) => setEditedProfile(prev => prev ? { ...prev, antenna_gain_dbi: parseFloat(e.target.value) || undefined } : null)}
                  />
                </div>
              </div>
            )}

            {/* Notes */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                Notes
              </label>
              <textarea
                placeholder="Additional notes..."
                value={editedProfile?.notes || ''}
                onChange={(e) => setEditedProfile(prev => prev ? { ...prev, notes: e.target.value } : null)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '13px',
                  outline: 'none',
                  minHeight: '50px',
                  resize: 'vertical',
                }}
              />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <GlassButton variant="ghost" size="md" onClick={handleCancel} style={{ flex: 1 }}>
                Cancel
              </GlassButton>
              <GlassButton
                variant="primary"
                size="md"
                onClick={handleSave}
                disabled={!editedProfile?.name || !editedProfile?.vendor || !editedProfile?.effective_range_m}
                style={{ flex: 1 }}
              >
                <Save size={14} />
                Save
              </GlassButton>
            </div>
            {saveError && (
              <div style={{ padding: '8px 12px', background: 'rgba(255,50,50,0.15)', borderRadius: '6px', marginTop: '8px', fontSize: '12px', color: '#ff6b6b' }}>
                {saveError}
              </div>
            )}
          </div>
        ) : (
          // Profile List
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <GlassButton variant="primary" size="md" onClick={handleNew} style={{ width: '100%', marginBottom: '12px' }}>
              <Plus size={16} />
              New CUAS System
            </GlassButton>

            {cuasProfiles.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'rgba(255,255,255,0.5)' }}>
                <Radio size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
                <div style={{ fontSize: '13px' }}>No CUAS systems</div>
                <div style={{ fontSize: '11px', marginTop: '4px' }}>Add jammers, sensors, radar, etc.</div>
              </div>
            ) : (
              cuasProfiles.map(profile => (
                <GlassCard key={profile.id} style={{ marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div style={{ marginRight: '10px', flexShrink: 0 }}>
                      <ModelThumbnail
                        type="cuas"
                        cuasType={profile.type}
                        size={48}
                        view="profile"
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                        {getTypeIcon(profile.type)}
                        <span style={{ fontSize: '13px', fontWeight: 500, color: '#fff' }}>
                          {profile.name}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px' }}>
                        {profile.vendor} {profile.model && `/ ${profile.model}`}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <Badge color={getTypeColor(profile.type)} size="sm">
                          {profile.type.replace('_', ' ')}
                        </Badge>
                        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>
                          {profile.effective_range_m}m range
                        </span>
                        {profile.measured_range_m && (
                          <span style={{ fontSize: '10px', color: profile.measured_range_m < profile.effective_range_m ? '#ef4444' : '#22c55e' }}>
                            (measured: {profile.measured_range_m}m)
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        onClick={() => handleEdit(profile)}
                        style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: '4px' }}
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(profile)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </GlassCard>
              ))
            )}
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
