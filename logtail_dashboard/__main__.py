"""Main entry point for SCENSUS Dashboard."""

import logging
import os
import sys

import uvicorn

from .config import get_config
from .api import create_app

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
    ],
)

logger = logging.getLogger(__name__)


def main() -> None:
    """Main entry point."""
    try:
        # Check for embedded mode flags (used when Electron spawns Python as subprocess)
        import argparse
        embedded_parser = argparse.ArgumentParser(add_help=False)
        embedded_parser.add_argument("--no-browser", action="store_true")
        embedded_args, _ = embedded_parser.parse_known_args()

        no_browser = embedded_args.no_browser or os.environ.get("SCENSUS_NO_BROWSER")

        # Load configuration
        config = get_config()

        # Create application
        app, dashboard = create_app(config)

        # User-friendly startup message
        logger.info("")
        logger.info("=" * 60)
        logger.info("          SCENSUS Dashboard")
        logger.info("      UAS Test & Evaluation Suite")
        logger.info("=" * 60)
        logger.info("")
        logger.info(f"Dashboard URL: http://{config.bind_host}:{config.port}")
        logger.info(f"Data Location: {config.log_root_folder}")
        if no_browser:
            logger.info("Mode: Embedded (no browser auto-open)")
        logger.info("")
        logger.info("Press Ctrl+C to stop the server")
        logger.info("")

        # Auto-open browser only for packaged Windows app (not in embedded mode)
        if not no_browser and (getattr(sys, 'frozen', False) or os.environ.get('SCENSUS_AUTO_BROWSER')):
            import threading
            import webbrowser
            from time import sleep

            def open_browser():
                sleep(2.0)
                url = f"http://{config.bind_host}:{config.port}"
                logger.info(f"Opening browser at {url}")
                try:
                    webbrowser.open(url)
                except Exception as e:
                    logger.warning(f"Could not open browser: {e}")

            browser_thread = threading.Thread(target=open_browser, daemon=True)
            browser_thread.start()

        uvicorn.run(
            app,
            host=config.bind_host,
            port=config.port,
            log_level="info",
        )

    except KeyboardInterrupt:
        logger.info("Shutting down (Ctrl+C)")
        sys.exit(0)
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
