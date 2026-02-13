#!/usr/bin/env python3
"""Generate 10 CSV test files with simulated tracker data."""

import csv
import random
import math
from datetime import datetime, timedelta
from pathlib import Path

# Output folder
OUTPUT_DIR = Path("C:/Temp/LiveTestSession")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# LA downtown center
BASE_LAT = 34.052
BASE_LON = -118.243

# CSV headers matching the expected format
HEADERS = [
    "Time Local Received",
    "Unique ID",
    "Latitude",
    "Longitude",
    "Altitude",
    "Speed",
    "Heading",
    "RSSI",
    "Barometric Altitude",
    "Vertical Velocity",
    "Horizontal Velocity",
    "Ground Speed",
    "GPS Fix Valid"
]

def generate_tracker_path(tracker_id: int, num_records: int = 100) -> list[dict]:
    """Generate a realistic flight path for a tracker."""
    records = []

    # Starting position (offset from base for each tracker)
    angle_offset = (tracker_id - 200) * 0.5  # radians
    distance_offset = 0.005 * (tracker_id % 5)

    lat = BASE_LAT + distance_offset * math.cos(angle_offset)
    lon = BASE_LON + distance_offset * math.sin(angle_offset)
    alt = random.uniform(50, 150)
    heading = random.uniform(0, 360)
    speed = random.uniform(5, 15)

    # Start time
    start_time = datetime.now()

    for i in range(num_records):
        # Time increment (1 second between records)
        timestamp = start_time + timedelta(seconds=i)

        # Movement simulation
        heading += random.uniform(-10, 10)  # Slight heading changes
        heading = heading % 360

        # Move based on heading and speed
        move_distance = speed / 111000  # Convert m/s to degrees (approx)
        lat += move_distance * math.cos(math.radians(heading))
        lon += move_distance * math.sin(math.radians(heading))

        # Altitude changes
        alt += random.uniform(-2, 2)
        alt = max(30, min(200, alt))  # Clamp altitude

        # Speed variations
        speed += random.uniform(-1, 1)
        speed = max(3, min(20, speed))

        # RSSI simulation (stronger when closer to base)
        distance_from_base = math.sqrt((lat - BASE_LAT)**2 + (lon - BASE_LON)**2)
        rssi = -50 - int(distance_from_base * 5000) + random.randint(-5, 5)
        rssi = max(-100, min(-40, rssi))

        # GPS fix validity (occasionally lose fix)
        gps_valid = 1 if random.random() > 0.05 else 0

        records.append({
            "Time Local Received": timestamp.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3],
            "Unique ID": str(tracker_id),
            "Latitude": f"{lat:.6f}",
            "Longitude": f"{lon:.6f}",
            "Altitude": f"{alt:.1f}",
            "Speed": f"{speed:.1f}",
            "Heading": f"{heading:.1f}",
            "RSSI": str(rssi),
            "Barometric Altitude": f"{alt + random.uniform(-5, 5):.1f}",
            "Vertical Velocity": f"{random.uniform(-2, 2):.1f}",
            "Horizontal Velocity": f"{speed:.1f}",
            "Ground Speed": f"{speed * 0.95:.1f}",
            "GPS Fix Valid": str(gps_valid)
        })

    return records

def write_csv(tracker_id: int, records: list[dict]):
    """Write records to CSV file."""
    filename = OUTPUT_DIR / f"tracker_{tracker_id}.csv"

    with open(filename, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=HEADERS)
        writer.writeheader()
        writer.writerows(records)

    print(f"Created: {filename} ({len(records)} records)")

def main():
    print(f"Generating 10 CSV files in: {OUTPUT_DIR}")
    print("-" * 50)

    # Generate 10 trackers (IDs 200-209)
    for tracker_id in range(200, 210):
        records = generate_tracker_path(tracker_id, num_records=100)
        write_csv(tracker_id, records)

    print("-" * 50)
    print(f"Done! Created 10 CSV files with 100 records each.")
    print(f"Total: 1000 telemetry records")

if __name__ == "__main__":
    main()
