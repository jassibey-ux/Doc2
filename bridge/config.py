"""
Bridge Service Configuration

Configuration for the Windows CSV Watcher → Cloud Push bridge service.
"""

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


@dataclass
class BridgeConfig:
    """Bridge service configuration."""

    # Cloud API settings
    cloud_url: str = "https://api.scensus.io"
    api_key: str = ""  # HMAC secret key
    organization_id: str = ""

    # CSV watch settings
    watch_folder: str = r"C:\Temp"
    watch_interval_s: float = 1.0
    csv_glob_pattern: str = "*.csv"

    # Push settings
    push_interval_s: float = 5.0
    batch_size: int = 100
    max_retry_attempts: int = 5
    retry_base_delay_s: float = 1.0
    retry_max_delay_s: float = 60.0

    # Buffer settings
    buffer_db_path: str = ""  # SQLite store-and-forward path

    # Logging
    log_level: str = "INFO"
    log_file: Optional[str] = None

    @classmethod
    def load(cls, config_path: Optional[str] = None) -> "BridgeConfig":
        """Load config from JSON file."""
        if config_path is None:
            config_path = os.environ.get(
                "BRIDGE_CONFIG",
                str(Path.home() / ".scensus" / "bridge_config.json"),
            )

        config = cls()

        if os.path.exists(config_path):
            with open(config_path) as f:
                data = json.load(f)
                for key, value in data.items():
                    if hasattr(config, key):
                        setattr(config, key, value)

        # Set default buffer path
        if not config.buffer_db_path:
            config.buffer_db_path = str(
                Path.home() / ".scensus" / "bridge_buffer.db"
            )

        return config

    def save(self, config_path: Optional[str] = None) -> None:
        """Save config to JSON file."""
        if config_path is None:
            config_path = str(Path.home() / ".scensus" / "bridge_config.json")

        os.makedirs(os.path.dirname(config_path), exist_ok=True)
        with open(config_path, "w") as f:
            json.dump(self.__dict__, f, indent=2)
