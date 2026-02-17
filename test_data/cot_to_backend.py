#!/usr/bin/env python3
"""
Bridge script: Runs the CoT simulator and pipes telemetry to the backend
via POST /api/v2/telemetry/ingest so the browser frontend can display drones.

Usage:
    python cot_to_backend.py --scenario scenarios/world_cup_bmo_field.json
    python cot_to_backend.py --scenario scenarios/world_cup_bc_place.json --backend http://localhost:8082
"""

import argparse
import json
import math
import socket
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from xml.etree.ElementTree import fromstring

import urllib.request

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
DEFAULT_BACKEND = "http://127.0.0.1:8082"
DEFAULT_UDP_PORT = 4242
ORG_ID = "scensus-dev"


def create_session(backend: str) -> str:
    """Create and start a test session via the API."""
    # Create session
    payload = json.dumps({
        "name": f"CoT Sim - {datetime.now().strftime('%H:%M:%S')}",
        "operator_name": "CoT Simulator",
        "classification": "UNCLASSIFIED",
    }).encode()

    req = urllib.request.Request(
        f"{backend}/api/v2/sessions",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
        session_id = data["id"]
        print(f"Created session: {session_id}")

    # Start it
    req = urllib.request.Request(
        f"{backend}/api/v2/sessions/{session_id}/start",
        data=b"{}",
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        print(f"Session started: {session_id}")

    return session_id


def post_telemetry(backend: str, session_id: str, records: list) -> int:
    """POST a batch of telemetry records to the backend."""
    payload = json.dumps({
        "organization_id": ORG_ID,
        "session_id": session_id,
        "records": records,
    }).encode()

    req = urllib.request.Request(
        f"{backend}/api/v2/telemetry/ingest",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read())
            return data.get("accepted", 0)
    except Exception as e:
        print(f"  POST error: {e}", file=sys.stderr)
        return 0


def listen_udp(port: int, queue: list, stop_event: threading.Event):
    """Listen for CoT XML on UDP and parse into telemetry records."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("0.0.0.0", port))
    sock.settimeout(1.0)

    while not stop_event.is_set():
        try:
            data, _ = sock.recvfrom(65535)
        except socket.timeout:
            continue

        try:
            root = fromstring(data.decode("utf-8"))
            uid = root.get("uid", "UNKNOWN")
            point = root.find("point")
            if point is None:
                continue

            lat = float(point.get("lat", 0))
            lon = float(point.get("lon", 0))
            hae = float(point.get("hae", 0))

            detail = root.find("detail")
            track = detail.find("track") if detail is not None else None
            speed = float(track.get("speed", 0)) if track is not None else 0
            course = float(track.get("course", 0)) if track is not None else 0

            # Extract GPS quality from remarks if present
            remarks = detail.find("remarks") if detail is not None else None
            satellites = None
            hdop = None
            fix_type = "3d"
            if remarks is not None and remarks.text:
                for part in remarks.text.split(";"):
                    kv = part.strip().split("=")
                    if len(kv) == 2:
                        k, v = kv[0].strip(), kv[1].strip()
                        if k == "sats":
                            satellites = int(v)
                        elif k == "hdop":
                            hdop = float(v)
                        elif k == "fix":
                            fix_type = v

            record = {
                "tracker_id": uid,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "lat": lat,
                "lon": lon,
                "alt": hae,
                "sat_count": satellites,
                "fix_type": fix_type,
                "hdop": hdop,
                "speed": speed,
                "course": course,
            }
            queue.append(record)
        except Exception:
            pass

    sock.close()


def main():
    parser = argparse.ArgumentParser(description="CoT Simulator → Backend Bridge")
    parser.add_argument("--scenario", "-s", required=True, help="Scenario JSON file")
    parser.add_argument("--backend", "-b", default=DEFAULT_BACKEND, help="Backend URL")
    parser.add_argument("--port", "-p", type=int, default=DEFAULT_UDP_PORT, help="UDP listen port")
    parser.add_argument("--batch-interval", type=float, default=2.0, help="Seconds between POST batches")
    args = parser.parse_args()

    # Resolve scenario path relative to this script
    script_dir = Path(__file__).resolve().parent
    scenario_path = Path(args.scenario)
    if not scenario_path.is_absolute():
        scenario_path = script_dir / scenario_path

    if not scenario_path.exists():
        print(f"Error: scenario not found: {scenario_path}", file=sys.stderr)
        sys.exit(1)

    print(f"Backend  : {args.backend}")
    print(f"UDP port : {args.port}")
    print(f"Scenario : {scenario_path.name}")
    print("-" * 60)

    # Create and start a session
    try:
        session_id = create_session(args.backend)
    except Exception as e:
        print(f"Failed to create session: {e}", file=sys.stderr)
        sys.exit(1)

    # Start UDP listener in a thread
    queue = []
    stop_event = threading.Event()
    listener = threading.Thread(target=listen_udp, args=(args.port, queue, stop_event), daemon=True)
    listener.start()

    # Launch the CoT simulator as a subprocess
    import subprocess
    sim_proc = subprocess.Popen(
        [sys.executable, "-u", str(script_dir / "cot_simulator.py"),
         "--scenario", str(scenario_path),
         "--address", "127.0.0.1"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    total_posted = 0
    print(f"\nListening on UDP {args.port}, forwarding to {args.backend}...")
    print(f"Session: {session_id}\n")

    try:
        while sim_proc.poll() is None:
            time.sleep(args.batch_interval)

            if queue:
                batch = list(queue)
                queue.clear()
                accepted = post_telemetry(args.backend, session_id, batch)
                total_posted += accepted
                # Summarize
                trackers = set(r["tracker_id"] for r in batch)
                print(f"[{datetime.now().strftime('%H:%M:%S')}] "
                      f"Sent {len(batch)} records ({len(trackers)} drones) → "
                      f"accepted={accepted}  total={total_posted}")

        # Drain remaining
        time.sleep(1)
        if queue:
            batch = list(queue)
            queue.clear()
            accepted = post_telemetry(args.backend, session_id, batch)
            total_posted += accepted
            print(f"[final] Sent {len(batch)} → accepted={accepted}")

    except KeyboardInterrupt:
        print("\nStopping...")
        sim_proc.terminate()
    finally:
        stop_event.set()
        sim_proc.wait(timeout=5)

    print(f"\nDone. Total records posted: {total_posted}")
    print(f"Session ID: {session_id}")
    print(f"View in browser: {args.backend.replace('8082', '5173')}/app/")


if __name__ == "__main__":
    main()
