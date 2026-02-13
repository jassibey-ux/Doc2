"""
Telemetry Repository

Handles database operations for time-series telemetry data.
Optimized for bulk inserts and time-range queries.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import select, func, and_, delete
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import TrackerTelemetry, TestSession
from .base import BaseRepository


class TelemetryRepository(BaseRepository[TrackerTelemetry]):
    """Repository for telemetry data operations."""

    def __init__(self, db: AsyncSession):
        super().__init__(TrackerTelemetry, db)

    async def bulk_insert(
        self,
        session_id: str,
        records: List[Dict[str, Any]],
    ) -> int:
        """
        Bulk insert telemetry records.

        Args:
            session_id: The session's primary key.
            records: List of telemetry records.

        Returns:
            Number of records inserted.
        """
        telemetry_objects = []
        for record in records:
            telemetry = TrackerTelemetry(
                session_id=session_id,
                tracker_id=record.get("tracker_id"),
                time_local_received=record.get("time_local_received"),
                lat=record.get("lat"),
                lon=record.get("lon"),
                alt_m=record.get("alt_m"),
                speed_mps=record.get("speed_mps"),
                course_deg=record.get("course_deg"),
                rssi_dbm=record.get("rssi_dbm"),
                satellites=record.get("satellites"),
                fix_valid=record.get("fix_valid"),
                hdop=record.get("hdop"),
                battery_mv=record.get("battery_mv"),
            )
            telemetry_objects.append(telemetry)

        self.db.add_all(telemetry_objects)
        await self.db.flush()

        return len(telemetry_objects)

    async def get_by_session(
        self,
        session_id: str,
        tracker_id: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        skip: int = 0,
        limit: Optional[int] = None,
    ) -> List[TrackerTelemetry]:
        """
        Get telemetry records for a session.

        Args:
            session_id: The session's primary key.
            tracker_id: Optional filter by specific tracker.
            start_time: Optional start of time range.
            end_time: Optional end of time range.
            skip: Number of records to skip.
            limit: Maximum number of records (None for all).

        Returns:
            List of telemetry records.
        """
        query = select(TrackerTelemetry).where(
            TrackerTelemetry.session_id == session_id
        )

        if tracker_id:
            query = query.where(TrackerTelemetry.tracker_id == tracker_id)

        if start_time:
            query = query.where(TrackerTelemetry.time_local_received >= start_time)

        if end_time:
            query = query.where(TrackerTelemetry.time_local_received <= end_time)

        query = query.order_by(TrackerTelemetry.time_local_received.asc())
        query = query.offset(skip)

        if limit:
            query = query.limit(limit)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_trackers_for_session(
        self,
        session_id: str,
    ) -> List[str]:
        """
        Get all unique tracker IDs for a session.

        Args:
            session_id: The session's primary key.

        Returns:
            List of tracker ID strings.
        """
        result = await self.db.execute(
            select(TrackerTelemetry.tracker_id)
            .where(TrackerTelemetry.session_id == session_id)
            .distinct()
        )
        return [row[0] for row in result.fetchall()]

    async def get_time_range(
        self,
        session_id: str,
        tracker_id: Optional[str] = None,
    ) -> Tuple[Optional[datetime], Optional[datetime]]:
        """
        Get the time range of telemetry for a session.

        Args:
            session_id: The session's primary key.
            tracker_id: Optional filter by specific tracker.

        Returns:
            Tuple of (start_time, end_time), or (None, None) if no data.
        """
        query = select(
            func.min(TrackerTelemetry.time_local_received),
            func.max(TrackerTelemetry.time_local_received),
        ).where(TrackerTelemetry.session_id == session_id)

        if tracker_id:
            query = query.where(TrackerTelemetry.tracker_id == tracker_id)

        result = await self.db.execute(query)
        row = result.fetchone()
        return row[0], row[1]

    async def get_record_count(
        self,
        session_id: str,
        tracker_id: Optional[str] = None,
    ) -> int:
        """
        Get count of telemetry records for a session.

        Args:
            session_id: The session's primary key.
            tracker_id: Optional filter by specific tracker.

        Returns:
            Number of records.
        """
        query = select(func.count(TrackerTelemetry.id)).where(
            TrackerTelemetry.session_id == session_id
        )

        if tracker_id:
            query = query.where(TrackerTelemetry.tracker_id == tracker_id)

        result = await self.db.execute(query)
        return result.scalar() or 0

    async def get_downsampled(
        self,
        session_id: str,
        tracker_id: Optional[str] = None,
        target_points: int = 1000,
    ) -> List[TrackerTelemetry]:
        """
        Get downsampled telemetry for visualization.

        Uses simple nth-row sampling. For production, consider
        LTTB (Largest Triangle Three Buckets) algorithm.

        Args:
            session_id: The session's primary key.
            tracker_id: Optional filter by specific tracker.
            target_points: Approximate number of points to return.

        Returns:
            Downsampled list of telemetry records.
        """
        # First, get total count
        total_count = await self.get_record_count(session_id, tracker_id)

        if total_count <= target_points:
            # Return all points if we have fewer than target
            return await self.get_by_session(session_id, tracker_id)

        # Calculate sampling interval
        interval = max(1, total_count // target_points)

        # Use SQLite's rowid for efficient sampling
        # Note: This is a simplified approach - more sophisticated
        # algorithms like LTTB would give better visual results
        query = select(TrackerTelemetry).where(
            TrackerTelemetry.session_id == session_id
        )

        if tracker_id:
            query = query.where(TrackerTelemetry.tracker_id == tracker_id)

        query = query.order_by(TrackerTelemetry.time_local_received.asc())

        result = await self.db.execute(query)
        all_records = list(result.scalars().all())

        # Sample every nth record
        sampled = [all_records[i] for i in range(0, len(all_records), interval)]

        # Always include first and last points
        if all_records and all_records[-1] not in sampled:
            sampled.append(all_records[-1])

        return sampled

    async def get_bounding_box(
        self,
        session_id: str,
        tracker_id: Optional[str] = None,
    ) -> Dict[str, float]:
        """
        Get geographic bounding box for telemetry.

        Args:
            session_id: The session's primary key.
            tracker_id: Optional filter by specific tracker.

        Returns:
            Dict with min_lat, max_lat, min_lon, max_lon.
        """
        query = select(
            func.min(TrackerTelemetry.lat),
            func.max(TrackerTelemetry.lat),
            func.min(TrackerTelemetry.lon),
            func.max(TrackerTelemetry.lon),
        ).where(
            and_(
                TrackerTelemetry.session_id == session_id,
                TrackerTelemetry.lat.isnot(None),
                TrackerTelemetry.lon.isnot(None),
            )
        )

        if tracker_id:
            query = query.where(TrackerTelemetry.tracker_id == tracker_id)

        result = await self.db.execute(query)
        row = result.fetchone()

        return {
            "min_lat": row[0],
            "max_lat": row[1],
            "min_lon": row[2],
            "max_lon": row[3],
        }

    async def get_altitude_range(
        self,
        session_id: str,
        tracker_id: Optional[str] = None,
    ) -> Dict[str, float]:
        """
        Get altitude range for telemetry.

        Args:
            session_id: The session's primary key.
            tracker_id: Optional filter by specific tracker.

        Returns:
            Dict with min_alt, max_alt, avg_alt.
        """
        query = select(
            func.min(TrackerTelemetry.alt_m),
            func.max(TrackerTelemetry.alt_m),
            func.avg(TrackerTelemetry.alt_m),
        ).where(
            and_(
                TrackerTelemetry.session_id == session_id,
                TrackerTelemetry.alt_m.isnot(None),
            )
        )

        if tracker_id:
            query = query.where(TrackerTelemetry.tracker_id == tracker_id)

        result = await self.db.execute(query)
        row = result.fetchone()

        return {
            "min_alt_m": row[0],
            "max_alt_m": row[1],
            "avg_alt_m": row[2],
        }

    async def get_speed_statistics(
        self,
        session_id: str,
        tracker_id: Optional[str] = None,
    ) -> Dict[str, float]:
        """
        Get speed statistics for telemetry.

        Args:
            session_id: The session's primary key.
            tracker_id: Optional filter by specific tracker.

        Returns:
            Dict with min_speed, max_speed, avg_speed.
        """
        query = select(
            func.min(TrackerTelemetry.speed_mps),
            func.max(TrackerTelemetry.speed_mps),
            func.avg(TrackerTelemetry.speed_mps),
        ).where(
            and_(
                TrackerTelemetry.session_id == session_id,
                TrackerTelemetry.speed_mps.isnot(None),
            )
        )

        if tracker_id:
            query = query.where(TrackerTelemetry.tracker_id == tracker_id)

        result = await self.db.execute(query)
        row = result.fetchone()

        return {
            "min_speed_mps": row[0],
            "max_speed_mps": row[1],
            "avg_speed_mps": row[2],
        }

    async def delete_for_session(
        self,
        session_id: str,
    ) -> int:
        """
        Delete all telemetry for a session.

        Args:
            session_id: The session's primary key.

        Returns:
            Number of records deleted.
        """
        # Get count first
        count = await self.get_record_count(session_id)

        # Delete records
        await self.db.execute(
            delete(TrackerTelemetry).where(
                TrackerTelemetry.session_id == session_id
            )
        )
        await self.db.flush()

        return count

    async def get_signal_quality_summary(
        self,
        session_id: str,
        tracker_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Get signal quality summary for telemetry.

        Args:
            session_id: The session's primary key.
            tracker_id: Optional filter by specific tracker.

        Returns:
            Dict with RSSI and satellite statistics.
        """
        query = select(
            func.min(TrackerTelemetry.rssi_dbm),
            func.max(TrackerTelemetry.rssi_dbm),
            func.avg(TrackerTelemetry.rssi_dbm),
            func.min(TrackerTelemetry.satellites),
            func.max(TrackerTelemetry.satellites),
            func.avg(TrackerTelemetry.satellites),
            func.count(TrackerTelemetry.id).filter(TrackerTelemetry.fix_valid == True),
            func.count(TrackerTelemetry.id).filter(TrackerTelemetry.fix_valid == False),
        ).where(TrackerTelemetry.session_id == session_id)

        if tracker_id:
            query = query.where(TrackerTelemetry.tracker_id == tracker_id)

        result = await self.db.execute(query)
        row = result.fetchone()

        return {
            "rssi": {
                "min_dbm": row[0],
                "max_dbm": row[1],
                "avg_dbm": row[2],
            },
            "satellites": {
                "min": row[3],
                "max": row[4],
                "avg": row[5],
            },
            "fix_valid_count": row[6] or 0,
            "fix_invalid_count": row[7] or 0,
        }
