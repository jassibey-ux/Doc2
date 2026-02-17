#!/usr/bin/env python3
"""
Demo Mode: BMO Field, Toronto — Direct telemetry injection.

Creates a session and posts simulated tracker data directly to the backend
API without the CoT UDP intermediate layer. One script, zero dependencies
beyond the standard library.

Usage:
    python demo_bmo_field.py
    python demo_bmo_field.py --backend http://localhost:8082 --duration 180
    python demo_bmo_field.py --speed 3       # 3x real-time
    python demo_bmo_field.py --instant        # dump all data instantly (no sleep)
"""

import argparse
import json
import math
import random
import sys
import time
import urllib.request
from datetime import datetime, timezone


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

BACKEND = "http://127.0.0.1:8082"
ORG_ID = "scensus-dev"
RATE_HZ = 1.0
DURATION_S = 300
EARTH_R = 6_371_000.0

# BMO Field, Toronto
VENUE = (43.6332, -79.4186)

# GPS denial zone around the stadium
DENIAL_ZONE = {
    "lat": 43.6332,
    "lon": -79.4186,
    "radius_m": 400,
    "min_sats": 0,
    "max_sats": 3,
    "hdop_max": 25.0,
    "drift_m": 20.0,
}

# Drone flight plans — 5 trackers for a richer demo
DRONES = [
    {
        "id": "ALPHA-01",
        "desc": "North approach over Exhibition Place — steady descent",
        "gps_denial": False,
        "waypoints": [
            (43.6420, -79.4180, 80, 18),
            (43.6395, -79.4183, 80, 16),
            (43.6370, -79.4185, 75, 12),
            (43.6355, -79.4186, 60, 8),
            (43.6340, -79.4186, 50, 5),
            (43.6332, -79.4186, 40, 3),
        ],
    },
    {
        "id": "BRAVO-02",
        "desc": "East approach from downtown Toronto — high altitude recon",
        "gps_denial": False,
        "waypoints": [
            (43.6450, -79.3900, 200, 25),
            (43.6420, -79.3980, 180, 22),
            (43.6390, -79.4050, 150, 18),
            (43.6365, -79.4120, 120, 14),
            (43.6345, -79.4160, 100, 10),
            (43.6335, -79.4180, 80, 6),
            (43.6332, -79.4186, 60, 3),
        ],
    },
    {
        "id": "CHARLIE-03",
        "desc": "Southwest from Lake Ontario — GPS denial active",
        "gps_denial": True,
        "waypoints": [
            (43.6260, -79.4280, 60, 20),
            (43.6275, -79.4260, 65, 18),
            (43.6290, -79.4240, 70, 15),
            (43.6305, -79.4220, 75, 12),
            (43.6318, -79.4200, 70, 8),
            (43.6330, -79.4190, 55, 5),
            (43.6332, -79.4186, 45, 2),
        ],
    },
    {
        "id": "DELTA-04",
        "desc": "West approach from Parkdale — low and fast",
        "gps_denial": False,
        "waypoints": [
            (43.6365, -79.4350, 35, 22),
            (43.6358, -79.4310, 35, 20),
            (43.6350, -79.4270, 30, 18),
            (43.6345, -79.4240, 28, 14),
            (43.6340, -79.4210, 25, 10),
            (43.6335, -79.4195, 22, 6),
            (43.6332, -79.4186, 20, 3),
        ],
    },
    {
        "id": "ECHO-05",
        "desc": "Southeast orbit — circling surveillance pattern",
        "gps_denial": False,
        "waypoints": [
            (43.6290, -79.4120, 120, 15),
            (43.6310, -79.4140, 120, 15),
            (43.6340, -79.4130, 115, 14),
            (43.6355, -79.4160, 110, 14),
            (43.6350, -79.4200, 110, 13),
            (43.6330, -79.4220, 108, 13),
            (43.6305, -79.4200, 105, 12),
            (43.6290, -79.4170, 105, 12),
            (43.6290, -79.4120, 120, 15),  # loop back to start
        ],
    },
]


# ---------------------------------------------------------------------------
# Geo helpers
# ---------------------------------------------------------------------------

def haversine(lat1, lon1, lat2, lon2):
    r1, r2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lat2 - lat1)
    dn = math.radians(lon2 - lon1)
    a = math.sin(dl / 2) ** 2 + math.cos(r1) * math.cos(r2) * math.sin(dn / 2) ** 2
    return 2 * EARTH_R * math.asin(math.sqrt(a))


def bearing(lat1, lon1, lat2, lon2):
    r1, r2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    x = math.sin(dl) * math.cos(r2)
    y = math.cos(r1) * math.sin(r2) - math.sin(r1) * math.cos(r2) * math.cos(dl)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def lerp(a, b, t):
    return a + (b - a) * t


def dest_point(lat, lon, brng_deg, dist_m):
    rl, rn = math.radians(lat), math.radians(lon)
    br = math.radians(brng_deg)
    d = dist_m / EARTH_R
    nl = math.asin(math.sin(rl) * math.cos(d) + math.cos(rl) * math.sin(d) * math.cos(br))
    nn = rn + math.atan2(math.sin(br) * math.sin(d) * math.cos(rl),
                         math.cos(d) - math.sin(rl) * math.sin(nl))
    return math.degrees(nl), math.degrees(nn)


# ---------------------------------------------------------------------------
# Drone state machine
# ---------------------------------------------------------------------------

class Drone:
    def __init__(self, cfg):
        self.id = cfg["id"]
        self.desc = cfg["desc"]
        self.gps_denial = cfg["gps_denial"]
        # waypoints: list of (lat, lon, alt_m, speed_mps)
        self.wps = cfg["waypoints"]
        self.wp_idx = 0
        self.seg_t = 0.0
        self.finished = False
        self.lat, self.lon, self.alt, self.spd = self.wps[0]
        self.hdg = 0.0
        self.sats = 12
        self.hdop = 0.9
        self.fix_valid = True
        self.drift_lat = 0.0
        self.drift_lon = 0.0
        self._rng = random.Random(hash(self.id))

        if len(self.wps) > 1:
            w0, w1 = self.wps[0], self.wps[1]
            self.hdg = bearing(w0[0], w0[1], w1[0], w1[1])

    def tick(self, dt):
        if self.finished:
            return

        wps = self.wps
        if self.wp_idx + 1 >= len(wps):
            self.finished = True
            return

        w0 = wps[self.wp_idx]
        w1 = wps[self.wp_idx + 1]

        seg_dist = haversine(w0[0], w0[1], w1[0], w1[1])
        if seg_dist < 0.1:
            self.wp_idx += 1
            self.seg_t = 0.0
            return

        speed = lerp(w0[3], w1[3], self.seg_t)
        self.seg_t += (speed * dt) / seg_dist

        if self.seg_t >= 1.0:
            self.wp_idx += 1
            self.seg_t = 0.0
            self.lat, self.lon, self.alt, self.spd = w1
            if self.wp_idx + 1 < len(wps):
                w2 = wps[self.wp_idx + 1]
                self.hdg = bearing(w1[0], w1[1], w2[0], w2[1])
            return

        t = self.seg_t
        self.lat = lerp(w0[0], w1[0], t)
        self.lon = lerp(w0[1], w1[1], t)
        self.alt = lerp(w0[2], w1[2], t)
        self.spd = speed
        self.hdg = bearing(w0[0], w0[1], w1[0], w1[1])

        self._apply_denial()

    def _apply_denial(self):
        if not self.gps_denial:
            self.sats = 12 + self._rng.randint(-1, 1)
            self.hdop = 0.9 + self._rng.uniform(-0.1, 0.1)
            self.fix_valid = True
            self.drift_lat = 0.0
            self.drift_lon = 0.0
            return

        dz = DENIAL_ZONE
        dist = haversine(dz["lat"], dz["lon"], self.lat, self.lon)
        if dist > dz["radius_m"]:
            self.sats = 12 + self._rng.randint(-1, 1)
            self.hdop = 0.9 + self._rng.uniform(-0.1, 0.1)
            self.fix_valid = True
            self.drift_lat = 0.0
            self.drift_lon = 0.0
            return

        # Inside denial zone — degrade proportionally
        s = 1.0 - (dist / dz["radius_m"])  # 0 at edge, 1 at center
        self.sats = max(dz["min_sats"], int(lerp(12, dz["min_sats"], s))
                        + self._rng.randint(0, dz["max_sats"]))
        self.hdop = lerp(0.9, dz["hdop_max"], s) + self._rng.uniform(-1, 1)
        self.fix_valid = self._rng.random() > (0.3 * s)

        drift_step = dz["drift_m"] * s * self._rng.uniform(0, 1)
        drift_brng = self._rng.uniform(0, 360)
        dl, dn = dest_point(0, 0, drift_brng, drift_step)
        self.drift_lat = self.drift_lat * 0.8 + dl * 0.2
        self.drift_lon = self.drift_lon * 0.8 + dn * 0.2

    def to_record(self):
        return {
            "tracker_id": self.id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "lat": self.lat + self.drift_lat,
            "lon": self.lon + self.drift_lon,
            "alt_m": self.alt,
            "speed_mps": self.spd,
            "course_deg": self.hdg,
            "satellites": self.sats,
            "hdop": self.hdop,
            "fix_valid": self.fix_valid,
        }


# ---------------------------------------------------------------------------
# API helpers
# ---------------------------------------------------------------------------

def api_post(backend, path, payload):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        f"{backend}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def create_session(backend):
    result = api_post(backend, "/api/v2/sessions", {
        "name": f"Demo BMO Field - {datetime.now().strftime('%b %d %H:%M')}",
        "operator_name": "Demo Script",
        "classification": "UNCLASSIFIED",
    })
    session_id = result["id"]
    print(f"  Created session: {session_id}")

    api_post(backend, f"/api/v2/sessions/{session_id}/start", {})
    print(f"  Session started")
    return session_id


def post_telemetry(backend, session_id, records):
    try:
        result = api_post(backend, "/api/v2/telemetry/ingest", {
            "organization_id": ORG_ID,
            "session_id": session_id,
            "records": records,
        })
        return result.get("accepted", 0)
    except Exception as e:
        print(f"  POST error: {e}", file=sys.stderr)
        return 0


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Demo Mode — BMO Field tracker simulation",
    )
    parser.add_argument("--backend", "-b", default=BACKEND, help="Backend URL")
    parser.add_argument("--duration", "-d", type=int, default=DURATION_S, help="Sim duration (seconds)")
    parser.add_argument("--speed", "-x", type=float, default=1.0, help="Playback speed multiplier")
    parser.add_argument("--instant", action="store_true", help="Post all data instantly (no sleep)")
    parser.add_argument("--batch", type=int, default=2, help="Seconds between POST batches")
    args = parser.parse_args()

    print("=" * 60)
    print("  SCENSUS Demo Mode — BMO Field, Toronto")
    print("=" * 60)
    print(f"  Backend  : {args.backend}")
    print(f"  Venue    : BMO Field ({VENUE[0]}, {VENUE[1]})")
    print(f"  Drones   : {len(DRONES)}")
    print(f"  Duration : {args.duration}s")
    print(f"  Speed    : {args.speed}x" + (" (instant)" if args.instant else ""))
    print("-" * 60)

    # Create session
    try:
        session_id = create_session(args.backend)
    except Exception as e:
        print(f"\n  ERROR: Could not create session: {e}", file=sys.stderr)
        print(f"  Is the backend running at {args.backend}?", file=sys.stderr)
        sys.exit(1)

    # Initialize drones
    drones = [Drone(d) for d in DRONES]

    dt = 1.0 / RATE_HZ
    elapsed = 0.0
    total_posted = 0
    batch_records = []
    last_batch_time = 0.0

    print(f"\n  Streaming telemetry to session {session_id}...")
    print(f"  View at: {args.backend.replace('8082', '5173')}/app/session/{session_id}/live")
    print()

    try:
        while elapsed < args.duration:
            tick_start = time.monotonic()

            # Advance all drones
            for d in drones:
                d.tick(dt)
                if not d.finished:
                    batch_records.append(d.to_record())

            elapsed += dt

            # Post batch at interval
            if elapsed - last_batch_time >= args.batch or args.instant:
                if batch_records:
                    accepted = post_telemetry(args.backend, session_id, batch_records)
                    total_posted += accepted
                    active = sum(1 for d in drones if not d.finished)
                    ts = datetime.now().strftime("%H:%M:%S")
                    print(f"  [{ts}] t={elapsed:5.0f}s | {len(batch_records):3d} records "
                          f"({active}/{len(drones)} active) | total={total_posted}")
                    batch_records = []
                    last_batch_time = elapsed

            # All done?
            if all(d.finished for d in drones):
                print("\n  All drones have completed their flight paths.")
                break

            # Pacing
            if not args.instant:
                tick_elapsed = time.monotonic() - tick_start
                sleep_time = (dt / args.speed) - tick_elapsed
                if sleep_time > 0:
                    time.sleep(sleep_time)

    except KeyboardInterrupt:
        print(f"\n  Interrupted at t={elapsed:.0f}s")

    # Flush remaining
    if batch_records:
        accepted = post_telemetry(args.backend, session_id, batch_records)
        total_posted += accepted

    print()
    print("=" * 60)
    print(f"  Done. Total records posted: {total_posted}")
    print(f"  Session: {session_id}")
    print(f"  View:    {args.backend.replace('8082', '5173')}/app/session/{session_id}/live")
    print("=" * 60)


if __name__ == "__main__":
    main()
