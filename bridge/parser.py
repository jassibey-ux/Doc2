"""
CSV Parser for Bridge Service

Lightweight parser that reads GPSLogger CSV files and produces dictionaries
suitable for JSON serialization and cloud push. Reuses column-name mapping
from the dashboard parser.
"""

import csv
import logging
from datetime import datetime
from io import StringIO
from typing import Optional

logger = logging.getLogger(__name__)

# Same field mappings as logtail_dashboard/parser.py for consistency
FIELD_MAPPINGS = {
    "tracker_id": [
        "tracker_id", "id", "tracker", "device_id", "unit_id", "unique_id", "unique id",
        "report_stationid", "user_loggerid", "logger_id", "loggerid", "station_id", "stationid",
    ],
    "time": [
        "time", "timestamp", "datetime", "time_local", "received_time",
        "time local received", "time_local_received",
        "measurement_datetime", "measurement_receiveddatetime",
    ],
    "time_gps": ["time_gps", "gps_time", "gps_timestamp"],
    "lat": ["lat", "latitude", "gps_lat"],
    "lon": ["lon", "lng", "longitude", "gps_lon"],
    "alt": ["alt", "altitude", "alt_m", "altitude_m", "gps_alt"],
    "speed": ["speed", "speed_mps", "speed_m_s", "gps_sog", "sog"],
    "course": ["course", "heading", "course_deg", "gps_cog", "cog"],
    "hdop": ["hdop", "dop", "gps_hdop"],
    "satellites": ["satellites", "sats", "num_sats", "gps_satellites", "sat_count", "numsat"],
    "fix_valid": [
        "fix_valid", "fix", "gps_fix", "valid", "gps_fix_valid", "gps fix valid",
        "gps_fixvalid", "fixvalid",
    ],
    "rssi": ["rssi", "rssi_dbm", "signal", "rf_rssi"],
    "time_received": [
        "time_received", "received_time", "rx_time", "receive_time",
        "measurement_receiveddatetime", "received_datetime",
    ],
    "baro_alt": [
        "baro_alt", "baro_altitude", "baro_alt_m", "barometric_altitude", "barometric altitude",
        "barometer_altitude",
    ],
    "baro_temp": ["baro_temp", "baro_temperature", "temp_c", "barometer_temperature"],
    "baro_press": ["baro_press", "baro_pressure", "pressure_hpa", "barometer_pressure"],
    "battery_mv": ["battery_mv", "battery", "voltage_mv"],
}

DATETIME_FORMATS = [
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%dT%H:%M:%S.%f",
    "%Y-%m-%d %H:%M:%S.%f",
    "%Y-%m-%dT%H:%M:%SZ",
    "%m/%d/%Y %H:%M:%S",
    "%d/%m/%Y %H:%M:%S",
]


def _parse_datetime(value: str) -> Optional[str]:
    """Parse datetime string and return ISO-8601 string."""
    value = value.strip()
    if not value:
        return None

    for fmt in DATETIME_FORMATS:
        try:
            dt = datetime.strptime(value, fmt)
            return dt.isoformat()
        except ValueError:
            continue

    # Try ISO format with timezone
    try:
        if "+" in value or value.endswith("Z"):
            value = value.split("+")[0].split("Z")[0]
            return datetime.fromisoformat(value).isoformat()
    except ValueError:
        pass

    return None


def _parse_float(value: str) -> Optional[float]:
    """Parse float, returning None on failure."""
    value = value.strip()
    if not value:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def _parse_int(value: str) -> Optional[int]:
    """Parse int (handles '7.0' -> 7), returning None on failure."""
    value = value.strip()
    if not value:
        return None
    try:
        return int(float(value))
    except ValueError:
        return None


def _parse_bool(value: str) -> bool:
    """Parse boolean from common representations."""
    return value.strip().lower() in ("true", "1", "yes", "y", "valid", "ok")


class BridgeCSVParser:
    """CSV parser that produces JSON-serializable dicts for cloud push."""

    def __init__(self):
        self._field_indices: dict[str, int] = {}
        self._header_line: Optional[str] = None

    def parse_content(self, content: str) -> list[dict]:
        """Parse CSV content into list of record dicts."""
        records = []
        try:
            reader = csv.reader(StringIO(content))
            rows = list(reader)
            if len(rows) < 2:
                return records

            headers = [h.strip().lower() for h in rows[0]]
            self._header_line = rows[0]
            self._build_field_indices(headers)

            for row in rows[1:]:
                record = self._parse_row(row)
                if record:
                    records.append(record)
        except Exception as e:
            logger.error(f"Failed to parse CSV content: {e}")

        return records

    def parse_new_lines(self, header_line: str, new_content: str) -> list[dict]:
        """Parse new CSV lines using a known header."""
        full_content = header_line + "\n" + new_content
        return self.parse_content(full_content)

    def _build_field_indices(self, headers: list[str]) -> None:
        self._field_indices = {}
        for field_name, variants in FIELD_MAPPINGS.items():
            for variant in variants:
                if variant in headers:
                    self._field_indices[field_name] = headers.index(variant)
                    break

    def _get(self, row: list[str], field: str) -> Optional[str]:
        idx = self._field_indices.get(field)
        if idx is None or idx >= len(row):
            return None
        val = row[idx].strip()
        return val if val else None

    def _parse_row(self, row: list[str]) -> Optional[dict]:
        tracker_id = self._get(row, "tracker_id")
        if not tracker_id:
            return None

        time_str = self._get(row, "time")
        time_iso = _parse_datetime(time_str) if time_str else datetime.now().isoformat()

        record: dict = {
            "tracker_id": tracker_id,
            "time_local": time_iso,
        }

        # Optional fields
        time_gps = self._get(row, "time_gps")
        if time_gps:
            record["time_gps"] = _parse_datetime(time_gps)

        time_received = self._get(row, "time_received")
        if time_received:
            record["time_received"] = _parse_datetime(time_received)

        for field, key, parser in [
            ("lat", "lat", _parse_float),
            ("lon", "lon", _parse_float),
            ("alt", "alt_m", _parse_float),
            ("speed", "speed_mps", _parse_float),
            ("course", "course_deg", _parse_float),
            ("hdop", "hdop", _parse_float),
            ("satellites", "satellites", _parse_int),
            ("rssi", "rssi_dbm", _parse_float),
            ("baro_alt", "baro_alt_m", _parse_float),
            ("baro_temp", "baro_temp_c", _parse_float),
            ("baro_press", "baro_press_hpa", _parse_float),
            ("battery_mv", "battery_mv", _parse_float),
        ]:
            raw = self._get(row, field)
            if raw is not None:
                val = parser(raw)
                if val is not None:
                    record[key] = val

        fix_raw = self._get(row, "fix_valid")
        record["fix_valid"] = _parse_bool(fix_raw) if fix_raw else False

        return record
