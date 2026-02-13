"""NMEA parser for LoRa GPS RX proprietary format."""

import logging
import re
from datetime import datetime
from typing import Optional

from .models import TrackerRecord

logger = logging.getLogger(__name__)


def _nmea_to_decimal(coord: str, direction: str) -> Optional[float]:
    """Convert NMEA coordinate (DDMM.MMMM or DDDMM.MMMM) to decimal degrees.

    Args:
        coord: Coordinate string in NMEA format (e.g., '3850.6831' for lat or '07704.5878' for lon)
        direction: Direction indicator (N/S for lat, E/W for lon)

    Returns:
        Decimal degrees (negative for S/W), or None if invalid.
    """
    if not coord or not direction:
        return None
    try:
        # Latitude is DDMM.MMMM (2 digits for degrees)
        # Longitude is DDDMM.MMMM (3 digits for degrees)
        # Determine split point based on direction
        if direction.upper() in ('N', 'S'):
            # Latitude: first 2 chars are degrees
            degrees = int(coord[:2])
            minutes = float(coord[2:])
        else:
            # Longitude: first 3 chars are degrees
            degrees = int(coord[:3])
            minutes = float(coord[3:])

        decimal = degrees + minutes / 60.0

        # Apply sign for S/W
        if direction.upper() in ('S', 'W'):
            decimal = -decimal

        return decimal
    except (ValueError, IndexError):
        return None


class NMEAParser:
    """Parser for LoRa GPS RX NMEA-style log files.

    Parses proprietary NMEA sentences:
    - $RFMSGFROM,tracker_id,... - Start of message block
    - $BAROALT,pressure,temp,offset - Barometric data
    - $BATMV,millivolts - Battery voltage
    - $HRFSSI,dbm - Signal strength
    - $RXTIMESTAMP,year,month,day,hour,min,sec - Timestamp
    - $RFMSGEND - End of message block

    Parses standard NMEA GPS sentences:
    - $GPGGA - GPS fix data (position, altitude, satellites, HDOP)
    - $GPRMC - Recommended minimum (time, date, speed, course, validity)

    Legacy proprietary GPS sentences (also supported):
    - $GPSLAT,latitude - GPS latitude
    - $GPSLON,longitude - GPS longitude
    - $GPSALT,altitude - GPS altitude
    - $GPSSPEED,speed - GPS speed
    - $GPSCOURSE,course - GPS course
    - $GPSFIX,valid - GPS fix status
    """

    def parse_nmea_content(self, content: str) -> list[TrackerRecord]:
        """
        Parse NMEA content into tracker records.

        Args:
            content: NMEA content as string.

        Returns:
            List of parsed tracker records.
        """
        records = []
        current_block: dict = {}

        for line in content.split('\n'):
            line = line.strip()
            if not line or not line.startswith('$'):
                continue

            # Remove checksum if present (everything after *)
            if '*' in line:
                line = line.split('*')[0] + '*'

            try:
                record = self._parse_sentence(line, current_block)
                if record:
                    records.append(record)
                    current_block = {}
            except Exception as e:
                logger.debug(f"Failed to parse NMEA sentence: {line} - {e}")
                continue

        return records

    def _parse_sentence(self, sentence: str, block: dict) -> Optional[TrackerRecord]:
        """
        Parse a single NMEA sentence and update the current block.

        Args:
            sentence: NMEA sentence string.
            block: Current message block being built.

        Returns:
            TrackerRecord if block is complete, None otherwise.
        """
        # Remove $ prefix and * suffix
        sentence = sentence.strip('$*')
        parts = sentence.split(',')

        if not parts:
            return None

        msg_type = parts[0].upper()

        if msg_type == 'RFMSGFROM':
            # Start of message block: $RFMSGFROM,tracker_id,...
            if len(parts) >= 2:
                block['tracker_id'] = parts[1]

        elif msg_type == 'BAROALT':
            # Barometric data: $BAROALT,pressure_pa,temp_c,offset
            if len(parts) >= 3:
                try:
                    # Pressure appears to be in Pa, convert to hPa
                    pressure_pa = float(parts[1])
                    block['baro_press_hpa'] = pressure_pa / 100.0
                    block['baro_temp_c'] = float(parts[2])
                    # Calculate altitude from pressure (simple formula)
                    # Using barometric formula: alt = 44330 * (1 - (P/P0)^0.1903)
                    # P0 = 101325 Pa (sea level)
                    p0 = 101325.0
                    block['baro_alt_m'] = 44330.0 * (1 - (pressure_pa / p0) ** 0.1903)
                except (ValueError, IndexError):
                    pass

        elif msg_type == 'BATMV':
            # Battery voltage: $BATMV,millivolts
            if len(parts) >= 2:
                try:
                    block['battery_mv'] = float(parts[1])
                except ValueError:
                    pass

        elif msg_type == 'HRFSSI':
            # Signal strength: $HRFSSI,dbm
            if len(parts) >= 2:
                try:
                    block['rssi_dbm'] = float(parts[1])
                except ValueError:
                    pass

        elif msg_type == 'GPGGA':
            # Standard NMEA GPS fix data
            # Format: $GPGGA,HHMMSS.ss,lat,N/S,lon,E/W,quality,sats,hdop,alt,M,geoid,M,age,station*CS
            # Example: $GPGGA,053401.500,3850.6831,N,07704.5878,W,1,04,07.4,09.5,M,-34.0,M,0,0*6D
            if len(parts) >= 10:
                try:
                    # Parse latitude (field 2,3)
                    lat = _nmea_to_decimal(parts[2], parts[3])
                    if lat is not None:
                        block['lat'] = lat

                    # Parse longitude (field 4,5)
                    lon = _nmea_to_decimal(parts[4], parts[5])
                    if lon is not None:
                        block['lon'] = lon

                    # Fix quality (field 6): 0=invalid, 1=GPS, 2=DGPS
                    fix_quality = int(parts[6]) if parts[6] else 0
                    block['fix_valid'] = fix_quality > 0

                    # Number of satellites (field 7)
                    if parts[7]:
                        block['satellites'] = int(parts[7])

                    # HDOP (field 8)
                    if parts[8]:
                        block['hdop'] = float(parts[8])

                    # Altitude (field 9)
                    if parts[9]:
                        block['alt_m'] = float(parts[9])

                except (ValueError, IndexError):
                    pass

        elif msg_type == 'GPRMC':
            # Standard NMEA Recommended Minimum
            # Format: $GPRMC,HHMMSS.ss,status,lat,N/S,lon,E/W,speed,course,DDMMYY,mag,E/W,mode*CS
            # Example: $GPRMC,053401.500,A,3850.6831,N,07704.5878,W,000.0,000.0,180126,,,A*72
            if len(parts) >= 10:
                try:
                    # Status (field 2): A=valid, V=void
                    status = parts[2].upper() if parts[2] else 'V'
                    if status == 'A':
                        block['fix_valid'] = True

                        # Parse latitude (field 3,4) - only if valid
                        lat = _nmea_to_decimal(parts[3], parts[4])
                        if lat is not None:
                            block['lat'] = lat

                        # Parse longitude (field 5,6)
                        lon = _nmea_to_decimal(parts[5], parts[6])
                        if lon is not None:
                            block['lon'] = lon

                    # Speed over ground (field 7) - knots to m/s
                    if parts[7]:
                        speed_knots = float(parts[7])
                        block['speed_mps'] = speed_knots * 0.514444

                    # Course over ground (field 8)
                    if parts[8]:
                        block['course_deg'] = float(parts[8])

                    # Parse GPS time from fields 1 (time) and 9 (date)
                    if parts[1] and parts[9]:
                        time_str = parts[1].split('.')[0]  # HHMMSS
                        date_str = parts[9]  # DDMMYY
                        if len(time_str) >= 6 and len(date_str) >= 6:
                            hour = int(time_str[0:2])
                            minute = int(time_str[2:4])
                            second = int(time_str[4:6])
                            day = int(date_str[0:2])
                            month = int(date_str[2:4])
                            year = int(date_str[4:6])
                            # Convert 2-digit year (assume 2000s)
                            year = 2000 + year if year < 100 else year
                            block['time_gps'] = datetime(year, month, day, hour, minute, second)

                except (ValueError, IndexError):
                    pass

        elif msg_type == 'RXTIMESTAMP':
            # Timestamp: $RXTIMESTAMP,year,month,day,hour,min,sec.ms
            if len(parts) >= 7:
                try:
                    year = int(parts[1])
                    month = int(parts[2])
                    day = int(parts[3])
                    hour = int(parts[4])
                    minute = int(parts[5])
                    sec_parts = parts[6].split('.')
                    second = int(sec_parts[0])
                    microsecond = int(float('0.' + sec_parts[1]) * 1000000) if len(sec_parts) > 1 else 0
                    block['timestamp'] = datetime(year, month, day, hour, minute, second, microsecond)
                except (ValueError, IndexError):
                    pass

        elif msg_type == 'GPSLAT' or msg_type == 'GPS_LAT':
            if len(parts) >= 2:
                try:
                    block['lat'] = float(parts[1])
                except ValueError:
                    pass

        elif msg_type == 'GPSLON' or msg_type == 'GPS_LON':
            if len(parts) >= 2:
                try:
                    block['lon'] = float(parts[1])
                except ValueError:
                    pass

        elif msg_type == 'GPSALT' or msg_type == 'GPS_ALT':
            if len(parts) >= 2:
                try:
                    block['alt_m'] = float(parts[1])
                except ValueError:
                    pass

        elif msg_type == 'GPSSPEED' or msg_type == 'GPS_SPEED':
            if len(parts) >= 2:
                try:
                    block['speed_mps'] = float(parts[1])
                except ValueError:
                    pass

        elif msg_type == 'GPSCOURSE' or msg_type == 'GPS_COURSE':
            if len(parts) >= 2:
                try:
                    block['course_deg'] = float(parts[1])
                except ValueError:
                    pass

        elif msg_type == 'GPSFIX' or msg_type == 'GPS_FIX':
            if len(parts) >= 2:
                val = parts[1].lower()
                block['fix_valid'] = val in ['1', 'true', 'yes', 'valid']

        elif msg_type == 'RFMSGEND':
            # End of message block - create record if we have required fields
            if 'tracker_id' in block:
                return self._create_record(block)

        return None

    def _create_record(self, block: dict) -> Optional[TrackerRecord]:
        """
        Create a TrackerRecord from a completed message block.

        Args:
            block: Completed message block data.

        Returns:
            TrackerRecord or None if invalid.
        """
        tracker_id = block.get('tracker_id')
        if not tracker_id:
            return None

        timestamp = block.get('timestamp', datetime.now())

        return TrackerRecord(
            tracker_id=str(tracker_id),
            time_local_received=timestamp,
            time_gps=block.get('time_gps'),
            time_received=timestamp,
            lat=block.get('lat'),
            lon=block.get('lon'),
            alt_m=block.get('alt_m'),
            speed_mps=block.get('speed_mps'),
            course_deg=block.get('course_deg'),
            hdop=block.get('hdop'),
            satellites=block.get('satellites'),
            rssi_dbm=block.get('rssi_dbm'),
            baro_alt_m=block.get('baro_alt_m'),
            baro_temp_c=block.get('baro_temp_c'),
            baro_press_hpa=block.get('baro_press_hpa'),
            fix_valid=block.get('fix_valid', False),
            battery_mv=block.get('battery_mv'),
            latency_ms=None,
        )


def parse_nmea_file(file_path: str) -> list[TrackerRecord]:
    """
    Parse a complete NMEA file.

    Args:
        file_path: Path to NMEA file.

    Returns:
        List of parsed tracker records.
    """
    parser = NMEAParser()

    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
            return parser.parse_nmea_content(content)
    except Exception as e:
        logger.error(f"Failed to read NMEA file {file_path}: {e}")
        return []
