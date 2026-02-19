#!/usr/bin/env node
/**
 * generate-models.mjs — Procedural GLB + thumbnail generator for SCENSUS 3D models.
 *
 * Uses Three.js to build low-poly, vertex-colored GLB models and render PNG thumbnails.
 * Run: node scripts/generate-models.mjs
 *
 * Output:
 *   public/models/drones/*.glb        (4 drone models)
 *   public/models/cuas/*.glb          (6 CUAS equipment models)
 *   public/models/vehicles/*.glb      (4 vehicle models)
 *   public/models/equipment/*.glb     (4 equipment models)
 *   public/models/thumbnails/{category}/*.png (top + profile views)
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
  // Minimal document stub for Three.js createElementNS calls
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hexToRGB(hex) {
  const c = parseInt(hex.replace('#', ''), 16);
  return new THREE.Color((c >> 16) / 255, ((c >> 8) & 0xff) / 255, (c & 0xff) / 255);
}

/** Create an unlit MeshBasicMaterial with a given color */
function mat(hex) {
  return new THREE.MeshBasicMaterial({ color: hexToRGB(hex) });
}

/** Apply vertex colors from material color to geometry, then switch to vertex-colored material */
function applyVertexColors(mesh) {
  const geo = mesh.geometry;
  const color = mesh.material.color.clone();
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  mesh.material = new THREE.MeshBasicMaterial({ vertexColors: true });
}

/** Merge group into a single mesh for export (simpler GLB) */
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

// ─── Drone Builders ───────────────────────────────────────────────────────────

function buildQuadcopterPhantom() {
  const group = new THREE.Group();
  // Body — wider rounded box
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.5), mat('#e5e7eb'));
  applyVertexColors(body);
  group.add(body);
  // 4 arms
  const armGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8);
  const armColor = '#9ca3af';
  for (let i = 0; i < 4; i++) {
    const angle = (Math.PI / 4) + (i * Math.PI / 2);
    const arm = new THREE.Mesh(armGeo, mat(armColor));
    applyVertexColors(arm);
    arm.rotation.z = Math.PI / 2;
    arm.rotation.y = angle;
    arm.position.set(Math.cos(angle) * 0.25, 0, Math.sin(angle) * 0.25);
    group.add(arm);
    // Motor pod
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12), mat('#374151'));
    applyVertexColors(motor);
    motor.position.set(Math.cos(angle) * 0.45, 0.02, Math.sin(angle) * 0.45);
    group.add(motor);
  }
  // Camera gimbal pod
  const gimbal = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat('#1f2937'));
  applyVertexColors(gimbal);
  gimbal.position.set(0, -0.12, 0.1);
  group.add(gimbal);
  // Landing gear
  for (const x of [-0.15, 0.15]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.15, 6), mat('#6b7280'));
    applyVertexColors(leg);
    leg.position.set(x, -0.15, 0);
    group.add(leg);
  }
  return groupToScene(group);
}

function buildFPV() {
  const group = new THREE.Group();
  // Compact low-profile frame
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.3), mat('#dc2626'));
  applyVertexColors(frame);
  group.add(frame);
  // 4 short arms
  const armGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.3, 6);
  for (let i = 0; i < 4; i++) {
    const angle = (Math.PI / 4) + (i * Math.PI / 2);
    const arm = new THREE.Mesh(armGeo, mat('#1f2937'));
    applyVertexColors(arm);
    arm.rotation.z = Math.PI / 2;
    arm.rotation.y = angle;
    arm.position.set(Math.cos(angle) * 0.15, 0, Math.sin(angle) * 0.15);
    group.add(arm);
    // Motor
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10), mat('#374151'));
    applyVertexColors(motor);
    motor.position.set(Math.cos(angle) * 0.32, 0.02, Math.sin(angle) * 0.32);
    group.add(motor);
  }
  // Battery strap on top
  const battery = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.2), mat('#374151'));
  applyVertexColors(battery);
  battery.position.y = 0.05;
  group.add(battery);
  return groupToScene(group);
}

function buildFixedWing() {
  const group = new THREE.Group();
  // Fuselage cylinder
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 1.0, 12), mat('#e5e7eb'));
  applyVertexColors(fuselage);
  fuselage.rotation.x = Math.PI / 2;
  group.add(fuselage);
  // Swept wings
  const wingGeo = new THREE.BoxGeometry(1.6, 0.02, 0.3);
  const wing = new THREE.Mesh(wingGeo, mat('#94a3b8'));
  applyVertexColors(wing);
  wing.position.set(0, 0, -0.05);
  group.add(wing);
  // V-tail fins
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.12), mat('#94a3b8'));
    applyVertexColors(fin);
    fin.position.set(side * 0.12, 0.06, -0.45);
    fin.rotation.z = side * 0.5;
    group.add(fin);
  }
  // Nose cone
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.15, 12), mat('#6b7280'));
  applyVertexColors(nose);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = 0.55;
  group.add(nose);
  return groupToScene(group);
}

function buildHexacopter() {
  const group = new THREE.Group();
  // Large body
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.1, 12), mat('#374151'));
  applyVertexColors(body);
  group.add(body);
  // 6 arms + motors
  const armGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8);
  for (let i = 0; i < 6; i++) {
    const angle = i * (Math.PI / 3);
    const arm = new THREE.Mesh(armGeo, mat('#6b7280'));
    applyVertexColors(arm);
    arm.rotation.z = Math.PI / 2;
    arm.rotation.y = angle;
    arm.position.set(Math.cos(angle) * 0.25, 0, Math.sin(angle) * 0.25);
    group.add(arm);
    // Motor pod
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 12), mat('#1f2937'));
    applyVertexColors(motor);
    motor.position.set(Math.cos(angle) * 0.5, 0.02, Math.sin(angle) * 0.5);
    group.add(motor);
  }
  // Landing gear (4 legs)
  for (let i = 0; i < 4; i++) {
    const angle = (Math.PI / 4) + (i * Math.PI / 2);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 6), mat('#9ca3af'));
    applyVertexColors(leg);
    leg.position.set(Math.cos(angle) * 0.2, -0.15, Math.sin(angle) * 0.2);
    group.add(leg);
  }
  // Bottom payload mount
  const payload = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.12), mat('#1f2937'));
  applyVertexColors(payload);
  payload.position.y = -0.08;
  group.add(payload);
  return groupToScene(group);
}

// ─── CUAS Builders ────────────────────────────────────────────────────────────

function buildJammer() {
  const group = new THREE.Group();
  // Vertical tower
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.2, 8), mat('#6b7280'));
  applyVertexColors(tower);
  tower.position.y = 0.6;
  group.add(tower);
  // Cone antenna at top
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.3, 12), mat('#ef4444'));
  applyVertexColors(cone);
  cone.position.y = 1.35;
  group.add(cone);
  // Radiating fin plates (4)
  for (let i = 0; i < 4; i++) {
    const angle = i * (Math.PI / 2);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.015), mat('#ef4444'));
    applyVertexColors(fin);
    fin.rotation.y = angle;
    fin.position.set(Math.cos(angle) * 0.12, 0.9, Math.sin(angle) * 0.12);
    group.add(fin);
  }
  // Base plate
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 12), mat('#374151'));
  applyVertexColors(base);
  base.position.y = 0.025;
  group.add(base);
  return groupToScene(group);
}

function buildRFSensor() {
  const group = new THREE.Group();
  // Box base
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.3), mat('#374151'));
  applyVertexColors(base);
  base.position.y = 0.1;
  group.add(base);
  // Vertical rod
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.8, 8), mat('#6b7280'));
  applyVertexColors(rod);
  rod.position.y = 0.6;
  group.add(rod);
  // Sphere sensor head
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), mat('#3b82f6'));
  applyVertexColors(sphere);
  sphere.position.y = 1.1;
  group.add(sphere);
  // Small antenna stubs on sphere
  for (let i = 0; i < 3; i++) {
    const angle = i * (2 * Math.PI / 3);
    const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.12, 4), mat('#3b82f6'));
    applyVertexColors(stub);
    stub.rotation.z = Math.PI / 4;
    stub.rotation.y = angle;
    stub.position.set(Math.cos(angle) * 0.08, 1.15, Math.sin(angle) * 0.08);
    group.add(stub);
  }
  return groupToScene(group);
}

function buildRadar() {
  const group = new THREE.Group();
  // Tripod legs
  for (let i = 0; i < 3; i++) {
    const angle = i * (2 * Math.PI / 3);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.7, 6), mat('#6b7280'));
    applyVertexColors(leg);
    leg.position.set(Math.cos(angle) * 0.2, 0.3, Math.sin(angle) * 0.2);
    leg.rotation.z = Math.sin(angle) * 0.15;
    leg.rotation.x = -Math.cos(angle) * 0.15;
    group.add(leg);
  }
  // Central post
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8), mat('#6b7280'));
  applyVertexColors(post);
  post.position.y = 0.75;
  group.add(post);
  // Parabolic dish (half sphere, tilted)
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#f59e0b'));
  applyVertexColors(dish);
  dish.rotation.x = -0.3;
  dish.position.y = 1.0;
  group.add(dish);
  // Feed horn (small cylinder)
  const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.15, 8), mat('#374151'));
  applyVertexColors(horn);
  horn.rotation.x = -0.3;
  horn.position.set(0, 1.1, 0.15);
  group.add(horn);
  return groupToScene(group);
}

function buildEOIRCamera() {
  const group = new THREE.Group();
  // Tripod (3 legs)
  for (let i = 0; i < 3; i++) {
    const angle = i * (2 * Math.PI / 3);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.6, 6), mat('#6b7280'));
    applyVertexColors(leg);
    leg.position.set(Math.cos(angle) * 0.15, 0.25, Math.sin(angle) * 0.15);
    leg.rotation.z = Math.sin(angle) * 0.12;
    leg.rotation.x = -Math.cos(angle) * 0.12;
    group.add(leg);
  }
  // Pan-tilt head (small box)
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.1), mat('#374151'));
  applyVertexColors(head);
  head.position.y = 0.58;
  group.add(head);
  // Rectangular camera housing
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.15, 0.12), mat('#8b5cf6'));
  applyVertexColors(housing);
  housing.position.set(0, 0.65, 0.04);
  group.add(housing);
  // Cylinder lens
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.08, 12), mat('#1f2937'));
  applyVertexColors(lens);
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, 0.65, 0.14);
  group.add(lens);
  return groupToScene(group);
}

function buildAcoustic() {
  const group = new THREE.Group();
  // Vertical pole
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.0, 8), mat('#6b7280'));
  applyVertexColors(pole);
  pole.position.y = 0.5;
  group.add(pole);
  // Ring array of small spheres at top
  const ringY = 0.95;
  for (let i = 0; i < 8; i++) {
    const angle = i * (Math.PI / 4);
    const mic = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), mat('#22c55e'));
    applyVertexColors(mic);
    mic.position.set(Math.cos(angle) * 0.15, ringY, Math.sin(angle) * 0.15);
    group.add(mic);
  }
  // Central hub at top
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12), mat('#22c55e'));
  applyVertexColors(hub);
  hub.position.y = ringY;
  group.add(hub);
  // Base plate
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.04, 12), mat('#374151'));
  applyVertexColors(base);
  base.position.y = 0.02;
  group.add(base);
  return groupToScene(group);
}

function buildCombined() {
  const group = new THREE.Group();
  // Tall tower
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 2.0, 8), mat('#6b7280'));
  applyVertexColors(tower);
  tower.position.y = 1.0;
  group.add(tower);
  // Dish (upper section)
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#ec4899'));
  applyVertexColors(dish);
  dish.position.y = 1.8;
  dish.rotation.x = -0.2;
  group.add(dish);
  // Camera box (mid section)
  const camera = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.1), mat('#8b5cf6'));
  applyVertexColors(camera);
  camera.position.set(0.12, 1.4, 0);
  group.add(camera);
  // Antenna rod (top)
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 6), mat('#ec4899'));
  applyVertexColors(rod);
  rod.position.y = 2.25;
  group.add(rod);
  // Base plate
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.06, 12), mat('#374151'));
  applyVertexColors(base);
  base.position.y = 0.03;
  group.add(base);
  return groupToScene(group);
}

// ─── Vehicle Builders ─────────────────────────────────────────────────────────

function buildSUVResponse() {
  const group = new THREE.Group();
  // Boxy SUV body
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.35, 1.8), mat('#1e3a5f'));
  applyVertexColors(body);
  body.position.y = 0.35;
  group.add(body);
  // Cabin (raised section)
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 1.0), mat('#1e3a5f'));
  applyVertexColors(cabin);
  cabin.position.set(0, 0.65, -0.1);
  group.add(cabin);
  // Windshield
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.2, 0.02), mat('#93c5fd'));
  applyVertexColors(windshield);
  windshield.position.set(0, 0.62, 0.39);
  windshield.rotation.x = 0.3;
  group.add(windshield);
  // Roof light bar
  const lightBar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.15), mat('#fbbf24'));
  applyVertexColors(lightBar);
  lightBar.position.set(0, 0.81, -0.05);
  group.add(lightBar);
  // Wheels (4)
  const wheelGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.08, 12);
  const wheelPositions = [
    [-0.4, 0.12, 0.55], [0.4, 0.12, 0.55],
    [-0.4, 0.12, -0.55], [0.4, 0.12, -0.55],
  ];
  for (const [x, y, z] of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeo, mat('#1f2937'));
    applyVertexColors(wheel);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    group.add(wheel);
  }
  return groupToScene(group);
}

function buildPickupTruck() {
  const group = new THREE.Group();
  // Cab
  const cab = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.35, 0.8), mat('#4a5d23'));
  applyVertexColors(cab);
  cab.position.set(0, 0.4, 0.5);
  group.add(cab);
  // Cabin roof
  const roof = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.7), mat('#4a5d23'));
  applyVertexColors(roof);
  roof.position.set(0, 0.65, 0.45);
  group.add(roof);
  // Open bed
  const bedFloor = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.05, 1.0), mat('#3d4f1e'));
  applyVertexColors(bedFloor);
  bedFloor.position.set(0, 0.27, -0.4);
  group.add(bedFloor);
  // Bed sides
  for (const x of [-0.37, 0.37]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 1.0), mat('#4a5d23'));
    applyVertexColors(side);
    side.position.set(x, 0.38, -0.4);
    group.add(side);
  }
  // Tailgate
  const tailgate = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.2, 0.03), mat('#4a5d23'));
  applyVertexColors(tailgate);
  tailgate.position.set(0, 0.38, -0.9);
  group.add(tailgate);
  // Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.08, 12);
  const wheelPositions = [
    [-0.4, 0.12, 0.6], [0.4, 0.12, 0.6],
    [-0.4, 0.12, -0.5], [0.4, 0.12, -0.5],
  ];
  for (const [x, y, z] of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeo, mat('#1f2937'));
    applyVertexColors(wheel);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    group.add(wheel);
  }
  return groupToScene(group);
}

function buildVanCommand() {
  const group = new THREE.Group();
  // Large box van body
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.5, 2.2), mat('#e5e7eb'));
  applyVertexColors(body);
  body.position.y = 0.4;
  group.add(body);
  // Cabin
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.5), mat('#d1d5db'));
  applyVertexColors(cabin);
  cabin.position.set(0, 0.75, 0.7);
  group.add(cabin);
  // Windshield
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.22, 0.02), mat('#93c5fd'));
  applyVertexColors(windshield);
  windshield.position.set(0, 0.72, 0.95);
  windshield.rotation.x = 0.15;
  group.add(windshield);
  // Antenna mast on roof
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 6), mat('#6b7280'));
  applyVertexColors(mast);
  mast.position.set(0, 1.05, -0.3);
  group.add(mast);
  // Antenna top
  const antennaTop = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.02, 0.1, 8), mat('#374151'));
  applyVertexColors(antennaTop);
  antennaTop.position.set(0, 1.5, -0.3);
  group.add(antennaTop);
  // Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.08, 12);
  const wheelPositions = [
    [-0.45, 0.12, 0.65], [0.45, 0.12, 0.65],
    [-0.45, 0.12, -0.6], [0.45, 0.12, -0.6],
  ];
  for (const [x, y, z] of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeo, mat('#374151'));
    applyVertexColors(wheel);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    group.add(wheel);
  }
  return groupToScene(group);
}

function buildSedanPatrol() {
  const group = new THREE.Group();
  // Sedan body (lower, longer)
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 1.8), mat('#1f2937'));
  applyVertexColors(body);
  body.position.y = 0.3;
  group.add(body);
  // Cabin (sleek)
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.2, 0.9), mat('#1f2937'));
  applyVertexColors(cabin);
  cabin.position.set(0, 0.52, -0.05);
  group.add(cabin);
  // Windshield
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.02), mat('#93c5fd'));
  applyVertexColors(windshield);
  windshield.position.set(0, 0.5, 0.38);
  windshield.rotation.x = 0.35;
  group.add(windshield);
  // Roof lights
  const lightBar = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.05, 0.1), mat('#3b82f6'));
  applyVertexColors(lightBar);
  lightBar.position.set(0, 0.65, -0.05);
  group.add(lightBar);
  // Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.07, 12);
  const wheelPositions = [
    [-0.37, 0.1, 0.55], [0.37, 0.1, 0.55],
    [-0.37, 0.1, -0.55], [0.37, 0.1, -0.55],
  ];
  for (const [x, y, z] of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeo, mat('#111827'));
    applyVertexColors(wheel);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    group.add(wheel);
  }
  return groupToScene(group);
}

// ─── Equipment Builders ───────────────────────────────────────────────────────

function buildGroundStation() {
  const group = new THREE.Group();
  // Table box
  const table = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.4), mat('#6b7280'));
  applyVertexColors(table);
  table.position.y = 0.5;
  group.add(table);
  // Table legs
  for (const [x, z] of [[-0.25, 0.15], [0.25, 0.15], [-0.25, -0.15], [0.25, -0.15]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 6), mat('#9ca3af'));
    applyVertexColors(leg);
    leg.position.set(x, 0.25, z);
    group.add(leg);
  }
  // Laptop screen (angled)
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.01), mat('#1e40af'));
  applyVertexColors(screen);
  screen.position.set(0, 0.63, -0.05);
  screen.rotation.x = -0.3;
  group.add(screen);
  // Laptop base
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.2), mat('#374151'));
  applyVertexColors(base);
  base.position.set(0, 0.53, 0.05);
  group.add(base);
  // Antenna mast
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.6, 6), mat('#9ca3af'));
  applyVertexColors(mast);
  mast.position.set(0.25, 0.82, -0.1);
  group.add(mast);
  // Antenna top
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.01, 0.08, 6), mat('#6b7280'));
  applyVertexColors(ant);
  ant.position.set(0.25, 1.16, -0.1);
  group.add(ant);
  return groupToScene(group);
}

function buildAntennaTower() {
  const group = new THREE.Group();
  // Lattice tower (tapered box)
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.2, 2.5, 4), mat('#9ca3af'));
  applyVertexColors(tower);
  tower.position.y = 1.25;
  group.add(tower);
  // Cross braces (decorative)
  for (let i = 0; i < 4; i++) {
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.02), mat('#6b7280'));
    applyVertexColors(brace);
    brace.position.y = 0.5 + i * 0.5;
    brace.rotation.y = i * (Math.PI / 4);
    group.add(brace);
  }
  // Antenna arrays at top (horizontal bars)
  for (const [y, len] of [[2.3, 0.4], [2.45, 0.3]]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(len, 0.03, 0.03), mat('#d1d5db'));
    applyVertexColors(bar);
    bar.position.y = y;
    group.add(bar);
  }
  // Dish
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat('#e5e7eb'));
  applyVertexColors(dish);
  dish.position.set(0.12, 2.0, 0);
  dish.rotation.z = -Math.PI / 4;
  group.add(dish);
  return groupToScene(group);
}

function buildGenerator() {
  const group = new THREE.Group();
  // Box body
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.7), mat('#eab308'));
  applyVertexColors(body);
  body.position.y = 0.2;
  group.add(body);
  // Exhaust cylinder
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 8), mat('#374151'));
  applyVertexColors(exhaust);
  exhaust.position.set(0.15, 0.47, -0.2);
  group.add(exhaust);
  // Control panel (front face)
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.01), mat('#1f2937'));
  applyVertexColors(panel);
  panel.position.set(0, 0.25, 0.36);
  group.add(panel);
  // Carry handles
  for (const x of [-0.22, 0.22]) {
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.15), mat('#374151'));
    applyVertexColors(handle);
    handle.position.set(x, 0.42, 0);
    group.add(handle);
  }
  // Rubber feet
  for (const [x, z] of [[-0.2, 0.25], [0.2, 0.25], [-0.2, -0.25], [0.2, -0.25]]) {
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 8), mat('#1f2937'));
    applyVertexColors(foot);
    foot.position.set(x, 0.015, z);
    group.add(foot);
  }
  return groupToScene(group);
}

function buildBarrier() {
  const group = new THREE.Group();
  // Jersey barrier (tapered trapezoidal shape via extruded shape)
  // Approximate with two stacked boxes
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 1.2), mat('#f97316'));
  applyVertexColors(bottom);
  bottom.position.y = 0.2;
  group.add(bottom);
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.35, 1.2), mat('#f97316'));
  applyVertexColors(top);
  top.position.y = 0.55;
  group.add(top);
  // White stripe
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.04, 1.21), mat('#ffffff'));
  applyVertexColors(stripe);
  stripe.position.y = 0.5;
  group.add(stripe);
  return groupToScene(group);
}

// ─── Model Registry ───────────────────────────────────────────────────────────

const ALL_MODELS = [
  // Drones
  { category: 'drones', id: 'quadcopter_phantom', build: buildQuadcopterPhantom },
  { category: 'drones', id: 'fpv', build: buildFPV },
  { category: 'drones', id: 'fixed_wing', build: buildFixedWing },
  { category: 'drones', id: 'hexacopter', build: buildHexacopter },
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

// ─── Thumbnail Generation ─────────────────────────────────────────────────────

/**
 * Thumbnail rendering is skipped in Node.js (no WebGL context).
 * Placeholder PNGs are generated instead — a 1×1 transparent pixel.
 * Replace with real renders via headless-gl or a browser-based script if needed.
 */
function writePlaceholderPNG(filePath) {
  // Minimal valid PNG: 1×1 transparent pixel
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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Generating 3D models for SCENSUS...\n');

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
