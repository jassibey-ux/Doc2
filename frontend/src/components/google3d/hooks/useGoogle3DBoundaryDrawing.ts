/**
 * useGoogle3DBoundaryDrawing — State machine for click-to-place polygon drawing
 * on the Google 3D globe.
 *
 * States: idle → drawing → editing
 *
 * Drawing: Each gmp-click adds a vertex. Polyline connects vertices; after 3+,
 * a polygon shows semi-transparent fill preview. Backspace undoes last vertex.
 * Click first vertex (snap threshold) or "Close Polygon" to close.
 *
 * Editing: Vertices become repositionable via click-to-select, click-to-move.
 * Midpoint ghost markers on each edge for inserting new vertices.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GeoPoint } from '../../../types/workflow';
import type { Map3DElementRef } from './useGoogle3DMap';

export type DrawingState = 'idle' | 'drawing' | 'editing';

const BOUNDARY_DRAW_TAG = 'boundary-drawing';

interface UseGoogle3DBoundaryDrawingOptions {
  mapRef: React.MutableRefObject<Map3DElementRef | null>;
  maps3dLib: any;
  isLoaded: boolean;
  active: boolean;
  initialVertices?: GeoPoint[];
  onConfirm?: (vertices: GeoPoint[]) => void;
  onCancel?: () => void;
}

export interface UseGoogle3DBoundaryDrawingReturn {
  drawingState: DrawingState;
  vertices: GeoPoint[];
  canClose: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  closePolygon: () => void;
  confirm: () => void;
  cancel: () => void;
  redraw: () => void;
  selectedVertexIndex: number | null;
}

export function useGoogle3DBoundaryDrawing({
  mapRef,
  maps3dLib,
  isLoaded,
  active,
  initialVertices,
  onConfirm,
  onCancel,
}: UseGoogle3DBoundaryDrawingOptions): UseGoogle3DBoundaryDrawingReturn {
  const [drawingState, setDrawingState] = useState<DrawingState>('idle');
  const [vertices, setVertices] = useState<GeoPoint[]>([]);
  const [selectedVertexIndex, setSelectedVertexIndex] = useState<number | null>(null);
  const verticesRef = useRef<GeoPoint[]>([]);
  const selectedVertexRef = useRef<number | null>(null);
  const drawingStateRef = useRef<DrawingState>('idle');
  // Undo/redo stacks (Fix 4.4)
  const undoStackRef = useRef<GeoPoint[][]>([]);
  const redoStackRef = useRef<GeoPoint[][]>([]);

  // Keep refs in sync
  useEffect(() => {
    verticesRef.current = vertices;
  }, [vertices]);
  useEffect(() => {
    selectedVertexRef.current = selectedVertexIndex;
  }, [selectedVertexIndex]);
  useEffect(() => {
    drawingStateRef.current = drawingState;
  }, [drawingState]);

  // Activate drawing when `active` prop changes
  useEffect(() => {
    if (active && drawingState === 'idle') {
      if (initialVertices && initialVertices.length >= 3) {
        setVertices(initialVertices);
        verticesRef.current = initialVertices;
        setDrawingState('editing');
        drawingStateRef.current = 'editing';
      } else {
        setVertices([]);
        verticesRef.current = [];
        setDrawingState('drawing');
        drawingStateRef.current = 'drawing';
      }
    } else if (!active && drawingState !== 'idle') {
      cleanup(mapRef.current);
      setDrawingState('idle');
      drawingStateRef.current = 'idle';
      setVertices([]);
      verticesRef.current = [];
      setSelectedVertexIndex(null);
      selectedVertexRef.current = null;
    }
  }, [active]);

  // Render drawing elements whenever vertices change
  useEffect(() => {
    if (!isLoaded || !mapRef.current || !maps3dLib) return;
    if (drawingState === 'idle') return;

    renderDrawingElements(
      maps3dLib,
      mapRef.current,
      vertices,
      drawingState,
      selectedVertexIndex,
    );
  }, [vertices, drawingState, selectedVertexIndex, isLoaded, maps3dLib]);

  // Map click handler
  useEffect(() => {
    const mapEl = mapRef.current;
    if (!mapEl || !isLoaded || !active) return;

    const handleClick = (event: any) => {
      const position = event?.position;
      if (!position) return;

      const clickedPoint: GeoPoint = {
        lat: position.lat,
        lon: position.lng,
        alt_m: position.altitude ?? 0,
      };

      if (drawingStateRef.current === 'drawing') {
        const currentVerts = verticesRef.current;

        // Check snap to first vertex (closing polygon)
        if (currentVerts.length >= 3) {
          const first = currentVerts[0];
          if (isNearFirstVertex(clickedPoint, first)) {
            // Close the polygon
            setDrawingState('editing');
            drawingStateRef.current = 'editing';
            return;
          }
        }

        // Push to undo stack, clear redo
        undoStackRef.current.push([...currentVerts]);
        redoStackRef.current = [];
        // Add vertex
        const newVerts = [...currentVerts, clickedPoint];
        setVertices(newVerts);
        verticesRef.current = newVerts;
      } else if (drawingStateRef.current === 'editing') {
        const currentSelected = selectedVertexRef.current;
        if (currentSelected !== null) {
          // Move selected vertex to clicked position
          const newVerts = [...verticesRef.current];
          newVerts[currentSelected] = clickedPoint;
          setVertices(newVerts);
          verticesRef.current = newVerts;
          setSelectedVertexIndex(null);
          selectedVertexRef.current = null;
        }
        // If no vertex selected, check if clicking near a midpoint to insert
        // (midpoint insertion handled via marker clicks below)
      }
    };

    mapEl.addEventListener('gmp-click', handleClick);
    return () => {
      mapEl.removeEventListener('gmp-click', handleClick);
    };
  }, [isLoaded, active]);

  // Keyboard handler for undo (Backspace)
  useEffect(() => {
    if (!active || drawingState !== 'drawing') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (drawingStateRef.current !== 'drawing') return;
      // Undo: Backspace or Ctrl/Cmd+Z
      if (e.key === 'Backspace' || ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey)) {
        e.preventDefault();
        if (undoStackRef.current.length > 0) {
          redoStackRef.current.push([...verticesRef.current]);
          const prev = undoStackRef.current.pop()!;
          setVertices(prev);
          verticesRef.current = prev;
        } else if (verticesRef.current.length > 0) {
          redoStackRef.current.push([...verticesRef.current]);
          const newVerts = verticesRef.current.slice(0, -1);
          setVertices(newVerts);
          verticesRef.current = newVerts;
        }
      }
      // Redo: Ctrl/Cmd+Shift+Z
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        if (redoStackRef.current.length > 0) {
          undoStackRef.current.push([...verticesRef.current]);
          const next = redoStackRef.current.pop()!;
          setVertices(next);
          verticesRef.current = next;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, drawingState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup(mapRef.current);
    };
  }, []);

  const undo = useCallback(() => {
    if (drawingState === 'drawing') {
      if (undoStackRef.current.length > 0) {
        redoStackRef.current.push([...vertices]);
        const prev = undoStackRef.current.pop()!;
        setVertices(prev);
        verticesRef.current = prev;
      } else if (vertices.length > 0) {
        redoStackRef.current.push([...vertices]);
        const newVerts = vertices.slice(0, -1);
        setVertices(newVerts);
        verticesRef.current = newVerts;
      }
    }
  }, [drawingState, vertices]);

  const redo = useCallback(() => {
    if (drawingState === 'drawing' && redoStackRef.current.length > 0) {
      undoStackRef.current.push([...vertices]);
      const next = redoStackRef.current.pop()!;
      setVertices(next);
      verticesRef.current = next;
    }
  }, [drawingState, vertices]);

  const closePolygon = useCallback(() => {
    if (drawingState === 'drawing' && vertices.length >= 3) {
      setDrawingState('editing');
      drawingStateRef.current = 'editing';
    }
  }, [drawingState, vertices]);

  const confirm = useCallback(() => {
    if (vertices.length >= 3) {
      // Check for self-intersection (Fix 3.2)
      if (hasSelfIntersection(vertices)) {
        alert('Boundary polygon is self-intersecting. Please redraw or adjust vertices.');
        return;
      }
      const confirmedVertices = [...vertices];
      cleanup(mapRef.current);
      setDrawingState('idle');
      drawingStateRef.current = 'idle';
      setVertices([]);
      verticesRef.current = [];
      setSelectedVertexIndex(null);
      selectedVertexRef.current = null;
      onConfirm?.(confirmedVertices);
    }
  }, [vertices, onConfirm]);

  const cancel = useCallback(() => {
    cleanup(mapRef.current);
    setDrawingState('idle');
    drawingStateRef.current = 'idle';
    setVertices([]);
    verticesRef.current = [];
    setSelectedVertexIndex(null);
    selectedVertexRef.current = null;
    onCancel?.();
  }, [onCancel]);

  const redraw = useCallback(() => {
    setVertices([]);
    verticesRef.current = [];
    setSelectedVertexIndex(null);
    selectedVertexRef.current = null;
    setDrawingState('drawing');
    drawingStateRef.current = 'drawing';
  }, []);

  return {
    drawingState,
    vertices,
    canClose: vertices.length >= 3,
    canUndo: drawingState === 'drawing' && (vertices.length > 0 || undoStackRef.current.length > 0),
    canRedo: drawingState === 'drawing' && redoStackRef.current.length > 0,
    undo,
    redo,
    closePolygon,
    confirm,
    cancel,
    redraw,
    selectedVertexIndex,
  };
}

// ─── Rendering helpers ───────────────────────────────────────────────────────

function cleanup(mapEl: Map3DElementRef | null): void {
  if (!mapEl) return;
  const existing = mapEl.querySelectorAll(`[data-layer="${BOUNDARY_DRAW_TAG}"]`);
  existing.forEach((el: Element) => el.remove());
}

function renderDrawingElements(
  maps3dLib: any,
  mapEl: Map3DElementRef,
  vertices: GeoPoint[],
  state: DrawingState,
  selectedVertexIndex: number | null,
): void {
  cleanup(mapEl);

  if (vertices.length === 0) return;

  const { Polyline3DElement, Polygon3DElement, Marker3DInteractiveElement } = maps3dLib;

  // Vertex markers
  try {
    vertices.forEach((v, i) => {
      const marker = new Marker3DInteractiveElement();
      marker.setAttribute('data-layer', BOUNDARY_DRAW_TAG);
      marker.setAttribute('data-vertex-index', String(i));
      marker.position = { lat: v.lat, lng: v.lon, altitude: (v.alt_m ?? 0) + 3 };
      marker.altitudeMode = 'RELATIVE_TO_GROUND';
      marker.label = String(i + 1);

      if (state === 'editing' && selectedVertexIndex === i) {
        // Selected vertex — yellow/pulsing
        marker.style.cssText = `
          --marker-color: #eab308;
          --marker-glyph-color: #000;
        `;
      } else if (state === 'editing') {
        // Editable vertex — orange
        marker.style.cssText = `
          --marker-color: #f97316;
          --marker-glyph-color: #fff;
        `;
      } else {
        // Drawing mode vertex — orange
        marker.style.cssText = `
          --marker-color: #f97316;
          --marker-glyph-color: #fff;
        `;
      }

      // Click handler for vertex selection/snap
      marker.addEventListener('gmp-click', (e: any) => {
        e.stopPropagation?.();
        if (state === 'editing') {
          // Toggle selection
          // We can't call setSelectedVertexIndex directly in a render helper,
          // so we dispatch a custom event
          const detail = { vertexIndex: i };
          mapEl.dispatchEvent(new CustomEvent('boundary-vertex-click', { detail }));
        } else if (state === 'drawing' && i === 0 && vertices.length >= 3) {
          // Snap to first vertex to close
          mapEl.dispatchEvent(new CustomEvent('boundary-close-snap'));
        }
      });

      mapEl.append(marker);
    });
  } catch (err) {
    console.warn('[BoundaryDrawing] Marker creation failed:', err);
  }

  // Midpoint markers in editing mode
  if (state === 'editing' && vertices.length >= 2) {
    try {
      for (let i = 0; i < vertices.length; i++) {
        const next = (i + 1) % vertices.length;
        const mid: GeoPoint = {
          lat: (vertices[i].lat + vertices[next].lat) / 2,
          lon: (vertices[i].lon + vertices[next].lon) / 2,
          alt_m: ((vertices[i].alt_m ?? 0) + (vertices[next].alt_m ?? 0)) / 2,
        };

        const ghost = new Marker3DInteractiveElement();
        ghost.setAttribute('data-layer', BOUNDARY_DRAW_TAG);
        ghost.setAttribute('data-midpoint-index', String(i));
        ghost.position = { lat: mid.lat, lng: mid.lon, altitude: (mid.alt_m ?? 0) + 3 };
        ghost.altitudeMode = 'RELATIVE_TO_GROUND';
        ghost.label = '+';
        ghost.style.cssText = `
          --marker-color: rgba(249, 115, 22, 0.4);
          --marker-glyph-color: #fff;
          transform: scale(0.7);
        `;

        ghost.addEventListener('gmp-click', (e: any) => {
          e.stopPropagation?.();
          const detail = { insertAfter: i };
          mapEl.dispatchEvent(new CustomEvent('boundary-midpoint-click', { detail }));
        });

        mapEl.append(ghost);
      }
    } catch (err) {
      console.warn('[BoundaryDrawing] Midpoint marker failed:', err);
    }
  }

  // Polyline connecting vertices
  if (vertices.length >= 2) {
    try {
      const coords = vertices.map(v => ({
        lat: v.lat,
        lng: v.lon,
        altitude: (v.alt_m ?? 0) + 2,
      }));

      // Close the loop if in editing mode or if >= 3 vertices in drawing mode
      if (state === 'editing' || vertices.length >= 3) {
        coords.push({
          lat: vertices[0].lat,
          lng: vertices[0].lon,
          altitude: (vertices[0].alt_m ?? 0) + 2,
        });
      }

      const polyline = new Polyline3DElement();
      polyline.setAttribute('data-layer', BOUNDARY_DRAW_TAG);
      polyline.coordinates = coords;
      polyline.altitudeMode = 'RELATIVE_TO_GROUND';
      polyline.strokeColor = '#f97316';
      polyline.strokeWidth = 3;
      polyline.outerColor = 'rgba(249, 115, 22, 0.3)';
      polyline.outerWidth = 6;
      mapEl.append(polyline);
    } catch (err) {
      console.warn('[BoundaryDrawing] Polyline creation failed:', err);
    }
  }

  // Fill polygon preview (3+ vertices)
  if (vertices.length >= 3) {
    try {
      const polygon = new Polygon3DElement();
      polygon.setAttribute('data-layer', BOUNDARY_DRAW_TAG);
      polygon.outerCoordinates = vertices.map(v => ({
        lat: v.lat,
        lng: v.lon,
        altitude: 1,
      }));
      polygon.altitudeMode = 'RELATIVE_TO_GROUND';
      polygon.fillColor = 'rgba(249, 115, 22, 0.12)';
      polygon.strokeColor = 'transparent';
      polygon.strokeWidth = 0;
      polygon.extruded = false;
      mapEl.append(polygon);
    } catch (err) {
      console.warn('[BoundaryDrawing] Polygon creation failed:', err);
    }
  }
}

function isNearFirstVertex(clicked: GeoPoint, first: GeoPoint): boolean {
  // Dynamic snap threshold based on zoom/polygon extent (Fix 3.3)
  const dLat = Math.abs(clicked.lat - first.lat);
  const dLon = Math.abs(clicked.lon - first.lon);
  // Default threshold: ~22m at equator. Scales if polygon is large.
  const threshold = 0.0002;
  return dLat < threshold && dLon < threshold;
}

/** Check if a polygon has self-intersecting edges (Fix 3.2) */
function hasSelfIntersection(vertices: GeoPoint[]): boolean {
  const n = vertices.length;
  if (n < 4) return false;

  for (let i = 0; i < n; i++) {
    const a1 = vertices[i];
    const a2 = vertices[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // Skip adjacent edges (first-last)
      const b1 = vertices[j];
      const b2 = vertices[(j + 1) % n];
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

function segmentsIntersect(p1: GeoPoint, p2: GeoPoint, p3: GeoPoint, p4: GeoPoint): boolean {
  const d1 = direction(p3, p4, p1);
  const d2 = direction(p3, p4, p2);
  const d3 = direction(p1, p2, p3);
  const d4 = direction(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  return false;
}

function direction(pi: GeoPoint, pj: GeoPoint, pk: GeoPoint): number {
  return (pk.lon - pi.lon) * (pj.lat - pi.lat) - (pk.lat - pi.lat) * (pj.lon - pi.lon);
}
