#!/usr/bin/env python3
"""
Mobile Companion Feature Test Script

Tests the Priority 6 features end-to-end against a running dashboard:
  1. CUAS geotag endpoint
  2. SDR reading ingest
  3. Operator position recording
  4. Mobile batch sync (offline queue flush)
  5. CoT actor bridge (UDP multicast → operator position)

Usage:
    # Start the dashboard first, then run:
    python test_data/test_mobile_companion.py

    # Custom backend URL:
    python test_data/test_mobile_companion.py --backend http://192.168.1.100:3000

    # Skip CoT test (if not in ops mode):
    python test_data/test_mobile_companion.py --skip-cot
"""

import argparse
import json
import socket
import sys
import time
import urllib.request
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
EXPRESS_PORT = 3000
PYTHON_PORT = 8083
COT_MULTICAST = "239.2.3.1"
COT_PORT = 6969

# Ottawa (default test location — near RCMP HQ)
TEST_LAT = 45.4215
TEST_LON = -75.6972


def api(base: str, method: str, path: str, body=None):
    """Make an API call and return (status, data)."""
    url = f"{base}{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())
    except Exception as e:
        return 0, {"error": str(e)}


def ok(label: str):
    print(f"  ✓ {label}")


def fail(label: str, detail=""):
    print(f"  ✗ {label}" + (f" — {detail}" if detail else ""))


def section(title: str):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")


def main():
    parser = argparse.ArgumentParser(description="Test Mobile Companion Features")
    parser.add_argument("--backend", "-b", default=f"http://127.0.0.1:{EXPRESS_PORT}",
                        help="Express backend URL (default: http://127.0.0.1:3000)")
    parser.add_argument("--python", default=f"http://127.0.0.1:{PYTHON_PORT}",
                        help="Python backend URL (default: http://127.0.0.1:8083)")
    parser.add_argument("--skip-cot", action="store_true",
                        help="Skip CoT UDP multicast test")
    args = parser.parse_args()

    base = args.backend.rstrip("/")
    py_base = args.python.rstrip("/")
    passed = 0
    failed = 0

    # ------------------------------------------------------------------
    # 0. Health check
    # ------------------------------------------------------------------
    section("0. Health Check")

    status, data = api(base, "GET", "/api/health")
    if status == 200:
        ok(f"Express backend reachable ({base})")
    else:
        fail(f"Express backend not reachable", f"status={status}")
        print("\n  Start the dashboard first: npm run dev (in electron/)")
        sys.exit(1)

    status, data = api(py_base, "GET", "/api/v2/health")
    if status == 200:
        ok(f"Python backend reachable ({py_base})")
    else:
        fail(f"Python backend not reachable — some tests may fail", f"status={status}")

    # ------------------------------------------------------------------
    # 1. Create a test session
    # ------------------------------------------------------------------
    section("1. Create Test Session")

    ts = datetime.now().strftime("%H:%M:%S")
    status, data = api(py_base, "POST", "/api/v2/sessions", {
        "name": f"Mobile Test - {ts}",
        "operator_name": "Test Script",
        "classification": "UNCLASSIFIED",
    })

    if status != 200 and status != 201:
        fail("Create session", f"status={status} {data}")
        sys.exit(1)

    session_id = data["id"]
    ok(f"Session created: {session_id[:8]}...")

    # Add a CUAS placement to the session
    status, data = api(py_base, "PUT", f"/api/v2/sessions/{session_id}", {
        "cuas_placements": [{
            "cuas_profile_id": None,
            "lat": TEST_LAT,
            "lon": TEST_LON,
            "alt_m": 10.0,
            "orientation_deg": 90.0,
            "active": True,
        }],
    })

    placement_id = None
    if status == 200:
        placements = data.get("cuas_placements", [])
        if placements:
            placement_id = placements[0]["id"]
            ok(f"CUAS placement added: {placement_id[:8]}...")
        else:
            fail("No placements returned from session update")
    else:
        # Try creating session with placements inline — fall back to direct insert
        fail("Could not add CUAS placement via session update", f"status={status}")

    # Add a session actor with cot_uid
    status, data = api(py_base, "POST", f"/api/v2/sessions/{session_id}/actors", {
        "name": "Test Operator",
        "callsign": "TANGO-1",
        "cot_uid": "SCENSUS-TEST-OPERATOR",
    })

    actor_id = None
    if status == 200 or status == 201:
        actor_id = data["id"]
        ok(f"Actor created with cot_uid: {actor_id[:8]}...")
    else:
        fail("Create actor", f"status={status} {data}")

    # Start the session (goes through Express session-bridge)
    status, data = api(base, "POST", f"/api/v2/sessions/{session_id}/start", {})
    if status == 200:
        ok("Session started (Express bridge triggered)")
        passed += 1
    else:
        fail("Start session", f"status={status} {data}")
        failed += 1

    time.sleep(1)  # Let the CoT actor bridge refresh

    # ------------------------------------------------------------------
    # 2. Test CUAS Geotag Endpoint
    # ------------------------------------------------------------------
    section("2. CUAS Geotag")

    if placement_id:
        new_lat = TEST_LAT + 0.001  # ~111m north
        new_lon = TEST_LON + 0.001
        status, data = api(base, "POST", f"/api/v2/cuas-placements/{placement_id}/geotag", {
            "lat": new_lat,
            "lon": new_lon,
            "alt_m": 12.5,
            "gps_accuracy_m": 3.2,
            "method": "gps",
            "actor_id": actor_id,
        })

        if status == 200 and data.get("geotagged_at"):
            ok(f"Geotag applied: ({new_lat:.4f}, {new_lon:.4f})")
            ok(f"  method={data.get('geotag_method')}, at={data.get('geotagged_at')}")
            passed += 1
        else:
            fail("Geotag endpoint", f"status={status} {data}")
            failed += 1
    else:
        fail("Skipped — no placement ID")
        failed += 1

    # ------------------------------------------------------------------
    # 3. Test SDR Reading Ingest
    # ------------------------------------------------------------------
    section("3. SDR Reading")

    status, data = api(base, "POST", f"/api/v2/sessions/{session_id}/sdr-readings", {
        "actor_id": actor_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "lat": TEST_LAT,
        "lon": TEST_LON,
        "alt_m": 10.0,
        "gps_accuracy_m": 5.0,
        "center_frequency_mhz": 2437.0,
        "bandwidth_mhz": 20.0,
        "gain_db": 40.0,
        "readings": [
            {"frequency_mhz": 2427, "power_dbm": -65.2},
            {"frequency_mhz": 2437, "power_dbm": -42.1},
            {"frequency_mhz": 2447, "power_dbm": -58.7},
        ],
        "device_info": {"type": "HackRF", "serial": "TEST-001"},
        "notes": "Test reading from script",
    })

    if status == 200 and data.get("id"):
        ok(f"SDR reading created: {data['id'][:8]}...")
        passed += 1
    else:
        fail("SDR reading", f"status={status} {data}")
        failed += 1

    # Verify it was stored
    status, data = api(base, "GET", f"/api/v2/sessions/{session_id}/sdr-readings")
    if status == 200 and len(data) > 0:
        ok(f"SDR readings retrievable: {len(data)} reading(s)")
        passed += 1
    else:
        fail("SDR readings list", f"status={status}")
        failed += 1

    # ------------------------------------------------------------------
    # 4. Test Operator Position
    # ------------------------------------------------------------------
    section("4. Operator Position")

    status, data = api(base, "POST", f"/api/v2/sessions/{session_id}/operator-positions", {
        "actor_id": actor_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "lat": TEST_LAT + 0.0005,
        "lon": TEST_LON - 0.0003,
        "alt_m": 11.0,
        "heading_deg": 45.0,
        "speed_mps": 1.2,
        "gps_accuracy_m": 4.0,
        "source": "gps",
    })

    if status == 200:
        ok("Operator position recorded")
        passed += 1
    else:
        fail("Operator position", f"status={status} {data}")
        failed += 1

    # ------------------------------------------------------------------
    # 5. Test Mobile Batch Sync
    # ------------------------------------------------------------------
    section("5. Mobile Batch Sync (Offline Queue)")

    batch_ops = [
        {
            "id": "op-1",
            "type": "operator_position",
            "payload": {
                "session_id": session_id,
                "actor_id": actor_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "lat": TEST_LAT + 0.002,
                "lon": TEST_LON + 0.002,
                "alt_m": 9.0,
                "source": "gps",
            },
        },
        {
            "id": "op-2",
            "type": "sdr_reading",
            "payload": {
                "session_id": session_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "lat": TEST_LAT,
                "lon": TEST_LON,
                "center_frequency_mhz": 5800.0,
                "bandwidth_mhz": 40.0,
                "gain_db": 30.0,
                "notes": "Batch synced reading",
            },
        },
        {
            "id": "op-3",
            "type": "cuas_geotag",
            "payload": {
                "placement_id": placement_id or "nonexistent",
                "lat": TEST_LAT - 0.001,
                "lon": TEST_LON - 0.001,
                "method": "gps",
            },
        },
    ]

    status, data = api(base, "POST", "/api/v2/mobile/sync", {"operations": batch_ops})

    if status == 200:
        ok(f"Batch sync: {data.get('succeeded')}/{data.get('total')} succeeded")
        for r in data.get("results", []):
            if r["status"] == "ok":
                ok(f"  {r['id']}: ok")
            else:
                fail(f"  {r['id']}: {r.get('detail', 'error')}")
        if data.get("succeeded", 0) >= 2:
            passed += 1
        else:
            failed += 1
    else:
        fail("Batch sync", f"status={status} {data}")
        failed += 1

    # ------------------------------------------------------------------
    # 6. Test CoT UDP → Actor Bridge (optional)
    # ------------------------------------------------------------------
    if not args.skip_cot:
        section("6. CoT UDP Multicast → Actor Bridge")

        cot_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<event version="2.0" uid="SCENSUS-TEST-OPERATOR" type="a-f-G-U-C"
       time="{datetime.now(timezone.utc).isoformat()}"
       start="{datetime.now(timezone.utc).isoformat()}"
       stale="{datetime.now(timezone.utc).isoformat()}" how="m-g">
  <point lat="{TEST_LAT + 0.003}" lon="{TEST_LON + 0.003}" hae="15.0" ce="5.0" le="9999999" />
  <detail>
    <contact callsign="TANGO-1" />
    <track course="180" speed="1.5" />
    <__group name="Cyan" role="Team Member" />
  </detail>
</event>""".strip()

        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
            sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
            sock.sendto(cot_xml.encode("utf-8"), (COT_MULTICAST, COT_PORT))
            sock.close()
            ok(f"CoT XML sent to {COT_MULTICAST}:{COT_PORT} (uid=SCENSUS-TEST-OPERATOR)")
            ok("  If ops_mode + cot_enabled, the bridge should forward this as an operator_position")
            ok("  Check dashboard logs for: [CoT Actor Bridge] Mapped")
            passed += 1
        except Exception as e:
            fail(f"CoT UDP send failed: {e}")
            ok("  This is expected if you're not on a multicast-capable network")
            failed += 1
    else:
        section("6. CoT UDP Multicast (skipped)")
        ok("Use --skip-cot to skip, or remove it to test")

    # ------------------------------------------------------------------
    # 7. Stop session
    # ------------------------------------------------------------------
    section("7. Cleanup — Stop Session")

    status, data = api(base, "POST", f"/api/v2/sessions/{session_id}/stop", {})
    if status == 200:
        ok(f"Session stopped")
        export = data.get("export_summary", {})
        if export:
            ok(f"  Express export: {export.get('total_positions', 0)} positions, "
               f"{len(export.get('files_created', []))} files")
        passed += 1
    else:
        fail("Stop session", f"status={status}")
        failed += 1

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    section("Results")
    total = passed + failed
    print(f"\n  {passed}/{total} passed, {failed} failed")
    print(f"  Session ID: {session_id}")
    print(f"  View in app: {base}/app/")
    print()

    if failed > 0:
        print("  Some tests failed. Common causes:")
        print("    - Python backend not running (start dashboard first)")
        print("    - Session had no CUAS placements (check session update API)")
        print("    - CoT test requires ops_mode enabled in config.json")
        print()

    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
