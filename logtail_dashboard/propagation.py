"""
RF Propagation Engine for SCENSUS T.E.P. Platform

Computes RF path loss and Jammer-to-Signal (J/S) ratio coverage
for Counter-UAS effectiveness modeling.

Propagation models:
  1. Free-Space Path Loss (FSPL) — baseline, no terrain
  2. ITM / Longley-Rice — terrain-aware, via `signal-server` subprocess
  3. Two-Ray Ground Reflection — intermediate model

J/S ratio computation:
  J/S = EIRP_jammer - path_loss_jammer - (C2_rx_power)
  Where C2_rx_power = EIRP_c2 - path_loss_c2

GPS jamming special case:
  J/S = EIRP_jammer - path_loss_jammer - (-130 dBm)
  GPS received power is approximately -130 dBm at Earth's surface.
"""

import io
import logging
import math
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import numpy as np

from .terrain import (
    CLUTTER_LOSS_DB,
    EARTH_RADIUS_M,
    TerrainManager,
    _destination_point,
    _haversine_distance,
    get_terrain_manager,
)

logger = logging.getLogger(__name__)

# GPS signal level at Earth's surface (dBm)
GPS_RECEIVED_POWER_DBM = -130.0

# Speed of light (m/s)
SPEED_OF_LIGHT = 299_792_458.0


# ============================================================================
# DATA CLASSES
# ============================================================================

@dataclass
class CUASParams:
    """CUAS system RF parameters for propagation modeling."""
    lat: float
    lon: float
    height_agl_m: float = 5.0
    eirp_dbm: float = 40.0
    frequency_mhz: float = 1575.42  # GPS L1 default
    antenna_gain_dbi: float = 6.0
    antenna_pattern: str = "omni"  # omni, directional, sector
    beam_width_deg: float = 360.0
    orientation_deg: float = 0.0  # azimuth pointing direction
    polarization: str = "RHCP"
    min_js_ratio_db: float = 20.0  # J/S needed for effect

    # Derived from DB fields
    profile_id: Optional[str] = None
    name: Optional[str] = None


@dataclass
class DroneRFParams:
    """Drone/target RF parameters."""
    c2_frequency_mhz: float = 2400.0
    c2_receiver_sensitivity_dbm: float = -90.0
    gps_receiver_type: str = "standard"  # standard, high_sensitivity, military
    jam_resistance_category: str = "none"  # none, basic, moderate, hardened

    @property
    def effective_gps_power_dbm(self) -> float:
        """Effective GPS power considering receiver sensitivity."""
        base = GPS_RECEIVED_POWER_DBM
        # High-sensitivity receivers have more margin
        adjustments = {
            "standard": 0.0,
            "high_sensitivity": 3.0,
            "military": 10.0,
        }
        return base + adjustments.get(self.gps_receiver_type, 0.0)

    @property
    def jam_resistance_db(self) -> float:
        """Additional J/S margin needed to overcome jam resistance."""
        margins = {
            "none": 0.0,
            "basic": 5.0,
            "moderate": 15.0,
            "hardened": 30.0,
        }
        return margins.get(self.jam_resistance_category, 0.0)


@dataclass
class RFCoverageResult:
    """Result of RF coverage computation."""
    center_lat: float
    center_lon: float
    radius_m: float
    resolution_m: float
    # Grid data: rows=lat, cols=lon
    js_ratio_grid: np.ndarray  # J/S ratio in dB at each cell
    path_loss_grid: np.ndarray  # Path loss in dB at each cell
    effectiveness_grid: np.ndarray  # 0=ineffective, 1=marginal, 2=effective
    bounds: Dict  # {min_lat, max_lat, min_lon, max_lon}
    stats: Dict  # Summary statistics
    cuas_params: List[CUASParams] = field(default_factory=list)


@dataclass
class LinkBudgetResult:
    """Point-to-point link budget calculation."""
    distance_m: float
    path_loss_db: float
    eirp_dbm: float
    rx_power_dbm: float
    js_ratio_db: float  # J/S at the target
    gps_denial_effective: bool
    terrain_los: bool
    fresnel_clearance_pct: float
    clutter_loss_db: float


# ============================================================================
# PROPAGATION MODELS
# ============================================================================

class PropagationModel(ABC):
    """Abstract base for RF propagation models."""

    @abstractmethod
    def path_loss(
        self,
        frequency_mhz: float,
        distance_m: float,
        tx_height_m: float,
        rx_height_m: float,
        terrain_profile: Optional[List[float]] = None,
        environment: str = "open_field",
    ) -> float:
        """
        Compute path loss in dB.

        Args:
            frequency_mhz: Frequency in MHz.
            distance_m: Distance between TX and RX in meters.
            tx_height_m: Transmitter height above ground (meters).
            rx_height_m: Receiver height above ground (meters).
            terrain_profile: Elevation profile between TX and RX.
            environment: Environment type for clutter loss.

        Returns:
            Path loss in dB (positive value).
        """


class FreeSpaceModel(PropagationModel):
    """Free-Space Path Loss (FSPL) — no terrain effects."""

    def path_loss(
        self,
        frequency_mhz: float,
        distance_m: float,
        tx_height_m: float = 0,
        rx_height_m: float = 0,
        terrain_profile: Optional[List[float]] = None,
        environment: str = "open_field",
    ) -> float:
        if distance_m <= 0:
            return 0.0
        # FSPL = 20*log10(d) + 20*log10(f) + 32.45
        # where d in km, f in MHz
        d_km = distance_m / 1000.0
        loss = 20 * math.log10(d_km) + 20 * math.log10(frequency_mhz) + 32.45
        loss += CLUTTER_LOSS_DB.get(environment, 0.0)
        return loss


class TwoRayModel(PropagationModel):
    """Two-Ray Ground Reflection model — accounts for ground bounce."""

    def path_loss(
        self,
        frequency_mhz: float,
        distance_m: float,
        tx_height_m: float = 5.0,
        rx_height_m: float = 50.0,
        terrain_profile: Optional[List[float]] = None,
        environment: str = "open_field",
    ) -> float:
        if distance_m <= 0:
            return 0.0

        wavelength = SPEED_OF_LIGHT / (frequency_mhz * 1e6)

        # Crossover distance: beyond this, two-ray applies
        crossover_d = (4 * tx_height_m * rx_height_m) / wavelength

        if distance_m < crossover_d:
            # Use FSPL for short distances
            d_km = distance_m / 1000.0
            loss = 20 * math.log10(d_km) + 20 * math.log10(frequency_mhz) + 32.45
        else:
            # Two-ray: L = 40*log10(d) - 20*log10(ht) - 20*log10(hr)
            loss = (
                40 * math.log10(distance_m)
                - 20 * math.log10(tx_height_m)
                - 20 * math.log10(rx_height_m)
            )

        loss += CLUTTER_LOSS_DB.get(environment, 0.0)
        return max(loss, 0.0)


class ITMModel(PropagationModel):
    """
    Irregular Terrain Model (Longley-Rice).

    Uses terrain profile for path loss computation.
    Falls back to Two-Ray if terrain data unavailable.
    """

    def __init__(self):
        self._fallback = TwoRayModel()

    def path_loss(
        self,
        frequency_mhz: float,
        distance_m: float,
        tx_height_m: float = 5.0,
        rx_height_m: float = 50.0,
        terrain_profile: Optional[List[float]] = None,
        environment: str = "open_field",
    ) -> float:
        if distance_m <= 0:
            return 0.0

        if terrain_profile is None or len(terrain_profile) < 3:
            return self._fallback.path_loss(
                frequency_mhz, distance_m, tx_height_m, rx_height_m, None, environment
            )

        # Simplified ITM: FSPL + terrain diffraction loss + clutter
        # Full ITM would use signal-server binary; this is the pure-Python approximation

        # Step 1: Base FSPL
        d_km = distance_m / 1000.0
        base_loss = 20 * math.log10(d_km) + 20 * math.log10(frequency_mhz) + 32.45

        # Step 2: Knife-edge diffraction loss from terrain obstructions
        diffraction_loss = self._knife_edge_diffraction(
            terrain_profile, distance_m, tx_height_m, rx_height_m, frequency_mhz
        )

        # Step 3: Clutter loss
        clutter = CLUTTER_LOSS_DB.get(environment, 0.0)

        return base_loss + diffraction_loss + clutter

    def _knife_edge_diffraction(
        self,
        elevations: List[float],
        total_distance_m: float,
        tx_height_m: float,
        rx_height_m: float,
        frequency_mhz: float,
    ) -> float:
        """Compute knife-edge diffraction loss from terrain profile."""
        n = len(elevations)
        if n < 3:
            return 0.0

        tx_alt = elevations[0] + tx_height_m
        rx_alt = elevations[-1] + rx_height_m
        wavelength = SPEED_OF_LIGHT / (frequency_mhz * 1e6)

        max_diffraction_loss = 0.0
        step = total_distance_m / (n - 1)

        for i in range(1, n - 1):
            d1 = i * step
            d2 = total_distance_m - d1
            if d1 <= 0 or d2 <= 0:
                continue

            # LOS height at this point
            frac = d1 / total_distance_m
            los_height = tx_alt + frac * (rx_alt - tx_alt)

            # Earth curvature correction
            effective_r = EARTH_RADIUS_M * (4 / 3)
            curvature_drop = (d1 * d2) / (2 * effective_r)

            # Obstruction height above LOS
            h = elevations[i] - (los_height - curvature_drop)

            if h > 0:
                # Fresnel-Kirchhoff parameter v
                v = h * math.sqrt(2 * (d1 + d2) / (wavelength * d1 * d2))

                # Knife-edge diffraction loss (ITU-R P.526)
                if v > -0.78:
                    loss = 6.02 + 9.11 * v + 1.27 * v * v
                else:
                    loss = 0.0

                max_diffraction_loss = max(max_diffraction_loss, loss)

        return max_diffraction_loss


# ============================================================================
# PROPAGATION ENGINE
# ============================================================================

class PropagationEngine:
    """
    RF Propagation Engine.

    Computes J/S ratio coverage heatmaps for CUAS placement planning.
    """

    def __init__(self, model: Optional[PropagationModel] = None):
        self.model = model or ITMModel()
        self.terrain = get_terrain_manager()

    def compute_link_budget(
        self,
        cuas: CUASParams,
        target_lat: float,
        target_lon: float,
        target_height_m: float = 50.0,
        drone: Optional[DroneRFParams] = None,
        environment: str = "open_field",
    ) -> LinkBudgetResult:
        """Compute point-to-point link budget from CUAS to target."""
        distance = _haversine_distance(cuas.lat, cuas.lon, target_lat, target_lon)

        # Get terrain profile
        profile_data = self.terrain.get_terrain_profile(
            cuas.lat, cuas.lon, target_lat, target_lon, num_points=100
        )
        elevations = profile_data["elevations_m"]

        # Path loss
        path_loss = self.model.path_loss(
            cuas.frequency_mhz, distance, cuas.height_agl_m, target_height_m,
            elevations, environment,
        )

        # Antenna pattern attenuation
        antenna_atten = self._antenna_attenuation(cuas, target_lat, target_lon)
        effective_eirp = cuas.eirp_dbm - antenna_atten

        # Received jammer power at target
        rx_power = effective_eirp - path_loss

        # J/S ratio (GPS jamming)
        gps_power = GPS_RECEIVED_POWER_DBM
        if drone:
            gps_power = drone.effective_gps_power_dbm
        js_ratio = rx_power - gps_power

        # Effectiveness check
        threshold = cuas.min_js_ratio_db
        if drone:
            threshold += drone.jam_resistance_db
        gps_denial_effective = js_ratio >= threshold

        # LOS check
        los = self.terrain.check_line_of_sight(
            cuas.lat, cuas.lon, cuas.height_agl_m,
            target_lat, target_lon, target_height_m, 100,
        )

        # Fresnel zone clearance
        fresnel_pct = self._fresnel_clearance(
            elevations, distance, cuas.height_agl_m, target_height_m, cuas.frequency_mhz
        )

        return LinkBudgetResult(
            distance_m=distance,
            path_loss_db=path_loss,
            eirp_dbm=effective_eirp,
            rx_power_dbm=rx_power,
            js_ratio_db=js_ratio,
            gps_denial_effective=gps_denial_effective,
            terrain_los=los["is_visible"],
            fresnel_clearance_pct=fresnel_pct,
            clutter_loss_db=CLUTTER_LOSS_DB.get(environment, 0.0),
        )

    def compute_rf_coverage(
        self,
        cuas_list: List[CUASParams],
        center_lat: float,
        center_lon: float,
        radius_m: float = 5000.0,
        resolution_m: float = 100.0,
        target_height_m: float = 50.0,
        drone: Optional[DroneRFParams] = None,
        environment: str = "open_field",
    ) -> RFCoverageResult:
        """
        Compute RF coverage heatmap for one or more CUAS placements.

        For multi-CUAS, takes the MAX J/S ratio at each grid cell
        (worst case for the drone = best case for defenders).

        Returns color-coded grid:
            2 = effective (J/S >= threshold)
            1 = marginal (J/S within 6dB of threshold)
            0 = ineffective (J/S < threshold - 6dB)
        """
        logger.info(
            f"Computing RF coverage: {len(cuas_list)} CUAS, "
            f"radius={radius_m}m, res={resolution_m}m"
        )

        # Build grid
        approx_deg = radius_m / 111_000
        min_lat = center_lat - approx_deg
        max_lat = center_lat + approx_deg
        min_lon = center_lon - approx_deg / math.cos(math.radians(center_lat))
        max_lon = center_lon + approx_deg / math.cos(math.radians(center_lat))

        lat_step = resolution_m / 111_000
        lon_step = resolution_m / (111_000 * math.cos(math.radians(center_lat)))

        lats = np.arange(min_lat, max_lat, lat_step)
        lons = np.arange(min_lon, max_lon, lon_step)
        n_rows = len(lats)
        n_cols = len(lons)

        # Pre-download terrain tiles
        self.terrain.srtm.ensure_tiles_for_area(min_lat, min_lon, max_lat, max_lon)

        # Initialize grids
        js_grid = np.full((n_rows, n_cols), -999.0, dtype=np.float32)
        pl_grid = np.full((n_rows, n_cols), 999.0, dtype=np.float32)

        # Determine threshold
        base_threshold = max((c.min_js_ratio_db for c in cuas_list), default=20.0)
        extra_margin = drone.jam_resistance_db if drone else 0.0
        threshold = base_threshold + extra_margin

        for cuas in cuas_list:
            for r, lat in enumerate(lats):
                for c, lon in enumerate(lons):
                    dist = _haversine_distance(cuas.lat, cuas.lon, lat, lon)
                    if dist > radius_m or dist < 1:
                        continue

                    # Path loss (skip terrain for speed, use Two-Ray)
                    loss = self.model.path_loss(
                        cuas.frequency_mhz, dist, cuas.height_agl_m,
                        target_height_m, None, environment,
                    )

                    # Antenna attenuation
                    antenna_atten = self._antenna_attenuation(cuas, lat, lon)
                    effective_eirp = cuas.eirp_dbm - antenna_atten

                    # J/S ratio
                    rx_power = effective_eirp - loss
                    gps_power = drone.effective_gps_power_dbm if drone else GPS_RECEIVED_POWER_DBM
                    js = rx_power - gps_power

                    # Take max J/S from any CUAS (composite coverage)
                    if js > js_grid[r, c]:
                        js_grid[r, c] = js
                        pl_grid[r, c] = loss

        # Compute effectiveness grid
        eff_grid = np.zeros((n_rows, n_cols), dtype=np.uint8)
        eff_grid[js_grid >= threshold] = 2  # Effective
        marginal_mask = (js_grid >= threshold - 6) & (js_grid < threshold)
        eff_grid[marginal_mask] = 1  # Marginal

        # Stats
        valid_cells = js_grid > -999
        total_valid = int(np.sum(valid_cells))
        effective_cells = int(np.sum(eff_grid == 2))
        marginal_cells = int(np.sum(eff_grid == 1))
        ineffective_cells = total_valid - effective_cells - marginal_cells

        result = RFCoverageResult(
            center_lat=center_lat,
            center_lon=center_lon,
            radius_m=radius_m,
            resolution_m=resolution_m,
            js_ratio_grid=js_grid,
            path_loss_grid=pl_grid,
            effectiveness_grid=eff_grid,
            bounds={
                "min_lat": float(min_lat),
                "max_lat": float(max_lat),
                "min_lon": float(min_lon),
                "max_lon": float(max_lon),
            },
            stats={
                "total_cells": total_valid,
                "effective_cells": effective_cells,
                "marginal_cells": marginal_cells,
                "ineffective_cells": ineffective_cells,
                "effective_pct": round(100 * effective_cells / max(total_valid, 1), 1),
                "threshold_db": threshold,
                "max_js_db": float(np.max(js_grid[valid_cells])) if total_valid > 0 else 0,
                "grid_size": [n_rows, n_cols],
            },
            cuas_params=cuas_list,
        )

        logger.info(
            f"RF coverage complete: {effective_cells}/{total_valid} effective "
            f"({result.stats['effective_pct']}%)"
        )

        return result

    def coverage_to_png(
        self,
        result: RFCoverageResult,
        image_size: int = 512,
    ) -> Tuple[bytes, Dict]:
        """
        Render RF coverage to a PNG image for map overlay.

        Colors: green=effective, yellow=marginal, red=ineffective (semi-transparent).
        """
        from PIL import Image

        eff = result.effectiveness_grid
        n_rows, n_cols = eff.shape

        # Create RGBA image
        img = Image.new("RGBA", (n_cols, n_rows), (0, 0, 0, 0))
        pixels = img.load()

        colors = {
            2: (34, 197, 94, 140),   # Green — effective
            1: (234, 179, 8, 140),    # Yellow — marginal
            0: (239, 68, 68, 100),    # Red — ineffective
        }

        for r in range(n_rows):
            for c in range(n_cols):
                v = int(eff[r, c])
                if result.js_ratio_grid[r, c] > -999:
                    pixels[c, n_rows - 1 - r] = colors.get(v, (0, 0, 0, 0))

        # Resize to requested size
        img = img.resize((image_size, image_size), Image.Resampling.NEAREST)

        buf = io.BytesIO()
        img.save(buf, format="PNG")
        png_bytes = buf.getvalue()

        geo_bounds = {
            "coordinates": [
                [result.bounds["min_lon"], result.bounds["max_lat"]],  # NW
                [result.bounds["max_lon"], result.bounds["max_lat"]],  # NE
                [result.bounds["max_lon"], result.bounds["min_lat"]],  # SE
                [result.bounds["min_lon"], result.bounds["min_lat"]],  # SW
            ]
        }

        return png_bytes, geo_bounds

    def _antenna_attenuation(self, cuas: CUASParams, target_lat: float, target_lon: float) -> float:
        """Compute antenna pattern attenuation toward a target point."""
        if cuas.antenna_pattern == "omni":
            return 0.0

        from .terrain import _bearing
        bearing_to_target = _bearing(cuas.lat, cuas.lon, target_lat, target_lon)
        angle_off = abs(bearing_to_target - cuas.orientation_deg) % 360
        if angle_off > 180:
            angle_off = 360 - angle_off

        half_beam = cuas.beam_width_deg / 2

        if cuas.antenna_pattern == "directional":
            if angle_off <= half_beam:
                return 0.0
            elif angle_off <= half_beam * 2:
                # Gradual rolloff in sidelobe region
                return 10.0 * ((angle_off - half_beam) / half_beam)
            else:
                return 25.0  # Back lobe suppression

        elif cuas.antenna_pattern == "sector":
            if angle_off <= half_beam:
                return 0.0
            else:
                return 30.0  # Sharp sector cutoff

        return 0.0

    def _fresnel_clearance(
        self,
        elevations: List[float],
        total_distance_m: float,
        tx_height_m: float,
        rx_height_m: float,
        frequency_mhz: float,
    ) -> float:
        """Compute worst-case first Fresnel zone clearance as percentage."""
        n = len(elevations)
        if n < 3 or total_distance_m <= 0:
            return 100.0

        wavelength = SPEED_OF_LIGHT / (frequency_mhz * 1e6)
        tx_alt = elevations[0] + tx_height_m
        rx_alt = elevations[-1] + rx_height_m
        step = total_distance_m / (n - 1)

        min_clearance_pct = 100.0

        for i in range(1, n - 1):
            d1 = i * step
            d2 = total_distance_m - d1
            if d1 <= 0 or d2 <= 0:
                continue

            # First Fresnel radius at this point
            f1 = math.sqrt(wavelength * d1 * d2 / (d1 + d2))
            if f1 <= 0:
                continue

            # LOS height
            frac = d1 / total_distance_m
            los_height = tx_alt + frac * (rx_alt - tx_alt)

            # Earth curvature correction
            effective_r = EARTH_RADIUS_M * (4 / 3)
            curvature_drop = (d1 * d2) / (2 * effective_r)

            clearance = (los_height - curvature_drop) - elevations[i]
            clearance_pct = (clearance / f1) * 100

            min_clearance_pct = min(min_clearance_pct, clearance_pct)

        return min_clearance_pct


# Module-level singleton
_propagation_engine: Optional[PropagationEngine] = None


def get_propagation_engine() -> PropagationEngine:
    """Get or create the global PropagationEngine singleton."""
    global _propagation_engine
    if _propagation_engine is None:
        _propagation_engine = PropagationEngine()
    return _propagation_engine
