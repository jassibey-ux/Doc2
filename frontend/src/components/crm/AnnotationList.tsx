/**
 * AnnotationList Component
 * Display, add, and edit session annotations
 */

import React, { useState } from 'react';
import { Plus, Edit3, Trash2, MessageSquare, AlertCircle, Lightbulb, Eye } from 'lucide-react';
import { useCRM } from '../../contexts/CRMContext';
import { SessionAnnotation, AnnotationType, ANNOTATION_TYPE_COLORS, ANNOTATION_TYPE_LABELS } from '../../types/crm';
import { GlassButton, GlassCard } from '../ui/GlassUI';

interface AnnotationListProps {
  sessionId: string;
  annotations: SessionAnnotation[];
  onAnnotationsChanged?: () => void;
  readOnly?: boolean;
  compact?: boolean;
}

// Icons for each annotation type
const ANNOTATION_ICONS: Record<AnnotationType, React.ReactNode> = {
  note: <MessageSquare size={12} />,
  observation: <Eye size={12} />,
  issue: <AlertCircle size={12} />,
  recommendation: <Lightbulb size={12} />,
};

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function AnnotationList({
  sessionId,
  annotations,
  onAnnotationsChanged,
  readOnly = false,
  compact = false,
}: AnnotationListProps) {
  const { addAnnotation, updateAnnotation, removeAnnotation } = useCRM();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newType, setNewType] = useState<AnnotationType>('note');
  const [isAdding, setIsAdding] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const handleAdd = async () => {
    if (!newContent.trim()) return;
    setIsAdding(true);
    try {
      const result = await addAnnotation(sessionId, newContent.trim(), newType);
      if (result) {
        setNewContent('');
        setNewType('note');
        setShowAddForm(false);
        onAnnotationsChanged?.();
      }
    } finally {
      setIsAdding(false);
    }
  };

  const handleUpdate = async (annotationId: string) => {
    if (!editContent.trim()) return;
    const result = await updateAnnotation(sessionId, annotationId, editContent.trim());
    if (result) {
      setEditingId(null);
      setEditContent('');
      onAnnotationsChanged?.();
    }
  };

  const handleDelete = async (annotationId: string) => {
    const success = await removeAnnotation(sessionId, annotationId);
    if (success) {
      onAnnotationsChanged?.();
    }
  };

  const startEdit = (annotation: SessionAnnotation) => {
    setEditingId(annotation.id);
    setEditContent(annotation.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditContent('');
  };

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: compact ? '8px' : '12px',
  };

  const annotationCardStyle: React.CSSProperties = {
    padding: compact ? '8px 10px' : '12px 14px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '8px',
  };

  const badgeStyle = (type: AnnotationType): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 6px',
    fontSize: '10px',
    fontWeight: 500,
    background: `${ANNOTATION_TYPE_COLORS[type]}20`,
    border: `1px solid ${ANNOTATION_TYPE_COLORS[type]}40`,
    borderRadius: '4px',
    color: ANNOTATION_TYPE_COLORS[type],
  });

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: compact ? '6px' : '8px',
  };

  const contentStyle: React.CSSProperties = {
    fontSize: compact ? '12px' : '13px',
    color: 'rgba(255, 255, 255, 0.85)',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
  };

  const actionsStyle: React.CSSProperties = {
    display: 'flex',
    gap: '4px',
  };

  const actionButtonStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    padding: '4px',
    cursor: 'pointer',
    color: 'rgba(255, 255, 255, 0.4)',
    borderRadius: '4px',
    transition: 'all 0.15s',
  };

  const textareaStyle: React.CSSProperties = {
    width: '100%',
    minHeight: '60px',
    padding: '8px 10px',
    fontSize: '12px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '6px',
    color: '#fff',
    resize: 'vertical',
    fontFamily: 'inherit',
    outline: 'none',
  };

  const selectStyle: React.CSSProperties = {
    padding: '6px 10px',
    fontSize: '12px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '6px',
    color: '#fff',
    outline: 'none',
    cursor: 'pointer',
  };

  return (
    <div style={containerStyle}>
      {/* Annotations List */}
      {annotations.length === 0 && readOnly && (
        <div style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '12px', fontStyle: 'italic' }}>
          No annotations
        </div>
      )}

      {annotations.map(annotation => (
        <div key={annotation.id} style={annotationCardStyle}>
          <div style={headerStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={badgeStyle(annotation.type)}>
                {ANNOTATION_ICONS[annotation.type]}
                {ANNOTATION_TYPE_LABELS[annotation.type]}
              </span>
              <span style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.4)' }}>
                {formatRelativeTime(annotation.created_at)}
              </span>
              {annotation.author && (
                <span style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.5)' }}>
                  by {annotation.author}
                </span>
              )}
            </div>

            {!readOnly && editingId !== annotation.id && (
              <div style={actionsStyle}>
                <button
                  style={actionButtonStyle}
                  onClick={() => startEdit(annotation)}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                    e.currentTarget.style.color = '#fff';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'none';
                    e.currentTarget.style.color = 'rgba(255, 255, 255, 0.4)';
                  }}
                  title="Edit"
                >
                  <Edit3 size={14} />
                </button>
                <button
                  style={actionButtonStyle}
                  onClick={() => handleDelete(annotation.id)}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                    e.currentTarget.style.color = '#ef4444';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'none';
                    e.currentTarget.style.color = 'rgba(255, 255, 255, 0.4)';
                  }}
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>

          {editingId === annotation.id ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <textarea
                style={textareaStyle}
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                autoFocus
              />
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <GlassButton variant="ghost" size="sm" onClick={cancelEdit}>
                  Cancel
                </GlassButton>
                <GlassButton variant="primary" size="sm" onClick={() => handleUpdate(annotation.id)}>
                  Save
                </GlassButton>
              </div>
            </div>
          ) : (
            <div style={contentStyle}>{annotation.content}</div>
          )}
        </div>
      ))}

      {/* Add New Annotation */}
      {!readOnly && (
        <>
          {showAddForm ? (
            <GlassCard style={{ padding: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <select
                    style={selectStyle}
                    value={newType}
                    onChange={e => setNewType(e.target.value as AnnotationType)}
                  >
                    <option value="note">Note</option>
                    <option value="observation">Observation</option>
                    <option value="issue">Issue</option>
                    <option value="recommendation">Recommendation</option>
                  </select>
                  <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)' }}>
                    {newType === 'note' && 'General notes or comments'}
                    {newType === 'observation' && 'Observations during test'}
                    {newType === 'issue' && 'Problems or concerns'}
                    {newType === 'recommendation' && 'Suggested actions or improvements'}
                  </span>
                </div>

                <textarea
                  style={textareaStyle}
                  placeholder="Enter annotation content..."
                  value={newContent}
                  onChange={e => setNewContent(e.target.value)}
                  autoFocus
                />

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <GlassButton
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowAddForm(false);
                      setNewContent('');
                      setNewType('note');
                    }}
                  >
                    Cancel
                  </GlassButton>
                  <GlassButton
                    variant="primary"
                    size="sm"
                    onClick={handleAdd}
                    disabled={isAdding || !newContent.trim()}
                  >
                    <Plus size={14} />
                    Add Annotation
                  </GlassButton>
                </div>
              </div>
            </GlassCard>
          ) : (
            <GlassButton
              variant="ghost"
              size="sm"
              onClick={() => setShowAddForm(true)}
              style={{ alignSelf: 'flex-start' }}
            >
              <Plus size={14} />
              Add Annotation
            </GlassButton>
          )}
        </>
      )}
    </div>
  );
}
