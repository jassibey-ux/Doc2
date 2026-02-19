/**
 * SiteGallery — 2-column grid of SiteCards with search, sort, and environment filter.
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Search, Plus, Grid, List, MapPin } from 'lucide-react';
import { GlassButton, GlassInput } from '../ui/GlassUI';
import SiteCard from './SiteCard';
import type { SiteDefinition, EnvironmentType } from '../../types/workflow';

type SortKey = 'recent' | 'name' | 'created';

const ENVIRONMENT_FILTERS: { value: EnvironmentType; label: string }[] = [
  { value: 'open_field', label: 'Open Field' },
  { value: 'urban', label: 'Urban' },
  { value: 'suburban', label: 'Suburban' },
  { value: 'wooded', label: 'Wooded' },
  { value: 'coastal', label: 'Coastal' },
  { value: 'mountain', label: 'Mountain' },
];

interface SiteGalleryProps {
  sites: SiteDefinition[];
  selectedSiteId?: string | null;
  onSiteSelect: (site: SiteDefinition) => void;
  onNewSite: () => void;
}

const SiteGallery: React.FC<SiteGalleryProps> = ({
  sites,
  selectedSiteId,
  onSiteSelect,
  onNewSite,
}) => {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [envFilter, setEnvFilter] = useState<EnvironmentType | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounce search term by 300ms
  useEffect(() => {
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const toggleEnvFilter = useCallback((env: EnvironmentType) => {
    setEnvFilter(prev => prev === env ? null : env);
  }, []);

  const filteredAndSorted = useMemo(() => {
    let result = [...sites];

    // Search filter (debounced)
    if (debouncedSearch.trim()) {
      const term = debouncedSearch.toLowerCase();
      result = result.filter(s =>
        s.name.toLowerCase().includes(term) ||
        s.environment_type?.toLowerCase().includes(term)
      );
    }

    // Environment filter
    if (envFilter) {
      result = result.filter(s => s.environment_type === envFilter);
    }

    // Sort
    switch (sort) {
      case 'name':
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'created':
        result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case 'recent':
      default:
        result.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        break;
    }

    return result;
  }, [sites, debouncedSearch, sort, envFilter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* New Site button */}
      <GlassButton
        variant="primary"
        size="md"
        onClick={onNewSite}
        style={{ width: '100%' }}
      >
        <Plus size={16} />
        New Site
      </GlassButton>

      {/* Search + View Toggle */}
      {sites.length > 0 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'rgba(255, 255, 255, 0.3)',
                pointerEvents: 'none',
              }}
            />
            <GlassInput
              placeholder="Search sites..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 30, fontSize: 12, padding: '7px 10px 7px 30px' }}
            />
          </div>
          <button
            onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 6,
              padding: '6px 8px',
              color: 'rgba(255, 255, 255, 0.5)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {viewMode === 'grid' ? <List size={14} /> : <Grid size={14} />}
          </button>
        </div>
      )}

      {/* Sort + Environment filter */}
      {sites.length > 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* Sort chips */}
          <div style={{ display: 'flex', gap: 4 }}>
            {(['recent', 'name', 'created'] as SortKey[]).map(key => (
              <button
                key={key}
                onClick={() => setSort(key)}
                style={{
                  padding: '3px 8px',
                  borderRadius: 4,
                  border: sort === key ? '1px solid rgba(255, 140, 0, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
                  background: sort === key ? 'rgba(255, 140, 0, 0.15)' : 'transparent',
                  color: sort === key ? '#f97316' : 'rgba(255, 255, 255, 0.4)',
                  fontSize: 10,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {key}
              </button>
            ))}
          </div>

          {/* Environment filter chips */}
          <div style={{
            display: 'flex',
            gap: 4,
            overflowX: 'auto',
            paddingBottom: 2,
          }}>
            {ENVIRONMENT_FILTERS.map(env => (
              <button
                key={env.value}
                onClick={() => toggleEnvFilter(env.value)}
                style={{
                  padding: '3px 8px',
                  borderRadius: 4,
                  border: envFilter === env.value
                    ? '1px solid rgba(59, 130, 246, 0.4)'
                    : '1px solid rgba(255, 255, 255, 0.08)',
                  background: envFilter === env.value
                    ? 'rgba(59, 130, 246, 0.15)'
                    : 'transparent',
                  color: envFilter === env.value
                    ? '#3b82f6'
                    : 'rgba(255, 255, 255, 0.4)',
                  fontSize: 10,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {env.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Site Cards */}
      {filteredAndSorted.length === 0 ? (
        sites.length === 0 ? (
          // Empty state — no sites at all
          <div style={{
            textAlign: 'center',
            padding: '32px 16px',
            color: 'rgba(255, 255, 255, 0.4)',
          }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: 'rgba(255, 140, 0, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px',
            }}>
              <MapPin size={28} style={{ color: '#f97316' }} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255, 255, 255, 0.7)', marginBottom: 4 }}>
              Create Your First Site
            </div>
            <div style={{ fontSize: 12 }}>
              Draw a boundary on the 3D globe to define your test area
            </div>
          </div>
        ) : (
          // No results
          <div style={{
            textAlign: 'center',
            padding: '24px',
            color: 'rgba(255, 255, 255, 0.4)',
            fontSize: 12,
          }}>
            No sites match your filters
          </div>
        )
      ) : viewMode === 'grid' ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 8,
        }}>
          {filteredAndSorted.map(site => (
            <SiteCard
              key={site.id}
              site={site}
              selected={selectedSiteId === site.id}
              onClick={() => onSiteSelect(site)}
            />
          ))}
        </div>
      ) : (
        // List view
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filteredAndSorted.map(site => (
            <SiteCard
              key={site.id}
              site={site}
              selected={selectedSiteId === site.id}
              compact
              onClick={() => onSiteSelect(site)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default SiteGallery;
