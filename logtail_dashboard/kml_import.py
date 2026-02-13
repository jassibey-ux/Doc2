"""KML/KMZ Import Module for SCENSUS Dashboard.

Parses KML/KMZ files (Google Earth format) into TrackerRecord objects.
Supports:
- Placemarks with Point coordinates (single position)
- Placemarks with LineString coordinates (track as sequence of positions)
- gx:Track with when/gx:coord pairs (timestamped track)
- KMZ files (ZIP containing KML)
"""

import io
import logging
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Optional

from .models import TrackerRecord

logger = logging.getLogger(__name__)

# KML namespaces
KML_NS = "{http://www.opengis.net/kml/2.2}"
GX_NS = "{http://www.google.com/kml/ext/2.2}"


class KMLImporter:
    """Import KML/KMZ files into TrackerRecord objects."""

    def __init__(self):
        self._tracker_counter = 0

    def parse_kml_content(self, content: str) -> list[TrackerRecord]:
        """
        Parse KML XML content into tracker records.

        Args:
            content: KML file content as string.

        Returns:
            List of TrackerRecord objects.
        """
        try:
            root = ET.fromstring(content)
        except ET.ParseError as e:
            logger.error(f"Failed to parse KML XML: {e}")
            return []

        records = []
        self._tracker_counter = 0

        # Find all Placemarks (may be nested in Folders/Documents)
        for placemark in root.iter(f"{KML_NS}Placemark"):
            folder_name = self._get_parent_folder_name(root, placemark)
            placemark_records = self._parse_placemark(placemark, folder_name)
            records.extend(placemark_records)

        # Find gx:Track elements NOT inside a Placemark (standalone tracks)
        for track in root.iter(f"{GX_NS}Track"):
            parent_placemark = self._find_parent_placemark(root, track)
            if parent_placemark is not None:
                continue  # Already handled in Placemark parsing above
            tracker_id = self._extract_tracker_id(None, None)
            track_records = self._parse_gx_track(track, tracker_id)
            records.extend(track_records)

        logger.info(f"KML import: parsed {len(records)} records")
        return records

    def parse_kmz_file(self, content: bytes) -> list[TrackerRecord]:
        """
        Parse KMZ file (ZIP containing KML) into tracker records.

        Args:
            content: KMZ file content as bytes.

        Returns:
            List of TrackerRecord objects.
        """
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as zf:
                # Find the .kml file inside the KMZ
                kml_files = [f for f in zf.namelist() if f.lower().endswith('.kml')]

                if not kml_files:
                    logger.error("No KML file found inside KMZ archive")
                    return []

                # Parse the first (usually only) KML file
                kml_content = zf.read(kml_files[0]).decode('utf-8')
                return self.parse_kml_content(kml_content)

        except zipfile.BadZipFile:
            logger.error("Invalid KMZ file (not a valid ZIP archive)")
            return []
        except Exception as e:
            logger.error(f"Error reading KMZ file: {e}")
            return []

    def _parse_placemark(self, placemark: ET.Element, folder_name: Optional[str]) -> list[TrackerRecord]:
        """Parse a single Placemark element into TrackerRecord(s)."""
        records = []
        tracker_id = self._extract_tracker_id(placemark, folder_name)

        # Check for Point geometry
        point = placemark.find(f"{KML_NS}Point")
        if point is not None:
            coords_elem = point.find(f"{KML_NS}coordinates")
            if coords_elem is not None and coords_elem.text:
                coord = self._parse_single_coordinate(coords_elem.text.strip())
                if coord:
                    lon, lat, alt = coord
                    timestamp = self._extract_timestamp(placemark)
                    records.append(self._create_record(tracker_id, lat, lon, alt, timestamp))

        # Check for LineString geometry
        linestring = placemark.find(f"{KML_NS}LineString")
        if linestring is not None:
            coords_elem = linestring.find(f"{KML_NS}coordinates")
            if coords_elem is not None and coords_elem.text:
                coords = self._parse_coordinate_list(coords_elem.text)
                timestamp = self._extract_timestamp(placemark) or datetime.now()
                for i, (lon, lat, alt) in enumerate(coords):
                    records.append(self._create_record(tracker_id, lat, lon, alt, timestamp))

        # Check for MultiGeometry
        multi = placemark.find(f"{KML_NS}MultiGeometry")
        if multi is not None:
            for child_point in multi.findall(f"{KML_NS}Point"):
                coords_elem = child_point.find(f"{KML_NS}coordinates")
                if coords_elem is not None and coords_elem.text:
                    coord = self._parse_single_coordinate(coords_elem.text.strip())
                    if coord:
                        lon, lat, alt = coord
                        timestamp = self._extract_timestamp(placemark)
                        records.append(self._create_record(tracker_id, lat, lon, alt, timestamp))

            for child_ls in multi.findall(f"{KML_NS}LineString"):
                coords_elem = child_ls.find(f"{KML_NS}coordinates")
                if coords_elem is not None and coords_elem.text:
                    coords = self._parse_coordinate_list(coords_elem.text)
                    timestamp = self._extract_timestamp(placemark) or datetime.now()
                    for lon, lat, alt in coords:
                        records.append(self._create_record(tracker_id, lat, lon, alt, timestamp))

        # Check for gx:Track inside this placemark
        gx_track = placemark.find(f"{GX_NS}Track")
        if gx_track is not None:
            track_records = self._parse_gx_track(gx_track, tracker_id)
            records.extend(track_records)

        return records

    def _parse_gx_track(self, track: ET.Element, tracker_id: Optional[str]) -> list[TrackerRecord]:
        """Parse a gx:Track element with when/gx:coord pairs."""
        records = []

        if tracker_id is None:
            self._tracker_counter += 1
            tracker_id = f"kml_track_{self._tracker_counter}"

        # Get all <when> and <gx:coord> elements
        whens = track.findall(f"{KML_NS}when")
        # Also try without namespace for <when>
        if not whens:
            whens = track.findall("when")

        coords = track.findall(f"{GX_NS}coord")

        # Pair them up
        for i in range(min(len(whens), len(coords))):
            timestamp = self._parse_iso_timestamp(whens[i].text) if whens[i].text else datetime.now()
            coord_text = coords[i].text
            if coord_text:
                parts = coord_text.strip().split()
                if len(parts) >= 2:
                    try:
                        lon = float(parts[0])
                        lat = float(parts[1])
                        alt = float(parts[2]) if len(parts) >= 3 else None
                        records.append(self._create_record(tracker_id, lat, lon, alt, timestamp))
                    except ValueError:
                        continue

        # If no paired when/coord, try just coords
        if not records and coords:
            for coord_elem in coords:
                if coord_elem.text:
                    parts = coord_elem.text.strip().split()
                    if len(parts) >= 2:
                        try:
                            lon = float(parts[0])
                            lat = float(parts[1])
                            alt = float(parts[2]) if len(parts) >= 3 else None
                            records.append(self._create_record(tracker_id, lat, lon, alt, datetime.now()))
                        except ValueError:
                            continue

        return records

    def _extract_tracker_id(self, placemark: Optional[ET.Element], folder_name: Optional[str]) -> str:
        """Extract tracker ID from placemark metadata."""
        if placemark is not None:
            # Try ExtendedData first
            ext_data = placemark.find(f"{KML_NS}ExtendedData")
            if ext_data is not None:
                for data in ext_data.findall(f"{KML_NS}Data"):
                    name = data.get("name", "").lower()
                    if name in ("tracker_id", "id", "tracker", "device_id", "unit_id"):
                        value_elem = data.find(f"{KML_NS}value")
                        if value_elem is not None and value_elem.text:
                            return value_elem.text.strip()

                # Try SchemaData
                for schema_data in ext_data.findall(f"{KML_NS}SchemaData"):
                    for simple_data in schema_data.findall(f"{KML_NS}SimpleData"):
                        name = simple_data.get("name", "").lower()
                        if name in ("tracker_id", "id", "tracker", "device_id", "unit_id"):
                            if simple_data.text:
                                return simple_data.text.strip()

            # Try Placemark name
            name_elem = placemark.find(f"{KML_NS}name")
            if name_elem is not None and name_elem.text:
                return name_elem.text.strip()

        # Try folder name
        if folder_name:
            return folder_name

        # Auto-generate
        self._tracker_counter += 1
        return f"kml_import_{self._tracker_counter}"

    def _extract_timestamp(self, placemark: ET.Element) -> Optional[datetime]:
        """Extract timestamp from placemark TimeStamp or TimeSpan."""
        # Try TimeStamp
        timestamp = placemark.find(f"{KML_NS}TimeStamp")
        if timestamp is not None:
            when = timestamp.find(f"{KML_NS}when")
            if when is not None and when.text:
                return self._parse_iso_timestamp(when.text)

        # Try TimeSpan (use begin time)
        timespan = placemark.find(f"{KML_NS}TimeSpan")
        if timespan is not None:
            begin = timespan.find(f"{KML_NS}begin")
            if begin is not None and begin.text:
                return self._parse_iso_timestamp(begin.text)

        return None

    def _parse_iso_timestamp(self, text: str) -> Optional[datetime]:
        """Parse an ISO 8601 timestamp string."""
        text = text.strip()
        # Try common formats
        formats = [
            "%Y-%m-%dT%H:%M:%SZ",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%dT%H:%M:%S.%fZ",
            "%Y-%m-%dT%H:%M:%S.%f",
            "%Y-%m-%dT%H:%M:%S%z",
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d",
        ]
        for fmt in formats:
            try:
                return datetime.strptime(text, fmt)
            except ValueError:
                continue

        # Handle timezone offset like +00:00
        if '+' in text[10:] or text.endswith('Z'):
            try:
                clean = text.replace('Z', '+00:00')
                return datetime.fromisoformat(clean)
            except (ValueError, AttributeError):
                pass

        logger.debug(f"Could not parse timestamp: {text}")
        return None

    def _parse_single_coordinate(self, text: str) -> Optional[tuple[float, float, Optional[float]]]:
        """Parse a single KML coordinate string (lon,lat,alt)."""
        parts = text.strip().split(',')
        if len(parts) < 2:
            return None
        try:
            lon = float(parts[0])
            lat = float(parts[1])
            alt = float(parts[2]) if len(parts) >= 3 else None
            return (lon, lat, alt)
        except ValueError:
            return None

    def _parse_coordinate_list(self, text: str) -> list[tuple[float, float, Optional[float]]]:
        """Parse a KML coordinate list (space-separated lon,lat,alt tuples)."""
        coords = []
        for token in text.strip().split():
            coord = self._parse_single_coordinate(token)
            if coord:
                coords.append(coord)
        return coords

    def _get_parent_folder_name(self, root: ET.Element, placemark: ET.Element) -> Optional[str]:
        """Try to find the parent Folder name for a Placemark."""
        # Build parent map
        parent_map = {child: parent for parent in root.iter() for child in parent}
        current = placemark
        while current in parent_map:
            parent = parent_map[current]
            if parent.tag == f"{KML_NS}Folder":
                name_elem = parent.find(f"{KML_NS}name")
                if name_elem is not None and name_elem.text:
                    return name_elem.text.strip()
            current = parent
        return None

    def _find_parent_placemark(self, root: ET.Element, element: ET.Element) -> Optional[ET.Element]:
        """Find the parent Placemark of an element."""
        parent_map = {child: parent for parent in root.iter() for child in parent}
        current = element
        while current in parent_map:
            parent = parent_map[current]
            if parent.tag == f"{KML_NS}Placemark":
                return parent
            current = parent
        return None

    def _create_record(
        self,
        tracker_id: str,
        lat: float,
        lon: float,
        alt: Optional[float],
        timestamp: Optional[datetime],
    ) -> TrackerRecord:
        """Create a TrackerRecord from parsed KML data."""
        ts = timestamp or datetime.now()
        return TrackerRecord(
            tracker_id=tracker_id,
            time_local_received=ts,
            time_gps=ts,
            lat=lat,
            lon=lon,
            alt_m=alt,
            fix_valid=True,
        )
