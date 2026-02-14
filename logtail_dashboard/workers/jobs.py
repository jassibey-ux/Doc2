"""
Job Definitions for arq Worker

These jobs run in a separate process in cloud mode (Postgres + Redis).
Each job receives a context dict with database session factory.
"""

import logging
from datetime import datetime
from typing import Dict, Optional

logger = logging.getLogger(__name__)


async def compute_engagement_metrics_job(ctx: Dict, engagement_id: str) -> Optional[Dict]:
    """Compute metrics for an engagement asynchronously.

    Called after disengage in cloud mode instead of inline computation.
    """
    from ..database.connection import DatabaseConfig, DatabaseManager
    from ..database.repositories.engagements import EngagementRepository
    from ..analysis import compute_engagement_metrics

    db_manager: DatabaseManager = ctx.get("db_manager")
    if not db_manager:
        logger.error("No db_manager in worker context")
        return None

    async with db_manager.get_async_session() as db:
        eng_repo = EngagementRepository(db)
        engagement = await eng_repo.get_with_relations(engagement_id)
        if not engagement:
            logger.warning(f"Engagement {engagement_id} not found for metrics computation")
            return None

        metrics = await compute_engagement_metrics(db, engagement)

        if metrics:
            # Store job_id for traceability
            if engagement.metrics:
                engagement.metrics.job_id = ctx.get("job_id", "unknown")

        logger.info(f"Worker computed metrics for engagement {engagement_id}")
        return metrics


async def detect_gps_denial_job(ctx: Dict, engagement_id: str, burst_id: str) -> Optional[Dict]:
    """Run GPS denial detection for a specific burst.

    Updates the burst record with denial detection results.
    """
    from ..database.connection import DatabaseManager
    from ..database.models import EngagementJamBurst, TrackerTelemetry
    from ..analysis import detect_gps_denial_debounced, PositionPoint, classify_quality
    from sqlalchemy import select

    db_manager: DatabaseManager = ctx.get("db_manager")
    if not db_manager:
        return None

    async with db_manager.get_async_session() as db:
        from ..database.repositories.engagements import EngagementRepository
        eng_repo = EngagementRepository(db)
        engagement = await eng_repo.get_with_relations(engagement_id)
        if not engagement:
            return None

        burst_result = await db.execute(
            select(EngagementJamBurst).where(EngagementJamBurst.id == burst_id)
        )
        burst = burst_result.scalar_one_or_none()
        if not burst:
            return None

        burst_end = burst.jam_off_at or datetime.utcnow()

        for target in engagement.targets:
            telem_result = await db.execute(
                select(TrackerTelemetry)
                .where(TrackerTelemetry.session_id == engagement.session_id)
                .where(TrackerTelemetry.tracker_id == target.tracker_id)
                .where(TrackerTelemetry.time_local_received >= burst.jam_on_at)
                .where(TrackerTelemetry.time_local_received <= burst_end)
                .order_by(TrackerTelemetry.time_local_received)
            )
            rows = telem_result.scalars().all()
            if not rows:
                continue

            points = [
                PositionPoint(
                    lat=r.lat or 0.0, lon=r.lon or 0.0, alt_m=r.alt_m,
                    timestamp_ms=int(r.time_local_received.timestamp() * 1000),
                    fix_valid=bool(r.fix_valid), hdop=r.hdop, satellites=r.satellites,
                )
                for r in rows
            ]

            denial = detect_gps_denial_debounced(points)
            if denial.get("denial_detected"):
                burst.gps_denial_detected = True
                if denial.get("onset_timestamp_ms"):
                    burst.denial_onset_at = datetime.utcfromtimestamp(
                        denial["onset_timestamp_ms"] / 1000
                    )
                    jam_on_ms = int(burst.jam_on_at.timestamp() * 1000)
                    burst.time_to_effect_s = round(
                        (denial["onset_timestamp_ms"] - jam_on_ms) / 1000, 3
                    )
                break  # Primary target

        logger.info(f"Worker completed GPS denial detection for burst {burst_id}")
        return {"burst_id": burst_id, "denial_detected": burst.gps_denial_detected}


async def recompute_sd_card_job(ctx: Dict, engagement_id: str) -> Optional[Dict]:
    """Recompute engagement metrics from SD card (10Hz) telemetry data.

    Marks recomputed bursts with source='sd_card'.
    """
    from ..database.connection import DatabaseManager
    from ..database.repositories.engagements import EngagementRepository
    from ..analysis import compute_engagement_metrics

    db_manager: DatabaseManager = ctx.get("db_manager")
    if not db_manager:
        return None

    async with db_manager.get_async_session() as db:
        eng_repo = EngagementRepository(db)
        engagement = await eng_repo.get_with_relations(engagement_id)
        if not engagement:
            return None

        metrics = await compute_engagement_metrics(db, engagement)
        if metrics and engagement.metrics:
            engagement.metrics.data_source = "sd_merged"
            engagement.metrics.computation_version = "2.0-sdcard"

        logger.info(f"Worker recomputed SD card metrics for engagement {engagement_id}")
        return metrics
