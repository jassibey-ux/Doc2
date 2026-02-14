/**
 * MapFileDropHandler
 * Wraps map container to accept drag-and-drop GeoJSON/KML files.
 * Shows blue overlay on drag, parses files, calls onLayerImported.
 */

import { useState, useCallback, useRef } from 'react';
import { kml } from '@tmcw/togeojson';

export interface ImportedLayer {
  id: string;
  name: string;
  geojson: GeoJSON.FeatureCollection;
  visible: boolean;
}

interface MapFileDropHandlerProps {
  children: React.ReactNode;
  onLayerImported: (layer: ImportedLayer) => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FEATURES = 10000;

export default function MapFileDropHandler({ children, onLayerImported }: MapFileDropHandlerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCountRef = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current++;
    if (dragCountRef.current === 1) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current--;
    if (dragCountRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const parseGeoJSON = useCallback((text: string, fileName: string): GeoJSON.FeatureCollection | null => {
    try {
      const parsed = JSON.parse(text);
      // Normalize: accept Feature or FeatureCollection
      if (parsed.type === 'FeatureCollection') return parsed;
      if (parsed.type === 'Feature') {
        return { type: 'FeatureCollection', features: [parsed] };
      }
      // Raw geometry
      if (parsed.type && parsed.coordinates) {
        return {
          type: 'FeatureCollection',
          features: [{ type: 'Feature', properties: {}, geometry: parsed }],
        };
      }
      console.warn(`[MapFileDropHandler] "${fileName}" is not valid GeoJSON`);
      return null;
    } catch {
      console.warn(`[MapFileDropHandler] Failed to parse "${fileName}" as JSON`);
      return null;
    }
  }, []);

  const parseKML = useCallback((text: string, fileName: string): GeoJSON.FeatureCollection | null => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/xml');
      const geojson = kml(doc);
      if (geojson && geojson.features.length > 0) return geojson as GeoJSON.FeatureCollection;
      console.warn(`[MapFileDropHandler] "${fileName}" produced no features`);
      return null;
    } catch (err) {
      console.warn(`[MapFileDropHandler] Failed to parse "${fileName}" as KML:`, err);
      return null;
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current = 0;
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        console.warn(`[MapFileDropHandler] "${file.name}" exceeds 10MB limit`);
        continue;
      }

      const ext = file.name.split('.').pop()?.toLowerCase();
      const text = await file.text();
      let geojson: GeoJSON.FeatureCollection | null = null;

      if (ext === 'geojson' || ext === 'json') {
        geojson = parseGeoJSON(text, file.name);
      } else if (ext === 'kml') {
        geojson = parseKML(text, file.name);
      } else {
        console.warn(`[MapFileDropHandler] Unsupported file type: .${ext}`);
        continue;
      }

      if (!geojson) continue;

      if (geojson.features.length > MAX_FEATURES) {
        console.warn(`[MapFileDropHandler] "${file.name}" has ${geojson.features.length} features (max ${MAX_FEATURES})`);
        continue;
      }

      const layer: ImportedLayer = {
        id: `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name.replace(/\.(geojson|json|kml)$/i, ''),
        geojson,
        visible: true,
      };

      onLayerImported(layer);
    }
  }, [onLayerImported, parseGeoJSON, parseKML]);

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%' }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}
      {isDragging && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 2000,
            background: 'rgba(59, 130, 246, 0.15)',
            border: '3px dashed rgba(59, 130, 246, 0.6)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              background: 'rgba(15, 15, 30, 0.9)',
              padding: '16px 32px',
              borderRadius: '12px',
              color: '#60a5fa',
              fontSize: '16px',
              fontWeight: 600,
            }}
          >
            Drop GeoJSON or KML file
          </div>
        </div>
      )}
    </div>
  );
}
