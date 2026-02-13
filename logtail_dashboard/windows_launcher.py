"""Windows-specific launcher for SCENSUS Dashboard.

This module provides Windows-specific features:
- First-run folder selection dialog
- Standalone window using PyWebView (no browser needed)
- User-friendly error dialogs

Used by PyInstaller for Windows distribution.
"""

import json
import logging
import os
import sys
import threading
from pathlib import Path
from time import sleep

# Configure simple logging FIRST before any other imports
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


def get_config_path() -> Path:
    """Get the path to config.json using proper Windows conventions."""
    from logtail_dashboard.config import get_config_path as _get_config_path
    return _get_config_path()


def find_available_port(start_port: int = 8082, max_attempts: int = 10) -> int:
    """Find an available port starting from start_port.

    Args:
        start_port: Port number to start checking from.
        max_attempts: Maximum number of ports to try.

    Returns:
        An available port number, or start_port as fallback.
    """
    import socket
    for port in range(start_port, start_port + max_attempts):
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(1)
            sock.bind(('127.0.0.1', port))
            sock.close()
            return port
        except OSError:
            logger.debug(f"Port {port} is in use, trying next...")
            continue
    logger.warning(f"Could not find available port, using {start_port}")
    return start_port


def ensure_config_exists() -> Path:
    """Create config file if it doesn't exist.

    On first run, creates a default config without prompting for folder.
    User can configure the data folder from within the app's Settings panel.
    """
    config_path = get_config_path()

    if not config_path.exists():
        logger.info("First run detected - creating default configuration...")

        # Use sensible default - user can change in Settings
        default_folder = "C:\\Temp"

        config_data = {
            "log_root_folder": default_folder,
            "port": 8082,
            "bind_host": "127.0.0.1",
            "stale_seconds": 60,
            "enable_map": True
        }

        from logtail_dashboard.config import save_config_atomic
        if save_config_atomic(config_data, config_path):
            logger.info(f"Default data folder: {default_folder}")
            logger.info("Use Settings panel in the app to change data folder")

    return config_path


def run_server(app, host: str, port: int) -> None:
    """Run uvicorn server in background thread."""
    import uvicorn
    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="warning",
        log_config=None,
        access_log=False,
    )


def show_error_dialog(message: str) -> None:
    """Show error dialog to user."""
    try:
        import tkinter as tk
        from tkinter import messagebox
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror("SCENSUS Dashboard Error", message)
        root.destroy()
    except Exception as e:
        logger.debug(f"Could not show error dialog: {e}")


def main() -> None:
    """Windows launcher entry point."""
    try:
        # Ensure config exists (first-run setup)
        config_path = ensure_config_exists()

        # Import and load config
        from logtail_dashboard.config import load_config
        config = load_config(config_path)

        # Check if configured port is available, find alternative if not
        requested_port = config.port
        actual_port = find_available_port(requested_port)
        if actual_port != requested_port:
            logger.info(f"Port {requested_port} is in use, using port {actual_port} instead")
            # Update config with available port
            config = config.model_copy(update={"port": actual_port})

        # Create application
        from logtail_dashboard.api import create_app
        app, dashboard = create_app(config)

        # Startup message
        logger.info("")
        logger.info("=" * 60)
        logger.info("          SCENSUS Dashboard")
        logger.info("      UAS Test & Evaluation Suite")
        logger.info("=" * 60)
        logger.info("")
        logger.info(f"Dashboard URL: http://{config.bind_host}:{config.port}")
        logger.info(f"Data Location: {config.log_root_folder}")
        logger.info("")

        # Start server in background thread
        server_thread = threading.Thread(
            target=run_server,
            args=(app, config.bind_host, config.port),
            daemon=True
        )
        server_thread.start()

        # Wait for server to start
        sleep(1.5)
        logger.info("Server started, launching application window...")

        # Use the React app URL for modern UI
        url = f"http://{config.bind_host}:{config.port}/app"

        # Try to create standalone window with PyWebView
        # Try different backends in order of preference
        webview_started = False

        try:
            import webview

            # Create window with app branding
            window = webview.create_window(
                title="SCENSUS Dashboard - UAS Test & Evaluation",
                url=url,
                width=1400,
                height=900,
                resizable=True,
                min_size=(1024, 700),
                text_select=True,
            )

            # Try EdgeChromium first (requires pythonnet, best experience)
            # Then try mshtml (IE-based, no pythonnet needed)
            for backend in ['edgechromium', 'mshtml']:
                try:
                    logger.info(f"Trying {backend} backend...")
                    webview.start(gui=backend)
                    webview_started = True
                    break
                except Exception as backend_error:
                    logger.warning(f"{backend} backend failed: {backend_error}")
                    continue

            if not webview_started:
                # Try default backend as last resort
                logger.info("Trying default backend...")
                webview.start()
                webview_started = True

        except Exception as webview_error:
            logger.warning(f"PyWebView failed: {webview_error}")

        if not webview_started:
            # Fall back to opening in default browser
            logger.info("Opening in default browser...")
            import webbrowser
            webbrowser.open(url)

            # Keep the server running with a minimized control window
            try:
                import tkinter as tk
                root = tk.Tk()
                root.title("SCENSUS Dashboard Server")
                root.geometry("300x100")
                root.protocol("WM_DELETE_WINDOW", root.destroy)

                label = tk.Label(root, text=f"Server running on port {config.port}\nClose this window to stop.", pady=20)
                label.pack()

                stop_btn = tk.Button(root, text="Stop Server", command=root.destroy)
                stop_btn.pack()

                # Minimize to taskbar
                root.iconify()

                root.mainloop()
            except Exception as e:
                # If tkinter fails, just wait for server thread
                logger.debug(f"Could not create control window: {e}")
                logger.info("Press Ctrl+C to stop the server...")
                server_thread.join()

        logger.info("Application closed")

    except KeyboardInterrupt:
        logger.info("Shutting down")
        sys.exit(0)
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        show_error_dialog(f"An error occurred:\n\n{str(e)}\n\nPlease check your configuration.")
        sys.exit(1)


if __name__ == "__main__":
    main()
