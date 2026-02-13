# SCENSUS Dashboard - Quick Reference Guide

**All Enhanced Features - One Page Reference**

---

## 🚀 QUICK START

```bash
# Start the dashboard
python3 -m logtail_dashboard --log-root "examples" --event "event_2024_01"

# Access dashboard
http://localhost:8080
```

---

## ✅ ALL 10 FEATURES AT A GLANCE

| # | Feature | How to Use | Location |
|---|---------|------------|----------|
| 1 | **Favicon** | Automatic | Browser tab icon |
| 2 | **Browser Notifications** | Settings → Toggle ON | Desktop notifications |
| 3 | **Export CSV** | Click "Export CSV" button | Header |
| 4 | **Dark/Light Mode** | Click theme toggle | Sidebar footer |
| 5 | **Sound Alerts** | Settings → Toggle ON | Plays on stale |
| 6 | **Custom Thresholds** | Settings → Enter JSON | Per-UAS timeouts |
| 7 | **Telemetry Charts** | Click "Charts" nav | Sidebar → Charts |
| 8 | **Track History** | Automatic on map | Map panel |
| 9 | **Statistics** | Click "Statistics" nav | Sidebar → Statistics |
| 10 | **Replay Mode** | Click "Replay" nav | Sidebar → Replay |

---

## 🎨 NAVIGATION

**Sidebar Menu**:
- 🏠 **Dashboard** - Real-time monitoring (default view)
- 📊 **Charts** - Altitude & RSSI charts
- 📈 **Statistics** - Flight analytics
- ▶️ **Replay** - Historical playback
- ⚙️ **Settings** - Configure all features

---

## ⚙️ SETTINGS (Gear Icon)

```
Browser Notifications    [Toggle]  - Desktop alerts for stale UAS
Sound Alerts            [Toggle]  - Audio beep on stale
Stale Threshold         [Number]  - Global default (seconds)
Custom Thresholds       [JSON]    - Per-UAS timeouts
Track History Length    [Number]  - Positions to show (5-100)
Chart Data Points       [Number]  - Max chart points (10-500)
```

**Example Custom Thresholds**:
```json
{
  "101": 30,
  "102": 120,
  "103": 60
}
```

---

## 🎯 KEY FEATURES BREAKDOWN

### 1. Favicon ✅
- **What**: SCENSUS shield/plane icon in browser tab
- **How**: Automatic, no action needed
- **Test**: Look at browser tab for blue shield icon

### 2. Browser Notifications ✅
- **What**: Desktop notifications when UAS goes stale
- **How**: Settings → Browser Notifications → ON → Allow permission
- **Test**: Wait for UAS to become stale or set low threshold

### 3. Export CSV ✅
- **What**: Download all tracker data to CSV file
- **How**: Click "Export CSV" button in header
- **Output**: `scensus_export_event_YYYYMMDD_HHMMSS.csv`

### 4. Dark/Light Mode ✅
- **What**: Toggle between dark and light themes
- **How**: Click theme toggle in sidebar footer
- **Persist**: Saves preference to localStorage

### 5. Sound Alerts ✅
- **What**: 800Hz beep when UAS becomes stale
- **How**: Settings → Sound Alerts → ON
- **Duration**: 0.5 seconds with fade-out

### 6. Custom Staleness Thresholds ✅
- **What**: Different timeout per UAS
- **How**: Settings → Custom UAS Thresholds → Enter JSON → Save
- **Format**: `{"uas_id": seconds}`

### 7. Telemetry Charts ✅
- **What**: Real-time altitude and RSSI charts
- **How**: Click "Charts" in sidebar
- **Charts**: Altitude over time, RSSI over time
- **Config**: Settings → Chart Data Points

### 8. Track History on Map ✅
- **What**: Dashed lines showing UAS path
- **How**: Automatic on map panel
- **Color**: Green (active), Yellow (no fix), Red (stale)
- **Config**: Settings → Track History Length

### 9. Statistics Dashboard ✅
- **What**: Flight analytics view
- **How**: Click "Statistics" in sidebar
- **Metrics**: Flight time, max altitude, avg RSSI, etc.

### 10. Replay Mode ✅
- **What**: Historical event playback
- **How**: Click "Replay" in sidebar
- **Controls**: Timeline scrubber, play/pause, speed control

---

## 🎨 UI ELEMENTS

### Header
- **Event Selector**: Dropdown to choose active event
- **Export CSV**: Download telemetry data
- **Refresh**: Manual data refresh

### Main Dashboard
- **Stats Cards**: Active, Stale, No GPS Fix counts
- **Telemetry Table**: Real-time UAS data
  - Green row = Active + GPS fix
  - Yellow row = No GPS fix
  - Red row = Stale

### Map Panel
- **Markers**: Color-coded UAS positions
- **Track Lines**: Dashed paths showing history
- **Popups**: Click marker for UAS details

### Status Console
- **Live Logs**: Backend messages
- **Color-coded**: Info (white), Success (green), Warning (yellow), Error (red)
- **Auto-scroll**: Shows last 100 messages

---

## 🔧 KEYBOARD SHORTCUTS

*Coming soon in next version*

---

## 📊 STATUS INDICATORS

### UAS Row Colors
- 🟢 **Green**: Active + Valid GPS fix
- 🟡 **Yellow**: Active but No GPS fix
- 🔴 **Red**: Stale (no update for >threshold)

### Status Badges
- **Active**: Green with pulsing dot
- **No Fix**: Yellow static dot
- **Stale**: Red static dot

### Connection Status
- **Connected**: Green text in sidebar footer
- **Disconnected**: Red text, auto-reconnects in 3s

---

## 🎵 SOUND ALERTS

**When**: UAS becomes stale
**Sound**: 800Hz beep, 0.5s duration
**Volume**: 30% (non-intrusive)
**Toggle**: Settings → Sound Alerts

---

## 🔔 BROWSER NOTIFICATIONS

**When**: UAS becomes stale
**Title**: "SCENSUS Alert"
**Message**: "UAS {id} is stale"
**Icon**: SCENSUS shield logo
**Requires**: Browser permission (prompted on first enable)

---

## 📥 CSV EXPORT FORMAT

**Columns**:
```
tracker_id, time_local_received, time_gps,
lat, lon, alt_m, speed_mps, course_deg,
hdop, rssi_dbm, baro_alt_m, baro_temp_c,
baro_press_hpa, fix_valid, is_stale, age_seconds
```

**Filename**: `scensus_export_{event}_{timestamp}.csv`

---

## 🗺️ MAP FEATURES

- **Base Layer**: OpenStreetMap
- **Markers**: Custom colored dots
- **Track Lines**: Dashed polylines
- **Popups**: UAS details on click
- **Auto-Fit**: Zooms to show all UAS
- **Colors**:
  - Green = Active + Fix
  - Yellow = No Fix
  - Red = Stale

---

## 📈 CHARTS VIEW

**Two Charts**:
1. **Altitude Over Time**
   - Y-axis: Altitude (meters)
   - X-axis: Time
   - Multi-line (one per UAS)

2. **RSSI Over Time**
   - Y-axis: Signal strength (dBm)
   - X-axis: Time
   - Multi-line (one per UAS)

**Controls**:
- Settings → Chart Data Points (max points shown)
- Auto-updates via WebSocket

---

## 🛠️ TROUBLESHOOTING

### Favicon Not Showing
```bash
# Clear cache and hard refresh
Cmd+Shift+R (Mac) / Ctrl+Shift+F5 (Windows)

# Check endpoint
curl http://localhost:8080/favicon.svg
```

### Notifications Not Working
1. Check Settings → Browser Notifications is ON
2. Allow permission when browser prompts
3. Test: Set low threshold, wait for stale event

### Export Fails
1. Check browser allows downloads
2. Verify trackers have data: `/api/trackers`
3. Check server logs for errors

### Charts Not Displaying
1. Check browser console (F12) for errors
2. Verify Chart.js CDN loaded
3. Ensure WebSocket connected
4. Try page refresh

### Sound Not Playing
1. Settings → Sound Alerts must be ON
2. Check browser sound permissions
3. Test: Trigger stale event

---

## 🔍 DEBUGGING

### Browser Console (F12)
```javascript
// Check current state
console.log(state);

// Check trackers
console.log(state.trackers);

// Check settings
console.log(state.settings);

// Check WebSocket
console.log(state.ws.readyState); // 1 = connected
```

### API Endpoints
```bash
# Health check
curl http://localhost:8080/api/health

# List events
curl http://localhost:8080/api/events

# List trackers
curl http://localhost:8080/api/trackers

# Export CSV
curl http://localhost:8080/api/export/csv -O
```

---

## 📝 CONFIGURATION FILES

### config.json
```json
{
  "log_root_folder": "examples",
  "active_event": "event_2024_01",
  "port": 8080,
  "bind_host": "127.0.0.1",
  "stale_seconds": 60,
  "enable_map": true
}
```

### LocalStorage (Browser)
- `theme`: "dark" or "light"
- `scensus-settings`: JSON object with all settings

---

## 🚀 ADVANCED USAGE

### LAN Access (View from Tablet/Phone)
```bash
# Run with 0.0.0.0 binding
python3 -m logtail_dashboard --log-root "examples" --host 0.0.0.0

# Find your IP
ipconfig (Windows) / ifconfig (Mac/Linux)

# Access from other device
http://YOUR_IP:8080
```

### Custom Port
```bash
python3 -m logtail_dashboard --log-root "examples" --port 9000
```

### Different Stale Threshold
```bash
python3 -m logtail_dashboard --log-root "examples" --stale-seconds 30
```

---

## 📊 FEATURE MATRIX

| Feature | Implemented | Tested | Documented |
|---------|-------------|--------|------------|
| Favicon | ✅ | ✅ | ✅ |
| Notifications | ✅ | ✅ | ✅ |
| Export CSV | ✅ | ✅ | ✅ |
| Theme Toggle | ✅ | ✅ | ✅ |
| Sound Alerts | ✅ | ✅ | ✅ |
| Custom Thresholds | ✅ | ✅ | ✅ |
| Charts | ✅ | ✅ | ✅ |
| Track History | ✅ | ✅ | ✅ |
| Statistics | ✅ | ⏳ | ✅ |
| Replay Mode | ✅ | ⏳ | ✅ |

**Legend**:
- ✅ Complete
- ⏳ In Progress (UI ready, data aggregation next)

---

## 🎯 COMMON WORKFLOWS

### Daily Monitoring
1. Start server
2. Select event from dropdown
3. Monitor table for real-time updates
4. Check map for UAS positions
5. Enable notifications for alerts

### Flight Test Review
1. Click "Charts" to view telemetry trends
2. Check altitude and RSSI graphs
3. Export CSV for detailed analysis
4. Review statistics dashboard

### Multi-UAS Configuration
1. Open Settings
2. Set custom thresholds per UAS
3. Adjust track history length
4. Enable sound alerts
5. Save settings

---

## 📞 QUICK HELP

**Server Not Starting**:
- Check port 8080 not in use: `lsof -ti:8080`
- Try different port: `--port 8081`

**No Data Showing**:
- Verify event selected in dropdown
- Check log files exist in event folder
- Refresh page

**WebSocket Disconnected**:
- Auto-reconnects in 3 seconds
- Check server is running
- Verify network connection

---

**SCENSUS Dashboard Enhanced** - Quick Reference v1.0

Access full documentation:
- [README.md](README.md) - Complete guide
- [ENHANCED_FEATURES.md](ENHANCED_FEATURES.md) - Feature details
- [FEATURE_COMPLETION_SUMMARY.md](FEATURE_COMPLETION_SUMMARY.md) - Implementation summary
