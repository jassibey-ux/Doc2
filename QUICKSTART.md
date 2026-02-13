# Quick Start Guide

Get SCENSUS Dashboard running in 5 minutes.

## For the Impatient

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Run with example data
python -m logtail_dashboard --log-root "examples" --event "event_2024_01"

# 3. Open browser
http://localhost:8082
```

That's it! You should see 3 example trackers on the dashboard.

## Windows Quick Start

### With Python Installed

1. **Open Command Prompt**

2. **Navigate to the dashboard folder**:
   ```cmd
   cd C:\path\to\logtail-dashboard
   ```

3. **Install dependencies** (first time only):
   ```cmd
   pip install -r requirements.txt
   ```

4. **Run the example**:
   ```cmd
   run_example.bat
   ```

   Or manually:
   ```cmd
   python -m logtail_dashboard --log-root "examples" --event "event_2024_01"
   ```

5. **Open your browser**:
   ```
   http://localhost:8082
   ```

You should see:
- 3 trackers in the table (101, 102, 103)
- Green/yellow color coding
- Real-time positions on the map
- Status console showing activity

### Without Python (Using EXE)

If you received a pre-built `SCENSUS_Dashboard.exe`:

1. **Create a folder**:
   ```
   C:\SCENSUSDashboard\
   ```

2. **Copy the EXE** there

3. **Create config.json** in the same folder:
   ```json
   {
     "log_root_folder": "C:\\Temp\\SplitRXLog",
     "port": 8082,
     "bind_host": "127.0.0.1",
     "stale_seconds": 60,
     "enable_map": true
   }
   ```

4. **Run the EXE**:
   ```cmd
   cd C:\SCENSUSDashboard
   SCENSUS_Dashboard.exe
   ```

5. **Open browser**:
   ```
   http://localhost:8082
   ```

## First-Time Setup for Your Log Files

### Step 1: Organize Your Logs

Create this folder structure:

```
C:\LogData\
├── event_2024_race_1\
│   ├── tracker_101.csv
│   ├── tracker_102.csv
│   └── tracker_103.csv
│
└── event_2024_race_2\
    ├── tracker_101.csv
    └── tracker_102.csv
```

Each event folder contains CSV files (one per tracker or combined).

### Step 2: Verify CSV Format

Your CSV files should have headers like this:

```csv
tracker_id,time,lat,lon,alt,fix_valid
101,2024-01-15T14:30:00,34.0522,-118.2437,125.5,true
101,2024-01-15T14:30:30,34.0523,-118.2436,126.0,true
```

**Required columns** (at minimum):
- `tracker_id` (or `id`, `device_id`, etc.)
- `time` (or `timestamp`, `datetime`, etc.)

**Optional but recommended**:
- `lat`, `lon` - GPS position
- `alt` - Altitude
- `fix_valid` - GPS fix status
- `rssi` - Signal strength
- `speed`, `course` - Motion data

See [README.md](README.md#log-file-format) for all supported column names.

### Step 3: Configure

Edit `config.json`:

```json
{
  "log_root_folder": "C:\\Temp\\SplitRXLog",
  "active_event": "event_2024_race_1",
  "port": 8082,
  "bind_host": "127.0.0.1",
  "stale_seconds": 60,
  "enable_map": true
}
```

### Step 4: Run

```cmd
python -m logtail_dashboard
```

Or:

```cmd
SCENSUS_Dashboard.exe
```

### Step 5: Verify

1. Open http://localhost:8082
2. Check that your event is selected in the dropdown
3. Verify trackers appear in the table
4. Check the status console for any errors

## Common First-Run Issues

### "No events found"

**Cause**: Log root folder doesn't exist or is empty

**Fix**:
```cmd
# Check if folder exists
dir C:\LogData

# Create if needed
mkdir C:\LogData\event_test
```

### "No trackers appearing"

**Cause**: CSV files missing headers or in wrong format

**Fix**:
1. Open one of your CSV files
2. Verify first line has column names
3. Verify data rows follow

### "Port already in use"

**Cause**: Another program is using port 8082

**Fix**: Use a different port:
```cmd
python -m logtail_dashboard --port 8083
```

**Note**: The dashboard automatically detects port conflicts and will try alternative ports (8082, 8083, etc.).

### "Can't access from another computer"

**Cause**: Bound to localhost only

**Fix**: Bind to all interfaces:
```cmd
python -m logtail_dashboard --host 0.0.0.0
```

Then access via: `http://<your-laptop-ip>:8082`

## Testing Real-Time Updates

To simulate live tracking:

### Option 1: Manual Append

1. Start the dashboard with an event
2. Open one of the CSV files in Notepad
3. Add a new line at the end:
   ```
   101,2024-01-15T14:35:00,34.0530,-118.2430,130.0,true
   ```
4. Save the file
5. Watch the dashboard update automatically!

### Option 2: Scripted Updates

Create `append_test.bat`:

```batch
@echo off
:loop
echo 101,%date%T%time:~0,8%,34.0522,-118.2437,125.5,true >> C:\LogData\event_test\tracker_101.csv
timeout /t 5
goto loop
```

Run this to append a line every 5 seconds.

## Building the EXE

Want to create your own standalone EXE?

```cmd
# Install PyInstaller (first time only)
pip install pyinstaller

# Build the EXE
pyinstaller logtail_dashboard_windows.spec

# Find it at:
dist\SCENSUS_Dashboard\SCENSUS_Dashboard.exe
```

## Running Tests

Verify everything works:

```cmd
# Install test dependencies
pip install -r requirements-dev.txt

# Run tests
pytest

# You should see:
# ===== XX passed in X.XXs =====
```

## Next Steps

Now that you have it running:

1. **Read the full docs**: [README.md](README.md)
2. **Windows installation details**: [INSTALL_WINDOWS.md](INSTALL_WINDOWS.md)
3. **Architecture overview**: [STRUCTURE.md](STRUCTURE.md)
4. **Configure your legacy app** to write logs to the event folders
5. **Customize** config.json for your needs

## Getting Help

Check the troubleshooting sections:
- [README.md - Troubleshooting](README.md#troubleshooting)
- [INSTALL_WINDOWS.md - Troubleshooting](INSTALL_WINDOWS.md#troubleshooting)

## Configuration Reference

Quick reference for config.json:

```json
{
  "log_root_folder": "C:\\Temp\\SplitRXLog",  // Where events are stored
  "active_event": "event_2024_01",       // Initial event (or null)
  "port": 8082,                          // HTTP port
  "bind_host": "127.0.0.1",              // Localhost only (or 0.0.0.0 for LAN)
  "stale_seconds": 60,                   // Mark stale after N seconds
  "enable_map": true                     // Show map view
}
```

Command-line overrides:

```cmd
--log-root PATH         Override log folder
--event NAME           Override active event
--port PORT            Override port (1-65535)
--host HOST            Override bind host
--stale-seconds SEC    Override stale threshold
```

## Dashboard Features

Once running, you can:

- **Switch events**: Use dropdown to change which event you're monitoring
- **View live data**: Table updates in real-time as CSV files are appended
- **See positions**: Interactive map shows tracker locations (if GPS data present)
- **Monitor status**: Color coding shows healthy (green), no-fix (yellow), stale (red)
- **Check console**: Status console shows backend activity and errors
- **Track multiple**: Handles any number of trackers simultaneously

## Performance Tips

For best performance:

1. **Archive old data**: Move old events to separate folder
2. **Reasonable file sizes**: Split logs by day/event if they get huge
3. **Appropriate stale threshold**: Don't set too low (causes CPU churn)
4. **Localhost only**: Use `127.0.0.1` unless you need LAN access

## That's It!

You're ready to monitor your GPS/LoRa trackers. Happy tracking! 🛰️
