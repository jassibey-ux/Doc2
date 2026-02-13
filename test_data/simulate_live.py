#!/usr/bin/env python3
"""
Simulate live UAS telemetry data by appending new lines to CSV files.
Run this while the dashboard is monitoring to see real-time updates.

Usage:
    python3 simulate_live.py [--interval 5] [--session TestSession_2025_12_23]
"""

import argparse
import random
import time
from datetime import datetime
from pathlib import Path

# Base positions for each tracker (LA area)
TRACKERS = {
    "101": {"lat": 34.0550, "lon": -118.2400, "alt": 150.0, "course": 45.0},
    "102": {"lat": 34.0480, "lon": -118.2440, "alt": 140.0, "course": 180.0},
    "103": {"lat": 34.0530, "lon": -118.2480, "alt": 120.0, "course": 270.0},
}


def generate_record(tracker_id: str, state: dict) -> str:
    """Generate a new telemetry record."""
    now = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")

    # Update position with some random movement
    state["lat"] += random.uniform(-0.0002, 0.0003)
    state["lon"] += random.uniform(-0.0003, 0.0002)
    state["alt"] += random.uniform(-2.0, 3.0)
    state["course"] = (state["course"] + random.uniform(-5.0, 5.0)) % 360

    speed = random.uniform(1.0, 6.0)
    hdop = random.uniform(0.8, 2.0)
    rssi = random.randint(-95, -75)
    fix_valid = "true" if random.random() > 0.1 else "false"
    baro_alt = state["alt"] + random.uniform(-1.0, 1.0)
    baro_temp = random.uniform(20.0, 25.0)
    baro_press = random.uniform(1010.0, 1015.0)

    return (
        f"{tracker_id},{now},{state['lat']:.6f},{state['lon']:.6f},"
        f"{state['alt']:.1f},{speed:.1f},{state['course']:.1f},{hdop:.1f},"
        f"{rssi},{fix_valid},{baro_alt:.1f},{baro_temp:.1f},{baro_press:.1f}\n"
    )


def main():
    parser = argparse.ArgumentParser(description="Simulate live UAS telemetry")
    parser.add_argument("--interval", type=float, default=5.0, help="Seconds between updates")
    parser.add_argument("--session", type=str, default="TestSession_2025_12_23", help="Session folder name")
    parser.add_argument("--duration", type=int, default=300, help="Duration in seconds (0=infinite)")
    args = parser.parse_args()

    script_dir = Path("C:/Temp")
    session_dir = script_dir / args.session

    if not session_dir.exists():
        print(f"Creating session directory: {session_dir}")
        session_dir.mkdir(parents=True)

    # Initialize tracker states
    states = {tid: dict(data) for tid, data in TRACKERS.items()}

    # Ensure CSV files exist with headers
    header = "tracker_id,time,lat,lon,alt,speed,course,hdop,rssi,fix_valid,baro_alt,baro_temp,baro_press\n"
    for tracker_id in TRACKERS:
        csv_file = session_dir / f"tracker_{tracker_id}.csv"
        if not csv_file.exists():
            with open(csv_file, "w") as f:
                f.write(header)
            print(f"Created: {csv_file}")

    print(f"\nSimulating live data for {len(TRACKERS)} trackers")
    print(f"Session: {session_dir}")
    print(f"Interval: {args.interval}s")
    print(f"Duration: {'infinite' if args.duration == 0 else f'{args.duration}s'}")
    print("\nPress Ctrl+C to stop\n")

    start_time = time.time()
    count = 0

    try:
        while True:
            if args.duration > 0 and (time.time() - start_time) >= args.duration:
                print(f"\nDuration reached ({args.duration}s). Stopping.")
                break

            for tracker_id, state in states.items():
                csv_file = session_dir / f"tracker_{tracker_id}.csv"
                record = generate_record(tracker_id, state)

                with open(csv_file, "a") as f:
                    f.write(record)

            count += 1
            timestamp = datetime.now().strftime("%H:%M:%S")
            print(f"[{timestamp}] Update #{count} - wrote {len(TRACKERS)} records")

            time.sleep(args.interval)

    except KeyboardInterrupt:
        print(f"\n\nStopped. Total updates: {count}")


if __name__ == "__main__":
    main()
