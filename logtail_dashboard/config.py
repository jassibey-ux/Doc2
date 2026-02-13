"""Configuration management for SCENSUS Dashboard."""

import argparse
import json
import logging
import os
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field, field_validator

logger = logging.getLogger(__name__)


class Config(BaseModel):
    """Application configuration."""

    log_root_folder: str = Field(default="C:\\Temp")
    active_event: Optional[str] = Field(default=None)
    port: int = Field(default=8082, ge=1, le=65535)
    bind_host: str = Field(default="127.0.0.1")
    stale_seconds: int = Field(default=60, ge=1)
    enable_map: bool = Field(default=True)

    # Battery thresholds (millivolts)
    low_battery_mv: int = Field(default=3300, ge=2500, le=4500)  # 3.3V - Low warning (~20%)
    critical_battery_mv: int = Field(default=3000, ge=2500, le=4500)  # 3.0V - Critical

    @field_validator("log_root_folder")
    @classmethod
    def validate_log_root(cls, v: str) -> str:
        """Ensure log root folder path is valid."""
        if not v:
            raise ValueError("log_root_folder cannot be empty")
        return v

    @field_validator("bind_host")
    @classmethod
    def validate_bind_host(cls, v: str) -> str:
        """Ensure bind host is valid."""
        if v not in ["127.0.0.1", "localhost", "0.0.0.0"]:
            # Allow any IP address format for flexibility
            pass
        return v


def get_config_path() -> Path:
    """
    Get the path to config.json using proper Windows conventions.

    On Windows (or frozen exe): %LOCALAPPDATA%\\SCENSUS\\config.json
    Otherwise (dev mode): config.json in current directory.

    Also migrates legacy config from next to the EXE if the new location
    doesn't exist yet.

    Returns:
        Path to config.json.
    """
    import sys
    import shutil

    is_windows = os.name == "nt"
    is_frozen = getattr(sys, 'frozen', False)

    if is_windows or is_frozen:
        local_appdata = os.environ.get("LOCALAPPDATA")
        if local_appdata:
            config_dir = Path(local_appdata) / "SCENSUS"
            config_dir.mkdir(parents=True, exist_ok=True)
            config_path = config_dir / "config.json"

            # Migrate legacy config from next to EXE
            if not config_path.exists() and is_frozen:
                legacy_path = Path(sys.executable).parent / "config.json"
                if legacy_path.exists():
                    try:
                        shutil.copy2(legacy_path, config_path)
                        logger.info(f"Migrated config from {legacy_path} to {config_path}")
                    except Exception as e:
                        logger.warning(f"Failed to migrate config: {e}")

            return config_path

    # Dev mode fallback
    return Path("config.json")


def save_config_atomic(config_data: dict, config_path: Optional[Path] = None) -> bool:
    """
    Save configuration to JSON file atomically.

    Uses write-to-temp-then-rename pattern to prevent partial writes
    from corrupting the config file.

    Args:
        config_data: Dictionary of configuration data to save.
        config_path: Path to config.json. If None, uses current directory.

    Returns:
        True if save was successful, False otherwise.
    """
    import tempfile
    import shutil

    if config_path is None:
        config_path = get_config_path()

    try:
        # Create temp file in same directory to ensure same filesystem
        config_dir = config_path.parent
        config_dir.mkdir(parents=True, exist_ok=True)

        # Write to temp file first
        fd, temp_path = tempfile.mkstemp(
            suffix=".tmp",
            prefix="config_",
            dir=config_dir
        )
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as f:
                json.dump(config_data, f, indent=2)

            # Atomic rename (on same filesystem)
            # On Windows, we need to remove target first
            if config_path.exists():
                backup_path = config_path.with_suffix('.json.bak')
                shutil.copy2(config_path, backup_path)

            # Replace original with temp file
            shutil.move(temp_path, config_path)
            logger.info(f"Configuration saved atomically to {config_path}")
            return True

        except Exception as e:
            # Clean up temp file on failure
            try:
                os.unlink(temp_path)
            except OSError:
                pass
            raise e

    except Exception as e:
        logger.error(f"Failed to save config atomically: {e}")
        return False


def load_config(config_path: Optional[Path] = None) -> Config:
    """
    Load configuration from JSON file.

    Args:
        config_path: Path to config.json. If None, looks in current directory.

    Returns:
        Config object with loaded or default values.
    """
    if config_path is None:
        config_path = get_config_path()

    if config_path.exists():
        logger.info(f"Loading configuration from {config_path}")
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return Config(**data)
        except Exception as e:
            logger.warning(f"Failed to load config from {config_path}: {e}")
            logger.info("Using default configuration")
            return Config()
    else:
        logger.info(f"Config file {config_path} not found, using defaults")
        return Config()


def parse_args() -> argparse.Namespace:
    """
    Parse command-line arguments.

    Returns:
        Parsed arguments namespace.
    """
    parser = argparse.ArgumentParser(
        description="SCENSUS Dashboard - GPS/LoRa tracker log monitoring",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )

    parser.add_argument(
        "--log-root",
        type=str,
        help="Override log root folder path",
    )

    parser.add_argument(
        "--event",
        type=str,
        help="Override active event folder name",
    )

    parser.add_argument(
        "--port",
        type=int,
        help="Override HTTP server port",
    )

    parser.add_argument(
        "--host",
        type=str,
        help="Override bind host (127.0.0.1 or 0.0.0.0)",
    )

    parser.add_argument(
        "--stale-seconds",
        type=int,
        help="Override stale threshold in seconds",
    )

    parser.add_argument(
        "--config",
        type=str,
        help="Path to config.json file",
    )

    return parser.parse_args()


def merge_config(config: Config, args: argparse.Namespace) -> Config:
    """
    Merge CLI arguments into configuration.

    Args:
        config: Base configuration from file or defaults.
        args: Parsed command-line arguments.

    Returns:
        Merged configuration.
    """
    updates = {}

    if args.log_root is not None:
        updates["log_root_folder"] = args.log_root

    if args.event is not None:
        updates["active_event"] = args.event

    if args.port is not None:
        updates["port"] = args.port

    if args.host is not None:
        updates["bind_host"] = args.host

    if args.stale_seconds is not None:
        updates["stale_seconds"] = args.stale_seconds

    if updates:
        logger.info(f"Applying CLI overrides: {updates}")
        config = config.model_copy(update=updates)

    return config


def get_config() -> Config:
    """
    Get merged configuration from file and CLI arguments.

    Returns:
        Final configuration to use.
    """
    args = parse_args()

    config_path = Path(args.config) if args.config else None
    config = load_config(config_path)
    config = merge_config(config, args)

    return config
