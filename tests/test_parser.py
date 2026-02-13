"""Tests for CSV parser."""

import pytest
from datetime import datetime

from logtail_dashboard.parser import CSVParser, parse_csv_file


class TestCSVParser:
    """Test CSV parser functionality."""

    def test_basic_parsing(self):
        """Test parsing basic CSV format."""
        csv_content = """tracker_id,time,lat,lon,alt,fix_valid
101,2024-01-15T14:30:00,34.0522,-118.2437,125.5,true
102,2024-01-15T14:30:30,34.0523,-118.2436,126.0,false
"""

        parser = CSVParser()
        records = parser.parse_csv_content(csv_content)

        assert len(records) == 2

        # Check first record
        assert records[0].tracker_id == "101"
        assert records[0].lat == 34.0522
        assert records[0].lon == -118.2437
        assert records[0].alt_m == 125.5
        assert records[0].fix_valid is True

        # Check second record
        assert records[1].tracker_id == "102"
        assert records[1].fix_valid is False

    def test_alternative_column_names(self):
        """Test parsing with alternative column names."""
        csv_content = """id,timestamp,latitude,longitude,altitude_m,gps_fix
101,2024-01-15 14:30:00,34.0522,-118.2437,125.5,1
"""

        parser = CSVParser()
        records = parser.parse_csv_content(csv_content)

        assert len(records) == 1
        assert records[0].tracker_id == "101"
        assert records[0].lat == 34.0522
        assert records[0].lon == -118.2437
        assert records[0].alt_m == 125.5
        assert records[0].fix_valid is True

    def test_optional_fields(self):
        """Test parsing with optional fields."""
        csv_content = """tracker_id,time,rssi,baro_alt,baro_temp,baro_press
101,2024-01-15T14:30:00,-85,1200.5,22.3,1013.25
"""

        parser = CSVParser()
        records = parser.parse_csv_content(csv_content)

        assert len(records) == 1
        assert records[0].rssi_dbm == -85
        assert records[0].baro_alt_m == 1200.5
        assert records[0].baro_temp_c == 22.3
        assert records[0].baro_press_hpa == 1013.25

    def test_missing_optional_fields(self):
        """Test parsing with missing optional fields."""
        csv_content = """tracker_id,time
101,2024-01-15T14:30:00
"""

        parser = CSVParser()
        records = parser.parse_csv_content(csv_content)

        assert len(records) == 1
        assert records[0].tracker_id == "101"
        assert records[0].lat is None
        assert records[0].lon is None
        assert records[0].rssi_dbm is None

    def test_empty_values(self):
        """Test parsing with empty values."""
        csv_content = """tracker_id,time,lat,lon,alt
101,2024-01-15T14:30:00,,,
"""

        parser = CSVParser()
        records = parser.parse_csv_content(csv_content)

        assert len(records) == 1
        assert records[0].lat is None
        assert records[0].lon is None
        assert records[0].alt_m is None

    def test_invalid_values(self):
        """Test parsing with invalid numeric values."""
        csv_content = """tracker_id,time,lat,lon,alt
101,2024-01-15T14:30:00,invalid,invalid,invalid
"""

        parser = CSVParser()
        records = parser.parse_csv_content(csv_content)

        assert len(records) == 1
        assert records[0].lat is None
        assert records[0].lon is None
        assert records[0].alt_m is None

    def test_datetime_formats(self):
        """Test parsing various datetime formats."""
        test_cases = [
            "2024-01-15T14:30:00",
            "2024-01-15 14:30:00",
            "2024-01-15T14:30:00.123",
            "2024-01-15T14:30:00Z",
            "01/15/2024 14:30:00",
        ]

        for datetime_str in test_cases:
            csv_content = f"""tracker_id,time
101,{datetime_str}
"""

            parser = CSVParser()
            records = parser.parse_csv_content(csv_content)

            assert len(records) == 1
            assert isinstance(records[0].time_local_received, datetime)

    def test_boolean_representations(self):
        """Test parsing various boolean representations."""
        test_cases = [
            ("true", True),
            ("false", False),
            ("1", True),
            ("0", False),
            ("yes", True),
            ("no", False),
            ("valid", True),
            ("invalid", False),
        ]

        for bool_str, expected in test_cases:
            csv_content = f"""tracker_id,time,fix_valid
101,2024-01-15T14:30:00,{bool_str}
"""

            parser = CSVParser()
            records = parser.parse_csv_content(csv_content)

            assert len(records) == 1
            assert records[0].fix_valid == expected, f"Failed for {bool_str}"

    def test_whitespace_handling(self):
        """Test handling of whitespace in values."""
        csv_content = """tracker_id,time,lat,lon
 101 , 2024-01-15T14:30:00 , 34.0522 , -118.2437
"""

        parser = CSVParser()
        records = parser.parse_csv_content(csv_content)

        assert len(records) == 1
        assert records[0].tracker_id == "101"
        assert records[0].lat == 34.0522
        assert records[0].lon == -118.2437

    def test_empty_csv(self):
        """Test parsing empty CSV."""
        csv_content = ""

        parser = CSVParser()
        records = parser.parse_csv_content(csv_content)

        assert len(records) == 0

    def test_header_only(self):
        """Test parsing CSV with header only."""
        csv_content = """tracker_id,time,lat,lon
"""

        parser = CSVParser()
        records = parser.parse_csv_content(csv_content)

        assert len(records) == 0

    def test_missing_tracker_id(self):
        """Test parsing CSV without tracker_id column."""
        csv_content = """time,lat,lon
2024-01-15T14:30:00,34.0522,-118.2437
"""

        parser = CSVParser()
        records = parser.parse_csv_content(csv_content)

        assert len(records) == 0

    def test_empty_tracker_id(self):
        """Test parsing row with empty tracker_id."""
        csv_content = """tracker_id,time,lat,lon
,2024-01-15T14:30:00,34.0522,-118.2437
101,2024-01-15T14:30:30,34.0523,-118.2436
"""

        parser = CSVParser()
        records = parser.parse_csv_content(csv_content)

        # Should skip row with empty tracker_id
        assert len(records) == 1
        assert records[0].tracker_id == "101"

    def test_speed_and_course(self):
        """Test parsing speed and course fields."""
        csv_content = """tracker_id,time,speed,course
101,2024-01-15T14:30:00,12.5,45.0
"""

        parser = CSVParser()
        records = parser.parse_csv_content(csv_content)

        assert len(records) == 1
        assert records[0].speed_mps == 12.5
        assert records[0].course_deg == 45.0

    def test_hdop_field(self):
        """Test parsing HDOP field."""
        csv_content = """tracker_id,time,hdop
101,2024-01-15T14:30:00,1.2
"""

        parser = CSVParser()
        records = parser.parse_csv_content(csv_content)

        assert len(records) == 1
        assert records[0].hdop == 1.2

    def test_gps_time_field(self):
        """Test parsing GPS time field."""
        csv_content = """tracker_id,time,time_gps
101,2024-01-15T14:30:00,2024-01-15T14:29:55
"""

        parser = CSVParser()
        records = parser.parse_csv_content(csv_content)

        assert len(records) == 1
        assert records[0].time_gps is not None
        assert isinstance(records[0].time_gps, datetime)

    def test_multiple_rows(self):
        """Test parsing multiple rows from same tracker."""
        csv_content = """tracker_id,time,lat,lon
101,2024-01-15T14:30:00,34.0522,-118.2437
101,2024-01-15T14:30:30,34.0523,-118.2436
101,2024-01-15T14:31:00,34.0524,-118.2435
"""

        parser = CSVParser()
        records = parser.parse_csv_content(csv_content)

        assert len(records) == 3
        assert all(r.tracker_id == "101" for r in records)

        # Check progression
        assert records[0].lat == 34.0522
        assert records[1].lat == 34.0523
        assert records[2].lat == 34.0524

    def test_case_insensitive_headers(self):
        """Test that header matching is case-insensitive."""
        csv_content = """TRACKER_ID,TIME,LAT,LON
101,2024-01-15T14:30:00,34.0522,-118.2437
"""

        parser = CSVParser()
        records = parser.parse_csv_content(csv_content)

        assert len(records) == 1
        assert records[0].tracker_id == "101"
        assert records[0].lat == 34.0522
