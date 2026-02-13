# Video Streaming & PTZ Integration Plan

## Overview

Integrate live video from PTZ cameras (already installed in Canada) into the SCENSUS Dashboard, with eventual auto-tracking of drones using tracker GPS data.

---

## Information Exchange with the Camera Company

### What They Need to Provide You

| Info | Why You Need It |
|------|-----------------|
| **Camera make/model** | Determines RTSP URL format and PTZ control protocol (ONVIF vs proprietary) |
| **RTSP stream URL(s)** | The video feed endpoint (e.g., `rtsp://192.168.1.100:554/stream1`) |
| **ONVIF credentials** | Username/password for PTZ control commands |
| **Camera GPS position** | Exact lat/lon/altitude of each camera (needed for auto-track angle calculations) |
| **Camera mounting angle** | Which direction it faces at "home" position (bearing in degrees) |
| **Network info** | Public IP or domain, whether they have a static IP, current firewall setup |
| **Number of cameras** | How many streams you need to support |
| **Stream resolution/framerate** | What quality the cameras output (e.g., 1080p @ 30fps) |

### What You Need to Provide Them

| Info | Details |
|------|---------|
| **Port forwarding rules** | Which ports to open (RTSP: 554, ONVIF: 80/8080, or custom) |
| **OR relay software to install** | A lightweight media relay (e.g., MediaMTX) if you don't want to expose cameras directly |
| **OR VPN/Tailscale setup** | A private network link if they want zero port exposure |
| **Bandwidth requirements** | ~4-8 Mbps upload per 1080p stream, ~1-2 Mbps per 720p stream |
| **Authentication credentials** | If using a relay/cloud service, the tokens or keys for their cameras to connect |

---

## Streaming Architecture Options

### Option A: Direct RTSP + WebRTC relay (Recommended for simplicity)

```
[PTZ Cameras] → RTSP → [MediaMTX on their server] → WebRTC → [Your Dashboard]
```

- Install MediaMTX (single binary, ~10MB) on a PC at their site
- MediaMTX ingests RTSP and re-publishes as WebRTC
- Open one port (e.g., 8889) on their router
- Dashboard connects directly via WebRTC (sub-second latency)
- **Pros:** Low latency, simple, free, no cloud costs
- **Cons:** Requires static IP or DDNS, port forwarding

### Option B: Cloud relay (Best for remote/zero-config)

```
[PTZ Cameras] → RTSP → [Cloud Media Server] ← WebRTC ← [Your Dashboard]
```

- Use a cloud service (AWS Kinesis Video Streams, Ant Media Cloud, or self-hosted MediaMTX on a VPS)
- Cameras push RTSP to the cloud server
- Dashboard pulls WebRTC from the cloud
- **Pros:** No port forwarding needed at camera site, works from anywhere
- **Cons:** Monthly cloud costs (~$50-150/mo), slight added latency

### Option C: VPN/Tailscale (Best for security)

```
[PTZ Cameras] → RTSP → [Tailscale mesh] → RTSP → [MediaMTX in app] → WebRTC → [Dashboard]
```

- Install Tailscale on a PC at camera site and on viewer's machine
- Creates encrypted tunnel, cameras stay fully private
- **Pros:** Most secure, no exposed ports
- **Cons:** Requires Tailscale install on both ends, adds complexity

---

## PTZ Auto-Tracking (Phase 2)

### How it works:

1. Dashboard receives drone GPS position in real-time (already working via WebSocket)
2. Knowing camera's fixed GPS position and mounting angle, calculate:
   - **Pan angle** = bearing from camera to drone (using Haversine formula)
   - **Tilt angle** = elevation angle based on distance and drone altitude
   - **Zoom level** = based on distance (closer = zoom in)
3. Send ONVIF `AbsoluteMove` commands to the PTZ camera

### What's needed from the company for this:
- ONVIF port and credentials (often port 80 or 8080)
- Camera's pan/tilt range limits (e.g., 360 pan, -5 to +90 tilt)
- Camera's zoom range (e.g., 1x to 30x optical)

---

## Integration in the App

### Existing infrastructure:
- `frontend/src/components/VideoFeedPanel.tsx` - Already has a skeleton video component
- `electron/src/server/websocket.ts` - Real-time data pipeline already in place
- `electron/src/core/state.ts` - Can be extended with camera state

### New components needed:
1. **Backend:** `electron/src/server/routes/camera.ts` - API endpoints for PTZ control and stream URLs
2. **Backend:** `electron/src/core/camera-controller.ts` - ONVIF client for PTZ commands
3. **Frontend:** Expand `VideoFeedPanel.tsx` with WebRTC player and PTZ joystick controls
4. **Frontend:** Auto-track toggle that calculates and sends PTZ commands based on selected drone position

---

## Recommended First Steps

1. **Ask the company for:** Camera make/model, RTSP URL format, ONVIF credentials, and their public IP
2. **Test connectivity:** Try accessing their RTSP stream from your network (VLC can test this)
3. **Choose relay method:** Based on their IT capabilities (Option A if they can port-forward, Option B if not)
4. **Implement basic stream:** Get WebRTC video playing in the dashboard
5. **Add PTZ controls:** Manual pan/tilt/zoom buttons
6. **Add auto-track:** Calculate angles from drone GPS to camera position
