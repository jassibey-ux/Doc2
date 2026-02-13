# Repository Structure

Complete overview of the LogTail Dashboard codebase.

## Directory Layout

```
logtail-dashboard/
├── logtail_dashboard/          # Main application package
│   ├── __init__.py            # Package initialization
│   ├── __main__.py            # Entry point (python -m logtail_dashboard)
│   ├── config.py              # Configuration management
│   ├── models.py              # Pydantic data models
│   ├── parser.py              # CSV parsing logic
│   ├── watcher.py             # File watching and tailing
│   ├── state.py               # Tracker state management
│   ├── api.py                 # FastAPI routes and WebSocket
│   └── static/                # Static web assets
│       └── index.html         # Dashboard UI
│
├── tests/                      # Unit tests
│   ├── __init__.py
│   ├── test_parser.py         # Parser tests
│   └── test_state.py          # State manager tests
│
├── examples/                   # Example data for testing
│   └── event_2024_01/         # Example event folder
│       ├── tracker_101.csv
│       ├── tracker_102.csv
│       └── tracker_103.csv
│
├── config.json                 # Default configuration
├── requirements.txt            # Production dependencies
├── requirements-dev.txt        # Development dependencies
├── logtail_dashboard.spec     # PyInstaller build spec
├── pytest.ini                  # Pytest configuration
├── .gitignore                  # Git ignore patterns
├── LICENSE                     # MIT License
├── README.md                   # Main documentation
├── INSTALL_WINDOWS.md         # Windows installation guide
├── STRUCTURE.md               # This file
└── run_example.bat            # Quick start script (Windows)
```

## Module Responsibilities

### logtail_dashboard/__main__.py

**Purpose**: Application entry point

**Key Functions**:
- `main()`: Initialize and start the application
- Configure logging
- Load configuration
- Create and run FastAPI/Uvicorn server

**Dependencies**: config, api

---

### logtail_dashboard/config.py

**Purpose**: Configuration management

**Key Classes**:
- `Config`: Pydantic model for application settings

**Key Functions**:
- `load_config()`: Load from config.json
- `parse_args()`: Parse command-line arguments
- `merge_config()`: Merge file config with CLI args
- `get_config()`: Main entry point for configuration

**Validation**:
- Port range (1-65535)
- Non-empty log root folder
- Valid bind host

---

### logtail_dashboard/models.py

**Purpose**: Data models and API contracts

**Key Models**:
- `TrackerRecord`: Normalized tracker data from CSV
- `TrackerState`: Current state of a tracker
- `TrackerSummary`: Summary for API responses
- `HealthResponse`: Health check response
- `EventListResponse`: Available events
- `ActiveEventRequest/Response`: Event switching
- `WebSocketMessage`: WebSocket message format

**Features**:
- Full type safety with Pydantic
- JSON serialization with custom encoders
- Field validation

---

### logtail_dashboard/parser.py

**Purpose**: CSV parsing with flexible field detection

**Key Classes**:
- `CSVParser`: Main parser class

**Key Constants**:
- `FIELD_MAPPINGS`: Maps normalized names to CSV column variants

**Key Methods**:
- `parse_csv_content()`: Parse CSV string to TrackerRecords
- `_build_field_indices()`: Detect columns from headers
- `_parse_row()`: Parse single CSV row
- `_parse_float()`, `_parse_bool()`, `_parse_datetime()`: Type parsers

**Features**:
- Case-insensitive header matching
- Multiple column name variants (e.g., "lat", "latitude")
- Multiple datetime format support
- Robust error handling (invalid values → None)
- Whitespace trimming

---

### logtail_dashboard/watcher.py

**Purpose**: File monitoring and efficient tailing

**Key Classes**:
- `FileOffsetTracker`: Track read positions per file
- `LogTailer`: Tail files and parse new content
- `LogWatcher`: Watch directory for changes

**Key Features**:
- **Offset tracking**: Only read new content since last read
- **Partial write handling**: Ignore incomplete last line
- **Log rotation detection**: Reset offset if file shrinks
- **Initial scan**: Load all existing files on startup
- **Real-time monitoring**: React to file changes via watchfiles

**Methods**:
- `tail_file()`: Read new content from file
- `_initial_scan()`: Process existing files
- `_watch_loop()`: Monitor for changes
- `_handle_change()`: Process file change events

---

### logtail_dashboard/state.py

**Purpose**: Tracker state management and staleness detection

**Key Classes**:
- `StateManager`: Manage all tracker states

**Key Features**:
- **State tracking**: Maintain latest state per tracker
- **Staleness detection**: Periodic check for inactive trackers
- **Position updates**: Only update position when GPS fix is valid
- **Independent updates**: RSSI/baro data updates regardless of fix
- **Callbacks**: Notify on updates and staleness

**Methods**:
- `update_tracker()`: Update state from new record
- `get_tracker()`: Get specific tracker state
- `get_all_trackers()`: Get all states
- `get_tracker_summaries()`: Get API-ready summaries
- `clear_all()`: Reset all states
- `_stale_check_loop()`: Background staleness checker

---

### logtail_dashboard/api.py

**Purpose**: HTTP API and WebSocket server

**Key Classes**:
- `DashboardApp`: Main application controller

**API Endpoints**:
- `GET /api/health`: Health check
- `GET /api/events`: List available event folders
- `POST /api/active_event`: Set active event
- `GET /api/trackers`: List all trackers
- `GET /api/trackers/{id}`: Get tracker detail
- `WS /ws`: WebSocket for real-time updates
- `GET /`: Serve dashboard HTML

**WebSocket Messages**:
- `tracker_updated`: New/updated tracker data
- `tracker_stale`: Tracker became stale
- `active_event_changed`: Event folder changed
- `backend_status`: Status messages

**Lifecycle**:
- `startup()`: Start state manager and file watcher
- `shutdown()`: Clean shutdown of resources

---

### logtail_dashboard/static/index.html

**Purpose**: Web dashboard UI

**Architecture**:
- Single-page application
- Vanilla JavaScript (no build tools)
- Real-time updates via WebSocket
- Optional Leaflet map (loaded dynamically)

**Components**:
- **Event selector**: Dropdown to switch events
- **Connection status**: WebSocket connection indicator
- **Statistics**: Tracker counts (total, healthy, stale)
- **Tracker table**: Live data with color coding
- **Map panel**: Interactive map with markers (optional)
- **Status console**: Backend message log

**Features**:
- Color-coded rows (green=healthy, yellow=no-fix, red=stale)
- Auto-updating table
- Real-time position markers on map
- Scrolling status console
- Responsive design

---

## Data Flow

```
1. Legacy App writes CSV files
            ↓
2. LogWatcher detects file change (watchfiles)
            ↓
3. LogTailer reads new lines (offset tracking)
            ↓
4. CSVParser normalizes to TrackerRecord
            ↓
5. StateManager updates tracker state
            ↓
6. Callbacks trigger WebSocket broadcast
            ↓
7. Dashboard UI updates in real-time
```

## Configuration Flow

```
1. config.json file (default values)
            ↓
2. Command-line arguments (overrides)
            ↓
3. Config object (validated)
            ↓
4. Used by DashboardApp
```

## State Management

```
TrackerRecord (parsed from CSV)
            ↓
StateManager.update_tracker()
            ↓
TrackerState (internal state)
            ↓
Callbacks (on_tracker_updated, on_tracker_stale)
            ↓
WebSocket broadcast
            ↓
TrackerSummary (API response)
            ↓
Dashboard UI
```

## Build Process (PyInstaller)

```
1. PyInstaller reads logtail_dashboard.spec
            ↓
2. Analyzes dependencies
            ↓
3. Collects:
   - Python runtime
   - All packages (FastAPI, uvicorn, etc.)
   - Static files (index.html)
   - Hidden imports
            ↓
4. Bundles into single EXE
            ↓
5. Output: dist/logtail_dashboard.exe
```

## Testing Strategy

### Unit Tests

**test_parser.py**:
- CSV format variations
- Column name variants
- Datetime format parsing
- Boolean representations
- Invalid data handling
- Edge cases (empty files, missing columns)

**test_state.py**:
- Tracker creation/update
- GPS fix validation logic
- RSSI/baro independence from fix
- Staleness detection
- Callbacks
- Multi-tracker management

### Integration Testing

Run with example data:
```bash
python -m logtail_dashboard --log-root "examples" --event "event_2024_01"
```

## Extension Points

### Adding New CSV Fields

1. Add field to `TrackerRecord` in models.py
2. Add column variants to `FIELD_MAPPINGS` in parser.py
3. Add parsing logic in `_parse_row()`
4. Update dashboard table in index.html

### Adding New API Endpoints

1. Add route decorator in api.py
2. Create Pydantic response model in models.py
3. Implement handler logic
4. Add to README.md

### Adding Map Providers

1. Update index.html
2. Replace Leaflet tile layer URL
3. Consider offline tile caching

### Custom Staleness Logic

1. Modify `_check_staleness()` in state.py
2. Add configuration options to Config
3. Update documentation

## Performance Characteristics

### File Tailing
- **O(1) per file**: Only reads new bytes
- **Memory**: Stores offset per file (~8 bytes)
- **CPU**: Minimal - only triggered by file changes

### State Management
- **O(1) tracker lookup**: Dict-based storage
- **O(n) staleness check**: Scans all trackers every 5 seconds
- **Memory**: One TrackerState object per tracker (~500 bytes)

### WebSocket Broadcasting
- **O(n) per message**: Sends to all connected clients
- **Async**: Non-blocking send to each client
- **Auto-cleanup**: Removes disconnected clients

### CSV Parsing
- **O(n) rows**: Linear scan of new content
- **Memory**: Parses in streaming fashion
- **Validation**: Field-level error handling

## Security Considerations

### Network Exposure
- Default bind: 127.0.0.1 (localhost only)
- LAN option: 0.0.0.0 (all interfaces)
- No authentication built-in (add reverse proxy if needed)

### File Access
- Reads only from configured log_root_folder
- No file writing capabilities
- No arbitrary path access

### Input Validation
- Pydantic validates all API inputs
- CSV parser handles malformed data gracefully
- No code execution from CSV content

## Deployment Checklist

### Development
- [ ] Clone repository
- [ ] Install dependencies: `pip install -r requirements.txt`
- [ ] Configure config.json
- [ ] Run: `python -m logtail_dashboard`

### Testing
- [ ] Install dev dependencies: `pip install -r requirements-dev.txt`
- [ ] Run tests: `pytest`
- [ ] Test with examples: `run_example.bat`

### Production (EXE)
- [ ] Install PyInstaller: `pip install pyinstaller`
- [ ] Build: `pyinstaller logtail_dashboard.spec`
- [ ] Test EXE: `dist\logtail_dashboard.exe`
- [ ] Copy config.json to dist/
- [ ] Deploy to target system

### Operations
- [ ] Create log root folder structure
- [ ] Configure legacy app to write to event subfolders
- [ ] Set up Windows Firewall rules (if LAN access)
- [ ] Optional: Configure as Windows service
- [ ] Document event folder naming convention
