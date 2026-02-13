# SCENSUS Dashboard - Windows Build Instructions

This guide explains how to package the SCENSUS Dashboard for Windows distribution.

## Quick Start (For Developers)

### Prerequisites
- Python 3.9+ with pip
- Windows machine (or cross-compile from macOS/Linux)

### Build Steps

1. **Install build dependencies:**
   ```bash
   pip install pyinstaller pillow
   ```

2. **Run the build script:**
   ```bash
   python build_windows.py
   ```

3. **Create the installer:**
   - Download [Inno Setup](https://jrsoftware.org/isinfo.php) (free)
   - Open `installer.iss` in Inno Setup Compiler
   - Click Build → Compile
   - Find installer in `installer_output/` folder

4. **Distribute:**
   - Send `SCENSUS_Dashboard_Setup_1.0.0.exe` to customers
   - They just double-click and install!

---

## End User Experience

### Installation (Customer)
1. Double-click `SCENSUS_Dashboard_Setup_1.0.0.exe`
2. Click Next → Next → Install → Finish
3. Desktop shortcut is created automatically

### First Run
1. Double-click "SCENSUS Dashboard" shortcut
2. A dialog appears: "Select Log Data Folder"
3. Navigate to the folder where NMEA CSV files are stored
4. Click OK
5. Browser opens automatically to the dashboard

### Changing Settings
Edit `config.json` in the installation folder:
```json
{
  "log_root_folder": "C:\\Path\\To\\LogData",
  "port": 8080,
  "bind_host": "127.0.0.1",
  "stale_seconds": 60,
  "enable_map": true
}
```

---

## Build Files Reference

| File | Purpose |
|------|---------|
| `build_windows.py` | Automated build script |
| `logtail_dashboard_windows.spec` | PyInstaller configuration |
| `installer.iss` | Inno Setup installer script |
| `create_icon.py` | Generates application icon |
| `scensus_icon.ico` | Windows application icon |

---

## Manual Build Steps

If the automated script doesn't work:

### 1. Create Icon
```bash
python create_icon.py
```

### 2. Build with PyInstaller
```bash
pyinstaller --clean logtail_dashboard_windows.spec
```

### 3. Verify Build
Check `dist/SCENSUS_Dashboard/` contains:
- `SCENSUS_Dashboard.exe`
- Various `.dll` files
- `logtail_dashboard/static/` folder

### 4. Test Locally
```bash
cd dist/SCENSUS_Dashboard
SCENSUS_Dashboard.exe
```

### 5. Create Installer
Open `installer.iss` in Inno Setup and compile.

---

## Troubleshooting

### "Missing module" errors
Add the module to `hiddenimports` in `logtail_dashboard_windows.spec`:
```python
hiddenimports=[
    'your_missing_module',
    ...
]
```

### Antivirus flags the exe
PyInstaller executables are sometimes flagged as false positives. Options:
1. Submit to antivirus vendor as false positive
2. Sign the executable with a code signing certificate
3. Use Inno Setup's signing feature

### Browser doesn't open
Check `config.json` has correct `bind_host` and `port`. Default is `http://127.0.0.1:8080`

### App closes immediately
Run from command prompt to see error messages:
```cmd
cd "C:\Program Files\SCENSUS Dashboard"
SCENSUS_Dashboard.exe
```

---

## Distribution Checklist

Before sending to customers:

- [ ] Test fresh install on clean Windows machine
- [ ] Verify first-run folder selection works
- [ ] Verify browser opens automatically
- [ ] Verify dashboard loads with test data
- [ ] Test uninstaller works correctly
- [ ] Scan with antivirus to check for false positives

---

## File Size

Expected sizes:
- Executable folder: ~40-50 MB
- Installer: ~30-40 MB (compressed)

---

## Support

For issues with the dashboard itself, check:
- Browser console (F12) for JavaScript errors
- `config.json` for correct folder path
- Windows Event Viewer for application errors
