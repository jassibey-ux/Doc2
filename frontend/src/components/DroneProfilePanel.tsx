/**
 * Drone Profile Panel
 * Manage drone profiles with specifications and failsafe settings
 */

import { useState, useCallback } from 'react';
import {
  Plane,
  Plus,
  Trash2,
  Save,
  X,
  Edit3,
} from 'lucide-react';
import { GlassPanel, GlassCard, GlassButton, GlassInput, Badge, GlassDivider } from './ui/GlassUI';
import { useWorkflow } from '../contexts/WorkflowContext';
import {
  DroneProfile,
  WeightClass,
  FailsafeType,
} from '../types/workflow';

interface DroneProfilePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const WEIGHT_CLASSES: { value: WeightClass; label: string; desc: string }[] = [
  { value: 'micro', label: 'Micro', desc: '< 250g' },
  { value: 'mini', label: 'Mini', desc: '250g - 2kg' },
  { value: 'small', label: 'Small', desc: '2 - 25kg' },
  { value: 'medium', label: 'Medium', desc: '> 25kg' },
];

const FAILSAFE_TYPES: { value: FailsafeType; label: string }[] = [
  { value: 'rth', label: 'Return to Home' },
  { value: 'land', label: 'Land in Place' },
  { value: 'hover', label: 'Hover' },
  { value: 'atti_mode', label: 'ATTI Mode' },
  { value: 'fly_away', label: 'Fly Away' },
  { value: 'unknown', label: 'Unknown' },
];

const FREQUENCY_BANDS = [
  '2.4GHz RC',
  '5.8GHz Video',
  '900MHz',
  'GPS L1',
  'GPS L2',
  'GLONASS',
  'Galileo',
];

export default function DroneProfilePanel({ isOpen, onClose }: DroneProfilePanelProps) {
  const {
    droneProfiles,
    createDroneProfile,
    updateDroneProfile,
    deleteDroneProfile,
  } = useWorkflow();

  const [isEditing, setIsEditing] = useState(false);
  const [editedProfile, setEditedProfile] = useState<Partial<DroneProfile> | null>(null);
  const [selectedBands, setSelectedBands] = useState<string[]>([]);

  // Start editing
  const handleEdit = useCallback((profile: DroneProfile) => {
    setEditedProfile({ ...profile });
    setSelectedBands(profile.frequency_bands || []);
    setIsEditing(true);
  }, []);

  // Start creating new
  const handleNew = useCallback(() => {
    setEditedProfile({
      name: '',
      make: '',
      model: '',
      weight_class: 'mini',
      frequency_bands: [],
      expected_failsafe: 'rth',
    });
    setSelectedBands([]);
    setIsEditing(true);
  }, []);

  // Save
  const handleSave = useCallback(async () => {
    if (!editedProfile || !editedProfile.name || !editedProfile.make || !editedProfile.model) return;

    const profileData = {
      ...editedProfile,
      frequency_bands: selectedBands,
    };

    try {
      if (editedProfile.id) {
        await updateDroneProfile(editedProfile.id, profileData);
      } else {
        await createDroneProfile(profileData as Omit<DroneProfile, 'id' | 'created_at' | 'updated_at'>);
      }
      setIsEditing(false);
      setEditedProfile(null);
    } catch (err) {
      console.error('Failed to save drone profile:', err);
    }
  }, [editedProfile, selectedBands, createDroneProfile, updateDroneProfile]);

  // Cancel
  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setEditedProfile(null);
  }, []);

  // Delete
  const handleDelete = useCallback(async (profile: DroneProfile) => {
    if (!confirm(`Delete profile "${profile.name}"?`)) return;
    await deleteDroneProfile(profile.id);
  }, [deleteDroneProfile]);

  // Toggle frequency band
  const toggleBand = useCallback((band: string) => {
    setSelectedBands(prev =>
      prev.includes(band) ? prev.filter(b => b !== band) : [...prev, band]
    );
  }, []);

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
            <Plane size={18} style={{ color: '#ff8c00' }} />
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>
              {isEditing ? (editedProfile?.id ? 'Edit Profile' : 'New Profile') : 'Drone Profiles'}
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
                Profile Name *
              </label>
              <GlassInput
                placeholder="e.g., DJI Mavic 3"
                value={editedProfile?.name || ''}
                onChange={(e) => setEditedProfile(prev => prev ? { ...prev, name: e.target.value } : null)}
              />
            </div>

            {/* Make & Model */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                  Make *
                </label>
                <GlassInput
                  placeholder="DJI"
                  value={editedProfile?.make || ''}
                  onChange={(e) => setEditedProfile(prev => prev ? { ...prev, make: e.target.value } : null)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                  Model *
                </label>
                <GlassInput
                  placeholder="Mavic 3"
                  value={editedProfile?.model || ''}
                  onChange={(e) => setEditedProfile(prev => prev ? { ...prev, model: e.target.value } : null)}
                />
              </div>
            </div>

            {/* Weight Class */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                Weight Class
              </label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {WEIGHT_CLASSES.map(wc => (
                  <button
                    key={wc.value}
                    onClick={() => setEditedProfile(prev => prev ? { ...prev, weight_class: wc.value } : null)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '6px',
                      border: editedProfile?.weight_class === wc.value ? '1px solid #ff8c00' : '1px solid rgba(255,255,255,0.1)',
                      background: editedProfile?.weight_class === wc.value ? 'rgba(255,140,0,0.2)' : 'rgba(255,255,255,0.05)',
                      color: '#fff',
                      fontSize: '11px',
                      cursor: 'pointer',
                    }}
                  >
                    {wc.label}
                    <span style={{ display: 'block', fontSize: '9px', color: 'rgba(255,255,255,0.5)' }}>{wc.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Expected Failsafe */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                Expected Failsafe
              </label>
              <select
                value={editedProfile?.expected_failsafe || 'rth'}
                onChange={(e) => setEditedProfile(prev => prev ? { ...prev, expected_failsafe: e.target.value as FailsafeType } : null)}
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
                {FAILSAFE_TYPES.map(fs => (
                  <option key={fs.value} value={fs.value} style={{ background: '#1a1a2e' }}>
                    {fs.label}
                  </option>
                ))}
              </select>
            </div>

            <GlassDivider />

            {/* Frequency Bands */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                Frequency Bands
              </label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {FREQUENCY_BANDS.map(band => (
                  <button
                    key={band}
                    onClick={() => toggleBand(band)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      border: selectedBands.includes(band) ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                      background: selectedBands.includes(band) ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                      color: '#fff',
                      fontSize: '10px',
                      cursor: 'pointer',
                    }}
                  >
                    {band}
                  </button>
                ))}
              </div>
            </div>

            <GlassDivider />

            {/* Optional Specs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                  Max Speed (m/s)
                </label>
                <GlassInput
                  type="number"
                  placeholder="20"
                  value={editedProfile?.max_speed_mps?.toString() || ''}
                  onChange={(e) => setEditedProfile(prev => prev ? { ...prev, max_speed_mps: parseFloat(e.target.value) || undefined } : null)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                  Max Alt (m)
                </label>
                <GlassInput
                  type="number"
                  placeholder="500"
                  value={editedProfile?.max_altitude_m?.toString() || ''}
                  onChange={(e) => setEditedProfile(prev => prev ? { ...prev, max_altitude_m: parseFloat(e.target.value) || undefined } : null)}
                />
              </div>
            </div>

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
                disabled={!editedProfile?.name || !editedProfile?.make || !editedProfile?.model}
                style={{ flex: 1 }}
              >
                <Save size={14} />
                Save
              </GlassButton>
            </div>
          </div>
        ) : (
          // Profile List
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <GlassButton variant="primary" size="md" onClick={handleNew} style={{ width: '100%', marginBottom: '12px' }}>
              <Plus size={16} />
              New Profile
            </GlassButton>

            {droneProfiles.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'rgba(255,255,255,0.5)' }}>
                <Plane size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
                <div style={{ fontSize: '13px' }}>No drone profiles</div>
                <div style={{ fontSize: '11px', marginTop: '4px' }}>Create a profile to get started</div>
              </div>
            ) : (
              droneProfiles.map(profile => (
                <GlassCard key={profile.id} style={{ marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: '#fff', marginBottom: '2px' }}>
                        {profile.name}
                      </div>
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px' }}>
                        {profile.make} {profile.model}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <Badge color="blue" size="sm">{profile.weight_class}</Badge>
                        <Badge color="orange" size="sm">{profile.expected_failsafe.toUpperCase()}</Badge>
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
