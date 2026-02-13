# SCENSUS Dashboard - Customer Setup Guide

## Overview

The SCENSUS Dashboard is a real-time GPS tracker monitoring application for UAS (Unmanned Aircraft Systems) test and evaluation. It displays live tracker positions on a map and provides session replay capabilities.

## System Requirements

- **Operating System:** Windows 10 (version 1809 or later) or Windows 11
- **Microsoft WebView2 Runtime:** Pre-installed on Windows 10/11 (required for the dashboard window)
- **Disk Space:** ~100 MB for installation
- **Memory:** 4 GB RAM minimum (8 GB recommended)

## Installation

### Step 1: Install SCENSUS Dashboard

1. Run **SCENSUS_Dashboard_Setup_1.1.0.exe**
2. Follow the installation wizard
3. Choose to create a desktop shortcut (recommended)
4. Click **Finish** to complete installation

### Step 2: First-Run Configuration

On first launch, the dashboard will prompt you to select your log data folder:

1. A dialog will appear asking for your log data location
2. Navigate to the folder where your LoRa GPS Support Program writes CSV files
3. **Default location:** `C:\Temp\SplitRXLog\`
4. Click **Select Folder** to confirm

The dashboard will remember this location for future launches.

## Using with LoRa GPS Support Program

### Architecture

```
┌─────────────────────────────────┐     ┌─────────────────────────────────┐
│   LoRa GPS Support Program      │     │     SCENSUS Dashboard           │
│   (Separate Application)        │     │   (This Application)            │
│                                 │     │                                 │
│   - Receives GPS data from      │────>│   - Monitors the output folder  │
│     LoRa trackers               │     │   - Displays live positions     │
│   - Writes CSV files to         │     │   - Provides session replay     │
│     C:\Temp\SplitRXLog\         │     │   - Exports to KML/CSV          │
└─────────────────────────────────┘     └─────────────────────────────────┘
```

### Setup Steps

1. **Install the LoRa GPS Support Program** (provided separately)
2. **Configure the output folder** in the LoRa GPS Support Program to: `C:\Temp\SplitRXLog\`
3. **Start the LoRa GPS Support Program** and begin receiving GPS data
4. **Launch SCENSUS Dashboard** - it will automatically detect new data

## Features

### Live Monitoring

- Real-time GPS positions displayed on an interactive map
- Tracker status indicators (active, stale, lost signal)
- Signal strength (RSSI) and satellite information
- Automatic map centering on active trackers

### Session Replay

- Browse historical sessions
- Playback controls (play, pause, seek, speed)
- Timeline visualization
- Track path display

### Data Export

- **KML Export:** For viewing in Google Earth
- **CSV Export:** For analysis in spreadsheets

## Changing the Data Folder

If you need to change the monitored folder after installation:

1. Open the dashboard
2. Click the **Settings** icon in the sidebar
3. Click **Browse** to select a new folder
4. The dashboard will immediately start monitoring the new location

## Troubleshooting

### Dashboard window doesn't open

**Cause:** Microsoft WebView2 Runtime may be missing or outdated.

**Solution:** Download and install the WebView2 Runtime from:
https://developer.microsoft.com/en-us/microsoft-edge/webview2/

### No trackers appearing on the map

**Possible causes:**
1. The LoRa GPS Support Program isn't running
2. The wrong folder is configured
3. No GPS data is being received

**Solutions:**
1. Verify the LoRa GPS Support Program is running and receiving data
2. Check that CSV files are being created in `C:\Temp\SplitRXLog\`
3. Verify the dashboard is configured to monitor the correct folder

### Windows SmartScreen Warning

When running the installer for the first time, Windows may show a SmartScreen warning because the application is not code-signed.

**To proceed:**
1. Click **More info**
2. Click **Run anyway**

This is expected behavior for unsigned applications and is safe to proceed.

### Port conflict (dashboard doesn't open)

**Cause:** Another application is using port 8082.

**Solution:** The dashboard automatically detects port conflicts and will try alternative ports (8082, 8083, 8084, etc.). Check the console window for the actual URL being used.

If you need a specific port, edit `config.json` and change the `port` value.

### Application crashes on startup

**Solution:**
1. Delete the `config.json` file located in the same folder as `SCENSUS_Dashboard.exe`
   - For portable installation: next to the EXE (e.g., `C:\SCENSUSDashboard\config.json`)
   - For installed version: in the installation folder
2. Restart the application
3. The dashboard will create a new default configuration

## Support

For technical support or to report issues, please contact your SCENSUS representative or visit:
https://scensus.com/support

## Version History

- **1.1.0** - Current release
  - React-based modern UI
  - Improved first-run folder selection
  - Enhanced session replay
  - KML export support

---

*SCENSUS Dashboard - UAS Test & Evaluation Suite*
