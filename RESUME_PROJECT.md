# SCENSUS UAS Dashboard - Project Resume Guide

## Project Location
```
C:\Users\jassi\OneDrive\Desktop\Desktop\logtail-dashboard
```

## Quick Start Commands

### 1. Start the Backend
```bash
cd "C:\Users\jassi\OneDrive\Desktop\Desktop\logtail-dashboard"
python -m logtail_dashboard --log-root "C:\Users\jassi\OneDrive\Desktop\Desktop\logtail-dashboard\test_data\LiveTestSession" --port 8000
```

### 2. Access the Dashboards
- **New React Dashboard**: http://localhost:8000/app
- **Legacy Dashboard**: http://localhost:8000/

### 3. Frontend Development
```bash
cd frontend
npm install  # Only needed first time or after pulling changes
npm run dev  # Start dev server with hot reload
```

### 4. Build Frontend for Production
```bash
cd frontend
npm run build
```

---

## What Was Implemented

### New React Frontend (`frontend/`)
- **MapLibre GL** full-screen dark map
- **Liquid Glass UI** theme with translucent panels
- **Real-time WebSocket** connection to backend
- **Drone markers** with color-coded status
- **Detail panel** showing telemetry data
- **Control sidebar** with layer toggles
- **Camera modal** infrastructure (for future video)

### Key Files
| File | Purpose |
|------|---------|
| `frontend/src/components/MapView.tsx` | Main dashboard layout |
| `frontend/src/components/Map.tsx` | MapLibre integration |
| `frontend/src/components/DroneDetailPanel.tsx` | Telemetry display |
| `frontend/src/components/ui/GlassUI.tsx` | Glass component library |
| `frontend/src/contexts/WebSocketContext.tsx` | Real-time updates |
| `frontend/src/styles.css` | Liquid Glass theme |

### Backend Changes
- Added `/app` route to serve React dashboard
- Original dashboard remains at `/`

---

## Next Steps (Potential)

### Phase 2 Enhancements
- [ ] Flight path visualization on map
- [ ] Geofencing alerts
- [ ] Historical replay in React UI
- [ ] Export functionality

### Phase 3 (Future)
- [ ] Camera video streaming (when drones have cameras)
- [ ] Database integration for persistent storage
- [ ] Multi-user authentication
- [ ] Mobile responsive design

---

## Test Data

The `test_data/` folder contains sample sessions:
- `LiveTestSession/` - 10 trackers (200-209) in LA area
- `TestSession_2025_12_23/` - 3 trackers (101-103)

### Run Live Simulator
```bash
cd test_data
python simulate_live.py --session LiveTestSession --interval 2
```

---

## Git Status

Last commit: `0c73de7` - "Add React frontend with Liquid Glass UI theme"

To see changes since last commit:
```bash
git status
git diff
```

---

## Dependencies

### Backend (Python)
```bash
pip install -r requirements.txt
```

### Frontend (Node.js)
```bash
cd frontend
npm install
```

---

## Troubleshooting

### Port 8000 in use
```powershell
# Find process using port
netstat -ano | findstr :8000

# Kill by PID
taskkill /PID <pid> /F
```

### Frontend build errors
```bash
cd frontend
npm run typecheck  # Check TypeScript errors
npm run build      # Full build
```
