#!/usr/bin/env python3
"""
CoT (Cursor on Target) Simulator for SCENSUS COPS.

Generates CoT XML messages over UDP to simulate drone flight paths
for testing the LogTail dashboard and CUAS integration.

Loads scenario JSON files that define drone waypoints, speeds, altitudes,
and optional GPS denial zones. Supports multiple simultaneous drones
with independent flight paths.

Usage:
    python cot_simulator.py --scenario scenarios/world_cup_bmo_field.json
    python cot_simulator.py --scenario scenarios/world_cup_bc_place.json --port 4243
    python cot_simulator.py --scenario scenarios/world_cup_bmo_field.json --rate 2.0

CoT XML format (MIL-STD-2045):
    <event version="2.0" type="a-f-G-U-C" uid="TRACKER-{id}" ...>
      <point lat="..." lon="..." hae="..." ce="10.0" le="10.0"/>
      <detail>
        <track course="{heading}" speed="{speed_mps}"/>
        <_flow-tags_ LogTail="true"/>
      </detail>
    </event>
"""

import argparse
import json
import logging
import math
import socket
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional
from xml.etree.ElementTree import Element, SubElement, tostring

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

EARTH_RADIUS_M = 6_371_000.0
DEFAULT_UDP_PORT = 4242
DEFAULT_BROADCAST_ADDR = "255.255.255.255"
DEFAULT_RATE_HZ = 1.0
STALE_OFFSET_S = 30
COT_EVENT_TYPE = "a-f-G-U-C"
COT_VERSION = "2.0"

# GPS denial defaults
DEFAULT_NOMINAL_SATELLITES = 12
DEFAULT_NOMINAL_HDOP = 0.9
DEFAULT_DENIED_SATELLITES_MIN = 0
DEFAULT_DENIED_SATELLITES_MAX = 3
DEFAULT_DENIED_HDOP_MIN = 8.0
DEFAULT_DENIED_HDOP_MAX = 25.0
DEFAULT_DENIED_CE = 50.0
DEFAULT_DENIED_POSITION_DRIFT_M = 15.0


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return great-circle distance in meters between two WGS-84 points."""
    rlat1, rlon1 = math.radians(lat1), math.radians(lon1)
    rlat2, rlon2 = math.radians(lat2), math.radians(lon2)
    dlat = rlat2 - rlat1
    dlon = rlon2 - rlon1
    a = math.sin(dlat / 2) ** 2 + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def bearing_between(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return initial bearing in degrees from point 1 to point 2."""
    rlat1, rlon1 = math.radians(lat1), math.radians(lon1)
    rlat2, rlon2 = math.radians(lat2), math.radians(lon2)
    dlon = rlon2 - rlon1
    x = math.sin(dlon) * math.cos(rlat2)
    y = math.cos(rlat1) * math.sin(rlat2) - math.sin(rlat1) * math.cos(rlat2) * math.cos(dlon)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def destination_point(lat: float, lon: float, bearing_deg: float, distance_m: float):
    """Return (lat, lon) after moving distance_m along bearing_deg from (lat, lon)."""
    rlat = math.radians(lat)
    rlon = math.radians(lon)
    brng = math.radians(bearing_deg)
    d = distance_m / EARTH_RADIUS_M

    new_lat = math.asin(
        math.sin(rlat) * math.cos(d) + math.cos(rlat) * math.sin(d) * math.cos(brng)
    )
    new_lon = rlon + math.atan2(
        math.sin(brng) * math.sin(d) * math.cos(rlat),
        math.cos(d) - math.sin(rlat) * math.sin(new_lat),
    )
    return math.degrees(new_lat), math.degrees(new_lon)


def lerp(a: float, b: float, t: float) -> float:
    """Linear interpolation between a and b at parameter t in [0, 1]."""
    return a + (b - a) * t


# ---------------------------------------------------------------------------
# GPS Denial Zone
# ---------------------------------------------------------------------------

@dataclass
class DenialZone:
    """Circular GPS denial zone centered on (lat, lon) with given radius."""

    lat: float
    lon: float
    radius_m: float
    min_satellites: int = DEFAULT_DENIED_SATELLITES_MIN
    max_satellites: int = DEFAULT_DENIED_SATELLITES_MAX
    min_hdop: float = DEFAULT_DENIED_HDOP_MIN
    max_hdop: float = DEFAULT_DENIED_HDOP_MAX
    position_drift_m: float = DEFAULT_DENIED_POSITION_DRIFT_M

    def contains(self, lat: float, lon: float) -> bool:
        """Check whether the given point falls inside the denial zone."""
        return haversine_distance(self.lat, self.lon, lat, lon) <= self.radius_m

    def denial_strength(self, lat: float, lon: float) -> float:
        """Return 0.0 (edge) to 1.0 (center) for points inside the zone."""
        dist = haversine_distance(self.lat, self.lon, lat, lon)
        if dist >= self.radius_m:
            return 0.0
        return 1.0 - (dist / self.radius_m)

    @classmethod
    def from_dict(cls, data: dict) -> "DenialZone":
        return cls(
            lat=data["lat"],
            lon=data["lon"],
            radius_m=data.get("radius_m", 500.0),
            min_satellites=data.get("min_satellites", DEFAULT_DENIED_SATELLITES_MIN),
            max_satellites=data.get("max_satellites", DEFAULT_DENIED_SATELLITES_MAX),
            min_hdop=data.get("min_hdop", DEFAULT_DENIED_HDOP_MIN),
            max_hdop=data.get("max_hdop", DEFAULT_DENIED_HDOP_MAX),
            position_drift_m=data.get("position_drift_m", DEFAULT_DENIED_POSITION_DRIFT_M),
        )


# ---------------------------------------------------------------------------
# Waypoint / Drone state
# ---------------------------------------------------------------------------

@dataclass
class Waypoint:
    """A single waypoint in a drone's flight path."""

    lat: float
    lon: float
    alt_m: float
    speed_mps: float
    loiter_s: float = 0.0  # seconds to hover at this waypoint

    @classmethod
    def from_dict(cls, data: dict) -> "Waypoint":
        return cls(
            lat=data["lat"],
            lon=data["lon"],
            alt_m=data.get("alt_m", 100.0),
            speed_mps=data.get("speed_mps", 15.0),
            loiter_s=data.get("loiter_s", 0.0),
        )


@dataclass
class DroneState:
    """Runtime state for a single simulated drone."""

    drone_id: str
    waypoints: list[Waypoint]
    loop: bool = False
    gps_denial: bool = False

    # Runtime tracking
    current_wp_idx: int = 0
    segment_progress: float = 0.0  # 0.0 to 1.0 between current and next waypoint
    loiter_remaining: float = 0.0
    finished: bool = False

    # Current interpolated position
    lat: float = 0.0
    lon: float = 0.0
    alt_m: float = 0.0
    heading_deg: float = 0.0
    speed_mps: float = 0.0

    # GPS quality (affected by denial zones)
    satellites: int = DEFAULT_NOMINAL_SATELLITES
    hdop: float = DEFAULT_NOMINAL_HDOP
    ce: float = 10.0
    le: float = 10.0
    fix_valid: bool = True

    # Denial drift offsets
    drift_lat: float = 0.0
    drift_lon: float = 0.0

    def __post_init__(self):
        if self.waypoints:
            wp = self.waypoints[0]
            self.lat = wp.lat
            self.lon = wp.lon
            self.alt_m = wp.alt_m
            self.speed_mps = wp.speed_mps
            if len(self.waypoints) > 1:
                nxt = self.waypoints[1]
                self.heading_deg = bearing_between(wp.lat, wp.lon, nxt.lat, nxt.lon)

    @classmethod
    def from_dict(cls, drone_id: str, data: dict) -> "DroneState":
        waypoints = [Waypoint.from_dict(wp) for wp in data["waypoints"]]
        return cls(
            drone_id=drone_id,
            waypoints=waypoints,
            loop=data.get("loop", False),
            gps_denial=data.get("gps_denial", False),
        )


# ---------------------------------------------------------------------------
# Scenario loader
# ---------------------------------------------------------------------------

@dataclass
class Scenario:
    """A complete simulation scenario."""

    name: str
    description: str
    venue_lat: float
    venue_lon: float
    drones: list[DroneState] = field(default_factory=list)
    denial_zones: list[DenialZone] = field(default_factory=list)
    duration_s: float = 300.0
    rate_hz: float = DEFAULT_RATE_HZ

    @classmethod
    def load(cls, path: Path) -> "Scenario":
        """Load a scenario from a JSON file."""
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        scenario_data = data.get("scenario", data)

        drones = []
        for drone_def in scenario_data.get("drones", []):
            drone_id = drone_def["id"]
            drones.append(DroneState.from_dict(drone_id, drone_def))

        denial_zones = []
        for zone_def in scenario_data.get("denial_zones", []):
            denial_zones.append(DenialZone.from_dict(zone_def))

        return cls(
            name=scenario_data.get("name", path.stem),
            description=scenario_data.get("description", ""),
            venue_lat=scenario_data["venue"]["lat"],
            venue_lon=scenario_data["venue"]["lon"],
            drones=drones,
            denial_zones=denial_zones,
            duration_s=scenario_data.get("duration_s", 300.0),
            rate_hz=scenario_data.get("rate_hz", DEFAULT_RATE_HZ),
        )


# ---------------------------------------------------------------------------
# Simulation engine
# ---------------------------------------------------------------------------

class SimulationEngine:
    """Advances drone positions along their waypoint paths each tick."""

    def __init__(self, scenario: Scenario):
        self.scenario = scenario
        self._rng = __import__("random").Random(42)

    def tick(self, dt: float) -> None:
        """Advance all drones by dt seconds."""
        for drone in self.scenario.drones:
            if drone.finished:
                continue
            self._advance_drone(drone, dt)
            self._apply_denial(drone)

    # ---- Private helpers ------------------------------------------------

    def _advance_drone(self, drone: DroneState, dt: float) -> None:
        """Move a drone along its waypoint path."""
        wps = drone.waypoints
        if len(wps) < 2:
            drone.finished = True
            return

        # Handle loitering at current waypoint
        if drone.loiter_remaining > 0:
            drone.loiter_remaining -= dt
            drone.speed_mps = 0.0
            return

        idx = drone.current_wp_idx
        nxt_idx = idx + 1
        if nxt_idx >= len(wps):
            if drone.loop:
                drone.current_wp_idx = 0
                drone.segment_progress = 0.0
                idx = 0
                nxt_idx = 1
            else:
                drone.finished = True
                return

        wp_from = wps[idx]
        wp_to = wps[nxt_idx]

        # Segment length
        seg_dist = haversine_distance(wp_from.lat, wp_from.lon, wp_to.lat, wp_to.lon)
        if seg_dist < 0.1:
            # Waypoints are essentially the same; skip to next
            drone.current_wp_idx = nxt_idx
            drone.segment_progress = 0.0
            drone.loiter_remaining = wp_to.loiter_s
            return

        # Interpolated speed ramps between waypoints
        speed = lerp(wp_from.speed_mps, wp_to.speed_mps, drone.segment_progress)
        distance_this_tick = speed * dt
        progress_delta = distance_this_tick / seg_dist

        drone.segment_progress += progress_delta

        # Check if we arrived at next waypoint
        if drone.segment_progress >= 1.0:
            drone.current_wp_idx = nxt_idx
            drone.segment_progress = 0.0
            drone.lat = wp_to.lat
            drone.lon = wp_to.lon
            drone.alt_m = wp_to.alt_m
            drone.speed_mps = wp_to.speed_mps
            drone.loiter_remaining = wp_to.loiter_s

            # Compute heading toward next-next waypoint
            after_nxt = nxt_idx + 1
            if after_nxt < len(wps):
                drone.heading_deg = bearing_between(wp_to.lat, wp_to.lon, wps[after_nxt].lat, wps[after_nxt].lon)
            elif drone.loop and len(wps) > 1:
                drone.heading_deg = bearing_between(wp_to.lat, wp_to.lon, wps[0].lat, wps[0].lon)
            return

        # Interpolate position
        t = drone.segment_progress
        drone.lat = lerp(wp_from.lat, wp_to.lat, t)
        drone.lon = lerp(wp_from.lon, wp_to.lon, t)
        drone.alt_m = lerp(wp_from.alt_m, wp_to.alt_m, t)
        drone.speed_mps = speed
        drone.heading_deg = bearing_between(wp_from.lat, wp_from.lon, wp_to.lat, wp_to.lon)

    def _apply_denial(self, drone: DroneState) -> None:
        """Apply GPS denial effects if drone is inside any denial zone."""
        if not drone.gps_denial:
            # Drone is not flagged for GPS denial effects
            drone.satellites = DEFAULT_NOMINAL_SATELLITES
            drone.hdop = DEFAULT_NOMINAL_HDOP
            drone.ce = 10.0
            drone.le = 10.0
            drone.fix_valid = True
            drone.drift_lat = 0.0
            drone.drift_lon = 0.0
            return

        max_strength = 0.0
        active_zone: Optional[DenialZone] = None
        for zone in self.scenario.denial_zones:
            strength = zone.denial_strength(drone.lat, drone.lon)
            if strength > max_strength:
                max_strength = strength
                active_zone = zone

        if max_strength <= 0.0 or active_zone is None:
            # Outside all denial zones -- nominal GPS
            drone.satellites = DEFAULT_NOMINAL_SATELLITES + self._rng.randint(-1, 1)
            drone.hdop = DEFAULT_NOMINAL_HDOP + self._rng.uniform(-0.1, 0.1)
            drone.ce = 10.0
            drone.le = 10.0
            drone.fix_valid = True
            drone.drift_lat = 0.0
            drone.drift_lon = 0.0
            return

        # Inside denial zone -- degrade GPS proportionally to strength
        s = max_strength
        drone.satellites = max(
            active_zone.min_satellites,
            int(lerp(DEFAULT_NOMINAL_SATELLITES, active_zone.min_satellites, s))
            + self._rng.randint(0, active_zone.max_satellites - active_zone.min_satellites),
        )
        drone.hdop = lerp(DEFAULT_NOMINAL_HDOP, active_zone.max_hdop, s) + self._rng.uniform(-1.0, 1.0)
        drone.hdop = max(active_zone.min_hdop * s, drone.hdop)
        drone.ce = lerp(10.0, DEFAULT_DENIED_CE, s)
        drone.le = lerp(10.0, DEFAULT_DENIED_CE * 0.8, s)
        drone.fix_valid = self._rng.random() > (0.3 * s)

        # Position drift -- random walk that grows with denial strength
        drift_step_m = active_zone.position_drift_m * s * self._rng.uniform(0.0, 1.0)
        drift_bearing = self._rng.uniform(0, 360)
        dlat, dlon = destination_point(0, 0, drift_bearing, drift_step_m)
        drone.drift_lat = drone.drift_lat * 0.8 + dlat * 0.2
        drone.drift_lon = drone.drift_lon * 0.8 + dlon * 0.2


# ---------------------------------------------------------------------------
# CoT XML builder
# ---------------------------------------------------------------------------

def build_cot_xml(drone: DroneState, now: Optional[datetime] = None) -> bytes:
    """Build a CoT XML event for the given drone state.

    Returns UTF-8 encoded XML bytes ready to send over UDP.
    """
    if now is None:
        now = datetime.now(timezone.utc)

    stale = now + timedelta(seconds=STALE_OFFSET_S)
    iso_now = now.strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    iso_stale = stale.strftime("%Y-%m-%dT%H:%M:%S.%fZ")

    uid = f"TRACKER-{drone.drone_id}"

    event = Element("event")
    event.set("version", COT_VERSION)
    event.set("type", COT_EVENT_TYPE)
    event.set("uid", uid)
    event.set("time", iso_now)
    event.set("start", iso_now)
    event.set("stale", iso_stale)

    # Apply position drift for GPS-denied drones
    reported_lat = drone.lat + drone.drift_lat
    reported_lon = drone.lon + drone.drift_lon

    point = SubElement(event, "point")
    point.set("lat", f"{reported_lat:.7f}")
    point.set("lon", f"{reported_lon:.7f}")
    point.set("hae", f"{drone.alt_m:.1f}")
    point.set("ce", f"{drone.ce:.1f}")
    point.set("le", f"{drone.le:.1f}")

    detail = SubElement(event, "detail")

    track = SubElement(detail, "track")
    track.set("course", f"{drone.heading_deg:.1f}")
    track.set("speed", f"{drone.speed_mps:.1f}")

    # GPS quality sub-element (LogTail extension)
    gps_el = SubElement(detail, "_gps_")
    gps_el.set("satellites", str(drone.satellites))
    gps_el.set("hdop", f"{drone.hdop:.1f}")
    gps_el.set("fix_valid", str(drone.fix_valid).lower())

    flow = SubElement(detail, "_flow-tags_")
    flow.set("LogTail", "true")

    xml_bytes = b"<?xml version='1.0' encoding='UTF-8'?>\n" + tostring(event, encoding="unicode").encode("utf-8")
    return xml_bytes


# ---------------------------------------------------------------------------
# UDP sender
# ---------------------------------------------------------------------------

class UDPSender:
    """Broadcasts CoT XML datagrams over UDP."""

    def __init__(self, address: str = DEFAULT_BROADCAST_ADDR, port: int = DEFAULT_UDP_PORT):
        self.address = address
        self.port = port
        self._sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self._sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)

    def send(self, data: bytes) -> None:
        """Send a UDP datagram."""
        try:
            self._sock.sendto(data, (self.address, self.port))
        except OSError as exc:
            logger.warning("UDP send failed: %s", exc)

    def close(self) -> None:
        self._sock.close()


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def run_simulation(scenario: Scenario, sender: UDPSender, rate_hz: float, duration_s: float) -> None:
    """Run the CoT simulation loop."""
    engine = SimulationEngine(scenario)
    dt = 1.0 / rate_hz
    elapsed = 0.0
    tick_count = 0

    print(f"Scenario     : {scenario.name}")
    print(f"Description  : {scenario.description}")
    print(f"Venue        : ({scenario.venue_lat:.4f}, {scenario.venue_lon:.4f})")
    print(f"Drones       : {len(scenario.drones)}")
    print(f"Denial zones : {len(scenario.denial_zones)}")
    print(f"UDP target   : {sender.address}:{sender.port}")
    print(f"Rate         : {rate_hz} Hz  (dt = {dt:.3f}s)")
    print(f"Duration     : {duration_s:.0f}s")
    print("-" * 60)

    try:
        while elapsed < duration_s:
            loop_start = time.monotonic()
            now = datetime.now(timezone.utc)

            # Advance simulation
            engine.tick(dt)

            # Send CoT for each active drone
            active_count = 0
            for drone in scenario.drones:
                if drone.finished:
                    continue
                active_count += 1
                xml_bytes = build_cot_xml(drone, now)
                sender.send(xml_bytes)

            tick_count += 1
            elapsed += dt

            # Periodic status
            if tick_count % max(1, int(rate_hz * 5)) == 0:
                ts = datetime.now().strftime("%H:%M:%S")
                drone_summaries = []
                for d in scenario.drones:
                    status = "FIN" if d.finished else "OK"
                    gps_status = ""
                    if d.gps_denial and not d.finished:
                        gps_status = f" sats={d.satellites} hdop={d.hdop:.1f}"
                    drone_summaries.append(
                        f"  {d.drone_id}: ({d.lat:.5f}, {d.lon:.5f}) "
                        f"alt={d.alt_m:.0f}m hdg={d.heading_deg:.0f} "
                        f"spd={d.speed_mps:.1f}m/s [{status}]{gps_status}"
                    )
                print(f"[{ts}] t={elapsed:.0f}s  active={active_count}/{len(scenario.drones)}")
                for s in drone_summaries:
                    print(s)

            # All drones finished?
            if all(d.finished for d in scenario.drones):
                print("\nAll drones have completed their flight paths.")
                break

            # Sleep to maintain rate
            loop_elapsed = time.monotonic() - loop_start
            sleep_time = dt - loop_elapsed
            if sleep_time > 0:
                time.sleep(sleep_time)

    except KeyboardInterrupt:
        print(f"\n\nSimulation interrupted at t={elapsed:.1f}s ({tick_count} ticks)")

    print(f"\nSimulation complete. Sent {tick_count * len(scenario.drones)} CoT messages.")


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="CoT Simulator -- generate Cursor on Target XML over UDP",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python cot_simulator.py --scenario scenarios/world_cup_bmo_field.json\n"
            "  python cot_simulator.py --scenario scenarios/world_cup_bc_place.json --port 4243\n"
            "  python cot_simulator.py --scenario scenarios/world_cup_bmo_field.json --rate 2 --duration 120\n"
        ),
    )
    parser.add_argument(
        "--scenario", "-s",
        type=str,
        required=True,
        help="Path to scenario JSON file",
    )
    parser.add_argument(
        "--port", "-p",
        type=int,
        default=DEFAULT_UDP_PORT,
        help=f"UDP destination port (default: {DEFAULT_UDP_PORT})",
    )
    parser.add_argument(
        "--address", "-a",
        type=str,
        default=DEFAULT_BROADCAST_ADDR,
        help=f"UDP destination address (default: {DEFAULT_BROADCAST_ADDR})",
    )
    parser.add_argument(
        "--rate", "-r",
        type=float,
        default=None,
        help="Message rate in Hz (overrides scenario default)",
    )
    parser.add_argument(
        "--duration", "-d",
        type=float,
        default=None,
        help="Simulation duration in seconds (overrides scenario default)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print CoT XML to stdout instead of sending UDP",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable debug logging",
    )

    args = parser.parse_args()

    # Logging
    log_level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    # Resolve scenario path relative to this script's directory
    script_dir = Path(__file__).resolve().parent
    scenario_path = Path(args.scenario)
    if not scenario_path.is_absolute():
        scenario_path = script_dir / scenario_path

    if not scenario_path.exists():
        print(f"Error: scenario file not found: {scenario_path}", file=sys.stderr)
        sys.exit(1)

    # Load scenario
    try:
        scenario = Scenario.load(scenario_path)
    except (json.JSONDecodeError, KeyError) as exc:
        print(f"Error: failed to parse scenario file: {exc}", file=sys.stderr)
        sys.exit(1)

    # Override rate/duration from CLI if given
    rate_hz = args.rate if args.rate is not None else scenario.rate_hz
    duration_s = args.duration if args.duration is not None else scenario.duration_s

    if args.dry_run:
        # Just print one round of CoT XML and exit
        print("--- Dry run: printing initial CoT XML for each drone ---\n")
        now = datetime.now(timezone.utc)
        for drone in scenario.drones:
            xml_bytes = build_cot_xml(drone, now)
            print(xml_bytes.decode("utf-8"))
            print()
        sys.exit(0)

    # UDP sender
    sender = UDPSender(address=args.address, port=args.port)

    try:
        run_simulation(scenario, sender, rate_hz, duration_s)
    finally:
        sender.close()


if __name__ == "__main__":
    main()
