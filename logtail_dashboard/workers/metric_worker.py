"""
arq Worker Process for Async Metric Computation

Run with: python -m logtail_dashboard.workers.metric_worker

Only needed in cloud mode (Postgres + Redis).
Desktop mode uses synchronous inline computation.
"""

import logging
import os

logger = logging.getLogger(__name__)


async def startup(ctx):
    """Initialize database connection for worker context."""
    from ..database.connection import DatabaseConfig, DatabaseManager

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL must be set for worker mode")

    config = DatabaseConfig(database_url=database_url)
    db_manager = DatabaseManager(config)
    await db_manager.create_tables_async()
    ctx["db_manager"] = db_manager
    logger.info("Worker startup complete — database connected")


async def shutdown(ctx):
    """Close database connections."""
    db_manager = ctx.get("db_manager")
    if db_manager:
        await db_manager.close()
    logger.info("Worker shutdown complete")


class WorkerSettings:
    """arq worker configuration."""

    from .jobs import (
        compute_engagement_metrics_job,
        detect_gps_denial_job,
        recompute_sd_card_job,
    )

    functions = [
        compute_engagement_metrics_job,
        detect_gps_denial_job,
        recompute_sd_card_job,
    ]

    on_startup = startup
    on_shutdown = shutdown

    redis_settings = None  # Set dynamically below

    max_jobs = 10
    job_timeout = 300  # 5 minutes


def get_worker_settings():
    """Build worker settings with Redis URL from environment."""
    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

    try:
        from arq.connections import RedisSettings
        # Parse redis://host:port/db
        from urllib.parse import urlparse
        parsed = urlparse(redis_url)
        WorkerSettings.redis_settings = RedisSettings(
            host=parsed.hostname or "localhost",
            port=parsed.port or 6379,
            database=int(parsed.path.lstrip("/") or 0),
        )
    except ImportError:
        logger.warning("arq not installed — worker mode unavailable. Install with: pip install arq")
        return None

    return WorkerSettings


if __name__ == "__main__":
    import asyncio
    from arq import run_worker

    logging.basicConfig(level=logging.INFO)
    settings = get_worker_settings()
    if settings:
        run_worker(settings)
    else:
        print("arq not available. Install with: pip install arq>=0.25")
