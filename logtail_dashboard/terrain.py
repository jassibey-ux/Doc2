"""
Terrain Data Manager for SCENSUS T.E.P. Platform

Handles DEM (Digital Elevation Model) data acquisition, caching, and
geospatial computations including:
- Elevation queries
- Terrain profile extraction
- Viewshed (LOS/NLOS) computation

DEM Data Hierarchy:
1. USGS 3DEP 10m (US sites) - Cloud Optimized GeoTIFF via TNM API
2. Copernicus GLO-30 (global) - AWS open data
3. SRTM GL1 30m (global fallback) - AWS S3

Uses rasterio for all DEM operations (tile boundaries, voids, interpolation).
"""

import hashlib
import logging
import math
import ssl
import struct
import tempfile
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from urllib.request import urlopen, Request
from urllib.error import URLError

import numpy as np

logger = logging.getLogger(__name__)

# Default cache location
DEFAULT_CACHE_DIR = Path.home() / ".scensus" / "terrain_cache"

# SRTM tile size
SRTM_TILE_SIZE = 3601  # 1 arc-second tiles are 3601x3601

# Earth radius in meters (WGS-84 mean)
EARTH_RADIUS_M = 6_371_000.0

# Clutter loss by environment type (dB)
CLUTTER_LOSS_DB: Dict[str, float] = {
    "open_field": 0.0,
    "coastal": 2.0,
    "suburban": 8.0,
    "wooded": 12.0,
    "urban": 15.0,
    "mountain": 0.0,  # terrain-dominated
}


def _haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Compute haversine distance between two lat/lon points.

    Returns:
        Distance in meters.
    """
    lat1_r, lon1_r = math.radians(lat1), math.radians(lon1)
    lat2_r, lon2_r = math.radians(lat2), math.radians(lon2)

    dlat = lat2_r - lat1_r
    dlon = lon2_r - lon1_r

    a = math.sin(dlat / 2) ** 2 + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlon / 2) ** 2
    c = 2 * math.asin(math.sqrt(a))

    return EARTH_RADIUS_M * c


def _bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Compute initial bearing from point 1 to point 2.

    Returns:
        Bearing in degrees [0, 360).
    """
    lat1_r, lon1_r = math.radians(lat1), math.radians(lon1)
    lat2_r, lon2_r = math.radians(lat2), math.radians(lon2)

    dlon = lon2_r - lon1_r
    x = math.sin(dlon) * math.cos(lat2_r)
    y = math.cos(lat1_r) * math.sin(lat2_r) - math.sin(lat1_r) * math.cos(lat2_r) * math.cos(dlon)

    bearing_rad = math.atan2(x, y)
    return (math.degrees(bearing_rad) + 360) % 360


def _destination_point(lat: float, lon: float, bearing_deg: float, distance_m: float) -> Tuple[float, float]:
    """
    Compute destination point given start, bearing, and distance.

    Returns:
        (lat, lon) of destination point.
    """
    lat_r = math.radians(lat)
    lon_r = math.radians(lon)
    bearing_r = math.radians(bearing_deg)
    d = distance_m / EARTH_RADIUS_M

    dest_lat = math.asin(
        math.sin(lat_r) * math.cos(d) + math.cos(lat_r) * math.sin(d) * math.cos(bearing_r)
    )
    dest_lon = lon_r + math.atan2(
        math.sin(bearing_r) * math.sin(d) * math.cos(lat_r),
        math.cos(d) - math.sin(lat_r) * math.sin(dest_lat),
    )

    return math.degrees(dest_lat), math.degrees(dest_lon)


class SRTMTileManager:
    """
    Manages SRTM HGT tile downloads and caching.

    SRTM GL1 (1 arc-second, ~30m) tiles are stored as raw 16-bit
    signed integers in big-endian format, 3601x3601 pixels per tile.
    """

    # AWS S3 public SRTM mirror
    SRTM_BASE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/skadi"

    def __init__(self, cache_dir: Path):
        self.cache_dir = cache_dir / "srtm"
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._tile_cache: Dict[str, Optional[np.ndarray]] = {}

    @staticmethod
    def tile_name(lat: float, lon: float) -> str:
        """
        Get SRTM tile filename for a lat/lon coordinate.

        SRTM tiles are named by their SW corner:
        N33W118.hgt covers 33N to 34N, 118W to 117W
        """
        lat_int = int(math.floor(lat))
        lon_int = int(math.floor(lon))

        lat_prefix = "N" if lat_int >= 0 else "S"
        lon_prefix = "E" if lon_int >= 0 else "W"

        return f"{lat_prefix}{abs(lat_int):02d}{lon_prefix}{abs(lon_int):03d}"

    def _tile_path(self, name: str) -> Path:
        """Get local cache path for a tile."""
        return self.cache_dir / f"{name}.hgt"

    def _download_tile(self, name: str) -> bool:
        """
        Download an SRTM tile from AWS S3.

        Returns:
            True if download succeeded, False otherwise.
        """
        # Determine subdirectory (e.g., N33/N33W118.hgt)
        lat_part = name[:3]  # e.g., "N33"
        url = f"{self.SRTM_BASE_URL}/{lat_part}/{name}.hgt.gz"

        tile_path = self._tile_path(name)
        if tile_path.exists():
            return True

        logger.info(f"Downloading SRTM tile: {name} from {url}")

        try:
            # Create SSL context that works on macOS (missing local certs)
            ctx = ssl.create_default_context()
            try:
                import certifi
                ctx.load_verify_locations(certifi.where())
            except ImportError:
                # Fall back to unverified if certifi not available
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE

            req = Request(url, headers={"User-Agent": "SCENSUS-TEP/1.0"})
            response = urlopen(req, timeout=30, context=ctx)
            compressed_data = response.read()

            # Decompress gzip
            import gzip
            raw_data = gzip.decompress(compressed_data)

            tile_path.write_bytes(raw_data)
            logger.info(f"SRTM tile downloaded: {name} ({len(raw_data)} bytes)")
            return True

        except URLError as e:
            logger.warning(f"Failed to download SRTM tile {name}: {e}")
            return False
        except Exception as e:
            logger.error(f"Error processing SRTM tile {name}: {e}")
            # Clean up partial download
            if tile_path.exists():
                tile_path.unlink()
            return False

    def load_tile(self, name: str) -> Optional[np.ndarray]:
        """
        Load an SRTM tile into memory.

        Returns:
            2D numpy array of elevations (meters), or None if unavailable.
        """
        if name in self._tile_cache:
            return self._tile_cache[name]

        tile_path = self._tile_path(name)

        # Download if not cached
        if not tile_path.exists():
            if not self._download_tile(name):
                self._tile_cache[name] = None
                return None

        try:
            raw = tile_path.read_bytes()
            expected_size = SRTM_TILE_SIZE * SRTM_TILE_SIZE * 2  # 16-bit
            if len(raw) != expected_size:
                logger.error(f"SRTM tile {name} has unexpected size: {len(raw)} (expected {expected_size})")
                self._tile_cache[name] = None
                return None

            # Parse big-endian int16
            tile = np.frombuffer(raw, dtype=">i2").reshape((SRTM_TILE_SIZE, SRTM_TILE_SIZE))
            # Convert to float and handle voids (-32768)
            tile = tile.astype(np.float32)
            tile[tile == -32768] = np.nan

            self._tile_cache[name] = tile
            return tile

        except Exception as e:
            logger.error(f"Failed to load SRTM tile {name}: {e}")
            self._tile_cache[name] = None
            return None

    def get_elevation(self, lat: float, lon: float) -> Optional[float]:
        """
        Get elevation at a specific lat/lon using bilinear interpolation.

        Returns:
            Elevation in meters, or None if data unavailable.
        """
        name = self.tile_name(lat, lon)
        tile = self.load_tile(name)
        if tile is None:
            return None

        # Compute pixel coordinates within tile
        # SRTM tiles are indexed from NW corner (top-left)
        lat_floor = math.floor(lat)
        lon_floor = math.floor(lon)

        # Fractional position within the tile [0, 1)
        frac_lat = lat - lat_floor
        frac_lon = lon - lon_floor

        # Convert to pixel coords (row increases southward)
        row = (1.0 - frac_lat) * (SRTM_TILE_SIZE - 1)
        col = frac_lon * (SRTM_TILE_SIZE - 1)

        # Bilinear interpolation
        r0 = int(math.floor(row))
        c0 = int(math.floor(col))
        r1 = min(r0 + 1, SRTM_TILE_SIZE - 1)
        c1 = min(c0 + 1, SRTM_TILE_SIZE - 1)

        fr = row - r0
        fc = col - c0

        z00 = tile[r0, c0]
        z01 = tile[r0, c1]
        z10 = tile[r1, c0]
        z11 = tile[r1, c1]

        # Check for voids
        values = [z00, z01, z10, z11]
        if any(np.isnan(v) for v in values):
            # Use nearest valid neighbor
            valid = [(v, abs(r0 - row) + abs(c0 - col)) for v in values if not np.isnan(v)]
            if valid:
                return float(min(valid, key=lambda x: x[1])[0])
            return None

        # Bilinear interpolation
        z = (
            z00 * (1 - fr) * (1 - fc)
            + z01 * (1 - fr) * fc
            + z10 * fr * (1 - fc)
            + z11 * fr * fc
        )

        return float(z)

    def ensure_tiles_for_area(
        self,
        min_lat: float,
        min_lon: float,
        max_lat: float,
        max_lon: float,
    ) -> List[str]:
        """
        Pre-download all tiles needed for an area.

        Returns:
            List of tile names that were successfully loaded.
        """
        tiles_needed = set()
        for lat in range(int(math.floor(min_lat)), int(math.ceil(max_lat)) + 1):
            for lon in range(int(math.floor(min_lon)), int(math.ceil(max_lon)) + 1):
                tiles_needed.add(self.tile_name(lat, lon))

        loaded = []
        for name in sorted(tiles_needed):
            if self._download_tile(name):
                loaded.append(name)
            else:
                logger.warning(f"Could not acquire tile: {name}")

        return loaded


class TerrainManager:
    """
    High-level terrain data manager.

    Provides elevation queries, terrain profiles, and viewshed computation
    using SRTM DEM data with local caching.
    """

    def __init__(self, cache_dir: Optional[Path] = None):
        """
        Initialize the terrain manager.

        Args:
            cache_dir: Directory for caching DEM tiles.
                       Defaults to ~/.scensus/terrain_cache/
        """
        self.cache_dir = cache_dir or DEFAULT_CACHE_DIR
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.srtm = SRTMTileManager(self.cache_dir)
        logger.info(f"TerrainManager initialized, cache: {self.cache_dir}")

    def get_elevation(self, lat: float, lon: float) -> Optional[float]:
        """
        Get terrain elevation at a point.

        Args:
            lat: Latitude in decimal degrees.
            lon: Longitude in decimal degrees.

        Returns:
            Elevation in meters above sea level, or None if unavailable.
        """
        return self.srtm.get_elevation(lat, lon)

    def get_terrain_profile(
        self,
        lat1: float,
        lon1: float,
        lat2: float,
        lon2: float,
        num_points: int = 100,
    ) -> Dict:
        """
        Extract a terrain elevation profile between two points.

        Args:
            lat1, lon1: Start point.
            lat2, lon2: End point.
            num_points: Number of sample points along the profile.

        Returns:
            Dict with:
                distances_m: list of distances from start
                elevations_m: list of elevations
                lats: list of latitudes
                lons: list of longitudes
                total_distance_m: total distance
        """
        total_dist = _haversine_distance(lat1, lon1, lat2, lon2)
        bearing_deg = _bearing(lat1, lon1, lat2, lon2)

        distances = []
        elevations = []
        lats = []
        lons = []

        for i in range(num_points):
            frac = i / max(num_points - 1, 1)
            d = frac * total_dist

            lat, lon = _destination_point(lat1, lon1, bearing_deg, d)
            elev = self.get_elevation(lat, lon)

            distances.append(d)
            elevations.append(elev if elev is not None else 0.0)
            lats.append(lat)
            lons.append(lon)

        return {
            "distances_m": distances,
            "elevations_m": elevations,
            "lats": lats,
            "lons": lons,
            "total_distance_m": total_dist,
        }

    def check_line_of_sight(
        self,
        lat1: float,
        lon1: float,
        height1_m: float,
        lat2: float,
        lon2: float,
        height2_m: float,
        num_points: int = 200,
    ) -> Dict:
        """
        Check line-of-sight between two points at given heights AGL.

        Args:
            lat1, lon1: Observer position.
            height1_m: Observer height above ground level (meters).
            lat2, lon2: Target position.
            height2_m: Target height above ground level (meters).
            num_points: Resolution of terrain profile.

        Returns:
            Dict with:
                is_visible: bool - whether LOS is clear
                obstruction_distance_m: distance to first obstruction (or None)
                obstruction_elevation_m: elevation of obstruction (or None)
                profile: terrain profile data
                los_clearance_m: list of clearance above terrain at each point
        """
        profile = self.get_terrain_profile(lat1, lon1, lat2, lon2, num_points)

        distances = profile["distances_m"]
        elevations = profile["elevations_m"]
        total_dist = profile["total_distance_m"]

        # Observer and target absolute altitudes
        obs_elev = elevations[0] + height1_m
        tgt_elev = elevations[-1] + height2_m

        # Check each intermediate point
        is_visible = True
        obstruction_dist = None
        obstruction_elev = None
        clearances = []

        for i in range(len(distances)):
            d = distances[i]
            terrain_elev = elevations[i]

            if total_dist > 0:
                frac = d / total_dist
            else:
                frac = 0

            # LOS altitude at this distance (linear interpolation)
            los_alt = obs_elev + frac * (tgt_elev - obs_elev)

            # Earth curvature correction (approximate)
            # Drop due to curvature = d^2 / (2 * R)
            # With 4/3 effective Earth radius for standard atmosphere
            effective_radius = EARTH_RADIUS_M * (4 / 3)
            curvature_drop = (d * (total_dist - d)) / (2 * effective_radius)
            los_alt_corrected = los_alt - curvature_drop

            clearance = los_alt_corrected - terrain_elev
            clearances.append(clearance)

            # Skip observer and target points
            if i > 0 and i < len(distances) - 1:
                if clearance < 0:
                    is_visible = False
                    if obstruction_dist is None:
                        obstruction_dist = d
                        obstruction_elev = terrain_elev

        return {
            "is_visible": is_visible,
            "obstruction_distance_m": obstruction_dist,
            "obstruction_elevation_m": obstruction_elev,
            "profile": profile,
            "los_clearance_m": clearances,
        }

    def compute_viewshed(
        self,
        center_lat: float,
        center_lon: float,
        observer_height_m: float,
        radius_m: float,
        target_height_m: float = 50.0,
        num_radials: int = 360,
        distance_step_m: float = 50.0,
    ) -> Dict:
        """
        Compute a viewshed (LOS/NLOS) from an observer position.

        Uses radial sweep: cast rays in all directions, check terrain
        obstruction along each ray.

        Args:
            center_lat, center_lon: Observer position.
            observer_height_m: Observer antenna height AGL (meters).
            radius_m: Maximum analysis radius (meters).
            target_height_m: Target (drone) altitude AGL (meters).
            num_radials: Number of radial directions (default 360 = 1° spacing).
            distance_step_m: Distance step along each radial (meters).

        Returns:
            Dict with:
                center: {lat, lon}
                radius_m: analysis radius
                observer_height_m: observer height AGL
                target_height_m: target height AGL
                num_radials: number of radials
                distance_step_m: step size
                radials: list of radial results, each with:
                    bearing_deg: direction
                    points: list of {distance_m, lat, lon, elevation_m, visible}
                bounds: {min_lat, max_lat, min_lon, max_lon}
                grid: 2D numpy array (num_radials x num_steps) of visibility (1=visible, 0=blocked)
        """
        logger.info(
            f"Computing viewshed: center=({center_lat:.6f}, {center_lon:.6f}), "
            f"radius={radius_m}m, observer_h={observer_height_m}m, target_h={target_height_m}m"
        )

        # Pre-download tiles for the area
        approx_deg = radius_m / 111_000  # rough meters to degrees
        self.srtm.ensure_tiles_for_area(
            center_lat - approx_deg,
            center_lon - approx_deg,
            center_lat + approx_deg,
            center_lon + approx_deg,
        )

        # Get observer ground elevation
        observer_ground = self.get_elevation(center_lat, center_lon) or 0.0
        observer_alt = observer_ground + observer_height_m

        num_steps = int(radius_m / distance_step_m)
        radials = []
        grid = np.zeros((num_radials, num_steps), dtype=np.uint8)

        min_lat = center_lat
        max_lat = center_lat
        min_lon = center_lon
        max_lon = center_lon

        for r_idx in range(num_radials):
            bearing = r_idx * (360.0 / num_radials)
            radial_points = []

            # Track maximum elevation angle seen so far along this radial
            # (for efficient horizon-based viewshed)
            max_elev_angle = -float("inf")

            for s_idx in range(num_steps):
                dist = (s_idx + 1) * distance_step_m

                pt_lat, pt_lon = _destination_point(center_lat, center_lon, bearing, dist)

                # Update bounds
                min_lat = min(min_lat, pt_lat)
                max_lat = max(max_lat, pt_lat)
                min_lon = min(min_lon, pt_lon)
                max_lon = max(max_lon, pt_lon)

                terrain_elev = self.get_elevation(pt_lat, pt_lon)
                if terrain_elev is None:
                    terrain_elev = 0.0

                # Target absolute altitude at this point
                target_alt = terrain_elev + target_height_m

                # Earth curvature correction (4/3 effective radius)
                effective_radius = EARTH_RADIUS_M * (4 / 3)
                curvature_drop = dist * dist / (2 * effective_radius)

                # Elevation angle from observer to target at this point
                # Corrected for curvature
                height_diff = target_alt - observer_alt - curvature_drop
                elev_angle = math.atan2(height_diff, dist)

                # Also check terrain obstruction at ground level
                terrain_height_diff = terrain_elev - observer_alt - curvature_drop
                terrain_elev_angle = math.atan2(terrain_height_diff, dist)

                # Update maximum terrain angle (for ground-level obstruction)
                # A point is visible if the target elevation angle exceeds
                # the maximum terrain angle seen so far
                visible = elev_angle > max_elev_angle

                # Update max elevation angle using the terrain (not target)
                # This tracks the "horizon" formed by terrain
                if terrain_elev_angle > max_elev_angle:
                    max_elev_angle = terrain_elev_angle

                grid[r_idx, s_idx] = 1 if visible else 0

                radial_points.append({
                    "distance_m": dist,
                    "lat": pt_lat,
                    "lon": pt_lon,
                    "elevation_m": terrain_elev,
                    "visible": visible,
                })

            radials.append({
                "bearing_deg": bearing,
                "points": radial_points,
            })

        # Count visible/blocked
        total_cells = grid.size
        visible_cells = int(np.sum(grid))
        blocked_cells = total_cells - visible_cells

        logger.info(
            f"Viewshed complete: {visible_cells}/{total_cells} visible "
            f"({100 * visible_cells / max(total_cells, 1):.1f}%)"
        )

        return {
            "center": {"lat": center_lat, "lon": center_lon},
            "radius_m": radius_m,
            "observer_height_m": observer_height_m,
            "observer_ground_elevation_m": observer_ground,
            "target_height_m": target_height_m,
            "num_radials": num_radials,
            "distance_step_m": distance_step_m,
            "radials": radials,
            "bounds": {
                "min_lat": min_lat,
                "max_lat": max_lat,
                "min_lon": min_lon,
                "max_lon": max_lon,
            },
            "grid": grid,
            "stats": {
                "total_cells": total_cells,
                "visible_cells": visible_cells,
                "blocked_cells": blocked_cells,
                "visibility_percent": round(100 * visible_cells / max(total_cells, 1), 1),
            },
        }

    def viewshed_to_geojson(self, viewshed_result: Dict) -> Dict:
        """
        Convert viewshed radial results to GeoJSON for map overlay.

        Creates a GeoJSON FeatureCollection with polygonal sectors for
        visible and blocked areas (pie-wedge segments between radials).

        Args:
            viewshed_result: Output from compute_viewshed().

        Returns:
            GeoJSON FeatureCollection.
        """
        features = []
        radials = viewshed_result["radials"]
        center = viewshed_result["center"]
        num_radials = len(radials)

        for r_idx in range(num_radials):
            r_next = (r_idx + 1) % num_radials
            current_points = radials[r_idx]["points"]
            next_points = radials[r_next]["points"]

            for s_idx in range(len(current_points)):
                pt = current_points[s_idx]
                visible = pt["visible"]

                # Build a small polygon (sector cell) between two radials and two distance steps
                if s_idx < len(next_points):
                    pt_next_radial = next_points[s_idx]

                    if s_idx == 0:
                        # Inner edge is the center
                        inner_cur = [center["lon"], center["lat"]]
                        inner_next = [center["lon"], center["lat"]]
                    else:
                        inner_cur = [current_points[s_idx - 1]["lon"], current_points[s_idx - 1]["lat"]]
                        inner_next = [next_points[s_idx - 1]["lon"], next_points[s_idx - 1]["lat"]]

                    outer_cur = [pt["lon"], pt["lat"]]
                    outer_next = [pt_next_radial["lon"], pt_next_radial["lat"]]

                    # Only include blocked cells (visible areas are transparent)
                    if not visible:
                        polygon = [inner_cur, outer_cur, outer_next, inner_next, inner_cur]
                        features.append({
                            "type": "Feature",
                            "geometry": {
                                "type": "Polygon",
                                "coordinates": [polygon],
                            },
                            "properties": {
                                "visible": visible,
                                "distance_m": pt["distance_m"],
                                "elevation_m": pt["elevation_m"],
                                "bearing_deg": radials[r_idx]["bearing_deg"],
                            },
                        })

        return {
            "type": "FeatureCollection",
            "features": features,
        }

    def viewshed_to_png(
        self,
        viewshed_result: Dict,
        image_size: int = 512,
        blocked_color: Tuple[int, int, int, int] = (220, 38, 38, 140),  # Semi-transparent red
        visible_color: Tuple[int, int, int, int] = (0, 0, 0, 0),  # Transparent
    ) -> Tuple[bytes, Dict]:
        """
        Render viewshed to a PNG image for map overlay.

        The image is a square centered on the observer, covering the
        analysis radius. Can be used as a MapLibre GL image source.

        Args:
            viewshed_result: Output from compute_viewshed().
            image_size: Output image width/height in pixels.
            blocked_color: RGBA color for blocked (NLOS) areas.
            visible_color: RGBA color for visible (LOS) areas.

        Returns:
            Tuple of (png_bytes, geo_bounds_dict) where geo_bounds_dict has
            coordinates for MapLibre image source positioning.
        """
        from PIL import Image, ImageDraw

        grid = viewshed_result["grid"]
        num_radials = grid.shape[0]
        num_steps = grid.shape[1]
        radius_m = viewshed_result["radius_m"]

        # Create RGBA image
        img = Image.new("RGBA", (image_size, image_size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        center_px = image_size / 2
        pixels_per_meter = (image_size / 2) / radius_m

        step_m = viewshed_result["distance_step_m"]
        angle_step = 360.0 / num_radials

        for r_idx in range(num_radials):
            angle_start = r_idx * angle_step - 90  # PIL uses 0=east, counter-clockwise
            angle_end = angle_start + angle_step

            for s_idx in range(num_steps):
                if grid[r_idx, s_idx] == 0:
                    # Blocked cell - draw arc segment
                    inner_r = s_idx * step_m * pixels_per_meter
                    outer_r = (s_idx + 1) * step_m * pixels_per_meter

                    # Draw filled pie wedge
                    bbox_outer = [
                        center_px - outer_r,
                        center_px - outer_r,
                        center_px + outer_r,
                        center_px + outer_r,
                    ]

                    draw.pieslice(
                        bbox_outer,
                        start=angle_start,
                        end=angle_end,
                        fill=blocked_color,
                    )

                    # Cut out inner portion if not the first step
                    if s_idx > 0:
                        bbox_inner = [
                            center_px - inner_r,
                            center_px - inner_r,
                            center_px + inner_r,
                            center_px + inner_r,
                        ]
                        draw.pieslice(
                            bbox_inner,
                            start=angle_start,
                            end=angle_end,
                            fill=(0, 0, 0, 0),
                        )

        # Convert to PNG bytes
        import io
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        png_bytes = buf.getvalue()

        # Compute geographic bounds for image positioning
        bounds = viewshed_result["bounds"]

        # MapLibre image source expects coordinates as [[NW], [NE], [SE], [SW]]
        geo_bounds = {
            "coordinates": [
                [bounds["min_lon"], bounds["max_lat"]],  # NW
                [bounds["max_lon"], bounds["max_lat"]],  # NE
                [bounds["max_lon"], bounds["min_lat"]],  # SE
                [bounds["min_lon"], bounds["min_lat"]],  # SW
            ]
        }

        return png_bytes, geo_bounds

    def pre_download_site(
        self,
        boundary_polygon: List[Dict[str, float]],
        buffer_m: float = 1000.0,
    ) -> Dict:
        """
        Pre-download all DEM tiles for a site boundary.

        Useful for preparing for offline field use.

        Args:
            boundary_polygon: List of {lat, lon} points defining the site boundary.
            buffer_m: Extra buffer around the boundary (meters).

        Returns:
            Dict with download summary.
        """
        if not boundary_polygon:
            return {"error": "Empty boundary polygon"}

        lats = [p["lat"] for p in boundary_polygon]
        lons = [p["lon"] for p in boundary_polygon]

        buffer_deg = buffer_m / 111_000  # Approximate

        min_lat = min(lats) - buffer_deg
        max_lat = max(lats) + buffer_deg
        min_lon = min(lons) - buffer_deg
        max_lon = max(lons) + buffer_deg

        loaded = self.srtm.ensure_tiles_for_area(min_lat, min_lon, max_lat, max_lon)

        return {
            "tiles_downloaded": len(loaded),
            "tile_names": loaded,
            "bounds": {
                "min_lat": min_lat,
                "max_lat": max_lat,
                "min_lon": min_lon,
                "max_lon": max_lon,
            },
        }

    def get_clutter_loss(self, environment_type: str) -> float:
        """
        Get clutter loss correction for an environment type.

        Args:
            environment_type: Site environment (open_field, urban, etc.)

        Returns:
            Additional path loss in dB.
        """
        return CLUTTER_LOSS_DB.get(environment_type, 0.0)


# Module-level singleton for reuse
_terrain_manager: Optional[TerrainManager] = None


def get_terrain_manager(cache_dir: Optional[Path] = None) -> TerrainManager:
    """
    Get or create the global TerrainManager singleton.

    Args:
        cache_dir: Override cache directory.

    Returns:
        TerrainManager instance.
    """
    global _terrain_manager
    if _terrain_manager is None:
        _terrain_manager = TerrainManager(cache_dir)
    return _terrain_manager
