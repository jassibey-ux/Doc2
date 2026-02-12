# SCENSUS UAS Dashboard - React Frontend

A modern React-based dashboard for the LoRa GPS Tracker system with Liquid Glass UI theme.

## Features

- Full-screen MapLibre GL map with dark theme
- Real-time drone tracking via WebSocket
- Liquid Glass UI design system
- Drone detail panels with telemetry data
- Layer controls for map customization
- Camera modal infrastructure (for future video streaming)

## Prerequisites

- Node.js 18+
- npm or yarn
- Backend running on port 8000 (Python FastAPI)

## Installation

```bash
# Install dependencies
npm install
```

## Development

```bash
# Start the Python backend first
cd ..
python -m logtail_dashboard --log-root "C:\path\to\logs"

# In another terminal, start the frontend dev server
npm run dev
```

The development server runs on `http://localhost:5173` with API proxy to `http://localhost:8000`.

## Production Build

```bash
# Build for production
npm run build
```

Built files are output to `../logtail_dashboard/static/react/`.

## Accessing the Dashboard

- **New React Dashboard**: `http://localhost:8000/app`
- **Legacy Dashboard**: `http://localhost:8000/` (original vanilla JS version)

## Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── ui/
│   │   │   └── GlassUI.tsx        # Liquid Glass component library
│   │   ├── Map.tsx                # MapLibre integration
│   │   ├── MapView.tsx            # Main dashboard layout
│   │   ├── Sidebar.tsx            # Left control buttons
│   │   ├── DroneDetailPanel.tsx   # Drone telemetry panel
│   │   ├── DroneListPanel.tsx     # Drone list sidebar
│   │   ├── LayersPanel.tsx        # Map layer controls
│   │   └── CameraModal.tsx        # Video streaming modal
│   ├── contexts/
│   │   └── WebSocketContext.tsx   # Real-time updates
│   ├── types/
│   │   └── drone.ts               # TypeScript interfaces
│   ├── App.tsx
│   ├── main.tsx
│   └── styles.css                 # Liquid Glass theme
├── public/
│   └── favicon.svg
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## Technology Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind CSS 4** - Utility-first CSS
- **MapLibre GL** - Map rendering
- **Lucide React** - Icons
- **HLS.js** - Video streaming (future)

## API Integration

The frontend connects to the existing FastAPI backend:

- `GET /api/health` - Health check
- `GET /api/trackers` - List all drones
- `GET /api/trackers/{id}` - Drone details
- `WS /ws` - Real-time updates

## WebSocket Messages

```typescript
// Received message types
type: 'tracker_updated'   // New drone data
type: 'tracker_stale'     // Drone went offline
type: 'active_event_changed' // Monitoring folder changed
```

## Customization

### Adding Map Layers

Edit `LayersPanel.tsx` to add new layer types.

### Modifying Theme

The Liquid Glass theme is defined in `styles.css`. Key variables:

```css
--color-glass-100: rgba(255, 255, 255, 0.05);
--color-glass-200: rgba(255, 255, 255, 0.10);
--color-accent-indigo: #6366f1;
```

### Adding Camera Support

When drones have cameras, add `camera_url` to the backend model and the camera modal will automatically enable.
