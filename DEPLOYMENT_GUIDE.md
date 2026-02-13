# SCENSUS Dashboard - Deployment Guide

**Version**: 2.2.1
**Date**: 2025-12-23

---

## 📦 Distribution Options

### Option 1: ZIP Archive (Recommended for Quick Sharing)

**Already created**: `/Users/scensus/scensus-dashboard.zip` (145 KB)

**To share with another developer:**

1. **Send the ZIP file** via email, file share, or cloud storage
2. **Include these instructions:**

```
SCENSUS Dashboard - Installation Instructions
==============================================

1. Extract the ZIP file to any directory

2. Install Python 3.10 or later (if not installed):
   - Windows: https://www.python.org/downloads/
   - macOS: Already installed or use Homebrew
   - Linux: sudo apt install python3

3. Open terminal/command prompt in the extracted folder

4. Install dependencies:
   pip install -r requirements.txt

5. Run the dashboard:
   python -m logtail_dashboard --log-root examples

6. Open browser to:
   http://localhost:8080

For Windows users, there's also a run_example.bat file you can double-click.
```

---

### Option 2: GitHub Repository (Best for Collaboration)

**Steps to create:**

```bash
cd /Users/scensus/logtail-dashboard

# Initialize git (if not already done)
git init

# Add all files
git add .

# Commit
git commit -m "Initial release - SCENSUS Dashboard v2.2.1"

# Create GitHub repository at https://github.com/new
# Then push:
git remote add origin https://github.com/YOUR_USERNAME/scensus-dashboard.git
git push -u origin main
```

**Advantages:**
- Easy version control
- Other developers can clone with: `git clone https://github.com/YOUR_USERNAME/scensus-dashboard.git`
- Can track issues and accept contributions
- Free hosting for the code

---

### Option 3: Standalone Executable (Windows/macOS/Linux)

**For non-technical users**, create a single executable file using PyInstaller:

```bash
# Already have logtail_dashboard.spec file configured

# Install PyInstaller
pip install pyinstaller

# Build executable
pyinstaller logtail_dashboard.spec

# Output will be in: dist/logtail_dashboard/
```

**Result:**
- Single executable file (no Python required)
- ~50-80 MB bundle
- Can distribute to users without Python installed
- Platform-specific (need to build on Windows for Windows, macOS for macOS, etc.)

---

### Option 4: Docker Container (Advanced - For Server Deployment)

**Create Dockerfile:**

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY logtail_dashboard/ ./logtail_dashboard/
COPY config.json .

EXPOSE 8080

CMD ["python", "-m", "logtail_dashboard", "--bind-host", "0.0.0.0", "--log-root", "/data"]
```

**Build and run:**
```bash
docker build -t scensus-dashboard .
docker run -p 8080:8080 -v /path/to/data:/data scensus-dashboard
```

**Advantages:**
- Consistent environment across all systems
- Easy to deploy to cloud servers
- Isolated from host system

---

### Option 5: Python Package (PyPI)

**For public distribution**, publish to Python Package Index:

```bash
# Create setup.py (already exists in spec file)
python setup.py sdist bdist_wheel

# Upload to PyPI
pip install twine
twine upload dist/*
```

**Users can then install with:**
```bash
pip install scensus-dashboard
scensus-dashboard --log-root /path/to/data
```

---

## 📋 What's Included

### Core Files:
- `logtail_dashboard/` - Main application code
- `requirements.txt` - Python dependencies
- `config.json` - Default configuration
- `examples/` - Sample data for testing
- `README.md` - User documentation
- `QUICKSTART.md` - Quick start guide

### Documentation:
- `LIVE_MONITORING_DASHBOARD.md` - Live monitoring features
- `AUTO_ATTACHMENT_IMPLEMENTATION.md` - Auto session detection
- `DESIGN_UPDATE_ORANGE_BLACK.md` - UI design details
- `LAYOUT_UPDATE_MAP_FIRST.md` - Layout documentation
- `DEPLOYMENT_STATUS.md` - Deployment information

### Developer Files:
- `tests/` - Unit tests
- `pytest.ini` - Test configuration
- `requirements-dev.txt` - Development dependencies
- `.gitignore` - Git ignore patterns

---

## 🚀 Recommended Distribution Method

**For Developers:**
→ **GitHub Repository** (best for collaboration and version control)

**For End Users:**
→ **Standalone Executable** (easiest, no Python needed)

**For Server Deployment:**
→ **Docker Container** (consistent, scalable)

**For Quick Share:**
→ **ZIP Archive** (already created, 145 KB)

---

## 📝 Installation Requirements

### System Requirements:
- **Python**: 3.10 or later
- **RAM**: 256 MB minimum
- **Storage**: 50 MB for application + data
- **Browser**: Chrome, Firefox, Safari, Edge (modern versions)

### Python Dependencies (from requirements.txt):
```
fastapi==0.104.1
uvicorn[standard]==0.24.0
pydantic==2.5.0
watchdog==3.0.0
```

### Development Dependencies (optional):
```
pytest==7.4.3
black==23.11.0
ruff==0.1.6
```

---

## 🔧 Configuration

### Command-Line Options:
```bash
python -m logtail_dashboard --help

Options:
  --log-root PATH        Directory containing session folders (required)
  --bind-host HOST       Host to bind to (default: 127.0.0.1)
  --port PORT           Port to listen on (default: 8080)
  --event NAME          Specific session to monitor
  --config PATH         Path to config.json file
```

### Configuration File (config.json):
```json
{
  "log_root_folder": "examples",
  "bind_host": "127.0.0.1",
  "port": 8080
}
```

---

## 🎯 Quick Start for Recipients

**After receiving the ZIP file:**

1. **Extract** to a folder (e.g., `C:\SCENSUS\` or `/opt/scensus/`)

2. **Install Python** (if needed):
   - Check: `python --version`
   - Need 3.10+

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Run the dashboard:**
   ```bash
   python -m logtail_dashboard --log-root examples
   ```

5. **Open browser:**
   ```
   http://localhost:8080
   ```

6. **Test with sample data** (included in `examples/` folder)

---

## 🐛 Troubleshooting

### Common Issues:

**"Python not found"**
→ Install Python 3.10+ from python.org

**"Module not found"**
→ Run: `pip install -r requirements.txt`

**"Port 8080 already in use"**
→ Use different port: `--port 8081`

**"No sessions found"**
→ Check `--log-root` points to folder with CSV files

**Windows firewall blocking**
→ Allow Python through Windows Defender Firewall

---

## 📧 Support

**For issues or questions:**
- Check `README.md` for detailed documentation
- Review `QUICKSTART.md` for common scenarios
- See `LIVE_MONITORING_DASHBOARD.md` for feature details

---

## 🎉 What's New in v2.2.1

✅ **Automatic session detection** - Detects and connects to active sessions
✅ **Live monitoring dashboard** - Real-time updates via WebSocket
✅ **Detailed tracker view** - Click any tracker for full telemetry details
✅ **Orange & black design** - Professional UAS monitoring interface
✅ **Statistics cards** - At-a-glance fleet status
✅ **30-second charts** - Altitude and speed history
✅ **Map-first layout** - Prominent map view for spatial awareness

---

**Built for UAS Test & Evaluation**
**SCENSUS Dashboard v2.2.1**
**Release Date**: 2025-12-23
