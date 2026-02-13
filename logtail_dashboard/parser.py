"""CSV parser for tracker log files."""

import csv
import logging
from datetime import datetime
from io import StringIO
from typing import Optional

from .models import TrackerRecord

logger = logging.getLogger(__name__)

# Field name mappings for flexible CSV parsing
# Supports both dashboard format and GPS Tracker 2025 manual formats (Receiver CSV & SD Card CSV)
FIELD_MAPPINGS = {
    # Tracker ID: Report_StationID (receiver), User_LoggerID (SD card), or dashboard format
    "tracker_id": [
        "tracker_id", "id", "tracker", "device_id", "unit_id", "unique_id", "unique id",
        "report_stationid", "user_loggerid", "logger_id", "loggerid", "station_id", "stationid",
    ],
    # Time: Measurement_DateTime (manual) or dashboard format
    "time": [
        "time", "timestamp", "datetime", "time_local", "received_time",
        "time local received", "time_local_received",
        "measurement_datetime", "measurement_receiveddatetime",
    ],
    "time_gps": ["time_gps", "gps_time", "gps_timestamp"],
    # Position: GPS_lat, GPS_lon, GPS_alt (manual format)
    "lat": ["lat", "latitude", "gps_lat"],
    "lon": ["lon", "lng", "longitude", "gps_lon"],
    "alt": ["alt", "altitude", "alt_m", "altitude_m", "gps_alt"],
    # Speed/Course: GPS_SOG, GPS_COG (manual format - SOG in m/s, COG in degrees)
    "speed": ["speed", "speed_mps", "speed_m_s", "gps_sog", "sog"],
    "course": ["course", "heading", "course_deg", "gps_cog", "cog"],
    # GPS Quality: GPS_HDOP, GPS_FixValid, satellites (manual format)
    "hdop": ["hdop", "dop", "gps_hdop"],
    "satellites": ["satellites", "sats", "num_sats", "gps_satellites", "sat_count", "numsat"],
    "fix_valid": [
        "fix_valid", "fix", "gps_fix", "valid", "gps_fix_valid", "gps fix valid",
        "gps_fixvalid", "fixvalid",
    ],
    # Signal strength: RF_RSSI (manual format)
    "rssi": ["rssi", "rssi_dbm", "signal", "rf_rssi"],
    # Received time for latency calculation: Measurement_ReceivedDateTime (manual format)
    "time_received": [
        "time_received", "received_time", "rx_time", "receive_time",
        "measurement_receiveddatetime", "received_datetime",
    ],
    # Barometer: Barometer_Altitude, Barometer_Temperature, Barometer_Pressure (manual format)
    "baro_alt": [
        "baro_alt", "baro_altitude", "baro_alt_m", "barometric_altitude", "barometric altitude",
        "barometer_altitude",
    ],
    "baro_temp": ["baro_temp", "baro_temperature", "temp_c", "barometer_temperature"],
    "baro_press": ["baro_press", "baro_pressure", "pressure_hpa", "barometer_pressure"],
    # Battery voltage (SD card format): Battery_mV
    "battery_mv": ["battery_mv", "battery", "voltage_mv"],
}


class CSVParser:
    """Parser for tracker CSV log files."""

    def __init__(self):
        """Initialize parser."""
        self._field_indices: dict[str, int] = {}
        self._headers: list[str] = []

    def parse_csv(self, file_path) -> list[TrackerRecord]:
        """
        Parse a CSV file into tracker records.

        Args:
            file_path: Path to the CSV file.

        Returns:
            List of parsed and normalized tracker records.
        """
        try:
            from pathlib import Path
            path = Path(file_path)
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
                return self.parse_csv_content(content)
        except Exception as e:
            logger.error(f"Failed to read CSV file {file_path}: {e}")
            return []

    def parse_csv_content(self, content: str) -> list[TrackerRecord]:
        """
        Parse CSV content into tracker records.

        Args:
            content: CSV content as string.

        Returns:
            List of parsed and normalized tracker records.
        """
        records = []

        try:
            # Parse CSV
            reader = csv.reader(StringIO(content))
            rows = list(reader)

            if len(rows) < 2:
                # Need at least header + 1 data row
                return records

            # First row is header
            headers = [h.strip().lower() for h in rows[0]]
            self._headers = headers
            self._build_field_indices(headers)

            # Parse data rows
            for row_num, row in enumerate(rows[1:], start=2):
                try:
                    record = self._parse_row(row)
                    if record:
                        records.append(record)
                except Exception as e:
                    logger.warning(f"Failed to parse row {row_num}: {e}")
                    continue

        except Exception as e:
            logger.error(f"Failed to parse CSV content: {e}")

        return records

    def _build_field_indices(self, headers: list[str]) -> None:
        """
        Build index mapping from normalized field names to column indices.

        Args:
            headers: List of header names from CSV.
        """
        self._field_indices = {}

        for field_name, variants in FIELD_MAPPINGS.items():
            for variant in variants:
                if variant in headers:
                    self._field_indices[field_name] = headers.index(variant)
                    break

        logger.debug(f"Field indices: {self._field_indices}")

    def _parse_row(self, row: list[str]) -> Optional[TrackerRecord]:
        """
        Parse a single CSV row into a TrackerRecord.

        Args:
            row: List of values from CSV row.

        Returns:
            Normalized TrackerRecord or None if row is invalid.
        """
        # Must have tracker_id
        if "tracker_id" not in self._field_indices:
            logger.warning("CSV has no tracker_id column")
            return None

        tracker_id_idx = self._field_indices["tracker_id"]
        if tracker_id_idx >= len(row):
            return None

        tracker_id = row[tracker_id_idx].strip()
        if not tracker_id:
            return None

        # Parse time (fallback to now if not present)
        time_local = self._parse_datetime(row, "time")
        if time_local is None:
            time_local = datetime.now()

        # Parse GPS time
        time_gps = self._parse_datetime(row, "time_gps")

        # Parse received time (for latency calculation)
        time_received = self._parse_datetime(row, "time_received")

        # Parse position fields
        lat = self._parse_float(row, "lat")
        lon = self._parse_float(row, "lon")
        alt_m = self._parse_float(row, "alt")

        # Parse speed/course
        speed_mps = self._parse_float(row, "speed")
        course_deg = self._parse_float(row, "course")

        # Parse GPS quality
        hdop = self._parse_float(row, "hdop")
        satellites = self._parse_int(row, "satellites")
        fix_valid = self._parse_bool(row, "fix_valid")

        # Parse signal strength
        rssi_dbm = self._parse_float(row, "rssi")

        # Parse barometer data
        baro_alt_m = self._parse_float(row, "baro_alt")
        baro_temp_c = self._parse_float(row, "baro_temp")
        baro_press_hpa = self._parse_float(row, "baro_press")

        # Parse battery voltage (SD card format)
        battery_mv = self._parse_float(row, "battery_mv")

        # Calculate latency if both timestamps are available
        latency_ms = None
        if time_local and time_received:
            delta = time_received - time_local
            latency_ms = delta.total_seconds() * 1000

        return TrackerRecord(
            tracker_id=tracker_id,
            time_local_received=time_local,
            time_gps=time_gps,
            time_received=time_received,
            lat=lat,
            lon=lon,
            alt_m=alt_m,
            speed_mps=speed_mps,
            course_deg=course_deg,
            hdop=hdop,
            satellites=satellites,
            rssi_dbm=rssi_dbm,
            baro_alt_m=baro_alt_m,
            baro_temp_c=baro_temp_c,
            baro_press_hpa=baro_press_hpa,
            fix_valid=fix_valid,
            battery_mv=battery_mv,
            latency_ms=latency_ms,
        )

    def _parse_float(self, row: list[str], field_name: str) -> Optional[float]:
        """
        Parse a float value from row.

        Args:
            row: CSV row values.
            field_name: Normalized field name.

        Returns:
            Float value or None if not present/invalid.
        """
        if field_name not in self._field_indices:
            return None

        idx = self._field_indices[field_name]
        if idx >= len(row):
            return None

        value = row[idx].strip()
        if not value:
            return None

        try:
            return float(value)
        except ValueError:
            return None

    def _parse_int(self, row: list[str], field_name: str) -> Optional[int]:
        """
        Parse an integer value from row.

        Args:
            row: CSV row values.
            field_name: Normalized field name.

        Returns:
            Integer value or None if not present/invalid.
        """
        if field_name not in self._field_indices:
            return None

        idx = self._field_indices[field_name]
        if idx >= len(row):
            return None

        value = row[idx].strip()
        if not value:
            return None

        try:
            return int(float(value))  # Handle "7.0" -> 7
        except ValueError:
            return None

    def _parse_bool(self, row: list[str], field_name: str) -> bool:
        """
        Parse a boolean value from row.

        Args:
            row: CSV row values.
            field_name: Normalized field name.

        Returns:
            Boolean value (default False if not present/invalid).
        """
        if field_name not in self._field_indices:
            return False

        idx = self._field_indices[field_name]
        if idx >= len(row):
            return False

        value = row[idx].strip().lower()
        if not value:
            return False

        # Handle various boolean representations
        return value in ["true", "1", "yes", "y", "valid", "ok"]

    def _parse_datetime(self, row: list[str], field_name: str) -> Optional[datetime]:
        """
        Parse a datetime value from row.

        Args:
            row: CSV row values.
            field_name: Normalized field name.

        Returns:
            Datetime value or None if not present/invalid.
        """
        if field_name not in self._field_indices:
            return None

        idx = self._field_indices[field_name]
        if idx >= len(row):
            return None

        value = row[idx].strip()
        if not value:
            return None

        # Try common datetime formats
        formats = [
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%dT%H:%M:%S.%f",
            "%Y-%m-%d %H:%M:%S.%f",
            "%Y-%m-%dT%H:%M:%SZ",
            "%m/%d/%Y %H:%M:%S",
            "%d/%m/%Y %H:%M:%S",
        ]

        for fmt in formats:
            try:
                return datetime.strptime(value, fmt)
            except ValueError:
                continue

        # Try ISO format with timezone
        try:
            # Remove timezone info for simplicity
            if "+" in value or value.endswith("Z"):
                value = value.split("+")[0].split("Z")[0]
                return datetime.fromisoformat(value)
        except ValueError:
            pass

        logger.warning(f"Could not parse datetime: {value}")
        return None


def parse_csv_file(file_path: str) -> list[TrackerRecord]:
    """
    Parse a complete CSV file.

    Args:
        file_path: Path to CSV file.

    Returns:
        List of parsed tracker records.
    """
    parser = CSVParser()

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
            return parser.parse_csv_content(content)
    except Exception as e:
        logger.error(f"Failed to read CSV file {file_path}: {e}")
        return []


# Alias for backward compatibility
Parser = CSVParser
