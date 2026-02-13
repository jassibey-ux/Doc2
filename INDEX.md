# LogTail Dashboard - Documentation Index

Quick navigation to all documentation.

## 🚀 Getting Started (Pick One)

| Document | Best For | Time |
|----------|----------|------|
| [QUICKSTART.md](QUICKSTART.md) | "I want it running NOW" | 5 min |
| [INSTALL_WINDOWS.md](INSTALL_WINDOWS.md) | "I need detailed Windows setup" | 15 min |
| [README.md](README.md) | "I want to understand features first" | 10 min |

## 📚 Complete Documentation

### For Users

1. **[QUICKSTART.md](QUICKSTART.md)** - 5-minute setup guide
   - Run with Python
   - Run as EXE
   - Test with examples
   - Common issues

2. **[README.md](README.md)** - Main documentation
   - Features overview
   - Log file format
   - Dashboard usage
   - API reference
   - Troubleshooting

3. **[INSTALL_WINDOWS.md](INSTALL_WINDOWS.md)** - Windows installation
   - Python installation
   - Dependency setup
   - Building standalone EXE
   - Running as Windows service
   - Comprehensive troubleshooting

### For Developers

4. **[STRUCTURE.md](STRUCTURE.md)** - Architecture guide
   - Module responsibilities
   - Data flow
   - Code structure
   - Extension points
   - Performance characteristics

5. **[PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)** - Executive overview
   - Technology stack
   - Architecture diagram
   - API reference
   - Security posture
   - Statistics

6. **[DELIVERY.md](DELIVERY.md)** - What was delivered
   - Code statistics
   - Feature checklist
   - Quality metrics
   - Deployment scenarios

## 🎯 Quick Reference

### I Want To...

| Goal | Go Here |
|------|---------|
| **Run it in 5 minutes** | [QUICKSTART.md](QUICKSTART.md) |
| **Install on Windows** | [INSTALL_WINDOWS.md](INSTALL_WINDOWS.md) |
| **Understand features** | [README.md](README.md#features) |
| **Set up my log files** | [README.md](README.md#log-file-format) |
| **Build an EXE** | [INSTALL_WINDOWS.md](INSTALL_WINDOWS.md#method-2-standalone-exe) |
| **Configure settings** | [README.md](README.md#configuration) |
| **Use the API** | [README.md](README.md#apis) |
| **Fix a problem** | [README.md](README.md#troubleshooting) |
| **Understand architecture** | [STRUCTURE.md](STRUCTURE.md) |
| **Extend the code** | [STRUCTURE.md](STRUCTURE.md#extension-points) |
| **See what was built** | [DELIVERY.md](DELIVERY.md) |
| **Run tests** | [QUICKSTART.md](QUICKSTART.md#running-tests) |

## 📂 Repository Structure

```
logtail-dashboard/
│
├── 📖 Documentation (start here!)
│   ├── INDEX.md              ← You are here
│   ├── QUICKSTART.md         ← Start here for fast setup
│   ├── README.md             ← Main documentation
│   ├── INSTALL_WINDOWS.md    ← Detailed Windows guide
│   ├── STRUCTURE.md          ← Architecture deep-dive
│   ├── PROJECT_SUMMARY.md    ← Executive overview
│   └── DELIVERY.md           ← What was delivered
│
├── 💻 Source Code
│   └── logtail_dashboard/
│       ├── __main__.py       ← Entry point
│       ├── config.py         ← Configuration
│       ├── models.py         ← Data models
│       ├── parser.py         ← CSV parsing
│       ├── watcher.py        ← File monitoring
│       ├── state.py          ← State management
│       ├── api.py            ← Web API
│       └── static/
│           └── index.html    ← Dashboard UI
│
├── 🧪 Tests
│   └── tests/
│       ├── test_parser.py    ← Parser tests
│       └── test_state.py     ← State tests
│
├── 📦 Examples
│   └── examples/
│       └── event_2024_01/    ← Sample CSV files
│
├── ⚙️ Configuration
│   ├── config.json           ← Default settings
│   ├── requirements.txt      ← Dependencies
│   ├── logtail_dashboard.spec ← PyInstaller config
│   └── run_example.bat       ← Quick start script
│
└── 📄 Meta
    ├── LICENSE               ← MIT License
    ├── .gitignore            ← Git exclusions
    └── pytest.ini            ← Test config
```

## 🎓 Learning Path

### Beginner Path

1. Read [QUICKSTART.md](QUICKSTART.md) (5 min)
2. Run example: `run_example.bat`
3. Open http://localhost:8080
4. Explore the dashboard
5. Read [README.md](README.md) (10 min)
6. Set up your log files
7. Run with your data

### Advanced Path

1. Read [STRUCTURE.md](STRUCTURE.md) (20 min)
2. Review source code
3. Run tests: `pytest`
4. Read [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)
5. Extend/customize as needed

### Operations Path

1. Read [INSTALL_WINDOWS.md](INSTALL_WINDOWS.md) (15 min)
2. Build EXE: `pyinstaller logtail_dashboard.spec`
3. Test deployment
4. Set up as Windows service
5. Configure firewall rules
6. Deploy to production

## 🔧 Common Tasks

### Setup

```bash
# Install Python dependencies
pip install -r requirements.txt

# Run with examples
python -m logtail_dashboard --log-root "examples" --event "event_2024_01"

# Run with your logs
python -m logtail_dashboard --log-root "C:\LogData" --event "race_2024"
```

### Testing

```bash
# Install dev dependencies
pip install -r requirements-dev.txt

# Run all tests
pytest

# Run specific test file
pytest tests/test_parser.py

# Run with coverage
pytest --cov=logtail_dashboard
```

### Building

```bash
# Install PyInstaller
pip install pyinstaller

# Build EXE
pyinstaller logtail_dashboard.spec

# Test EXE
dist\logtail_dashboard.exe --log-root "examples" --event "event_2024_01"
```

### Deployment

```bash
# Copy EXE to target
copy dist\logtail_dashboard.exe C:\LogTailDashboard\

# Copy config
copy config.json C:\LogTailDashboard\

# Run on target
cd C:\LogTailDashboard
logtail_dashboard.exe --log-root "C:\LogData"
```

## 📊 Documentation Statistics

| Document | Lines | Purpose |
|----------|-------|---------|
| README.md | 450 | Main guide |
| QUICKSTART.md | 250 | Fast setup |
| INSTALL_WINDOWS.md | 600 | Windows install |
| STRUCTURE.md | 700 | Architecture |
| PROJECT_SUMMARY.md | 450 | Overview |
| DELIVERY.md | 400 | Deliverables |
| INDEX.md | 200 | This file |
| **TOTAL** | **3,050** | **Complete docs** |

## 🆘 Help & Support

### Troubleshooting Order

1. Check [QUICKSTART.md - Common Issues](QUICKSTART.md#common-first-run-issues)
2. Check [README.md - Troubleshooting](README.md#troubleshooting)
3. Check [INSTALL_WINDOWS.md - Troubleshooting](INSTALL_WINDOWS.md#troubleshooting)
4. Review logs in Command Prompt
5. Verify CSV file format
6. Contact system administrator

### Getting Help

When reporting issues, include:

1. **Version**: Check `__version__` in `logtail_dashboard/__init__.py`
2. **Python version**: `python --version`
3. **Operating system**: Windows 10/11
4. **Error message**: Copy from Command Prompt
5. **Configuration**: Your config.json
6. **CSV sample**: First few lines of your CSV file

## 🎯 Next Steps

After reading this index:

1. **New user?** → Start with [QUICKSTART.md](QUICKSTART.md)
2. **Installing on Windows?** → Go to [INSTALL_WINDOWS.md](INSTALL_WINDOWS.md)
3. **Want to understand features?** → Read [README.md](README.md)
4. **Developer?** → Check [STRUCTURE.md](STRUCTURE.md)
5. **Manager/PM?** → See [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)

## 📞 Quick Links

- **Source Code**: [logtail_dashboard/](logtail_dashboard/)
- **Tests**: [tests/](tests/)
- **Examples**: [examples/](examples/)
- **License**: [LICENSE](LICENSE)

---

**Welcome to LogTail Dashboard! 🎉**

Choose your starting point above and get tracking!
