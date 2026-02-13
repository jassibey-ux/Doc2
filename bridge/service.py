"""
Bridge Service Entry Point

Runs the CSV watcher + cloud uploader pipeline.
Can run standalone (CLI) or as a Windows service.
"""

import asyncio
import logging
import signal
import sys
from typing import Optional

from .buffer import BufferDB
from .config import BridgeConfig
from .uploader import CloudUploader
from .watcher import BridgeWatcher

logger = logging.getLogger(__name__)


class BridgeService:
    """Orchestrates watcher → buffer → uploader pipeline."""

    def __init__(self, config: Optional[BridgeConfig] = None):
        self.config = config or BridgeConfig.load()
        self.buffer = BufferDB(self.config.buffer_db_path)
        self.uploader = CloudUploader(self.config, self.buffer)
        self.watcher = BridgeWatcher(
            watch_folder=self.config.watch_folder,
            on_records=self._on_records,
            glob_pattern=self.config.csv_glob_pattern,
        )
        self._running = False

    def _on_records(self, records: list[dict]) -> None:
        """Callback from watcher — enqueue records into buffer."""
        count = self.buffer.enqueue(records)
        logger.debug(f"Buffered {count} records (pending: {self.buffer.pending_count()})")

    async def start(self) -> None:
        """Start all components."""
        logger.info("Bridge service starting...")
        self.buffer.open()
        await self.uploader.start()
        await self.watcher.start()
        self._running = True

        pending = self.buffer.pending_count()
        if pending > 0:
            logger.info(f"Resuming with {pending} buffered records")

        logger.info("Bridge service running")

    async def stop(self) -> None:
        """Stop all components gracefully."""
        logger.info("Bridge service stopping...")
        self._running = False
        await self.watcher.stop()
        await self.uploader.stop()
        self.buffer.close()
        logger.info("Bridge service stopped")

    def status(self) -> dict:
        """Return current service status."""
        return {
            "running": self._running,
            "pending_records": self.buffer.pending_count(),
            "uploader_healthy": self.uploader.is_healthy,
            "watch_folder": str(self.config.watch_folder),
            "cloud_url": self.config.cloud_url,
        }


def _setup_logging(config: BridgeConfig) -> None:
    """Configure logging for the bridge service."""
    handlers = [logging.StreamHandler(sys.stdout)]

    if config.log_file:
        handlers.append(logging.FileHandler(config.log_file))

    logging.basicConfig(
        level=getattr(logging, config.log_level.upper(), logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        handlers=handlers,
    )


async def _run_service(config_path: Optional[str] = None) -> None:
    """Async entry point for running the bridge service."""
    config = BridgeConfig.load(config_path)
    _setup_logging(config)

    service = BridgeService(config)

    loop = asyncio.get_event_loop()

    # Graceful shutdown on SIGINT/SIGTERM
    def shutdown_handler():
        logger.info("Shutdown signal received")
        asyncio.ensure_future(service.stop())

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, shutdown_handler)
        except NotImplementedError:
            # Windows doesn't support add_signal_handler
            pass

    await service.start()

    # Keep running until stopped
    try:
        while service._running:
            # Periodic maintenance
            service.buffer.purge_old()
            await asyncio.sleep(60)
    except asyncio.CancelledError:
        pass
    finally:
        await service.stop()


def main() -> None:
    """CLI entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="SCENSUS Bridge Service")
    parser.add_argument(
        "--config", "-c",
        help="Path to bridge_config.json",
        default=None,
    )
    parser.add_argument(
        "--init-config",
        action="store_true",
        help="Create a default config file and exit",
    )
    args = parser.parse_args()

    if args.init_config:
        config = BridgeConfig()
        config.save(args.config)
        path = args.config or str(BridgeConfig.load.__wrapped__ if hasattr(BridgeConfig.load, '__wrapped__') else "~/.scensus/bridge_config.json")
        print(f"Default config created. Edit it with your cloud URL and API key.")
        return

    try:
        asyncio.run(_run_service(args.config))
    except KeyboardInterrupt:
        print("\nShutdown complete.")


# Windows service support
try:
    import win32serviceutil
    import win32service
    import win32event

    class BridgeWindowsService(win32serviceutil.ServiceFramework):
        _svc_name_ = "ScensusBridge"
        _svc_display_name_ = "SCENSUS Bridge Service"
        _svc_description_ = "Watches GPSLogger CSV output and pushes telemetry to SCENSUS cloud"

        def __init__(self, args):
            win32serviceutil.ServiceFramework.__init__(self, args)
            self.stop_event = win32event.CreateEvent(None, 0, 0, None)
            self._service: Optional[BridgeService] = None

        def SvcStop(self):
            self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
            win32event.SetEvent(self.stop_event)
            if self._service:
                loop = asyncio.new_event_loop()
                loop.run_until_complete(self._service.stop())
                loop.close()

        def SvcDoRun(self):
            config = BridgeConfig.load()
            _setup_logging(config)
            self._service = BridgeService(config)

            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

            try:
                loop.run_until_complete(self._service.start())
                # Run until stop event
                while True:
                    result = win32event.WaitForSingleObject(self.stop_event, 5000)
                    if result == win32event.WAIT_OBJECT_0:
                        break
                    # Periodic maintenance
                    self._service.buffer.purge_old()
            finally:
                loop.run_until_complete(self._service.stop())
                loop.close()

except ImportError:
    # win32serviceutil not available (not on Windows or pywin32 not installed)
    BridgeWindowsService = None


if __name__ == "__main__":
    main()
