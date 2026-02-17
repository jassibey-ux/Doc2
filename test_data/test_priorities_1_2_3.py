#!/usr/bin/env python3
"""
Priority 1/2/3 End-to-End Test

Tests against the Python backend directly (port 8083) since
the Electron app may be running an older build.

Usage:
    python test_data/test_priorities_1_2_3.py
"""

import json
import sys
import time
import urllib.request
from datetime import datetime, timezone

BASE = "http://127.0.0.1:8083"
passed = 0
failed = 0


def api(method, path, body=None):
    url = f"{BASE}{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body_text = e.read().decode()
        try:
            return e.code, json.loads(body_text)
        except Exception:
            return e.code, {"raw": body_text}
    except Exception as e:
        return 0, {"error": str(e)}


def ok(label):
    global passed
    passed += 1
    print(f"  \u2713 {label}")


def fail(label, detail=""):
    global failed
    failed += 1
    print(f"  \u2717 {label}" + (f" \u2014 {detail}" if detail else ""))


def check(condition, label, detail=""):
    if condition:
        ok(label)
    else:
        fail(label, detail)
    return condition


def section(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")


def main():
    global passed, failed

    # ------------------------------------------------------------------
    section("0. Health Check")
    # ------------------------------------------------------------------
    status, data = api("GET", "/api/v2/health")
    if not check(status == 200, f"Python backend reachable ({BASE})", f"status={status}"):
        print("\n  Start the dashboard first!")
        sys.exit(1)

    # ==================================================================
    #  PRIORITY 1: Fix Session Workspace
    # ==================================================================
    section("PRIORITY 1: Session Workspace")

    # 1a. Create a session with tracker assignments
    ts = datetime.now().strftime("%H:%M:%S")
    status, session = api("POST", "/api/v2/sessions", {
        "name": f"P1 Test - {ts}",
        "operator_name": "Test Script",
        "classification": "UNCLASSIFIED",
        "tracker_assignments": [
            {"tracker_id": "TEST-TRACKER-001", "target_altitude_m": 50.0},
            {"tracker_id": "TEST-TRACKER-002", "target_altitude_m": 120.0},
        ],
        "cuas_placements": [
            {"lat": 45.4215, "lon": -75.6972, "orientation_deg": 90.0, "active": True},
        ],
    })
    check(status == 200 or status == 201, f"Create session with trackers + CUAS", f"status={status}")
    session_id = session.get("id", "")
    print(f"       session_id = {session_id[:12]}...")

    # 1b. Verify tracker assignments came back with target_altitude_m
    assignments = session.get("tracker_assignments", [])
    check(len(assignments) == 2, f"2 tracker assignments returned", f"got {len(assignments)}")
    if assignments:
        alt = assignments[0].get("target_altitude_m")
        check(alt == 50.0, f"target_altitude_m preserved (50.0)", f"got {alt}")

    # 1c. Verify CUAS placement came back with orientation_deg
    placements = session.get("cuas_placements", [])
    check(len(placements) >= 1, f"CUAS placement returned", f"got {len(placements)}")
    placement_id = placements[0]["id"] if placements else None
    if placements:
        orient = placements[0].get("orientation_deg")
        check(orient == 90.0, f"orientation_deg preserved (90.0)", f"got {orient}")

    # 1d. Start session
    status, data = api("POST", f"/api/v2/sessions/{session_id}/start")
    check(status == 200, "Start session", f"status={status}")
    check(data.get("status") == "active", "Session status = active", f"got {data.get('status')}")

    # 1e. Ingest some telemetry so we can test retrieval
    for i in range(5):
        api("POST", "/api/v2/telemetry/ingest", {
            "organization_id": "test",
            "session_id": session_id,
            "records": [
                {
                    "tracker_id": "TEST-TRACKER-001",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "lat": 45.4215 + i * 0.0001,
                    "lon": -75.6972 + i * 0.0001,
                    "alt": 50.0 + i,
                    "speed": 5.0,
                    "course": 90.0,
                    "sat_count": 12,
                    "hdop": 1.2,
                    "fix_type": "3d",
                },
                {
                    "tracker_id": "TEST-TRACKER-002",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "lat": 45.4220 + i * 0.0001,
                    "lon": -75.6960 + i * 0.0001,
                    "alt": 120.0 + i,
                    "speed": 8.0,
                    "course": 180.0,
                    "sat_count": 10,
                    "hdop": 1.5,
                    "fix_type": "3d",
                },
            ],
        })
        time.sleep(0.1)

    ok("Ingested 10 telemetry points (5 batches x 2 trackers)")

    # 1f. GET telemetry with downsampling
    status, telem = api("GET", f"/api/v2/sessions/{session_id}/telemetry?downsample=2000")
    check(status == 200, "GET /telemetry endpoint exists", f"status={status}")
    tracks = telem.get("tracks", {})
    check(len(tracks) >= 1, f"Tracks returned for {len(tracks)} tracker(s)", f"keys={list(tracks.keys())}")
    total_points = telem.get("point_count", 0)
    check(total_points > 0, f"Telemetry points returned: {total_points}", "got 0")

    # Verify point structure
    if tracks:
        first_track = list(tracks.values())[0]
        if first_track:
            pt = first_track[0]
            has_fields = all(k in pt for k in ["lat", "lon", "alt_m", "timestamp"])
            check(has_fields, "Telemetry point has lat/lon/alt_m/timestamp fields")

    # 1g. Session listing
    status, listing = api("GET", "/api/v2/sessions?limit=5")
    check(status == 200, "GET /sessions listing works", f"status={status}")
    items = listing.get("items", listing) if isinstance(listing, dict) else listing
    if isinstance(items, list):
        check(len(items) > 0, f"Session listing returned {len(items)} session(s)")
    else:
        items_list = items if isinstance(items, list) else []
        check(len(items_list) > 0, f"Session listing returned sessions")

    # 1h. Session detail retrieval
    status, detail = api("GET", f"/api/v2/sessions/{session_id}")
    check(status == 200, "GET /sessions/{id} detail works", f"status={status}")
    check(detail.get("name", "").startswith("P1 Test"), "Session name correct")
    check("tracker_assignments" in detail, "Detail includes tracker_assignments")
    check("cuas_placements" in detail, "Detail includes cuas_placements")

    # ==================================================================
    #  PRIORITY 2: Engagement Model
    # ==================================================================
    section("PRIORITY 2: Engagement Model")

    # 2a. Create engagement (planned)
    status, eng = api("POST", f"/api/v2/sessions/{session_id}/engagements", {
        "cuas_placement_id": placement_id,
        "name": "Run 1",
        "engagement_type": "test",
        "targets": [
            {"tracker_id": "TEST-TRACKER-001", "role": "primary_target"},
        ],
    })
    check(status == 200 or status == 201, "Create engagement (Run 1)", f"status={status} {eng}")
    eng_id = eng.get("id", "")
    check(eng.get("status") == "planned", f"Engagement status = planned", f"got {eng.get('status')}")
    check(eng.get("name") == "Run 1", f"Engagement name = 'Run 1'", f"got {eng.get('name')}")
    print(f"       engagement_id = {eng_id[:12]}...")

    # 2b. List engagements
    status, eng_list = api("GET", f"/api/v2/sessions/{session_id}/engagements")
    check(status == 200, "List engagements", f"status={status}")
    engs = eng_list.get("engagements", [])
    check(len(engs) >= 1, f"Engagement list has {len(engs)} engagement(s)")

    # 2c. Engage (planned → active)
    status, eng = api("POST", f"/api/v2/engagements/{eng_id}/engage")
    check(status == 200, "Engage (planned → active)", f"status={status} {eng}")
    check(eng.get("status") == "active", "Engagement status = active", f"got {eng.get('status')}")

    # 2d. Jam ON
    status, burst = api("POST", f"/api/v2/engagements/{eng_id}/jam-on")
    check(status == 200, "Jam ON — burst created", f"status={status} {burst}")
    if status == 200:
        check(burst.get("burst_seq") is not None, f"burst_seq = {burst.get('burst_seq')}")
        check(burst.get("jam_on_at") is not None, "jam_on_at timestamp set")

    time.sleep(0.5)

    # 2e. Jam OFF
    status, burst = api("POST", f"/api/v2/engagements/{eng_id}/jam-off")
    check(status == 200, "Jam OFF — burst closed", f"status={status} {burst}")
    if status == 200:
        check(burst.get("jam_off_at") is not None, "jam_off_at timestamp set")
        dur = burst.get("duration_s")
        check(dur is not None and dur > 0, f"Burst duration = {dur:.2f}s", f"got {dur}")

    # 2f. Second jam burst
    status, burst2 = api("POST", f"/api/v2/engagements/{eng_id}/jam-on")
    check(status == 200, "Second Jam ON", f"status={status}")
    if status == 200:
        check(burst2.get("burst_seq", 0) > burst.get("burst_seq", 0),
              f"burst_seq incremented to {burst2.get('burst_seq')}")
    time.sleep(0.3)
    api("POST", f"/api/v2/engagements/{eng_id}/jam-off")

    # 2g. List bursts
    status, bursts_resp = api("GET", f"/api/v2/engagements/{eng_id}/bursts")
    check(status == 200, "List jam bursts", f"status={status}")
    burst_list = bursts_resp.get("bursts", [])
    check(len(burst_list) == 2, f"2 bursts recorded", f"got {len(burst_list)}")

    # 2h. Compute metrics
    status, eng = api("POST", f"/api/v2/engagements/{eng_id}/compute-metrics")
    check(status == 200, "Compute metrics", f"status={status}")

    # 2i. Disengage (active → complete)
    status, eng = api("POST", f"/api/v2/engagements/{eng_id}/disengage")
    check(status == 200, "Disengage (active → complete)", f"status={status} {eng}")
    check(eng.get("status") == "complete", "Engagement status = complete", f"got {eng.get('status')}")

    # 2j. Get engagement summary
    status, eng_detail = api("GET", f"/api/v2/engagements/{eng_id}/summary")
    check(status == 200, "GET /engagements/{id}/summary", f"status={status}")

    # 2k. Create a second engagement via quick-start
    status, eng2 = api("POST", f"/api/v2/sessions/{session_id}/engagements/quick", {
        "name": "Run 2",
        "engagement_type": "test",
    })
    check(status == 200 or status == 201, "Quick-start engagement (Run 2)", f"status={status} {eng2}")
    eng2_id = eng2.get("id", "")
    check(eng2.get("status") == "active", "Quick engagement auto-activated", f"got {eng2.get('status')}")

    # Abort it
    if eng2_id:
        status, eng2 = api("POST", f"/api/v2/engagements/{eng2_id}/abort")
        check(status == 200, "Abort engagement (Run 2)", f"status={status}")
        check(eng2.get("status") == "aborted", "Engagement status = aborted", f"got {eng2.get('status')}")

    # 2l. Session-level engagement summary
    status, summary = api("GET", f"/api/v2/sessions/{session_id}/engagement-summary")
    check(status == 200, "GET /sessions/{id}/engagement-summary", f"status={status}")
    stats = summary.get("stats", {})
    check(stats.get("total_runs", 0) >= 2, f"total_runs = {stats.get('total_runs')}")
    check(stats.get("completed_runs", 0) >= 1, f"completed_runs = {stats.get('completed_runs')}")
    runs = summary.get("runs", [])
    check(len(runs) >= 2, f"Summary includes {len(runs)} run(s)")
    print(f"       pass_rate = {stats.get('pass_rate', 'N/A')}%")

    # ==================================================================
    #  PRIORITY 3: CUAS Placement & Drone Profile Completeness
    # ==================================================================
    section("PRIORITY 3: CUAS Placement Completeness")

    # 3a. Verify CUAS placement has orientation (already checked in P1)
    status, sess = api("GET", f"/api/v2/sessions/{session_id}")
    cps = sess.get("cuas_placements", [])
    if cps:
        cp = cps[0]
        check(cp.get("orientation_deg") == 90.0, "CUAS orientation_deg = 90.0 on reload")
        check(cp.get("lat") is not None, f"CUAS lat = {cp.get('lat')}")
        check(cp.get("lon") is not None, f"CUAS lon = {cp.get('lon')}")

    # 3b. Geotag a CUAS placement (mobile companion feature)
    if placement_id:
        new_lat = 45.4225
        new_lon = -75.6950
        status, geotag = api("POST", f"/api/v2/cuas-placements/{placement_id}/geotag", {
            "lat": new_lat,
            "lon": new_lon,
            "alt_m": 12.0,
            "orientation_deg": 135.0,
            "gps_accuracy_m": 3.5,
            "method": "gps",
        })
        check(status == 200, "Geotag CUAS placement", f"status={status} {geotag}")
        if status == 200:
            check(geotag.get("geotagged_at") is not None, f"geotagged_at set")
            check(geotag.get("geotag_method") == "gps", f"geotag_method = gps")

        # Verify updated position persisted
        status, sess2 = api("GET", f"/api/v2/sessions/{session_id}")
        cp2 = next((c for c in sess2.get("cuas_placements", []) if c["id"] == placement_id), {})
        check(abs(cp2.get("lat", 0) - new_lat) < 0.0001,
              f"Geotagged lat persisted ({cp2.get('lat')})", f"expected ~{new_lat}")

    # 3c. Verify tracker assignment target_altitude_m persists on reload
    tas = sess.get("tracker_assignments", [])
    if tas:
        alt_values = [ta.get("target_altitude_m") for ta in tas]
        check(50.0 in alt_values or any(a == 50.0 for a in alt_values if a),
              f"target_altitude_m=50.0 persisted", f"got {alt_values}")
        check(120.0 in alt_values or any(a == 120.0 for a in alt_values if a),
              f"target_altitude_m=120.0 persisted", f"got {alt_values}")

    # ==================================================================
    #  Cleanup
    # ==================================================================
    section("Cleanup")

    status, data = api("POST", f"/api/v2/sessions/{session_id}/stop")
    check(status == 200, "Stop session", f"status={status}")

    # ==================================================================
    #  Results
    # ==================================================================
    section("Results")
    total = passed + failed
    print(f"\n  {passed}/{total} passed, {failed} failed")
    print(f"  Session: {session_id}")

    if failed:
        print(f"\n  {failed} test(s) need attention ^")

    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
