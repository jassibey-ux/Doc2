# SCENSUS Dashboard

A lightweight, locally-hosted dashboard for monitoring UAS telemetry from legacy split CSV logs. Features real-time updates and no external runtime dependencies.

## Features

- **File Monitoring**: Watches CSV log files written by legacy UAS receiver applications
- **Real-time Updates**: WebSocket-based live dashboard with automatic UAS status updates
- **Multi-UAS Support**: Handles split CSV logs (one file per UAS/tracker)
- **Robust Parsing**: Handles varying CSV formats with intelligent field detection
- **Event Management**: Switch between different flight event folders without restart
- **Stale Detection**: Automatic detection of UAS that stop reporting
- **Web Dashboard**: Clean, responsive UI with live telemetry table
- **Optional Mapping**: Leaflet-based map view (configurable)
- **No Dependencies**: Single EXE deployment, no admin rights required

## Operator Instructions

### 1. Prerequisites
- **Log Source**: Ensure the legacy UAS receiver app is running and writing logs.
- **Path**: Locate the root folder where the legacy app creates event subfolders (e.g., `C:\Logs\UAS_Receiver`).

### 2. Starting the Dashboard
You can run the dashboard from source or using the provided EXE.

**From EXE:**
Open Command Prompt (Win+R → cmd) and run:
```powershell
scensus-dashboard.exe --log-root "C:\Logs\UAS_Receiver"
```

**From Source:**
```bash
python -m logtail_dashboard --log-root "C:\Logs\UAS_Receiver"
```

### 3. Usage
1. Open a browser to `http://localhost:8080`.
2. **Select Event**: Use the dropdown in the top bar to select the active event folder (e.g., `FlightTest_2024_10_25`).
3. **Monitor**: The table updates automatically as new lines are written to CSVs in that folder.
   - **Green**: Healthy (Recent update + Valid GPS Fix)
   - **Yellow**: No GPS Fix
   - **Red**: Stale (No update for >60s)

### 4. Network Access (LAN)
To view the dashboard from another computer/tablet on the same WiFi:
1. Run with host `0.0.0.0`:
   ```bash
   scensus-dashboard.exe --log-root "C:\Logs\UAS_Receiver" --host 0.0.0.0
   ```
2. Find your IP address (`ipconfig` on Windows).
3. On the tablet, navigate to `http://YOUR_LAPTOP_IP:8080`.

*Note: You may need to allow the application through the Windows Firewall.*

### 5. Troubleshooting
- **Empty Dashboard**: Ensure you selected an event in the dropdown. If the dropdown is empty, check your `--log-root` path.
- **Stale Data**: If UAS turn red, the legacy app may have stopped writing, or the file path changed (log rotation). The dashboard handles standard rotation, but file permission locks by the legacy app can sometimes delay reads.
- **Port Already in Use**: Change the port with `--port 8081`

---

## Developer / Build Instructions

### Environment Setup
Requires Python 3.10+.
```bash
pip install -r requirements.txt
```

### Running Tests
To validate the file tailing and CSV parsing logic:
```bash
pip install pytest
pytest tests/
```

### Building the Single-File EXE
We use PyInstaller to bundle the Python backend and the HTML/JS frontend into a single executable.

1. Install PyInstaller:
   ```bash
   pip install pyinstaller
   ```
2. Build using the provided spec file:
   ```bash
   pyinstaller logtail_dashboard.spec
   ```
3. The executable will be created in `dist/scensus-dashboard.exe` (rename from `logtail_dashboard.exe` after build).

### Configuration
You can override defaults via CLI arguments:
- `--log-root PATH`: Root directory containing flight event subfolders
- `--event "MyEvent"`: Pre-select an event on startup
- `--port 8080`: Change web port (default: 8080)
- `--host "0.0.0.0"`: Bind to all interfaces for LAN access (default: localhost only)
- `--stale-seconds 60`: Change time before a UAS is marked red (default: 60)

**Example:**
```bash
scensus-dashboard.exe --log-root "C:\Logs\UAS_Receiver" --port 8000 --stale-seconds 30
```

---

## CSV Log File Format

The dashboard expects CSV files with headers. Column detection is flexible and handles various legacy formats.

**Required columns** (detected by name matching):
- **UAS ID**: `tracker_id`, `id`, `uas_id`, `device_id`, `unit_id`
- **Time**: `time`, `timestamp`, `datetime`, `time_local`, `received_time`

**Optional telemetry columns**:
- **GPS Position**: `lat`, `lon`, `alt` (latitude, longitude, altitude)
- **GPS Quality**: `fix_valid`, `hdop` (GPS fix status, horizontal dilution of precision)
- **Motion**: `speed`, `course` (ground speed, heading)
- **Signal**: `rssi` (received signal strength)
- **Barometric**: `baro_alt`, `baro_temp`, `baro_press` (pressure altitude, temperature, pressure)

**Example CSV from legacy receiver**:
```csv
tracker_id,time,lat,lon,alt,speed,course,hdop,rssi,fix_valid
101,2024-01-15T14:30:00,34.0522,-118.2437,125.5,2.3,45.0,1.2,-85,true
101,2024-01-15T14:30:30,34.0523,-118.2436,126.0,2.5,46.0,1.1,-84,true
```

The dashboard automatically detects column names and handles multiple datetime formats.

### File Watching Behavior

- **Tail Mode**: Only reads new lines appended since last read
- **Offset Tracking**: Maintains byte offset per file to avoid re-reading
- **Partial Line Handling**: Ignores incomplete last line until next read
- **Log Rotation**: Detects file truncation and resets to beginning
- **New Files**: Automatically picks up new CSV files in the active event folder

---

## Dashboard Interface

### UAS Telemetry Table

The main view shows all active UAS with real-time updates:

- **ID**: UAS identifier
- **Lat/Lon**: Last known GPS position
- **Alt (m)**: Altitude in meters
- **RSSI (dBm)**: Signal strength
- **Fix**: GPS fix status (✓ = valid, ✗ = invalid)
- **Age**: Time since last telemetry update
- **Last Update**: Timestamp of last received data

**Color Coding**:
- 🟢 **Green**: Active UAS with valid GPS fix
- 🟡 **Yellow**: Active UAS without GPS fix
- 🔴 **Red**: Stale UAS (no updates for > stale_seconds)

### Event Selection

Use the dropdown in the top bar to switch between flight events. The dashboard will automatically:
1. Stop monitoring the current event
2. Load all CSV files from the new event folder
3. Resume real-time monitoring

### Status Console

Shows backend messages and activity:
- Event switching notifications
- File watch events
- Error messages
- WebSocket connection status

### Map View (Optional)

When enabled (`enable_map: true` in config):
- Shows UAS positions on an interactive map
- Color-coded markers match table status
- Click markers for UAS details
- Auto-updates as new positions arrive

---

## Technical Architecture

### Component Overview

```
logtail_dashboard/
├── __main__.py           # Entry point & logging
├── config.py             # Configuration (JSON + CLI)
├── models.py             # Pydantic data models
├── parser.py             # Flexible CSV parser
├── watcher.py            # File monitoring (offset tracking)
├── state.py              # UAS state management
├── api.py                # FastAPI routes + WebSocket
└── static/
    └── index.html        # Web dashboard (vanilla JS)
```

### Data Flow

1. **File Watcher** monitors active event folder using watchfiles (Rust-based)
2. **Tailer** reads only new lines since last read (byte offset tracking)
3. **Parser** extracts and normalizes UAS telemetry records
4. **State Manager** updates UAS state and detects staleness (background task)
5. **WebSocket** pushes real-time updates to connected clients
6. **Dashboard** renders live telemetry data

### Technology Stack
- **Backend**: FastAPI + Uvicorn (async Python)
- **File Watching**: watchfiles (efficient Rust-based monitoring)
- **Data Validation**: Pydantic (type-safe models)
- **Frontend**: Vanilla JavaScript (no build tools)
- **Real-time**: WebSocket bidirectional communication
- **Packaging**: PyInstaller (single EXE)

---

## Advanced Topics

### Running as Windows Service

To run SCENSUS Dashboard automatically on boot:

**Option 1: Using NSSM (Non-Sucking Service Manager)**
```bash
nssm install SCENSUSDashboard "C:\Path\To\scensus-dashboard.exe"
nssm set SCENSUSDashboard AppParameters "--log-root C:\Logs\UAS_Receiver"
nssm start SCENSUSDashboard
```

**Option 2: Using Task Scheduler**
1. Open Task Scheduler
2. Create Basic Task → Name: "SCENSUS Dashboard"
3. Trigger: At startup
4. Action: Start program → Browse to `scensus-dashboard.exe`
5. Add arguments: `--log-root "C:\Logs\UAS_Receiver"`

### Performance Tuning

**For high-frequency updates (>1 Hz per UAS):**
- Increase stale threshold: `--stale-seconds 120`
- Archive old events to reduce file count

**For low-bandwidth/tablet viewing:**
- Disable map: Set `enable_map: false` in config.json
- Use localhost-only mode (default)

### Extending the Dashboard

**Adding new CSV fields:**
1. Add field to `TrackerRecord` in `models.py`
2. Add column name variants to `FIELD_MAPPINGS` in `parser.py`
3. Update table columns in `static/index.html`

**Custom staleness logic:**
Modify `_check_staleness()` in `state.py` to implement custom timeout rules per UAS ID.

---

## License & Support

**License**: MIT License - See [LICENSE](LICENSE) file

**Support**: For issues or questions, contact your system administrator or the development team.

**Documentation**:
- [QUICKSTART.md](QUICKSTART.md) - 5-minute setup guide
- [INSTALL_WINDOWS.md](INSTALL_WINDOWS.md) - Detailed Windows installation
- [STRUCTURE.md](STRUCTURE.md) - Architecture deep-dive

---

**SCENSUS Dashboard** - Lightweight UAS telemetry monitoring for legacy systems.
