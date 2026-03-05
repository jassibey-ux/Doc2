import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X } from 'lucide-react';

interface MapSearchBoxProps {
  onFlyTo: (lat: number, lng: number) => void;
}

interface GeoResult {
  formatted_address: string;
  lat: number;
  lng: number;
}

export default function MapSearchBox({ onFlyTo }: MapSearchBoxProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const apiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || '';

  // Click-outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const search = useCallback(async (text: string) => {
    if (!text.trim() || !apiKey) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(text)}&key=${apiKey}`;
      const resp = await fetch(url);
      const data = await resp.json();
      const items: GeoResult[] = (data.results || []).slice(0, 5).map((r: any) => ({
        formatted_address: r.formatted_address,
        lat: r.geometry.location.lat,
        lng: r.geometry.location.lng,
      }));
      setResults(items);
      setOpen(items.length > 0);
    } catch {
      setResults([]);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  const handleInput = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 400);
  };

  const handleSelect = (r: GeoResult) => {
    onFlyTo(r.lat, r.lng);
    setQuery(r.formatted_address);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      (e.target as HTMLInputElement).blur();
    }
    if (e.key === 'Enter' && results.length > 0) {
      handleSelect(results[0]);
    }
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: 60,
        right: 16,
        zIndex: 100,
        width: 280,
        fontFamily: 'inherit',
      }}
    >
      {/* Input */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(15,15,25,0.85)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(100,140,255,0.25)',
          borderRadius: open ? '8px 8px 0 0' : 8,
          padding: '8px 12px',
        }}
      >
        <Search size={14} style={{ color: 'rgba(160,180,255,0.6)', flexShrink: 0 }} />
        <input
          type="text"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search location..."
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#e2e8f0',
            fontSize: 13,
            fontFamily: 'inherit',
          }}
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults([]); setOpen(false); }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              color: 'rgba(160,180,255,0.5)',
              display: 'flex',
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            background: 'rgba(15,15,25,0.92)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(100,140,255,0.25)',
            borderTop: 'none',
            borderRadius: '0 0 8px 8px',
            overflow: 'hidden',
          }}
        >
          {results.map((r, i) => (
            <div
              key={i}
              onClick={() => handleSelect(r)}
              style={{
                padding: '8px 12px',
                fontSize: 12,
                color: '#cbd5e1',
                cursor: 'pointer',
                borderTop: i > 0 ? '1px solid rgba(100,140,255,0.1)' : 'none',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(100,140,255,0.12)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {r.formatted_address}
            </div>
          ))}
        </div>
      )}

      {/* Loading indicator */}
      {loading && (
        <div style={{
          position: 'absolute',
          top: 10,
          right: 40,
          width: 14,
          height: 14,
          border: '2px solid rgba(100,140,255,0.2)',
          borderTopColor: 'rgba(100,140,255,0.7)',
          borderRadius: '50%',
          animation: 'spin 0.6s linear infinite',
        }} />
      )}
    </div>
  );
}
