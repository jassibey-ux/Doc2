# Windows Installation Guide

Complete guide for installing and running LogTail Dashboard on Windows 10/11.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Method 1: Running from Source](#method-1-running-from-source)
3. [Method 2: Standalone EXE](#method-2-standalone-exe)
4. [Configuration](#configuration)
5. [Testing](#testing)
6. [Troubleshooting](#troubleshooting)

## Prerequisites

### For Running from Source

- **Windows 10 or 11** (64-bit)
- **Python 3.10 or newer**
  - Download from: https://www.python.org/downloads/
  - During installation, check "Add Python to PATH"

### For Building Standalone EXE

- All of the above, plus:
- **PyInstaller** (installed via pip)

## Method 1: Running from Source

### Step 1: Install Python

1. Download Python 3.10+ from https://www.python.org/downloads/
2. Run the installer
3. **IMPORTANT**: Check "Add Python to PATH" during installation
4. Click "Install Now"

### Step 2: Verify Python Installation

Open Command Prompt and run:

```cmd
python --version
```

Should show: `Python 3.10.x` or newer

```cmd
pip --version
```

Should show pip version information

### Step 3: Download/Clone the Dashboard

Option A - If you have the source folder:
```cmd
cd C:\path\to\logtail-dashboard
```

Option B - If using git:
```cmd
git clone <repository-url>
cd logtail-dashboard
```

### Step 4: Install Dependencies

```cmd
pip install -r requirements.txt
```

This will install:
- FastAPI (web framework)
- Uvicorn (web server)
- Pydantic (data validation)
- watchfiles (file monitoring)
- websockets (real-time updates)

### Step 5: Configure the Dashboard

Edit `config.json`:

```json
{
  "log_root_folder": "C:\\LogData",
  "active_event": "event_2024_01",
  "port": 8080,
  "bind_host": "127.0.0.1",
  "stale_seconds": 60,
  "enable_map": true
}
```

**Important Notes**:
- Use double backslashes `\\` in Windows paths (e.g., `C:\\LogData`)
- Or use forward slashes (e.g., `C:/LogData`)
- Create the log folder if it doesn't exist

### Step 6: Run the Dashboard

```cmd
python -m logtail_dashboard
```

Or with command-line options:

```cmd
python -m logtail_dashboard --log-root "C:\MyLogs" --port 8080
```

### Step 7: Access the Dashboard

Open your web browser and navigate to:

```
http://localhost:8080
```

You should see the LogTail Dashboard interface.

## Method 2: Standalone EXE

Building a standalone EXE allows deployment without Python installation.

### Step 1: Install PyInstaller

```cmd
pip install pyinstaller
```

### Step 2: Build the EXE

From the `logtail-dashboard` folder:

```cmd
pyinstaller logtail_dashboard.spec
```

This will:
1. Analyze dependencies
2. Bundle Python runtime
3. Include static web files
4. Create a single executable

### Step 3: Locate the EXE

The EXE will be in:

```
dist\logtail_dashboard.exe
```

### Step 4: Deploy

1. Copy `dist\logtail_dashboard.exe` to your target location
2. Copy `config.json` to the same folder (optional - can use CLI args)

Example structure:
```
C:\LogTailDashboard\
├── logtail_dashboard.exe
└── config.json
```

### Step 5: Run the EXE

Double-click `logtail_dashboard.exe` or run from Command Prompt:

```cmd
cd C:\LogTailDashboard
logtail_dashboard.exe
```

Or with arguments:

```cmd
logtail_dashboard.exe --log-root "C:\LogData" --port 8080
```

### Step 6: Create a Shortcut (Optional)

1. Right-click `logtail_dashboard.exe`
2. Select "Create shortcut"
3. Right-click the shortcut → Properties
4. In "Target" field, add arguments:
   ```
   "C:\LogTailDashboard\logtail_dashboard.exe" --log-root "C:\LogData"
   ```
5. Click OK

## Configuration

### config.json Reference

```json
{
  "log_root_folder": "C:\\LogData",
  "active_event": null,
  "port": 8080,
  "bind_host": "127.0.0.1",
  "stale_seconds": 60,
  "enable_map": true
}
```

| Setting | Description | Default |
|---------|-------------|---------|
| `log_root_folder` | Root folder containing event subfolders | `C:\\LogData` |
| `active_event` | Initial event to monitor (null = none) | `null` |
| `port` | HTTP server port | `8080` |
| `bind_host` | Bind address (127.0.0.1 = localhost, 0.0.0.0 = LAN) | `127.0.0.1` |
| `stale_seconds` | Seconds before marking tracker stale | `60` |
| `enable_map` | Show map view | `true` |

### Command-Line Arguments

Override config.json settings:

```cmd
logtail_dashboard.exe --help

Options:
  --log-root PATH          Log root folder path
  --event NAME            Active event folder name
  --port PORT             HTTP server port
  --host HOST             Bind host address
  --stale-seconds SEC     Stale threshold in seconds
  --config PATH           Path to config.json file
```

Example:

```cmd
logtail_dashboard.exe --log-root "C:\MyLogs" --event "race_2024" --port 8081
```

## Testing

### Run Unit Tests

Install dev dependencies:

```cmd
pip install -r requirements-dev.txt
```

Run tests:

```cmd
pytest
```

Run with coverage:

```cmd
pytest --cov=logtail_dashboard
```

### Test with Example Data

The repository includes example CSV files in `examples/event_2024_01/`:

```cmd
python -m logtail_dashboard --log-root "examples" --event "event_2024_01"
```

Then open http://localhost:8080 to see example trackers.

## Troubleshooting

### Python not found

**Error**: `'python' is not recognized as an internal or external command`

**Solution**:
1. Reinstall Python with "Add to PATH" checked
2. Or add Python manually to PATH:
   - Windows key → "Environment Variables"
   - Edit "Path" variable
   - Add: `C:\Users\<YourName>\AppData\Local\Programs\Python\Python310`

### Port already in use

**Error**: `[Errno 10048] error while attempting to bind on address ('127.0.0.1', 8080): only one usage of each socket address`

**Solution**: Change the port:

```cmd
python -m logtail_dashboard --port 8081
```

### Can't access from other computers

**Problem**: Dashboard works on laptop but not from other PCs on the network

**Solution**:

1. Set bind host to `0.0.0.0`:
   ```cmd
   python -m logtail_dashboard --host 0.0.0.0
   ```

2. Allow through Windows Firewall:
   - Windows Defender Firewall → Advanced Settings
   - Inbound Rules → New Rule
   - Port → TCP → Specific local ports: 8080
   - Allow the connection
   - Apply to Domain, Private, Public
   - Name it "LogTail Dashboard"

3. Access from other computers:
   - Find your laptop's IP: `ipconfig` (look for IPv4 Address)
   - Open browser on other PC: `http://<laptop-ip>:8080`

### Trackers not appearing

**Checklist**:

1. Verify event folder exists and contains CSV files:
   ```cmd
   dir C:\LogData\event_2024_01
   ```

2. Check CSV file format (must have headers)

3. Look at the dashboard console for error messages

4. Check Command Prompt where dashboard is running for logs

5. Verify the legacy app is actually writing to the CSV files

### High CPU usage

**Cause**: Very large CSV files being repeatedly read

**Solution**:

1. Archive old logs to separate folders
2. Increase stale threshold to reduce update checks:
   ```cmd
   python -m logtail_dashboard --stale-seconds 300
   ```

### EXE fails to start

**Problem**: Double-clicking EXE does nothing

**Solution**: Run from Command Prompt to see errors:

```cmd
cd C:\LogTailDashboard
logtail_dashboard.exe
```

Look for error messages about missing config or invalid settings.

### Map not showing

**Problem**: Map panel is empty

**Checklist**:

1. Verify `enable_map: true` in config.json
2. Check internet connection (map tiles load from OpenStreetMap)
3. Verify trackers have valid GPS positions (lat/lon not null)
4. Check browser console for JavaScript errors (F12)

### WebSocket disconnects frequently

**Cause**: Network issues or proxy interference

**Solution**:

1. Check Windows Firewall isn't blocking WebSocket connections
2. If using a proxy, configure it to allow WebSocket upgrades
3. Try bind host `127.0.0.1` for localhost-only access

## Advanced: Running as Windows Service

To run the dashboard as a Windows service that starts automatically:

### Option 1: Using NSSM (Non-Sucking Service Manager)

1. Download NSSM: https://nssm.cc/download

2. Extract `nssm.exe`

3. Install service:
   ```cmd
   nssm install LogTailDashboard "C:\LogTailDashboard\logtail_dashboard.exe"
   ```

4. Configure:
   - Path: `C:\LogTailDashboard\logtail_dashboard.exe`
   - Startup directory: `C:\LogTailDashboard`
   - Arguments: `--log-root "C:\LogData" --port 8080`

5. Start service:
   ```cmd
   nssm start LogTailDashboard
   ```

### Option 2: Using Task Scheduler

1. Open Task Scheduler
2. Create Basic Task
3. Name: "LogTail Dashboard"
4. Trigger: At startup
5. Action: Start a program
6. Program: `C:\LogTailDashboard\logtail_dashboard.exe`
7. Arguments: `--log-root "C:\LogData"`
8. Start in: `C:\LogTailDashboard`

## Support

For issues:

1. Check the logs in Command Prompt
2. Verify configuration in config.json
3. Review CSV file format
4. Check this troubleshooting guide
5. Contact your system administrator

## Next Steps

- Review [README.md](README.md) for feature documentation
- Customize `config.json` for your environment
- Set up event folders in your log root directory
- Configure your legacy GPS/LoRa app to write logs to the event folders
