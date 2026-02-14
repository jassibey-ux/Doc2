"""
Dual-mode Geometry Helper

Uses PostGIS ST_Distance/ST_Azimuth when available (Postgres),
falls back to Python haversine/bearing (SQLite/desktop).
"""

import logging
from typing import Optional, Tuple

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .analysis import haversine_distance, bearing
from .database.connection import get_db_manager

logger = logging.getLogger(__name__)


async def compute_range_bearing(
    emitter_lat: float,
    emitter_lon: float,
    target_lat: float,
    target_lon: float,
    db: Optional[AsyncSession] = None,
) -> Tuple[float, float]:
    """Compute range (meters) and bearing (degrees) from emitter to target.

    Uses PostGIS if available (Postgres mode), else Python haversine.

    Returns:
        (range_m, bearing_deg)
    """
    db_manager = get_db_manager()

    if db and db_manager and db_manager.config.is_postgres:
        try:
            result = await db.execute(
                text("""
                    SELECT
                        ST_Distance(
                            ST_SetSRID(ST_MakePoint(:e_lon, :e_lat), 4326)::geography,
                            ST_SetSRID(ST_MakePoint(:t_lon, :t_lat), 4326)::geography
                        ) AS range_m,
                        degrees(ST_Azimuth(
                            ST_SetSRID(ST_MakePoint(:e_lon, :e_lat), 4326),
                            ST_SetSRID(ST_MakePoint(:t_lon, :t_lat), 4326)
                        )) AS bearing_deg
                """),
                {
                    "e_lon": emitter_lon,
                    "e_lat": emitter_lat,
                    "t_lon": target_lon,
                    "t_lat": target_lat,
                },
            )
            row = result.one()
            range_m = round(row.range_m, 1) if row.range_m is not None else 0.0
            bearing_deg = round(row.bearing_deg, 1) if row.bearing_deg is not None else 0.0
            return range_m, bearing_deg
        except Exception as e:
            logger.warning(f"PostGIS query failed, falling back to haversine: {e}")

    # Fallback: Python haversine
    range_m = round(haversine_distance(emitter_lat, emitter_lon, target_lat, target_lon), 1)
    bearing_deg = round(bearing(emitter_lat, emitter_lon, target_lat, target_lon), 1)
    return range_m, bearing_deg
