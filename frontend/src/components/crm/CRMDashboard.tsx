/**
 * CRM Dashboard
 * Full-page analytics view for session library and CRM features
 */

import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Database,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  Tag as TagIcon,
  MapPin,
  Search,
  Filter,
  ChevronRight,
  RefreshCw,
  BarChart3,
  TrendingUp,
} from 'lucide-react';
import { useCRM } from '../../contexts/CRMContext';
import { SessionSearchFilters } from '../../types/crm';
import { TestSession } from '../../types/workflow';
import { GlassButton, GlassCard, GlassInput, Badge } from '../ui/GlassUI';
import SessionFilters from './SessionFilters';

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `${hrs}h ${remainMins}m`;
  }
  return `${mins}m ${secs}s`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateStr);
}

// Stat Card Component
function StatCard({
  label,
  value,
  icon,
  color = '#ff8c00',
  subtext,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color?: string;
  subtext?: string;
}) {
  return (
    <GlassCard style={{ padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {label}
          </div>
          <div style={{ fontSize: '28px', fontWeight: 700, marginTop: '4px', color }}>
            {value}
          </div>
          {subtext && (
            <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.4)', marginTop: '2px' }}>
              {subtext}
            </div>
          )}
        </div>
        <div style={{ color, opacity: 0.5 }}>{icon}</div>
      </div>
    </GlassCard>
  );
}

// Badge color type
type BadgeColor = 'green' | 'orange' | 'yellow' | 'red' | 'blue' | 'gray';

// Session List Item Component
function SessionListItem({
  session,
  onClick,
}: {
  session: TestSession;
  onClick: () => void;
}) {
  const statusBadgeColors: Record<string, BadgeColor> = {
    planning: 'gray',
    active: 'blue',
    capturing: 'orange',
    analyzing: 'yellow',
    completed: 'green',
    archived: 'gray',
  };

  const passFailBadgeColors: Record<string, BadgeColor> = {
    pass: 'green',
    fail: 'red',
    partial: 'yellow',
  };

  return (
    <div
      onClick={onClick}
      style={{
        padding: '12px 14px',
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: '8px',
        cursor: 'pointer',
        transition: 'all 0.15s',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'rgba(255, 140, 0, 0.05)';
        e.currentTarget.style.borderColor = 'rgba(255, 140, 0, 0.2)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)';
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600 }}>{session.name}</span>
          <Badge
            color={statusBadgeColors[session.status] || 'gray'}
            size="sm"
          >
            {session.status}
          </Badge>
          {session.metrics?.pass_fail && (
            <Badge
              color={passFailBadgeColors[session.metrics.pass_fail] || 'gray'}
              size="sm"
            >
              {session.metrics.pass_fail === 'pass' && <CheckCircle size={10} style={{ marginRight: '3px' }} />}
              {session.metrics.pass_fail === 'fail' && <XCircle size={10} style={{ marginRight: '3px' }} />}
              {session.metrics.pass_fail}
            </Badge>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)' }}>
          <span>{formatRelativeTime(session.created_at)}</span>
          {session.operator_name && <span>by {session.operator_name}</span>}
          {session.duration_seconds && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
              <Clock size={10} />
              {formatDuration(session.duration_seconds)}
            </span>
          )}
        </div>
        {session.tags && session.tags.length > 0 && (
          <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
            {session.tags.slice(0, 4).map(tag => (
              <span
                key={tag}
                style={{
                  padding: '2px 6px',
                  fontSize: '9px',
                  background: 'rgba(255, 140, 0, 0.15)',
                  border: '1px solid rgba(255, 140, 0, 0.3)',
                  borderRadius: '3px',
                  color: '#ff8c00',
                }}
              >
                {tag}
              </span>
            ))}
            {session.tags.length > 4 && (
              <span style={{ fontSize: '9px', color: 'rgba(255, 255, 255, 0.4)' }}>
                +{session.tags.length - 4} more
              </span>
            )}
          </div>
        )}
      </div>
      <ChevronRight size={16} style={{ color: 'rgba(255, 255, 255, 0.3)' }} />
    </div>
  );
}

// Horizontal Bar Chart Component
function HorizontalBarChart({
  data,
  colorMap,
  maxValue,
}: {
  data: Array<{ label: string; value: number }>;
  colorMap: Record<string, string>;
  maxValue?: number;
}) {
  const max = maxValue || Math.max(...data.map(d => d.value), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {data.map(item => (
        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '80px', fontSize: '11px', color: 'rgba(255, 255, 255, 0.7)', textTransform: 'capitalize' }}>
            {item.label}
          </div>
          <div style={{ flex: 1, height: '20px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${(item.value / max) * 100}%`,
                height: '100%',
                background: colorMap[item.label] || '#ff8c00',
                borderRadius: '4px',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
          <div style={{ width: '40px', fontSize: '12px', fontWeight: 600, textAlign: 'right' }}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CRMDashboard() {
  const navigate = useNavigate();
  const {
    dashboardStats,
    dashboardLoading,
    loadDashboardStats,
    searchFilters,
    setSearchFilters,
    searchResults,
    isSearching,
    searchSessions,
    loadAllTags,
  } = useCRM();

  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Load dashboard data on mount
  useEffect(() => {
    loadDashboardStats();
    loadAllTags();
    searchSessions({});
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchFilters({ ...searchFilters, search: searchQuery || undefined });
      searchSessions({ ...searchFilters, search: searchQuery || undefined });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Trigger search when filters change
  useEffect(() => {
    searchSessions(searchFilters);
  }, [searchFilters]);

  const handleClearFilters = () => {
    setSearchFilters({});
    setSearchQuery('');
  };

  const handleTagClick = (tag: string) => {
    const currentTags = searchFilters.tags || [];
    if (currentTags.includes(tag)) {
      setSearchFilters({ ...searchFilters, tags: currentTags.filter(t => t !== tag) });
    } else {
      setSearchFilters({ ...searchFilters, tags: [...currentTags, tag] });
    }
  };

  const stats = dashboardStats;

  const statusColors: Record<string, string> = {
    planning: '#6b7280',
    active: '#3b82f6',
    capturing: '#f59e0b',
    analyzing: '#8b5cf6',
    completed: '#22c55e',
    archived: '#6b7280',
  };

  const passFailColors: Record<string, string> = {
    pass: '#22c55e',
    fail: '#ef4444',
    partial: '#f59e0b',
    pending: '#6b7280',
  };

  const statusData = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.sessionsByStatus)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [stats]);

  const passFailData = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.sessionsByPassFail)
      .map(([label, value]) => ({ label, value }))
      .filter(d => d.value > 0);
  }, [stats]);

  const passRate = useMemo(() => {
    if (!stats) return null;
    const total = (stats.sessionsByPassFail.pass || 0) + (stats.sessionsByPassFail.fail || 0);
    if (total === 0) return null;
    return Math.round((stats.sessionsByPassFail.pass || 0) / total * 100);
  }, [stats]);

  const containerStyle: React.CSSProperties = {
    height: '100vh',
    background: '#000',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  };

  const headerStyle: React.CSSProperties = {
    padding: '16px 24px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'rgba(20, 20, 35, 0.8)',
    backdropFilter: 'blur(20px)',
  };

  const contentStyle: React.CSSProperties = {
    flex: 1,
    overflow: 'auto',
    padding: '20px 24px',
  };

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '16px',
    marginBottom: '24px',
  };

  const twoColumnStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 2fr',
    gap: '24px',
  };

  const sectionStyle: React.CSSProperties = {
    marginBottom: '24px',
  };

  const sectionHeaderStyle: React.CSSProperties = {
    fontSize: '14px',
    fontWeight: 600,
    marginBottom: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: 'rgba(255, 255, 255, 0.9)',
  };

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <GlassButton variant="ghost" onClick={() => navigate('/')}>
            <ArrowLeft size={18} />
          </GlassButton>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Session Library</h1>
            <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', margin: 0 }}>
              Browse, search, and analyze test sessions
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <GlassButton
            variant="ghost"
            onClick={() => {
              loadDashboardStats();
              searchSessions(searchFilters);
            }}
            disabled={dashboardLoading || isSearching}
          >
            <RefreshCw size={14} className={dashboardLoading ? 'animate-spin' : ''} />
            Refresh
          </GlassButton>
        </div>
      </div>

      {/* Content */}
      <div style={contentStyle}>
        {/* Stats Row */}
        {stats && (
          <div style={gridStyle}>
            <StatCard
              label="Total Sessions"
              value={stats.totalSessions}
              icon={<Database size={28} />}
            />
            <StatCard
              label="This Month"
              value={stats.sessionsThisMonth}
              icon={<Calendar size={28} />}
              color="#3b82f6"
            />
            <StatCard
              label="Avg Duration"
              value={formatDuration(stats.avgSessionDuration)}
              icon={<Clock size={28} />}
              color="#8b5cf6"
            />
            <StatCard
              label="Pass Rate"
              value={passRate !== null ? `${passRate}%` : '--'}
              icon={<TrendingUp size={28} />}
              color={passRate !== null ? (passRate >= 70 ? '#22c55e' : passRate >= 50 ? '#f59e0b' : '#ef4444') : '#6b7280'}
              subtext={passRate !== null ? `${stats.sessionsByPassFail.pass || 0} passed` : 'No results yet'}
            />
          </div>
        )}

        {/* Two Column Layout */}
        <div style={twoColumnStyle}>
          {/* Left Column - Charts & Tags */}
          <div>
            {/* Sessions by Status */}
            {stats && statusData.length > 0 && (
              <div style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                  <BarChart3 size={16} style={{ color: '#ff8c00' }} />
                  Sessions by Status
                </div>
                <GlassCard style={{ padding: '16px' }}>
                  <HorizontalBarChart data={statusData} colorMap={statusColors} />
                </GlassCard>
              </div>
            )}

            {/* Pass/Fail Breakdown */}
            {stats && passFailData.length > 0 && (
              <div style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                  <CheckCircle size={16} style={{ color: '#22c55e' }} />
                  Results Breakdown
                </div>
                <GlassCard style={{ padding: '16px' }}>
                  <HorizontalBarChart data={passFailData} colorMap={passFailColors} />
                </GlassCard>
              </div>
            )}

            {/* Top Tags */}
            {stats && stats.topTags.length > 0 && (
              <div style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                  <TagIcon size={16} style={{ color: '#ff8c00' }} />
                  Top Tags
                </div>
                <GlassCard style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {stats.topTags.map(t => (
                      <button
                        key={t.tag}
                        onClick={() => handleTagClick(t.tag)}
                        style={{
                          padding: '6px 10px',
                          fontSize: '12px',
                          fontWeight: 500,
                          background: searchFilters.tags?.includes(t.tag)
                            ? 'rgba(255, 140, 0, 0.3)'
                            : 'rgba(255, 140, 0, 0.1)',
                          border: `1px solid ${searchFilters.tags?.includes(t.tag) ? '#ff8c00' : 'rgba(255, 140, 0, 0.3)'}`,
                          borderRadius: '6px',
                          color: '#ff8c00',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <TagIcon size={12} />
                        {t.tag}
                        <span style={{ opacity: 0.6 }}>({t.count})</span>
                      </button>
                    ))}
                  </div>
                </GlassCard>
              </div>
            )}

            {/* Sessions by Site */}
            {stats && stats.sessionsBySite.length > 0 && (
              <div style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                  <MapPin size={16} style={{ color: '#3b82f6' }} />
                  Sessions by Site
                </div>
                <GlassCard style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {stats.sessionsBySite.slice(0, 5).map(s => (
                      <div
                        key={s.siteId}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '8px 10px',
                          background: 'rgba(255, 255, 255, 0.03)',
                          borderRadius: '6px',
                        }}
                      >
                        <span style={{ fontSize: '12px' }}>{s.siteName}</span>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#3b82f6' }}>
                          {s.count} sessions
                        </span>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              </div>
            )}
          </div>

          {/* Right Column - Search & Sessions */}
          <div>
            {/* Search Bar */}
            <div style={{ marginBottom: '16px', display: 'flex', gap: '8px' }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <Search
                  size={14}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'rgba(255, 255, 255, 0.4)',
                  }}
                />
                <GlassInput
                  placeholder="Search sessions by name, operator, notes..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ paddingLeft: '36px', fontSize: '13px' }}
                />
              </div>
              <GlassButton
                variant={showFilters ? 'primary' : 'ghost'}
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter size={14} />
                Filters
                {Object.keys(searchFilters).filter(k => searchFilters[k as keyof SessionSearchFilters]).length > 0 && (
                  <span
                    style={{
                      marginLeft: '4px',
                      padding: '2px 6px',
                      fontSize: '10px',
                      fontWeight: 600,
                      background: '#ff8c00',
                      borderRadius: '10px',
                      color: '#000',
                    }}
                  >
                    {Object.keys(searchFilters).filter(k => searchFilters[k as keyof SessionSearchFilters]).length}
                  </span>
                )}
              </GlassButton>
            </div>

            {/* Filters Panel */}
            {showFilters && (
              <div style={{ marginBottom: '16px' }}>
                <SessionFilters
                  filters={searchFilters}
                  onFiltersChange={setSearchFilters}
                  onClear={handleClearFilters}
                />
              </div>
            )}

            {/* Session List */}
            <div style={sectionStyle}>
              <div style={{ ...sectionHeaderStyle, justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Database size={16} style={{ color: '#ff8c00' }} />
                  Sessions
                  <span style={{ fontSize: '11px', fontWeight: 400, color: 'rgba(255, 255, 255, 0.5)' }}>
                    ({searchResults.length} results)
                  </span>
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {isSearching ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: 'rgba(255, 255, 255, 0.5)' }}>
                    <RefreshCw size={20} className="animate-spin" style={{ marginBottom: '8px' }} />
                    <div>Searching...</div>
                  </div>
                ) : searchResults.length === 0 ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: 'rgba(255, 255, 255, 0.4)' }}>
                    No sessions found matching your criteria
                  </div>
                ) : (
                  searchResults.map(session => (
                    <SessionListItem
                      key={session.id}
                      session={session}
                      onClick={() => navigate(`/session/${session.id}/analysis`)}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
