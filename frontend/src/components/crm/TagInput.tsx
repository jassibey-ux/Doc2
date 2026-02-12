/**
 * TagInput Component
 * Reusable tag editor with autocomplete from existing tags
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
// Note: useRef is still used for containerRef (click-outside handling)
import { X, Tag as TagIcon, Plus } from 'lucide-react';
import { useCRM } from '../../contexts/CRMContext';
import { GlassInput } from '../ui/GlassUI';

interface TagInputProps {
  sessionId: string;
  tags: string[];
  onTagsChanged?: (tags: string[]) => void;
  readOnly?: boolean;
  compact?: boolean;
}

export default function TagInput({
  sessionId,
  tags,
  onTagsChanged,
  readOnly = false,
  compact = false,
}: TagInputProps) {
  const { allTags, loadAllTags, addTag, removeTag } = useCRM();
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load all tags on mount for autocomplete
  useEffect(() => {
    if (allTags.length === 0) {
      loadAllTags();
    }
  }, [allTags.length, loadAllTags]);

  // Close suggestions on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter suggestions based on input
  const suggestions = useMemo(() => {
    if (!inputValue.trim()) return allTags.slice(0, 8);
    const query = inputValue.toLowerCase();
    return allTags
      .filter(t => t.tag.toLowerCase().includes(query) && !tags.includes(t.tag))
      .slice(0, 8);
  }, [inputValue, allTags, tags]);

  const handleAddTag = async (tag: string) => {
    const normalizedTag = tag.trim().toLowerCase();
    if (!normalizedTag || tags.includes(normalizedTag)) return;

    setIsAdding(true);
    try {
      const newTags = await addTag(sessionId, normalizedTag);
      if (newTags) {
        onTagsChanged?.(newTags);
      }
    } finally {
      setIsAdding(false);
      setInputValue('');
      setShowSuggestions(false);
    }
  };

  const handleRemoveTag = async (tag: string) => {
    const newTags = await removeTag(sessionId, tag);
    if (newTags) {
      onTagsChanged?.(newTags);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      handleAddTag(inputValue);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setInputValue('');
    }
  };

  const tagBadgeStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: compact ? '2px 6px' : '4px 8px',
    fontSize: compact ? '10px' : '11px',
    fontWeight: 500,
    background: 'rgba(255, 140, 0, 0.2)',
    border: '1px solid rgba(255, 140, 0, 0.4)',
    borderRadius: '4px',
    color: '#ff8c00',
    whiteSpace: 'nowrap',
  };

  const removeButtonStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    padding: '0',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    color: 'rgba(255, 140, 0, 0.7)',
    transition: 'color 0.2s',
  };

  const suggestionsStyle: React.CSSProperties = {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: '4px',
    background: 'rgba(30, 30, 45, 0.98)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
    overflow: 'hidden',
    zIndex: 100,
    maxHeight: '200px',
    overflowY: 'auto',
  };

  const suggestionItemStyle: React.CSSProperties = {
    padding: '8px 12px',
    fontSize: '12px',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    transition: 'background 0.15s',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Current Tags */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: readOnly ? 0 : '8px' }}>
        {tags.length === 0 && readOnly && (
          <span style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '12px', fontStyle: 'italic' }}>
            No tags
          </span>
        )}
        {tags.map(tag => (
          <span key={tag} style={tagBadgeStyle}>
            <TagIcon size={compact ? 10 : 12} />
            {tag}
            {!readOnly && (
              <button
                style={removeButtonStyle}
                onClick={() => handleRemoveTag(tag)}
                onMouseEnter={e => (e.currentTarget.style.color = '#ff8c00')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255, 140, 0, 0.7)')}
                title="Remove tag"
              >
                <X size={compact ? 10 : 12} />
              </button>
            )}
          </span>
        ))}
      </div>

      {/* Add Tag Input */}
      {!readOnly && (
        <div style={{ position: 'relative', display: 'flex', gap: '8px' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <GlassInput
              type="text"
              placeholder="Add tag..."
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setShowSuggestions(true)}
              disabled={isAdding}
              style={{ fontSize: '12px', padding: '6px 10px' }}
            />

            {/* Suggestions Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div style={suggestionsStyle}>
                {suggestions.map(s => (
                  <div
                    key={s.tag}
                    style={suggestionItemStyle}
                    onClick={() => handleAddTag(s.tag)}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255, 140, 0, 0.1)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <TagIcon size={12} style={{ color: '#ff8c00' }} />
                      {s.tag}
                    </span>
                    <span style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '10px' }}>
                      {s.count} sessions
                    </span>
                  </div>
                ))}
                {inputValue.trim() && !suggestions.find(s => s.tag === inputValue.toLowerCase()) && (
                  <div
                    style={{
                      ...suggestionItemStyle,
                      color: '#ff8c00',
                      borderBottom: 'none',
                    }}
                    onClick={() => handleAddTag(inputValue)}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255, 140, 0, 0.1)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Plus size={12} />
                      Create "{inputValue.trim().toLowerCase()}"
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
