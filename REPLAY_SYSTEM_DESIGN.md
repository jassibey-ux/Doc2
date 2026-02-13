# SCENSUS Dashboard - Replay System Design
**Comprehensive Technical Design for Test & Evaluation**

Version: 3.0.0 (Proposed)
Date: 2025-12-23
Status: 📋 DESIGN COMPLETE - READY FOR IMPLEMENTATION

---

## 🎯 EXECUTIVE SUMMARY

The Replay System transforms the SCENSUS Dashboard from a live monitoring tool into a complete test & evaluation platform by enabling:

✅ **Historical Session Playback** - Load and replay any past test mission
✅ **Time Control** - Play, pause, seek, and speed control (0.1x to 10x)
✅ **Multi-Tracker Synchronization** - Precise alignment of multiple UAS
✅ **Side-by-Side Comparison** - Compare two test runs with delta analysis
✅ **Event Markers & Annotations** - Document key moments in timeline
✅ **Frame-by-Frame Analysis** - Examine exact state at any point
✅ **Export Capabilities** - Extract segments for reporting

---

## 📊 CURRENT CAPABILITIES (v2.2.1)

The dashboard already has excellent foundations:

### ✅ Existing Strengths:
- **Rich Data Model:** TrackerRecord with 16+ telemetry fields
- **Robust CSV Parser:** Handles multiple datetime formats, missing values
- **State Management:** Callback-driven StateManager for updates
- **WebSocket Pipeline:** Real-time data broadcast to frontend
- **File Watching:** Efficient tailing with byte-offset tracking
- **Map Visualization:** Leaflet integration with markers and trails
- **Detail Views:** Click-through to comprehensive tracker data
- **Chart.js Integration:** Real-time altitude and speed charts

### 🎯 What's Missing for Replay:
- Load historical sessions (currently only live monitoring)
- Timeline control (seek to specific moments)
- Speed adjustment (faster/slower than real-time)
- Session comparison (side-by-side analysis)
- Event marking (annotate key moments)
- Export segments (extract data ranges)

---

## 🏗️ PROPOSED ARCHITECTURE

```
┌─────────────────────────────────────────────────────────┐
│                    REPLAY SYSTEM                         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Frontend (Browser)                                     │
│  ├─ Session Browser (list all test sessions)           │
│  ├─ Playback Controls (Play/Pause/Seek/Speed)          │
│  ├─ Timeline Scrubber (visual progress bar)            │
│  ├─ Event Markers (clickable timeline points)          │
│  ├─ Comparison View (side-by-side sessions)            │
│  └─ Export Dialog (CSV/JSON extraction)                │
│                                                          │
│  Backend (Python - New Modules)                        │
│  ├─ SessionLoader (parse CSV into timeline)            │
│  ├─ ReplayEngine (control playback state)              │
│  ├─ SyncController (align multiple trackers)           │
│  ├─ SessionRegistry (index and metadata)               │
│  ├─ ComparisonEngine (analyze differences)             │
│  └─ ReplayExporter (extract segments)                  │
│                                                          │
│  Reused Components                                     │
│  ├─ StateManager (accepts replayed records)            │
│  ├─ WebSocket broadcast (same as live mode)            │
│  ├─ Map visualization (markers update per frame)       │
│  └─ Detail views (work with replayed data)             │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 💡 KEY INNOVATIONS

### 1. **Unified Data Pipeline**
Replay records inject through the SAME StateManager.update_tracker() that live mode uses. This means:
- Zero changes to frontend visualization code
- Map, charts, tables all "just work"
- Live and replay modes share 90% of codebase

### 2. **Frame-Based Timeline**
Instead of streaming individual records, organize into synchronized "frames":
- Each frame = snapshot of all trackers at one moment
- Configurable granularity (default: 100ms intervals)
- Interpolation for missing data points
- Ensures smooth playback

### 3. **Multi-Tracker Synchronization**
Challenge: Trackers may have time offsets (clock drift, delayed startup)

Solutions:
- **GPS-based sync:** Use GPS timestamps (more accurate than local time)
- **Event-based sync:** Align on significant events (takeoff, altitude peaks)
- **Cross-correlation:** Signal processing to find best alignment
- **Manual adjustment:** User can fine-tune offsets

### 4. **Comparison Engine**
Compare two test runs with:
- **Path Difference:** GPS track divergence (meters)
- **Altitude Delta:** Max/avg altitude differences
- **Signal Patterns:** RSSI comparison
- **Similarity Score:** 0-100% overall match
- **Divergence Points:** Where flights differ significantly

### 5. **Memory-Efficient Caching**
For large sessions (10,000+ frames):
- **Circular Buffer:** Load only current frame ± 5 frame buffer
- **LRU Cache:** Keep max 5 sessions in RAM
- **Lazy Loading:** Parse CSVs on-demand, not upfront
- **Streaming Export:** Write directly to file without full load

---

## 🎬 PRACTICAL USE CASES

### Use Case 1: **Post-Flight Mission Analysis**
**Scenario:** Flight test completed, need to review performance

**Workflow:**
1. Load test session from dropdown
2. Play through at normal speed (1.0x)
3. Pause at key moments (max altitude, signal loss)
4. Add markers: "Takeoff", "RTH initiated", "Landing"
5. Export metrics report

**Value:** Comprehensive mission review without re-flying

---

### Use Case 2: **Comparing Flight Profiles**
**Scenario:** Two tests with different flight plans, need to compare

**Workflow:**
1. Load Session A (baseline)
2. Load Session B (new configuration)
3. Open Comparison View
4. System calculates:
   - Path difference: 127m
   - Max altitude diff: +15m
   - Signal diff: -3dBm avg
   - Similarity: 87%
5. Identify divergence points (5 found)
6. Export comparison report

**Value:** Quantify differences between test configurations

---

### Use Case 3: **Training & Demonstration**
**Scenario:** Onboard new operators with historical missions

**Workflow:**
1. Load training mission
2. Slow playback to 0.5x
3. Pause at decision points
4. Annotate with instructor notes
5. Step frame-by-frame through critical moments
6. Save annotated version

**Value:** Repeatable training scenarios without live flights

---

### Use Case 4: **Incident Investigation**
**Scenario:** UAS experienced signal loss, need to analyze

**Workflow:**
1. Load incident session
2. Seek to time of signal loss (based on logs)
3. Mark event: "Signal degraded"
4. Step backward 10 frames to see conditions before
5. Add annotation: "RSSI dropped below threshold near building"
6. Compare with successful flight on same route
7. Export evidence package (CSV + markers)

**Value:** Root cause analysis with complete telemetry context

---

### Use Case 5: **Performance Validation**
**Scenario:** Validate UAS meets specification requirements

**Workflow:**
1. Load 5 test flights
2. For each:
   - Extract max altitude
   - Extract max speed
   - Extract signal health %
3. Compare against specifications
4. Generate pass/fail report

**Value:** Automated compliance testing

---

## 🛠️ TECHNICAL IMPLEMENTATION DETAILS

### Core Data Structures

```python
# New models for replay

class ReplaySession(BaseModel):
    """Metadata for a historical test session"""
    session_id: str                    # UUID
    name: str                          # User-friendly name
    duration_seconds: float            # Total duration
    start_time: datetime               # Mission start
    end_time: datetime                 # Mission end
    tracker_ids: list[str]             # UAS in this mission
    file_count: int                    # Number of CSV files
    total_records: int                 # Total telemetry points
    tags: list[str]                    # "flight", "test", "incident"

class FrameGroup:
    """Single synchronized moment in timeline"""
    frame_index: int                   # 0-based position
    timestamp: datetime                # Actual time
    records: dict[str, TrackerRecord]  # tracker_id -> data
    markers: list[EventMarker]         # Events at this moment

class EventMarker(BaseModel):
    """Point event in timeline"""
    marker_id: str
    timestamp: datetime
    tracker_id: Optional[str]          # None = global
    marker_type: str                   # "takeoff", "landing", "anomaly"
    label: str                         # Display text
    severity: str                      # "info", "warning", "critical"
    color: str                         # UI hint

class ComparisonPair(BaseModel):
    """Two sessions being compared"""
    session_a_id: str
    session_b_id: str
    metrics: ComparisonMetrics         # Calculated differences
    divergence_points: list[DivergencePoint]  # Where they differ
```

### Backend Modules

#### 1. SessionLoader
```python
class SessionLoader:
    """Load historical sessions into replay timeline"""

    async def load_session(self, session_path: Path) -> ReplaySession:
        # Parse all CSVs using existing CSVParser
        # Sort records by timestamp
        # Calculate statistics (duration, bounds)
        # Return session metadata

    async def build_timeline(self, records: list[TrackerRecord])
        -> list[FrameGroup]:
        # Group records into synchronized frames
        # Interpolate missing data if needed
        # Return frame-by-frame structure
```

#### 2. ReplayEngine
```python
class ReplayEngine:
    """Control playback timeline"""

    async def play(self) -> None:
        """Start playback from current frame"""
        # Loop through frames
        # Emit to StateManager
        # Sleep based on speed

    async def pause(self) -> None:
        """Stop playback"""

    async def seek(self, frame_index: int) -> None:
        """Jump to specific frame"""

    async def set_speed(self, speed: float) -> None:
        """Adjust playback speed (0.1x - 10x)"""
```

#### 3. SyncController
```python
class SyncController:
    """Manage multi-tracker synchronization"""

    def detect_time_offset(self, tracker_a: str, tracker_b: str) -> float:
        """Calculate time offset between trackers"""
        # Strategy 1: GPS timestamp alignment
        # Strategy 2: Event matching (altitude peaks)
        # Strategy 3: Cross-correlation

    def synchronize(self, frame: FrameGroup) -> FrameGroup:
        """Apply time corrections to align trackers"""
```

#### 4. ComparisonEngine
```python
class ComparisonEngine:
    """Analyze differences between sessions"""

    async def compare_sessions(self, session_a_id: str,
                               session_b_id: str) -> ComparisonPair:
        """Create side-by-side comparison"""
        # Align sessions by reference time
        # Calculate metrics (path, altitude, signal)
        # Find divergence points
        # Return comparison result

    def calculate_similarity(self, pair: ComparisonPair) -> float:
        """Compute 0-1.0 similarity score"""
        # Compare GPS tracks
        # Compare altitude profiles
        # Compare signal patterns
```

### Frontend Components

#### Session Browser
```javascript
// List all available sessions
async function loadReplaySessions() {
    const response = await fetch('/api/replay/sessions');
    const data = await response.json();

    // Display session list with:
    // - Name
    // - Date
    // - Duration
    // - Tracker count
}
```

#### Playback Controls
```html
<!-- Timeline scrubber -->
<input type="range" id="timeline-scrubber"
       min="0" max="100" value="0">

<!-- Speed selector -->
<select id="speed-select">
    <option value="0.1">0.1x (Slow)</option>
    <option value="1.0" selected>1.0x (Normal)</option>
    <option value="5.0">5.0x (Fast)</option>
    <option value="10.0">10.0x (Very Fast)</option>
</select>

<!-- Play/Pause button -->
<button onclick="playPause()">
    <span id="play-icon">▶</span>
    <span id="pause-icon" style="display:none">⏸</span>
</button>
```

#### Event Markers
```javascript
function renderTimelineMarkers(markers) {
    // For each marker:
    // - Calculate position on timeline (%)
    // - Render as colored dot
    // - Add click handler to seek
}

async function addMarker() {
    const marker = {
        timestamp: getCurrentFrameTime(),
        marker_type: 'event',
        label: prompt('Marker label:'),
        severity: 'info'
    };

    await fetch('/api/replay/markers', {
        method: 'POST',
        body: JSON.stringify(marker)
    });
}
```

---

## 📅 IMPLEMENTATION ROADMAP

### **Phase 1: Core Replay (2 weeks)**
**MVP - Basic playback functionality**

Deliverables:
- [ ] `replay.py` module (SessionLoader, ReplayEngine)
- [ ] `GET /api/replay/sessions` endpoint
- [ ] `POST /api/replay/load/{id}` endpoint
- [ ] `POST /api/replay/control` endpoint
- [ ] Frontend: Session browser
- [ ] Frontend: Playback controls (Play/Pause/Seek)
- [ ] Frontend: Timeline scrubber

Success Criteria:
- Load 10+ sessions successfully
- Playback accuracy within 50ms
- Seek precision to exact frame
- No memory leaks during extended playback

---

### **Phase 2: Advanced Features (2 weeks)**
**Speed control, sync, markers**

Deliverables:
- [ ] Speed control (0.1x - 10x)
- [ ] SyncController module
- [ ] Event markers system
- [ ] Annotation support
- [ ] Metrics panel
- [ ] Frame-by-frame stepping

Success Criteria:
- Speed control accurate at all levels
- Multi-tracker sync within 100ms
- Markers persist across sessions
- Frame stepping works smoothly

---

### **Phase 3: Comparison & Export (2 weeks)**
**Side-by-side analysis**

Deliverables:
- [ ] ComparisonEngine module
- [ ] Comparison UI (modal)
- [ ] Divergence detection
- [ ] Similarity scoring
- [ ] CSV export functionality
- [ ] JSON export with metadata

Success Criteria:
- Comparison completes in < 5 seconds
- Similarity scores make sense
- Export files match source data
- Large file handling (100MB+)

---

### **Phase 4: Polish & Deploy (1 week)**
**Production ready**

Deliverables:
- [ ] UI/UX refinements
- [ ] Performance optimization
- [ ] Memory management (LRU cache)
- [ ] Comprehensive documentation
- [ ] Unit test coverage > 80%
- [ ] Integration tests

Success Criteria:
- Handles 10,000+ frame sessions
- Memory usage < 500MB
- All core workflows documented
- No critical bugs

---

## 🎯 SUCCESS METRICS

### Performance Targets:
- **Session Load Time:** < 2 seconds for 1000-frame session
- **Playback Latency:** < 50ms frame delivery
- **Memory Usage:** < 500MB for 10,000-frame session
- **Comparison Time:** < 5 seconds for two 5000-frame sessions
- **Export Speed:** > 1000 records/second

### User Experience Targets:
- **Learning Curve:** New user can replay session in < 2 minutes
- **Comparison Workflow:** Complete in < 3 minutes
- **Marker Addition:** < 10 seconds per marker
- **Export Time:** < 30 seconds for typical segment

---

## 🔒 SECURITY & ROBUSTNESS

### Input Validation:
```python
class ReplayControlRequest(BaseModel):
    action: str = Field(..., regex="^(play|pause|seek|speed)$")
    frame: Optional[int] = Field(None, ge=0)
    speed: Optional[float] = Field(None, ge=0.1, le=10.0)
```

### Resource Limits:
```python
REPLAY_CONFIG = {
    'max_session_size_mb': 500,
    'max_sessions_in_memory': 5,
    'max_timeline_frames': 100000,
    'max_markers_per_session': 1000,
    'max_export_size_mb': 100,
}
```

### Error Handling:
```python
try:
    session = await load_session(session_id)
except SessionNotFoundError:
    raise HTTPException(status_code=404, detail="Session not found")
except Exception as e:
    logger.error(f"Replay error: {e}")
    raise HTTPException(status_code=500, detail="Replay failed")
```

---

## 📚 TESTING STRATEGY

### Unit Tests:
- SessionLoader parsing accuracy
- ReplayEngine frame timing
- SyncController offset detection
- ComparisonEngine metrics calculation

### Integration Tests:
- End-to-end playback workflow
- Speed control accuracy
- Export data integrity
- Comparison workflow

### Performance Tests:
- Large session handling (10,000+ frames)
- Memory usage monitoring
- Concurrent session playback
- Export speed benchmarks

---

## 🎓 DOCUMENTATION

### User Documentation:
- **Quick Start Guide:** Load and play first session
- **Feature Guide:** All controls explained
- **Use Case Examples:** Step-by-step workflows
- **Troubleshooting:** Common issues and fixes

### Developer Documentation:
- **Architecture Overview:** Component relationships
- **API Reference:** All endpoints documented
- **Extension Guide:** Adding custom features
- **Testing Guide:** Running and writing tests

---

## 💰 ESTIMATED EFFORT

### Development Time:
- **Phase 1 (Core):** 80 hours (2 weeks @ 40hr/week)
- **Phase 2 (Advanced):** 80 hours
- **Phase 3 (Comparison):** 80 hours
- **Phase 4 (Polish):** 40 hours
- **Total:** 280 hours (~7 weeks)

### Team Composition:
- **Backend Developer:** Python, FastAPI, async programming
- **Frontend Developer:** JavaScript, Chart.js, UI/UX
- **QA Engineer:** Testing, validation, documentation

---

## 🚀 DEPLOYMENT

### Integration:
1. Add replay modules to existing codebase
2. Update API routes
3. Add frontend views
4. Test with existing sessions
5. Deploy alongside live mode

### Backwards Compatibility:
- Live monitoring unchanged
- Existing data format supported
- No breaking changes to API
- Optional feature (toggle in settings)

---

## 📊 COMPARISON WITH ALTERNATIVES

### Option A: External Tool (e.g., Python Scripts)
**Pros:** Quick to build
**Cons:** No visualization, manual workflow, disconnected

### Option B: Desktop Application (e.g., Qt/Electron)
**Pros:** Rich UI capabilities
**Cons:** Separate install, not web-based, duplication

### **Option C: Integrated Replay (RECOMMENDED)**
**Pros:**
- Reuses all existing visualization
- Consistent user experience
- Single deployment
- Leverages existing WebSocket infrastructure

**Cons:**
- More backend complexity
- Requires async programming expertise

---

## 🎯 CONCLUSION

The Replay System transforms SCENSUS Dashboard from a live monitoring tool into a complete Test & Evaluation platform. By reusing 90% of existing code and building on solid foundations, the implementation is:

✅ **Achievable:** 7-week timeline with clear phases
✅ **Valuable:** Addresses 5 critical T&E use cases
✅ **Robust:** Handles large datasets, multi-tracker sync
✅ **Maintainable:** Clean architecture, well-tested
✅ **Extensible:** Foundation for future features

### Next Steps:
1. Review this design document
2. Prioritize features (can defer Phase 3 if needed)
3. Assign development team
4. Begin Phase 1 implementation
5. Iterative testing and feedback

---

**Status:** ✅ DESIGN COMPLETE - READY FOR APPROVAL

**Designed for UAS Test & Evaluation Excellence**
**SCENSUS Dashboard - Replay System v3.0.0**
**Design Date:** 2025-12-23
