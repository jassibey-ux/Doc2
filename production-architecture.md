# SCENSUS UAS Dashboard — Full Platform Architecture

## Overview

SCENSUS is a counter-UAS (CUAS) test & evaluation platform with three deployment modes:

1. **Desktop App** — Electron + Express (port 8082) + Python FastAPI (port 8083) + SQLite
2. **Cloud Platform** — Docker Compose: nginx + FastAPI + PostgreSQL/PostGIS + Redis + arq workers
3. **Bridge Sync** — Desktop CSV → SQLite buffer → HMAC-signed batch upload → cloud PostgreSQL

The React frontend is shared across all modes, built with Vite and served by either Express (desktop) or FastAPI via nginx (cloud).

---

## 1. Desktop App: Installation & Startup

### Packaging

- **macOS**: DMG + ZIP (universal arm64 + x64), hardened runtime + code signing
- **Windows**: NSIS installer (x64), custom signing via `electron/sign.js`
- **Auto-updater**: electron-updater via GitHub Releases
- **Config**: `electron/electron-builder.yml`

### Bootstrap Sequence

`electron/src/main/index.ts`:

```
app.whenReady()
  → bootstrap()
    → startServer(8082)         // Express HTTP + WebSocket
    → spawnPythonBackend(8083)  // FastAPI child process (non-blocking)
    → createWindow(8082)        // Electron window loads http://127.0.0.1:8082
    → setupTray() + setupMenu() + setupIPC() + setupAutoUpdater()
    → startCotListener()        // UDP multicast (if ops_mode + cot_enabled)
```

### Express Server (port 8082)

**Middleware stack** (`electron/src/server/index.ts`):

```
HTTP Request → CORS → JSON parser → Session Bridge → Python Proxy → Express Routes → Static Files
```

**Session Bridge** (`electron/src/server/session-bridge.ts`):
- Intercepts `POST /api/v2/sessions/:id/start` and `/stop`
- Bridges Python-managed session metadata to Express-side live telemetry collection
- On start: activates `SessionDataCollector` recording + CoT actor bridge
- On stop: exports in-memory positions to CSV, merges into Python response

**Python Proxy** (`electron/src/server/proxy.ts`):
- All `/api/v2/*` requests forwarded to `http://127.0.0.1:8083` via fetch
- 60-second timeout, returns 502/504 on failure

### Express Route Groups

| Route File | Endpoints |
|---|---|
| `health.ts` | `/api/health`, `/api/health/backend` |
| `config.ts` | `/api/config`, `/api/config/log-root`, `/api/validate-path` |
| `trackers.ts` | `/api/trackers`, `/api/trackers/:trackerId` |
| `sessions.ts` | `/api/sessions`, `/api/sessions/:name/files`, `/api/sessions/:name/history` |
| `replay.ts` | `/api/replay/sessions`, `/api/replay/load/:id`, `/api/replay/control`, `/api/replay/stop` |
| `exports.ts` | `/api/export/csv`, `/api/export/kml`, `/api/export/session/:id/geojson`, `/api/export/session/:id/czml` |
| `sites.ts` | CRUD `/api/sites`, `/api/sites/:id/duplicate` |
| `drone-profiles.ts` | CRUD `/api/drone-profiles` |
| `cuas-profiles.ts` | CRUD `/api/cuas-profiles` |
| `test-sessions.ts` | CRUD `/api/test-sessions`, `/api/test-sessions/:id/start`, `/api/test-sessions/:id/stop` |
| `reports.ts` | `/api/reports/html`, `/api/reports/text`, `/api/reports/save` |
| `system.ts` | `/api/system/status`, `/api/system/demo-mode`, `/api/system/recording/*` |
| `analysis.ts` | `/api/sessions/:id/range-timeline` |
| `iff.ts` | CRUD `/api/iff/registry` (ops mode) |
| `detections.ts` | `/api/detections`, `/api/detections/:id/classify` |
| `cloud-sync.ts` | `/api/cloud-sync/status`, `/api/cloud-sync/config` |
| `sd-merge.ts` | `/api/sd-merge/upload`, `/api/sd-merge/merge` |
| `static.ts` | `/`, `/app/*` — React SPA serving |

---

## 2. Core Backend Components

### DashboardApp (`electron/src/core/app.ts`)

Orchestrator that wires together all core components:

```
DashboardApp
  ├── StateManager         — In-memory Map<trackerId, TrackerState>, staleness detection
  ├── LogWatcher           — chokidar file watcher, CSV/NMEA/KML parsers
  ├── SessionDataCollector — Records live positions per session, exports CSV
  ├── MockTrackerProvider  — Demo mode synthetic data generation
  ├── ReplayEngine         — Session replay with frame interpolation
  ├── AnomalyDetector      — Position jump and altitude anomaly detection
  └── GPSHealthTracker     — GPS fix quality monitoring, denial detection
```

### StateManager (`electron/src/core/state.ts`)

- In-memory `Map<trackerId, TrackerState>` — current position, RSSI, battery, satellites, GPS quality
- **Update flow**: `LogWatcher` or `MockTrackerProvider` → `StateManager.updateTracker()` → callback → WebSocket broadcast
- **Staleness**: Polls every 5 seconds, emits `tracker_stale` events when age > `stale_seconds` (default 30)
- **GPS Health**: Tracks fix loss/recovery events, availability percentage

### SessionDataCollector (`electron/src/core/session-data-collector.ts`)

- Records all tracker positions during active sessions into `Map<sessionId, SessionRecording>`
- **Crash protection**: Snapshots to JSONL every 60 seconds
- **Export**: One CSV per tracker (`tracker_{id}.csv`) + `events.csv` + `session.json`
- **Filtering**: Only records positions for assigned tracker IDs

### CoT Listener (`electron/src/core/cot-listener.ts`)

- UDP multicast on `239.2.3.1:6969` (configurable)
- Parses Cursor-on-Target XML messages
- Events feed into `DeconflictionEngine` (proximity detection) and `CotActorBridge` (operator position tracking)
- Only active when `config.ops_mode && config.cot_enabled`

### MockTrackerProvider (`electron/src/core/mock-tracker-provider.ts`)

- Movement patterns: linear, circular, waypoints, random, hover, extendedWaypoints
- GPS health cycling: 60-second cycle (healthy → degrading → lost → recovering)
- GPS denial zones: spatial degradation near zone centers with position drift
- Battery simulation: depletion over time
- Default demo trackers: DEMO-001 (circular), DEMO-002 (waypoints), DEMO-003 (hover), DEMO-LOW-BAT

### Library Store (`electron/src/core/library-store.ts`)

- Persists to `${app.getPath('userData')}/libraries/*.json`
- Files: `sites.json`, `drone-profiles.json`, `cuas-profiles.json`, `test-sessions.json`, `tracker-aliases.json`
- Atomic writes (temp file + rename)
- Seeds demo data on first run

### WebSocket (`/ws`)

Broadcasts real-time events to all connected clients:

| Event | Trigger |
|---|---|
| `tracker_updated` | Position/state change |
| `tracker_stale` | No update after stale_seconds |
| `anomaly_alert` | Position jump, altitude anomaly |
| `gps_health_alert` | GPS fix lost/recovered |
| `active_event_changed` | Log root or replay changed |
| `replay_build_progress` / `replay_frames_ready` / `replay_frames_error` | Replay engine |
| `burst_opened` / `burst_closed` | Engagement jam events |
| `cuas_geotagged` / `sdr_captured` | Mobile companion |

---

## 3. Python Backend (FastAPI)

### Entry & ASGI

- **File**: `logtail_dashboard/api.py` — FastAPI app via `create_app()`
- **Port**: 8083 (spawned by Electron as child process, or standalone in Docker)
- **ASGI**: Uvicorn with 2 workers in cloud mode

### Database

- **Desktop**: SQLite via `aiosqlite` — stored at `~/.scensus/scensus_crm.db`
- **Cloud**: PostgreSQL 16 + PostGIS via `asyncpg`
- **ORM**: SQLAlchemy 2.0+ async
- **Migrations**: Alembic with 7 versions in `cloud/alembic/versions/`

### Key Tables (`logtail_dashboard/database/models.py`)

| Table | Purpose |
|---|---|
| `test_sessions` | Main CRM entity — session metadata, metrics, status |
| `tracker_telemetry` | Time-series GPS data per session |
| `tracker_assignments` | Drone ↔ Session link with color |
| `cuas_placements` | CUAS positions per session |
| `engagements` | Engagement records with metrics |
| `engagement_jam_bursts` | Jam burst start/end times |
| `drone_profiles` | UAS specifications |
| `cuas_profiles` | CUAS system specifications |
| `sites` | Test locations with boundary polygons |
| `session_actors` | CoT participants (operators, vehicles) |
| `users` | RBAC users with organization_id |

### API v2 Routes (`logtail_dashboard/api_v2.py` — 4567 lines)

**Endpoint groups under `/api/v2`:**

| Group | Key Endpoints |
|---|---|
| **Auth** | `/auth/login`, `/auth/me`, CRUD `/auth/users` |
| **Sessions** | CRUD, `/sessions/search`, `/:id/start`, `/:id/stop`, `/:id/telemetry`, `/:id/metrics` |
| **Engagements** | CRUD, `/:id/engage`, `/:id/disengage`, `/:id/abort`, `/:id/jam-on`, `/:id/jam-off` |
| **Telemetry** | `POST /telemetry/ingest` — bulk ingest from bridge/electron |
| **Actors** | `POST /sessions/:id/actors`, `GET /sessions/:id/actors` |
| **Tags/Annotations** | Per-session tagging and annotation system |
| **Dashboard** | `GET /dashboard` — aggregate CRM stats |
| **Health** | `GET /health` |

### Authentication

**Dual auth system:**

1. **HMAC-SHA256** (machine-to-machine): Used by bridge service and Electron. Header-based signing with 5-minute timestamp validation.
2. **JWT** (human users): Bearer token, HS256, 24-hour expiry. Login via email + bcrypt password.

**RBAC roles**: `observer (0) < analyst (1) < operator (2) < admin (3)`

**Desktop mode**: Auth disabled — Electron communicates directly via localhost.

---

## 4. Data Flow: Desktop → Listener → Cloud → Web

### Live Tracking (Desktop)

```
UDP 239.2.3.1:6969            CSV/NMEA files in log_root_folder
      │                                │
      ▼                                ▼
  CotListener                      LogWatcher (chokidar)
      │                                │
      ▼                                ▼
  parseCotXml()               CSVParser / NMEAParser
      │                                │
      └──────────┬─────────────────────┘
                 ▼
          StateManager.updateTracker(record)
                 │
                 ├──→ SessionDataCollector.recordPosition() (if recording)
                 ├──→ AnomalyDetector.check()
                 └──→ WebSocket broadcast: tracker_updated
                            │
                            ▼
                    React frontend (Map.tsx re-renders)
```

### Session Recording Lifecycle

```
User clicks "Start Session"
  → POST /api/v2/sessions/:id/start
  → Session Bridge intercepts:
      1. Forward to Python (creates DB record)
      2. SessionDataCollector.startSession(id, trackerIds)
      3. Create CSV export directory
      4. Activate CoT actor bridge

[Live tracking updates flow into SessionDataCollector]
[Snapshots to JSONL every 60 seconds]

User clicks "Stop Recording"
  → POST /api/v2/sessions/:id/stop
  → Session Bridge intercepts:
      1. SessionDataCollector.exportToCSV(id, path)
         → tracker_{id}.csv + events.csv + session.json
      2. Forward stop to Python (updates DB, computes metrics)
      3. Merge export summary into response
```

### Bridge Sync (Desktop → Cloud)

```
Desktop CSV files
      │
      ▼
  bridge/watcher.py (detects new CSVs)
      │
      ▼
  bridge/parser.py (normalizes records)
      │
      ▼
  bridge/buffer.py (SQLite store-and-forward queue)
      │ (dequeue batch of 100 every 5 seconds)
      ▼
  bridge/uploader.py
      │ HMAC-SHA256 signed POST
      │ Headers: X-HMAC-Signature, X-HMAC-Timestamp
      ▼
  POST /api/v2/telemetry/ingest (cloud FastAPI)
      │
      ▼
  PostgreSQL + WebSocket broadcast
      │
      ▼
  Cloud React dashboard (real-time updates)
```

**Retry strategy**: Exponential backoff (1s × 2^failures, capped at 60s). Failed batches nacked back to buffer.

---

## 5. Cloud Deployment

### Docker Compose Stack (`cloud/docker-compose.yml`)

| Service | Image | Role | Port |
|---|---|---|---|
| **nginx** | nginx:1.25-alpine | Reverse proxy, TLS, rate limiting | 80, 443 |
| **api** | python:3.11-slim (custom) | FastAPI backend | 8083 (internal) |
| **postgres** | postgis/postgis:16-3.4 | Database + spatial | 5432 (internal) |
| **worker** | python:3.11-slim | arq background jobs | — |
| **redis** | redis:7-alpine | Cache + job queue | 6379 (internal) |

### nginx Configuration (`cloud/nginx.conf`)

- HTTP → HTTPS redirect
- TLS 1.2/1.3 with modern ciphers
- Rate limiting: telemetry 60/s, auth 5/s, general 30/s
- WebSocket upgrade handling for `/ws`
- Serves React SPA at `/app/*`

### Background Workers (arq)

- `compute_engagement_metrics_job` — post-engagement metric computation
- `detect_gps_denial_job` — GPS outage detection in telemetry
- `recompute_sd_card_job` — re-analysis from SD card data
- Max 10 concurrent, 5-minute timeout per job

---

## 6. React Frontend

### Provider Hierarchy (`frontend/src/App.tsx`)

```
ToastProvider
  → AuthProvider
    → BrowserRouter (basename="/app")
      → AuthGate (LoginPage if cloud + unauthenticated)
        → WebSocketProvider
          → WorkflowProvider
            → SessionProvider
              → TestSessionPhaseProvider
                → CRMProvider
                  → Routes
```

### Routes

| Path | Component | Purpose |
|---|---|---|
| `/` | MapView | Main dashboard with map + panels |
| `/monitor` | MonitoringConsole | Real-time monitoring |
| `/session/:id/live` | SessionConsole | Active recording console |
| `/session/:id/analysis` | SessionAnalysisView | Post-session analysis |
| `/replay` | ReplayPage | Session browser |
| `/replay/:id` | ReplayPage | Session replay with timeline |
| `/crm` | CRMDashboard | Search, tags, annotations |

### Context Providers

| Provider | File | Purpose |
|---|---|---|
| **WebSocketContext** | `contexts/WebSocketContext.tsx` | Real-time tracker positions, alerts, replay events. Maintains `drones` Map + `droneHistory` Map (10k points/tracker). |
| **WorkflowContext** | `contexts/WorkflowContext.tsx` | CRUD for Sites, DroneProfiles, CUASProfiles, TestSessions. Session start/stop. Site recon captures. |
| **TestSessionPhaseContext** | `contexts/TestSessionPhaseContext.tsx` | Session lifecycle phases (idle→planning→active→capturing→completed). Engagement controls, jam burst controls, session actors. |
| **SessionContext** | `contexts/SessionContext.tsx` | Legacy file-based session browser (pre-v2 API). |
| **AuthContext** | `contexts/AuthContext.tsx` | JWT auth for cloud mode. Role-based access. Local mode: always authenticated. |
| **CRMContext** | `contexts/CRMContext.tsx` | Dashboard stats, session search, tags, annotations. |
| **ToastContext** | `contexts/ToastContext.tsx` | Global notification toasts. |

### Map Stack

Three coexisting map views:

1. **MapLibre GL 2D/3D** (`components/Map.tsx`) — Primary map. Satellite/dark/street styles via MapTiler. Optional 3D terrain. Drone tracks color-coded by GPS quality. CUAS coverage heatmap. Engagement geometries. Drawing tools for site boundaries.

2. **CesiumJS Globe** (`components/CesiumMap.tsx`) — Full 3D globe. Google Photorealistic 3D Tiles (if API key set). Drone ellipsoids. CUAS cylinders. Engagement lines. Toggled via "Globe" button.

3. **Site3DViewer** (`components/Site3DViewer.tsx`) — Cesium-based site preview for wizard/recon. Interactive CUAS placement. Google 3D or OSM fallback. Screenshot capture for site recon.

### Build Configuration (`frontend/vite.config.ts`)

- Dev server: port 5173 with proxy to localhost:8082
- Build output: `../electron/out/renderer/` (bundled into Electron)
- Plugins: `@vitejs/plugin-react` + `vite-plugin-cesium`
- Cloud mode: Set `VITE_API_URL` at build time for remote API

### Key Environment Variables

| Variable | Purpose |
|---|---|
| `VITE_MAPTILER_KEY` | MapTiler tiles (3D terrain, buildings) |
| `VITE_CESIUM_TOKEN` | CesiumJS Ion access (optional) |
| `VITE_GOOGLE_MAPS_KEY` | Google Photorealistic 3D Tiles (optional) |
| `VITE_API_URL` | Cloud API URL (enables cloud mode if set) |

---

## 7. Key Shared Utilities

| File | Purpose |
|---|---|
| `frontend/src/utils/geo.ts` | haversine, bearing, midpoint — no turf.js |
| `frontend/src/utils/cuasCoverage.ts` | CUAS heatmap/marker/heading GeoJSON generation |
| `frontend/src/utils/trackSegmentation.ts` | Quality-colored track segments |
| `frontend/src/utils/engagementGeometry.ts` | Engagement arcs, impact cones as GeoJSON |
| `frontend/src/utils/modelRegistry.ts` + `modelLoader.ts` | 3D model metadata and caching |

---

## 8. Gaps & Incomplete Features

### Not Yet Functional

1. **Mobile Companion App** — Scaffolded in `/mobile/` (React Native), CoT actor bridge code exists (`cot-actor-bridge.ts`), but app not built or integrated with bridge sync.

2. **arq Worker Triggers** — Job definitions exist (`workers/jobs.py`) but no scheduler or trigger mechanism wired in `api_v2.py`. Workers run but are never enqueued.

3. **PostGIS Spatial Queries** — Migration 007 adds geometry columns but no endpoints use spatial queries (`ST_Within`, `ST_DWithin`).

4. **Multi-Tenant Isolation** — `organization_id` fields exist in user and session models but queries don't filter by org. Cloud mode would share data across tenants.

5. **Audit Logging** — `AuditRepository` exists in database layer but no audit endpoints or event capture in API routes.

### Partially Implemented

6. **OAuth/SSO** — Auth context has JWT flow but no OAuth provider integration (Google, Azure AD). Login is email+password only.

7. **SDR Integration** — `sdr_readings` references exist in session bridge (broadcasts `sdr_captured`) but no database table, no ingest endpoint, no UI.

8. **Media Attachments** — Schema has attachment references but no upload/download endpoints or UI.

9. **Offline Queue Sync** — Bridge has store-and-forward buffer but no desktop offline mode (bridge doesn't run in Electron, only standalone).

10. **3D Model Rendering** — `drone_profiles.model_3d` and `cuas_profiles.model_3d` fields exist. Model registry and loader code works for cached GLB files. But model files are not bundled — CesiumMap renders ellipsoids/cylinders as fallback.

### Desktop vs Cloud Feature Gaps

| Feature | Desktop | Cloud |
|---|---|---|
| Live CoT tracking | Yes (UDP listener) | No (no UDP in cloud) |
| Session recording | Yes (SessionDataCollector) | Via telemetry ingest only |
| File-based replay | Yes (LogWatcher + CSV) | No |
| RBAC/Multi-user | No (single user) | Yes (JWT + roles) |
| Background workers | No (inline compute) | Yes (arq + Redis) |
| TLS/rate limiting | No (localhost) | Yes (nginx) |
| Site recon screenshots | Yes (3D viewer capture) | No (no Cesium in cloud) |
| SD card merge | Yes (local file access) | No |

---

## 9. File Structure Summary

```
/Users/scensus/
├── electron/                          # Desktop Electron app
│   ├── src/main/index.ts             # Entry point, bootstrap
│   ├── src/server/                    # Express backend (port 8082)
│   │   ├── index.ts                  # Server setup, middleware, routes
│   │   ├── session-bridge.ts         # Session start/stop bridge
│   │   ├── proxy.ts                  # Python backend proxy
│   │   ├── websocket.ts              # WebSocket /ws endpoint
│   │   └── routes/                   # 20+ route files
│   ├── src/core/                      # Business logic
│   │   ├── app.ts                    # DashboardApp orchestrator
│   │   ├── state.ts                  # StateManager (tracker state)
│   │   ├── session-data-collector.ts # Live recording + CSV export
│   │   ├── cot-listener.ts          # UDP CoT XML listener
│   │   ├── mock-tracker-provider.ts  # Demo mode simulation
│   │   ├── watcher.ts               # LogWatcher (file system)
│   │   ├── library-store.ts         # JSON persistence
│   │   ├── czml-generator.ts        # CZML 3D replay export
│   │   └── config.ts                # Configuration
│   ├── electron-builder.yml          # Packaging config
│   └── package.json
│
├── frontend/                          # React + TypeScript frontend
│   ├── src/main.tsx                  # Entry point
│   ├── src/App.tsx                   # Provider hierarchy + routes
│   ├── src/contexts/                 # 7 context providers
│   ├── src/components/               # 40+ components
│   │   ├── Map.tsx                   # MapLibre GL 2D/3D
│   │   ├── CesiumMap.tsx            # CesiumJS 3D globe
│   │   ├── MapView.tsx              # Main layout (map + panels)
│   │   ├── SessionConsole.tsx       # Live session recording
│   │   ├── EngagementPanel.tsx      # Engagement lifecycle
│   │   ├── SessionSetupWizard/      # 4-step session wizard
│   │   └── ...
│   ├── src/utils/                    # geo, coverage, segmentation
│   ├── src/types/                    # TypeScript interfaces
│   └── vite.config.ts               # Build config
│
├── logtail_dashboard/                 # Python FastAPI backend
│   ├── api.py                        # v1 routes + DashboardApp
│   ├── api_v2.py                     # v2 CRM endpoints (4567 lines)
│   ├── database/
│   │   ├── models.py                # SQLAlchemy ORM (20+ tables)
│   │   ├── connection.py            # DB manager
│   │   └── repositories/            # Data access layer
│   ├── middleware/
│   │   ├── auth.py                  # HMAC auth
│   │   └── jwt_auth.py             # JWT + RBAC
│   └── workers/                      # arq background jobs
│
├── bridge/                            # Desktop → cloud sync
│   ├── service.py                    # Orchestrator
│   ├── uploader.py                   # HMAC-signed batch push
│   ├── buffer.py                     # SQLite store-and-forward
│   └── watcher.py                    # CSV file monitor
│
├── cloud/                             # Cloud deployment
│   ├── docker-compose.yml            # 5-container stack
│   ├── Dockerfile                    # Python app image
│   ├── nginx.conf                    # Reverse proxy + TLS
│   └── alembic/                      # 7 DB migrations
│
└── mobile/                            # React Native companion (scaffold)
```

---

## 10. Verification

To verify this architecture understanding:

1. **Desktop startup**: `cd electron && npm run dev` — Express on 8082, Python on 8083, Electron window opens
2. **Demo mode**: System Settings → Enable Demo Mode → mock trackers appear on map
3. **Session lifecycle**: Create site → wizard → start session → engage → stop → replay
4. **WebSocket**: Open browser devtools → Network → WS → observe `tracker_updated` messages
5. **Bridge sync**: Configure cloud URL in bridge/config.py → `python -m bridge.service` → watch telemetry ingest
6. **Cloud deploy**: `cd cloud && docker compose up` → nginx on 443, API on 8083, PostgreSQL on 5432
7. **API docs**: Navigate to `http://localhost:8083/docs` — FastAPI auto-generated OpenAPI spec
