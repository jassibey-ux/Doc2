# 3D Model Credits

This directory contains glTF/GLB 3D models for the SCENSUS UAS Dashboard.

## Drone Models (place in ./drones/)
- `quadcopter_generic.glb` — Generic quadcopter
- `quadcopter_phantom.glb` — DJI Phantom-style
- `fpv.glb` — FPV racing drone
- `fixed_wing.glb` — Fixed wing UAV
- `hexacopter.glb` — Hexacopter

## CUAS Models (place in ./cuas/)
- `jammer.glb` — RF jammer unit
- `rf_sensor.glb` — RF detection sensor
- `radar.glb` — Radar system
- `eo_ir_camera.glb` — EO/IR camera
- `acoustic.glb` — Acoustic sensor
- `combined.glb` — Combined multi-sensor system

## Thumbnails (place in ./thumbnails/drones/ and ./thumbnails/cuas/)
Each model needs two PNG thumbnails:
- `{model_id}_top.png` — Top-down view (for 2D map markers)
- `{model_id}_profile.png` — 3/4 angle view (for profile panels)

## Recommended Sources
- Sketchfab (CC-BY licensed models)
- TurboSquid (free section)
- Poly Haven

Models must be downloaded manually. The application will gracefully fall back to SVG icons when GLB files are not present.
