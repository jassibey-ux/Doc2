# 3D Model Credits

This directory contains glTF/GLB 3D models for the SCENSUS UAS Dashboard.

Procedural models are generated using Three.js (`frontend/scripts/generate-models.mjs`) with
PBR metallic-roughness materials (2,000–4,000 triangles each). Any model can be replaced with
a higher-fidelity sourced GLB (e.g. from Sketchfab CC-BY) by dropping a file with the same
name. Use `npm run optimize-models` to compress sourced models before deployment.

## Drone Models (`./drones/`)
- `quadcopter_generic.glb` — Generic quadcopter (manually sourced)
- `quadcopter_phantom.glb` — DJI Phantom-style (wider body + camera gimbal)
- `fpv.glb` — FPV racing drone (compact low-profile frame)
- `fixed_wing.glb` — Fixed wing UAV (fuselage + swept wings + V-tail)
- `hexacopter.glb` — Hexacopter (6 arms + landing gear)
- `vtol.glb` — VTOL drone (fuselage + fixed wings + 4 tilt-rotors + V-tail)
- `octocopter.glb` — Octocopter (8 arms + coaxial rotors + large landing gear)

## CUAS Models (`./cuas/`)
- `jammer.glb` — RF jammer (tower + cone antenna + radiating fins)
- `rf_sensor.glb` — RF sensor (box base + rod + sphere head)
- `radar.glb` — Radar (tripod + parabolic dish + feed horn)
- `eo_ir_camera.glb` — EO/IR camera (tripod + housing + lens)
- `acoustic.glb` — Acoustic sensor (pole + ring array of spheres)
- `combined.glb` — Combined multi-sensor system (tower + dish + camera + antenna)

## Vehicle Models (`./vehicles/`)
- `suv_response.glb` — Security/response SUV (boxy body + roof light bar)
- `pickup_truck.glb` — Field operations pickup (cab + open bed)
- `van_command.glb` — Mobile command post van (box van + antenna mast)
- `sedan_patrol.glb` — Patrol sedan (sedan body + roof lights)

## Equipment Models (`./equipment/`)
- `ground_station.glb` — Ground control station (table + laptop + antenna)
- `antenna_tower.glb` — Communications relay tower (lattice + antenna arrays)
- `generator.glb` — Power supply generator (box body + exhaust)
- `barrier.glb` — Jersey barrier (tapered block + white stripe)

## Thumbnails (`./thumbnails/{category}/`)
Each model has two PNG thumbnails:
- `{model_id}_top.png` — Top-down view (for 2D map markers)
- `{model_id}_profile.png` — 3/4 angle view (for profile panels)

## Manually Sourced Models (CC-BY Attribution)

When replacing a procedural model with a sourced one (e.g. from Sketchfab), add attribution
below in the following format:

| File | Source | Author | License |
|------|--------|--------|---------|
| `example.glb` | [Model Name](https://sketchfab.com/...) | Author Name | CC-BY 4.0 |

## Regenerating Models
```bash
cd frontend
node scripts/generate-models.mjs
```

## Optimizing Sourced Models
```bash
# Place raw GLBs in frontend/raw-models/
cp ~/Downloads/my-drone.glb frontend/raw-models/quadcopter_phantom.glb
cd frontend
npm run optimize-models
```
