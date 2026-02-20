#!/usr/bin/env node
/**
 * generate-models.mjs — Procedural GLB + thumbnail generator for SCENSUS 3D models.
 *
 * Uses Three.js with PBR metallic-roughness materials (MeshStandardMaterial)
 * to build detailed procedural GLB models. Target: 2,000–4,000 triangles per drone.
 *
 * Run: node scripts/generate-models.mjs
 *
 * Output:
 *   public/models/drones/*.glb        (7 drone models)
 *   public/models/cuas/*.glb          (6 CUAS equipment models)
 *   public/models/vehicles/*.glb      (4 vehicle models)
 *   public/models/equipment/*.glb     (4 equipment models)
 *   public/models/thumbnails/{category}/*.png (placeholder PNGs)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Blob as NodeBlob } from 'node:buffer';

// Polyfill browser APIs needed by Three.js GLTFExporter in Node.js
if (typeof globalThis.Blob === 'undefined') {
  globalThis.Blob = NodeBlob;
}
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    constructor() {
      this.result = null;
      this.onloadend = null;
    }
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buf) => {
        this.result = buf;
        if (this.onloadend) this.onloadend();
      });
    }
    readAsDataURL(blob) {
      blob.arrayBuffer().then((buf) => {
        const b64 = Buffer.from(buf).toString('base64');
        const type = blob.type || 'application/octet-stream';
        this.result = `data:${type};base64,${b64}`;
        if (this.onloadend) this.onloadend();
      });
    }
  };
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElementNS(ns, tag) {
      if (tag === 'canvas') {
        return {
          getContext() { return null; },
          width: 1,
          height: 1,
          style: {},
        };
      }
      return {};
    },
  };
}

import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(__dirname, '..', 'public');

// ─── PBR Material Helpers ────────────────────────────────────────────────────

function hexToRGB(hex) {
  const c = parseInt(hex.replace('#', ''), 16);
  return new THREE.Color((c >> 16) / 255, ((c >> 8) & 0xff) / 255, (c & 0xff) / 255);
}

/** PBR carbon fiber / matte plastic body (dark, slightly rough) */
function matBody(hex) {
  return new THREE.MeshStandardMaterial({
    color: hexToRGB(hex),
    metalness: 0.1,
    roughness: 0.7,
  });
}

/** PBR metallic surface (motors, arms, structural) */
function matMetal(hex) {
  return new THREE.MeshStandardMaterial({
    color: hexToRGB(hex),
    metalness: 0.8,
    roughness: 0.35,
  });
}

/** PBR glossy plastic / painted surface */
function matPlastic(hex) {
  return new THREE.MeshStandardMaterial({
    color: hexToRGB(hex),
    metalness: 0.0,
    roughness: 0.4,
  });
}

/** PBR emissive LED accent */
function matLED(hex) {
  return new THREE.MeshStandardMaterial({
    color: hexToRGB(hex),
    emissive: hexToRGB(hex),
    emissiveIntensity: 0.6,
    metalness: 0.0,
    roughness: 0.3,
  });
}

/** PBR glass / lens */
function matGlass(hex) {
  return new THREE.MeshStandardMaterial({
    color: hexToRGB(hex),
    metalness: 0.1,
    roughness: 0.1,
  });
}

/** PBR rubber / tire */
function matRubber(hex) {
  return new THREE.MeshStandardMaterial({
    color: hexToRGB(hex),
    metalness: 0.0,
    roughness: 0.9,
  });
}

/** Scene wrapper */
function groupToScene(group) {
  const scene = new THREE.Scene();
  scene.add(group);
  return scene;
}

/** Export a Three.js scene to GLB buffer */
async function exportGLB(scene) {
  const exporter = new GLTFExporter();
  return new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => resolve(Buffer.from(result)),
      (error) => reject(error),
      { binary: true },
    );
  });
}

/** Write GLB to disk */
async function writeModel(category, id, scene) {
  const dir = path.join(PUBLIC, 'models', category);
  fs.mkdirSync(dir, { recursive: true });
  const buf = await exportGLB(scene);
  const filePath = path.join(dir, `${id}.glb`);
  fs.writeFileSync(filePath, buf);
  const kb = (buf.length / 1024).toFixed(1);
  console.log(`  ✓ ${category}/${id}.glb (${kb} KB)`);
}

// ─── Shared Drone Geometry Helpers ───────────────────────────────────────────

/** Build a rotor blade pair (flat disc with cutouts simulated as thin torus) */
function buildRotorDisc(radius, segments = 16) {
  const group = new THREE.Group();
  // Thin disc representing spinning rotor
  const discGeo = new THREE.CylinderGeometry(radius, radius, 0.005, segments);
  const disc = new THREE.Mesh(discGeo, matPlastic('#9ca3af'));
  disc.material.transparent = true;
  disc.material.opacity = 0.4;
  group.add(disc);
  // Blade pair (two thin boxes crossing)
  for (let i = 0; i < 2; i++) {
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(radius * 1.8, 0.008, 0.025),
      matBody('#4b5563'),
    );
    blade.rotation.y = i * (Math.PI / 2);
    group.add(blade);
  }
  return group;
}

/** Build a motor housing (cylinder + top cap) */
function buildMotorHousing(radius = 0.06, height = 0.05) {
  const group = new THREE.Group();
  // Motor body
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 0.9, height, 16),
    matMetal('#6b7280'),
  );
  group.add(body);
  // Motor top cap (slightly larger)
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.5, radius * 0.5, 0.01, 12),
    matMetal('#374151'),
  );
  cap.position.y = height / 2 + 0.005;
  group.add(cap);
  return group;
}

/** Build a camera gimbal assembly */
function buildCameraGimbal() {
  const group = new THREE.Group();
  // Gimbal mount bracket
  const bracket = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.03, 0.05),
    matMetal('#6b7280'),
  );
  group.add(bracket);
  // Camera housing
  const housing = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.04, 0.07),
    matBody('#1f2937'),
  );
  housing.position.set(0, -0.035, 0.01);
  group.add(housing);
  // Lens (cylinder)
  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.022, 0.03, 12),
    matGlass('#111827'),
  );
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, -0.035, 0.055);
  group.add(lens);
  // Lens ring
  const lensRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.02, 0.003, 8, 16),
    matMetal('#374151'),
  );
  lensRing.rotation.x = Math.PI / 2;
  lensRing.position.set(0, -0.035, 0.055);
  group.add(lensRing);
  return group;
}

/** Build antenna stub */
function buildAntennaStub(height = 0.08) {
  const group = new THREE.Group();
  const rod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.005, 0.005, height, 6),
    matMetal('#9ca3af'),
  );
  rod.position.y = height / 2;
  group.add(rod);
  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(0.008, 6, 4),
    matBody('#374151'),
  );
  tip.position.y = height;
  group.add(tip);
  return group;
}

// ─── Drone Builders ──────────────────────────────────────────────────────────

function buildQuadcopterPhantom() {
  const group = new THREE.Group();

  // Body — rounded box with beveled edges
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.15, 0.5, 2, 1, 2),
    matBody('#e5e7eb'),
  );
  group.add(body);

  // Top shell detail (slightly raised center plate)
  const topShell = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.02, 0.35),
    matBody('#d1d5db'),
  );
  topShell.position.y = 0.085;
  group.add(topShell);

  // Battery indicator LEDs on front
  for (let i = 0; i < 4; i++) {
    const led = new THREE.Mesh(
      new THREE.BoxGeometry(0.015, 0.01, 0.008),
      matLED('#22c55e'),
    );
    led.position.set(-0.03 + i * 0.02, 0.076, 0.245);
    group.add(led);
  }

  // 4 arms + motors + rotors
  for (let i = 0; i < 4; i++) {
    const angle = (Math.PI / 4) + (i * Math.PI / 2);
    const armLen = 0.5;
    const endX = Math.cos(angle) * 0.45;
    const endZ = Math.sin(angle) * 0.45;

    // Arm (tapered cylinder)
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.035, armLen, 10),
      matBody('#9ca3af'),
    );
    arm.rotation.z = Math.PI / 2;
    arm.rotation.y = angle;
    arm.position.set(Math.cos(angle) * 0.22, 0.01, Math.sin(angle) * 0.22);
    group.add(arm);

    // Motor housing
    const motor = buildMotorHousing(0.06, 0.05);
    motor.position.set(endX, 0.04, endZ);
    group.add(motor);

    // Rotor blades
    const rotor = buildRotorDisc(0.12, 16);
    rotor.position.set(endX, 0.075, endZ);
    group.add(rotor);

    // LED accent under each arm (front=green, rear=red)
    const ledColor = i < 2 ? '#22c55e' : '#ef4444';
    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.008, 6, 4),
      matLED(ledColor),
    );
    led.position.set(endX, -0.01, endZ);
    group.add(led);
  }

  // Camera gimbal
  const gimbal = buildCameraGimbal();
  gimbal.position.set(0, -0.1, 0.12);
  group.add(gimbal);

  // Landing gear (T-shaped legs)
  for (const side of [-1, 1]) {
    // Vertical strut
    const strut = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.18, 8),
      matBody('#6b7280'),
    );
    strut.position.set(side * 0.18, -0.16, 0);
    group.add(strut);
    // Horizontal foot
    const foot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.25, 8),
      matBody('#6b7280'),
    );
    foot.rotation.x = Math.PI / 2;
    foot.position.set(side * 0.18, -0.25, 0);
    group.add(foot);
    // Rubber foot pads
    for (const z of [-0.1, 0.1]) {
      const pad = new THREE.Mesh(
        new THREE.SphereGeometry(0.012, 6, 4),
        matRubber('#374151'),
      );
      pad.position.set(side * 0.18, -0.26, z);
      group.add(pad);
    }
  }

  // GPS module on top
  const gps = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.015, 12),
    matBody('#374151'),
  );
  gps.position.set(0, 0.1, -0.05);
  group.add(gps);

  // Antenna stubs (2)
  const ant1 = buildAntennaStub(0.06);
  ant1.position.set(0.08, 0.076, -0.2);
  group.add(ant1);
  const ant2 = buildAntennaStub(0.06);
  ant2.position.set(-0.08, 0.076, -0.2);
  group.add(ant2);

  return groupToScene(group);
}

function buildFPV() {
  const group = new THREE.Group();

  // Compact low-profile X-frame (carbon fiber look)
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.04, 0.3),
    matBody('#1f2937'),
  );
  group.add(frame);

  // Top plate
  const topPlate = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.015, 0.22),
    matBody('#374151'),
  );
  topPlate.position.y = 0.035;
  group.add(topPlate);

  // Standoffs between plates
  for (const [x, z] of [[-0.08, -0.08], [0.08, -0.08], [-0.08, 0.08], [0.08, 0.08]]) {
    const standoff = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.006, 0.03, 6),
      matMetal('#9ca3af'),
    );
    standoff.position.set(x, 0.035, z);
    group.add(standoff);
  }

  // 4 arms + motors + rotors
  for (let i = 0; i < 4; i++) {
    const angle = (Math.PI / 4) + (i * Math.PI / 2);
    const endX = Math.cos(angle) * 0.32;
    const endZ = Math.sin(angle) * 0.32;

    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.02, 0.35),
      matBody('#1f2937'),
    );
    arm.rotation.y = angle;
    arm.position.set(Math.cos(angle) * 0.15, 0, Math.sin(angle) * 0.15);
    group.add(arm);

    // Motor
    const motor = buildMotorHousing(0.05, 0.04);
    motor.position.set(endX, 0.03, endZ);
    group.add(motor);

    // Rotor
    const rotor = buildRotorDisc(0.1, 12);
    rotor.position.set(endX, 0.06, endZ);
    group.add(rotor);
  }

  // Battery strap on top (neon colored for visibility)
  const battery = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.035, 0.18),
    matPlastic('#374151'),
  );
  battery.position.y = 0.06;
  group.add(battery);

  // Battery strap
  const strap = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.005, 0.015),
    matPlastic('#dc2626'),
  );
  strap.position.set(0, 0.08, 0);
  group.add(strap);

  // FPV camera (front-mounted, tilted up)
  const fpvCam = new THREE.Mesh(
    new THREE.BoxGeometry(0.025, 0.025, 0.02),
    matBody('#1f2937'),
  );
  fpvCam.position.set(0, 0.02, 0.16);
  fpvCam.rotation.x = -0.5;
  group.add(fpvCam);
  const fpvLens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.01, 0.01, 8),
    matGlass('#111827'),
  );
  fpvLens.rotation.x = Math.PI / 2 - 0.5;
  fpvLens.position.set(0, 0.02, 0.175);
  group.add(fpvLens);

  // VTX antenna (back)
  const vtxAnt = buildAntennaStub(0.07);
  vtxAnt.position.set(0, 0.043, -0.13);
  vtxAnt.rotation.x = -0.3;
  group.add(vtxAnt);

  // Rear LED strip
  const rearLed = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.006, 0.006),
    matLED('#dc2626'),
  );
  rearLed.position.set(0, 0, -0.15);
  group.add(rearLed);

  return groupToScene(group);
}

function buildFixedWing() {
  const group = new THREE.Group();

  // Fuselage (tapered cylinder)
  const fuselage = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.05, 1.0, 16),
    matBody('#e5e7eb'),
  );
  fuselage.rotation.x = Math.PI / 2;
  group.add(fuselage);

  // Fuselage belly (slightly flattened)
  const belly = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.06, 0.9),
    matBody('#d1d5db'),
  );
  belly.position.y = -0.03;
  group.add(belly);

  // Main wings (tapered, swept)
  const wingGeo = new THREE.BoxGeometry(1.6, 0.018, 0.28, 4, 1, 2);
  const wing = new THREE.Mesh(wingGeo, matBody('#94a3b8'));
  wing.position.set(0, 0.01, -0.02);
  group.add(wing);

  // Wing tips (angled up — winglets)
  for (const side of [-1, 1]) {
    const winglet = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.08, 0.08),
      matBody('#94a3b8'),
    );
    winglet.position.set(side * 0.8, 0.05, -0.02);
    winglet.rotation.z = side * 0.2;
    group.add(winglet);
  }

  // V-tail fins
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.018, 0.1),
      matBody('#94a3b8'),
    );
    fin.position.set(side * 0.1, 0.06, -0.45);
    fin.rotation.z = side * 0.5;
    group.add(fin);
  }

  // Nose cone
  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.07, 0.18, 16),
    matPlastic('#6b7280'),
  );
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = 0.58;
  group.add(nose);

  // Pusher propeller (rear)
  const prop = buildRotorDisc(0.08, 12);
  prop.position.set(0, 0, -0.52);
  prop.rotation.x = Math.PI / 2;
  group.add(prop);

  // Camera pod (underside)
  const cameraPod = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 12, 8),
    matBody('#1f2937'),
  );
  cameraPod.position.set(0, -0.06, 0.15);
  group.add(cameraPod);
  const cameraLens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.018, 0.015, 8),
    matGlass('#111827'),
  );
  cameraLens.position.set(0, -0.09, 0.15);
  group.add(cameraLens);

  // GPS antenna (top)
  const gps = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.012, 10),
    matBody('#374151'),
  );
  gps.position.set(0, 0.075, 0.05);
  group.add(gps);

  // Navigation LEDs
  for (const side of [-1, 1]) {
    const navLed = new THREE.Mesh(
      new THREE.SphereGeometry(0.006, 6, 4),
      matLED(side < 0 ? '#ef4444' : '#22c55e'),
    );
    navLed.position.set(side * 0.78, 0.02, -0.02);
    group.add(navLed);
  }

  return groupToScene(group);
}

function buildHexacopter() {
  const group = new THREE.Group();

  // Large center body (hex-ish plate)
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.25, 0.08, 6),
    matBody('#374151'),
  );
  group.add(body);

  // Top cover plate
  const topCover = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.2, 0.02, 6),
    matBody('#4b5563'),
  );
  topCover.position.y = 0.05;
  group.add(topCover);

  // 6 arms + motors + rotors
  for (let i = 0; i < 6; i++) {
    const angle = i * (Math.PI / 3);
    const endX = Math.cos(angle) * 0.52;
    const endZ = Math.sin(angle) * 0.52;

    // Arm (carbon fiber tube)
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.028, 0.52, 10),
      matBody('#6b7280'),
    );
    arm.rotation.z = Math.PI / 2;
    arm.rotation.y = angle;
    arm.position.set(Math.cos(angle) * 0.26, 0, Math.sin(angle) * 0.26);
    group.add(arm);

    // Motor housing
    const motor = buildMotorHousing(0.065, 0.05);
    motor.position.set(endX, 0.04, endZ);
    group.add(motor);

    // Rotor
    const rotor = buildRotorDisc(0.14, 16);
    rotor.position.set(endX, 0.075, endZ);
    group.add(rotor);

    // Arm LED
    const ledColor = i < 3 ? '#22c55e' : '#ef4444';
    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.008, 6, 4),
      matLED(ledColor),
    );
    led.position.set(Math.cos(angle) * 0.4, -0.02, Math.sin(angle) * 0.4);
    group.add(led);
  }

  // Landing gear (4 legs with cross-bar)
  for (let i = 0; i < 4; i++) {
    const angle = (Math.PI / 4) + (i * Math.PI / 2);
    // Vertical leg
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.22, 8),
      matBody('#9ca3af'),
    );
    leg.position.set(Math.cos(angle) * 0.22, -0.15, Math.sin(angle) * 0.22);
    group.add(leg);
    // Horizontal foot
    const foot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.15, 6),
      matRubber('#374151'),
    );
    foot.rotation.x = Math.PI / 2;
    foot.position.set(Math.cos(angle) * 0.22, -0.26, Math.sin(angle) * 0.22);
    group.add(foot);
  }
  // Cross-bar between gear
  const crossBar = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.012, 0.012),
    matBody('#9ca3af'),
  );
  crossBar.position.y = -0.26;
  group.add(crossBar);

  // Bottom payload mount / gimbal
  const gimbal = buildCameraGimbal();
  gimbal.position.set(0, -0.06, 0);
  group.add(gimbal);

  // GPS module
  const gps = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.015, 12),
    matBody('#1f2937'),
  );
  gps.position.set(0, 0.07, 0);
  group.add(gps);

  // Antenna stubs
  const ant1 = buildAntennaStub(0.08);
  ant1.position.set(0.1, 0.06, -0.15);
  group.add(ant1);
  const ant2 = buildAntennaStub(0.08);
  ant2.position.set(-0.1, 0.06, -0.15);
  group.add(ant2);

  return groupToScene(group);
}

function buildVTOL() {
  const group = new THREE.Group();

  // Fuselage (elongated body)
  const fuselage = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.07, 1.1, 16),
    matBody('#e5e7eb'),
  );
  fuselage.rotation.x = Math.PI / 2;
  group.add(fuselage);

  // Fuselage belly fairing
  const belly = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.07, 1.0),
    matBody('#d1d5db'),
  );
  belly.position.y = -0.03;
  group.add(belly);

  // Fixed wings (high aspect ratio)
  const wing = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.015, 0.25, 4, 1, 2),
    matBody('#94a3b8'),
  );
  wing.position.set(0, 0.02, 0.0);
  group.add(wing);

  // Wing root fairings
  for (const side of [-1, 1]) {
    const fairing = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.04, 0.2),
      matBody('#d1d5db'),
    );
    fairing.position.set(side * 0.12, 0.02, 0.0);
    group.add(fairing);
  }

  // 4 tilt-rotors (2 on each wing)
  const rotorPositions = [
    { x: -0.6, z: 0.0 }, { x: 0.6, z: 0.0 },   // mid-wing
    { x: -0.35, z: 0.0 }, { x: 0.35, z: 0.0 },  // inner wing
  ];
  for (let i = 0; i < 4; i++) {
    const rp = rotorPositions[i];
    // Tilt nacelle
    const nacelle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.035, 0.1, 12),
      matMetal('#6b7280'),
    );
    nacelle.position.set(rp.x, 0.06, rp.z);
    group.add(nacelle);

    // Motor housing on nacelle
    const motor = buildMotorHousing(0.05, 0.04);
    motor.position.set(rp.x, 0.12, rp.z);
    group.add(motor);

    // Rotor
    const rotor = buildRotorDisc(0.12, 14);
    rotor.position.set(rp.x, 0.15, rp.z);
    group.add(rotor);

    // Tilt pivot (small sphere joint)
    const pivot = new THREE.Mesh(
      new THREE.SphereGeometry(0.015, 8, 6),
      matMetal('#374151'),
    );
    pivot.position.set(rp.x, 0.04, rp.z);
    group.add(pivot);
  }

  // V-tail (dual angled fins)
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.015, 0.1),
      matBody('#94a3b8'),
    );
    fin.position.set(side * 0.08, 0.07, -0.5);
    fin.rotation.z = side * 0.55;
    group.add(fin);
  }

  // Nose cone
  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.09, 0.2, 16),
    matPlastic('#6b7280'),
  );
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = 0.65;
  group.add(nose);

  // Camera pod (underside, forward)
  const cameraPod = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 12, 8),
    matBody('#1f2937'),
  );
  cameraPod.position.set(0, -0.07, 0.2);
  group.add(cameraPod);
  const cameraLens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.022, 0.018, 8),
    matGlass('#111827'),
  );
  cameraLens.position.set(0, -0.1, 0.2);
  group.add(cameraLens);

  // GPS antenna
  const gps = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.028, 0.012, 10),
    matBody('#374151'),
  );
  gps.position.set(0, 0.095, 0.05);
  group.add(gps);

  // Navigation LEDs on wingtips
  for (const side of [-1, 1]) {
    const navLed = new THREE.Mesh(
      new THREE.SphereGeometry(0.007, 6, 4),
      matLED(side < 0 ? '#ef4444' : '#22c55e'),
    );
    navLed.position.set(side * 0.9, 0.025, 0.0);
    group.add(navLed);
  }

  // Tail strobe LED
  const strobeLed = new THREE.Mesh(
    new THREE.SphereGeometry(0.006, 6, 4),
    matLED('#ffffff'),
  );
  strobeLed.position.set(0, 0.02, -0.55);
  group.add(strobeLed);

  // Antenna stubs
  const ant1 = buildAntennaStub(0.07);
  ant1.position.set(0.06, 0.075, -0.25);
  group.add(ant1);

  return groupToScene(group);
}

function buildOctocopter() {
  const group = new THREE.Group();

  // Large center hub (octagonal)
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.1, 8),
    matBody('#374151'),
  );
  group.add(hub);

  // Top cover
  const topCover = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.25, 0.025, 8),
    matBody('#4b5563'),
  );
  topCover.position.y = 0.063;
  group.add(topCover);

  // Bottom plate
  const bottomPlate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 0.015, 8),
    matBody('#1f2937'),
  );
  bottomPlate.position.y = -0.058;
  group.add(bottomPlate);

  // 8 arms + motors + coaxial rotors
  for (let i = 0; i < 8; i++) {
    const angle = i * (Math.PI / 4);
    const armLen = 0.5;
    const endX = Math.cos(angle) * 0.55;
    const endZ = Math.sin(angle) * 0.55;

    // Arm (carbon fiber tube, tapered)
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.028, armLen, 10),
      matBody('#6b7280'),
    );
    arm.rotation.z = Math.PI / 2;
    arm.rotation.y = angle;
    arm.position.set(Math.cos(angle) * 0.28, 0, Math.sin(angle) * 0.28);
    group.add(arm);

    // Motor housing (coaxial — taller)
    const motor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.055, 0.08, 16),
      matMetal('#6b7280'),
    );
    motor.position.set(endX, 0.05, endZ);
    group.add(motor);

    // Motor cap
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.012, 12),
      matMetal('#374151'),
    );
    cap.position.set(endX, 0.096, endZ);
    group.add(cap);

    // Upper rotor
    const upperRotor = buildRotorDisc(0.13, 14);
    upperRotor.position.set(endX, 0.11, endZ);
    group.add(upperRotor);

    // Lower rotor (offset slightly)
    const lowerRotor = buildRotorDisc(0.13, 14);
    lowerRotor.position.set(endX, 0.02, endZ);
    lowerRotor.rotation.y = Math.PI / 4; // offset from upper
    group.add(lowerRotor);

    // Arm LED accent
    const ledColor = i < 4 ? '#22c55e' : '#ef4444';
    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.008, 6, 4),
      matLED(ledColor),
    );
    led.position.set(Math.cos(angle) * 0.42, -0.02, Math.sin(angle) * 0.42);
    group.add(led);
  }

  // Large landing gear (tall for gimbal clearance)
  for (let i = 0; i < 4; i++) {
    const angle = (Math.PI / 8) + (i * Math.PI / 2);

    // Vertical strut
    const strut = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.3, 8),
      matBody('#9ca3af'),
    );
    strut.position.set(Math.cos(angle) * 0.28, -0.2, Math.sin(angle) * 0.28);
    group.add(strut);

    // Angled brace
    const brace = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.01, 0.2, 6),
      matBody('#9ca3af'),
    );
    brace.rotation.z = 0.3 * (i % 2 === 0 ? 1 : -1);
    brace.position.set(
      Math.cos(angle) * 0.28,
      -0.12,
      Math.sin(angle) * 0.28,
    );
    group.add(brace);

    // Horizontal foot
    const foot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.01, 0.2, 6),
      matRubber('#374151'),
    );
    foot.rotation.x = Math.PI / 2;
    foot.position.set(Math.cos(angle) * 0.28, -0.35, Math.sin(angle) * 0.28);
    group.add(foot);
  }
  // Cross bars for landing gear
  for (const axis of [0, Math.PI / 2]) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.012, 0.012),
      matBody('#9ca3af'),
    );
    bar.rotation.y = axis;
    bar.position.y = -0.35;
    group.add(bar);
  }

  // Large gimbal mount (heavy-lift camera)
  const gimbalMount = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.04, 0.12),
    matMetal('#6b7280'),
  );
  gimbalMount.position.set(0, -0.08, 0);
  group.add(gimbalMount);

  // Camera housing (larger)
  const cameraHousing = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.07, 0.12),
    matBody('#1f2937'),
  );
  cameraHousing.position.set(0, -0.14, 0);
  group.add(cameraHousing);

  // Camera lens
  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.03, 0.04, 12),
    matGlass('#111827'),
  );
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, -0.14, 0.08);
  group.add(lens);

  // GPS module on top mast
  const gpsMast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, 0.1, 6),
    matMetal('#9ca3af'),
  );
  gpsMast.position.set(0, 0.12, 0);
  group.add(gpsMast);
  const gps = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.015, 12),
    matBody('#1f2937'),
  );
  gps.position.set(0, 0.18, 0);
  group.add(gps);

  // Dual antenna stubs
  const ant1 = buildAntennaStub(0.1);
  ant1.position.set(0.12, 0.063, -0.18);
  group.add(ant1);
  const ant2 = buildAntennaStub(0.1);
  ant2.position.set(-0.12, 0.063, -0.18);
  group.add(ant2);

  return groupToScene(group);
}

// ─── CUAS Builders ───────────────────────────────────────────────────────────

function buildJammer() {
  const group = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.2, 12), matMetal('#6b7280'));
  tower.position.y = 0.6;
  group.add(tower);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.3, 16), matPlastic('#ef4444'));
  cone.position.y = 1.35;
  group.add(cone);
  for (let i = 0; i < 4; i++) {
    const angle = i * (Math.PI / 2);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.015), matPlastic('#ef4444'));
    fin.rotation.y = angle;
    fin.position.set(Math.cos(angle) * 0.12, 0.9, Math.sin(angle) * 0.12);
    group.add(fin);
  }
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 16), matBody('#374151'));
  base.position.y = 0.025;
  group.add(base);
  return groupToScene(group);
}

function buildRFSensor() {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.3), matBody('#374151'));
  base.position.y = 0.1;
  group.add(base);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.8, 10), matMetal('#6b7280'));
  rod.position.y = 0.6;
  group.add(rod);
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), matPlastic('#3b82f6'));
  sphere.position.y = 1.1;
  group.add(sphere);
  for (let i = 0; i < 3; i++) {
    const angle = i * (2 * Math.PI / 3);
    const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.12, 6), matMetal('#3b82f6'));
    stub.rotation.z = Math.PI / 4;
    stub.rotation.y = angle;
    stub.position.set(Math.cos(angle) * 0.08, 1.15, Math.sin(angle) * 0.08);
    group.add(stub);
  }
  return groupToScene(group);
}

function buildRadar() {
  const group = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const angle = i * (2 * Math.PI / 3);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.7, 8), matMetal('#6b7280'));
    leg.position.set(Math.cos(angle) * 0.2, 0.3, Math.sin(angle) * 0.2);
    leg.rotation.z = Math.sin(angle) * 0.15;
    leg.rotation.x = -Math.cos(angle) * 0.15;
    group.add(leg);
  }
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 10), matMetal('#6b7280'));
  post.position.y = 0.75;
  group.add(post);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), matPlastic('#f59e0b'));
  dish.rotation.x = -0.3;
  dish.position.y = 1.0;
  group.add(dish);
  const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.15, 10), matMetal('#374151'));
  horn.rotation.x = -0.3;
  horn.position.set(0, 1.1, 0.15);
  group.add(horn);
  return groupToScene(group);
}

function buildEOIRCamera() {
  const group = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const angle = i * (2 * Math.PI / 3);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.6, 8), matMetal('#6b7280'));
    leg.position.set(Math.cos(angle) * 0.15, 0.25, Math.sin(angle) * 0.15);
    leg.rotation.z = Math.sin(angle) * 0.12;
    leg.rotation.x = -Math.cos(angle) * 0.12;
    group.add(leg);
  }
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.1), matBody('#374151'));
  head.position.y = 0.58;
  group.add(head);
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.15, 0.12), matPlastic('#8b5cf6'));
  housing.position.set(0, 0.65, 0.04);
  group.add(housing);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.08, 14), matGlass('#1f2937'));
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, 0.65, 0.14);
  group.add(lens);
  return groupToScene(group);
}

function buildAcoustic() {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.0, 10), matMetal('#6b7280'));
  pole.position.y = 0.5;
  group.add(pole);
  const ringY = 0.95;
  for (let i = 0; i < 8; i++) {
    const angle = i * (Math.PI / 4);
    const mic = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), matPlastic('#22c55e'));
    mic.position.set(Math.cos(angle) * 0.15, ringY, Math.sin(angle) * 0.15);
    group.add(mic);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 14), matBody('#22c55e'));
  hub.position.y = ringY;
  group.add(hub);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.04, 14), matBody('#374151'));
  base.position.y = 0.02;
  group.add(base);
  return groupToScene(group);
}

function buildCombined() {
  const group = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 2.0, 12), matMetal('#6b7280'));
  tower.position.y = 1.0;
  group.add(tower);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), matPlastic('#ec4899'));
  dish.position.y = 1.8;
  dish.rotation.x = -0.2;
  group.add(dish);
  const camera = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.1), matPlastic('#8b5cf6'));
  camera.position.set(0.12, 1.4, 0);
  group.add(camera);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 8), matMetal('#ec4899'));
  rod.position.y = 2.25;
  group.add(rod);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.06, 16), matBody('#374151'));
  base.position.y = 0.03;
  group.add(base);
  return groupToScene(group);
}

// ─── Vehicle Builders ────────────────────────────────────────────────────────

function buildSUVResponse() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.35, 1.8), matBody('#1e3a5f'));
  body.position.y = 0.35;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 1.0), matBody('#1e3a5f'));
  cabin.position.set(0, 0.65, -0.1);
  group.add(cabin);
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.2, 0.02), matGlass('#93c5fd'));
  windshield.position.set(0, 0.62, 0.39);
  windshield.rotation.x = 0.3;
  group.add(windshield);
  const lightBar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.15), matLED('#fbbf24'));
  lightBar.position.set(0, 0.81, -0.05);
  group.add(lightBar);
  const wheelGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.08, 14);
  const wheelPositions = [[-0.4, 0.12, 0.55], [0.4, 0.12, 0.55], [-0.4, 0.12, -0.55], [0.4, 0.12, -0.55]];
  for (const [x, y, z] of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeo, matRubber('#1f2937'));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    group.add(wheel);
  }
  return groupToScene(group);
}

function buildPickupTruck() {
  const group = new THREE.Group();
  const cab = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.35, 0.8), matBody('#4a5d23'));
  cab.position.set(0, 0.4, 0.5);
  group.add(cab);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.7), matBody('#4a5d23'));
  roof.position.set(0, 0.65, 0.45);
  group.add(roof);
  const bedFloor = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.05, 1.0), matBody('#3d4f1e'));
  bedFloor.position.set(0, 0.27, -0.4);
  group.add(bedFloor);
  for (const x of [-0.37, 0.37]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 1.0), matBody('#4a5d23'));
    side.position.set(x, 0.38, -0.4);
    group.add(side);
  }
  const tailgate = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.2, 0.03), matBody('#4a5d23'));
  tailgate.position.set(0, 0.38, -0.9);
  group.add(tailgate);
  const wheelGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.08, 14);
  const wheelPositions = [[-0.4, 0.12, 0.6], [0.4, 0.12, 0.6], [-0.4, 0.12, -0.5], [0.4, 0.12, -0.5]];
  for (const [x, y, z] of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeo, matRubber('#1f2937'));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    group.add(wheel);
  }
  return groupToScene(group);
}

function buildVanCommand() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.5, 2.2), matBody('#e5e7eb'));
  body.position.y = 0.4;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.5), matBody('#d1d5db'));
  cabin.position.set(0, 0.75, 0.7);
  group.add(cabin);
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.22, 0.02), matGlass('#93c5fd'));
  windshield.position.set(0, 0.72, 0.95);
  windshield.rotation.x = 0.15;
  group.add(windshield);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 8), matMetal('#6b7280'));
  mast.position.set(0, 1.05, -0.3);
  group.add(mast);
  const antennaTop = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.02, 0.1, 10), matMetal('#374151'));
  antennaTop.position.set(0, 1.5, -0.3);
  group.add(antennaTop);
  const wheelGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.08, 14);
  const wheelPositions = [[-0.45, 0.12, 0.65], [0.45, 0.12, 0.65], [-0.45, 0.12, -0.6], [0.45, 0.12, -0.6]];
  for (const [x, y, z] of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeo, matRubber('#374151'));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    group.add(wheel);
  }
  return groupToScene(group);
}

function buildSedanPatrol() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 1.8), matBody('#1f2937'));
  body.position.y = 0.3;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.2, 0.9), matBody('#1f2937'));
  cabin.position.set(0, 0.52, -0.05);
  group.add(cabin);
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.02), matGlass('#93c5fd'));
  windshield.position.set(0, 0.5, 0.38);
  windshield.rotation.x = 0.35;
  group.add(windshield);
  const lightBar = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.05, 0.1), matLED('#3b82f6'));
  lightBar.position.set(0, 0.65, -0.05);
  group.add(lightBar);
  const wheelGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.07, 14);
  const wheelPositions = [[-0.37, 0.1, 0.55], [0.37, 0.1, 0.55], [-0.37, 0.1, -0.55], [0.37, 0.1, -0.55]];
  for (const [x, y, z] of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeo, matRubber('#111827'));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    group.add(wheel);
  }
  return groupToScene(group);
}

// ─── Equipment Builders ──────────────────────────────────────────────────────

function buildGroundStation() {
  const group = new THREE.Group();
  const table = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.4), matMetal('#6b7280'));
  table.position.y = 0.5;
  group.add(table);
  for (const [x, z] of [[-0.25, 0.15], [0.25, 0.15], [-0.25, -0.15], [0.25, -0.15]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 8), matMetal('#9ca3af'));
    leg.position.set(x, 0.25, z);
    group.add(leg);
  }
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.01), matLED('#1e40af'));
  screen.position.set(0, 0.63, -0.05);
  screen.rotation.x = -0.3;
  group.add(screen);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.2), matBody('#374151'));
  base.position.set(0, 0.53, 0.05);
  group.add(base);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.6, 8), matMetal('#9ca3af'));
  mast.position.set(0.25, 0.82, -0.1);
  group.add(mast);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.01, 0.08, 8), matMetal('#6b7280'));
  ant.position.set(0.25, 1.16, -0.1);
  group.add(ant);
  return groupToScene(group);
}

function buildAntennaTower() {
  const group = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.2, 2.5, 4), matMetal('#9ca3af'));
  tower.position.y = 1.25;
  group.add(tower);
  for (let i = 0; i < 4; i++) {
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.02), matMetal('#6b7280'));
    brace.position.y = 0.5 + i * 0.5;
    brace.rotation.y = i * (Math.PI / 4);
    group.add(brace);
  }
  for (const [y, len] of [[2.3, 0.4], [2.45, 0.3]]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(len, 0.03, 0.03), matMetal('#d1d5db'));
    bar.position.y = y;
    group.add(bar);
  }
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), matPlastic('#e5e7eb'));
  dish.position.set(0.12, 2.0, 0);
  dish.rotation.z = -Math.PI / 4;
  group.add(dish);
  return groupToScene(group);
}

function buildGenerator() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.7), matPlastic('#eab308'));
  body.position.y = 0.2;
  group.add(body);
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 10), matMetal('#374151'));
  exhaust.position.set(0.15, 0.47, -0.2);
  group.add(exhaust);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.01), matBody('#1f2937'));
  panel.position.set(0, 0.25, 0.36);
  group.add(panel);
  for (const x of [-0.22, 0.22]) {
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.15), matMetal('#374151'));
    handle.position.set(x, 0.42, 0);
    group.add(handle);
  }
  for (const [x, z] of [[-0.2, 0.25], [0.2, 0.25], [-0.2, -0.25], [0.2, -0.25]]) {
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 10), matRubber('#1f2937'));
    foot.position.set(x, 0.015, z);
    group.add(foot);
  }
  return groupToScene(group);
}

function buildBarrier() {
  const group = new THREE.Group();
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 1.2), matPlastic('#f97316'));
  bottom.position.y = 0.2;
  group.add(bottom);
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.35, 1.2), matPlastic('#f97316'));
  top.position.y = 0.55;
  group.add(top);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.04, 1.21), matPlastic('#ffffff'));
  stripe.position.y = 0.5;
  group.add(stripe);
  return groupToScene(group);
}

// ─── Model Registry ──────────────────────────────────────────────────────────

const ALL_MODELS = [
  // Drones
  { category: 'drones', id: 'quadcopter_phantom', build: buildQuadcopterPhantom },
  { category: 'drones', id: 'fpv', build: buildFPV },
  { category: 'drones', id: 'fixed_wing', build: buildFixedWing },
  { category: 'drones', id: 'hexacopter', build: buildHexacopter },
  { category: 'drones', id: 'vtol', build: buildVTOL },
  { category: 'drones', id: 'octocopter', build: buildOctocopter },
  // CUAS
  { category: 'cuas', id: 'jammer', build: buildJammer },
  { category: 'cuas', id: 'rf_sensor', build: buildRFSensor },
  { category: 'cuas', id: 'radar', build: buildRadar },
  { category: 'cuas', id: 'eo_ir_camera', build: buildEOIRCamera },
  { category: 'cuas', id: 'acoustic', build: buildAcoustic },
  { category: 'cuas', id: 'combined', build: buildCombined },
  // Vehicles
  { category: 'vehicles', id: 'suv_response', build: buildSUVResponse },
  { category: 'vehicles', id: 'pickup_truck', build: buildPickupTruck },
  { category: 'vehicles', id: 'van_command', build: buildVanCommand },
  { category: 'vehicles', id: 'sedan_patrol', build: buildSedanPatrol },
  // Equipment
  { category: 'equipment', id: 'ground_station', build: buildGroundStation },
  { category: 'equipment', id: 'antenna_tower', build: buildAntennaTower },
  { category: 'equipment', id: 'generator', build: buildGenerator },
  { category: 'equipment', id: 'barrier', build: buildBarrier },
];

// ─── Thumbnail Generation ────────────────────────────────────────────────────

/**
 * Thumbnail rendering is skipped in Node.js (no WebGL context).
 * Placeholder PNGs are generated instead — a 1×1 transparent pixel.
 * Replace with real renders via headless-gl or a browser-based script if needed.
 */
function writePlaceholderPNG(filePath) {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB' +
    'Nl7BcQAAAABJRU5ErkJggg==',
    'base64',
  );
  fs.writeFileSync(filePath, png);
}

function writeThumbnails(category, id) {
  const dir = path.join(PUBLIC, 'models', 'thumbnails', category);
  fs.mkdirSync(dir, { recursive: true });

  const topPath = path.join(dir, `${id}_top.png`);
  const profilePath = path.join(dir, `${id}_profile.png`);
  writePlaceholderPNG(topPath);
  writePlaceholderPNG(profilePath);
  console.log(`  ✓ thumbnails/${category}/${id}_top.png + _profile.png (placeholder)`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Generating 3D models for SCENSUS (PBR metallic-roughness)...\n');

  let successCount = 0;
  let errorCount = 0;

  for (const { category, id, build } of ALL_MODELS) {
    try {
      const scene = build();
      await writeModel(category, id, scene);
      writeThumbnails(category, id);
      successCount++;
    } catch (err) {
      console.error(`  ✗ ${category}/${id}: ${err.message}`);
      errorCount++;
    }
  }

  console.log(`\nDone: ${successCount} models generated, ${errorCount} errors.`);
  if (errorCount > 0) process.exit(1);
}

main();
