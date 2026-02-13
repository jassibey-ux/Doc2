"""KML Export Module for SCENSUS Dashboard.

Generates KML files for visualization in Google Earth.
"""

import xml.etree.ElementTree as ET
from datetime import datetime
from typing import List, Optional
from xml.dom import minidom

from .models import TrackerState


def generate_kml(
    trackers: List[TrackerState],
    event_name: Optional[str] = None,
    include_extended_data: bool = True
) -> str:
    """
    Generate KML document from tracker data.

    Args:
        trackers: List of tracker states to export.
        event_name: Optional event name for the document title.
        include_extended_data: Whether to include extended data fields.

    Returns:
        KML document as string.
    """
    # Create KML root element with namespaces
    kml = ET.Element('kml')
    kml.set('xmlns', 'http://www.opengis.net/kml/2.2')
    kml.set('xmlns:gx', 'http://www.google.com/kml/ext/2.2')

    # Create Document
    document = ET.SubElement(kml, 'Document')

    # Document name
    name = ET.SubElement(document, 'name')
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M')
    name.text = f"SCENSUS Export - {event_name or 'Data'} - {timestamp}"

    # Description
    desc = ET.SubElement(document, 'description')
    desc.text = f"Exported from SCENSUS UAS Dashboard on {timestamp}"

    # Define styles
    _add_styles(document)

    # Group trackers by ID
    tracker_groups: dict[str, List[TrackerState]] = {}
    for tracker in trackers:
        tracker_id = tracker.tracker_id
        if tracker_id not in tracker_groups:
            tracker_groups[tracker_id] = []
        tracker_groups[tracker_id].append(tracker)

    # Create a folder for each tracker
    for tracker_id, tracker_list in tracker_groups.items():
        folder = ET.SubElement(document, 'Folder')
        folder_name = ET.SubElement(folder, 'name')
        folder_name.text = f"Drone {tracker_id}"

        # Sort by time if available
        tracker_list.sort(key=lambda t: t.time_gps or t.time_local_received or datetime.min)

        # Create track line if we have multiple points
        if len(tracker_list) > 1:
            _add_track_linestring(folder, tracker_id, tracker_list)

        # Add individual placemarks
        for i, tracker in enumerate(tracker_list):
            _add_point_placemark(
                folder,
                tracker,
                index=i,
                include_extended_data=include_extended_data
            )

    # Convert to string with pretty printing
    xml_str = ET.tostring(kml, encoding='unicode')

    # Pretty print
    try:
        parsed = minidom.parseString(xml_str)
        pretty_xml = parsed.toprettyxml(indent='  ')
        # Remove extra blank lines
        lines = [line for line in pretty_xml.split('\n') if line.strip()]
        return '\n'.join(lines)
    except Exception:
        return xml_str


def _add_styles(document: ET.Element) -> None:
    """Add KML styles for different tracker states."""
    # Active drone style (cyan)
    style_active = ET.SubElement(document, 'Style')
    style_active.set('id', 'droneActive')
    icon_style = ET.SubElement(style_active, 'IconStyle')
    icon = ET.SubElement(icon_style, 'Icon')
    href = ET.SubElement(icon, 'href')
    href.text = 'http://maps.google.com/mapfiles/kml/shapes/airports.png'
    color = ET.SubElement(icon_style, 'color')
    color.text = 'ff00c8ff'  # Cyan (AABBGGRR format)
    scale = ET.SubElement(icon_style, 'scale')
    scale.text = '1.0'

    # Stale drone style (red)
    style_stale = ET.SubElement(document, 'Style')
    style_stale.set('id', 'droneStale')
    icon_style = ET.SubElement(style_stale, 'IconStyle')
    icon = ET.SubElement(icon_style, 'Icon')
    href = ET.SubElement(icon, 'href')
    href.text = 'http://maps.google.com/mapfiles/kml/shapes/airports.png'
    color = ET.SubElement(icon_style, 'color')
    color.text = 'ff0000ff'  # Red
    scale = ET.SubElement(icon_style, 'scale')
    scale.text = '0.8'

    # Track line style
    style_track = ET.SubElement(document, 'Style')
    style_track.set('id', 'trackLine')
    line_style = ET.SubElement(style_track, 'LineStyle')
    color = ET.SubElement(line_style, 'color')
    color.text = 'ff00c8ff'  # Cyan
    width = ET.SubElement(line_style, 'width')
    width.text = '3'


def _add_track_linestring(
    folder: ET.Element,
    tracker_id: str,
    trackers: List[TrackerState]
) -> None:
    """Add a LineString for the track path."""
    placemark = ET.SubElement(folder, 'Placemark')

    name = ET.SubElement(placemark, 'name')
    name.text = f"Track - {tracker_id}"

    style_url = ET.SubElement(placemark, 'styleUrl')
    style_url.text = '#trackLine'

    linestring = ET.SubElement(placemark, 'LineString')

    altmode = ET.SubElement(linestring, 'altitudeMode')
    altmode.text = 'absolute'

    tessellate = ET.SubElement(linestring, 'tessellate')
    tessellate.text = '1'

    coords = ET.SubElement(linestring, 'coordinates')
    coord_list = []

    for tracker in trackers:
        if tracker.lat is not None and tracker.lon is not None:
            alt = tracker.alt_m if tracker.alt_m is not None else 0
            coord_list.append(f"{tracker.lon},{tracker.lat},{alt}")

    coords.text = ' '.join(coord_list)


def _add_point_placemark(
    folder: ET.Element,
    tracker: TrackerState,
    index: int,
    include_extended_data: bool
) -> None:
    """Add a point placemark for a tracker position."""
    if tracker.lat is None or tracker.lon is None:
        return

    placemark = ET.SubElement(folder, 'Placemark')

    # Name
    name = ET.SubElement(placemark, 'name')
    name.text = f"Position {index + 1}"

    # Description
    desc_parts = []
    if tracker.time_gps:
        desc_parts.append(f"Time: {tracker.time_gps.isoformat()}")
    if tracker.alt_m is not None:
        desc_parts.append(f"Altitude: {tracker.alt_m:.1f}m")
    if tracker.speed_mps is not None:
        desc_parts.append(f"Speed: {tracker.speed_mps:.1f}m/s")
    if tracker.rssi_dbm is not None:
        desc_parts.append(f"RSSI: {tracker.rssi_dbm}dBm")

    if desc_parts:
        desc = ET.SubElement(placemark, 'description')
        desc.text = '\n'.join(desc_parts)

    # Style
    style_url = ET.SubElement(placemark, 'styleUrl')
    style_url.text = '#droneStale' if tracker.is_stale else '#droneActive'

    # TimeStamp
    if tracker.time_gps:
        timestamp = ET.SubElement(placemark, 'TimeStamp')
        when = ET.SubElement(timestamp, 'when')
        when.text = tracker.time_gps.strftime('%Y-%m-%dT%H:%M:%SZ')

    # Point
    point = ET.SubElement(placemark, 'Point')

    altmode = ET.SubElement(point, 'altitudeMode')
    altmode.text = 'absolute'

    coords = ET.SubElement(point, 'coordinates')
    alt = tracker.alt_m if tracker.alt_m is not None else 0
    coords.text = f"{tracker.lon},{tracker.lat},{alt}"

    # Extended Data
    if include_extended_data:
        ext_data = ET.SubElement(placemark, 'ExtendedData')

        _add_ext_data(ext_data, 'tracker_id', tracker.tracker_id)

        if tracker.alt_m is not None:
            _add_ext_data(ext_data, 'altitude_m', f"{tracker.alt_m:.1f}")

        if tracker.speed_mps is not None:
            _add_ext_data(ext_data, 'speed_mps', f"{tracker.speed_mps:.1f}")

        if tracker.course_deg is not None:
            _add_ext_data(ext_data, 'course_deg', f"{tracker.course_deg:.1f}")

        if tracker.rssi_dbm is not None:
            _add_ext_data(ext_data, 'rssi_dbm', str(tracker.rssi_dbm))

        if tracker.battery_mv is not None:
            _add_ext_data(ext_data, 'battery_mv', str(tracker.battery_mv))

        if tracker.satellites is not None:
            _add_ext_data(ext_data, 'satellites', str(tracker.satellites))

        if tracker.hdop is not None:
            _add_ext_data(ext_data, 'hdop', f"{tracker.hdop:.1f}")

        if tracker.baro_alt_m is not None:
            _add_ext_data(ext_data, 'baro_alt_m', f"{tracker.baro_alt_m:.1f}")

        if tracker.baro_temp_c is not None:
            _add_ext_data(ext_data, 'baro_temp_c', f"{tracker.baro_temp_c:.1f}")

        if tracker.baro_press_hpa is not None:
            _add_ext_data(ext_data, 'baro_press_hpa', f"{tracker.baro_press_hpa:.1f}")

        _add_ext_data(ext_data, 'fix_valid', 'yes' if tracker.fix_valid else 'no')
        _add_ext_data(ext_data, 'is_stale', 'yes' if tracker.is_stale else 'no')


def _add_ext_data(parent: ET.Element, name: str, value: str) -> None:
    """Add an extended data element."""
    data = ET.SubElement(parent, 'Data')
    data.set('name', name)
    val = ET.SubElement(data, 'value')
    val.text = value
