# SCENSUS Dashboard - Automatic Session Detection

**Feature**: Intelligent startup with automatic test session discovery
**Version**: 2.1.0
**Date**: 2025-12-22

---

## 🎯 Overview

The SCENSUS Dashboard now automatically detects and connects to active test sessions on startup. No manual configuration required - just launch the application and start monitoring.

---

## ✨ Key Features

### 1. Automatic Session Discovery
- **Scans data directory** on startup
- **Identifies active sessions** based on recent file activity
- **Auto-selects most recent** session for monitoring
- **No user intervention** required

### 2. Intelligent Activity Detection
- Sessions with file modifications in last 30 minutes = **🟢 Active**
- Sessions with older file modifications = **⚪ Inactive**
- Automatically prioritizes active sessions over inactive ones

### 3. User-Friendly Experience
- **No "Connect" button** - seamless startup
- **No technical jargon** - user sees "sessions" not "folders"
- **Loading state** - "Looking for active test sessions..."
- **Status messages** - clear feedback on what's happening

---

## 🚀 How It Works

### Startup Flow

```
1. Launch Application
   ↓
2. Scan Data Directory
   ↓
3. Analyze Each Subfolder
   - Count CSV files
   - Check last modification time
   - Determine if active
   ↓
4. Auto-Select Session
   - Prefer active sessions
   - Fall back to most recent
   ↓
5. Start Monitoring
   - Display session name
   - Show activity status
   - Begin real-time updates
```

### Activity Detection Logic

```python
# Session is "active" if:
time_since_last_modification <= 30 minutes

# Otherwise session is "inactive" but still available
```

### Selection Priority

1. **Most recently active session** (modified within 30 min)
2. **Most recent session overall** (if none active)
3. **No session** (wait for data)

---

## 📊 Session Information

Each discovered session includes:

| Field | Description | Example |
|-------|-------------|---------|
| **Name** | Folder name | `test_event` |
| **Status** | Active/Inactive | 🟢 Active / ⚪ Inactive |
| **Last Activity** | Time since last file change | "5 minutes ago" |
| **File Count** | Number of CSV data files | 3 files |

---

## 🖥️ User Experience

### Console Messages (Startup)

**Scenario 1: Active Session Found**
```
Looking for active test sessions...
Found session: flight_test_001
  Status: Active
  Last activity: 12/22/2025, 11:30:45 PM
Found 2 session(s)
```

**Scenario 2: No Active Sessions**
```
Looking for active test sessions...
Found most recent session: previous_test
  Status: Most recent
  Last activity: 12/22/2025, 10:15:30 PM
Found 3 session(s)
```

**Scenario 3: No Sessions**
```
Looking for active test sessions...
No active sessions found
Waiting for session data...
No sessions found in data directory
```

### Server Logs (Startup)

```
╔══════════════════════════════════════════════════════════╗
║               SCENSUS Dashboard                          ║
║            UAS Test & Evaluation Suite                  ║
╚══════════════════════════════════════════════════════════╝

Dashboard URL: http://127.0.0.1:8080
Data Location: /path/to/data

============================================================
SCENSUS Dashboard - Initializing
============================================================
Looking for active test sessions...
Found active session: test_event
  Last activity: 1 minute ago
  Data files: 3
============================================================
Session Monitor: test_event
============================================================
```

---

## 🔧 Technical Implementation

### Backend Components

#### 1. SessionScanner (`session_scanner.py`)

```python
class SessionScanner:
    """Scan for and identify active test sessions."""

    def scan_sessions() -> list[SessionInfo]
        """Scan log root for sessions/events."""

    def find_most_recent_active() -> Optional[SessionInfo]
        """Find the most recently active session."""
```

**Features**:
- Scans subdirectories in log root
- Analyzes CSV file modification times
- Calculates activity status
- Sorts by most recent first

#### 2. API Endpoints

**`GET /api/sessions/scan`**
```json
{
  "sessions": [
    {
      "name": "test_event",
      "last_activity": "2025-12-22T23:58:11",
      "is_active": true,
      "file_count": 3,
      "display_name": "test_event - 🟢 Active - Last activity: 2 minutes ago"
    }
  ]
}
```

**`GET /api/sessions/auto`**
```json
{
  "success": true,
  "message": "Found active session: test_event",
  "session": {
    "name": "test_event",
    "last_activity": "2025-12-22T23:58:11",
    "is_active": true,
    "file_count": 3,
    "display_name": "test_event - 🟢 Active - Last activity: 2 minutes ago"
  }
}
```

#### 3. Enhanced Startup (`api.py`)

```python
async def startup(self) -> None:
    """Application startup with automatic session detection."""

    # Auto-detect most recent active session
    logger.info("Looking for active test sessions...")
    most_recent = self.scanner.find_most_recent_active()

    if most_recent:
        # Start monitoring automatically
        session_to_monitor = most_recent.name
```

### Frontend Components

#### 1. Auto-Initialize Function

```javascript
async function autoInitialize() {
    addConsoleMessage('Looking for active test sessions...', 'info');

    // Try to auto-select most recent active session
    const autoResponse = await fetch('/api/sessions/auto');
    const autoData = await autoResponse.json();

    if (autoData.success && autoData.session) {
        // Display session info
        addConsoleMessage(`Found session: ${session.name}`, 'success');
    }

    // Load all available sessions for dropdown
    await loadSessions();
}
```

#### 2. Session Dropdown

Sessions displayed with:
- **Status indicator**: 🟢 Active / ⚪ Inactive
- **Time ago**: "5m ago", "2h ago", "3d ago"
- **Sorted**: Most recent first

Example:
```
🟢 flight_test_001 (2m ago)
⚪ previous_test (2h ago)
⚪ archive_data (5d ago)
```

---

## 📖 Usage Guide

### Automatic Startup (Default)

```bash
# Simply start the application
python3 -m logtail_dashboard --log-root "/path/to/data"

# No need to specify --event
# Dashboard automatically finds and selects active session
```

**Result**:
- Application scans data directory
- Finds most recent active session
- Starts monitoring automatically
- User sees session in dashboard

### Manual Session Override

```bash
# Force specific session
python3 -m logtail_dashboard --log-root "/path/to/data" --event "my_test"

# Dashboard uses specified session
# Falls back to auto-detection if session not found
```

### Session Switching

Users can still manually switch sessions:
1. Click session dropdown
2. See all sessions with status
3. Select different session
4. Dashboard switches monitoring

---

## 🎨 Configuration

### Activity Threshold

Default: **30 minutes**

To customize in code:
```python
scanner = SessionScanner(
    log_root=Path(config.log_root_folder),
    active_threshold_minutes=60,  # 1 hour instead of 30 min
)
```

### Session Detection Behavior

The scanner looks for:
- **Subdirectories** in log root folder
- **CSV files** within subdirectories
- **File modification times** for activity detection
- **Non-hidden folders** (ignores folders starting with `.`)

---

## 🔍 Troubleshooting

### No Sessions Found

**Problem**: "No sessions found in data directory"

**Solutions**:
1. Verify data directory exists: `ls /path/to/data`
2. Check subdirectories exist: `ls -la /path/to/data`
3. Ensure CSV files present: `ls /path/to/data/*/[*.csv`
4. Verify folder permissions: `ls -ld /path/to/data`

### Wrong Session Selected

**Problem**: Dashboard selects unexpected session

**Reasons**:
- Most recently modified session is auto-selected
- Check file timestamps: `ls -lt /path/to/data/*/[*.csv | head`

**Solution**: Manually select desired session from dropdown

### Session Marked Inactive

**Problem**: Active session shows as ⚪ Inactive

**Reason**: No file modifications in last 30 minutes

**Fix**:
- Files only update when new data arrives
- Check if UAS is actually transmitting
- Verify log files are being written

---

## 📊 API Reference

### Session Scan Endpoint

**Request**:
```bash
GET /api/sessions/scan
```

**Response**:
```json
{
  "sessions": [
    {
      "name": "string",
      "last_activity": "2025-12-22T23:58:11.377214",
      "is_active": boolean,
      "file_count": integer,
      "display_name": "string"
    }
  ]
}
```

### Auto-Select Endpoint

**Request**:
```bash
GET /api/sessions/auto
```

**Response**:
```json
{
  "success": boolean,
  "message": "string",
  "session": {
    "name": "string",
    "last_activity": "ISO 8601 datetime",
    "is_active": boolean,
    "file_count": integer,
    "display_name": "string"
  }
}
```

---

## 🎯 Benefits

### For Users
- ✅ **No configuration needed** - just launch and go
- ✅ **Automatic session detection** - finds active tests
- ✅ **Clear status indicators** - see what's happening
- ✅ **Seamless experience** - feels like a native app

### For Operators
- ✅ **Quick startup** - monitoring begins immediately
- ✅ **Less training required** - intuitive interface
- ✅ **Reduced errors** - no manual folder selection
- ✅ **Better workflow** - focus on testing, not configuration

### For Developers
- ✅ **Clean separation** - scanner is independent module
- ✅ **Extensible design** - easy to add features
- ✅ **Well documented** - clear API and behavior
- ✅ **Testable** - scanner can be unit tested

---

## 🚦 Status Indicators

| Indicator | Meaning | Time Threshold |
|-----------|---------|----------------|
| 🟢 Active | Files modified recently | < 30 minutes |
| ⚪ Inactive | Files not modified recently | ≥ 30 minutes |

### Time Display Format

| Time Range | Display Format | Example |
|------------|----------------|---------|
| < 1 minute | "X seconds ago" | "45 seconds ago" |
| < 1 hour | "X minutes ago" | "15 minutes ago" |
| < 1 day | "X hours ago" | "3 hours ago" |
| ≥ 1 day | "X days ago" | "2 days ago" |

Also shown as compact in dropdown:
- < 1 hour: "Xm ago"
- < 1 day: "Xh ago"
- ≥ 1 day: "Xd ago"

---

## 📝 Implementation Checklist

- [x] Session scanner module created
- [x] API endpoints implemented
- [x] Automatic startup logic added
- [x] Frontend auto-initialize function
- [x] Session dropdown with status
- [x] Loading state messages
- [x] User-friendly console output
- [x] Fallback to manual selection
- [x] Activity threshold configurable
- [x] Documentation complete

---

## 🔮 Future Enhancements

### Potential Improvements
- [ ] Multiple active sessions support
- [ ] Session bookmarking/favorites
- [ ] Custom activity thresholds per session
- [ ] Session metadata (description, date range)
- [ ] Auto-refresh session list periodically
- [ ] Session search/filter in dropdown
- [ ] Recent sessions history
- [ ] Session comparison mode

---

## 📞 Support

### Common Questions

**Q: Can I disable auto-detection?**
A: Yes, explicitly specify `--event` to skip auto-detection

**Q: How often does it scan for new sessions?**
A: Once on startup, then on-demand when user opens dropdown

**Q: Can I change the 30-minute threshold?**
A: Currently requires code change, future versions may expose as setting

**Q: What if multiple sessions are active?**
A: Most recently modified session is selected

**Q: Does it work with nested folders?**
A: No, only scans immediate subdirectories of log root

---

## ✨ Summary

**SCENSUS Dashboard v2.1** introduces intelligent session detection that:

✅ **Automatically finds active test sessions**
✅ **Eliminates manual configuration**
✅ **Provides clear status indicators**
✅ **Creates seamless user experience**
✅ **Maintains flexibility** for manual selection

**Status**: Production Ready
**User Impact**: Significantly improved startup experience
**Technical Debt**: None
**Breaking Changes**: None (fully backward compatible)

---

**Built with ❤️ for UAS Test & Evaluation**

**Version**: 2.1.0-AutoSession
**Feature**: Automatic Session Detection
**Status**: OPERATIONAL
**Last Updated**: 2025-12-22
