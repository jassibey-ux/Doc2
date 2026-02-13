#!/usr/bin/env python3
"""
Simulate live UAS telemetry for testing the React dashboard.
Writes directly to the LiveTestSession folder.
"""

import random
import time
from datetime import datetime
from pathlib import Path

# Session directory - same as what the backend is monitoring
SESSION_DIR = Path(__file__).parent / "LiveTestSession"

# Use same tracker IDs as existing files (200-209)
TRACKERS = {
    "200": {"lat": 34.058, "lon": -118.249, "alt": 131.0, "course": 45.0},
    "201": {"lat": 34.049, "lon": -118.237, "alt": 83.0, "course": 90.0},
    "202": {"lat": 34.063, "lon": -118.235, "alt": 68.0, "course": 135.0},
    "203": {"lat": 34.049, "lon": -118.220, "alt": 109.0, "course": 180.0},
    "204": {"lat": 34.042, "lon": -118.251, "alt": 95.0, "course": 225.0},
    "205": {"lat": 34.056, "lon": -118.261, "alt": 142.0, "course": 270.0},
    "206": {"lat": 34.068, "lon": -118.243, "alt": 78.0, "course": 315.0},
    "207": {"lat": 34.044, "lon": -118.229, "alt": 112.0, "course": 0.0},
    "208": {"lat": 34.061, "lon": -118.218, "alt": 88.0, "course": 60.0},
    "209": {"lat": 34.052, "lon": -118.255, "alt": 156.0, "course": 120.0},
}


def generate_record(tracker_id: str, state: dict) -> str:
    """Generate a new telemetry record matching existing CSV format."""
    # Format: Time Local Received,Unique ID,Latitude,Longitude,Altitude,Speed,Heading,RSSI,Barometric Altitude,Vertical Velocity,Horizontal Velocity,Ground Speed,GPS Fix Valid
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S.") + f"{random.randint(100,999)}"

    # Update position with random movement
    state["lat"] += random.uniform(-0.0003, 0.0003)
    state["lon"] += random.uniform(-0.0003, 0.0003)
    state["alt"] += random.uniform(-2.0, 3.0)
    state["alt"] = max(50, min(200, state["alt"]))  # Keep altitude reasonable
    state["course"] = (state["course"] + random.uniform(-10.0, 10.0)) % 360

    speed = random.uniform(8.0, 15.0)
    rssi = random.randint(-65, -45)
    baro_alt = state["alt"] + random.uniform(-2.0, 2.0)
    vert_vel = random.uniform(-3.0, 3.0)
    horiz_vel = speed + random.uniform(-1.0, 1.0)
    ground_speed = speed * random.uniform(0.9, 1.0)
    fix_valid = 1 if random.random() > 0.05 else 0

    return (
        f"{now},{tracker_id},{state['lat']:.6f},{state['lon']:.6f},"
        f"{state['alt']:.1f},{speed:.1f},{state['course']:.1f},{rssi},"
        f"{baro_alt:.1f},{vert_vel:.1f},{horiz_vel:.1f},{ground_speed:.1f},{fix_valid}\n"
    )


def main():
    print("=" * 50)
    print("SCENSUS UAS Live Data Simulator")
    print("=" * 50)
    print(f"Writing to: {SESSION_DIR}")
    print(f"Trackers: {len(TRACKERS)}")
    print("Interval: 2 seconds")
    print("Duration: 2 minutes")
    print("\nPress Ctrl+C to stop\n")

    # Initialize tracker states
    states = {tid: dict(data) for tid, data in TRACKERS.items()}

    start_time = time.time()
    count = 0
    duration = 120  # 2 minutes

    try:
        while (time.time() - start_time) < duration:
            for tracker_id, state in states.items():
                csv_file = SESSION_DIR / f"tracker_{tracker_id}.csv"
                record = generate_record(tracker_id, state)

                with open(csv_file, "a") as f:
                    f.write(record)

            count += 1
            timestamp = datetime.now().strftime("%H:%M:%S")
            print(f"[{timestamp}] Update #{count} - wrote {len(TRACKERS)} records")

            time.sleep(2)

    except KeyboardInterrupt:
        print(f"\n\nStopped by user. Total updates: {count}")

    print(f"\nCompleted! Total updates: {count}")


if __name__ == "__main__":
    main()
