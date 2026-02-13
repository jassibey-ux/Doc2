# 🎬 Replay System - Quick Start Guide

## 🚀 Getting Started (30 seconds)

1. **Open Dashboard**: `http://127.0.0.1:8080`
2. **Click "Replay"** in the sidebar (play icon ▶️)
3. **Click a session card** to load historical data
4. **Click "Play"** to start playback

That's it! You're now watching historical flight data replay.

## 🎮 Keyboard Shortcuts (Recommended)

While these aren't implemented yet, here's what users would expect:

- `Space` - Play/Pause
- `← / →` - Skip backward/forward 1 second
- `Shift + ← / →` - Skip 10 frames
- `[ / ]` - Decrease/increase speed
- `Home` - Jump to start
- `End` - Jump to end
- `Esc` - Stop replay

## 🎯 Common Use Cases

### Post-Flight Analysis
**Goal**: Review a completed test flight

1. Click "Replay" tab
2. Select session (e.g., "event_2024_01")
3. Click "Play" and observe full flight path
4. Use speed selector to watch at 5x speed
5. Pause at interesting moments
6. Use frame skip to examine specific maneuvers

### Finding Anomalies
**Goal**: Locate when GPS signal was lost

1. Load replay session
2. Set speed to 5x or 10x for quick scan
3. Watch HDOP values in telemetry table
4. When HDOP spikes, pause immediately
5. Use "-10 Frames" button to rewind
6. Switch to 0.5x speed for detailed analysis

### Training Operators
**Goal**: Show trainees what good/bad flight looks like

1. Load session with known issues
2. Play at normal speed (1x)
3. Pause at critical moments
4. Point out telemetry values (altitude, speed, RSSI)
5. Use timeline scrubber to jump between examples
6. Compare multiple tracker behaviors side-by-side

### Documenting Issues
**Goal**: Record exact frame of problem for report

1. Load replay session
2. Play until issue occurs
3. Pause playback
4. Note the current time (shown above scrubber)
5. Note the frame number (e.g., "Frame 47 / 120")
6. Take screenshot (Cmd+Shift+4 on Mac)
7. Include in incident report

## 📊 Understanding the UI

### Session Cards

```
┌─────────────────────────────┐
│ event_2024_01          ▶️   │  ← Session name + icon
├─────────────────────────────┤
│ Duration:    2m 0s          │  ← Total length
│ UAS Count:   3              │  ← Number of trackers
│ Records:     11             │  ← Data points
│ Size:        0.9 KB         │  ← File size
│ 1/15/24, 2:30:00 PM        │  ← Start timestamp
└─────────────────────────────┘
```

### Playback Controls

```
Current Time    Frame Counter       Total Time
00:14:30        Frame 29 / 240      00:32:00
    ↓               ↓                   ↓
━━━━━━━━●━━━━━━━━━━━━━━━━━━━━━━━━  ← Timeline scrubber
████████                              ← Progress bar

[  ▶️ Play  ] [Speed: 1x ▼] [-10] [+10]
    ↓            ↓           ↓     ↓
  Toggle      Speed      Frame   Frame
Play/Pause   Selector    Skip    Skip
```

### Status Indicators

- **Orange highlight** on "Replay" button = Replay mode active
- **Loading sessions...** = Scanning for historical data
- **No Sessions Found** = Check log folder path
- **Session loaded** = Playback controls appear

## ⚙️ Tips & Tricks

### Optimal Viewing
- Use **5x speed** for initial scan
- Switch to **1x or 0.5x** for detailed analysis
- Use **frame skip** for precise navigation
- **Pause before seeking** for smooth experience

### Performance
- Smaller sessions load faster
- First load may take a moment (parsing CSV)
- Subsequent loads are cached
- Close other tabs if playback is choppy

### Data Quality
- "Stale" indicators are normal for old data
- Check HDOP < 2.0 for good GPS accuracy
- Watch for RSSI > -90 for good signal
- Altitude should be smooth, not jumpy

## 🔍 Troubleshooting

| Problem | Solution |
|---------|----------|
| Replay button grayed out | Hard refresh browser (Cmd+Shift+R) |
| No sessions appear | Check `examples/` folder has subdirectories with CSV files |
| Play doesn't work | Open browser console (F12), check for errors |
| Playback is choppy | Lower speed to 1x, close other apps |
| Can't seek/pause | Refresh page, reload session |

## 📞 Need Help?

1. **Check logs**: `tail -f /tmp/claude/-Users-scensus/tasks/*.output`
2. **API health**: `curl http://127.0.0.1:8080/api/health`
3. **Session list**: `curl http://127.0.0.1:8080/api/replay/sessions`
4. **Browser console**: F12 → Console tab (check for red errors)

## 🎓 Learning Resources

- [Full Feature Documentation](REPLAY_FEATURE_COMPLETE.md)
- [Technical Design](REPLAY_SYSTEM_DESIGN.md)
- [Architecture Explanation](REPLAY_FEATURE_COMPLETE.md#-architecture)

---

**Ready to go?** Open the dashboard and click "Replay"! 🚀
