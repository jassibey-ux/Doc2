/**
 * SessionFilters Component
 * Filter controls for session search
 */

import React, { useEffect } from 'react';
import { X, Filter, Calendar, Tag as TagIcon, CheckCircle, XCircle, Clock } from 'lucide-react';
import { useCRM } from '../../contexts/CRMContext';
import { useWorkflow } from '../../contexts/WorkflowContext';
import { SessionSearchFilters } from '../../types/crm';
import { GlassButton, GlassInput, GlassSelect } from '../ui/GlassUI';

interface SessionFiltersProps {
  filters: SessionSearchFilters;
  onFiltersChange: (filters: SessionSearchFilters) => void;
  onClear: () => void;
  compact?: boolean;
}

const STATUS_OPTIONS = [
  { value: 'planning', label: 'Planning' },
  { value: 'active', label: 'Active' },
  { value: 'capturing', label: 'Capturing' },
  { value: 'analyzing', label: 'Analyzing' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];

const PASS_FAIL_OPTIONS = [
  { value: '', label: 'All Results' },
  { value: 'pass', label: 'Pass' },
  { value: 'fail', label: 'Fail' },
  { value: 'partial', label: 'Partial' },
];

export default function SessionFilters({
  filters,
  onFiltersChange,
  onClear,
  compact = false,
}: SessionFiltersProps) {
  const { allTags, loadAllTags } = useCRM();
  const { sites, droneProfiles, cuasProfiles, loadSites, loadDroneProfiles, loadCUASProfiles } = useWorkflow();

  // Load reference data on mount
  useEffect(() => {
    if (allTags.length === 0) loadAllTags();
    if (sites.length === 0) loadSites();
    if (droneProfiles.length === 0) loadDroneProfiles();
    if (cuasProfiles.length === 0) loadCUASProfiles();
  }, []);

  const updateFilter = <K extends keyof SessionSearchFilters>(
    key: K,
    value: SessionSearchFilters[K]
  ) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const toggleStatus = (status: string) => {
    const current = filters.status || [];
    const updated = current.includes(status)
      ? current.filter(s => s !== status)
      : [...current, status];
    updateFilter('status', updated.length > 0 ? updated : undefined);
  };

  const toggleTag = (tag: string) => {
    const current = filters.tags || [];
    const updated = current.includes(tag)
      ? current.filter(t => t !== tag)
      : [...current, tag];
    updateFilter('tags', updated.length > 0 ? updated : undefined);
  };

  const activeFilterCount = [
    filters.status?.length,
    filters.tags?.length,
    filters.passFail,
    filters.siteId,
    filters.droneProfileId,
    filters.cuasProfileId,
    filters.startDate,
    filters.endDate,
    filters.operatorName,
  ].filter(Boolean).length;

  const containerStyle: React.CSSProperties = {
    padding: compact ? '12px' : '16px',
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: compact ? '12px' : '16px',
  };

  const sectionStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.6)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  };

  const chipContainerStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  };

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '4px 10px',
    fontSize: '11px',
    fontWeight: 500,
    background: active ? 'rgba(255, 140, 0, 0.2)' : 'rgba(255, 255, 255, 0.05)',
    border: `1px solid ${active ? 'rgba(255, 140, 0, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
    borderRadius: '4px',
    color: active ? '#ff8c00' : 'rgba(255, 255, 255, 0.7)',
    cursor: 'pointer',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  });

  const rowStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: compact ? '1fr' : '1fr 1fr',
    gap: '12px',
  };

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Filter size={14} style={{ color: '#ff8c00' }} />
          <span style={{ fontSize: '13px', fontWeight: 600 }}>Filters</span>
          {activeFilterCount > 0 && (
            <span
              style={{
                padding: '2px 6px',
                fontSize: '10px',
                fontWeight: 600,
                background: '#ff8c00',
                borderRadius: '10px',
                color: '#000',
              }}
            >
              {activeFilterCount}
            </span>
          )}
        </div>
        {activeFilterCount > 0 && (
          <GlassButton variant="ghost" size="sm" onClick={onClear}>
            <X size={12} />
            Clear All
          </GlassButton>
        )}
      </div>

      {/* Status Filter */}
      <div style={sectionStyle}>
        <div style={labelStyle}>
          <Clock size={12} />
          Status
        </div>
        <div style={chipContainerStyle}>
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              style={chipStyle(filters.status?.includes(opt.value) || false)}
              onClick={() => toggleStatus(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Pass/Fail Filter */}
      <div style={sectionStyle}>
        <div style={labelStyle}>
          <CheckCircle size={12} />
          Result
        </div>
        <div style={chipContainerStyle}>
          {PASS_FAIL_OPTIONS.slice(1).map(opt => (
            <button
              key={opt.value}
              style={chipStyle(filters.passFail === opt.value)}
              onClick={() => updateFilter('passFail', filters.passFail === opt.value ? undefined : opt.value)}
            >
              {opt.value === 'pass' && <CheckCircle size={10} style={{ marginRight: '4px', color: '#22c55e' }} />}
              {opt.value === 'fail' && <XCircle size={10} style={{ marginRight: '4px', color: '#ef4444' }} />}
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tags Filter */}
      {allTags.length > 0 && (
        <div style={sectionStyle}>
          <div style={labelStyle}>
            <TagIcon size={12} />
            Tags
          </div>
          <div style={chipContainerStyle}>
            {allTags.slice(0, 10).map(t => (
              <button
                key={t.tag}
                style={chipStyle(filters.tags?.includes(t.tag) || false)}
                onClick={() => toggleTag(t.tag)}
              >
                {t.tag}
                <span style={{ marginLeft: '4px', opacity: 0.6 }}>({t.count})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Dropdowns Row */}
      <div style={rowStyle}>
        {/* Site Filter */}
        <div style={sectionStyle}>
          <div style={labelStyle}>Site</div>
          <GlassSelect
            value={filters.siteId || ''}
            onChange={e => updateFilter('siteId', e.target.value || undefined)}
            style={{ fontSize: '12px' }}
          >
            <option value="">All Sites</option>
            {sites.map(site => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </GlassSelect>
        </div>

        {/* Operator Filter */}
        <div style={sectionStyle}>
          <div style={labelStyle}>Operator</div>
          <GlassInput
            placeholder="Filter by operator..."
            value={filters.operatorName || ''}
            onChange={e => updateFilter('operatorName', e.target.value || undefined)}
            style={{ fontSize: '12px' }}
          />
        </div>
      </div>

      {/* Date Range */}
      <div style={rowStyle}>
        <div style={sectionStyle}>
          <div style={labelStyle}>
            <Calendar size={12} />
            From Date
          </div>
          <GlassInput
            type="date"
            value={filters.startDate || ''}
            onChange={e => updateFilter('startDate', e.target.value || undefined)}
            style={{ fontSize: '12px' }}
          />
        </div>
        <div style={sectionStyle}>
          <div style={labelStyle}>
            <Calendar size={12} />
            To Date
          </div>
          <GlassInput
            type="date"
            value={filters.endDate || ''}
            onChange={e => updateFilter('endDate', e.target.value || undefined)}
            style={{ fontSize: '12px' }}
          />
        </div>
      </div>

      {/* Equipment Filters */}
      <div style={rowStyle}>
        <div style={sectionStyle}>
          <div style={labelStyle}>Drone Profile</div>
          <GlassSelect
            value={filters.droneProfileId || ''}
            onChange={e => updateFilter('droneProfileId', e.target.value || undefined)}
            style={{ fontSize: '12px' }}
          >
            <option value="">All Drones</option>
            {droneProfiles.map(dp => (
              <option key={dp.id} value={dp.id}>
                {dp.name}
              </option>
            ))}
          </GlassSelect>
        </div>

        <div style={sectionStyle}>
          <div style={labelStyle}>CUAS Profile</div>
          <GlassSelect
            value={filters.cuasProfileId || ''}
            onChange={e => updateFilter('cuasProfileId', e.target.value || undefined)}
            style={{ fontSize: '12px' }}
          >
            <option value="">All CUAS</option>
            {cuasProfiles.map(cp => (
              <option key={cp.id} value={cp.id}>
                {cp.name}
              </option>
            ))}
          </GlassSelect>
        </div>
      </div>
    </div>
  );
}
