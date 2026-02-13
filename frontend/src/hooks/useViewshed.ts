/**
 * useViewshed - React hook for terrain viewshed computation and display
 *
 * Communicates with the backend terrain API to compute viewshed (LOS/NLOS)
 * from CUAS positions and returns data for map overlay rendering.
 */

import { useState, useCallback, useRef } from 'react';

export interface ViewshedParams {
  center_lat: number;
  center_lon: number;
  observer_height_m: number;
  radius_m: number;
  target_height_m: number;
  num_radials?: number;
  distance_step_m?: number;
}

export interface ViewshedResult {
  cache_key: string;
  cached: boolean;
  stats: {
    total_cells: number;
    visible_cells: number;
    blocked_cells: number;
    visibility_percent: number;
  };
  bounds: {
    min_lat: number;
    max_lat: number;
    min_lon: number;
    max_lon: number;
  };
  center: { lat: number; lon: number };
  observer_ground_elevation_m: number;
  image_url: string;
  geojson_url: string;
}

export interface ViewshedState {
  loading: boolean;
  error: string | null;
  result: ViewshedResult | null;
  imageUrl: string | null;
  imageBounds: [[number, number], [number, number], [number, number], [number, number]] | null;
}

const API_BASE = '/api/v2';

export function useViewshed() {
  const [state, setState] = useState<ViewshedState>({
    loading: false,
    error: null,
    result: null,
    imageUrl: null,
    imageBounds: null,
  });

  // Abort controller for cancelling in-flight requests
  const abortRef = useRef<AbortController | null>(null);

  const computeViewshed = useCallback(async (params: ViewshedParams) => {
    // Cancel any in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const response = await fetch(`${API_BASE}/terrain/viewshed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          center_lat: params.center_lat,
          center_lon: params.center_lon,
          observer_height_m: params.observer_height_m,
          radius_m: params.radius_m,
          target_height_m: params.target_height_m,
          num_radials: params.num_radials ?? 360,
          distance_step_m: params.distance_step_m ?? 50,
        }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }

      const result: ViewshedResult = await response.json();

      // Build the full image URL for the map overlay
      const imageUrl = `${API_BASE}/terrain/viewshed/${result.cache_key}/image`;

      // Convert bounds to MapLibre image source coordinates format:
      // [[NW_lon, NW_lat], [NE_lon, NE_lat], [SE_lon, SE_lat], [SW_lon, SW_lat]]
      const b = result.bounds;
      const imageBounds: [[number, number], [number, number], [number, number], [number, number]] = [
        [b.min_lon, b.max_lat], // NW
        [b.max_lon, b.max_lat], // NE
        [b.max_lon, b.min_lat], // SE
        [b.min_lon, b.min_lat], // SW
      ];

      setState({
        loading: false,
        error: null,
        result,
        imageUrl,
        imageBounds,
      });

      return result;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return null; // Cancelled, don't update state
      }

      const message = err instanceof Error ? err.message : 'Failed to compute viewshed';
      setState(prev => ({
        ...prev,
        loading: false,
        error: message,
      }));
      return null;
    }
  }, []);

  const clearViewshed = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    setState({
      loading: false,
      error: null,
      result: null,
      imageUrl: null,
      imageBounds: null,
    });
  }, []);

  return {
    ...state,
    computeViewshed,
    clearViewshed,
  };
}

/**
 * Fetch a terrain elevation profile between two points.
 */
export async function fetchTerrainProfile(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  numPoints: number = 100,
): Promise<{
  distances_m: number[];
  elevations_m: number[];
  lats: number[];
  lons: number[];
  total_distance_m: number;
} | null> {
  try {
    const response = await fetch(`${API_BASE}/terrain/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat1,
        lon1,
        lat2,
        lon2,
        num_points: numPoints,
      }),
    });

    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Fetch a single point elevation.
 */
export async function fetchElevation(
  lat: number,
  lon: number,
): Promise<number | null> {
  try {
    const response = await fetch(
      `${API_BASE}/terrain/elevation?lat=${lat}&lon=${lon}`,
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data.elevation_m;
  } catch {
    return null;
  }
}

/**
 * Check line-of-sight between two points.
 */
export async function fetchLOSCheck(
  lat1: number,
  lon1: number,
  height1_m: number,
  lat2: number,
  lon2: number,
  height2_m: number,
): Promise<{
  is_visible: boolean;
  obstruction_distance_m: number | null;
  obstruction_elevation_m: number | null;
  profile: {
    distances_m: number[];
    elevations_m: number[];
    total_distance_m: number;
  };
  los_clearance_m: number[];
} | null> {
  try {
    const response = await fetch(`${API_BASE}/terrain/los-check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat1,
        lon1,
        height1_m,
        lat2,
        lon2,
        height2_m,
      }),
    });

    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}
