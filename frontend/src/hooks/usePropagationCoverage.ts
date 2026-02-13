/**
 * Hook for fetching RF propagation coverage from the API.
 *
 * Fetches the coverage heatmap PNG and geo bounds for map overlay
 * when CUAS placements change.
 */

import { useState, useCallback } from 'react';

interface CUASPlacement {
  lat: number;
  lon: number;
  height_agl_m?: number;
  eirp_dbm?: number;
  frequency_mhz?: number;
  antenna_pattern?: string;
  beam_width_deg?: number;
  orientation_deg?: number;
  min_js_ratio_db?: number;
  name?: string;
}

interface DroneParams {
  c2_frequency_mhz?: number;
  c2_receiver_sensitivity_dbm?: number;
  gps_receiver_type?: string;
  jam_resistance_category?: string;
}

interface CoverageStats {
  total_cells: number;
  effective_cells: number;
  marginal_cells: number;
  ineffective_cells: number;
  effective_pct: number;
  threshold_db: number;
  max_js_db: number;
  grid_size: [number, number];
}

interface CoverageResult {
  imageUrl: string;
  bounds: {
    min_lat: number;
    max_lat: number;
    min_lon: number;
    max_lon: number;
  };
  geoBounds: {
    coordinates: [number, number][];
  };
  stats: CoverageStats;
}

interface LinkBudgetResult {
  distance_m: number;
  path_loss_db: number;
  eirp_dbm: number;
  rx_power_dbm: number;
  js_ratio_db: number;
  gps_denial_effective: boolean;
  terrain_los: boolean;
  fresnel_clearance_pct: number;
  clutter_loss_db: number;
  gps_received_power_dbm: number;
}

const API_BASE = '';

export function usePropagationCoverage() {
  const [coverage, setCoverage] = useState<CoverageResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCoverage = useCallback(
    async (
      centerLat: number,
      centerLon: number,
      cuasPlacements: CUASPlacement[],
      options?: {
        radius_m?: number;
        resolution_m?: number;
        target_height_m?: number;
        environment?: string;
        drone_params?: DroneParams;
      },
    ) => {
      if (cuasPlacements.length === 0) {
        setCoverage(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`${API_BASE}/api/v2/terrain/rf-coverage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            center_lat: centerLat,
            center_lon: centerLon,
            radius_m: options?.radius_m ?? 5000,
            resolution_m: options?.resolution_m ?? 100,
            target_height_m: options?.target_height_m ?? 50,
            environment: options?.environment ?? 'open_field',
            cuas_placements: cuasPlacements,
            drone_params: options?.drone_params ?? null,
          }),
        });

        if (!res.ok) {
          throw new Error(`RF coverage failed: ${res.status}`);
        }

        const data = await res.json();

        setCoverage({
          imageUrl: `${API_BASE}${data.image_url}`,
          bounds: data.bounds,
          geoBounds: data.geo_bounds,
          stats: data.stats,
        });
      } catch (e: any) {
        setError(e.message);
        setCoverage(null);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const clearCoverage = useCallback(() => {
    setCoverage(null);
    setError(null);
  }, []);

  return { coverage, loading, error, fetchCoverage, clearCoverage };
}

export function useLinkBudget() {
  const [result, setResult] = useState<LinkBudgetResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const compute = useCallback(
    async (params: {
      cuas_lat: number;
      cuas_lon: number;
      cuas_height_m?: number;
      cuas_eirp_dbm?: number;
      cuas_frequency_mhz?: number;
      cuas_antenna_pattern?: string;
      cuas_beam_width_deg?: number;
      cuas_orientation_deg?: number;
      cuas_min_js_ratio_db?: number;
      target_lat: number;
      target_lon: number;
      target_height_m?: number;
      environment?: string;
    }) => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`${API_BASE}/api/v2/terrain/link-budget`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });

        if (!res.ok) {
          throw new Error(`Link budget failed: ${res.status}`);
        }

        const data = await res.json();
        setResult(data);
      } catch (e: any) {
        setError(e.message);
        setResult(null);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { result, loading, error, compute };
}
