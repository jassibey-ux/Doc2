"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
const electron = require("electron");
const log = require("electron-log");
const path = require("path");
const express = require("express");
const cors = require("cors");
const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");
const chokidar = require("chokidar");
const fastXmlParser = require("fast-xml-parser");
const JSZip = require("jszip");
const os = require("os");
const child_process = require("child_process");
const Database = require("better-sqlite3");
const multer = require("multer");
const events = require("events");
const crypto = require("crypto");
const dgram = require("dgram");
const electronUpdater = require("electron-updater");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const path__namespace = /* @__PURE__ */ _interopNamespaceDefault(path);
const fs__namespace = /* @__PURE__ */ _interopNamespaceDefault(fs);
const os__namespace = /* @__PURE__ */ _interopNamespaceDefault(os);
const crypto__namespace = /* @__PURE__ */ _interopNamespaceDefault(crypto);
const dgram__namespace = /* @__PURE__ */ _interopNamespaceDefault(dgram);
function setupWebSocket(server, app) {
  const wss = new WebSocket.WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (ws) => {
    app.wsConnections.add(ws);
    log.info(`WebSocket client connected (total: ${app.wsConnections.size})`);
    try {
      const summaries = app.stateManager.getTrackerSummaries();
      for (const summary of summaries) {
        if (ws.readyState === WebSocket.WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: "tracker_updated",
            data: summary
          }), (err) => {
            if (err) {
              app.wsConnections.delete(ws);
            }
          });
        }
      }
      if (app.activeEvent && ws.readyState === WebSocket.WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "active_event_changed",
          data: { event_name: app.activeEvent }
        }), (err) => {
          if (err) {
            app.wsConnections.delete(ws);
          }
        });
      }
    } catch (e) {
      log.error("Error sending initial state:", e);
      app.wsConnections.delete(ws);
    }
    ws.on("message", () => {
    });
    ws.on("close", () => {
      app.wsConnections.delete(ws);
      log.info(`WebSocket client disconnected (total: ${app.wsConnections.size})`);
    });
    ws.on("error", (err) => {
      log.error("WebSocket error:", err);
      app.wsConnections.delete(ws);
    });
  });
}
const SEED_SITES = [
  {
    id: "demo-site-alpha",
    name: "Alpha Test Range",
    center: { lat: 37.7749, lon: -122.4194 },
    boundary_polygon: [
      { lat: 37.78, lon: -122.425 },
      { lat: 37.78, lon: -122.41 },
      { lat: 37.77, lon: -122.41 },
      { lat: 37.77, lon: -122.425 },
      { lat: 37.78, lon: -122.425 }
    ],
    markers: [
      {
        id: "marker-alpha-cp",
        name: "Command Post",
        type: "command_post",
        position: { lat: 37.775, lon: -122.42 },
        notes: "Main operations center"
      },
      {
        id: "marker-alpha-launch",
        name: "Launch Point A",
        type: "launch_point",
        position: { lat: 37.778, lon: -122.415 },
        notes: "Primary drone launch location"
      }
    ],
    zones: [
      {
        id: "zone-alpha-test",
        name: "Primary Test Area",
        type: "test_area",
        polygon: [
          { lat: 37.778, lon: -122.42 },
          { lat: 37.778, lon: -122.412 },
          { lat: 37.772, lon: -122.412 },
          { lat: 37.772, lon: -122.42 }
        ],
        color: "#3b82f6",
        opacity: 0.3,
        notes: "Main jamming test area"
      }
    ],
    environment_type: "open_field",
    rf_notes: "Demo site - San Francisco area test range for CUAS evaluation"
  },
  {
    id: "demo-site-bravo",
    name: "Bravo Urban Environment",
    center: { lat: 34.0522, lon: -118.2437 },
    boundary_polygon: [
      { lat: 34.06, lon: -118.25 },
      { lat: 34.06, lon: -118.235 },
      { lat: 34.045, lon: -118.235 },
      { lat: 34.045, lon: -118.25 },
      { lat: 34.06, lon: -118.25 }
    ],
    markers: [
      {
        id: "marker-bravo-cp",
        name: "Urban Command Post",
        type: "command_post",
        position: { lat: 34.052, lon: -118.245 },
        notes: "Rooftop operations center"
      }
    ],
    zones: [],
    environment_type: "urban",
    rf_notes: "Demo site - Los Angeles urban test environment with building interference"
  },
  {
    id: "demo-site-charlie",
    name: "Charlie Open Field",
    center: { lat: 39.7392, lon: -104.9903 },
    boundary_polygon: [
      { lat: 39.745, lon: -105 },
      { lat: 39.745, lon: -104.98 },
      { lat: 39.735, lon: -104.98 },
      { lat: 39.735, lon: -105 },
      { lat: 39.745, lon: -105 }
    ],
    markers: [],
    zones: [],
    environment_type: "open_field",
    rf_notes: "Demo site - Denver open field for baseline testing with minimal interference"
  },
  {
    id: "demo-site-grand-forks-afb",
    name: "Grand Forks AFB",
    center: { lat: 47.9547, lon: -97.4001 },
    boundary_polygon: [
      { lat: 47.97, lon: -97.42 },
      { lat: 47.97, lon: -97.38 },
      { lat: 47.94, lon: -97.38 },
      { lat: 47.94, lon: -97.42 },
      { lat: 47.97, lon: -97.42 }
    ],
    markers: [
      {
        id: "marker-gf-cp",
        name: "Command Post",
        type: "command_post",
        position: { lat: 47.956, lon: -97.401 },
        notes: "Base operations center"
      },
      {
        id: "marker-gf-lp1",
        name: "North Launch Point",
        type: "launch_point",
        position: { lat: 47.965, lon: -97.395 },
        notes: "Primary UAS launch area - north runway"
      },
      {
        id: "marker-gf-lp2",
        name: "South Launch Point",
        type: "launch_point",
        position: { lat: 47.945, lon: -97.405 },
        notes: "Secondary launch area - south taxiway"
      },
      {
        id: "marker-gf-obs",
        name: "Observation Post",
        type: "observation",
        position: { lat: 47.958, lon: -97.388 },
        notes: "Visual tracking station - east perimeter"
      },
      {
        id: "marker-gf-rz",
        name: "Recovery Zone",
        type: "recovery_zone",
        position: { lat: 47.95, lon: -97.41 },
        notes: "UAS recovery and inspection area"
      }
    ],
    zones: [
      {
        id: "zone-gf-test",
        name: "Primary Test Corridor",
        type: "test_area",
        polygon: [
          { lat: 47.965, lon: -97.405 },
          { lat: 47.965, lon: -97.385 },
          { lat: 47.95, lon: -97.385 },
          { lat: 47.95, lon: -97.405 }
        ],
        color: "#3b82f6",
        opacity: 0.3,
        notes: "Main flight test corridor over airfield"
      },
      {
        id: "zone-gf-jammer",
        name: "RF Denial Zone",
        type: "jammer_zone",
        polygon: [
          { lat: 47.96, lon: -97.4 },
          { lat: 47.96, lon: -97.39 },
          { lat: 47.952, lon: -97.39 },
          { lat: 47.952, lon: -97.4 }
        ],
        color: "#ef4444",
        opacity: 0.25,
        notes: "Active RF jamming area - coordinate with tower"
      },
      {
        id: "zone-gf-exclusion",
        name: "Runway Exclusion",
        type: "exclusion",
        polygon: [
          { lat: 47.958, lon: -97.415 },
          { lat: 47.958, lon: -97.385 },
          { lat: 47.953, lon: -97.385 },
          { lat: 47.953, lon: -97.415 }
        ],
        color: "#f97316",
        opacity: 0.2,
        notes: "Active runway - no UAS operations without ATC clearance"
      }
    ],
    environment_type: "open_field",
    elevation_min_m: 253,
    elevation_max_m: 260,
    rf_notes: "Active military airfield - coordinate RF emissions with base frequency manager. ATC on 124.15 MHz.",
    access_notes: "Requires base access credentials. Check in at Visitor Center Gate 1."
  }
];
const SEED_DRONE_PROFILES = [
  {
    id: "drone-dji-mavic3",
    name: "DJI Mavic 3",
    make: "DJI",
    model: "Mavic 3",
    weight_class: "mini",
    frequency_bands: ["2.4GHz RC", "5.8GHz video", "GPS L1"],
    expected_failsafe: "rth",
    max_speed_mps: 21,
    max_altitude_m: 6e3,
    endurance_minutes: 46,
    notes: "Common consumer drone - primary test platform for standard detection scenarios"
  },
  {
    id: "drone-dji-m30",
    name: "DJI Matrice 30T",
    make: "DJI",
    model: "Matrice 30T",
    weight_class: "small",
    frequency_bands: ["2.4GHz RC", "5.8GHz video", "O3", "GPS L1", "GPS L2"],
    expected_failsafe: "rth",
    max_speed_mps: 23,
    max_altitude_m: 7e3,
    endurance_minutes: 41,
    notes: "Enterprise inspection drone with thermal - tests larger RCS detection"
  },
  {
    id: "drone-autel-evo2",
    name: "Autel EVO II Pro",
    make: "Autel",
    model: "EVO II Pro",
    weight_class: "small",
    frequency_bands: ["2.4GHz RC", "5.8GHz video", "GPS L1"],
    expected_failsafe: "rth",
    max_speed_mps: 20,
    max_altitude_m: 7e3,
    endurance_minutes: 42,
    notes: "Alternative commercial platform - validates multi-vendor detection"
  },
  {
    id: "drone-custom-fpv",
    name: "Custom FPV Racer",
    make: "Custom Build",
    model: 'FPV 5" Quad',
    weight_class: "mini",
    frequency_bands: ["5.8GHz video", "2.4GHz RC"],
    expected_failsafe: "land",
    max_speed_mps: 45,
    max_altitude_m: 500,
    endurance_minutes: 5,
    notes: "High-speed FPV threat simulation - tests rapid response capabilities"
  },
  {
    id: "drone-parrot-anafi",
    name: "Parrot ANAFI USA",
    make: "Parrot",
    model: "ANAFI USA",
    weight_class: "mini",
    frequency_bands: ["2.4GHz RC", "5.8GHz video", "GPS L1"],
    expected_failsafe: "rth",
    max_speed_mps: 15,
    max_altitude_m: 4500,
    endurance_minutes: 32,
    notes: "Government-approved drone - validates non-DJI protocol detection"
  },
  {
    id: "drone-skydio-2",
    name: "Skydio 2+",
    make: "Skydio",
    model: "2+",
    weight_class: "mini",
    frequency_bands: ["2.4GHz RC", "5.8GHz video", "GPS L1"],
    expected_failsafe: "hover",
    max_speed_mps: 17,
    max_altitude_m: 6e3,
    endurance_minutes: 27,
    notes: "Autonomous flight capable - tests detection of AI-driven flight patterns"
  }
];
const SEED_CUAS_PROFILES = [
  {
    id: "cuas-rf-jammer-alpha",
    name: "RF Jammer Alpha",
    vendor: "CUAS Systems Inc",
    model: "J-1000",
    type: "jammer",
    capabilities: ["GPS L1", "WiFi 2.4GHz", "WiFi 5.8GHz"],
    effective_range_m: 1e3,
    beam_width_deg: 60,
    antenna_pattern: "directional",
    power_output_w: 50,
    antenna_gain_dbi: 12,
    frequency_ranges: ["2.4-2.5GHz", "5.7-5.9GHz", "1.575GHz"],
    notes: "Primary RF disruption unit - 60deg sector coverage for targeted jamming"
  },
  {
    id: "cuas-rf-jammer-bravo",
    name: "RF Jammer Bravo",
    vendor: "CUAS Systems Inc",
    model: "J-1500",
    type: "jammer",
    capabilities: ["GPS L1", "GPS L2", "WiFi 2.4GHz", "WiFi 5.8GHz", "900MHz", "433MHz"],
    effective_range_m: 1500,
    beam_width_deg: 90,
    antenna_pattern: "sector",
    power_output_w: 100,
    antenna_gain_dbi: 10,
    frequency_ranges: ["0.4-0.5GHz", "0.9-1.0GHz", "2.4-2.5GHz", "5.7-5.9GHz", "1.575GHz", "1.227GHz"],
    notes: "Extended range sector jammer - covers additional IoT frequencies"
  },
  {
    id: "cuas-rf-jammer-omni",
    name: "RF Jammer Omni",
    vendor: "DefenseTech",
    model: "O-500",
    type: "jammer",
    capabilities: ["GPS L1", "WiFi 2.4GHz", "WiFi 5.8GHz"],
    effective_range_m: 500,
    beam_width_deg: 360,
    antenna_pattern: "omni",
    power_output_w: 30,
    antenna_gain_dbi: 2,
    frequency_ranges: ["2.4-2.5GHz", "5.7-5.9GHz", "1.575GHz"],
    notes: "Omnidirectional jammer - 360deg protection for point defense"
  },
  {
    id: "cuas-radar-detection",
    name: "Radar Detection Unit",
    vendor: "RadarTech Defense",
    model: "RTD-3000",
    type: "radar",
    capabilities: ["Drone Detection", "Track Classification", "Multi-target"],
    effective_range_m: 3e3,
    beam_width_deg: 360,
    antenna_pattern: "omni",
    notes: "Primary radar detection - 3km range for early warning"
  },
  {
    id: "cuas-acoustic-array",
    name: "Acoustic Sensor Array",
    vendor: "AudioSense Security",
    model: "ASA-500",
    type: "acoustic",
    capabilities: ["Drone Detection", "Direction Finding", "Audio Signature Library"],
    effective_range_m: 500,
    beam_width_deg: 360,
    antenna_pattern: "omni",
    notes: "Passive acoustic detection - validates audio signature library"
  },
  {
    id: "cuas-rf-detector",
    name: "RF Spectrum Analyzer",
    vendor: "SpectrumWatch",
    model: "SW-2000",
    type: "rf_sensor",
    capabilities: ["900MHz Detection", "2.4GHz Detection", "5.8GHz Detection", "Protocol Analysis"],
    effective_range_m: 2e3,
    beam_width_deg: 360,
    antenna_pattern: "omni",
    frequency_ranges: ["0.9-1.0GHz", "2.4-2.5GHz", "5.7-5.9GHz"],
    notes: "RF detection unit - identifies drone control signals"
  }
];
function needsSeedData(sitesCount, droneProfilesCount, cuasProfilesCount) {
  return sitesCount === 0 || droneProfilesCount === 0 || cuasProfilesCount === 0;
}
function generateId$1() {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
function getLibraryPath() {
  const userDataPath = electron.app?.getPath?.("userData") || process.env.HOME || ".";
  const libraryPath = path__namespace.join(userDataPath, "libraries");
  if (!fs__namespace.existsSync(libraryPath)) {
    fs__namespace.mkdirSync(libraryPath, { recursive: true });
    log.info(`Created library directory: ${libraryPath}`);
  }
  return libraryPath;
}
const cache = /* @__PURE__ */ new Map();
function readJsonFile(filename, defaultValue) {
  const cached = cache.get(filename);
  if (cached !== void 0) {
    return cached;
  }
  const filePath = path__namespace.join(getLibraryPath(), filename);
  try {
    if (fs__namespace.existsSync(filePath)) {
      const data = fs__namespace.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(data);
      cache.set(filename, parsed);
      return parsed;
    }
  } catch (error) {
    log.error(`Error reading ${filename}:`, error);
  }
  cache.set(filename, defaultValue);
  return defaultValue;
}
function writeJsonFile(filename, data) {
  const filePath = path__namespace.join(getLibraryPath(), filename);
  const tempPath = `${filePath}.tmp`;
  cache.set(filename, data);
  try {
    fs__namespace.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf-8");
    fs__namespace.renameSync(tempPath, filePath);
    log.info(`Saved ${filename} (${data.length} items)`);
  } catch (error) {
    log.error(`Error writing ${filename}:`, error);
    if (fs__namespace.existsSync(tempPath)) {
      fs__namespace.unlinkSync(tempPath);
    }
    throw error;
  }
}
let seedDataInitialized = false;
function initializeSeedDataIfNeeded() {
  if (seedDataInitialized) return;
  seedDataInitialized = true;
  const sitesCount = readJsonFile(SITES_FILE, []).length;
  const droneProfilesCount = readJsonFile(DRONE_PROFILES_FILE, []).length;
  const cuasProfilesCount = readJsonFile(CUAS_PROFILES_FILE, []).length;
  if (needsSeedData(sitesCount, droneProfilesCount, cuasProfilesCount)) {
    log.info("First run detected - initializing seed data...");
    if (sitesCount === 0) {
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const seededSites = SEED_SITES.map((site) => ({
        ...site,
        created_at: now,
        updated_at: now
      }));
      writeJsonFile(SITES_FILE, seededSites);
      log.info(`Seeded ${seededSites.length} demo sites`);
    }
    if (droneProfilesCount === 0) {
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const seededProfiles = SEED_DRONE_PROFILES.map((profile) => ({
        ...profile,
        created_at: now,
        updated_at: now
      }));
      writeJsonFile(DRONE_PROFILES_FILE, seededProfiles);
      log.info(`Seeded ${seededProfiles.length} demo drone profiles`);
    }
    if (cuasProfilesCount === 0) {
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const seededProfiles = SEED_CUAS_PROFILES.map((profile) => ({
        ...profile,
        created_at: now,
        updated_at: now
      }));
      writeJsonFile(CUAS_PROFILES_FILE, seededProfiles);
      log.info(`Seeded ${seededProfiles.length} demo CUAS profiles`);
    }
    log.info("Seed data initialization complete");
  }
}
const SITES_FILE = "sites.json";
const DRONE_PROFILES_FILE = "drone-profiles.json";
const CUAS_PROFILES_FILE = "cuas-profiles.json";
function getSites() {
  initializeSeedDataIfNeeded();
  return readJsonFile(SITES_FILE, []);
}
function getSiteById(id) {
  return getSites().find((s) => s.id === id);
}
function createSite(site) {
  const sites = getSites();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const newSite = {
    ...site,
    id: generateId$1(),
    created_at: now,
    updated_at: now
  };
  sites.push(newSite);
  writeJsonFile(SITES_FILE, sites);
  return newSite;
}
function updateSite(id, updates) {
  const sites = getSites();
  const index = sites.findIndex((s) => s.id === id);
  if (index === -1) {
    return void 0;
  }
  sites[index] = {
    ...sites[index],
    ...updates,
    id,
    // Prevent ID from being changed
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  writeJsonFile(SITES_FILE, sites);
  return sites[index];
}
function deleteSite(id) {
  const sites = getSites();
  const filtered = sites.filter((s) => s.id !== id);
  if (filtered.length === sites.length) {
    return false;
  }
  writeJsonFile(SITES_FILE, filtered);
  return true;
}
function duplicateSite(id, newName) {
  const site = getSiteById(id);
  if (!site) return void 0;
  const { id: _, created_at: __, updated_at: ___, ...siteData } = site;
  return createSite({ ...siteData, name: newName });
}
function getDroneProfiles() {
  initializeSeedDataIfNeeded();
  return readJsonFile(DRONE_PROFILES_FILE, []);
}
function getDroneProfileById(id) {
  return getDroneProfiles().find((p) => p.id === id);
}
function createDroneProfile(profile) {
  const profiles = getDroneProfiles();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const newProfile = {
    ...profile,
    id: generateId$1(),
    created_at: now,
    updated_at: now
  };
  profiles.push(newProfile);
  writeJsonFile(DRONE_PROFILES_FILE, profiles);
  return newProfile;
}
function updateDroneProfile(id, updates) {
  const profiles = getDroneProfiles();
  const index = profiles.findIndex((p) => p.id === id);
  if (index === -1) {
    return void 0;
  }
  profiles[index] = {
    ...profiles[index],
    ...updates,
    id,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  writeJsonFile(DRONE_PROFILES_FILE, profiles);
  return profiles[index];
}
function deleteDroneProfile(id) {
  const profiles = getDroneProfiles();
  const filtered = profiles.filter((p) => p.id !== id);
  if (filtered.length === profiles.length) {
    return false;
  }
  writeJsonFile(DRONE_PROFILES_FILE, filtered);
  return true;
}
function upsertDroneProfile(profile) {
  const profiles = getDroneProfiles();
  const index = profiles.findIndex((p) => p.id === profile.id);
  if (index >= 0) {
    profiles[index] = { ...profile, updated_at: (/* @__PURE__ */ new Date()).toISOString() };
  } else {
    profiles.push(profile);
  }
  writeJsonFile(DRONE_PROFILES_FILE, profiles);
  return profiles[index >= 0 ? index : profiles.length - 1];
}
function getCUASProfiles() {
  initializeSeedDataIfNeeded();
  return readJsonFile(CUAS_PROFILES_FILE, []);
}
function getCUASProfileById(id) {
  return getCUASProfiles().find((p) => p.id === id);
}
function createCUASProfile(profile) {
  const profiles = getCUASProfiles();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const newProfile = {
    ...profile,
    id: generateId$1(),
    created_at: now,
    updated_at: now
  };
  profiles.push(newProfile);
  writeJsonFile(CUAS_PROFILES_FILE, profiles);
  return newProfile;
}
function updateCUASProfile(id, updates) {
  const profiles = getCUASProfiles();
  const index = profiles.findIndex((p) => p.id === id);
  if (index === -1) {
    return void 0;
  }
  profiles[index] = {
    ...profiles[index],
    ...updates,
    id,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  writeJsonFile(CUAS_PROFILES_FILE, profiles);
  return profiles[index];
}
function deleteCUASProfile(id) {
  const profiles = getCUASProfiles();
  const filtered = profiles.filter((p) => p.id !== id);
  if (filtered.length === profiles.length) {
    return false;
  }
  writeJsonFile(CUAS_PROFILES_FILE, filtered);
  return true;
}
function upsertCUASProfile(profile) {
  const profiles = getCUASProfiles();
  const index = profiles.findIndex((p) => p.id === profile.id);
  if (index >= 0) {
    profiles[index] = { ...profile, updated_at: (/* @__PURE__ */ new Date()).toISOString() };
  } else {
    profiles.push(profile);
  }
  writeJsonFile(CUAS_PROFILES_FILE, profiles);
  return profiles[index >= 0 ? index : profiles.length - 1];
}
const TEST_SESSIONS_FILE = "test-sessions.json";
function getTestSessions() {
  return readJsonFile(TEST_SESSIONS_FILE, []);
}
function getTestSessionById(id) {
  return getTestSessions().find((s) => s.id === id);
}
function getTestSessionsBySite(siteId) {
  return getTestSessions().filter((s) => s.site_id === siteId);
}
function createTestSession(session) {
  const sessions = getTestSessions();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const newSession = {
    ...session,
    id: generateId$1(),
    created_at: now,
    updated_at: now
  };
  sessions.push(newSession);
  writeJsonFile(TEST_SESSIONS_FILE, sessions);
  return newSession;
}
function updateTestSession(id, updates) {
  const sessions = getTestSessions();
  const index = sessions.findIndex((s) => s.id === id);
  if (index === -1) {
    return void 0;
  }
  sessions[index] = {
    ...sessions[index],
    ...updates,
    id,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  writeJsonFile(TEST_SESSIONS_FILE, sessions);
  return sessions[index];
}
function deleteTestSession(id) {
  const sessions = getTestSessions();
  const filtered = sessions.filter((s) => s.id !== id);
  if (filtered.length === sessions.length) {
    return false;
  }
  writeJsonFile(TEST_SESSIONS_FILE, filtered);
  return true;
}
function addEventToSession(sessionId, event) {
  const session = getTestSessionById(sessionId);
  if (!session) return void 0;
  const newEvent = {
    ...event,
    id: generateId$1()
  };
  return updateTestSession(sessionId, {
    events: [...session.events, newEvent]
  });
}
function removeEventFromSession(sessionId, eventId) {
  const session = getTestSessionById(sessionId);
  if (!session) return void 0;
  return updateTestSession(sessionId, {
    events: session.events.filter((e) => e.id !== eventId)
  });
}
const TEST_TEMPLATES_FILE = "test-templates.json";
function getTestTemplates() {
  return readJsonFile(TEST_TEMPLATES_FILE, []);
}
function getLibraryStats() {
  return {
    sites: getSites().length,
    droneProfiles: getDroneProfiles().length,
    cuasProfiles: getCUASProfiles().length,
    testSessions: getTestSessions().length,
    testTemplates: getTestTemplates().length
  };
}
function addTagToSession(sessionId, tag) {
  const session = getTestSessionById(sessionId);
  if (!session) return void 0;
  const normalizedTag = tag.trim().toLowerCase();
  if (!normalizedTag) return session;
  const currentTags = session.tags || [];
  if (currentTags.includes(normalizedTag)) return session;
  return updateTestSession(sessionId, {
    tags: [...currentTags, normalizedTag]
  });
}
function removeTagFromSession(sessionId, tag) {
  const session = getTestSessionById(sessionId);
  if (!session) return void 0;
  const normalizedTag = tag.trim().toLowerCase();
  const currentTags = session.tags || [];
  return updateTestSession(sessionId, {
    tags: currentTags.filter((t) => t !== normalizedTag)
  });
}
function getSessionTags(sessionId) {
  const session = getTestSessionById(sessionId);
  return session?.tags || [];
}
function getAllTags() {
  const sessions = getTestSessions();
  const tagCounts = /* @__PURE__ */ new Map();
  for (const session of sessions) {
    for (const tag of session.tags || []) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }
  return Array.from(tagCounts.entries()).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
}
function getSessionsByTag(tag) {
  const normalizedTag = tag.trim().toLowerCase();
  return getTestSessions().filter((s) => s.tags?.includes(normalizedTag));
}
function addAnnotationToSession(sessionId, content, type = "note", author, timestampRef) {
  const session = getTestSessionById(sessionId);
  if (!session) return void 0;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const annotation = {
    id: generateId$1(),
    content,
    type,
    author,
    timestamp_ref: timestampRef,
    created_at: now,
    updated_at: now
  };
  const currentAnnotations = session.annotations || [];
  return updateTestSession(sessionId, {
    annotations: [...currentAnnotations, annotation]
  });
}
function updateAnnotation(sessionId, annotationId, content) {
  const session = getTestSessionById(sessionId);
  if (!session) return void 0;
  const annotations = session.annotations || [];
  const index = annotations.findIndex((a) => a.id === annotationId);
  if (index === -1) return void 0;
  const updatedAnnotations = [...annotations];
  updatedAnnotations[index] = {
    ...updatedAnnotations[index],
    content,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  return updateTestSession(sessionId, { annotations: updatedAnnotations });
}
function removeAnnotationFromSession(sessionId, annotationId) {
  const session = getTestSessionById(sessionId);
  if (!session) return void 0;
  const annotations = session.annotations || [];
  return updateTestSession(sessionId, {
    annotations: annotations.filter((a) => a.id !== annotationId)
  });
}
function getSessionAnnotations(sessionId, type) {
  const session = getTestSessionById(sessionId);
  if (!session) return [];
  const annotations = session.annotations || [];
  if (type) {
    return annotations.filter((a) => a.type === type);
  }
  return annotations;
}
function searchSessions(filters) {
  let sessions = getTestSessions();
  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    sessions = sessions.filter(
      (s) => s.name.toLowerCase().includes(searchLower) || s.operator_name?.toLowerCase().includes(searchLower) || s.weather_notes?.toLowerCase().includes(searchLower) || s.post_test_notes?.toLowerCase().includes(searchLower)
    );
  }
  if (filters.status && filters.status.length > 0) {
    sessions = sessions.filter((s) => filters.status.includes(s.status));
  }
  if (filters.siteId) {
    sessions = sessions.filter((s) => s.site_id === filters.siteId);
  }
  if (filters.tags && filters.tags.length > 0) {
    sessions = sessions.filter((s) => {
      const sessionTags = s.tags || [];
      return filters.tags.every((t) => sessionTags.includes(t.toLowerCase()));
    });
  }
  if (filters.passFail) {
    sessions = sessions.filter((s) => s.metrics?.pass_fail === filters.passFail);
  }
  if (filters.droneProfileId) {
    sessions = sessions.filter(
      (s) => s.tracker_assignments.some((a) => a.drone_profile_id === filters.droneProfileId)
    );
  }
  if (filters.cuasProfileId) {
    sessions = sessions.filter(
      (s) => s.cuas_placements.some((p) => p.cuas_profile_id === filters.cuasProfileId)
    );
  }
  if (filters.startDate) {
    const startMs = new Date(filters.startDate).getTime();
    sessions = sessions.filter((s) => {
      const sessionStart = s.start_time ? new Date(s.start_time).getTime() : 0;
      return sessionStart >= startMs;
    });
  }
  if (filters.endDate) {
    const endMs = new Date(filters.endDate).getTime();
    sessions = sessions.filter((s) => {
      const sessionStart = s.start_time ? new Date(s.start_time).getTime() : Infinity;
      return sessionStart <= endMs;
    });
  }
  if (filters.operatorName) {
    const opLower = filters.operatorName.toLowerCase();
    sessions = sessions.filter(
      (s) => s.operator_name?.toLowerCase().includes(opLower)
    );
  }
  sessions.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  return sessions;
}
function getDashboardStats() {
  const sessions = getTestSessions();
  const sites = getSites();
  const sessionsByStatus = {};
  for (const session of sessions) {
    sessionsByStatus[session.status] = (sessionsByStatus[session.status] || 0) + 1;
  }
  const sessionsByPassFail = { pass: 0, fail: 0, partial: 0, pending: 0 };
  for (const session of sessions) {
    const result = session.metrics?.pass_fail || "pending";
    sessionsByPassFail[result] = (sessionsByPassFail[result] || 0) + 1;
  }
  const recentSessions = [...sessions].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5);
  const topTags = getAllTags().slice(0, 10);
  const siteCounts = /* @__PURE__ */ new Map();
  for (const session of sessions) {
    if (session.site_id) {
      siteCounts.set(session.site_id, (siteCounts.get(session.site_id) || 0) + 1);
    }
  }
  const sessionsBySite = Array.from(siteCounts.entries()).map(([siteId, count]) => {
    const site = sites.find((s) => s.id === siteId);
    return { siteId, siteName: site?.name || "Unknown", count };
  }).sort((a, b) => b.count - a.count);
  const now = /* @__PURE__ */ new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const sessionsThisMonth = sessions.filter(
    (s) => new Date(s.created_at) >= startOfMonth
  ).length;
  const durationsWithData = sessions.filter((s) => s.duration_seconds && s.duration_seconds > 0).map((s) => s.duration_seconds);
  const avgSessionDuration = durationsWithData.length > 0 ? durationsWithData.reduce((a, b) => a + b, 0) / durationsWithData.length : null;
  return {
    totalSessions: sessions.length,
    sessionsByStatus,
    sessionsByPassFail,
    recentSessions,
    topTags,
    sessionsBySite,
    sessionsThisMonth,
    avgSessionDuration
  };
}
function getSessionsByDroneProfile(droneProfileId) {
  return getTestSessions().filter(
    (s) => s.tracker_assignments.some((a) => a.drone_profile_id === droneProfileId)
  );
}
function getSessionsByCUASProfile(cuasProfileId) {
  return getTestSessions().filter(
    (s) => s.cuas_placements.some((p) => p.cuas_profile_id === cuasProfileId)
  );
}
function getDroneProfileStats(droneProfileId) {
  const sessions = getSessionsByDroneProfile(droneProfileId);
  const passCount = sessions.filter((s) => s.metrics?.pass_fail === "pass").length;
  const failCount = sessions.filter((s) => s.metrics?.pass_fail === "fail").length;
  const totalWithResult = passCount + failCount;
  const timesToEffect = sessions.filter((s) => s.metrics?.time_to_effect_s != null).map((s) => s.metrics.time_to_effect_s);
  const dates = sessions.filter((s) => s.start_time).map((s) => new Date(s.start_time).getTime()).sort((a, b) => a - b);
  return {
    profileId: droneProfileId,
    totalTests: sessions.length,
    passCount,
    failCount,
    successRate: totalWithResult > 0 ? passCount / totalWithResult * 100 : null,
    avgTimeToEffect: timesToEffect.length > 0 ? timesToEffect.reduce((a, b) => a + b, 0) / timesToEffect.length : null,
    firstTestDate: dates.length > 0 ? new Date(dates[0]).toISOString() : null,
    lastTestDate: dates.length > 0 ? new Date(dates[dates.length - 1]).toISOString() : null
  };
}
function getCUASProfileStats(cuasProfileId) {
  const sessions = getSessionsByCUASProfile(cuasProfileId);
  const passCount = sessions.filter((s) => s.metrics?.pass_fail === "pass").length;
  const failCount = sessions.filter((s) => s.metrics?.pass_fail === "fail").length;
  const totalWithResult = passCount + failCount;
  const timesToEffect = sessions.filter((s) => s.metrics?.time_to_effect_s != null).map((s) => s.metrics.time_to_effect_s);
  const effectiveRanges = sessions.filter((s) => s.metrics?.effective_range_m != null).map((s) => s.metrics.effective_range_m);
  const dates = sessions.filter((s) => s.start_time).map((s) => new Date(s.start_time).getTime()).sort((a, b) => a - b);
  return {
    profileId: cuasProfileId,
    totalTests: sessions.length,
    passCount,
    failCount,
    successRate: totalWithResult > 0 ? passCount / totalWithResult * 100 : null,
    avgTimeToEffect: timesToEffect.length > 0 ? timesToEffect.reduce((a, b) => a + b, 0) / timesToEffect.length : null,
    avgEffectiveRange: effectiveRanges.length > 0 ? effectiveRanges.reduce((a, b) => a + b, 0) / effectiveRanges.length : null,
    firstTestDate: dates.length > 0 ? new Date(dates[0]).toISOString() : null,
    lastTestDate: dates.length > 0 ? new Date(dates[dates.length - 1]).toISOString() : null
  };
}
const TRACKER_ALIASES_FILE = "tracker-aliases.json";
function getTrackerAliases() {
  return readJsonFile(TRACKER_ALIASES_FILE, []);
}
function getTrackerAliasById(id) {
  return getTrackerAliases().find((a) => a.id === id);
}
function getTrackerAliasByTrackerId(trackerId) {
  return getTrackerAliases().find((a) => a.tracker_id === trackerId);
}
function createTrackerAlias(alias) {
  const aliases = getTrackerAliases();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const existing = aliases.find((a) => a.tracker_id === alias.tracker_id);
  if (existing) {
    throw new Error(`Alias already exists for tracker ${alias.tracker_id}`);
  }
  const newAlias = {
    ...alias,
    id: generateId$1(),
    created_at: now,
    updated_at: now
  };
  aliases.push(newAlias);
  writeJsonFile(TRACKER_ALIASES_FILE, aliases);
  log.info(`Created tracker alias: ${alias.alias} for tracker ${alias.tracker_id}`);
  return newAlias;
}
function updateTrackerAlias(id, updates) {
  const aliases = getTrackerAliases();
  const index = aliases.findIndex((a) => a.id === id);
  if (index === -1) {
    return void 0;
  }
  if (updates.tracker_id && updates.tracker_id !== aliases[index].tracker_id) {
    const conflict = aliases.find((a) => a.tracker_id === updates.tracker_id && a.id !== id);
    if (conflict) {
      throw new Error(`Alias already exists for tracker ${updates.tracker_id}`);
    }
  }
  aliases[index] = {
    ...aliases[index],
    ...updates,
    id,
    // Prevent ID from being changed
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  writeJsonFile(TRACKER_ALIASES_FILE, aliases);
  log.info(`Updated tracker alias: ${aliases[index].alias} for tracker ${aliases[index].tracker_id}`);
  return aliases[index];
}
function deleteTrackerAlias(id) {
  const aliases = getTrackerAliases();
  const filtered = aliases.filter((a) => a.id !== id);
  if (filtered.length === aliases.length) {
    return false;
  }
  writeJsonFile(TRACKER_ALIASES_FILE, filtered);
  log.info(`Deleted tracker alias with id: ${id}`);
  return true;
}
function getTrackerDisplayName(trackerId) {
  const alias = getTrackerAliasByTrackerId(trackerId);
  return alias?.alias ?? trackerId;
}
function createInitialGPSHealthState() {
  return {
    health_status: "lost",
    fix_valid: false,
    fix_type: "unknown",
    hdop: null,
    vdop: null,
    pdop: null,
    satellites: null,
    fix_lost_at: null,
    fix_acquired_at: null,
    last_good_fix_at: null,
    current_loss_duration_ms: null,
    last_recovery_time_ms: null,
    total_fix_loss_events: 0,
    total_fix_loss_duration_ms: 0,
    total_time_valid_ms: 0,
    total_time_tracked_ms: 0,
    fix_availability_percent: 0,
    health_score: 0,
    hdop_min: null,
    hdop_max: null,
    hdop_avg: null,
    satellites_min: null,
    satellites_max: null,
    satellites_avg: null
  };
}
const HDOP_GOOD_THRESHOLD = 5;
const HDOP_DEGRADED_THRESHOLD = 20;
const SATELLITES_GOOD_THRESHOLD = 6;
const SATELLITES_DEGRADED_THRESHOLD = 4;
const QUALITY_HISTORY_SIZE = 100;
const RSSI_HISTORY_SIZE = 60;
class GPSHealthTracker {
  trackerHealth = /* @__PURE__ */ new Map();
  config;
  onHealthChange;
  onAutoEvent;
  // Track sustained state durations for debounced event emission
  sustainedLost = /* @__PURE__ */ new Map();
  // trackerId -> first timestamp ms
  sustainedDegraded = /* @__PURE__ */ new Map();
  emittedLost = /* @__PURE__ */ new Set();
  // trackerIds that already emitted gps_lost
  emittedDegraded = /* @__PURE__ */ new Set();
  constructor(config = {}, onHealthChange, onAutoEvent) {
    this.config = {
      hdopGoodThreshold: config.hdopGoodThreshold ?? HDOP_GOOD_THRESHOLD,
      hdopDegradedThreshold: config.hdopDegradedThreshold ?? HDOP_DEGRADED_THRESHOLD,
      satellitesGoodThreshold: config.satellitesGoodThreshold ?? SATELLITES_GOOD_THRESHOLD,
      satellitesDegradedThreshold: config.satellitesDegradedThreshold ?? SATELLITES_DEGRADED_THRESHOLD,
      fixLossDurationMs: config.fixLossDurationMs ?? 3e3,
      degradedDurationMs: config.degradedDurationMs ?? 5e3,
      autoEmitEvents: config.autoEmitEvents ?? true
    };
    this.onHealthChange = onHealthChange;
    this.onAutoEvent = onAutoEvent;
  }
  /**
   * Set the auto-event callback for GPS state change events
   */
  setAutoEventCallback(callback) {
    this.onAutoEvent = callback;
  }
  /**
   * Update GPS denial detection thresholds at runtime
   */
  updateThresholds(config) {
    if (config.hdopGoodThreshold !== void 0) this.config.hdopGoodThreshold = config.hdopGoodThreshold;
    if (config.hdopDegradedThreshold !== void 0) this.config.hdopDegradedThreshold = config.hdopDegradedThreshold;
    if (config.satellitesGoodThreshold !== void 0) this.config.satellitesGoodThreshold = config.satellitesGoodThreshold;
    if (config.satellitesDegradedThreshold !== void 0) this.config.satellitesDegradedThreshold = config.satellitesDegradedThreshold;
    if (config.fixLossDurationMs !== void 0) this.config.fixLossDurationMs = config.fixLossDurationMs;
    if (config.degradedDurationMs !== void 0) this.config.degradedDurationMs = config.degradedDurationMs;
    if (config.autoEmitEvents !== void 0) this.config.autoEmitEvents = config.autoEmitEvents;
  }
  /**
   * Update GPS health for a tracker based on new telemetry data
   */
  updateHealth(trackerId, timestamp, fixValid, hdop, satellites, position, rssi, fixType = "unknown") {
    const now = new Date(timestamp).getTime();
    let data = this.trackerHealth.get(trackerId);
    if (!data) {
      data = this.createTrackerData();
      this.trackerHealth.set(trackerId, data);
    }
    const state = data.state;
    const previousStatus = state.health_status;
    const wasFixValid = state.fix_valid;
    if (data.firstUpdateTime === null) {
      data.firstUpdateTime = now;
    }
    data.lastUpdateTime = now;
    state.fix_valid = fixValid;
    state.fix_type = fixType;
    state.hdop = hdop;
    state.satellites = satellites;
    state.health_status = this.computeHealthStatus(fixValid, hdop, satellites);
    if (!wasFixValid && fixValid) {
      this.handleFixAcquired(data, timestamp, position, now);
    } else if (wasFixValid && !fixValid) {
      this.handleFixLost(data, timestamp, position, hdop, satellites, rssi, now);
    }
    if (!fixValid && state.fix_lost_at) {
      const lostTime = new Date(state.fix_lost_at).getTime();
      state.current_loss_duration_ms = now - lostTime;
    } else {
      state.current_loss_duration_ms = null;
    }
    this.updateQualityHistory(data, now, hdop, satellites);
    this.updateRSSIHistory(data, now, rssi, hdop, satellites);
    this.updateTimeTracking(data, fixValid, now);
    state.health_score = this.computeHealthScore(state, data);
    if (previousStatus !== state.health_status && this.onHealthChange) {
      const event = this.getCurrentLossEvent(data);
      this.onHealthChange(trackerId, previousStatus, state.health_status, event);
    }
    if (this.config.autoEmitEvents && this.onAutoEvent) {
      this.checkAndEmitAutoEvents(trackerId, previousStatus, state.health_status, now, hdop, satellites, rssi);
    }
    return state;
  }
  /**
   * Set DOP values from GPGSA sentence parsing
   */
  setDOPValues(trackerId, pdop, hdop, vdop) {
    const data = this.trackerHealth.get(trackerId);
    if (data) {
      if (pdop !== null) data.state.pdop = pdop;
      if (hdop !== null) data.state.hdop = hdop;
      if (vdop !== null) data.state.vdop = vdop;
    }
  }
  /**
   * Get health state for a tracker
   */
  getHealth(trackerId) {
    const data = this.trackerHealth.get(trackerId);
    return data?.state ?? null;
  }
  /**
   * Get health summary for API responses
   */
  getHealthSummary(trackerId) {
    const data = this.trackerHealth.get(trackerId);
    if (!data) return null;
    const state = data.state;
    return {
      health_status: state.health_status,
      fix_valid: state.fix_valid,
      fix_type: state.fix_type,
      hdop: state.hdop,
      satellites: state.satellites,
      current_loss_duration_ms: state.current_loss_duration_ms,
      total_fix_loss_events: state.total_fix_loss_events,
      fix_availability_percent: state.fix_availability_percent,
      health_score: state.health_score
    };
  }
  /**
   * Get all fix loss events for a tracker
   */
  getFixLossEvents(trackerId) {
    const data = this.trackerHealth.get(trackerId);
    return data?.fixLossEvents ?? [];
  }
  /**
   * Clear all tracking data
   */
  clearAll() {
    this.trackerHealth.clear();
  }
  /**
   * Clear tracking data for a specific tracker
   */
  clearTracker(trackerId) {
    this.trackerHealth.delete(trackerId);
  }
  /**
   * Reset session aggregates (for starting a new recording session)
   */
  resetSessionAggregates(trackerId) {
    const data = this.trackerHealth.get(trackerId);
    if (data) {
      data.state.total_fix_loss_events = 0;
      data.state.total_fix_loss_duration_ms = 0;
      data.state.total_time_valid_ms = 0;
      data.state.total_time_tracked_ms = 0;
      data.state.fix_availability_percent = 0;
      data.fixLossEvents = [];
      data.hdopSum = 0;
      data.hdopCount = 0;
      data.satellitesSum = 0;
      data.satellitesCount = 0;
      data.state.hdop_min = null;
      data.state.hdop_max = null;
      data.state.hdop_avg = null;
      data.state.satellites_min = null;
      data.state.satellites_max = null;
      data.state.satellites_avg = null;
      data.firstUpdateTime = null;
      data.lastUpdateTime = null;
    }
  }
  // =========================================================================
  // GPS Denial Auto-Event Emission
  // =========================================================================
  /**
   * Check GPS state transitions and emit auto-detected events with debouncing.
   * Events are only emitted after sustained state duration thresholds are met.
   */
  checkAndEmitAutoEvents(trackerId, previousStatus, newStatus, nowMs, hdop, satellites, rssi) {
    if (newStatus === "lost") {
      if (!this.sustainedLost.has(trackerId)) {
        this.sustainedLost.set(trackerId, nowMs);
      }
      const lostSince = this.sustainedLost.get(trackerId);
      if (nowMs - lostSince >= this.config.fixLossDurationMs && !this.emittedLost.has(trackerId)) {
        this.emittedLost.add(trackerId);
        this.onAutoEvent({
          type: "gps_lost",
          trackerId,
          timestamp: new Date(nowMs).toISOString(),
          metadata: {
            hdop,
            satellites,
            rssi_dbm: rssi,
            duration_ms: nowMs - lostSince,
            previous_status: previousStatus,
            new_status: newStatus
          }
        });
        log.info(`[GPSAutoEvent] gps_lost emitted for ${trackerId} after ${nowMs - lostSince}ms`);
      }
      this.sustainedDegraded.delete(trackerId);
      this.emittedDegraded.delete(trackerId);
    } else if (newStatus === "degraded") {
      if (!this.sustainedDegraded.has(trackerId)) {
        this.sustainedDegraded.set(trackerId, nowMs);
      }
      const degradedSince = this.sustainedDegraded.get(trackerId);
      if (nowMs - degradedSince >= this.config.degradedDurationMs && !this.emittedDegraded.has(trackerId)) {
        this.emittedDegraded.add(trackerId);
        this.onAutoEvent({
          type: "gps_degraded",
          trackerId,
          timestamp: new Date(nowMs).toISOString(),
          metadata: {
            hdop,
            satellites,
            rssi_dbm: rssi,
            duration_ms: nowMs - degradedSince,
            previous_status: previousStatus,
            new_status: newStatus
          }
        });
        log.info(`[GPSAutoEvent] gps_degraded emitted for ${trackerId} after ${nowMs - degradedSince}ms`);
      }
      if (this.emittedLost.has(trackerId)) {
        this.emittedLost.delete(trackerId);
        this.sustainedLost.delete(trackerId);
        this.onAutoEvent({
          type: "gps_acquired",
          trackerId,
          timestamp: new Date(nowMs).toISOString(),
          metadata: {
            hdop,
            satellites,
            rssi_dbm: rssi,
            previous_status: previousStatus,
            new_status: newStatus
          }
        });
        log.info(`[GPSAutoEvent] gps_acquired emitted for ${trackerId} (lost → degraded)`);
      }
    } else if (newStatus === "healthy") {
      if (this.emittedLost.has(trackerId)) {
        const lostSince = this.sustainedLost.get(trackerId);
        this.onAutoEvent({
          type: "gps_acquired",
          trackerId,
          timestamp: new Date(nowMs).toISOString(),
          metadata: {
            hdop,
            satellites,
            rssi_dbm: rssi,
            duration_ms: lostSince ? nowMs - lostSince : void 0,
            previous_status: previousStatus,
            new_status: newStatus
          }
        });
        log.info(`[GPSAutoEvent] gps_acquired emitted for ${trackerId} (lost → healthy)`);
      }
      if (this.emittedDegraded.has(trackerId)) {
        const degradedSince = this.sustainedDegraded.get(trackerId);
        this.onAutoEvent({
          type: "gps_recovered",
          trackerId,
          timestamp: new Date(nowMs).toISOString(),
          metadata: {
            hdop,
            satellites,
            rssi_dbm: rssi,
            duration_ms: degradedSince ? nowMs - degradedSince : void 0,
            previous_status: previousStatus,
            new_status: newStatus
          }
        });
        log.info(`[GPSAutoEvent] gps_recovered emitted for ${trackerId} (degraded → healthy)`);
      }
      this.sustainedLost.delete(trackerId);
      this.sustainedDegraded.delete(trackerId);
      this.emittedLost.delete(trackerId);
      this.emittedDegraded.delete(trackerId);
    }
  }
  // =========================================================================
  // Private Methods
  // =========================================================================
  createTrackerData() {
    return {
      state: createInitialGPSHealthState(),
      qualityHistory: [],
      fixLossEvents: [],
      firstUpdateTime: null,
      lastUpdateTime: null,
      hdopSum: 0,
      hdopCount: 0,
      satellitesSum: 0,
      satellitesCount: 0,
      rssiHistory: []
    };
  }
  /**
   * Compute health status based on fix validity, HDOP, and satellite count
   */
  computeHealthStatus(fixValid, hdop, satellites) {
    if (!fixValid) {
      return "lost";
    }
    if (hdop !== null) {
      if (hdop <= this.config.hdopGoodThreshold) {
        if (satellites === null || satellites >= this.config.satellitesGoodThreshold) {
          return "healthy";
        }
        return "degraded";
      }
      if (hdop <= this.config.hdopDegradedThreshold) {
        return "degraded";
      }
      return "degraded";
    }
    if (satellites !== null) {
      if (satellites >= this.config.satellitesGoodThreshold) {
        return "healthy";
      }
      if (satellites >= this.config.satellitesDegradedThreshold) {
        return "degraded";
      }
      return "degraded";
    }
    return "degraded";
  }
  /**
   * Handle fix acquisition (was lost, now valid)
   */
  handleFixAcquired(data, timestamp, position, now) {
    const state = data.state;
    if (state.fix_lost_at) {
      const lostTime = new Date(state.fix_lost_at).getTime();
      state.last_recovery_time_ms = now - lostTime;
      const lastEvent = data.fixLossEvents[data.fixLossEvents.length - 1];
      if (lastEvent && lastEvent.recovered_at === null) {
        lastEvent.recovered_at = timestamp;
        lastEvent.duration_ms = now - lostTime;
        lastEvent.recovery_position = position;
      }
      log.debug(`GPS fix acquired for tracker after ${state.last_recovery_time_ms}ms`);
    }
    state.fix_acquired_at = timestamp;
    state.fix_lost_at = null;
    state.current_loss_duration_ms = null;
  }
  /**
   * Handle fix loss (was valid, now lost)
   */
  handleFixLost(data, timestamp, position, hdop, satellites, rssi, now) {
    const state = data.state;
    state.fix_lost_at = timestamp;
    state.total_fix_loss_events++;
    const rssiBeforeLoss = data.rssiHistory.slice(-10).map((entry) => ({
      timestamp_ms: entry.timestamp,
      rssi_dbm: entry.rssi_dbm,
      hdop: entry.hdop,
      satellites: entry.satellites
    }));
    const event = {
      id: `gps-loss-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      lost_at: timestamp,
      recovered_at: null,
      duration_ms: 0,
      last_position: position,
      recovery_position: null,
      hdop_before_loss: hdop,
      satellites_before_loss: satellites,
      rssi_at_loss: rssi,
      rssi_history_before_loss: rssiBeforeLoss
    };
    data.fixLossEvents.push(event);
    log.debug(`GPS fix lost for tracker (HDOP: ${hdop}, Sats: ${satellites}, RSSI: ${rssi}, History: ${rssiBeforeLoss.length} entries)`);
  }
  /**
   * Update quality history and statistics
   */
  updateQualityHistory(data, now, hdop, satellites) {
    const state = data.state;
    data.qualityHistory.push({ timestamp: now, hdop, satellites });
    if (data.qualityHistory.length > QUALITY_HISTORY_SIZE) {
      data.qualityHistory.shift();
    }
    if (hdop !== null) {
      data.hdopSum += hdop;
      data.hdopCount++;
      state.hdop_avg = data.hdopSum / data.hdopCount;
      if (state.hdop_min === null || hdop < state.hdop_min) {
        state.hdop_min = hdop;
      }
      if (state.hdop_max === null || hdop > state.hdop_max) {
        state.hdop_max = hdop;
      }
    }
    if (satellites !== null) {
      data.satellitesSum += satellites;
      data.satellitesCount++;
      state.satellites_avg = data.satellitesSum / data.satellitesCount;
      if (state.satellites_min === null || satellites < state.satellites_min) {
        state.satellites_min = satellites;
      }
      if (state.satellites_max === null || satellites > state.satellites_max) {
        state.satellites_max = satellites;
      }
    }
  }
  /**
   * Update RSSI history buffer for tracking signal degradation before GPS loss
   */
  updateRSSIHistory(data, timestamp, rssi, hdop, satellites) {
    if (rssi !== null) {
      data.rssiHistory.push({
        timestamp,
        rssi_dbm: rssi,
        hdop,
        satellites
      });
      if (data.rssiHistory.length > RSSI_HISTORY_SIZE) {
        data.rssiHistory.shift();
      }
    }
  }
  /**
   * Get RSSI history for a tracker (for metrics calculation)
   */
  getRSSIHistory(trackerId) {
    const data = this.trackerHealth.get(trackerId);
    return data?.rssiHistory ?? [];
  }
  /**
   * Update time tracking for fix availability calculation
   */
  updateTimeTracking(data, fixValid, now) {
    const state = data.state;
    if (data.lastUpdateTime !== null && data.firstUpdateTime !== null) {
      const timeDelta = Math.min(now - (data.lastUpdateTime ?? now), 5e3);
      state.total_time_tracked_ms += timeDelta;
      if (fixValid) {
        state.total_time_valid_ms += timeDelta;
        state.last_good_fix_at = new Date(now).toISOString();
      } else {
        state.total_fix_loss_duration_ms += timeDelta;
      }
      if (state.total_time_tracked_ms > 0) {
        state.fix_availability_percent = state.total_time_valid_ms / state.total_time_tracked_ms * 100;
      }
    }
  }
  /**
   * Compute composite health score (0-100)
   */
  computeHealthScore(state, data) {
    const AVAILABILITY_WEIGHT = 0.4;
    const HDOP_WEIGHT = 0.3;
    const SATELLITE_WEIGHT = 0.2;
    const RECOVERY_WEIGHT = 0.1;
    let score = 0;
    score += state.fix_availability_percent * AVAILABILITY_WEIGHT;
    if (state.hdop_avg !== null) {
      const hdopScore = Math.max(0, 100 - (state.hdop_avg - 2) * (100 / 8));
      score += hdopScore * HDOP_WEIGHT;
    } else {
      score += 50 * HDOP_WEIGHT;
    }
    if (state.satellites_avg !== null) {
      const satScore = Math.min(100, state.satellites_avg / 8 * 100);
      score += satScore * SATELLITE_WEIGHT;
    } else {
      score += 50 * SATELLITE_WEIGHT;
    }
    if (data.fixLossEvents.length > 0) {
      const completedEvents = data.fixLossEvents.filter((e) => e.recovered_at !== null);
      if (completedEvents.length > 0) {
        const avgRecovery = completedEvents.reduce((sum, e) => sum + e.duration_ms, 0) / completedEvents.length;
        const recoveryScore = Math.max(0, 100 - (avgRecovery / 1e3 - 5) * (100 / 25));
        score += recoveryScore * RECOVERY_WEIGHT;
      } else {
        score += 25 * RECOVERY_WEIGHT;
      }
    } else {
      score += 100 * RECOVERY_WEIGHT;
    }
    return Math.round(Math.max(0, Math.min(100, score)));
  }
  /**
   * Get the current (most recent) fix loss event if one is ongoing
   */
  getCurrentLossEvent(data) {
    if (data.fixLossEvents.length === 0) return null;
    const lastEvent = data.fixLossEvents[data.fixLossEvents.length - 1];
    return lastEvent.recovered_at === null ? lastEvent : null;
  }
}
class StateManager {
  constructor(staleSeconds, onTrackerUpdated, onTrackerStale, onGPSHealthChange, lowBatteryMv = 3300, criticalBatteryMv = 3e3) {
    this.staleSeconds = staleSeconds;
    this.onTrackerUpdated = onTrackerUpdated;
    this.onTrackerStale = onTrackerStale;
    this.onGPSHealthChange = onGPSHealthChange;
    this.lowBatteryMv = lowBatteryMv;
    this.criticalBatteryMv = criticalBatteryMv;
    this.gpsHealthTracker = new GPSHealthTracker({}, onGPSHealthChange);
  }
  trackers = /* @__PURE__ */ new Map();
  staleInterval = null;
  running = false;
  gpsHealthTracker;
  start() {
    if (this.running) return;
    this.running = true;
    this.staleInterval = setInterval(() => this.checkStaleness(), 5e3);
  }
  stop() {
    this.running = false;
    if (this.staleInterval) {
      clearInterval(this.staleInterval);
      this.staleInterval = null;
    }
  }
  updateTracker(record) {
    const trackerId = record.tracker_id;
    let state = this.trackers.get(trackerId);
    if (!state) {
      state = this.createEmptyState(trackerId, record.time_local_received);
      this.trackers.set(trackerId, state);
    }
    state.time_local_received = record.time_local_received;
    state.time_gps = record.time_gps;
    if (record.fix_valid) {
      state.lat = record.lat;
      state.lon = record.lon;
      state.alt_m = record.alt_m;
      state.speed_mps = record.speed_mps;
      state.course_deg = record.course_deg;
      state.hdop = record.hdop;
      state.fix_valid = true;
      state.last_known_lat = record.lat;
      state.last_known_lon = record.lon;
      state.last_known_alt_m = record.alt_m;
      state.last_known_time = record.time_local_received;
    } else {
      state.fix_valid = false;
    }
    if (record.satellites !== null) {
      state.satellites = record.satellites;
    }
    if (record.rssi_dbm !== null) state.rssi_dbm = record.rssi_dbm;
    if (record.baro_alt_m !== null) state.baro_alt_m = record.baro_alt_m;
    if (record.baro_temp_c !== null) state.baro_temp_c = record.baro_temp_c;
    if (record.baro_press_hpa !== null) state.baro_press_hpa = record.baro_press_hpa;
    if (record.battery_mv !== null) {
      state.battery_mv = record.battery_mv;
      state.battery_critical = record.battery_mv <= this.criticalBatteryMv;
      state.low_battery = record.battery_mv <= this.lowBatteryMv;
    }
    if (record.latency_ms !== null) {
      state.latency_ms = record.latency_ms;
    }
    state.age_seconds = 0;
    const wasStale = state.is_stale;
    state.is_stale = false;
    if (wasStale) {
      state.stale_since = null;
    }
    const position = record.fix_valid && record.lat !== null && record.lon !== null ? { lat: record.lat, lon: record.lon, alt_m: record.alt_m } : null;
    state.gps_health = this.gpsHealthTracker.updateHealth(
      trackerId,
      record.time_local_received,
      record.fix_valid,
      record.hdop,
      record.satellites,
      position,
      record.rssi_dbm,
      "unknown"
      // fix_type would come from GPGSA parsing
    );
    if (this.onTrackerUpdated) {
      this.onTrackerUpdated(state);
    }
  }
  getTracker(trackerId) {
    return this.trackers.get(trackerId);
  }
  getAllTrackers() {
    return Array.from(this.trackers.values());
  }
  getTrackerSummaries() {
    const summaries = [];
    for (const state of this.trackers.values()) {
      const gpsHealthSummary = this.gpsHealthTracker.getHealthSummary(state.tracker_id) ?? {
        health_status: "lost",
        fix_valid: false,
        fix_type: "unknown",
        hdop: null,
        satellites: null,
        current_loss_duration_ms: null,
        total_fix_loss_events: 0,
        fix_availability_percent: 0,
        health_score: 0
      };
      const aliasRecord = getTrackerAliasByTrackerId(state.tracker_id);
      summaries.push({
        tracker_id: state.tracker_id,
        alias: aliasRecord?.alias,
        // Include alias if set
        lat: state.lat,
        lon: state.lon,
        alt_m: state.alt_m,
        rssi_dbm: state.rssi_dbm,
        fix_valid: state.fix_valid,
        is_stale: state.is_stale,
        age_seconds: state.age_seconds,
        last_update: state.time_local_received,
        battery_mv: state.battery_mv,
        speed_mps: state.speed_mps,
        heading_deg: state.course_deg,
        last_known_lat: state.last_known_lat,
        last_known_lon: state.last_known_lon,
        last_known_alt_m: state.last_known_alt_m,
        last_known_time: state.last_known_time,
        stale_since: state.stale_since,
        low_battery: state.low_battery,
        battery_critical: state.battery_critical,
        baro_alt_m: state.baro_alt_m,
        gps_health: gpsHealthSummary
      });
    }
    summaries.sort((a, b) => a.tracker_id.localeCompare(b.tracker_id));
    return summaries;
  }
  getTrackerCount() {
    return this.trackers.size;
  }
  clearAll() {
    this.trackers.clear();
  }
  getTrackerIds() {
    return Array.from(this.trackers.keys());
  }
  checkStaleness() {
    const now = Date.now();
    for (const state of this.trackers.values()) {
      const lastUpdate = new Date(state.time_local_received).getTime();
      const age = (now - lastUpdate) / 1e3;
      state.age_seconds = age;
      const wasStale = state.is_stale;
      const isNowStale = age > this.staleSeconds;
      if (isNowStale && !wasStale) {
        state.is_stale = true;
        state.stale_since = (/* @__PURE__ */ new Date()).toISOString();
        if (this.onTrackerStale) {
          this.onTrackerStale(state);
        }
      }
    }
  }
  createEmptyState(trackerId, timeReceived) {
    return {
      tracker_id: trackerId,
      time_local_received: timeReceived,
      time_gps: null,
      time_received: null,
      lat: null,
      lon: null,
      alt_m: null,
      speed_mps: null,
      course_deg: null,
      hdop: null,
      satellites: null,
      rssi_dbm: null,
      baro_alt_m: null,
      baro_temp_c: null,
      baro_press_hpa: null,
      fix_valid: false,
      is_stale: false,
      age_seconds: 0,
      battery_mv: null,
      latency_ms: null,
      last_known_lat: null,
      last_known_lon: null,
      last_known_alt_m: null,
      last_known_time: null,
      stale_since: null,
      low_battery: false,
      battery_critical: false,
      gps_health: createInitialGPSHealthState()
    };
  }
  /**
   * Get GPS health tracker for direct access (e.g., for API endpoints)
   */
  getGPSHealthTracker() {
    return this.gpsHealthTracker;
  }
  /**
   * Clear all state including GPS health tracking
   */
  clearAllWithHealth() {
    this.trackers.clear();
    this.gpsHealthTracker.clearAll();
  }
  /**
   * Reset GPS health session aggregates for a new recording session
   */
  resetGPSHealthSession(trackerId) {
    if (trackerId) {
      this.gpsHealthTracker.resetSessionAggregates(trackerId);
    } else {
      for (const id of this.trackers.keys()) {
        this.gpsHealthTracker.resetSessionAggregates(id);
      }
    }
  }
}
const FIELD_MAPPINGS = {
  tracker_id: [
    "tracker_id",
    "id",
    "tracker",
    "device_id",
    "unit_id",
    "unique_id",
    "unique id",
    "report_stationid",
    "user_loggerid",
    "logger_id",
    "loggerid",
    "station_id",
    "stationid"
  ],
  time: [
    "time",
    "timestamp",
    "datetime",
    "time_local",
    "received_time",
    "time local received",
    "time_local_received",
    "measurement_datetime",
    "measurement_receiveddatetime"
  ],
  time_gps: ["time_gps", "gps_time", "gps_timestamp"],
  lat: ["lat", "latitude", "gps_lat"],
  lon: ["lon", "lng", "longitude", "gps_lon"],
  alt: ["alt", "altitude", "alt_m", "altitude_m", "gps_alt"],
  speed: ["speed", "speed_mps", "speed_m_s", "gps_sog", "sog"],
  course: ["course", "heading", "course_deg", "gps_cog", "cog"],
  hdop: ["hdop", "dop", "gps_hdop"],
  satellites: ["satellites", "sats", "num_sats", "gps_satellites", "sat_count", "numsat"],
  fix_valid: [
    "fix_valid",
    "fix",
    "gps_fix",
    "valid",
    "gps_fix_valid",
    "gps fix valid",
    "gps_fixvalid",
    "fixvalid"
  ],
  rssi: ["rssi", "rssi_dbm", "signal", "rf_rssi"],
  time_received: [
    "time_received",
    "received_time",
    "rx_time",
    "receive_time",
    "measurement_receiveddatetime",
    "received_datetime"
  ],
  baro_alt: [
    "baro_alt",
    "baro_altitude",
    "baro_alt_m",
    "barometric_altitude",
    "barometric altitude",
    "barometer_altitude"
  ],
  baro_temp: ["baro_temp", "baro_temperature", "temp_c", "barometer_temperature"],
  baro_press: ["baro_press", "baro_pressure", "pressure_hpa", "barometer_pressure"],
  battery_mv: ["battery_mv", "battery", "voltage_mv"]
};
function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
function parseDatetime(value) {
  if (!value) return null;
  value = value.trim();
  const isoMatch = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:Z|[+-]\d{2}:\d{2})?$/
  );
  if (isoMatch) {
    const [, yr, mo, dy, hr, mn, sc, ms] = isoMatch;
    const msStr = ms ? `.${ms.padEnd(3, "0").slice(0, 3)}` : ".000";
    return `${yr}-${mo}-${dy}T${hr}:${mn}:${sc}${msStr}`;
  }
  const usMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
  if (usMatch) {
    const [, mo, dy, yr, hr, mn, sc] = usMatch;
    return `${yr}-${mo.padStart(2, "0")}-${dy.padStart(2, "0")}T${hr}:${mn}:${sc}.000`;
  }
  const euMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
  if (euMatch) {
    const [, dy, mo, yr, hr, mn, sc] = euMatch;
    return `${yr}-${mo.padStart(2, "0")}-${dy.padStart(2, "0")}T${hr}:${mn}:${sc}.000`;
  }
  try {
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      return d.toISOString().replace("Z", "");
    }
  } catch {
  }
  return null;
}
class CSVParser {
  fieldIndices = /* @__PURE__ */ new Map();
  parseCSVContent(content) {
    const records = [];
    const lines = content.split("\n").filter((l) => l.trim());
    if (lines.length < 2) return records;
    const headers = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase());
    this.buildFieldIndices(headers);
    for (let i = 1; i < lines.length; i++) {
      try {
        const row = parseCSVLine(lines[i]);
        const record = this.parseRow(row);
        if (record) records.push(record);
      } catch {
      }
    }
    return records;
  }
  buildFieldIndices(headers) {
    this.fieldIndices.clear();
    for (const [fieldName, variants] of Object.entries(FIELD_MAPPINGS)) {
      for (const variant of variants) {
        const idx = headers.indexOf(variant);
        if (idx !== -1) {
          this.fieldIndices.set(fieldName, idx);
          break;
        }
      }
    }
  }
  parseRow(row) {
    if (!this.fieldIndices.has("tracker_id")) return null;
    const trackerIdIdx = this.fieldIndices.get("tracker_id");
    if (trackerIdIdx >= row.length) return null;
    let trackerId = row[trackerIdIdx].trim();
    if (!trackerId) return null;
    trackerId = trackerId.replace(/^\((.+)\)$/, "$1");
    const timeLocal = this.getDatetime(row, "time") || (/* @__PURE__ */ new Date()).toISOString();
    const timeGps = this.getDatetime(row, "time_gps");
    const timeReceived = this.getDatetime(row, "time_received");
    const lat = this.getFloat(row, "lat");
    const lon = this.getFloat(row, "lon");
    const altM = this.getFloat(row, "alt");
    const speedMps = this.getFloat(row, "speed");
    const courseDeg = this.getFloat(row, "course");
    const hdop = this.getFloat(row, "hdop");
    const satellites = this.getInt(row, "satellites");
    const fixValid = this.getBool(row, "fix_valid");
    const rssiDbm = this.getFloat(row, "rssi");
    const baroAltM = this.getFloat(row, "baro_alt");
    const baroTempC = this.getFloat(row, "baro_temp");
    const baroPressHpa = this.getFloat(row, "baro_press");
    const batteryMv = this.getFloat(row, "battery_mv");
    let latencyMs = null;
    if (timeLocal && timeReceived) {
      const localMs = new Date(timeLocal).getTime();
      const receivedMs = new Date(timeReceived).getTime();
      if (!isNaN(localMs) && !isNaN(receivedMs)) {
        latencyMs = receivedMs - localMs;
      }
    }
    return {
      tracker_id: trackerId,
      time_local_received: timeLocal,
      time_gps: timeGps,
      time_received: timeReceived,
      lat,
      lon,
      alt_m: altM,
      speed_mps: speedMps,
      course_deg: courseDeg,
      hdop,
      satellites,
      rssi_dbm: rssiDbm,
      baro_alt_m: baroAltM,
      baro_temp_c: baroTempC,
      baro_press_hpa: baroPressHpa,
      fix_valid: fixValid,
      battery_mv: batteryMv,
      latency_ms: latencyMs
    };
  }
  getFloat(row, field) {
    if (!this.fieldIndices.has(field)) return null;
    const idx = this.fieldIndices.get(field);
    if (idx >= row.length) return null;
    const val = row[idx].trim();
    if (!val) return null;
    const num = parseFloat(val);
    return isNaN(num) ? null : num;
  }
  getInt(row, field) {
    if (!this.fieldIndices.has(field)) return null;
    const idx = this.fieldIndices.get(field);
    if (idx >= row.length) return null;
    const val = row[idx].trim();
    if (!val) return null;
    const num = Math.round(parseFloat(val));
    return isNaN(num) ? null : num;
  }
  getBool(row, field) {
    if (!this.fieldIndices.has(field)) return false;
    const idx = this.fieldIndices.get(field);
    if (idx >= row.length) return false;
    const val = row[idx].trim().toLowerCase();
    return ["true", "1", "yes", "y", "valid", "ok"].includes(val);
  }
  getDatetime(row, field) {
    if (!this.fieldIndices.has(field)) return null;
    const idx = this.fieldIndices.get(field);
    if (idx >= row.length) return null;
    return parseDatetime(row[idx]);
  }
}
function nmeaToDecimal(coord, direction) {
  if (!coord || !direction) return null;
  try {
    const dir = direction.toUpperCase();
    let degrees;
    let minutes;
    if (dir === "N" || dir === "S") {
      degrees = parseInt(coord.substring(0, 2), 10);
      minutes = parseFloat(coord.substring(2));
    } else {
      degrees = parseInt(coord.substring(0, 3), 10);
      minutes = parseFloat(coord.substring(3));
    }
    let decimal = degrees + minutes / 60;
    if (dir === "S" || dir === "W") {
      decimal = -decimal;
    }
    return decimal;
  } catch {
    return null;
  }
}
class NMEAParser {
  parseNMEAContent(content) {
    const records = [];
    let currentBlock = {};
    for (const rawLine of content.split("\n")) {
      let line = rawLine.trim();
      if (!line || !line.startsWith("$")) continue;
      if (line.includes("*")) {
        line = line.split("*")[0] + "*";
      }
      try {
        const record = this.parseSentence(line, currentBlock);
        if (record) {
          records.push(record);
          currentBlock = {};
        }
      } catch {
      }
    }
    return records;
  }
  parseSentence(sentence, block) {
    const cleaned = sentence.replace(/^\$/, "").replace(/\*$/, "");
    const parts = cleaned.split(",");
    if (!parts.length) return null;
    const msgType = parts[0].toUpperCase();
    switch (msgType) {
      case "RFMSGFROM":
        if (parts.length >= 2) {
          block.tracker_id = parts[1];
        }
        break;
      case "BAROALT":
        if (parts.length >= 3) {
          const pressurePa = parseFloat(parts[1]);
          if (!isNaN(pressurePa)) {
            block.baro_press_hpa = pressurePa / 100;
            block.baro_alt_m = 44330 * (1 - Math.pow(pressurePa / 101325, 0.1903));
          }
          const temp = parseFloat(parts[2]);
          if (!isNaN(temp)) {
            block.baro_temp_c = temp;
          }
        }
        break;
      case "BATMV":
        if (parts.length >= 2) {
          const mv = parseFloat(parts[1]);
          if (!isNaN(mv)) block.battery_mv = mv;
        }
        break;
      case "HRFSSI":
        if (parts.length >= 2) {
          const rssi = parseFloat(parts[1]);
          if (!isNaN(rssi)) block.rssi_dbm = rssi;
        }
        break;
      case "GPGGA":
        if (parts.length >= 10) {
          const lat = nmeaToDecimal(parts[2], parts[3]);
          if (lat !== null) block.lat = lat;
          const lon = nmeaToDecimal(parts[4], parts[5]);
          if (lon !== null) block.lon = lon;
          const fixQuality = parseInt(parts[6], 10) || 0;
          block.fix_valid = fixQuality > 0;
          if (parts[7]) {
            const sats = parseInt(parts[7], 10);
            if (!isNaN(sats)) block.satellites = sats;
          }
          if (parts[8]) {
            const hdop = parseFloat(parts[8]);
            if (!isNaN(hdop)) block.hdop = hdop;
          }
          if (parts[9]) {
            const alt = parseFloat(parts[9]);
            if (!isNaN(alt)) block.alt_m = alt;
          }
        }
        break;
      case "GPRMC":
        if (parts.length >= 10) {
          const status = (parts[2] || "V").toUpperCase();
          if (status === "A") {
            block.fix_valid = true;
            const lat = nmeaToDecimal(parts[3], parts[4]);
            if (lat !== null) block.lat = lat;
            const lon = nmeaToDecimal(parts[5], parts[6]);
            if (lon !== null) block.lon = lon;
          }
          if (parts[7]) {
            const speedKnots = parseFloat(parts[7]);
            if (!isNaN(speedKnots)) block.speed_mps = speedKnots * 0.514444;
          }
          if (parts[8]) {
            const course = parseFloat(parts[8]);
            if (!isNaN(course)) block.course_deg = course;
          }
          if (parts[1] && parts[9]) {
            const timeStr = parts[1].split(".")[0];
            const dateStr = parts[9];
            if (timeStr.length >= 6 && dateStr.length >= 6) {
              const hour = parseInt(timeStr.substring(0, 2), 10);
              const minute = parseInt(timeStr.substring(2, 4), 10);
              const second = parseInt(timeStr.substring(4, 6), 10);
              const day = parseInt(dateStr.substring(0, 2), 10);
              const month = parseInt(dateStr.substring(2, 4), 10);
              let year = parseInt(dateStr.substring(4, 6), 10);
              year = year < 100 ? 2e3 + year : year;
              const d = new Date(year, month - 1, day, hour, minute, second);
              if (!isNaN(d.getTime())) {
                block.time_gps = d.toISOString();
              }
            }
          }
        }
        break;
      case "RXTIMESTAMP":
        if (parts.length >= 7) {
          const year = parseInt(parts[1], 10);
          const month = parseInt(parts[2], 10);
          const day = parseInt(parts[3], 10);
          const hour = parseInt(parts[4], 10);
          const minute = parseInt(parts[5], 10);
          const secParts = parts[6].split(".");
          const second = parseInt(secParts[0], 10);
          const ms = secParts.length > 1 ? Math.round(parseFloat("0." + secParts[1]) * 1e3) : 0;
          const d = new Date(year, month - 1, day, hour, minute, second, ms);
          if (!isNaN(d.getTime())) {
            block.timestamp = d.toISOString();
          }
        }
        break;
      case "GPSLAT":
      case "GPS_LAT":
        if (parts.length >= 2) {
          const lat = parseFloat(parts[1]);
          if (!isNaN(lat)) block.lat = lat;
        }
        break;
      case "GPSLON":
      case "GPS_LON":
        if (parts.length >= 2) {
          const lon = parseFloat(parts[1]);
          if (!isNaN(lon)) block.lon = lon;
        }
        break;
      case "GPSALT":
      case "GPS_ALT":
        if (parts.length >= 2) {
          const alt = parseFloat(parts[1]);
          if (!isNaN(alt)) block.alt_m = alt;
        }
        break;
      case "GPSSPEED":
      case "GPS_SPEED":
        if (parts.length >= 2) {
          const speed = parseFloat(parts[1]);
          if (!isNaN(speed)) block.speed_mps = speed;
        }
        break;
      case "GPSCOURSE":
      case "GPS_COURSE":
        if (parts.length >= 2) {
          const course = parseFloat(parts[1]);
          if (!isNaN(course)) block.course_deg = course;
        }
        break;
      case "GPSFIX":
      case "GPS_FIX":
        if (parts.length >= 2) {
          const val = parts[1].toLowerCase();
          block.fix_valid = ["1", "true", "yes", "valid"].includes(val);
        }
        break;
      case "RFMSGEND":
        if (block.tracker_id) {
          return this.createRecord(block);
        }
        break;
      case "GPGSV":
        break;
      case "GPGSA":
        if (parts.length >= 18) {
          const fixMode = parseInt(parts[2], 10);
          if (!isNaN(fixMode)) {
            block.fix_mode = fixMode;
            if (fixMode === 1) {
              block.fix_valid = false;
            } else if (fixMode >= 2) {
              block.fix_valid = true;
            }
          }
          const pdop = parseFloat(parts[15]);
          if (!isNaN(pdop)) {
            block.pdop = pdop;
          }
          const hdopGsa = parseFloat(parts[16]);
          if (!isNaN(hdopGsa)) {
            if (block.hdop === void 0) {
              block.hdop = hdopGsa;
            }
          }
          const vdop = parseFloat(parts[17]);
          if (!isNaN(vdop)) {
            block.vdop = vdop;
          }
        }
        break;
    }
    return null;
  }
  createRecord(block) {
    if (!block.tracker_id) return null;
    const timestamp = block.timestamp || (/* @__PURE__ */ new Date()).toISOString();
    return {
      tracker_id: block.tracker_id,
      time_local_received: timestamp,
      time_gps: block.time_gps || null,
      time_received: timestamp,
      lat: block.lat ?? null,
      lon: block.lon ?? null,
      alt_m: block.alt_m ?? null,
      speed_mps: block.speed_mps ?? null,
      course_deg: block.course_deg ?? null,
      hdop: block.hdop ?? null,
      satellites: block.satellites ?? null,
      rssi_dbm: block.rssi_dbm ?? null,
      baro_alt_m: block.baro_alt_m ?? null,
      baro_temp_c: block.baro_temp_c ?? null,
      baro_press_hpa: block.baro_press_hpa ?? null,
      fix_valid: block.fix_valid ?? false,
      battery_mv: block.battery_mv ?? null,
      latency_ms: null
    };
  }
}
class KMLImporter {
  trackerCounter = 0;
  async parseKMLContent(content) {
    const parser = new fastXmlParser.XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      isArray: (name) => ["Placemark", "Folder", "Data", "SimpleData", "Point", "LineString", "when", "coord"].includes(name),
      removeNSPrefix: true
    });
    let parsed;
    try {
      parsed = parser.parse(content);
    } catch (e) {
      log.error("Failed to parse KML XML:", e);
      return [];
    }
    this.trackerCounter = 0;
    const records = [];
    const kml = parsed.kml;
    if (!kml) return records;
    const document = kml.Document || kml;
    this.extractPlacemarks(document, records, null);
    return records;
  }
  async parseKMZFile(buffer) {
    try {
      const zip = await JSZip.loadAsync(buffer);
      const kmlFiles = Object.keys(zip.files).filter((f) => f.toLowerCase().endsWith(".kml"));
      if (kmlFiles.length === 0) {
        log.error("No KML file found inside KMZ archive");
        return [];
      }
      const kmlContent = await zip.files[kmlFiles[0]].async("string");
      return this.parseKMLContent(kmlContent);
    } catch (e) {
      log.error("Error reading KMZ file:", e);
      return [];
    }
  }
  extractPlacemarks(node, records, folderName) {
    if (!node) return;
    const folders = this.ensureArray(node.Folder);
    for (const folder of folders) {
      const name = folder.name || folderName;
      this.extractPlacemarks(folder, records, name);
    }
    const placemarks = this.ensureArray(node.Placemark);
    for (const placemark of placemarks) {
      const placemarkRecords = this.parsePlacemark(placemark, folderName);
      records.push(...placemarkRecords);
    }
  }
  parsePlacemark(placemark, folderName) {
    const records = [];
    const trackerId = this.extractTrackerId(placemark, folderName);
    if (placemark.Point) {
      const points = this.ensureArray(placemark.Point);
      for (const point of points) {
        if (point.coordinates) {
          const coord = this.parseSingleCoordinate(String(point.coordinates).trim());
          if (coord) {
            const timestamp = this.extractTimestamp(placemark);
            records.push(this.createRecord(trackerId, coord.lat, coord.lon, coord.alt, timestamp));
          }
        }
      }
    }
    if (placemark.LineString) {
      const lineStrings = this.ensureArray(placemark.LineString);
      for (const ls of lineStrings) {
        if (ls.coordinates) {
          const coords = this.parseCoordinateList(String(ls.coordinates));
          const timestamp = this.extractTimestamp(placemark) || (/* @__PURE__ */ new Date()).toISOString();
          for (const coord of coords) {
            records.push(this.createRecord(trackerId, coord.lat, coord.lon, coord.alt, timestamp));
          }
        }
      }
    }
    if (placemark.MultiGeometry) {
      const mg = placemark.MultiGeometry;
      if (mg.Point) {
        const points = this.ensureArray(mg.Point);
        for (const point of points) {
          if (point.coordinates) {
            const coord = this.parseSingleCoordinate(String(point.coordinates).trim());
            if (coord) {
              const timestamp = this.extractTimestamp(placemark);
              records.push(this.createRecord(trackerId, coord.lat, coord.lon, coord.alt, timestamp));
            }
          }
        }
      }
      if (mg.LineString) {
        const lineStrings = this.ensureArray(mg.LineString);
        for (const ls of lineStrings) {
          if (ls.coordinates) {
            const coords = this.parseCoordinateList(String(ls.coordinates));
            const timestamp = this.extractTimestamp(placemark) || (/* @__PURE__ */ new Date()).toISOString();
            for (const coord of coords) {
              records.push(this.createRecord(trackerId, coord.lat, coord.lon, coord.alt, timestamp));
            }
          }
        }
      }
    }
    const track = placemark.Track || placemark["gx:Track"];
    if (track) {
      const trackRecords = this.parseGxTrack(track, trackerId);
      records.push(...trackRecords);
    }
    return records;
  }
  parseGxTrack(track, trackerId) {
    const records = [];
    const whens = this.ensureArray(track.when || []);
    const coords = this.ensureArray(track.coord || track["gx:coord"] || []);
    const count = Math.min(whens.length, coords.length);
    for (let i = 0; i < count; i++) {
      const timestamp = this.parseISOTimestamp(String(whens[i])) || (/* @__PURE__ */ new Date()).toISOString();
      const coordText = String(coords[i]).trim();
      const parts = coordText.split(/\s+/);
      if (parts.length >= 2) {
        const lon = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);
        const alt = parts.length >= 3 ? parseFloat(parts[2]) : null;
        if (!isNaN(lon) && !isNaN(lat)) {
          records.push(this.createRecord(trackerId, lat, lon, alt, timestamp));
        }
      }
    }
    if (records.length === 0 && coords.length > 0) {
      for (const coordElem of coords) {
        const parts = String(coordElem).trim().split(/\s+/);
        if (parts.length >= 2) {
          const lon = parseFloat(parts[0]);
          const lat = parseFloat(parts[1]);
          const alt = parts.length >= 3 ? parseFloat(parts[2]) : null;
          if (!isNaN(lon) && !isNaN(lat)) {
            records.push(this.createRecord(trackerId, lat, lon, alt, (/* @__PURE__ */ new Date()).toISOString()));
          }
        }
      }
    }
    return records;
  }
  extractTrackerId(placemark, folderName) {
    let trackerId = null;
    if (placemark.ExtendedData) {
      const dataItems = this.ensureArray(placemark.ExtendedData.Data || []);
      for (const item of dataItems) {
        const name = (item["@_name"] || "").toLowerCase();
        if (["tracker_id", "id", "tracker", "device_id", "unit_id"].includes(name)) {
          const val = item.value;
          if (val) {
            trackerId = String(val).trim();
            break;
          }
        }
      }
      if (!trackerId && placemark.ExtendedData.SchemaData) {
        const simpleData = this.ensureArray(placemark.ExtendedData.SchemaData.SimpleData || []);
        for (const item of simpleData) {
          const name = (item["@_name"] || "").toLowerCase();
          if (["tracker_id", "id", "tracker", "device_id", "unit_id"].includes(name)) {
            if (item["#text"]) {
              trackerId = String(item["#text"]).trim();
              break;
            }
          }
        }
      }
    }
    if (!trackerId && placemark.name) {
      trackerId = String(placemark.name).trim();
    }
    if (!trackerId && folderName) {
      trackerId = folderName;
    }
    if (!trackerId) {
      this.trackerCounter++;
      trackerId = `kml_import_${this.trackerCounter}`;
    }
    return trackerId.replace(/^\((.+)\)$/, "$1");
  }
  extractTimestamp(placemark) {
    if (placemark.TimeStamp?.when) {
      return this.parseISOTimestamp(String(placemark.TimeStamp.when));
    }
    if (placemark.TimeSpan?.begin) {
      return this.parseISOTimestamp(String(placemark.TimeSpan.begin));
    }
    return null;
  }
  parseISOTimestamp(text) {
    if (!text) return null;
    text = text.trim();
    try {
      const d = new Date(text);
      if (!isNaN(d.getTime())) {
        return d.toISOString();
      }
    } catch {
    }
    return null;
  }
  parseSingleCoordinate(text) {
    const parts = text.split(",");
    if (parts.length < 2) return null;
    const lon = parseFloat(parts[0]);
    const lat = parseFloat(parts[1]);
    if (isNaN(lon) || isNaN(lat)) return null;
    const alt = parts.length >= 3 ? parseFloat(parts[2]) : null;
    return { lon, lat, alt: alt !== null && !isNaN(alt) ? alt : null };
  }
  parseCoordinateList(text) {
    const coords = [];
    for (const token of text.trim().split(/\s+/)) {
      const coord = this.parseSingleCoordinate(token);
      if (coord) coords.push(coord);
    }
    return coords;
  }
  createRecord(trackerId, lat, lon, alt, timestamp) {
    const ts = timestamp || (/* @__PURE__ */ new Date()).toISOString();
    return {
      tracker_id: trackerId,
      time_local_received: ts,
      time_gps: ts,
      time_received: null,
      lat,
      lon,
      alt_m: alt,
      speed_mps: null,
      course_deg: null,
      hdop: null,
      satellites: null,
      rssi_dbm: null,
      baro_alt_m: null,
      baro_temp_c: null,
      baro_press_hpa: null,
      fix_valid: true,
      battery_mv: null,
      latency_ms: null
    };
  }
  ensureArray(val) {
    if (val === void 0 || val === null) return [];
    return Array.isArray(val) ? val : [val];
  }
}
class FileOffsetTracker {
  offsets = /* @__PURE__ */ new Map();
  getOffset(filePath) {
    return this.offsets.get(filePath) || 0;
  }
  setOffset(filePath, offset) {
    this.offsets.set(filePath, offset);
  }
  resetOffset(filePath) {
    this.offsets.set(filePath, 0);
  }
  removeFile(filePath) {
    this.offsets.delete(filePath);
  }
}
class LogTailer {
  csvParser = new CSVParser();
  nmeaParser = new NMEAParser();
  kmlImporter = new KMLImporter();
  offsetTracker = new FileOffsetTracker();
  headerCache = /* @__PURE__ */ new Map();
  async tailFile(filePath) {
    if (!fs__namespace.existsSync(filePath)) {
      this.offsetTracker.removeFile(filePath);
      return [];
    }
    const ext = path__namespace.extname(filePath).toLowerCase();
    if (ext === ".kml" || ext === ".kmz") {
      return this.parseCompleteFile(filePath);
    }
    try {
      const stat = fs__namespace.statSync(filePath);
      const fileSize = stat.size;
      const currentOffset = this.offsetTracker.getOffset(filePath);
      if (fileSize < currentOffset) {
        this.offsetTracker.resetOffset(filePath);
        return this.parseCompleteFile(filePath);
      }
      if (fileSize === currentOffset) {
        return [];
      }
      if (currentOffset === 0) {
        const records = await this.parseCompleteFile(filePath);
        this.offsetTracker.setOffset(filePath, fileSize);
        if (ext === ".csv") {
          const content = fs__namespace.readFileSync(filePath, "utf-8");
          const firstLine = content.split("\n")[0];
          if (firstLine) this.headerCache.set(filePath, firstLine);
        }
        return records;
      }
      const fd = fs__namespace.openSync(filePath, "r");
      const buffer = Buffer.alloc(fileSize - currentOffset);
      fs__namespace.readSync(fd, buffer, 0, buffer.length, currentOffset);
      fs__namespace.closeSync(fd);
      let newContent = buffer.toString("utf-8");
      const lines = newContent.split("\n");
      if (!newContent.endsWith("\n") && lines.length > 1) {
        const incompleteLine = lines.pop();
        newContent = lines.join("\n");
        this.offsetTracker.setOffset(filePath, fileSize - Buffer.byteLength(incompleteLine, "utf-8"));
      } else {
        this.offsetTracker.setOffset(filePath, fileSize);
      }
      return this.parseNewLines(filePath, newContent);
    } catch (e) {
      log.error(`Error tailing file ${filePath}:`, e);
      return [];
    }
  }
  async parseCompleteFile(filePath) {
    try {
      const ext = path__namespace.extname(filePath).toLowerCase();
      if (ext === ".kmz") {
        const buffer = fs__namespace.readFileSync(filePath);
        return this.kmlImporter.parseKMZFile(buffer);
      }
      const content = fs__namespace.readFileSync(filePath, "utf-8");
      if (ext === ".nmea") {
        return this.nmeaParser.parseNMEAContent(content);
      } else if (ext === ".kml") {
        return this.kmlImporter.parseKMLContent(content);
      } else {
        return this.csvParser.parseCSVContent(content);
      }
    } catch (e) {
      log.error(`Error parsing complete file ${filePath}:`, e);
      return [];
    }
  }
  parseNewLines(filePath, newContent) {
    if (!newContent.trim()) return [];
    try {
      const ext = path__namespace.extname(filePath).toLowerCase();
      if (ext === ".nmea") {
        return this.nmeaParser.parseNMEAContent(newContent);
      }
      const header = this.headerCache.get(filePath);
      if (!header) {
        const content = fs__namespace.readFileSync(filePath, "utf-8");
        const firstLine = content.split("\n")[0];
        if (firstLine) {
          this.headerCache.set(filePath, firstLine);
          return this.csvParser.parseCSVContent(firstLine + "\n" + newContent);
        }
        return [];
      }
      return this.csvParser.parseCSVContent(header + "\n" + newContent);
    } catch (e) {
      log.error(`Error parsing new lines from ${filePath}:`, e);
      return [];
    }
  }
}
class LogWatcher {
  constructor(eventFolder, onRecords, onNewFile) {
    this.eventFolder = eventFolder;
    this.onRecords = onRecords;
    this.onNewFile = onNewFile;
  }
  tailer = new LogTailer();
  watcher = null;
  running = false;
  async start() {
    if (this.running) return;
    this.running = true;
    await this.initialScan();
    this.watcher = chokidar.watch(this.eventFolder, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100
      }
    });
    this.watcher.on("add", (filePath) => this.handleFileChange("add", filePath));
    this.watcher.on("change", (filePath) => this.handleFileChange("change", filePath));
    log.info(`Started watching: ${this.eventFolder}`);
  }
  async stop() {
    this.running = false;
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    log.info(`Stopped watching: ${this.eventFolder}`);
  }
  async initialScan() {
    if (!fs__namespace.existsSync(this.eventFolder)) {
      log.warn(`Event folder does not exist: ${this.eventFolder}`);
      return;
    }
    const extensions = [".csv", ".nmea", ".kml", ".kmz"];
    const files = fs__namespace.readdirSync(this.eventFolder).filter((f) => extensions.includes(path__namespace.extname(f).toLowerCase())).map((f) => path__namespace.join(this.eventFolder, f));
    log.info(`Initial scan found ${files.length} data files`);
    for (const filePath of files) {
      try {
        const records = await this.tailer.tailFile(filePath);
        if (records.length > 0) {
          log.info(`Initial read: ${records.length} records from ${path__namespace.basename(filePath)}`);
          this.onRecords(records);
        }
      } catch (e) {
        log.error(`Error processing ${filePath}:`, e);
      }
    }
  }
  async handleFileChange(type, filePath) {
    const ext = path__namespace.extname(filePath).toLowerCase();
    if (![".csv", ".nmea", ".kml", ".kmz"].includes(ext)) return;
    try {
      if (type === "add" && this.onNewFile) {
        this.onNewFile(filePath);
      }
      const records = await this.tailer.tailFile(filePath);
      if (records.length > 0) {
        log.info(`Read ${records.length} new records from ${path__namespace.basename(filePath)}`);
        this.onRecords(records);
      }
    } catch (e) {
      log.error(`Error handling change for ${filePath}:`, e);
    }
  }
}
class SessionScanner {
  constructor(logRoot, activeThresholdMinutes = 30) {
    this.logRoot = logRoot;
    this.activeThresholdMs = activeThresholdMinutes * 60 * 1e3;
  }
  activeThresholdMs;
  scanSessions() {
    if (!fs__namespace.existsSync(this.logRoot)) {
      return [];
    }
    const session = this.analyzeFolder(this.logRoot);
    return session ? [session] : [];
  }
  analyzeFolder(folderPath) {
    try {
      const entries = fs__namespace.readdirSync(folderPath);
      const dataFiles = entries.filter((f) => {
        const ext = path__namespace.extname(f).toLowerCase();
        return [".csv", ".nmea", ".kml", ".kmz"].includes(ext);
      });
      if (dataFiles.length === 0) return null;
      let lastActivity = null;
      let totalSize = 0;
      for (const file of dataFiles) {
        try {
          const stat = fs__namespace.statSync(path__namespace.join(folderPath, file));
          totalSize += stat.size;
          const mtime = stat.mtime;
          if (!lastActivity || mtime > lastActivity) {
            lastActivity = mtime;
          }
        } catch {
          continue;
        }
      }
      if (!lastActivity) return null;
      const timeSinceActivity = Date.now() - lastActivity.getTime();
      const isActive = timeSinceActivity <= this.activeThresholdMs;
      return {
        name: path__namespace.basename(folderPath),
        path: folderPath,
        last_activity: lastActivity.toISOString(),
        file_count: dataFiles.length,
        is_active: isActive,
        size_bytes: totalSize
      };
    } catch (e) {
      log.error(`Error analyzing folder ${folderPath}:`, e);
      return null;
    }
  }
  findMostRecentActive() {
    const sessions = this.scanSessions();
    return sessions.length > 0 ? sessions[0] : null;
  }
}
class SessionLoader {
  constructor(logRoot) {
    this.logRoot = logRoot;
  }
  parser = new CSVParser();
  async scanSessions() {
    const sessions = [];
    if (!fs__namespace.existsSync(this.logRoot)) return sessions;
    try {
      const csvInRoot = fs__namespace.readdirSync(this.logRoot).filter((f) => path__namespace.extname(f).toLowerCase() === ".csv");
      if (csvInRoot.length > 0) {
        const session = await this.analyzeSession(this.logRoot);
        if (session) {
          sessions.push(session);
        }
      }
      const entries = fs__namespace.readdirSync(this.logRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
        const entryPath = path__namespace.join(this.logRoot, entry.name);
        const session = await this.analyzeSession(entryPath);
        if (session) {
          sessions.push(session);
        } else {
          try {
            const subEntries = fs__namespace.readdirSync(entryPath, { withFileTypes: true });
            for (const subEntry of subEntries) {
              if (!subEntry.isDirectory() || subEntry.name.startsWith(".")) continue;
              const subSession = await this.analyzeSession(path__namespace.join(entryPath, subEntry.name));
              if (subSession) sessions.push(subSession);
            }
          } catch {
          }
        }
      }
      try {
        const testSessions = getTestSessions().filter(
          (s) => (s.status === "completed" || s.status === "capturing") && s.live_data_path
        );
        for (const ts of testSessions) {
          const alreadyFound = sessions.find((s) => s.path === ts.live_data_path);
          if (!alreadyFound && ts.live_data_path && fs__namespace.existsSync(ts.live_data_path)) {
            const session = await this.analyzeSession(ts.live_data_path);
            if (session) {
              session.name = ts.name;
              session.session_id = ts.id;
              sessions.push(session);
              log.info(`[Replay] Found session from library-store: ${ts.name} at ${ts.live_data_path}`);
            }
          }
        }
      } catch (libError) {
        log.warn("[Replay] Could not check library-store for sessions:", libError);
      }
      sessions.sort((a, b) => b.start_time.localeCompare(a.start_time));
      return sessions;
    } catch (e) {
      log.error("Error scanning sessions:", e);
      return [];
    }
  }
  async analyzeSession(sessionPath) {
    try {
      const csvFiles = fs__namespace.readdirSync(sessionPath).filter((f) => path__namespace.extname(f).toLowerCase() === ".csv").map((f) => path__namespace.join(sessionPath, f));
      if (csvFiles.length === 0) return null;
      let totalSize = 0;
      const trackerIds = /* @__PURE__ */ new Set();
      const allTimes = [];
      let totalRecords = 0;
      for (const csvFile of csvFiles) {
        try {
          const stat = fs__namespace.statSync(csvFile);
          totalSize += stat.size;
          const content = fs__namespace.readFileSync(csvFile, "utf-8");
          const lines = content.split("\n").filter((l) => l.trim());
          if (lines.length <= 1) continue;
          const header = lines[0];
          if (lines.length > 1) {
            const records = this.parser.parseCSVContent(header + "\n" + lines[1]);
            if (records.length > 0) {
              trackerIds.add(records[0].tracker_id);
              const t = new Date(records[0].time_local_received).getTime();
              if (!isNaN(t)) allTimes.push(t);
            }
          }
          if (lines.length > 2) {
            const records = this.parser.parseCSVContent(header + "\n" + lines[lines.length - 1]);
            if (records.length > 0) {
              const t = new Date(records[0].time_local_received).getTime();
              if (!isNaN(t)) allTimes.push(t);
            }
          }
          totalRecords += lines.length - 1;
        } catch {
          continue;
        }
      }
      if (allTimes.length === 0) return null;
      const startTime = Math.min(...allTimes);
      const endTime = Math.max(...allTimes);
      const duration = (endTime - startTime) / 1e3;
      return {
        session_id: path__namespace.basename(sessionPath),
        name: path__namespace.basename(sessionPath),
        path: sessionPath,
        duration_seconds: duration,
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
        tracker_ids: Array.from(trackerIds).sort(),
        file_count: csvFiles.length,
        total_records: totalRecords,
        size_bytes: totalSize
      };
    } catch (e) {
      log.error(`Error analyzing session ${sessionPath}:`, e);
      return null;
    }
  }
  async loadTimeline(session, selectedTrackers, progressCallback) {
    const allRecords = [];
    const csvFiles = fs__namespace.readdirSync(session.path).filter((f) => path__namespace.extname(f).toLowerCase() === ".csv").map((f) => path__namespace.join(session.path, f));
    for (const csvFile of csvFiles) {
      try {
        const content = fs__namespace.readFileSync(csvFile, "utf-8");
        const records = this.parser.parseCSVContent(content);
        for (const record of records) {
          if (!selectedTrackers || selectedTrackers.includes(record.tracker_id)) {
            allRecords.push(record);
          }
        }
      } catch (e) {
        log.error(`Error loading ${csvFile}:`, e);
      }
    }
    if (allRecords.length === 0) return [];
    allRecords.sort((a, b) => a.time_local_received.localeCompare(b.time_local_received));
    return await this.buildFrames(allRecords, 0.5, progressCallback);
  }
  /**
   * Build frame groups from records - OPTIMIZED with index tracking
   * Uses O(n) algorithm instead of O(n³) by tracking position per tracker.
   * Includes progress reporting and chunked processing.
   */
  async buildFrames(records, frameInterval = 0.5, progressCallback) {
    if (records.length === 0) return [];
    const frames = [];
    const startTime = new Date(records[0].time_local_received).getTime();
    const endTime = new Date(records[records.length - 1].time_local_received).getTime();
    const byTracker = /* @__PURE__ */ new Map();
    for (const record of records) {
      const list = byTracker.get(record.tracker_id) || [];
      list.push({
        record,
        timestamp: new Date(record.time_local_received).getTime()
      });
      byTracker.set(record.tracker_id, list);
    }
    for (const [, trackerRecords] of byTracker) {
      trackerRecords.sort((a, b) => a.timestamp - b.timestamp);
    }
    const intervalMs = frameInterval * 1e3;
    let currentTime = startTime;
    let frameIndex = 0;
    const CHUNK_SIZE = 100;
    const PROGRESS_INTERVAL = 50;
    const totalFrames = Math.ceil((endTime - startTime) / intervalMs);
    const trackerIndices = /* @__PURE__ */ new Map();
    for (const trackerId of byTracker.keys()) {
      trackerIndices.set(trackerId, 0);
    }
    log.info(`[Replay] Building ${totalFrames} frames for ${byTracker.size} trackers (${records.length} records)`);
    while (currentTime <= endTime) {
      const frameRecords = /* @__PURE__ */ new Map();
      for (const [trackerId, trackerRecords] of byTracker) {
        let idx = trackerIndices.get(trackerId) || 0;
        while (idx < trackerRecords.length - 1 && trackerRecords[idx + 1].timestamp <= currentTime) {
          idx++;
        }
        trackerIndices.set(trackerId, idx);
        const currentRecord = trackerRecords[idx];
        if (currentRecord) {
          const delta = Math.abs(currentRecord.timestamp - currentTime);
          if (idx < trackerRecords.length - 1) {
            const nextRecord = trackerRecords[idx + 1];
            const nextDelta = Math.abs(nextRecord.timestamp - currentTime);
            if (nextDelta < delta && nextDelta < intervalMs * 2) {
              frameRecords.set(trackerId, nextRecord.record);
            } else if (delta < intervalMs * 2) {
              frameRecords.set(trackerId, currentRecord.record);
            }
          } else if (delta < intervalMs * 2) {
            frameRecords.set(trackerId, currentRecord.record);
          }
        }
      }
      if (frameRecords.size > 0) {
        frames.push({
          frame_index: frameIndex,
          timestamp: new Date(currentTime).toISOString(),
          records: frameRecords,
          duration_seconds: frameInterval
        });
      }
      currentTime += intervalMs;
      frameIndex++;
      if (progressCallback && frameIndex % PROGRESS_INTERVAL === 0) {
        progressCallback(frameIndex, totalFrames);
      }
      if (frameIndex % CHUNK_SIZE === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }
    if (progressCallback) {
      progressCallback(totalFrames, totalFrames);
    }
    log.info(`[Replay] Built ${frames.length} frames for ${byTracker.size} trackers`);
    return frames;
  }
}
class ReplayEngine {
  constructor(frames, stateManager) {
    this.frames = frames;
    this.stateManager = stateManager;
  }
  currentFrameIndex = 0;
  playbackSpeed = 1;
  isPlaying = false;
  playbackTimer = null;
  broadcastCallback = null;
  setBroadcastCallback(callback) {
    this.broadcastCallback = callback;
  }
  play() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.scheduleNextFrame();
  }
  pause() {
    this.isPlaying = false;
    if (this.playbackTimer) {
      clearTimeout(this.playbackTimer);
      this.playbackTimer = null;
    }
  }
  seek(frameIndex) {
    if (frameIndex < 0 || frameIndex >= this.frames.length) return;
    const wasPlaying = this.isPlaying;
    if (wasPlaying) this.pause();
    this.currentFrameIndex = frameIndex;
    this.emitFrame(this.frames[frameIndex]);
    if (wasPlaying) this.play();
  }
  setSpeed(speed) {
    this.playbackSpeed = Math.max(0.1, Math.min(10, speed));
  }
  getCurrentState() {
    const currentFrame = this.currentFrameIndex < this.frames.length ? this.frames[this.currentFrameIndex] : null;
    return {
      is_playing: this.isPlaying,
      current_frame: this.currentFrameIndex,
      total_frames: this.frames.length,
      playback_speed: this.playbackSpeed,
      current_time: currentFrame?.timestamp || null,
      progress_percent: this.frames.length > 0 ? this.currentFrameIndex / this.frames.length * 100 : 0
    };
  }
  scheduleNextFrame() {
    if (!this.isPlaying || this.currentFrameIndex >= this.frames.length) {
      if (this.currentFrameIndex >= this.frames.length) {
        this.isPlaying = false;
        if (this.broadcastCallback) {
          this.broadcastCallback({ type: "replay_completed" });
        }
      }
      return;
    }
    const frame = this.frames[this.currentFrameIndex];
    this.emitFrame(frame);
    const sleepTime = Math.max(1, Math.min(1e3, frame.duration_seconds / this.playbackSpeed * 1e3));
    this.playbackTimer = setTimeout(() => {
      this.currentFrameIndex++;
      if (this.broadcastCallback) {
        this.broadcastCallback({
          type: "replay_progress",
          frame: this.currentFrameIndex,
          total: this.frames.length
        });
      }
      this.scheduleNextFrame();
    }, sleepTime);
  }
  emitFrame(frame) {
    for (const [, record] of frame.records) {
      this.stateManager.updateTracker(record);
    }
  }
}
function getDefaultLogFolder() {
  if (process.platform === "darwin") {
    return path__namespace.join(os__namespace.homedir(), "Documents", "SCENSUS_Logs");
  } else if (process.platform === "win32") {
    return "C:\\Temp";
  } else {
    return path__namespace.join(os__namespace.homedir(), "SCENSUS_Logs");
  }
}
const DEFAULT_GPS_DENIAL_THRESHOLDS = {
  hdop_degraded: 5,
  hdop_lost: 20,
  satellites_degraded: 4,
  satellites_lost: 2,
  fix_loss_duration_s: 3,
  degraded_duration_s: 5
};
const DEFAULT_CONFIG$2 = {
  log_root_folder: getDefaultLogFolder(),
  active_event: null,
  port: 8082,
  bind_host: "127.0.0.1",
  stale_seconds: 60,
  enable_map: true,
  low_battery_mv: 3300,
  critical_battery_mv: 3e3,
  gps_denial_thresholds: { ...DEFAULT_GPS_DENIAL_THRESHOLDS },
  auto_compute_metrics: true,
  // Ops Mode defaults
  ops_mode: false,
  ops_bind_host: "0.0.0.0",
  cot_listen_port: 4242,
  cot_enabled: false,
  cot_multicast_group: void 0,
  iff_proximity_threshold_m: 50
};
function getConfigPath() {
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    const configDir = path__namespace.join(localAppData, "SCENSUS");
    if (!fs__namespace.existsSync(configDir)) {
      fs__namespace.mkdirSync(configDir, { recursive: true });
    }
    return path__namespace.join(configDir, "config.json");
  }
  return path__namespace.join(os__namespace.homedir(), ".scensus", "config.json");
}
function loadConfig(configPath) {
  const cfgPath = configPath || getConfigPath();
  if (fs__namespace.existsSync(cfgPath)) {
    try {
      const data = fs__namespace.readFileSync(cfgPath, "utf-8");
      const parsed = JSON.parse(data);
      return { ...DEFAULT_CONFIG$2, ...parsed };
    } catch (e) {
      log.warn(`Failed to load config from ${cfgPath}:`, e);
      return { ...DEFAULT_CONFIG$2 };
    }
  }
  return { ...DEFAULT_CONFIG$2 };
}
function saveConfigAtomic(config, configPath) {
  const cfgPath = getConfigPath();
  const configDir = path__namespace.dirname(cfgPath);
  try {
    if (!fs__namespace.existsSync(configDir)) {
      fs__namespace.mkdirSync(configDir, { recursive: true });
    }
    const existing = loadConfig(cfgPath);
    const merged = { ...existing, ...config };
    const tempPath = cfgPath + ".tmp";
    fs__namespace.writeFileSync(tempPath, JSON.stringify(merged, null, 2), "utf-8");
    if (fs__namespace.existsSync(cfgPath)) {
      const backupPath = cfgPath + ".bak";
      fs__namespace.copyFileSync(cfgPath, backupPath);
    }
    fs__namespace.renameSync(tempPath, cfgPath);
    return true;
  } catch (e) {
    log.error(`Failed to save config:`, e);
    return false;
  }
}
const DEFAULT_CONFIG$1 = {
  altitudeAnomalyThresholdM: 50,
  positionJumpThresholdM: 500,
  alertCooldownMs: 5e3,
  enabledTypes: /* @__PURE__ */ new Set([
    "gps_lost",
    "gps_acquired",
    "gps_degraded",
    "gps_recovered",
    "altitude_anomaly",
    "position_jump",
    "link_lost",
    "link_restored",
    "low_battery",
    "battery_critical"
  ])
};
class AnomalyDetector {
  trackerHistory = /* @__PURE__ */ new Map();
  alertCooldowns = /* @__PURE__ */ new Map();
  // key: tracker_id:type, value: last alert time
  alertCounter = 0;
  config;
  onAlertCallback;
  enabled = true;
  constructor(config = {}, onAlert) {
    this.config = { ...DEFAULT_CONFIG$1, ...config };
    this.onAlertCallback = onAlert;
  }
  setEnabled(enabled) {
    this.enabled = enabled;
    log.info(`AnomalyDetector ${enabled ? "enabled" : "disabled"}`);
  }
  isEnabled() {
    return this.enabled;
  }
  setConfig(config) {
    this.config = { ...this.config, ...config };
  }
  setAlertCallback(callback) {
    this.onAlertCallback = callback;
  }
  /**
   * Process a tracker update and detect anomalies
   */
  processUpdate(state) {
    if (!this.enabled) return [];
    const alerts = [];
    const trackerId = state.tracker_id;
    const now = Date.now();
    let history = this.trackerHistory.get(trackerId);
    if (!history) {
      const initialHealthStatus = this.getGPSHealthStatus(state);
      history = {
        lastPosition: null,
        lastFixValid: state.fix_valid,
        lastIsStale: state.is_stale,
        lastBatteryState: this.getBatteryState(state),
        lastGPSHealthStatus: initialHealthStatus,
        lastUpdateTime: now,
        gpsLostTime: null,
        gpsDegradedTime: null,
        staleSince: null
      };
      this.trackerHistory.set(trackerId, history);
      this.updateHistory(history, state, now);
      return alerts;
    }
    if (this.config.enabledTypes.has("gps_lost") || this.config.enabledTypes.has("gps_acquired")) {
      if (history.lastFixValid && !state.fix_valid) {
        history.gpsLostTime = now;
        const alert = this.createAlert("gps_lost", "warning", trackerId, "GPS signal lost", {
          last_position: history.lastPosition
        });
        if (alert && this.config.enabledTypes.has("gps_lost")) {
          alerts.push(alert);
        }
      } else if (!history.lastFixValid && state.fix_valid) {
        const lostDuration = history.gpsLostTime ? Math.round((now - history.gpsLostTime) / 1e3) : null;
        history.gpsLostTime = null;
        const alert = this.createAlert("gps_acquired", "info", trackerId, "GPS signal acquired", {
          lost_duration_seconds: lostDuration
        });
        if (alert && this.config.enabledTypes.has("gps_acquired")) {
          alerts.push(alert);
        }
      }
    }
    const currentHealthStatus = this.getGPSHealthStatus(state);
    if (this.config.enabledTypes.has("gps_degraded") || this.config.enabledTypes.has("gps_recovered")) {
      if (history.lastGPSHealthStatus === "healthy" && currentHealthStatus === "degraded") {
        history.gpsDegradedTime = now;
        const hdop = "gps_health" in state ? state.gps_health?.hdop : null;
        const satellites = "gps_health" in state ? state.gps_health?.satellites : null;
        const alert = this.createAlert(
          "gps_degraded",
          "warning",
          trackerId,
          `GPS quality degraded (HDOP: ${hdop?.toFixed(1) ?? "N/A"}, Sats: ${satellites ?? "N/A"})`,
          {
            hdop,
            satellites,
            rssi_dbm: state.rssi_dbm
          }
        );
        if (alert && this.config.enabledTypes.has("gps_degraded")) {
          alerts.push(alert);
        }
      } else if (history.lastGPSHealthStatus === "degraded" && currentHealthStatus === "healthy") {
        const degradedDuration = history.gpsDegradedTime ? Math.round((now - history.gpsDegradedTime) / 1e3) : null;
        history.gpsDegradedTime = null;
        const hdop = "gps_health" in state ? state.gps_health?.hdop : null;
        const satellites = "gps_health" in state ? state.gps_health?.satellites : null;
        const alert = this.createAlert(
          "gps_recovered",
          "info",
          trackerId,
          "GPS quality recovered",
          {
            degraded_duration_seconds: degradedDuration,
            hdop,
            satellites
          }
        );
        if (alert && this.config.enabledTypes.has("gps_recovered")) {
          alerts.push(alert);
        }
      }
    }
    if (this.config.enabledTypes.has("link_lost") || this.config.enabledTypes.has("link_restored")) {
      if (!history.lastIsStale && state.is_stale) {
        history.staleSince = now;
        const alert = this.createAlert("link_lost", "critical", trackerId, "Telemetry link lost", {
          last_update: history.lastUpdateTime,
          age_seconds: state.age_seconds
        });
        if (alert && this.config.enabledTypes.has("link_lost")) {
          alerts.push(alert);
        }
      } else if (history.lastIsStale && !state.is_stale) {
        const staleDuration = history.staleSince ? Math.round((now - history.staleSince) / 1e3) : null;
        history.staleSince = null;
        const alert = this.createAlert("link_restored", "info", trackerId, "Telemetry link restored", {
          stale_duration_seconds: staleDuration
        });
        if (alert && this.config.enabledTypes.has("link_restored")) {
          alerts.push(alert);
        }
      }
    }
    if (state.fix_valid && state.lat !== null && state.lon !== null && history.lastPosition) {
      if (this.config.enabledTypes.has("altitude_anomaly") && state.alt_m !== null && history.lastPosition.alt_m !== null) {
        const altDelta = Math.abs(state.alt_m - history.lastPosition.alt_m);
        if (altDelta > this.config.altitudeAnomalyThresholdM) {
          const alert = this.createAlert(
            "altitude_anomaly",
            "warning",
            trackerId,
            `Sudden altitude change: ${altDelta.toFixed(1)}m`,
            {
              previous_alt_m: history.lastPosition.alt_m,
              current_alt_m: state.alt_m,
              delta_m: altDelta
            }
          );
          if (alert) alerts.push(alert);
        }
      }
      if (this.config.enabledTypes.has("position_jump")) {
        const distance = this.calculateDistance(
          history.lastPosition.lat,
          history.lastPosition.lon,
          state.lat,
          state.lon
        );
        if (distance > this.config.positionJumpThresholdM) {
          const alert = this.createAlert(
            "position_jump",
            "warning",
            trackerId,
            `Sudden position jump: ${distance.toFixed(0)}m`,
            {
              previous_lat: history.lastPosition.lat,
              previous_lon: history.lastPosition.lon,
              current_lat: state.lat,
              current_lon: state.lon,
              distance_m: distance
            }
          );
          if (alert) alerts.push(alert);
        }
      }
    }
    const currentBatteryState = this.getBatteryState(state);
    if (currentBatteryState !== history.lastBatteryState) {
      if (currentBatteryState === "critical" && this.config.enabledTypes.has("battery_critical")) {
        const alert = this.createAlert(
          "battery_critical",
          "critical",
          trackerId,
          "Battery critically low",
          { battery_mv: "battery_mv" in state ? state.battery_mv : null }
        );
        if (alert) alerts.push(alert);
      } else if (currentBatteryState === "low" && this.config.enabledTypes.has("low_battery")) {
        const alert = this.createAlert(
          "low_battery",
          "warning",
          trackerId,
          "Battery low",
          { battery_mv: "battery_mv" in state ? state.battery_mv : null }
        );
        if (alert) alerts.push(alert);
      }
    }
    this.updateHistory(history, state, now);
    for (const alert of alerts) {
      if (this.onAlertCallback) {
        this.onAlertCallback(alert);
      }
    }
    return alerts;
  }
  /**
   * Process a tracker going stale (called from StateManager's onTrackerStale)
   */
  processStale(trackerId, ageSeconds) {
    if (!this.enabled) return null;
    if (!this.config.enabledTypes.has("link_lost")) return null;
    const history = this.trackerHistory.get(trackerId);
    if (history && !history.lastIsStale) {
      history.lastIsStale = true;
      history.staleSince = Date.now();
      const alert = this.createAlert("link_lost", "critical", trackerId, "Telemetry link lost", {
        age_seconds: ageSeconds
      });
      if (alert && this.onAlertCallback) {
        this.onAlertCallback(alert);
      }
      return alert;
    }
    return null;
  }
  /**
   * Clear history for a tracker
   */
  clearTracker(trackerId) {
    this.trackerHistory.delete(trackerId);
  }
  /**
   * Clear all history
   */
  clearAll() {
    this.trackerHistory.clear();
    this.alertCooldowns.clear();
  }
  createAlert(type, level, trackerId, message, metadata) {
    const cooldownKey = `${trackerId}:${type}`;
    const lastAlert = this.alertCooldowns.get(cooldownKey);
    const now = Date.now();
    if (lastAlert && now - lastAlert < this.config.alertCooldownMs) {
      return null;
    }
    this.alertCooldowns.set(cooldownKey, now);
    this.alertCounter++;
    return {
      id: `alert-${this.alertCounter}-${Date.now()}`,
      type,
      level,
      tracker_id: trackerId,
      message,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      metadata
    };
  }
  updateHistory(history, state, now) {
    history.lastFixValid = state.fix_valid;
    history.lastIsStale = state.is_stale;
    history.lastBatteryState = this.getBatteryState(state);
    history.lastGPSHealthStatus = this.getGPSHealthStatus(state);
    history.lastUpdateTime = now;
    if (state.fix_valid && state.lat !== null && state.lon !== null) {
      history.lastPosition = {
        lat: state.lat,
        lon: state.lon,
        alt_m: state.alt_m
      };
    }
  }
  /**
   * Get GPS health status from state
   */
  getGPSHealthStatus(state) {
    if ("gps_health" in state && state.gps_health) {
      return state.gps_health.health_status;
    }
    return state.fix_valid ? "healthy" : "lost";
  }
  getBatteryState(state) {
    if ("battery_critical" in state && state.battery_critical) return "critical";
    if ("low_battery" in state && state.low_battery) return "low";
    return "normal";
  }
  /**
   * Calculate distance between two points using Haversine formula
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
  toRadians(degrees) {
    return degrees * Math.PI / 180;
  }
}
function csvEscape(val) {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}
function filterPositionsBySessionTime(positions, startTimeISO, endTimeISO) {
  const startMs = startTimeISO ? new Date(startTimeISO).getTime() - 2e3 : -Infinity;
  const endMs = endTimeISO ? new Date(endTimeISO).getTime() + 2e3 : Infinity;
  return positions.filter((p) => p.timestamp_ms >= startMs && p.timestamp_ms <= endMs);
}
function recoverPositionsFromCSV(liveDataPath, startTimeISO, endTimeISO) {
  const result = /* @__PURE__ */ new Map();
  if (!fs__namespace.existsSync(liveDataPath)) {
    return result;
  }
  const csvFiles = fs__namespace.readdirSync(liveDataPath).filter((f) => f.startsWith("tracker_") && f.endsWith(".csv"));
  for (const csvFile of csvFiles) {
    const csvPath = path__namespace.join(liveDataPath, csvFile);
    const content = fs__namespace.readFileSync(csvPath, "utf-8");
    const lines = content.trim().split("\n");
    if (lines.length < 2) continue;
    const headers = lines[0].split(",");
    const positions = [];
    for (let i = 1; i < lines.length; i++) {
      try {
        const vals = lines[i].split(",");
        const row = {};
        headers.forEach((h, idx) => {
          row[h] = vals[idx] || "";
        });
        const timestamp = row.time_local_received || "";
        if (!timestamp) continue;
        const trackerId = row.tracker_id || "";
        const tsMs = new Date(timestamp).getTime();
        if (startTimeISO) {
          const startMs = new Date(startTimeISO).getTime() - 2e3;
          if (tsMs < startMs) continue;
        }
        if (endTimeISO) {
          const endMs = new Date(endTimeISO).getTime() + 2e3;
          if (tsMs > endMs) continue;
        }
        positions.push({
          tracker_id: trackerId,
          timestamp,
          latitude: row.lat ? parseFloat(row.lat) : 0,
          longitude: row.lon ? parseFloat(row.lon) : 0,
          altitude_m: row.alt_m ? parseFloat(row.alt_m) : 0,
          speed_ms: row.speed_mps ? parseFloat(row.speed_mps) : 0,
          heading_deg: row.course_deg ? parseFloat(row.course_deg) : 0,
          gps_quality: row.fix_valid === "true" ? "good" : "poor",
          source: "live",
          rssi_dbm: row.rssi_dbm ? parseFloat(row.rssi_dbm) : 0,
          hdop: row.hdop ? parseFloat(row.hdop) : 0,
          satellites: row.satellites ? parseInt(row.satellites, 10) : 0,
          fix_valid: row.fix_valid === "true",
          battery_mv: row.battery_mv ? parseInt(row.battery_mv, 10) : 0
        });
      } catch (rowErr) {
        log.warn(`Skipping malformed CSV row ${i} in ${csvFile}`);
      }
    }
    if (positions.length > 0) {
      const trackerId = positions[0].tracker_id;
      const existing = result.get(trackerId) || [];
      existing.push(...positions);
      result.set(trackerId, existing);
    }
  }
  return result;
}
class SessionDataCollector {
  recordings = /* @__PURE__ */ new Map();
  // Track which trackers are assigned to each session for filtering
  sessionTrackerIds = /* @__PURE__ */ new Map();
  // Periodic snapshot intervals per session
  snapshotIntervals = /* @__PURE__ */ new Map();
  // Track last snapshot position count per tracker per session to only write new data
  lastSnapshotCounts = /* @__PURE__ */ new Map();
  /**
   * Start recording for a session
   * @param sessionId The session ID to start recording
   * @param trackerIds Optional array of tracker IDs assigned to this session (for filtering)
   */
  startSession(sessionId, trackerIds = []) {
    if (this.recordings.has(sessionId)) {
      log.warn(`Session ${sessionId} already being recorded`);
      return;
    }
    this.sessionTrackerIds.set(sessionId, new Set(trackerIds));
    this.recordings.set(sessionId, {
      sessionId,
      startTime: (/* @__PURE__ */ new Date()).toISOString(),
      positions: /* @__PURE__ */ new Map(),
      events: [],
      isRecording: true
    });
    if (trackerIds.length > 0) {
      log.info(`Started recording session: ${sessionId} with ${trackerIds.length} assigned trackers: ${trackerIds.join(", ")}`);
    } else {
      log.info(`Started recording session: ${sessionId} (no tracker filter - recording all)`);
    }
    this.startSnapshotInterval(sessionId);
  }
  /**
   * Check if a tracker is assigned to a session
   * @returns true if tracker is assigned, or if no trackers are specified (allow all)
   */
  isTrackerAssignedToSession(sessionId, trackerId) {
    const allowedTrackers = this.sessionTrackerIds.get(sessionId);
    if (!allowedTrackers || allowedTrackers.size === 0) return true;
    return allowedTrackers.has(trackerId);
  }
  /**
   * Update tracker assignments for an active session
   */
  updateSessionTrackers(sessionId, trackerIds) {
    if (!this.recordings.has(sessionId)) {
      log.warn(`Cannot update trackers - no recording for session ${sessionId}`);
      return;
    }
    this.sessionTrackerIds.set(sessionId, new Set(trackerIds));
    log.info(`Updated session ${sessionId} trackers: ${trackerIds.join(", ")}`);
  }
  /**
   * Stop recording for a session
   */
  stopSession(sessionId) {
    const recording = this.recordings.get(sessionId);
    if (!recording) {
      log.warn(`No recording found for session ${sessionId}`);
      return;
    }
    recording.endTime = (/* @__PURE__ */ new Date()).toISOString();
    recording.isRecording = false;
    this.stopSnapshotInterval(sessionId);
    this.writeSnapshot(sessionId);
    log.info(`Stopped recording session: ${sessionId}`);
  }
  /**
   * Check if a session is currently recording
   */
  isRecording(sessionId) {
    const recording = this.recordings.get(sessionId);
    return recording?.isRecording ?? false;
  }
  /**
   * Record a position for a session
   * Only records if the tracker is assigned to this session
   */
  recordPosition(sessionId, position) {
    const recording = this.recordings.get(sessionId);
    if (!recording || !recording.isRecording) {
      if (!recording) {
        log.debug(`[SessionData] Position discarded - no recording for session ${sessionId}`);
      } else if (!recording.isRecording) {
        log.debug(`[SessionData] Position discarded - session ${sessionId} not recording`);
      }
      return;
    }
    if (!this.isTrackerAssignedToSession(sessionId, position.tracker_id)) {
      return;
    }
    const posTs = new Date(position.timestamp).getTime();
    const recStart = new Date(recording.startTime).getTime();
    if (posTs < recStart - 3e4) {
      log.warn(`[SessionData] Position for ${position.tracker_id} is ${Math.round((recStart - posTs) / 1e3)}s before recording start in session ${sessionId}`);
    }
    if (recording.endTime) {
      const recEnd = new Date(recording.endTime).getTime();
      if (posTs > recEnd + 3e4) {
        log.warn(`[SessionData] Position for ${position.tracker_id} is ${Math.round((posTs - recEnd) / 1e3)}s after recording end in session ${sessionId}`);
      }
    }
    const trackerId = position.tracker_id;
    if (!recording.positions.has(trackerId)) {
      recording.positions.set(trackerId, []);
      log.info(`[SessionData] New tracker ${trackerId} detected in session ${sessionId}`);
    }
    recording.positions.get(trackerId).push(position);
    const count = recording.positions.get(trackerId).length;
    if (count % 100 === 0) {
      log.info(`[SessionData] Recorded ${count} positions for ${trackerId} in session ${sessionId}`);
    }
  }
  /**
   * Record multiple positions at once
   */
  recordPositions(sessionId, positions) {
    for (const position of positions) {
      this.recordPosition(sessionId, position);
    }
  }
  /**
   * Record an event for a session
   */
  recordEvent(sessionId, event) {
    const recording = this.recordings.get(sessionId);
    if (!recording) {
      return;
    }
    recording.events.push({
      ...event,
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  /**
   * Filter positions by recording time window.
   * Applies a 2-second tolerance on both bounds for GPS processing latency.
   */
  filterPositionsByRecordingTime(positions, recording) {
    const startMs = new Date(recording.startTime).getTime() - 2e3;
    const endMs = recording.endTime ? new Date(recording.endTime).getTime() + 2e3 : Infinity;
    return positions.filter((p) => {
      const ts = new Date(p.timestamp).getTime();
      return ts >= startMs && ts <= endMs;
    });
  }
  /**
   * Get all positions for a session as a flat array
   */
  getSessionPositions(sessionId) {
    const recording = this.recordings.get(sessionId);
    if (!recording) {
      return [];
    }
    const allPositions = [];
    for (const positions of recording.positions.values()) {
      allPositions.push(...this.filterPositionsByRecordingTime(positions, recording));
    }
    allPositions.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    return allPositions;
  }
  /**
   * Get positions grouped by tracker
   * IMPORTANT: Returns a DEEP COPY to prevent data corruption between sessions
   */
  getPositionsByTracker(sessionId) {
    const recording = this.recordings.get(sessionId);
    if (!recording) {
      return /* @__PURE__ */ new Map();
    }
    const deepCopiedMap = /* @__PURE__ */ new Map();
    for (const [trackerId, positions] of recording.positions) {
      deepCopiedMap.set(trackerId, this.filterPositionsByRecordingTime(positions, recording));
    }
    return deepCopiedMap;
  }
  /**
   * Get session events
   * IMPORTANT: Returns a DEEP COPY to prevent data corruption
   */
  getSessionEvents(sessionId) {
    const recording = this.recordings.get(sessionId);
    if (!recording) {
      return [];
    }
    return [...recording.events];
  }
  /**
   * Get full session recording
   * IMPORTANT: Returns a DEEP COPY to prevent data corruption between sessions
   */
  getSessionRecording(sessionId) {
    const recording = this.recordings.get(sessionId);
    if (!recording) {
      return void 0;
    }
    const positionsCopy = /* @__PURE__ */ new Map();
    for (const [trackerId, positions] of recording.positions) {
      positionsCopy.set(trackerId, [...positions]);
    }
    return {
      sessionId: recording.sessionId,
      startTime: recording.startTime,
      endTime: recording.endTime,
      positions: positionsCopy,
      events: [...recording.events],
      isRecording: recording.isRecording
    };
  }
  /**
   * Get session summary statistics
   */
  getSessionSummary(sessionId) {
    const recording = this.recordings.get(sessionId);
    if (!recording) {
      return null;
    }
    const startTime = new Date(recording.startTime);
    const endTime = recording.endTime ? new Date(recording.endTime) : /* @__PURE__ */ new Date();
    const duration_seconds = Math.floor((endTime.getTime() - startTime.getTime()) / 1e3);
    let totalPositions = 0;
    const trackerSummaries = [];
    for (const [trackerId, rawPositions] of recording.positions) {
      const positions = this.filterPositionsByRecordingTime(rawPositions, recording);
      totalPositions += positions.length;
      if (positions.length > 0) {
        const avgAltitude = positions.reduce((sum, p) => sum + p.altitude_m, 0) / positions.length;
        const avgSpeed = positions.reduce((sum, p) => sum + p.speed_ms, 0) / positions.length;
        const gpsQualityBreakdown = {
          good: positions.filter((p) => p.gps_quality === "good").length,
          degraded: positions.filter((p) => p.gps_quality === "degraded").length,
          poor: positions.filter((p) => p.gps_quality === "poor").length
        };
        trackerSummaries.push({
          trackerId,
          positionCount: positions.length,
          firstPosition: positions[0] ? { ...positions[0] } : void 0,
          lastPosition: positions[positions.length - 1] ? { ...positions[positions.length - 1] } : void 0,
          avgAltitude,
          avgSpeed,
          gpsQualityBreakdown
        });
      }
    }
    return {
      sessionId,
      startTime: recording.startTime,
      endTime: recording.endTime,
      duration_seconds,
      trackerCount: recording.positions.size,
      totalPositions,
      eventCount: recording.events.length,
      trackerSummaries
    };
  }
  /**
   * Export session data for analysis
   */
  exportSessionData(sessionId) {
    return {
      positions: this.getSessionPositions(sessionId),
      events: this.getSessionEvents(sessionId),
      summary: this.getSessionSummary(sessionId)
    };
  }
  /**
   * Start periodic snapshot interval for a session (every 60 seconds).
   * Writes in-memory positions to a JSONL file on disk to prevent data loss on crash.
   */
  startSnapshotInterval(sessionId) {
    this.stopSnapshotInterval(sessionId);
    this.lastSnapshotCounts.set(sessionId, /* @__PURE__ */ new Map());
    const interval = setInterval(() => {
      this.writeSnapshot(sessionId);
    }, 6e4);
    this.snapshotIntervals.set(sessionId, interval);
    log.info(`[SessionData] Started periodic snapshots for session ${sessionId}`);
  }
  /**
   * Stop periodic snapshot interval for a session.
   */
  stopSnapshotInterval(sessionId) {
    const interval = this.snapshotIntervals.get(sessionId);
    if (interval) {
      clearInterval(interval);
      this.snapshotIntervals.delete(sessionId);
    }
    this.lastSnapshotCounts.delete(sessionId);
  }
  /**
   * Write a snapshot of new positions to disk as JSONL.
   * Only appends positions that haven't been written in previous snapshots.
   */
  writeSnapshot(sessionId) {
    const recording = this.recordings.get(sessionId);
    if (!recording) return;
    try {
      const { loadConfig: loadConfig2 } = require("./config");
      const config = loadConfig2();
      const snapshotDir = path__namespace.join(config.log_root_folder, "snapshots");
      if (!fs__namespace.existsSync(snapshotDir)) {
        fs__namespace.mkdirSync(snapshotDir, { recursive: true });
      }
      const snapshotPath = path__namespace.join(snapshotDir, `${sessionId}.jsonl`);
      const lastCounts = this.lastSnapshotCounts.get(sessionId) || /* @__PURE__ */ new Map();
      let newLines = 0;
      const lines = [];
      for (const [trackerId, positions] of recording.positions) {
        const lastCount = lastCounts.get(trackerId) || 0;
        const newPositions = positions.slice(lastCount);
        for (const pos of newPositions) {
          lines.push(JSON.stringify({
            t: pos.timestamp,
            id: trackerId,
            lat: pos.latitude,
            lon: pos.longitude,
            alt: pos.altitude_m,
            spd: pos.speed_ms,
            hdg: pos.heading_deg,
            q: pos.gps_quality
          }));
          newLines++;
        }
        lastCounts.set(trackerId, positions.length);
      }
      if (newLines > 0) {
        fs__namespace.appendFileSync(snapshotPath, lines.join("\n") + "\n", "utf-8");
        log.debug(`[SessionData] Snapshot: wrote ${newLines} positions to ${snapshotPath}`);
      }
      this.lastSnapshotCounts.set(sessionId, lastCounts);
    } catch (e) {
      log.warn(`[SessionData] Snapshot write failed for ${sessionId}: ${e.message}`);
    }
  }
  /**
   * Clear session data
   */
  clearSession(sessionId) {
    this.stopSnapshotInterval(sessionId);
    this.recordings.delete(sessionId);
    this.sessionTrackerIds.delete(sessionId);
    log.info(`Cleared session data: ${sessionId}`);
  }
  /**
   * Get all active session IDs
   */
  getActiveSessionIds() {
    return Array.from(this.recordings.entries()).filter(([, recording]) => recording.isRecording).map(([sessionId]) => sessionId);
  }
  /**
   * Get all recorded session IDs
   */
  getAllSessionIds() {
    return Array.from(this.recordings.keys());
  }
  /**
   * Engagement data for enriching CSV export.
   * Set by the route handler before export.
   */
  sessionEngagements = /* @__PURE__ */ new Map();
  /**
   * Set engagement data for a session (fetched from Python backend before export).
   */
  setSessionEngagements(sessionId, engagements) {
    this.sessionEngagements.set(sessionId, engagements);
  }
  /**
   * Export session data to CSV files in the specified directory.
   * Creates one CSV file per tracker + session_events.csv + events.csv
   * @returns Array of created file paths
   */
  async exportToCSV(sessionId, outputDir) {
    const recording = this.recordings.get(sessionId);
    if (!recording) {
      log.warn(`No recording found for session ${sessionId}`);
      return [];
    }
    if (!fs__namespace.existsSync(outputDir)) {
      fs__namespace.mkdirSync(outputDir, { recursive: true });
    }
    const createdFiles = [];
    const engagements = this.sessionEngagements.get(sessionId) || [];
    for (const [trackerId, rawPositions] of recording.positions) {
      const positions = this.filterPositionsByRecordingTime(rawPositions, recording);
      if (positions.length === 0) continue;
      const safeTrackerId = trackerId.replace(/[^a-zA-Z0-9-_]/g, "_");
      const filename = `tracker_${safeTrackerId}.csv`;
      const filePath = path__namespace.join(outputDir, filename);
      const header = [
        "tracker_id",
        "time_local_received",
        "time_gps",
        "lat",
        "lon",
        "alt_m",
        "speed_mps",
        "course_deg",
        "hdop",
        "satellites",
        "rssi_dbm",
        "baro_alt_m",
        "baro_temp_c",
        "baro_press_hpa",
        "fix_valid",
        "battery_mv",
        "session_id",
        "engagement_id",
        "engagement_active",
        "jam_active",
        "cuas_id"
      ].join(",");
      const rows = positions.map((p) => {
        const ts = new Date(p.timestamp).getTime();
        let engId = "";
        let engActive = "false";
        let jamActive = "false";
        let cuasId = "";
        for (const eng of engagements) {
          const isTarget = eng.target_tracker_ids.includes(trackerId);
          if (!isTarget) continue;
          const engStart = eng.engage_timestamp ? new Date(eng.engage_timestamp).getTime() : null;
          const engEnd = eng.disengage_timestamp ? new Date(eng.disengage_timestamp).getTime() : null;
          if (engStart && ts >= engStart && (!engEnd || ts <= engEnd)) {
            engId = eng.id;
            engActive = "true";
            cuasId = eng.cuas_placement_id || "";
            const jamStart = eng.jam_on_at ? new Date(eng.jam_on_at).getTime() : null;
            const jamEnd = eng.jam_off_at ? new Date(eng.jam_off_at).getTime() : null;
            if (jamStart && ts >= jamStart && (!jamEnd || ts <= jamEnd)) {
              jamActive = "true";
            }
            break;
          }
        }
        return [
          trackerId,
          p.timestamp,
          "",
          // time_gps
          p.latitude,
          p.longitude,
          p.altitude_m,
          p.speed_ms,
          p.heading_deg,
          p.hdop ?? "",
          p.satellites ?? "",
          p.rssi_dbm ?? "",
          "",
          // baro_alt_m
          "",
          // baro_temp_c
          "",
          // baro_press_hpa
          p.fix_valid ?? p.gps_quality !== "poor" ? "true" : "false",
          p.battery_mv ?? "",
          sessionId,
          engId,
          engActive,
          jamActive,
          cuasId
        ].join(",");
      });
      const content = [header, ...rows].join("\n");
      fs__namespace.writeFileSync(filePath, content, "utf-8");
      createdFiles.push(filePath);
      log.info(`Exported ${positions.length} positions for ${trackerId} to ${filename}`);
    }
    if (engagements.length > 0 || recording.events.length > 0) {
      const sessionEventsPath = path__namespace.join(outputDir, "session_events.csv");
      const seHeader = "session_id,event_type,timestamp,engagement_id,cuas_id,cuas_name,tracker_id,drone_name,duration_s,notes";
      const seRows = [];
      seRows.push([
        sessionId,
        "session_start",
        recording.startTime,
        "",
        "",
        "",
        "",
        "",
        "",
        ""
      ].join(","));
      for (const eng of engagements) {
        if (eng.engage_timestamp) {
          seRows.push([
            sessionId,
            "engage",
            eng.engage_timestamp,
            eng.id,
            eng.cuas_placement_id || "",
            csvEscape(eng.cuas_name || ""),
            eng.target_tracker_ids[0] || "",
            "",
            "",
            ""
          ].join(","));
        }
        if (eng.jam_on_at) {
          seRows.push([
            sessionId,
            "jam_on",
            eng.jam_on_at,
            eng.id,
            eng.cuas_placement_id || "",
            csvEscape(eng.cuas_name || ""),
            eng.target_tracker_ids[0] || "",
            "",
            "",
            ""
          ].join(","));
        }
        if (eng.jam_off_at) {
          seRows.push([
            sessionId,
            "jam_off",
            eng.jam_off_at,
            eng.id,
            eng.cuas_placement_id || "",
            "",
            eng.target_tracker_ids[0] || "",
            "",
            eng.jam_duration_s?.toString() || "",
            ""
          ].join(","));
        }
        if (eng.disengage_timestamp) {
          const notes = [
            eng.time_to_effect_s != null ? `TTE: ${eng.time_to_effect_s}s` : null,
            eng.pass_fail ? eng.pass_fail.toUpperCase() : null
          ].filter(Boolean).join("; ");
          seRows.push([
            sessionId,
            "disengage",
            eng.disengage_timestamp,
            eng.id,
            eng.cuas_placement_id || "",
            "",
            eng.target_tracker_ids[0] || "",
            "",
            "",
            csvEscape(notes)
          ].join(","));
        }
      }
      if (recording.endTime) {
        const startMs = new Date(recording.startTime).getTime();
        const endMs = new Date(recording.endTime).getTime();
        const durationS = Math.round((endMs - startMs) / 1e3);
        seRows.push([
          sessionId,
          "session_stop",
          recording.endTime,
          "",
          "",
          "",
          "",
          "",
          durationS.toString(),
          ""
        ].join(","));
      }
      seRows.sort((a, b) => {
        const tsA = a.split(",")[2] || "";
        const tsB = b.split(",")[2] || "";
        return tsA.localeCompare(tsB);
      });
      const seContent = [seHeader, ...seRows].join("\n");
      fs__namespace.writeFileSync(sessionEventsPath, seContent, "utf-8");
      createdFiles.push(sessionEventsPath);
      log.info(`Exported session_events.csv with ${seRows.length} rows`);
    }
    if (recording.events.length > 0) {
      const eventsPath = path__namespace.join(outputDir, "events.csv");
      const eventsHeader = "id,timestamp,type,tracker_id,data";
      const eventsRows = recording.events.map((e) => [
        e.id,
        e.timestamp,
        e.type,
        e.trackerId ?? "",
        e.data ? JSON.stringify(e.data).replace(/,/g, ";") : ""
        // Escape commas in JSON
      ].join(","));
      const eventsContent = [eventsHeader, ...eventsRows].join("\n");
      fs__namespace.writeFileSync(eventsPath, eventsContent, "utf-8");
      createdFiles.push(eventsPath);
      log.info(`Exported ${recording.events.length} events to events.csv`);
    }
    if (engagements.length > 0) {
      const engCsvPath = path__namespace.join(outputDir, "engagements.csv");
      const engHeader = [
        "engagement_id",
        "cuas_placement_id",
        "cuas_name",
        "target_tracker_ids",
        "engage_timestamp",
        "disengage_timestamp",
        "jam_on_at",
        "jam_off_at",
        "jam_duration_s",
        "time_to_effect_s",
        "pass_fail"
      ].join(",");
      const engRows = engagements.map((e) => [
        e.id,
        e.cuas_placement_id || "",
        csvEscape(e.cuas_name || ""),
        csvEscape(e.target_tracker_ids.join(";")),
        e.engage_timestamp || "",
        e.disengage_timestamp || "",
        e.jam_on_at || "",
        e.jam_off_at || "",
        e.jam_duration_s != null ? String(e.jam_duration_s) : "",
        e.time_to_effect_s != null ? String(e.time_to_effect_s) : "",
        e.pass_fail || ""
      ].join(","));
      const engContent = [engHeader, ...engRows].join("\n");
      fs__namespace.writeFileSync(engCsvPath, engContent, "utf-8");
      createdFiles.push(engCsvPath);
      log.info(`Exported ${engagements.length} engagements to engagements.csv`);
    }
    const metadataPath = path__namespace.join(outputDir, "session.json");
    const summary = this.getSessionSummary(sessionId);
    fs__namespace.writeFileSync(metadataPath, JSON.stringify(summary, null, 2), "utf-8");
    createdFiles.push(metadataPath);
    this.sessionEngagements.delete(sessionId);
    log.info(`Session ${sessionId} exported to ${outputDir}: ${createdFiles.length} files`);
    return createdFiles;
  }
}
const sessionDataCollector = new SessionDataCollector();
function getAppVersion() {
  try {
    const pkgPath = path__namespace.join(__dirname, "../../package.json");
    if (fs__namespace.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs__namespace.readFileSync(pkgPath, "utf-8"));
      return pkg.version || "0.0.0";
    }
  } catch {
  }
  return "0.0.0";
}
const APP_VERSION = getAppVersion();
class DashboardApp {
  config;
  stateManager;
  anomalyDetector;
  watcher = null;
  activeEvent = null;
  scanner;
  sessionLoader;
  replayEngine = null;
  replayMode = false;
  startTime = Date.now();
  wsConnections = /* @__PURE__ */ new Set();
  constructor() {
    this.config = loadConfig();
    this.stateManager = new StateManager(
      this.config.stale_seconds,
      (state) => this.onTrackerUpdated(state),
      (state) => this.onTrackerStale(state),
      (trackerId, prevStatus, newStatus, event) => this.onGPSHealthChange(trackerId, prevStatus, newStatus, event),
      this.config.low_battery_mv,
      this.config.critical_battery_mv
    );
    this.anomalyDetector = new AnomalyDetector(
      {
        altitudeAnomalyThresholdM: 50,
        positionJumpThresholdM: 500,
        alertCooldownMs: 5e3
      },
      (alert) => this.onAnomalyDetected(alert)
    );
    this.scanner = new SessionScanner(this.config.log_root_folder);
    this.sessionLoader = new SessionLoader(this.config.log_root_folder);
    const gpsHealthTracker = this.stateManager.getGPSHealthTracker();
    if (this.config.gps_denial_thresholds) {
      gpsHealthTracker.updateThresholds({
        fixLossDurationMs: (this.config.gps_denial_thresholds.fix_loss_duration_s ?? 3) * 1e3,
        degradedDurationMs: (this.config.gps_denial_thresholds.degraded_duration_s ?? 5) * 1e3
      });
    }
    gpsHealthTracker.setAutoEventCallback((event) => this.onGPSAutoEvent(event));
  }
  get version() {
    return APP_VERSION;
  }
  get uptimeSeconds() {
    return (Date.now() - this.startTime) / 1e3;
  }
  async startup() {
    log.info("=".repeat(60));
    log.info("SCENSUS Dashboard - Initializing");
    log.info("=".repeat(60));
    this.stateManager.start();
    const { existsSync } = await import("fs");
    const logRoot = this.config.log_root_folder;
    if (!existsSync(logRoot)) {
      log.warn(`Data folder does not exist: ${logRoot}`);
      this.broadcastMessage({
        type: "error",
        data: {
          code: "FOLDER_NOT_FOUND",
          message: `Data folder does not exist: ${logRoot}`,
          path: logRoot
        }
      });
      return;
    }
    this.watcher = new LogWatcher(
      logRoot,
      (records) => this.onRecords(records),
      (filePath) => this.onNewFile(filePath)
    );
    await this.watcher.start();
    this.activeEvent = path__namespace.basename(logRoot);
    log.info(`Monitoring: ${logRoot}`);
  }
  async shutdown() {
    log.info("Shutting down dashboard application");
    if (this.watcher) {
      await this.watcher.stop();
      this.watcher = null;
    }
    this.stateManager.stop();
    for (const ws of this.wsConnections) {
      try {
        ws.close();
      } catch {
      }
    }
    this.wsConnections.clear();
  }
  async setLogRoot(newPath) {
    const { existsSync, statSync } = await import("fs");
    if (!existsSync(newPath)) {
      return { success: false, message: `Path does not exist: ${newPath}` };
    }
    const stat = statSync(newPath);
    if (!stat.isDirectory()) {
      return { success: false, message: `Path is not a directory: ${newPath}` };
    }
    try {
      if (this.watcher) {
        await this.watcher.stop();
        this.watcher = null;
      }
      this.stateManager.clearAll();
      this.activeEvent = null;
      this.config.log_root_folder = newPath;
      this.scanner = new SessionScanner(newPath);
      this.sessionLoader = new SessionLoader(newPath);
      saveConfigAtomic({ log_root_folder: newPath });
      this.broadcastMessage({
        type: "config_changed",
        data: { log_root: newPath, log_root_exists: true }
      });
      this.watcher = new LogWatcher(
        newPath,
        (records) => this.onRecords(records),
        (filePath) => this.onNewFile(filePath)
      );
      await this.watcher.start();
      this.activeEvent = path__namespace.basename(newPath);
      this.broadcastMessage({
        type: "active_event_changed",
        data: { event_name: this.activeEvent }
      });
      return { success: true, message: `Now monitoring: ${newPath}`, log_root: newPath };
    } catch (e) {
      return { success: false, message: `Failed to set log root: ${e.message}` };
    }
  }
  async loadReplaySession(sessionId, trackers) {
    const sessions = await this.sessionLoader.scanSessions();
    const session = sessions.find((s) => s.session_id === sessionId);
    if (!session) {
      return { success: false, error: "Session not found" };
    }
    if (this.watcher) {
      await this.watcher.stop();
      this.watcher = null;
    }
    this.stateManager.clearAll();
    this.replayMode = true;
    const librarySessions = getTestSessions();
    const matchedTs = librarySessions.find(
      (ts) => ts.id === session.session_id || ts.live_data_path === session.path
    );
    const allSites = getSites();
    const matchedSite = matchedTs?.site_id ? allSites.find((s) => s.id === matchedTs.site_id) : null;
    const response = {
      success: true,
      phase: "metadata",
      frames_ready: false,
      session: {
        session_id: session.session_id,
        name: session.name,
        duration_seconds: session.duration_seconds,
        tracker_ids: session.tracker_ids,
        total_records: session.total_records,
        start_time: session.start_time,
        end_time: session.end_time,
        site_id: matchedTs?.site_id ?? null,
        site_center: matchedSite?.center ?? null
      }
    };
    const FRAME_BUILD_TIMEOUT_MS = 18e4;
    const progressCallback = (frameIndex, totalFrames) => {
      this.broadcastMessage({
        type: "replay_build_progress",
        data: {
          session_id: sessionId,
          frame_index: frameIndex,
          total_frames: totalFrames,
          percent: Math.round(frameIndex / totalFrames * 100)
        }
      });
    };
    setImmediate(async () => {
      try {
        log.info(`[Replay] Starting background frame building for session: ${sessionId}`);
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error("Frame building timed out after 3 minutes")), FRAME_BUILD_TIMEOUT_MS);
        });
        const timeline = await Promise.race([
          this.sessionLoader.loadTimeline(session, trackers, progressCallback),
          timeoutPromise
        ]);
        if (!timeline || timeline.length === 0) {
          this.broadcastMessage({
            type: "replay_frames_error",
            data: {
              session_id: sessionId,
              error: "No data in session"
            }
          });
          return;
        }
        this.replayEngine = new ReplayEngine(timeline, this.stateManager);
        this.replayEngine.setBroadcastCallback((msg) => {
          this.broadcastMessage({ type: msg.type, data: msg });
        });
        log.info(`[Replay] Frames ready: ${timeline.length} frames built`);
        this.broadcastMessage({
          type: "replay_frames_ready",
          data: {
            session_id: sessionId,
            frame_count: timeline.length
          }
        });
      } catch (error) {
        log.error(`[Replay] Frame building failed:`, error);
        this.broadcastMessage({
          type: "replay_frames_error",
          data: {
            session_id: sessionId,
            error: error.message
          }
        });
      }
    });
    return response;
  }
  async stopReplay() {
    if (this.replayEngine) {
      this.replayEngine.pause();
      this.replayEngine = null;
    }
    this.replayMode = false;
    this.stateManager.clearAll();
    const logRoot = this.config.log_root_folder;
    if (logRoot && !this.watcher) {
      const { existsSync } = await import("fs");
      if (existsSync(logRoot)) {
        this.watcher = new LogWatcher(
          logRoot,
          (records) => this.onRecords(records),
          (filePath) => this.onNewFile(filePath)
        );
        await this.watcher.start();
        this.activeEvent = path__namespace.basename(logRoot);
        log.info(`[Replay] Restored live monitoring: ${logRoot}`);
        this.broadcastMessage({
          type: "active_event_changed",
          data: { event_name: this.activeEvent }
        });
      }
    }
  }
  broadcastMessage(message) {
    if (this.wsConnections.size === 0) return;
    const json = JSON.stringify(message);
    const disconnected = [];
    for (const ws of this.wsConnections) {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(json, (err) => {
            if (err) {
              this.wsConnections.delete(ws);
            }
          });
        } else {
          disconnected.push(ws);
        }
      } catch {
        disconnected.push(ws);
      }
    }
    for (const ws of disconnected) {
      this.wsConnections.delete(ws);
    }
  }
  onRecords(records) {
    for (const record of records) {
      this.stateManager.updateTracker(record);
    }
  }
  onNewFile(filePath) {
    this.broadcastMessage({
      type: "new_file_detected",
      data: {
        filename: path__namespace.basename(filePath),
        path: filePath,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }
    });
  }
  onTrackerUpdated(state) {
    const aliasRecord = getTrackerAliasByTrackerId(state.tracker_id);
    const summary = {
      tracker_id: state.tracker_id,
      alias: aliasRecord?.alias,
      // Include alias if set
      lat: state.lat,
      lon: state.lon,
      alt_m: state.alt_m,
      rssi_dbm: state.rssi_dbm,
      fix_valid: state.fix_valid,
      is_stale: state.is_stale,
      age_seconds: state.age_seconds,
      last_update: state.time_local_received,
      battery_mv: state.battery_mv,
      speed_mps: state.speed_mps,
      heading_deg: state.course_deg,
      last_known_lat: state.last_known_lat,
      last_known_lon: state.last_known_lon,
      last_known_alt_m: state.last_known_alt_m,
      last_known_time: state.last_known_time,
      stale_since: state.stale_since,
      low_battery: state.low_battery,
      battery_critical: state.battery_critical,
      baro_alt_m: state.baro_alt_m,
      gps_health: {
        health_status: state.gps_health.health_status,
        fix_valid: state.gps_health.fix_valid,
        fix_type: state.gps_health.fix_type,
        hdop: state.gps_health.hdop,
        satellites: state.gps_health.satellites,
        current_loss_duration_ms: state.gps_health.current_loss_duration_ms,
        total_fix_loss_events: state.gps_health.total_fix_loss_events,
        fix_availability_percent: state.gps_health.fix_availability_percent,
        health_score: state.gps_health.health_score
      }
    };
    this.anomalyDetector.processUpdate(summary);
    if (state.lat !== null && state.lon !== null) {
      const position = {
        tracker_id: state.tracker_id,
        timestamp: state.time_local_received,
        latitude: state.lat,
        longitude: state.lon,
        altitude_m: state.alt_m ?? 0,
        speed_ms: state.speed_mps ?? 0,
        heading_deg: state.course_deg ?? 0,
        rssi_dbm: state.rssi_dbm ?? -100,
        gps_quality: this.determineGPSQuality(state),
        source: "live",
        hdop: state.hdop ?? 1,
        satellites: state.satellites ?? 10,
        fix_valid: state.fix_valid,
        battery_mv: state.battery_mv ?? 4e3
      };
      for (const sessionId of sessionDataCollector.getActiveSessionIds()) {
        if (sessionDataCollector.isTrackerAssignedToSession(sessionId, state.tracker_id)) {
          sessionDataCollector.recordPosition(sessionId, position);
        }
      }
    }
    this.broadcastMessage({
      type: "tracker_updated",
      data: summary
    });
  }
  determineGPSQuality(state) {
    if (!state.fix_valid) return "poor";
    if (state.hdop !== null && state.hdop > 5) return "degraded";
    if (state.satellites !== null && state.satellites < 4) return "degraded";
    return "good";
  }
  onTrackerStale(state) {
    this.anomalyDetector.processStale(state.tracker_id, state.age_seconds);
    this.broadcastMessage({
      type: "tracker_stale",
      data: {
        tracker_id: state.tracker_id,
        age_seconds: state.age_seconds
      }
    });
  }
  onAnomalyDetected(alert) {
    log.info(`Anomaly detected: ${alert.type} for ${alert.tracker_id} - ${alert.message}`);
    this.broadcastMessage({
      type: "anomaly_alert",
      data: { ...alert }
    });
  }
  onGPSHealthChange(trackerId, previousStatus, newStatus, event) {
    log.info(`GPS health changed for ${trackerId}: ${previousStatus} -> ${newStatus}`);
    this.broadcastMessage({
      type: "gps_health_alert",
      data: {
        tracker_id: trackerId,
        previous_status: previousStatus,
        new_status: newStatus,
        fix_loss_event: event,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }
    });
  }
  /**
   * Handle auto-detected GPS events and inject them into active sessions
   */
  onGPSAutoEvent(event) {
    log.info(`[GPSAutoEvent] ${event.type} for tracker ${event.trackerId}`);
    for (const sessionId of sessionDataCollector.getActiveSessionIds()) {
      if (sessionDataCollector.isTrackerAssignedToSession(sessionId, event.trackerId)) {
        addEventToSession(sessionId, {
          type: event.type,
          timestamp: event.timestamp,
          source: "auto_detected",
          tracker_id: event.trackerId,
          metadata: event.metadata
        });
        sessionDataCollector.recordEvent(sessionId, {
          type: event.type,
          trackerId: event.trackerId,
          data: event.metadata
        });
        log.info(`[GPSAutoEvent] Injected ${event.type} into session ${sessionId}`);
      }
    }
    this.broadcastMessage({
      type: "gps_auto_event",
      data: {
        event_type: event.type,
        tracker_id: event.trackerId,
        timestamp: event.timestamp,
        metadata: event.metadata
      }
    });
  }
  /**
   * Enable/disable anomaly detection
   */
  setAnomalyDetectionEnabled(enabled) {
    this.anomalyDetector.setEnabled(enabled);
  }
  /**
   * Check if anomaly detection is enabled
   */
  isAnomalyDetectionEnabled() {
    return this.anomalyDetector.isEnabled();
  }
}
const PYTHON_PORT = 8083;
class PythonBackendManager {
  process = null;
  port;
  pythonPath;
  logRootFolder;
  _ready = false;
  _startPromise = null;
  constructor(options) {
    this.port = options?.port || PYTHON_PORT;
    this.pythonPath = options?.pythonPath || this._findPython();
    this.logRootFolder = options?.logRootFolder || "";
  }
  get isRunning() {
    return this.process !== null && !this.process.killed;
  }
  get isReady() {
    return this._ready;
  }
  /** Start the Python backend as a subprocess with retry logic. */
  async start() {
    if (this.isRunning) {
      log.info("[python-backend] Already running");
      return true;
    }
    if (this._startPromise) return this._startPromise;
    this._startPromise = this._startWithRetry(3);
    const result = await this._startPromise;
    this._startPromise = null;
    return result;
  }
  async _startWithRetry(maxAttempts) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      log.info(`[python-backend] Start attempt ${attempt}/${maxAttempts}`);
      const ready = await this._doStart();
      if (ready) return true;
      if (attempt < maxAttempts) {
        const delay = 2e3 * attempt;
        log.info(`[python-backend] Retrying in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    return false;
  }
  /** Stop the Python backend. */
  stop() {
    if (!this.process) return;
    log.info("[python-backend] Stopping...");
    this._ready = false;
    try {
      this.process.kill("SIGTERM");
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          log.warn("[python-backend] Force killing");
          this.process.kill("SIGKILL");
        }
      }, 5e3);
    } catch (e) {
      log.warn("[python-backend] Error stopping:", e);
    }
    this.process = null;
  }
  async _doStart() {
    log.info(`[python-backend] Starting on port ${this.port}...`);
    const args = [
      "-m",
      "logtail_dashboard",
      "--port",
      this.port.toString(),
      "--host",
      "127.0.0.1",
      "--no-browser"
    ];
    if (this.logRootFolder) {
      args.push("--log-root", this.logRootFolder);
    }
    try {
      this.process = child_process.spawn(this.pythonPath, args, {
        cwd: this._getProjectRoot(),
        env: {
          ...process.env,
          SCENSUS_NO_BROWSER: "1",
          PYTHONUNBUFFERED: "1"
        },
        stdio: ["ignore", "pipe", "pipe"]
      });
      this.process.stdout?.on("data", (data) => {
        const line = data.toString().trim();
        if (line) log.info(`[python] ${line}`);
      });
      this.process.stderr?.on("data", (data) => {
        const line = data.toString().trim();
        if (line) log.warn(`[python] ${line}`);
      });
      this.process.on("error", (err) => {
        log.error(`[python-backend] Process error: ${err.message}`);
        this._ready = false;
        this.process = null;
      });
      this.process.on("exit", (code, signal) => {
        log.info(`[python-backend] Exited with code=${code} signal=${signal}`);
        this._ready = false;
        this.process = null;
      });
      const ready = await this._waitForReady(2e4);
      this._ready = ready;
      if (ready) {
        log.info(`[python-backend] Ready on port ${this.port}`);
      } else {
        log.error("[python-backend] Failed to start within timeout");
        this.stop();
      }
      return ready;
    } catch (e) {
      log.error(`[python-backend] Spawn failed: ${e.message}`);
      return false;
    }
  }
  /** Poll the health endpoint until it responds. */
  async _waitForReady(timeoutMs) {
    const start = Date.now();
    const url = `http://127.0.0.1:${this.port}/api/health`;
    while (Date.now() - start < timeoutMs) {
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(2e3)
        });
        if (response.ok) return true;
      } catch {
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  }
  /** Find Python executable. */
  _findPython() {
    const candidates = [
      "python3",
      "python",
      // Virtual env
      path__namespace.join(this._getProjectRoot(), ".venv", "bin", "python"),
      path__namespace.join(this._getProjectRoot(), ".venv", "Scripts", "python.exe"),
      // System paths
      "/usr/bin/python3",
      "/usr/local/bin/python3"
    ];
    for (const candidate of candidates) {
      try {
        const { execSync } = require("child_process");
        execSync(`${candidate} --version`, { stdio: "ignore" });
        return candidate;
      } catch {
        continue;
      }
    }
    return "python3";
  }
  /** Get project root directory (where logtail_dashboard package lives). */
  _getProjectRoot() {
    const devRoot = path__namespace.resolve(__dirname, "..", "..", "..");
    if (fs__namespace.existsSync(path__namespace.join(devRoot, "logtail_dashboard"))) {
      return devRoot;
    }
    const resourceRoot = path__namespace.resolve(process.resourcesPath || "", "..");
    if (fs__namespace.existsSync(path__namespace.join(resourceRoot, "logtail_dashboard"))) {
      return resourceRoot;
    }
    return devRoot;
  }
}
let _manager = null;
function getPythonBackend(options) {
  if (!_manager) {
    _manager = new PythonBackendManager(options);
  }
  return _manager;
}
const PYTHON_BACKEND_PORT$2 = 8083;
const PYTHON_BACKEND_URL$2 = `http://127.0.0.1:${PYTHON_BACKEND_PORT$2}`;
function healthRoutes(app) {
  const router = express.Router();
  router.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      version: app.version,
      active_event: app.activeEvent,
      tracker_count: app.stateManager.getTrackerCount(),
      uptime_seconds: app.uptimeSeconds
    });
  });
  router.get("/health/backend", async (_req, res) => {
    let running = false;
    try {
      const backend = getPythonBackend();
      running = backend.isRunning;
    } catch {
    }
    let reachable = false;
    try {
      const resp = await fetch(`${PYTHON_BACKEND_URL$2}/api/health`, {
        signal: AbortSignal.timeout(3e3)
      });
      reachable = resp.ok;
    } catch {
    }
    res.json({
      python_backend: {
        running,
        reachable,
        port: PYTHON_BACKEND_PORT$2
      }
    });
  });
  return router;
}
function configRoutes(app) {
  const router = express.Router();
  router.get("/config", (_req, res) => {
    const logRoot = app.config.log_root_folder;
    let logRootExists = false;
    let hasSessions = false;
    try {
      const stat = fs__namespace.statSync(logRoot);
      logRootExists = stat.isDirectory();
      if (logRootExists) {
        const entries = fs__namespace.readdirSync(logRoot, { withFileTypes: true });
        hasSessions = entries.some((e) => e.isDirectory() && !e.name.startsWith("."));
      }
    } catch {
    }
    res.json({
      log_root: logRoot,
      log_root_exists: logRootExists,
      has_sessions: hasSessions,
      active_event: app.activeEvent,
      is_configured: logRootExists,
      port: app.config.port,
      stale_seconds: app.config.stale_seconds
    });
  });
  router.post("/config/log-root", async (req, res) => {
    const { path: newPath } = req.body;
    if (!newPath) {
      res.json({ success: false, message: "Path is required" });
      return;
    }
    const result = await app.setLogRoot(newPath);
    res.json(result);
  });
  router.get("/validate-path", (req, res) => {
    const pathStr = req.query.path;
    if (!pathStr || !pathStr.trim()) {
      res.json({ valid: false, exists: false, is_directory: false, sessions: [], message: "Path is empty" });
      return;
    }
    const checkPath = pathStr.trim();
    try {
      if (!fs__namespace.existsSync(checkPath)) {
        res.json({ valid: false, exists: false, is_directory: false, sessions: [], message: "Path does not exist" });
        return;
      }
      const stat = fs__namespace.statSync(checkPath);
      if (!stat.isDirectory()) {
        res.json({ valid: false, exists: true, is_directory: false, sessions: [], message: "Path is not a directory" });
        return;
      }
      const sessions = [];
      const entries = fs__namespace.readdirSync(checkPath, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith(".")).slice(0, 5);
      for (const entry of entries) {
        const subPath = path__namespace.join(checkPath, entry.name);
        const csvFiles = fs__namespace.readdirSync(subPath).filter((f) => f.endsWith(".csv"));
        if (csvFiles.length > 0) {
          const lastMod = Math.max(
            ...csvFiles.map((f) => fs__namespace.statSync(path__namespace.join(subPath, f)).mtimeMs)
          );
          sessions.push({
            name: entry.name,
            file_count: csvFiles.length,
            last_modified: new Date(lastMod).toISOString()
          });
        }
      }
      const supportedExts = [".csv", ".nmea", ".kml", ".kmz"];
      const allFiles = fs__namespace.readdirSync(checkPath);
      const directFiles = allFiles.filter((f) => {
        const ext = path__namespace.extname(f).toLowerCase();
        return supportedExts.includes(ext);
      });
      const directFileCount = directFiles.length;
      let message;
      if (sessions.length > 0) {
        message = `Found ${entries.length} session(s)`;
      } else if (directFileCount > 0) {
        message = `Found ${directFileCount} file(s)`;
      } else {
        message = "No log files found";
      }
      res.json({
        valid: true,
        exists: true,
        is_directory: true,
        sessions,
        session_count: entries.length,
        direct_file_count: directFileCount,
        message
      });
    } catch (e) {
      res.json({
        valid: false,
        exists: false,
        is_directory: false,
        sessions: [],
        message: `Cannot access path: ${e.message}`
      });
    }
  });
  router.get("/select-folder", async (_req, res) => {
    try {
      const result = await electron.dialog.showOpenDialog({
        properties: ["openDirectory"],
        title: "Select Data Folder"
      });
      if (result.canceled || result.filePaths.length === 0) {
        res.json({ path: "" });
      } else {
        res.json({ path: result.filePaths[0] });
      }
    } catch (e) {
      res.json({ path: "" });
    }
  });
  return router;
}
function trackerRoutes(app) {
  const router = express.Router();
  router.get("/trackers", (_req, res) => {
    res.json(app.stateManager.getTrackerSummaries());
  });
  router.get("/trackers/:trackerId", (req, res) => {
    const state = app.stateManager.getTracker(req.params.trackerId);
    if (!state) {
      res.status(404).json({ detail: "Tracker not found" });
      return;
    }
    res.json(state);
  });
  return router;
}
function isPathWithinBase$1(targetPath, basePath) {
  const resolvedTarget = path__namespace.resolve(targetPath);
  const resolvedBase = path__namespace.resolve(basePath);
  return resolvedTarget.startsWith(resolvedBase + path__namespace.sep) || resolvedTarget === resolvedBase;
}
function sessionRoutes(app) {
  const router = express.Router();
  router.get("/events", (_req, res) => {
    const logRoot = app.config.log_root_folder;
    if (!fs__namespace.existsSync(logRoot)) {
      res.json({ events: [] });
      return;
    }
    try {
      const events2 = fs__namespace.readdirSync(logRoot, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name).sort();
      res.json({ events: events2 });
    } catch {
      res.json({ events: [] });
    }
  });
  router.get("/sessions/scan", (_req, res) => {
    const sessions = app.scanner.scanSessions();
    res.json({
      sessions: sessions.map((s) => ({
        name: s.name,
        last_activity: s.last_activity,
        is_active: s.is_active,
        file_count: s.file_count
      }))
    });
  });
  router.get("/sessions", (_req, res) => {
    const logRoot = app.config.log_root_folder;
    if (!fs__namespace.existsSync(logRoot)) {
      res.json({ sessions: [], log_root: logRoot });
      return;
    }
    const sessions = [];
    try {
      const rootFiles = fs__namespace.readdirSync(logRoot).filter((f) => [".csv", ".nmea"].includes(path__namespace.extname(f).toLowerCase()));
      if (rootFiles.length > 0) {
        const stats = rootFiles.map((f) => fs__namespace.statSync(path__namespace.join(logRoot, f)));
        const lastModified = Math.max(...stats.map((s) => s.mtimeMs));
        const totalSize = stats.reduce((sum, s) => sum + s.size, 0);
        sessions.push({
          name: path__namespace.basename(logRoot),
          path: logRoot,
          file_count: rootFiles.length,
          tracker_ids: [],
          tracker_count: 0,
          last_modified: new Date(lastModified).toISOString(),
          total_size_bytes: totalSize,
          is_active: app.activeEvent === path__namespace.basename(logRoot),
          is_root_folder: true
        });
      }
    } catch {
    }
    try {
      const entries = fs__namespace.readdirSync(logRoot, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "test-sessions");
      for (const entry of entries) {
        const subPath = path__namespace.join(logRoot, entry.name);
        const csvFiles = fs__namespace.readdirSync(subPath).filter((f) => f.endsWith(".csv"));
        if (csvFiles.length === 0) continue;
        const stats = csvFiles.map((f) => fs__namespace.statSync(path__namespace.join(subPath, f)));
        const lastModified = Math.max(...stats.map((s) => s.mtimeMs));
        const totalSize = stats.reduce((sum, s) => sum + s.size, 0);
        sessions.push({
          name: entry.name,
          path: subPath,
          file_count: csvFiles.length,
          tracker_ids: [],
          tracker_count: 0,
          last_modified: new Date(lastModified).toISOString(),
          total_size_bytes: totalSize,
          is_active: app.activeEvent === entry.name,
          is_root_folder: false,
          is_test_session: false
        });
      }
    } catch {
    }
    try {
      const testSessionsPath = path__namespace.join(logRoot, "test-sessions");
      if (fs__namespace.existsSync(testSessionsPath)) {
        const testEntries = fs__namespace.readdirSync(testSessionsPath, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith("."));
        for (const entry of testEntries) {
          const subPath = path__namespace.join(testSessionsPath, entry.name);
          const csvFiles = fs__namespace.readdirSync(subPath).filter((f) => f.endsWith(".csv"));
          if (csvFiles.length === 0) continue;
          const stats = csvFiles.map((f) => fs__namespace.statSync(path__namespace.join(subPath, f)));
          const lastModified = Math.max(...stats.map((s) => s.mtimeMs));
          const totalSize = stats.reduce((sum, s) => sum + s.size, 0);
          let sessionMetadata = null;
          const metadataPath = path__namespace.join(subPath, "session.json");
          if (fs__namespace.existsSync(metadataPath)) {
            try {
              sessionMetadata = JSON.parse(fs__namespace.readFileSync(metadataPath, "utf-8"));
            } catch {
            }
          }
          sessions.push({
            name: entry.name,
            path: subPath,
            file_count: csvFiles.length,
            tracker_ids: sessionMetadata?.trackerSummaries?.map((t) => t.trackerId) || [],
            tracker_count: sessionMetadata?.trackerCount || 0,
            last_modified: new Date(lastModified).toISOString(),
            total_size_bytes: totalSize,
            is_active: false,
            is_root_folder: false,
            is_test_session: true,
            duration_seconds: sessionMetadata?.duration_seconds,
            total_positions: sessionMetadata?.totalPositions
          });
        }
      }
    } catch {
    }
    sessions.sort((a, b) => new Date(b.last_modified).getTime() - new Date(a.last_modified).getTime());
    res.json({ sessions, log_root: logRoot, active_session: app.activeEvent });
  });
  router.get("/sessions/:sessionName/files", (req, res) => {
    const logRoot = app.config.log_root_folder;
    const sessionName = req.params.sessionName;
    let sessionPath = sessionName === path__namespace.basename(logRoot) ? logRoot : path__namespace.join(logRoot, sessionName);
    if (!fs__namespace.existsSync(sessionPath)) {
      const testSessionPath = path__namespace.join(logRoot, "test-sessions", sessionName);
      if (fs__namespace.existsSync(testSessionPath)) {
        sessionPath = testSessionPath;
      }
    }
    if (!isPathWithinBase$1(sessionPath, logRoot)) {
      res.status(403).json({ detail: "Access denied" });
      return;
    }
    if (!fs__namespace.existsSync(sessionPath)) {
      res.status(404).json({ detail: "Session not found" });
      return;
    }
    try {
      const dataFiles = fs__namespace.readdirSync(sessionPath).filter((f) => [".csv", ".nmea"].includes(path__namespace.extname(f).toLowerCase()));
      const files = dataFiles.map((f) => {
        const stat = fs__namespace.statSync(path__namespace.join(sessionPath, f));
        return {
          name: f,
          path: path__namespace.join(sessionPath, f),
          size_bytes: stat.size,
          modified: new Date(stat.mtimeMs).toISOString()
        };
      }).sort((a, b) => b.modified.localeCompare(a.modified));
      res.json({ session_name: sessionName, files, file_count: files.length });
    } catch (e) {
      res.status(500).json({ detail: e.message });
    }
  });
  router.get("/sessions/:sessionName/history", (req, res) => {
    const logRoot = app.config.log_root_folder;
    const sessionName = req.params.sessionName;
    const trackerId = req.query.tracker_id;
    let sessionPath = sessionName === path__namespace.basename(logRoot) ? logRoot : path__namespace.join(logRoot, sessionName);
    if (!fs__namespace.existsSync(sessionPath)) {
      const testSessionPath = path__namespace.join(logRoot, "test-sessions", sessionName);
      if (fs__namespace.existsSync(testSessionPath)) {
        sessionPath = testSessionPath;
      }
    }
    if (!isPathWithinBase$1(sessionPath, logRoot)) {
      res.status(403).json({ detail: "Access denied" });
      return;
    }
    if (!fs__namespace.existsSync(sessionPath)) {
      res.status(404).json({ detail: "Session not found" });
      return;
    }
    try {
      const parser = new CSVParser();
      let csvFiles = fs__namespace.readdirSync(sessionPath).filter((f) => f.endsWith(".csv"));
      if (trackerId) {
        csvFiles = csvFiles.filter((f) => f.includes(`tracker_${trackerId}`));
      }
      const allRecords = [];
      for (const file of csvFiles) {
        const content = fs__namespace.readFileSync(path__namespace.join(sessionPath, file), "utf-8");
        const records = parser.parseCSVContent(content);
        allRecords.push(...records);
      }
      allRecords.sort((a, b) => a.time_local_received.localeCompare(b.time_local_received));
      const tracks = {};
      for (const record of allRecords) {
        if (record.lat === null || record.lon === null) continue;
        if (!tracks[record.tracker_id]) tracks[record.tracker_id] = [];
        tracks[record.tracker_id].push({
          lat: record.lat,
          lon: record.lon,
          alt_m: record.alt_m,
          timestamp: record.time_local_received,
          timestamp_ms: new Date(record.time_local_received).getTime(),
          speed_mps: record.speed_mps,
          course_deg: record.course_deg,
          rssi_dbm: record.rssi_dbm
        });
      }
      const startTime = allRecords.length > 0 ? allRecords[0].time_local_received : null;
      const endTime = allRecords.length > 0 ? allRecords[allRecords.length - 1].time_local_received : null;
      const durationSeconds = startTime && endTime ? (new Date(endTime).getTime() - new Date(startTime).getTime()) / 1e3 : 0;
      res.json({
        session_name: sessionName,
        tracks,
        tracker_ids: Object.keys(tracks),
        total_points: Object.values(tracks).reduce((sum, t) => sum + t.length, 0),
        start_time: startTime,
        end_time: endTime,
        duration_seconds: durationSeconds
      });
    } catch (e) {
      res.status(500).json({ detail: e.message });
    }
  });
  router.get("/file/history", (req, res) => {
    const filePath = req.query.path;
    if (!filePath || !fs__namespace.existsSync(filePath)) {
      res.status(404).json({ detail: "File not found" });
      return;
    }
    const logRoot = app.config.log_root_folder;
    const resolvedPath = path__namespace.resolve(filePath);
    const resolvedRoot = path__namespace.resolve(logRoot);
    if (!resolvedPath.startsWith(resolvedRoot + path__namespace.sep) && resolvedPath !== resolvedRoot) {
      res.status(403).json({ detail: "Access denied: path is outside the allowed directory" });
      return;
    }
    const ext = path__namespace.extname(filePath).toLowerCase();
    if (![".csv", ".nmea"].includes(ext)) {
      res.status(400).json({ detail: "File must be a CSV or NMEA file" });
      return;
    }
    try {
      const content = fs__namespace.readFileSync(filePath, "utf-8");
      let allRecords;
      if (ext === ".nmea") {
        const parser = new NMEAParser();
        allRecords = parser.parseNMEAContent(content);
      } else {
        const parser = new CSVParser();
        allRecords = parser.parseCSVContent(content);
      }
      allRecords.sort((a, b) => a.time_local_received.localeCompare(b.time_local_received));
      const tracks = {};
      for (const record of allRecords) {
        if (record.lat === null || record.lon === null) continue;
        if (!tracks[record.tracker_id]) tracks[record.tracker_id] = [];
        tracks[record.tracker_id].push({
          lat: record.lat,
          lon: record.lon,
          alt_m: record.alt_m,
          timestamp: record.time_local_received,
          timestamp_ms: new Date(record.time_local_received).getTime(),
          speed_mps: record.speed_mps,
          course_deg: record.course_deg,
          rssi_dbm: record.rssi_dbm
        });
      }
      const startTime = allRecords.length > 0 ? allRecords[0].time_local_received : null;
      const endTime = allRecords.length > 0 ? allRecords[allRecords.length - 1].time_local_received : null;
      const durationSeconds = startTime && endTime ? (new Date(endTime).getTime() - new Date(startTime).getTime()) / 1e3 : 0;
      res.json({
        file_name: path__namespace.basename(filePath),
        file_path: filePath,
        tracks,
        tracker_ids: Object.keys(tracks),
        total_points: Object.values(tracks).reduce((sum, t) => sum + t.length, 0),
        start_time: startTime,
        end_time: endTime,
        duration_seconds: durationSeconds
      });
    } catch (e) {
      res.status(500).json({ detail: e.message });
    }
  });
  return router;
}
function replayRoutes(app) {
  const router = express.Router();
  router.get("/replay/sessions", async (_req, res) => {
    try {
      const sessions = await app.sessionLoader.scanSessions();
      res.json({
        sessions: sessions.map((s) => ({
          session_id: s.session_id,
          name: s.name,
          start_time: s.start_time,
          end_time: s.end_time,
          duration_seconds: s.duration_seconds,
          tracker_ids: s.tracker_ids,
          file_count: s.file_count,
          total_records: s.total_records,
          size_bytes: s.size_bytes
        })),
        log_root: app.config.log_root_folder
      });
    } catch (e) {
      log.error("Error listing replay sessions:", e);
      res.json({ sessions: [] });
    }
  });
  router.post("/replay/load/:sessionId", async (req, res) => {
    try {
      const result = await app.loadReplaySession(req.params.sessionId, req.body?.trackers);
      if (!result.success) {
        res.status(400).json(result);
        return;
      }
      res.json(result);
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });
  router.post("/replay/load-path", async (req, res) => {
    const { path: sessionPath } = req.body;
    if (!sessionPath) {
      res.json({ success: false, message: "Path is required" });
      return;
    }
    try {
      const { existsSync, statSync, readdirSync } = await import("fs");
      const pathModule = await import("path");
      if (!existsSync(sessionPath)) {
        res.json({ success: false, message: `Path does not exist: ${sessionPath}` });
        return;
      }
      if (!statSync(sessionPath).isDirectory()) {
        res.json({ success: false, message: `Path is not a directory: ${sessionPath}` });
        return;
      }
      const csvFiles = readdirSync(sessionPath).filter((f) => f.endsWith(".csv"));
      if (csvFiles.length === 0) {
        res.json({ success: false, message: "No CSV files found in the selected folder" });
        return;
      }
      const sessionId = pathModule.basename(sessionPath);
      const result = await app.loadReplaySession(sessionId);
      res.json(result);
    } catch (e) {
      res.json({ success: false, message: e.message });
    }
  });
  router.post("/replay/control", async (req, res) => {
    const { action, frame, speed } = req.query;
    if (!app.replayEngine) {
      res.status(400).json({ detail: "No session loaded" });
      return;
    }
    try {
      switch (action) {
        case "play":
          app.replayEngine.play();
          break;
        case "pause":
          app.replayEngine.pause();
          break;
        case "seek": {
          if (frame === void 0) {
            res.status(400).json({ detail: "frame parameter is required for seek" });
            return;
          }
          const frameNum = parseInt(frame, 10);
          if (isNaN(frameNum) || frameNum < 0) {
            res.status(400).json({ detail: "frame must be a non-negative integer" });
            return;
          }
          app.replayEngine.seek(frameNum);
          break;
        }
        case "speed": {
          if (speed === void 0) {
            res.status(400).json({ detail: "speed parameter is required for speed action" });
            return;
          }
          const speedNum = parseFloat(speed);
          if (isNaN(speedNum) || speedNum <= 0 || speedNum > 100) {
            res.status(400).json({ detail: "speed must be a number between 0 and 100" });
            return;
          }
          app.replayEngine.setSpeed(speedNum);
          break;
        }
        default:
          res.status(400).json({ detail: "Invalid action" });
          return;
      }
      const state = app.replayEngine.getCurrentState();
      app.broadcastMessage({ type: "replay_state", data: state });
      res.json({ success: true, ...state });
    } catch (e) {
      res.json({ success: false, error: e.message });
    }
  });
  router.get("/replay/state", (_req, res) => {
    if (!app.replayEngine) {
      res.json({ replay_mode: false });
      return;
    }
    const state = app.replayEngine.getCurrentState();
    res.json({ replay_mode: true, ...state });
  });
  router.post("/replay/stop", async (_req, res) => {
    try {
      await app.stopReplay();
      res.json({ success: true, message: "Replay stopped" });
    } catch (e) {
      res.json({ success: false, error: e.message });
    }
  });
  return router;
}
function generateKML(trackers, eventName) {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace("T", " ").substring(0, 16);
  const docName = `SCENSUS Export - ${eventName || "Data"} - ${timestamp}`;
  const groups = /* @__PURE__ */ new Map();
  for (const tracker of trackers) {
    const list = groups.get(tracker.tracker_id) || [];
    list.push(tracker);
    groups.set(tracker.tracker_id, list);
  }
  let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
<Document>
  <name>${escapeXml(docName)}</name>
  <description>Exported from SCENSUS UAS Dashboard on ${timestamp}</description>
${generateStyles()}`;
  for (const [trackerId, trackerList] of groups) {
    trackerList.sort((a, b) => {
      const tA = a.time_gps || a.time_local_received || "";
      const tB = b.time_gps || b.time_local_received || "";
      return tA.localeCompare(tB);
    });
    kml += `  <Folder>
    <name>Drone ${escapeXml(trackerId)}</name>
`;
    if (trackerList.length > 1) {
      kml += generateTrackLine(trackerId, trackerList);
    }
    for (let i = 0; i < trackerList.length; i++) {
      kml += generatePointPlacemark(trackerList[i], i);
    }
    kml += `  </Folder>
`;
  }
  kml += `</Document>
</kml>`;
  return kml;
}
function generateStyles() {
  return `  <Style id="droneActive">
    <IconStyle>
      <Icon><href>http://maps.google.com/mapfiles/kml/shapes/airports.png</href></Icon>
      <color>ff00c8ff</color>
      <scale>1.0</scale>
    </IconStyle>
  </Style>
  <Style id="droneStale">
    <IconStyle>
      <Icon><href>http://maps.google.com/mapfiles/kml/shapes/airports.png</href></Icon>
      <color>ff0000ff</color>
      <scale>0.8</scale>
    </IconStyle>
  </Style>
  <Style id="trackLine">
    <LineStyle>
      <color>ff00c8ff</color>
      <width>3</width>
    </LineStyle>
  </Style>
`;
}
function generateTrackLine(trackerId, trackers) {
  const coords = trackers.filter((t) => t.lat !== null && t.lon !== null).map((t) => `${t.lon},${t.lat},${t.alt_m ?? 0}`).join(" ");
  return `    <Placemark>
      <name>Track - ${escapeXml(trackerId)}</name>
      <styleUrl>#trackLine</styleUrl>
      <LineString>
        <altitudeMode>absolute</altitudeMode>
        <tessellate>1</tessellate>
        <coordinates>${coords}</coordinates>
      </LineString>
    </Placemark>
`;
}
function generatePointPlacemark(tracker, index) {
  if (tracker.lat === null || tracker.lon === null) return "";
  const descParts = [];
  if (tracker.time_gps) descParts.push(`Time: ${tracker.time_gps}`);
  if (tracker.alt_m !== null) descParts.push(`Altitude: ${tracker.alt_m.toFixed(1)}m`);
  if (tracker.speed_mps !== null) descParts.push(`Speed: ${tracker.speed_mps.toFixed(1)}m/s`);
  if (tracker.rssi_dbm !== null) descParts.push(`RSSI: ${tracker.rssi_dbm}dBm`);
  const styleUrl = tracker.is_stale ? "#droneStale" : "#droneActive";
  const alt = tracker.alt_m ?? 0;
  let pm = `    <Placemark>
      <name>Position ${index + 1}</name>
`;
  if (descParts.length > 0) {
    pm += `      <description>${escapeXml(descParts.join("\n"))}</description>
`;
  }
  pm += `      <styleUrl>${styleUrl}</styleUrl>
`;
  if (tracker.time_gps) {
    const when = new Date(tracker.time_gps).toISOString();
    pm += `      <TimeStamp><when>${when}</when></TimeStamp>
`;
  }
  pm += `      <Point>
        <altitudeMode>absolute</altitudeMode>
        <coordinates>${tracker.lon},${tracker.lat},${alt}</coordinates>
      </Point>
      <ExtendedData>
        <Data name="tracker_id"><value>${escapeXml(tracker.tracker_id)}</value></Data>
`;
  if (tracker.alt_m !== null) pm += `        <Data name="altitude_m"><value>${tracker.alt_m.toFixed(1)}</value></Data>
`;
  if (tracker.speed_mps !== null) pm += `        <Data name="speed_mps"><value>${tracker.speed_mps.toFixed(1)}</value></Data>
`;
  if (tracker.course_deg !== null) pm += `        <Data name="course_deg"><value>${tracker.course_deg.toFixed(1)}</value></Data>
`;
  if (tracker.rssi_dbm !== null) pm += `        <Data name="rssi_dbm"><value>${tracker.rssi_dbm}</value></Data>
`;
  if (tracker.battery_mv !== null) pm += `        <Data name="battery_mv"><value>${tracker.battery_mv}</value></Data>
`;
  if (tracker.satellites !== null) pm += `        <Data name="satellites"><value>${tracker.satellites}</value></Data>
`;
  if (tracker.hdop !== null) pm += `        <Data name="hdop"><value>${tracker.hdop.toFixed(1)}</value></Data>
`;
  if (tracker.baro_alt_m !== null) pm += `        <Data name="baro_alt_m"><value>${tracker.baro_alt_m.toFixed(1)}</value></Data>
`;
  if (tracker.baro_temp_c !== null) pm += `        <Data name="baro_temp_c"><value>${tracker.baro_temp_c.toFixed(1)}</value></Data>
`;
  if (tracker.baro_press_hpa !== null) pm += `        <Data name="baro_press_hpa"><value>${tracker.baro_press_hpa.toFixed(1)}</value></Data>
`;
  pm += `        <Data name="fix_valid"><value>${tracker.fix_valid ? "yes" : "no"}</value></Data>
        <Data name="is_stale"><value>${tracker.is_stale ? "yes" : "no"}</value></Data>
      </ExtendedData>
    </Placemark>
`;
  return pm;
}
function escapeXml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
const TRACK_COLORS = [
  [0, 200, 255, 255],
  // #00c8ff
  [255, 107, 107, 255],
  // #ff6b6b
  [78, 205, 196, 255],
  // #4ecdc4
  [247, 220, 111, 255],
  // #f7dc6f
  [187, 143, 206, 255],
  // #bb8fce
  [88, 214, 141, 255],
  // #58d68d
  [248, 181, 0, 255],
  // #f8b500
  [93, 173, 226, 255]
  // #5dade2
];
function toISOInterval(start, end) {
  return `${start}/${end}`;
}
function rgbaToCesium(rgba) {
  return { rgba };
}
function generateCZML(input) {
  const { session, telemetry, site, cuasPlacements, cuasProfiles } = input;
  const packets = [];
  const sessionStart = session.start_time || session.created_at;
  const sessionEnd = session.end_time || session.updated_at;
  packets.push({
    id: "document",
    name: session.name,
    version: "1.0",
    clock: {
      interval: toISOInterval(sessionStart, sessionEnd),
      currentTime: sessionStart,
      multiplier: 1,
      range: "LOOP_STOP",
      step: "SYSTEM_CLOCK_MULTIPLIER"
    }
  });
  let colorIndex = 0;
  for (const [trackerId, positions] of telemetry) {
    if (positions.length < 2) continue;
    const color = TRACK_COLORS[colorIndex % TRACK_COLORS.length];
    colorIndex++;
    const epoch = positions[0].timestamp;
    const epochMs = new Date(epoch).getTime();
    const cartographicDegrees = [];
    for (const p of positions) {
      const offsetSec = (new Date(p.timestamp).getTime() - epochMs) / 1e3;
      cartographicDegrees.push(offsetSec, p.longitude, p.latitude, p.altitude_m);
    }
    const firstPos = positions[0];
    const lastPos = positions[positions.length - 1];
    const availability = toISOInterval(firstPos.timestamp, lastPos.timestamp);
    packets.push({
      id: `drone-${trackerId}`,
      name: `Drone ${trackerId}`,
      availability,
      position: {
        epoch,
        cartographicDegrees,
        interpolationAlgorithm: "LAGRANGE",
        interpolationDegree: 1
      },
      point: {
        color: rgbaToCesium(color),
        pixelSize: 8,
        outlineColor: rgbaToCesium([255, 255, 255, 200]),
        outlineWidth: 1,
        heightReference: "NONE"
      },
      path: {
        material: {
          solidColor: {
            color: rgbaToCesium(color)
          }
        },
        width: 2,
        leadTime: 0,
        trailTime: 600,
        resolution: 1
      },
      label: {
        text: trackerId,
        font: "11px monospace",
        fillColor: rgbaToCesium([255, 255, 255, 255]),
        outlineColor: rgbaToCesium([0, 0, 0, 255]),
        outlineWidth: 2,
        style: "FILL_AND_OUTLINE",
        verticalOrigin: "BOTTOM",
        pixelOffset: { cartesian2: [0, -12] }
      }
    });
  }
  for (const placement of cuasPlacements) {
    const profile = cuasProfiles.find((p) => p.id === placement.cuas_profile_id);
    const range = profile?.effective_range_m || 500;
    const name = profile?.name || "CUAS";
    packets.push({
      id: `cuas-${placement.id}`,
      name,
      position: {
        cartographicDegrees: [
          placement.position.lon,
          placement.position.lat,
          (placement.position.alt_m || 0) + placement.height_agl_m
        ]
      },
      cylinder: {
        length: range * 2,
        topRadius: range,
        bottomRadius: 0,
        material: {
          solidColor: {
            color: rgbaToCesium([249, 115, 22, 30])
          }
        },
        outline: true,
        outlineColor: rgbaToCesium([249, 115, 22, 120]),
        numberOfVerticalLines: 0
      },
      point: {
        color: rgbaToCesium([249, 115, 22, 230]),
        pixelSize: 12,
        outlineColor: rgbaToCesium([0, 0, 0, 255]),
        outlineWidth: 2
      },
      label: {
        text: name,
        font: "12px monospace",
        fillColor: rgbaToCesium([249, 115, 22, 255]),
        outlineColor: rgbaToCesium([0, 0, 0, 255]),
        outlineWidth: 2,
        style: "FILL_AND_OUTLINE",
        verticalOrigin: "BOTTOM",
        pixelOffset: { cartesian2: [0, -16] }
      }
    });
  }
  const engagements = session.engagements || [];
  for (const eng of engagements) {
    if (!eng.engage_timestamp) continue;
    const engStart = eng.engage_timestamp;
    const engEnd = eng.disengage_timestamp || sessionEnd;
    const availability = toISOInterval(engStart, engEnd);
    const placement = cuasPlacements.find((p) => p.id === eng.cuas_placement_id);
    if (!placement) continue;
    const cuasLon = eng.cuas_lon ?? placement.position.lon;
    const cuasLat = eng.cuas_lat ?? placement.position.lat;
    const cuasAlt = (eng.cuas_alt_m ?? placement.height_agl_m) + 2;
    for (const target of eng.targets || []) {
      if (target.drone_lat == null || target.drone_lon == null) continue;
      const droneAlt = target.initial_altitude_m || 50;
      packets.push({
        id: `engagement-${eng.id}-${target.tracker_id}`,
        name: `Engagement: ${eng.name || eng.id}`,
        availability,
        polyline: {
          positions: {
            cartographicDegrees: [
              cuasLon,
              cuasLat,
              cuasAlt,
              target.drone_lon,
              target.drone_lat,
              droneAlt
            ]
          },
          material: {
            solidColor: {
              color: rgbaToCesium([239, 68, 68, 200])
            }
          },
          width: 2
        }
      });
    }
  }
  const events2 = session.events || [];
  for (const event of events2) {
    const eventColor = getEventColor(event.type);
    const label = event.type.replace(/_/g, " ").toUpperCase();
    packets.push({
      id: `event-${event.id}`,
      name: `${label}${event.note ? ": " + event.note : ""}`,
      availability: toISOInterval(event.timestamp, event.timestamp),
      label: {
        text: label,
        font: "bold 10px monospace",
        fillColor: rgbaToCesium(eventColor),
        outlineColor: rgbaToCesium([0, 0, 0, 255]),
        outlineWidth: 2,
        style: "FILL_AND_OUTLINE",
        showBackground: true,
        backgroundColor: rgbaToCesium([0, 0, 0, 180]),
        verticalOrigin: "BOTTOM",
        pixelOffset: { cartesian2: [0, -24] }
      }
    });
    if (event.tracker_id) {
      const positions = telemetry.get(event.tracker_id);
      if (positions) {
        const eventTime = new Date(event.timestamp).getTime();
        const nearest = positions.reduce((best, p) => {
          const dt = Math.abs(new Date(p.timestamp).getTime() - eventTime);
          const bestDt = Math.abs(new Date(best.timestamp).getTime() - eventTime);
          return dt < bestDt ? p : best;
        });
        packets[packets.length - 1].position = {
          cartographicDegrees: [
            nearest.longitude,
            nearest.latitude,
            nearest.altitude_m + 10
          ]
        };
      }
    }
  }
  if (site?.boundary_polygon && site.boundary_polygon.length >= 3) {
    const boundaryCoords = [];
    for (const p of site.boundary_polygon) {
      boundaryCoords.push(p.lon, p.lat, 0);
    }
    boundaryCoords.push(
      site.boundary_polygon[0].lon,
      site.boundary_polygon[0].lat,
      0
    );
    packets.push({
      id: "site-boundary",
      name: site.name,
      polygon: {
        positions: {
          cartographicDegrees: boundaryCoords
        },
        material: {
          solidColor: {
            color: rgbaToCesium([255, 140, 0, 25])
          }
        },
        outline: true,
        outlineColor: rgbaToCesium([255, 140, 0, 200]),
        height: 0
      }
    });
  }
  return packets;
}
function getEventColor(type) {
  switch (type) {
    case "jam_on":
      return [239, 68, 68, 255];
    case "jam_off":
      return [249, 115, 22, 255];
    case "engage":
      return [6, 182, 212, 255];
    case "disengage":
      return [139, 92, 246, 255];
    case "launch":
      return [34, 197, 94, 255];
    case "recover":
      return [59, 130, 246, 255];
    case "failsafe":
      return [234, 179, 8, 255];
    case "gps_lost":
      return [220, 38, 38, 255];
    case "gps_acquired":
      return [22, 163, 74, 255];
    default:
      return [255, 255, 255, 200];
  }
}
function generateGeoJSON(input) {
  const { session, positionsByTracker, site, cuasProfiles } = input;
  const features = [];
  for (const [trackerId, positions] of positionsByTracker) {
    if (positions.length < 2) continue;
    const coordinates = positions.map((p) => [p.longitude, p.latitude, p.altitude_m]);
    const speeds = positions.map((p) => p.speed_ms).filter((s) => s != null);
    const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates },
      properties: {
        feature_type: "drone_track",
        tracker_id: trackerId,
        point_count: positions.length,
        start_time: positions[0].timestamp,
        end_time: positions[positions.length - 1].timestamp,
        avg_speed_mps: Math.round(avgSpeed * 100) / 100
      }
    });
  }
  const cuasPlacements = session.cuas_placements || [];
  for (const placement of cuasPlacements) {
    const profile = cuasProfiles.get(placement.cuas_profile_id);
    const range = profile?.effective_range_m || 0;
    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [placement.position.lon, placement.position.lat, placement.position.alt_m || 0]
      },
      properties: {
        feature_type: "cuas_placement",
        cuas_name: profile?.name || "Unknown CUAS",
        cuas_vendor: profile?.vendor || "",
        cuas_type: profile?.type || "",
        orientation_deg: placement.orientation_deg,
        effective_range_m: range,
        height_agl_m: placement.height_agl_m,
        active: placement.active
      }
    });
    if (range > 0) {
      const coverageCoords = [];
      for (let i = 0; i <= 36; i++) {
        const angle = i % 36 * (2 * Math.PI / 36);
        const dLat = range * Math.cos(angle) / 111320;
        const dLon = range * Math.sin(angle) / (111320 * Math.cos(placement.position.lat * Math.PI / 180));
        coverageCoords.push([
          placement.position.lon + dLon,
          placement.position.lat + dLat
        ]);
      }
      features.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [coverageCoords] },
        properties: {
          feature_type: "cuas_coverage",
          cuas_name: profile?.name || "Unknown CUAS",
          range_m: range,
          antenna_pattern: profile?.antenna_pattern || "omni"
        }
      });
    }
  }
  const engagements = session.engagements || [];
  for (const eng of engagements) {
    const placement = cuasPlacements.find((p) => p.id === eng.cuas_placement_id);
    if (!placement) continue;
    const engProfile = cuasProfiles.get(placement.cuas_profile_id);
    for (const target of eng.targets || []) {
      const cuasLon = eng.cuas_lon ?? placement.position.lon;
      const cuasLat = eng.cuas_lat ?? placement.position.lat;
      const droneLat = target.drone_lat;
      const droneLon = target.drone_lon;
      if (droneLat == null || droneLon == null) continue;
      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [cuasLon, cuasLat],
            [droneLon, droneLat]
          ]
        },
        properties: {
          feature_type: "engagement_line",
          engagement_id: eng.id,
          cuas_name: engProfile?.name || "CUAS",
          target_tracker_id: target.tracker_id,
          range_m: target.initial_range_m,
          bearing_deg: target.initial_bearing_deg,
          engage_timestamp: eng.engage_timestamp,
          disengage_timestamp: eng.disengage_timestamp,
          pass_fail: eng.metrics?.pass_fail
        }
      });
    }
  }
  if (site && site.boundary_polygon && site.boundary_polygon.length >= 3) {
    const boundaryCoords = site.boundary_polygon.map((p) => [p.lon, p.lat]);
    boundaryCoords.push(boundaryCoords[0]);
    features.push({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [boundaryCoords] },
      properties: {
        feature_type: "site_boundary",
        site_name: site.name,
        environment_type: site.environment_type
      }
    });
  }
  if (site?.zones) {
    for (const zone of site.zones) {
      if (!zone.polygon || zone.polygon.length < 3) continue;
      const zoneCoords = zone.polygon.map((p) => [p.lon, p.lat]);
      zoneCoords.push(zoneCoords[0]);
      features.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [zoneCoords] },
        properties: {
          feature_type: "site_zone",
          zone_name: zone.name,
          zone_type: zone.type,
          color: zone.color,
          opacity: zone.opacity,
          notes: zone.notes
        }
      });
    }
  }
  if (site?.markers) {
    for (const marker of site.markers) {
      features.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [marker.position.lon, marker.position.lat, marker.position.alt_m || 0]
        },
        properties: {
          feature_type: "site_marker",
          marker_name: marker.name,
          marker_type: marker.type,
          notes: marker.notes
        }
      });
    }
  }
  const assetPlacements = session.asset_placements || [];
  for (const asset of assetPlacements) {
    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [asset.position.lon, asset.position.lat, asset.position.alt_m || 0]
      },
      properties: {
        feature_type: "asset_placement",
        asset_type: asset.asset_type,
        label: asset.label,
        model_id: asset.model_id,
        orientation_deg: asset.orientation_deg,
        notes: asset.notes
      }
    });
  }
  const centerLat = site?.center?.lat;
  const centerLon = site?.center?.lon;
  if (centerLat != null && centerLon != null) {
    let totalPositions = 0;
    for (const positions of positionsByTracker.values()) {
      totalPositions += positions.length;
    }
    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [centerLon, centerLat]
      },
      properties: {
        feature_type: "session_metadata",
        session_id: session.id,
        session_name: session.name,
        site_name: site?.name,
        status: session.status,
        start_time: session.start_time,
        end_time: session.end_time,
        duration_seconds: session.duration_seconds,
        tracker_count: positionsByTracker.size,
        total_positions: totalPositions,
        cuas_count: cuasPlacements.length,
        engagement_count: engagements.length,
        operator_name: session.operator_name,
        weather_notes: session.weather_notes
      }
    });
  }
  return {
    type: "FeatureCollection",
    features
  };
}
function writeDouble(buf, offset, value) {
  buf.writeDoubleLE(value, offset);
}
function writeUInt32(buf, offset, value) {
  buf.writeUInt32LE(value, offset);
}
function encodePointWKB(coords) {
  const hasZ = coords.length >= 3;
  const wkbType = hasZ ? 1001 : 1;
  const buf = Buffer.alloc(1 + 4 + (hasZ ? 24 : 16));
  let offset = 0;
  buf.writeUInt8(1, offset);
  offset += 1;
  writeUInt32(buf, offset, wkbType);
  offset += 4;
  writeDouble(buf, offset, coords[0]);
  offset += 8;
  writeDouble(buf, offset, coords[1]);
  offset += 8;
  if (hasZ) {
    writeDouble(buf, offset, coords[2]);
    offset += 8;
  }
  return buf;
}
function encodeLineStringWKB(coords) {
  const hasZ = coords.length > 0 && coords[0].length >= 3;
  const wkbType = hasZ ? 1002 : 2;
  const pointSize = hasZ ? 24 : 16;
  const buf = Buffer.alloc(1 + 4 + 4 + coords.length * pointSize);
  let offset = 0;
  buf.writeUInt8(1, offset);
  offset += 1;
  writeUInt32(buf, offset, wkbType);
  offset += 4;
  writeUInt32(buf, offset, coords.length);
  offset += 4;
  for (const coord of coords) {
    writeDouble(buf, offset, coord[0]);
    offset += 8;
    writeDouble(buf, offset, coord[1]);
    offset += 8;
    if (hasZ) {
      writeDouble(buf, offset, coord[2] ?? 0);
      offset += 8;
    }
  }
  return buf;
}
function encodePolygonWKB(rings) {
  const hasZ = rings.length > 0 && rings[0].length > 0 && rings[0][0].length >= 3;
  const wkbType = hasZ ? 1003 : 3;
  const pointSize = hasZ ? 24 : 16;
  let totalPoints = 0;
  for (const ring of rings) totalPoints += ring.length;
  const buf = Buffer.alloc(1 + 4 + 4 + rings.length * 4 + totalPoints * pointSize);
  let offset = 0;
  buf.writeUInt8(1, offset);
  offset += 1;
  writeUInt32(buf, offset, wkbType);
  offset += 4;
  writeUInt32(buf, offset, rings.length);
  offset += 4;
  for (const ring of rings) {
    writeUInt32(buf, offset, ring.length);
    offset += 4;
    for (const coord of ring) {
      writeDouble(buf, offset, coord[0]);
      offset += 8;
      writeDouble(buf, offset, coord[1]);
      offset += 8;
      if (hasZ) {
        writeDouble(buf, offset, coord[2] ?? 0);
        offset += 8;
      }
    }
  }
  return buf;
}
function encodeGeometryWKB(geometry) {
  switch (geometry.type) {
    case "Point":
      return encodePointWKB(geometry.coordinates);
    case "LineString":
      return encodeLineStringWKB(geometry.coordinates);
    case "Polygon":
      return encodePolygonWKB(geometry.coordinates);
    default:
      throw new Error(`Unsupported geometry type: ${geometry.type}`);
  }
}
function computeEnvelope(geometry) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  function processCoord(coord) {
    if (coord[0] < minX) minX = coord[0];
    if (coord[0] > maxX) maxX = coord[0];
    if (coord[1] < minY) minY = coord[1];
    if (coord[1] > maxY) maxY = coord[1];
  }
  function processCoords(coords, depth) {
    if (depth === 0) {
      processCoord(coords);
    } else {
      for (const c of coords) {
        processCoords(c, depth - 1);
      }
    }
  }
  switch (geometry.type) {
    case "Point":
      processCoords(geometry.coordinates, 0);
      break;
    case "LineString":
      processCoords(geometry.coordinates, 1);
      break;
    case "Polygon":
      processCoords(geometry.coordinates, 2);
      break;
  }
  return [minX, maxX, minY, maxY];
}
function isEmptyGeometry(geometry) {
  const coords = geometry.coordinates;
  if (coords == null) return true;
  if (geometry.type === "Point") return coords.length === 0;
  if (geometry.type === "LineString") return coords.length === 0;
  if (geometry.type === "Polygon") return coords.length === 0 || coords[0].length === 0;
  return true;
}
function encodeGPB(geometry, srsId = 4326) {
  const wkb = encodeGeometryWKB(geometry);
  const empty = isEmptyGeometry(geometry);
  if (empty) {
    const headerSize2 = 2 + 1 + 1 + 4;
    const gpb2 = Buffer.alloc(headerSize2 + wkb.length);
    let offset2 = 0;
    gpb2.writeUInt8(71, offset2);
    offset2 += 1;
    gpb2.writeUInt8(80, offset2);
    offset2 += 1;
    gpb2.writeUInt8(0, offset2);
    offset2 += 1;
    const flags2 = 34;
    gpb2.writeUInt8(flags2, offset2);
    offset2 += 1;
    gpb2.writeInt32LE(srsId, offset2);
    offset2 += 4;
    wkb.copy(gpb2, offset2);
    return gpb2;
  }
  const [minX, maxX, minY, maxY] = computeEnvelope(geometry);
  const headerSize = 2 + 1 + 1 + 4 + 32;
  const gpb = Buffer.alloc(headerSize + wkb.length);
  let offset = 0;
  gpb.writeUInt8(71, offset);
  offset += 1;
  gpb.writeUInt8(80, offset);
  offset += 1;
  gpb.writeUInt8(0, offset);
  offset += 1;
  const flags = 36;
  gpb.writeUInt8(flags, offset);
  offset += 1;
  gpb.writeInt32LE(srsId, offset);
  offset += 4;
  gpb.writeDoubleLE(minX, offset);
  offset += 8;
  gpb.writeDoubleLE(maxX, offset);
  offset += 8;
  gpb.writeDoubleLE(minY, offset);
  offset += 8;
  gpb.writeDoubleLE(maxY, offset);
  offset += 8;
  wkb.copy(gpb, offset);
  return gpb;
}
function gpkgGeometryType(geojsonType) {
  switch (geojsonType) {
    case "Point":
      return "POINT";
    case "LineString":
      return "LINESTRING";
    case "Polygon":
      return "POLYGON";
    default:
      return "GEOMETRY";
  }
}
function checkSqliteAvailability() {
  try {
    const db = new Database(":memory:");
    db.close();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}
function generateGeoPackage(featureCollection, sessionName) {
  const layerGroups = /* @__PURE__ */ new Map();
  for (const feature of featureCollection.features) {
    const featureType = feature.properties.feature_type || "unknown";
    if (!layerGroups.has(featureType)) {
      layerGroups.set(featureType, []);
    }
    layerGroups.get(featureType).push(feature);
  }
  const db = new Database(":memory:");
  try {
    db.pragma("application_id = 0x47504B47");
    db.pragma("user_version = 10300");
    db.exec(`
      CREATE TABLE gpkg_spatial_ref_sys (
        srs_name TEXT NOT NULL,
        srs_id INTEGER NOT NULL PRIMARY KEY,
        organization TEXT NOT NULL,
        organization_coordsys_id INTEGER NOT NULL,
        definition TEXT NOT NULL,
        description TEXT
      );

      INSERT INTO gpkg_spatial_ref_sys VALUES
        ('Undefined cartesian SRS', -1, 'NONE', -1, 'undefined', 'undefined cartesian coordinate reference system'),
        ('Undefined geographic SRS', 0, 'NONE', 0, 'undefined', 'undefined geographic coordinate reference system'),
        ('WGS 84 geodetic', 4326, 'EPSG', 4326,
         'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563,AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4326"]]',
         'longitude/latitude coordinates in decimal degrees on the WGS 84 spheroid');

      CREATE TABLE gpkg_contents (
        table_name TEXT NOT NULL PRIMARY KEY,
        data_type TEXT NOT NULL DEFAULT 'features',
        identifier TEXT UNIQUE,
        description TEXT DEFAULT '',
        last_change TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        min_x DOUBLE,
        min_y DOUBLE,
        max_x DOUBLE,
        max_y DOUBLE,
        srs_id INTEGER,
        CONSTRAINT fk_gc_r_srs_id FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id)
      );

      CREATE TABLE gpkg_geometry_columns (
        table_name TEXT NOT NULL,
        column_name TEXT NOT NULL,
        geometry_type_name TEXT NOT NULL,
        srs_id INTEGER NOT NULL,
        z TINYINT NOT NULL,
        m TINYINT NOT NULL,
        CONSTRAINT pk_geom_cols PRIMARY KEY (table_name, column_name),
        CONSTRAINT fk_gc_tn FOREIGN KEY (table_name) REFERENCES gpkg_contents(table_name),
        CONSTRAINT fk_gc_srs FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id)
      );
    `);
    for (const [featureType, features] of layerGroups) {
      if (features.length === 0) continue;
      const tableName = featureType.replace(/[^a-zA-Z0-9_]/g, "_");
      const geomType = gpkgGeometryType(features[0].geometry.type);
      const propKeys = /* @__PURE__ */ new Set();
      for (const f of features) {
        for (const key of Object.keys(f.properties)) {
          if (key !== "feature_type") propKeys.add(key);
        }
      }
      const columns = ["fid INTEGER PRIMARY KEY AUTOINCREMENT", "geom BLOB"];
      for (const key of propKeys) {
        const safeName = key.replace(/[^a-zA-Z0-9_]/g, "_");
        let colType = "TEXT";
        for (const f of features) {
          const val = f.properties[key];
          if (val != null) {
            if (typeof val === "number") {
              colType = Number.isInteger(val) ? "INTEGER" : "REAL";
            } else if (typeof val === "boolean") {
              colType = "INTEGER";
            }
            break;
          }
        }
        columns.push(`"${safeName}" ${colType}`);
      }
      db.exec(`CREATE TABLE "${tableName}" (${columns.join(", ")})`);
      let layerMinX = Infinity, layerMaxX = -Infinity;
      let layerMinY = Infinity, layerMaxY = -Infinity;
      let hasZ = false;
      const propKeysArray = Array.from(propKeys);
      const placeholders = ["?", ...propKeysArray.map(() => "?")].join(", ");
      const colNames = ['"geom"', ...propKeysArray.map((k) => `"${k.replace(/[^a-zA-Z0-9_]/g, "_")}"`)].join(", ");
      const insertStmt = db.prepare(`INSERT INTO "${tableName}" (${colNames}) VALUES (${placeholders})`);
      const insertMany = db.transaction((feats) => {
        for (const feat of feats) {
          try {
            const gpb = encodeGPB(feat.geometry, 4326);
            const [minX, maxX, minY, maxY] = computeEnvelope(feat.geometry);
            if (minX < layerMinX) layerMinX = minX;
            if (maxX > layerMaxX) layerMaxX = maxX;
            if (minY < layerMinY) layerMinY = minY;
            if (maxY > layerMaxY) layerMaxY = maxY;
            if (!hasZ) {
              const coords = feat.geometry.coordinates;
              if (feat.geometry.type === "Point" && coords.length >= 3) hasZ = true;
              else if (feat.geometry.type === "LineString" && coords.length > 0 && coords[0].length >= 3) hasZ = true;
              else if (feat.geometry.type === "Polygon" && coords.length > 0 && coords[0].length > 0 && coords[0][0].length >= 3) hasZ = true;
            }
            const values = [gpb];
            for (const key of propKeysArray) {
              let val = feat.properties[key];
              if (val === void 0 || val === null) {
                values.push(null);
              } else if (typeof val === "boolean") {
                values.push(val ? 1 : 0);
              } else {
                values.push(val);
              }
            }
            insertStmt.run(...values);
          } catch (err) {
            log.warn(`[GeoPackage] Skipping feature: ${err.message}`);
          }
        }
      });
      insertMany(features);
      const now = (/* @__PURE__ */ new Date()).toISOString();
      db.prepare(`
        INSERT INTO gpkg_contents (table_name, data_type, identifier, description, last_change, min_x, min_y, max_x, max_y, srs_id)
        VALUES (?, 'features', ?, ?, ?, ?, ?, ?, ?, 4326)
      `).run(
        tableName,
        tableName,
        `${sessionName} - ${featureType}`,
        now,
        isFinite(layerMinX) ? layerMinX : null,
        isFinite(layerMinY) ? layerMinY : null,
        isFinite(layerMaxX) ? layerMaxX : null,
        isFinite(layerMaxY) ? layerMaxY : null
      );
      db.prepare(`
        INSERT INTO gpkg_geometry_columns (table_name, column_name, geometry_type_name, srs_id, z, m)
        VALUES (?, 'geom', ?, 4326, ?, 0)
      `).run(tableName, geomType, hasZ ? 1 : 0);
      log.info(`[GeoPackage] Created layer "${tableName}" with ${features.length} features`);
    }
    const buffer = db.serialize();
    log.info(`[GeoPackage] Generated ${buffer.length} bytes for "${sessionName}"`);
    return Buffer.from(buffer);
  } finally {
    db.close();
  }
}
function escapeHtml$1(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function safeInlineJSON(obj) {
  return JSON.stringify(obj).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}
function normalizeQuality(q) {
  if (q === "poor") return "lost";
  if (q === "degraded") return "degraded";
  if (q === "lost") return "lost";
  return "good";
}
function segmentTrackByGPSQuality(positions) {
  if (positions.length === 0) return [];
  const segments = [];
  let currentQuality = normalizeQuality(positions[0].gps_quality || "good");
  let currentPositions = [positions[0]];
  for (let i = 1; i < positions.length; i++) {
    const q = normalizeQuality(positions[i].gps_quality || "good");
    if (q !== currentQuality) {
      segments.push({ quality: currentQuality, positions: currentPositions });
      currentPositions = [positions[i - 1], positions[i]];
      currentQuality = q;
    } else {
      currentPositions.push(positions[i]);
    }
  }
  if (currentPositions.length > 0) {
    segments.push({ quality: currentQuality, positions: currentPositions });
  }
  return segments;
}
function thinPositions(positions, maxPoints) {
  if (positions.length <= maxPoints) return positions;
  const transitionIndices = /* @__PURE__ */ new Set([0, positions.length - 1]);
  for (let i = 1; i < positions.length; i++) {
    const prev = normalizeQuality(positions[i - 1].gps_quality || "good");
    const curr = normalizeQuality(positions[i].gps_quality || "good");
    if (prev !== curr) {
      transitionIndices.add(i - 1);
      transitionIndices.add(i);
    }
  }
  const remaining = maxPoints - transitionIndices.size;
  if (remaining <= 0) {
    const sorted = Array.from(transitionIndices).sort((a, b) => a - b);
    if (sorted.length <= maxPoints) return sorted.map((i) => positions[i]);
    const step = sorted.length / maxPoints;
    const subsampled = [sorted[0]];
    for (let j = 1; j < maxPoints - 1; j++) {
      subsampled.push(sorted[Math.round(j * step)]);
    }
    subsampled.push(sorted[sorted.length - 1]);
    return subsampled.map((i) => positions[i]);
  }
  const stride = Math.max(1, Math.floor(positions.length / remaining));
  const indices = new Set(transitionIndices);
  for (let i = 0; i < positions.length && indices.size < maxPoints; i += stride) {
    indices.add(i);
  }
  return Array.from(indices).sort((a, b) => a - b).map((i) => positions[i]);
}
const TRACKER_PALETTE = ["#ff6b6b", "#4ecdc4", "#ffd93d", "#6bcb77", "#4d96ff", "#ff6b9d"];
function generateLeafletMap(geojson, positionsByTracker, sessionName) {
  const MAX_POINTS_PER_TRACKER = 1e4;
  const safeTitle = escapeHtml$1(sessionName);
  const trackerStats = [];
  const droneTrackFeatures = [];
  let trackerIdx = 0;
  for (const [trackerId, rawPositions] of positionsByTracker) {
    if (rawPositions.length < 2) continue;
    const color = TRACKER_PALETTE[trackerIdx % TRACKER_PALETTE.length];
    const positions = thinPositions(rawPositions, MAX_POINTS_PER_TRACKER);
    const segments = segmentTrackByGPSQuality(positions);
    const speeds = rawPositions.map((p) => p.speed_ms).filter((s2) => s2 != null && s2 > 0);
    const avgSpeed = speeds.length > 0 ? (speeds.reduce((a, b) => a + b, 0) / speeds.length).toFixed(1) : "0.0";
    const t0 = new Date(rawPositions[0].timestamp).getTime();
    const t1 = new Date(rawPositions[rawPositions.length - 1].timestamp).getTime();
    const durSec = Math.max(0, (t1 - t0) / 1e3);
    const m = Math.floor(durSec / 60);
    const s = Math.floor(durSec % 60);
    const duration = `${m}m ${s}s`;
    const allCoords = [];
    for (const seg of segments) {
      const coords = seg.positions.map((p) => [p.longitude, p.latitude]);
      const coordTimes = seg.positions.map((p) => new Date(p.timestamp).getTime());
      allCoords.push(...coords);
      droneTrackFeatures.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
        properties: {
          tracker_id: trackerId,
          tracker_color: color,
          gps_quality: seg.quality,
          point_count: coords.length,
          coord_times: coordTimes
        }
      });
    }
    trackerStats.push({ id: trackerId, color, pointCount: rawPositions.length, avgSpeed, duration, allCoords, startMs: t0, endMs: t1 });
    trackerIdx++;
  }
  const cuasPlacement = [];
  const cuasCoverage = [];
  const engagementLines = [];
  const siteBoundary = [];
  const siteZones = [];
  const siteMarkers = [];
  const assetPlacements = [];
  for (const f of geojson.features) {
    const ft = f.properties.feature_type;
    if (ft === "drone_track" || ft === "session_metadata") continue;
    if (ft === "cuas_placement") cuasPlacement.push(f);
    else if (ft === "cuas_coverage") cuasCoverage.push(f);
    else if (ft === "engagement_line") engagementLines.push(f);
    else if (ft === "site_boundary") siteBoundary.push(f);
    else if (ft === "site_zone") siteZones.push(f);
    else if (ft === "site_marker") siteMarkers.push(f);
    else if (ft === "asset_placement") assetPlacements.push(f);
  }
  const metaFeature = geojson.features.find((f) => f.properties.feature_type === "session_metadata");
  const sessionDate = metaFeature?.properties?.start_time ? String(metaFeature.properties.start_time).substring(0, 10) : (/* @__PURE__ */ new Date()).toISOString().substring(0, 10);
  const sessionStartMs = trackerStats.length > 0 ? Math.min(...trackerStats.map((t) => t.startMs)) : NaN;
  const sessionEndMs = trackerStats.length > 0 ? Math.max(...trackerStats.map((t) => t.endMs)) : NaN;
  const timeBounds = !isNaN(sessionStartMs) && !isNaN(sessionEndMs) && sessionEndMs > sessionStartMs ? { start: sessionStartMs, end: sessionEndMs } : null;
  const geoData = {
    drone_tracks: droneTrackFeatures,
    cuas_placement: cuasPlacement,
    cuas_coverage: cuasCoverage,
    engagement_lines: engagementLines,
    site_boundary: siteBoundary,
    site_zones: siteZones,
    site_markers: siteMarkers,
    asset_placements: assetPlacements
  };
  if (timeBounds) {
    geoData.time_bounds = timeBounds;
  }
  const allPts = [];
  for (const ts of trackerStats) allPts.push(...ts.allCoords);
  for (const f of [...cuasPlacement, ...siteMarkers, ...assetPlacements]) {
    if (f.geometry?.type === "Point") allPts.push(f.geometry.coordinates);
  }
  const centerLat = allPts.length > 0 ? allPts.reduce((s, c) => s + c[1], 0) / allPts.length : 0;
  const centerLon = allPts.length > 0 ? allPts.reduce((s, c) => s + c[0], 0) / allPts.length : 0;
  const trackerStatsHtml = trackerStats.map(
    (t) => `    <div class="track-item">
      <div class="track-name"><span class="dot" style="background:${t.color};"></span>${escapeHtml$1(t.id)}</div>
      <div class="track-detail">${t.pointCount} pts &middot; ${t.avgSpeed} m/s avg &middot; ${t.duration}</div>
    </div>`
  ).join("\n");
  const trackerLegendHtml = trackerStats.map(
    (t) => `    <div class="legend-item"><div class="legend-box" style="background:${t.color};"></div>${escapeHtml$1(t.id)} track</div>`
  ).join("\n");
  const hasEngagements = engagementLines.length > 0;
  const hasSiteBoundary = siteBoundary.length > 0;
  const hasCuas = cuasCoverage.length > 0 || cuasPlacement.length > 0;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${safeTitle} — SCENSUS Map</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; }
  #map { width: 100%; height: 100vh; }
  .info-panel {
    position: absolute; top: 12px; right: 12px; z-index: 1000;
    background: rgba(15,15,25,0.92); backdrop-filter: blur(12px);
    border: 1px solid rgba(100,140,255,0.25); border-radius: 10px;
    padding: 16px 18px; color: #e0e8f0; min-width: 260px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.5);
  }
  .info-panel h2 { font-size: 14px; color: #8ab4f8; margin-bottom: 10px; letter-spacing: 1px; text-transform: uppercase; }
  .info-panel .session { font-size: 11px; color: #6a7a8a; margin-bottom: 12px; }
  .track-item { padding: 8px 0; border-bottom: 1px solid rgba(100,140,255,0.1); }
  .track-item:last-child { border-bottom: none; }
  .track-name { font-weight: 600; font-size: 13px; }
  .track-detail { font-size: 11px; color: #8a9aaa; margin-top: 3px; }
  .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
  .legend-item { display: flex; align-items: center; margin: 6px 0; font-size: 12px; color: #a0b0c0; }
  .legend-box { width: 18px; height: 4px; border-radius: 2px; margin-right: 8px; flex-shrink: 0; }
  .legend-circle { width: 12px; height: 12px; border-radius: 50%; margin-right: 8px; flex-shrink: 0; border: 2px solid; }
  .leaflet-popup-content-wrapper { background: rgba(15,15,25,0.95); color: #e0e8f0; border: 1px solid rgba(100,140,255,0.3); border-radius: 8px; }
  .leaflet-popup-tip { background: rgba(15,15,25,0.95); }
  .leaflet-popup-content { font-size: 12px; line-height: 1.5; }
  .leaflet-popup-content b { color: #8ab4f8; }
  .time-bar { position: absolute; bottom: 30px; left: 60px; right: 280px; z-index: 1000;
    background: rgba(15,15,25,0.92); backdrop-filter: blur(12px);
    border: 1px solid rgba(100,140,255,0.25); border-radius: 8px;
    padding: 8px 14px; display: flex; align-items: center; gap: 10px;
    color: #e0e8f0; font-size: 11px; }
  .time-bar input[type=range] { flex: 1; accent-color: #8ab4f8; }
  .time-bar button { background: none; border: 1px solid rgba(100,140,255,0.3);
    border-radius: 4px; color: #8ab4f8; padding: 2px 8px; cursor: pointer; font-size: 12px; }
  .time-bar button:hover { background: rgba(100,140,255,0.1); }
  .time-bar select { background: rgba(15,15,25,0.9); color: #8ab4f8;
    border: 1px solid rgba(100,140,255,0.3); border-radius: 4px; padding: 2px 4px; font-size: 10px; }
</style>
</head>
<body>
<div id="map"></div>
<div class="info-panel">
  <h2>${safeTitle}</h2>
  <div class="session">${escapeHtml$1(sessionDate)} &middot; SCENSUS</div>
  <div style="margin-bottom: 12px;">
${trackerStatsHtml}
  </div>
  <div style="border-top: 1px solid rgba(100,140,255,0.15); padding-top: 10px;">
    <div style="font-size: 11px; color: #6a7a8a; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Legend</div>
${trackerLegendHtml}
    <div class="legend-item"><div class="legend-box" style="background:#22c55e;"></div>Good GPS</div>
    <div class="legend-item"><div class="legend-box" style="background:#eab308;"></div>Degraded GPS</div>
    <div class="legend-item"><div class="legend-box" style="background:#ef4444;"></div>Lost GPS</div>
    <div class="legend-item"><div class="legend-circle" style="background:rgba(255,107,107,0.15); border-color:#ff6b6b;"></div>Track start</div>
${hasCuas ? `    <div class="legend-item"><div class="legend-box" style="background:rgba(255,170,50,0.3); height:12px; width:12px; border: 1px solid #ffaa32; border-radius:2px;"></div>CUAS coverage</div>
    <div class="legend-item"><div class="legend-circle" style="background:#ffaa32; border-color:#ff8800;"></div>CUAS placement</div>` : ""}
${hasEngagements ? `    <div class="legend-item"><div class="legend-box" style="background:#06b6d4; height:2px; border-top: 2px dashed #06b6d4; background: none;"></div>Engagement</div>` : ""}
${hasSiteBoundary ? `    <div class="legend-item"><div class="legend-box" style="height:2px; border-top: 2px dashed #ffffff; background: none;"></div>Site boundary</div>` : ""}
  </div>
</div>
<div class="time-bar" id="time-bar" style="display:none;">
  <button id="play-btn">&#9654;</button>
  <input type="range" id="time-slider" min="0" max="1000" value="1000" step="1">
  <span id="time-label">--:--:--</span>
  <select id="speed-select">
    <option value="1">1x</option><option value="2">2x</option>
    <option value="5">5x</option><option value="10">10x</option>
  </select>
</div>

<script>
const geoData = ${safeInlineJSON(geoData)};

const map = L.map('map', { zoomControl: false, attributionControl: false }).setView([${centerLat}, ${centerLon}], 15);
L.control.zoom({ position: 'bottomleft' }).addTo(map);
L.control.attribution({ position: 'bottomleft' }).addTo(map);

L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 19
}).addTo(map);

var qualityColors = { good: '#22c55e', degraded: '#eab308', lost: '#ef4444' };
var esc = function(s) { return s == null ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };

// 1. Site zones
geoData.site_zones.forEach(function(f) {
  if (!f.geometry) return;
  var c = f.properties.color || '#8ab4f8';
  L.geoJSON(f, { style: { fillColor: c, fillOpacity: 0.06, color: c, weight: 1, opacity: 0.3 } })
    .bindPopup('<b>' + esc(f.properties.zone_name || 'Zone') + '</b>')
    .addTo(map);
});

// 2. Site boundary
geoData.site_boundary.forEach(function(f) {
  if (!f.geometry) return;
  L.geoJSON(f, { style: { color: '#ffffff', weight: 1.5, opacity: 0.5, dashArray: '10,6', fillOpacity: 0 } })
    .bindPopup('<b>' + esc(f.properties.site_name || 'Site Boundary') + '</b>')
    .addTo(map);
});

// 3. CUAS coverage
geoData.cuas_coverage.forEach(function(f) {
  if (!f.geometry) return;
  L.geoJSON(f, { style: { fillColor: '#ffaa32', fillOpacity: 0.08, color: '#ffaa32', weight: 1.5, opacity: 0.5, dashArray: '6,4' } })
    .bindPopup('<b>' + esc(f.properties.cuas_name) + '</b><br>Range: ' + esc(f.properties.range_m) + 'm<br>Pattern: ' + esc(f.properties.antenna_pattern))
    .addTo(map);
});

// 4. Engagement lines
var engagementLayers = [];
geoData.engagement_lines.forEach(function(f) {
  if (!f.geometry) return;
  var layer = L.geoJSON(f, { style: { color: '#06b6d4', weight: 2, dashArray: '8,4', opacity: 0.8 } })
    .bindPopup('<b>Engagement</b><br>CUAS: ' + esc(f.properties.cuas_name) + '<br>Target: ' + esc(f.properties.target_tracker) + '<br>Range: ' + esc(f.properties.range_m) + 'm<br>Bearing: ' + esc(f.properties.bearing_deg) + '&deg;<br>Result: ' + esc(f.properties.result))
    .addTo(map);
  var sMs = new Date(f.properties.start_time).getTime();
  var eMs = new Date(f.properties.end_time).getTime();
  if (!isNaN(sMs) && !isNaN(eMs)) {
    engagementLayers.push({ layer: layer, startMs: sMs, endMs: eMs });
  }
});

// 5. Drone tracks (ghost trail + main per segment)
var hasTimeline = !!(geoData.time_bounds && geoData.drone_tracks.length > 0);
geoData.drone_tracks.forEach(function(f) {
  if (!f.geometry) return;
  var qColor = qualityColors[f.properties.gps_quality] || '#22c55e';
  var dash = f.properties.gps_quality === 'good' ? null : '6,4';
  // Glow (fainter when timeline active)
  L.geoJSON(f, { style: { color: qColor, weight: 6, opacity: hasTimeline ? 0.05 : 0.15 } }).addTo(map);
  // Main line (ghost when timeline active, full when static)
  L.geoJSON(f, { style: { color: qColor, weight: 2.5, opacity: hasTimeline ? 0.15 : 0.85, dashArray: dash } })
    .bindPopup('<b>Drone: ' + esc(f.properties.tracker_id) + '</b><br>GPS: ' + esc(f.properties.gps_quality) + '<br>Points: ' + f.properties.point_count)
    .addTo(map);
});

// 6. CUAS placements
geoData.cuas_placement.forEach(function(f) {
  if (!f.geometry) return;
  var ll = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
  L.circleMarker(ll, { radius: 8, fillColor: '#ffaa32', color: '#ff8800', weight: 2, fillOpacity: 0.9 })
    .bindPopup('<b>' + esc(f.properties.cuas_name) + '</b><br>Vendor: ' + esc(f.properties.cuas_vendor) + '<br>Type: ' + esc(f.properties.cuas_type) + '<br>Range: ' + esc(f.properties.effective_range_m) + 'm<br>Active: ' + (f.properties.active ? 'Yes' : 'No'))
    .addTo(map);
});

// 7. Site markers
geoData.site_markers.forEach(function(f) {
  if (!f.geometry) return;
  var ll = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
  L.circleMarker(ll, { radius: 4, fillColor: '#ffd700', color: '#ffd700', weight: 1, fillOpacity: 0.9 })
    .bindPopup('<b>' + esc(f.properties.marker_name || 'Site Marker') + '</b>')
    .addTo(map);
});

// 8. Asset placements
geoData.asset_placements.forEach(function(f) {
  if (!f.geometry) return;
  var ll = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
  L.circleMarker(ll, { radius: 4, fillColor: '#ffffff', color: '#ffffff', weight: 1, fillOpacity: 0.7 })
    .bindPopup('<b>' + esc(f.properties.asset_name || 'Asset') + '</b>')
    .addTo(map);
});

// 9 & 10. Start/end markers + direction arrows per tracker
var trackerCoords = {};
geoData.drone_tracks.forEach(function(f) {
  if (!f.geometry) return;
  var tid = f.properties.tracker_id;
  if (!trackerCoords[tid]) trackerCoords[tid] = { color: f.properties.tracker_color, coords: [] };
  trackerCoords[tid].coords = trackerCoords[tid].coords.concat(f.geometry.coordinates);
});

Object.keys(trackerCoords).forEach(function(tid) {
  var tc = trackerCoords[tid];
  var coords = tc.coords;
  var color = tc.color;
  if (coords.length < 2) return;

  // Start marker
  var s = coords[0];
  L.circleMarker([s[1], s[0]], { radius: 6, fillColor: color, color: '#fff', weight: 2, fillOpacity: 0.9 })
    .bindPopup('<b>' + esc(tid) + ' - Start</b>').addTo(map);

  // End marker
  var e = coords[coords.length - 1];
  L.circleMarker([e[1], e[0]], { radius: 4, fillColor: color, color: color, weight: 2, fillOpacity: 0.6 })
    .bindPopup('<b>' + esc(tid) + ' - End</b>').addTo(map);

  // Direction arrows
  var step = Math.max(1, Math.floor(coords.length / 6));
  for (var i = 0; i < coords.length - 1; i += step) {
    var p1 = coords[i];
    var p2 = coords[Math.min(i + 3, coords.length - 1)];
    var angle = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]) * 180 / Math.PI;
    var mid = [(p1[0]+p2[0])/2, (p1[1]+p2[1])/2];
    L.marker([mid[1], mid[0]], {
      icon: L.divIcon({
        className: '',
        html: '<div style="color:' + color + ';font-size:14px;transform:rotate(' + (-angle+90) + 'deg);opacity:0.7;">&#9650;</div>',
        iconSize: [14, 14], iconAnchor: [7, 7]
      })
    }).addTo(map);
  }
});

// 11. Time slider: build per-tracker timeline + position dots
var trackerTimeline = {};
var positionDots = {};
geoData.drone_tracks.forEach(function(f) {
  if (!f.geometry || !f.properties.coord_times) return;
  var tid = f.properties.tracker_id;
  if (!trackerTimeline[tid]) trackerTimeline[tid] = { color: f.properties.tracker_color, points: [] };
  var coords = f.geometry.coordinates;
  var times = f.properties.coord_times;
  for (var i = 0; i < coords.length; i++) {
    trackerTimeline[tid].points.push({ lng: coords[i][0], lat: coords[i][1], t: times[i] });
  }
});
var activeTrails = {};
Object.keys(trackerTimeline).forEach(function(tid) {
  trackerTimeline[tid].points.sort(function(a, b) { return a.t - b.t; });
  var pts = trackerTimeline[tid].points;
  if (pts.length === 0) return;
  var last = pts[pts.length - 1];
  // Active trail polyline — drawn from start to current slider time
  var allLatLngs = pts.map(function(p) { return [p.lat, p.lng]; });
  activeTrails[tid] = L.polyline(allLatLngs, {
    color: trackerTimeline[tid].color, weight: 3, opacity: 0.9
  }).addTo(map);
  // Position dot on top
  positionDots[tid] = L.circleMarker([last.lat, last.lng], {
    radius: 7, fillColor: trackerTimeline[tid].color, color: '#fff', weight: 2, fillOpacity: 1, pane: 'markerPane'
  }).addTo(map);
});

// Binary search: find index of last point with t <= ms
function bsearch(pts, ms) {
  var lo = 0, hi = pts.length - 1, ans = -1;
  while (lo <= hi) {
    var mid = (lo + hi) >> 1;
    if (pts[mid].t <= ms) { ans = mid; lo = mid + 1; }
    else { hi = mid - 1; }
  }
  return ans;
}

function formatTime(ms) {
  var d = new Date(ms);
  var h = d.getUTCHours().toString().padStart(2, '0');
  var m = d.getUTCMinutes().toString().padStart(2, '0');
  var s = d.getUTCSeconds().toString().padStart(2, '0');
  return h + ':' + m + ':' + s;
}

function updateTime(ms) {
  // Position dots + active trails
  Object.keys(trackerTimeline).forEach(function(tid) {
    var pts = trackerTimeline[tid].points;
    var dot = positionDots[tid];
    var trail = activeTrails[tid];
    var idx = bsearch(pts, ms);
    if (idx < 0) {
      if (dot) dot.setStyle({ opacity: 0, fillOpacity: 0 });
      if (trail) trail.setLatLngs([]);
    } else {
      var p = pts[idx];
      if (dot) {
        dot.setLatLng([p.lat, p.lng]);
        dot.setStyle({ opacity: 1, fillOpacity: 1 });
      }
      if (trail) {
        var sliced = [];
        for (var i = 0; i <= idx; i++) { sliced.push([pts[i].lat, pts[i].lng]); }
        trail.setLatLngs(sliced);
      }
    }
  });
  // Engagement lines
  engagementLayers.forEach(function(eg) {
    if (ms < eg.startMs) {
      eg.layer.setStyle({ opacity: 0 });
    } else if (ms >= eg.startMs && ms <= eg.endMs) {
      eg.layer.setStyle({ opacity: 0.8 });
    } else {
      eg.layer.setStyle({ opacity: 0.3 });
    }
  });
  // Time label
  var label = document.getElementById('time-label');
  if (label) label.textContent = formatTime(ms);
}

// 12. Wire up time bar
(function() {
  var tb = geoData.time_bounds;
  var bar = document.getElementById('time-bar');
  if (!tb || !bar || geoData.drone_tracks.length === 0) return;
  bar.style.display = 'flex';
  var slider = document.getElementById('time-slider');
  var playBtn = document.getElementById('play-btn');
  var speedSel = document.getElementById('speed-select');
  slider.min = tb.start;
  slider.max = tb.end;
  slider.value = tb.end;
  slider.step = Math.max(1, Math.floor((tb.end - tb.start) / 1000));
  updateTime(tb.end);

  slider.addEventListener('input', function() { updateTime(Number(slider.value)); });

  var playing = false;
  var lastFrame = null;
  function animate(now) {
    if (!playing) return;
    if (lastFrame !== null) {
      var dt = now - lastFrame;
      var speed = Number(speedSel.value) || 1;
      var newVal = Number(slider.value) + dt * speed;
      if (newVal >= tb.end) {
        slider.value = tb.end;
        updateTime(tb.end);
        playing = false;
        playBtn.innerHTML = '&#9654;';
        lastFrame = null;
        return;
      }
      slider.value = newVal;
      updateTime(newVal);
    }
    lastFrame = now;
    requestAnimationFrame(animate);
  }

  playBtn.addEventListener('click', function() {
    if (playing) {
      playing = false;
      playBtn.innerHTML = '&#9654;';
      lastFrame = null;
    } else {
      if (Number(slider.value) >= tb.end) slider.value = tb.start;
      playing = true;
      playBtn.innerHTML = '&#9646;&#9646;';
      lastFrame = null;
      requestAnimationFrame(animate);
    }
  });
})();

// Fit bounds to all features
var allCoords = [];
geoData.drone_tracks.forEach(function(f) { if(f.geometry) f.geometry.coordinates.forEach(function(c) { allCoords.push([c[1],c[0]]); }); });
geoData.cuas_placement.forEach(function(f) { if(f.geometry) allCoords.push([f.geometry.coordinates[1], f.geometry.coordinates[0]]); });
geoData.site_markers.forEach(function(f) { if(f.geometry) allCoords.push([f.geometry.coordinates[1], f.geometry.coordinates[0]]); });
geoData.asset_placements.forEach(function(f) { if(f.geometry) allCoords.push([f.geometry.coordinates[1], f.geometry.coordinates[0]]); });
if (allCoords.length > 0) {
  map.fitBounds(L.latLngBounds(allCoords).pad(0.1));
}
<\/script>
</body>
</html>`;
}
const PYTHON_BASE = "http://127.0.0.1:8083";
class CotActorBridge {
  uidToActor = /* @__PURE__ */ new Map();
  activeSessionId = null;
  refreshInterval = null;
  broadcastFn = null;
  // Throttle: at most one position update per actor per N ms
  lastForwardedAt = /* @__PURE__ */ new Map();
  throttleMs = 1e3;
  /**
   * Set the WebSocket broadcast function for real-time updates.
   */
  setBroadcast(fn) {
    this.broadcastFn = fn;
  }
  /**
   * Set the active session ID and refresh actor mappings.
   */
  async setActiveSession(sessionId) {
    this.activeSessionId = sessionId;
    this.uidToActor.clear();
    this.lastForwardedAt.clear();
    if (sessionId) {
      await this.refreshActorMappings();
      this.stopAutoRefresh();
      this.refreshInterval = setInterval(() => {
        this.refreshActorMappings().catch(() => {
        });
      }, 3e4);
    } else {
      this.stopAutoRefresh();
    }
  }
  /**
   * Process a batch of CoT events. Matches UIDs against known session actors.
   */
  processCotEvents(events2) {
    if (!this.activeSessionId || this.uidToActor.size === 0) return;
    const now = Date.now();
    for (const event of events2) {
      const actor = this.uidToActor.get(event.uid);
      if (!actor) continue;
      const lastTime = this.lastForwardedAt.get(actor.actorId) || 0;
      if (now - lastTime < this.throttleMs) continue;
      this.lastForwardedAt.set(actor.actorId, now);
      this.forwardOperatorPosition(actor, event);
    }
  }
  /**
   * Stop auto-refresh and clean up.
   */
  stop() {
    this.stopAutoRefresh();
    this.uidToActor.clear();
    this.activeSessionId = null;
  }
  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------
  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }
  /**
   * Fetch session actors with cot_uid from Python backend and build the lookup map.
   */
  async refreshActorMappings() {
    if (!this.activeSessionId) return;
    try {
      const resp = await fetch(
        `${PYTHON_BASE}/api/v2/sessions/${this.activeSessionId}/actors`
      );
      if (!resp.ok) return;
      const actors = await resp.json();
      this.uidToActor.clear();
      for (const actor of actors) {
        if (actor.cot_uid) {
          this.uidToActor.set(actor.cot_uid, {
            actorId: actor.id,
            sessionId: this.activeSessionId,
            cotUid: actor.cot_uid,
            name: actor.name
          });
        }
      }
      if (this.uidToActor.size > 0) {
        log.debug(
          `[CoT Actor Bridge] Mapped ${this.uidToActor.size} actor(s) for session ${this.activeSessionId}`
        );
      }
    } catch (err) {
      log.warn("[CoT Actor Bridge] Failed to refresh actor mappings:", err);
    }
  }
  /**
   * Forward a CoT event as an operator position to the Python backend.
   */
  async forwardOperatorPosition(actor, event) {
    const payload = {
      actor_id: actor.actorId,
      timestamp: event.timestamp,
      lat: event.lat,
      lon: event.lon,
      alt_m: event.alt_m,
      heading_deg: event.course_deg,
      speed_mps: event.speed_mps,
      gps_accuracy_m: event.ce,
      source: "cot"
    };
    try {
      const resp = await fetch(
        `${PYTHON_BASE}/api/v2/sessions/${actor.sessionId}/operator-positions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );
      if (resp.ok) {
        this.broadcastFn?.({
          type: "operator_updated",
          data: {
            actor_id: actor.actorId,
            session_id: actor.sessionId,
            name: actor.name,
            lat: event.lat,
            lon: event.lon,
            alt_m: event.alt_m,
            heading_deg: event.course_deg,
            speed_mps: event.speed_mps,
            timestamp: event.timestamp
          }
        });
      }
    } catch {
    }
  }
}
const cotActorBridge = new CotActorBridge();
const PYTHON_BACKEND_PORT$1 = 8083;
const PYTHON_BACKEND_URL$1 = `http://127.0.0.1:${PYTHON_BACKEND_PORT$1}`;
const SESSION_START_RE = /^\/api\/v2\/sessions\/([^/]+)\/start$/;
const SESSION_STOP_RE = /^\/api\/v2\/sessions\/([^/]+)\/stop$/;
const SESSION_CREATE_RE = /^\/api\/v2\/sessions\/?$/;
const SESSION_ASSIGN_TRACKER_RE = /^\/api\/v2\/sessions\/([^/]+)\/assign-tracker$/;
const SESSION_CUAS_PLACEMENT_RE = /^\/api\/v2\/sessions\/([^/]+)\/cuas-placement$/;
const CUAS_GEOTAG_RE = /^\/api\/v2\/cuas-placements\/([^/]+)\/geotag$/;
const SDR_READING_RE = /^\/api\/v2\/sessions\/([^/]+)\/sdr-readings$/;
const ENGAGEMENT_ENGAGE_RE = /^\/api\/v2\/engagements\/([^/]+)\/engage$/;
const ENGAGEMENT_DISENGAGE_RE = /^\/api\/v2\/engagements\/([^/]+)\/disengage$/;
const ENGAGEMENT_ABORT_RE = /^\/api\/v2\/engagements\/([^/]+)\/abort$/;
const ENGAGEMENT_JAM_ON_RE = /^\/api\/v2\/engagements\/([^/]+)\/jam-on$/;
const ENGAGEMENT_JAM_OFF_RE = /^\/api\/v2\/engagements\/([^/]+)\/jam-off$/;
const DRONE_PROFILE_COLLECTION_RE = /^\/api\/v2\/drone-profiles\/?$/;
const DRONE_PROFILE_ITEM_RE = /^\/api\/v2\/drone-profiles\/([^/]+)\/?$/;
const CUAS_PROFILE_COLLECTION_RE = /^\/api\/v2\/cuas-profiles\/?$/;
const CUAS_PROFILE_ITEM_RE = /^\/api\/v2\/cuas-profiles\/([^/]+)\/?$/;
const sessionPaths = /* @__PURE__ */ new Map();
const SESSION_PATHS_FILE = path__namespace.join(
  loadConfig().log_root_folder,
  "session-paths.json"
);
function loadSessionPaths() {
  try {
    if (fs__namespace.existsSync(SESSION_PATHS_FILE)) {
      const data = JSON.parse(fs__namespace.readFileSync(SESSION_PATHS_FILE, "utf-8"));
      for (const [id, p] of Object.entries(data)) {
        if (typeof p === "string") sessionPaths.set(id, p);
      }
      log.info(`[session-bridge] Loaded ${sessionPaths.size} persisted session paths`);
    }
  } catch (e) {
    log.warn(`[session-bridge] Failed to load session paths: ${e.message}`);
  }
}
function saveSessionPaths() {
  try {
    const obj = {};
    for (const [id, p] of sessionPaths) obj[id] = p;
    fs__namespace.mkdirSync(path__namespace.dirname(SESSION_PATHS_FILE), { recursive: true });
    fs__namespace.writeFileSync(SESSION_PATHS_FILE, JSON.stringify(obj, null, 2));
  } catch (e) {
    log.warn(`[session-bridge] Failed to save session paths: ${e.message}`);
  }
}
loadSessionPaths();
function getSessionLiveDataPath(sessionId) {
  return sessionPaths.get(sessionId) ?? null;
}
async function forwardToPython(req) {
  const url = `${PYTHON_BACKEND_URL$1}${req.originalUrl}`;
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") {
      headers[key] = value;
    }
  }
  delete headers["host"];
  const fetchOptions = {
    method: req.method,
    headers,
    signal: AbortSignal.timeout(6e4)
  };
  if (["POST", "PUT", "PATCH"].includes(req.method) && req.body) {
    fetchOptions.body = JSON.stringify(req.body);
  }
  const response = await fetch(url, fetchOptions);
  const data = await response.json();
  return { status: response.status, data };
}
async function updatePythonSession(sessionId, updates) {
  const url = `${PYTHON_BACKEND_URL$1}/api/v2/sessions/${sessionId}`;
  await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
    signal: AbortSignal.timeout(1e4)
  });
}
async function handleSessionStart(req, res, sessionId) {
  let pythonResult;
  try {
    pythonResult = await forwardToPython(req);
  } catch (e) {
    log.warn(`[session-bridge] Python backend unavailable for start: ${e.message}`);
    res.status(502).json({
      error: "Python backend unavailable",
      detail: `Cannot reach backend at ${PYTHON_BACKEND_URL$1}`,
      code: "BACKEND_UNAVAILABLE"
    });
    return;
  }
  if (pythonResult.status >= 400) {
    res.status(pythonResult.status).json(pythonResult.data);
    return;
  }
  try {
    const session = pythonResult.data.session ?? pythonResult.data;
    const trackerAssignments = session.tracker_assignments ?? [];
    const assignedTrackerIds = trackerAssignments.map((a) => a.tracker_id);
    const sessionName = session.name || sessionId;
    log.info(`[session-bridge] Starting Express data collection for session ${sessionId} with ${assignedTrackerIds.length} trackers: ${assignedTrackerIds.join(", ") || "all"}`);
    sessionDataCollector.startSession(sessionId, assignedTrackerIds);
    const config = loadConfig();
    const safeName = sessionName.replace(/[^a-zA-Z0-9-_]/g, "_");
    const sessionDirName = `${safeName}_${Date.now()}`;
    const sessionPath = path__namespace.join(config.log_root_folder, "test-sessions", sessionDirName);
    fs__namespace.mkdirSync(sessionPath, { recursive: true });
    log.info(`[session-bridge] Created session directory: ${sessionPath}`);
    sessionPaths.set(sessionId, sessionPath);
    saveSessionPaths();
    try {
      await updatePythonSession(sessionId, { live_data_path: sessionPath });
      log.info(`[session-bridge] Updated Python session live_data_path: ${sessionPath}`);
    } catch (updateErr) {
      log.warn(`[session-bridge] Failed to update live_data_path on Python: ${updateErr.message}`);
    }
    cotActorBridge.setActiveSession(sessionId).catch((err) => {
      log.warn(`[session-bridge] CoT actor bridge activation failed: ${err}`);
    });
  } catch (bridgeError) {
    log.error(`[session-bridge] Express bridge error on start: ${bridgeError.message}`);
  }
  res.status(pythonResult.status).json(pythonResult.data);
}
async function handleSessionStop(req, res, sessionId) {
  let expressExportSummary = null;
  try {
    const livePath = sessionPaths.get(sessionId);
    if (sessionDataCollector.isRecording(sessionId)) {
      sessionDataCollector.stopSession(sessionId);
      if (livePath) {
        const createdFiles = await sessionDataCollector.exportToCSV(sessionId, livePath);
        const summary = sessionDataCollector.getSessionSummary(sessionId);
        expressExportSummary = {
          files_created: createdFiles.map((f) => path__namespace.basename(f)),
          total_positions: summary?.totalPositions || 0,
          trackers_exported: summary?.trackerSummaries.map((t) => t.trackerId) || [],
          output_path: livePath
        };
        log.info(`[session-bridge] Exported session ${sessionId}: ${createdFiles.length} files, ${expressExportSummary.total_positions} positions to ${livePath}`);
      } else {
        log.warn(`[session-bridge] Session ${sessionId} has no live_data_path — cannot export CSV`);
      }
    } else {
      log.warn(`[session-bridge] Session ${sessionId} not recording in sessionDataCollector`);
      if (livePath && sessionDataCollector.getSessionSummary(sessionId)) {
        const createdFiles = await sessionDataCollector.exportToCSV(sessionId, livePath);
        const summary = sessionDataCollector.getSessionSummary(sessionId);
        expressExportSummary = {
          files_created: createdFiles.map((f) => path__namespace.basename(f)),
          total_positions: summary?.totalPositions || 0,
          trackers_exported: summary?.trackerSummaries.map((t) => t.trackerId) || [],
          output_path: livePath
        };
        log.info(`[session-bridge] Late export for session ${sessionId}: ${createdFiles.length} files`);
      }
    }
    cotActorBridge.setActiveSession(null).catch(() => {
    });
  } catch (bridgeError) {
    log.error(`[session-bridge] Express bridge error on stop: ${bridgeError.message}`);
  }
  let pythonResult;
  try {
    pythonResult = await forwardToPython(req);
  } catch (e) {
    log.warn(`[session-bridge] Python backend unavailable for stop: ${e.message}`);
    res.status(502).json({
      error: "Python backend unavailable",
      detail: `Cannot reach backend at ${PYTHON_BACKEND_URL$1}`,
      code: "BACKEND_UNAVAILABLE",
      export_summary: expressExportSummary
    });
    return;
  }
  const responseData = { ...pythonResult.data };
  if (expressExportSummary) {
    responseData.export_summary = expressExportSummary;
  }
  res.status(pythonResult.status).json(responseData);
}
async function handleSessionCreate(req, res) {
  let pythonResult;
  try {
    pythonResult = await forwardToPython(req);
  } catch (e) {
    log.warn(`[session-bridge] Python backend unavailable for create: ${e.message}`);
    res.status(502).json({
      error: "Python backend unavailable",
      detail: `Cannot reach backend at ${PYTHON_BACKEND_URL$1}`,
      code: "BACKEND_UNAVAILABLE"
    });
    return;
  }
  if (pythonResult.status >= 400) {
    res.status(pythonResult.status).json(pythonResult.data);
    return;
  }
  try {
    getDashboardApp().broadcastMessage({
      type: "session_created",
      data: pythonResult.data
    });
  } catch (e) {
    log.warn(`[session-bridge] Failed to broadcast session_created: ${e.message}`);
  }
  res.status(pythonResult.status).json(pythonResult.data);
}
async function handleSessionSubResource(req, res, sessionId, resourceType) {
  let pythonResult;
  try {
    pythonResult = await forwardToPython(req);
  } catch (e) {
    log.warn(`[session-bridge] Python backend unavailable for ${resourceType}: ${e.message}`);
    res.status(502).json({
      error: "Python backend unavailable",
      detail: `Cannot reach backend at ${PYTHON_BACKEND_URL$1}`,
      code: "BACKEND_UNAVAILABLE"
    });
    return;
  }
  if (pythonResult.status < 400) {
    try {
      getDashboardApp().broadcastMessage({
        type: resourceType === "assign-tracker" ? "tracker_assigned" : "cuas_placed",
        data: { session_id: sessionId, ...pythonResult.data }
      });
    } catch {
    }
  }
  res.status(pythonResult.status).json(pythonResult.data);
}
function mapPythonDroneToExpress(py) {
  const { is_active, image_path, ...rest } = py;
  return {
    ...rest,
    icon: rest.icon ?? image_path ?? void 0,
    created_at: rest.created_at ?? (/* @__PURE__ */ new Date()).toISOString(),
    updated_at: rest.updated_at ?? (/* @__PURE__ */ new Date()).toISOString()
  };
}
function mapPythonCUASToExpress(py) {
  const { is_active, image_path, ...rest } = py;
  let frequencyRanges = rest.frequency_ranges;
  if (Array.isArray(frequencyRanges) && frequencyRanges.length > 0 && typeof frequencyRanges[0] === "object") {
    frequencyRanges = frequencyRanges.map((r) => `${r.min_mhz ?? r.min}-${r.max_mhz ?? r.max} MHz`);
  }
  return {
    ...rest,
    frequency_ranges: frequencyRanges,
    icon: rest.icon ?? image_path ?? void 0,
    created_at: rest.created_at ?? (/* @__PURE__ */ new Date()).toISOString(),
    updated_at: rest.updated_at ?? (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function syncProfilesFromPython() {
  const baseUrl = PYTHON_BACKEND_URL$1;
  try {
    const res = await fetch(`${baseUrl}/api/v2/drone-profiles?limit=500`, {
      signal: AbortSignal.timeout(1e4)
    });
    if (res.ok) {
      const data = await res.json();
      const items = data.items ?? data;
      if (Array.isArray(items)) {
        let count = 0;
        for (const pyProfile of items) {
          try {
            const expressProfile = mapPythonDroneToExpress(pyProfile);
            upsertDroneProfile(expressProfile);
            count++;
          } catch (e) {
            log.warn(`[session-bridge] Failed to sync drone profile ${pyProfile.id}: ${e.message}`);
          }
        }
        log.info(`[session-bridge] Synced ${count} drone profiles from Python → Express`);
      }
    } else {
      log.warn(`[session-bridge] Failed to fetch drone profiles from Python: HTTP ${res.status}`);
    }
  } catch (e) {
    log.warn(`[session-bridge] Could not sync drone profiles: ${e.message}`);
  }
  try {
    const res = await fetch(`${baseUrl}/api/v2/cuas-profiles?limit=500`, {
      signal: AbortSignal.timeout(1e4)
    });
    if (res.ok) {
      const data = await res.json();
      const items = data.items ?? data;
      if (Array.isArray(items)) {
        let count = 0;
        for (const pyProfile of items) {
          try {
            const expressProfile = mapPythonCUASToExpress(pyProfile);
            upsertCUASProfile(expressProfile);
            count++;
          } catch (e) {
            log.warn(`[session-bridge] Failed to sync CUAS profile ${pyProfile.id}: ${e.message}`);
          }
        }
        log.info(`[session-bridge] Synced ${count} CUAS profiles from Python → Express`);
      }
    } else {
      log.warn(`[session-bridge] Failed to fetch CUAS profiles from Python: HTTP ${res.status}`);
    }
  } catch (e) {
    log.warn(`[session-bridge] Could not sync CUAS profiles: ${e.message}`);
  }
}
async function handleProfileWrite(req, res, profileType, _profileId) {
  let pythonResult;
  try {
    pythonResult = await forwardToPython(req);
  } catch (e) {
    log.warn(`[session-bridge] Python backend unavailable for ${profileType} profile write: ${e.message}`);
    res.status(502).json({
      error: "Python backend unavailable",
      detail: `Cannot reach backend at ${PYTHON_BACKEND_URL$1}`,
      code: "BACKEND_UNAVAILABLE"
    });
    return;
  }
  if (pythonResult.status >= 400) {
    res.status(pythonResult.status).json(pythonResult.data);
    return;
  }
  try {
    const pyProfile = pythonResult.data;
    if (profileType === "drone") {
      const expressProfile = mapPythonDroneToExpress(pyProfile);
      upsertDroneProfile(expressProfile);
      log.info(`[session-bridge] Mirrored drone profile ${expressProfile.id} to Express store`);
    } else {
      const expressProfile = mapPythonCUASToExpress(pyProfile);
      upsertCUASProfile(expressProfile);
      log.info(`[session-bridge] Mirrored CUAS profile ${expressProfile.id} to Express store`);
    }
  } catch (mirrorErr) {
    log.warn(`[session-bridge] Failed to mirror ${profileType} profile to Express: ${mirrorErr.message}`);
  }
  res.status(pythonResult.status).json(pythonResult.data);
}
async function handleProfileDelete(req, res, profileType, profileId) {
  let pythonResult;
  try {
    pythonResult = await forwardToPython(req);
  } catch (e) {
    log.warn(`[session-bridge] Python backend unavailable for ${profileType} profile delete: ${e.message}`);
    res.status(502).json({
      error: "Python backend unavailable",
      detail: `Cannot reach backend at ${PYTHON_BACKEND_URL$1}`,
      code: "BACKEND_UNAVAILABLE"
    });
    return;
  }
  if (pythonResult.status >= 400) {
    res.status(pythonResult.status).json(pythonResult.data);
    return;
  }
  try {
    if (profileType === "drone") {
      deleteDroneProfile(profileId);
    } else {
      deleteCUASProfile(profileId);
    }
    log.info(`[session-bridge] Deleted ${profileType} profile ${profileId} from Express store`);
  } catch (mirrorErr) {
    log.warn(`[session-bridge] Failed to delete ${profileType} profile from Express: ${mirrorErr.message}`);
  }
  res.status(pythonResult.status).json(pythonResult.data);
}
function sessionBridgeMiddleware() {
  return async (req, res, next) => {
    if (req.method === "POST" && req.path.match(DRONE_PROFILE_COLLECTION_RE)) {
      await handleProfileWrite(req, res, "drone");
      return;
    }
    const droneItemMatch = req.path.match(DRONE_PROFILE_ITEM_RE);
    if (droneItemMatch && req.method === "PUT") {
      await handleProfileWrite(req, res, "drone", droneItemMatch[1]);
      return;
    }
    if (droneItemMatch && req.method === "DELETE") {
      await handleProfileDelete(req, res, "drone", droneItemMatch[1]);
      return;
    }
    if (req.method === "POST" && req.path.match(CUAS_PROFILE_COLLECTION_RE)) {
      await handleProfileWrite(req, res, "cuas");
      return;
    }
    const cuasItemMatch = req.path.match(CUAS_PROFILE_ITEM_RE);
    if (cuasItemMatch && req.method === "PUT") {
      await handleProfileWrite(req, res, "cuas", cuasItemMatch[1]);
      return;
    }
    if (cuasItemMatch && req.method === "DELETE") {
      await handleProfileDelete(req, res, "cuas", cuasItemMatch[1]);
      return;
    }
    if (req.method !== "POST") {
      return next();
    }
    if (req.path.match(SESSION_CREATE_RE)) {
      await handleSessionCreate(req, res);
      return;
    }
    const startMatch = req.path.match(SESSION_START_RE);
    if (startMatch) {
      const sessionId = startMatch[1];
      await handleSessionStart(req, res, sessionId);
      return;
    }
    const stopMatch = req.path.match(SESSION_STOP_RE);
    if (stopMatch) {
      const sessionId = stopMatch[1];
      await handleSessionStop(req, res, sessionId);
      return;
    }
    const assignMatch = req.path.match(SESSION_ASSIGN_TRACKER_RE);
    if (assignMatch) {
      await handleSessionSubResource(req, res, assignMatch[1], "assign-tracker");
      return;
    }
    const placementMatch = req.path.match(SESSION_CUAS_PLACEMENT_RE);
    if (placementMatch) {
      await handleSessionSubResource(req, res, placementMatch[1], "cuas-placement");
      return;
    }
    const geotagMatch = req.path.match(CUAS_GEOTAG_RE);
    if (geotagMatch) {
      try {
        const result = await forwardToPython(req);
        if (result.status < 400) {
          getDashboardApp().broadcastMessage({
            type: "cuas_geotagged",
            data: result.data
          });
        }
        res.status(result.status).json(result.data);
      } catch {
        next();
      }
      return;
    }
    const sdrMatch = req.path.match(SDR_READING_RE);
    if (sdrMatch) {
      try {
        const result = await forwardToPython(req);
        if (result.status < 400) {
          getDashboardApp().broadcastMessage({
            type: "sdr_captured",
            data: { session_id: sdrMatch[1], ...result.data }
          });
        }
        res.status(result.status).json(result.data);
      } catch {
        next();
      }
      return;
    }
    const engagementActionPatterns = [
      { re: ENGAGEMENT_ENGAGE_RE, type: "engagement_started" },
      { re: ENGAGEMENT_DISENGAGE_RE, type: "engagement_completed" },
      { re: ENGAGEMENT_ABORT_RE, type: "engagement_completed" },
      { re: ENGAGEMENT_JAM_ON_RE, type: "burst_opened" },
      { re: ENGAGEMENT_JAM_OFF_RE, type: "burst_closed" }
    ];
    for (const { re, type } of engagementActionPatterns) {
      const match = req.path.match(re);
      if (match) {
        try {
          const result = await forwardToPython(req);
          if (result.status < 400) {
            try {
              getDashboardApp().broadcastMessage({
                type,
                data: { engagement_id: match[1], ...result.data }
              });
            } catch {
            }
          }
          res.status(result.status).json(result.data);
        } catch {
          next();
        }
        return;
      }
    }
    next();
  };
}
function getSessionTelemetry(sessionId, session) {
  let positionsByTracker = sessionDataCollector.getPositionsByTracker(sessionId);
  if (positionsByTracker.size === 0 && session.live_data_path) {
    positionsByTracker = recoverPositionsFromCSV(
      session.live_data_path,
      session.start_time,
      session.end_time
    );
  }
  return positionsByTracker;
}
function buildCUASProfilesMap(session) {
  const profiles = /* @__PURE__ */ new Map();
  for (const placement of session.cuas_placements || []) {
    const profile = getCUASProfileById(placement.cuas_profile_id);
    if (profile) profiles.set(placement.cuas_profile_id, profile);
  }
  return profiles;
}
async function resolveSession(sessionId) {
  const local = getTestSessionById(sessionId);
  if (local) return local;
  try {
    const pyRes = await fetch(`http://127.0.0.1:8083/api/v2/sessions/${sessionId}`, {
      signal: AbortSignal.timeout(5e3)
    });
    if (pyRes.ok) {
      const py = await pyRes.json();
      const liveDataPath = py.live_data_path ?? getSessionLiveDataPath(sessionId);
      return {
        id: py.id,
        name: py.name ?? "",
        status: py.status ?? "completed",
        live_data_path: liveDataPath,
        site_id: py.site_id,
        start_time: py.start_time,
        end_time: py.end_time,
        cuas_placements: py.cuas_placements ?? [],
        tracker_assignments: py.tracker_assignments ?? [],
        engagements: [],
        events: []
      };
    }
  } catch {
  }
  return void 0;
}
function exportRoutes(app) {
  const router = express.Router();
  router.get("/export/csv", (_req, res) => {
    const trackers = app.stateManager.getAllTrackers();
    const header = [
      "tracker_id",
      "time_local_received",
      "time_gps",
      "lat",
      "lon",
      "alt_m",
      "speed_mps",
      "course_deg",
      "hdop",
      "satellites",
      "rssi_dbm",
      "baro_alt_m",
      "baro_temp_c",
      "baro_press_hpa",
      "fix_valid",
      "battery_mv",
      "latency_ms",
      "is_stale",
      "age_seconds"
    ].join(",");
    const rows = trackers.map((t) => [
      t.tracker_id,
      t.time_local_received || "",
      t.time_gps || "",
      t.lat ?? "",
      t.lon ?? "",
      t.alt_m ?? "",
      t.speed_mps ?? "",
      t.course_deg ?? "",
      t.hdop ?? "",
      t.satellites ?? "",
      t.rssi_dbm ?? "",
      t.baro_alt_m ?? "",
      t.baro_temp_c ?? "",
      t.baro_press_hpa ?? "",
      t.fix_valid,
      t.battery_mv ?? "",
      t.latency_ms ?? "",
      t.is_stale,
      t.age_seconds
    ].join(","));
    const csv = [header, ...rows].join("\n");
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "").substring(0, 15);
    const filename = `scensus_export_${app.activeEvent || "data"}_${timestamp}.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  });
  router.get("/export/kml", (req, res) => {
    const event = req.query.event;
    const trackers = app.stateManager.getAllTrackers();
    if (trackers.length === 0) {
      res.status(404).json({ detail: "No tracker data to export" });
      return;
    }
    try {
      const kmlContent = generateKML(trackers, event || app.activeEvent);
      const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "").substring(0, 15);
      const filename = `scensus_export_${event || app.activeEvent || "data"}_${timestamp}.kml`;
      res.setHeader("Content-Type", "application/vnd.google-earth.kml+xml");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(kmlContent);
    } catch (e) {
      res.status(500).json({ detail: "KML export failed" });
    }
  });
  router.get("/export/session/:id/csv", async (req, res) => {
    try {
      const sessionId = req.params.id;
      const session = await resolveSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      const positionsByTracker = getSessionTelemetry(sessionId, session);
      if (positionsByTracker.size === 0) {
        return res.status(404).json({ error: "No telemetry data for session" });
      }
      const header = [
        "timestamp",
        "tracker_id",
        "lat",
        "lon",
        "alt_m",
        "hdop",
        "satellites",
        "fix_valid",
        "rssi_dbm",
        "speed_mps",
        "course_deg",
        "battery_mv",
        "gps_quality"
      ].join(",");
      const rows = [];
      for (const [trackerId, positions] of positionsByTracker) {
        for (const p of positions) {
          rows.push([
            p.timestamp,
            trackerId,
            p.latitude,
            p.longitude,
            p.altitude_m,
            p.hdop ?? "",
            p.satellites ?? "",
            p.fix_valid ?? "",
            p.rssi_dbm ?? "",
            p.speed_ms,
            p.heading_deg,
            p.battery_mv ?? "",
            p.gps_quality
          ].join(","));
        }
      }
      rows.sort();
      const crsComment = "# CRS: EPSG:4326 (WGS 84) | Altitude: meters above ellipsoid | Timestamps: ISO 8601 UTC";
      const csv = [crsComment, header, ...rows].join("\n");
      const safeName = session.name.replace(/[^a-zA-Z0-9-_]/g, "_").substring(0, 30);
      const filename = `${safeName}_telemetry.csv`;
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) {
      res.status(500).json({ error: "CSV export failed" });
    }
  });
  router.get("/export/session/:id/geojson", async (req, res) => {
    try {
      const sessionId = req.params.id;
      const session = await resolveSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      const positionsByTracker = getSessionTelemetry(sessionId, session);
      const cuasProfiles = buildCUASProfilesMap(session);
      const site = session.site_id ? getSiteById(session.site_id) : void 0;
      const featureCollection = generateGeoJSON({
        session,
        positionsByTracker,
        site: site || void 0,
        cuasProfiles
      });
      const safeName = session.name.replace(/[^a-zA-Z0-9-_]/g, "_").substring(0, 30);
      const filename = `${safeName}_session.geojson`;
      res.setHeader("Content-Type", "application/geo+json");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.json(featureCollection);
    } catch (error) {
      res.status(500).json({ error: "GeoJSON export failed" });
    }
  });
  router.get("/export/session/:id/czml", async (req, res) => {
    try {
      const sessionId = req.params.id;
      const session = await resolveSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      const telemetry = getSessionTelemetry(sessionId, session);
      const site = session.site_id ? getSiteById(session.site_id) : void 0;
      const cuasPlacements = session.cuas_placements || [];
      const cuasProfileIds = new Set(cuasPlacements.map((p) => p.cuas_profile_id));
      const cuasProfiles = Array.from(cuasProfileIds).map((id) => getCUASProfileById(id)).filter((p) => p != null);
      const czml = generateCZML({
        session,
        telemetry,
        site,
        cuasPlacements,
        cuasProfiles
      });
      const safeName = session.name.replace(/[^a-zA-Z0-9-_]/g, "_").substring(0, 30);
      const filename = `${safeName}_3d_replay.czml`;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.json(czml);
    } catch (error) {
      console.error("[CZML Export] Failed:", error);
      res.status(500).json({ error: "CZML export failed" });
    }
  });
  router.get("/export/session/:id/geopackage", async (req, res) => {
    try {
      const sqliteCheck = checkSqliteAvailability();
      if (!sqliteCheck.ok) {
        const hint = (sqliteCheck.error || "").includes("NODE_MODULE_VERSION") ? " Run `npx electron-rebuild -o better-sqlite3` to fix." : "";
        return res.status(500).json({
          error: "GeoPackage export unavailable: native SQLite module failed to load." + hint,
          detail: sqliteCheck.error
        });
      }
      const sessionId = req.params.id;
      const session = await resolveSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      const positionsByTracker = getSessionTelemetry(sessionId, session);
      const cuasProfiles = buildCUASProfilesMap(session);
      const site = session.site_id ? getSiteById(session.site_id) : void 0;
      const featureCollection = generateGeoJSON({
        session,
        positionsByTracker,
        site: site || void 0,
        cuasProfiles
      });
      const gpkgBuffer = generateGeoPackage(featureCollection, session.name);
      const safeName = session.name.replace(/[^a-zA-Z0-9-_]/g, "_").substring(0, 30);
      const filename = `${safeName}_session.gpkg`;
      res.setHeader("Content-Type", "application/geopackage+sqlite3");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(gpkgBuffer);
    } catch (error) {
      const msg = error?.stack || error?.message || String(error);
      console.error("[GeoPackage Export] Failed:", msg);
      try {
        require("fs").writeFileSync("/tmp/gpkg_error.txt", msg);
      } catch {
      }
      res.status(500).json({ error: "GeoPackage export failed", detail: error?.message || String(error) });
    }
  });
  router.get("/export/session/:id/leaflet-map", async (req, res) => {
    try {
      const sessionId = req.params.id;
      const session = await resolveSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      const positionsByTracker = getSessionTelemetry(sessionId, session);
      const cuasProfiles = buildCUASProfilesMap(session);
      const site = session.site_id ? getSiteById(session.site_id) : void 0;
      const featureCollection = generateGeoJSON({
        session,
        positionsByTracker,
        site: site || void 0,
        cuasProfiles
      });
      const html = generateLeafletMap(featureCollection, positionsByTracker, session.name);
      const safeName = session.name.replace(/[^a-zA-Z0-9-_]/g, "_").substring(0, 30);
      res.setHeader("Content-Type", "text/html");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}_map.html"`);
      res.send(html);
    } catch (error) {
      console.error("[Leaflet Map Export] Failed:", error);
      res.status(500).json({ error: "Leaflet map export failed" });
    }
  });
  return router;
}
const upload$1 = multer({ storage: multer.memoryStorage() });
function uploadRoutes(app) {
  const router = express.Router();
  router.post("/upload/files", upload$1.array("files"), async (req, res) => {
    const files = req.files;
    if (!files || files.length === 0) {
      res.json({ processed: 0, errors: ["No files uploaded"], trackers_found: [] });
      return;
    }
    const csvParser = new CSVParser();
    const nmeaParser = new NMEAParser();
    const kmlImporter = new KMLImporter();
    const result = { processed: 0, errors: [], trackers_found: [] };
    const trackersSet = /* @__PURE__ */ new Set();
    for (const file of files) {
      const ext = path__namespace.extname(file.originalname).toLowerCase();
      let records = [];
      try {
        const content = file.buffer.toString("utf-8");
        switch (ext) {
          case ".nmea":
            records = nmeaParser.parseNMEAContent(content);
            break;
          case ".csv":
            records = csvParser.parseCSVContent(content);
            break;
          case ".kml":
            records = await kmlImporter.parseKMLContent(content);
            break;
          case ".kmz":
            records = await kmlImporter.parseKMZFile(file.buffer);
            break;
          default:
            result.errors.push(`Unsupported file type: ${file.originalname}`);
            continue;
        }
        for (const record of records) {
          app.stateManager.updateTracker(record);
          trackersSet.add(record.tracker_id);
        }
        result.processed += records.length;
      } catch (e) {
        result.errors.push(`Error processing ${file.originalname}: ${e.message}`);
      }
    }
    result.trackers_found = Array.from(trackersSet);
    if (trackersSet.size > 0) {
      app.broadcastMessage({
        type: "tracker_updated",
        data: { processed: result.processed, trackers_found: result.trackers_found }
      });
    }
    res.json(result);
  });
  return router;
}
function staticRoutes() {
  const router = express.Router();
  const reactDir = getReactDir();
  router.get("/", (_req, res) => {
    res.redirect(302, "/app/");
  });
  router.get("/app", (_req, res) => {
    serveIndex(res, reactDir);
  });
  router.get("/app/", (_req, res) => {
    serveIndex(res, reactDir);
  });
  if (reactDir && fs__namespace.existsSync(reactDir)) {
    router.use("/app", express.static(reactDir));
  }
  router.get("/app/*", (_req, res) => {
    serveIndex(res, reactDir);
  });
  return router;
}
function getReactDir() {
  const asarUnpacked = __dirname.replace("app.asar", "app.asar.unpacked");
  const candidates = [
    path__namespace.join(asarUnpacked, "../renderer"),
    // ASAR unpacked (production)
    path__namespace.join(__dirname, "../renderer"),
    // electron-vite output (dev)
    path__namespace.join(process.cwd(), "out/renderer")
    // CWD-relative
  ];
  for (const candidate of candidates) {
    if (fs__namespace.existsSync(candidate) && fs__namespace.existsSync(path__namespace.join(candidate, "index.html"))) {
      return candidate;
    }
  }
  return candidates[0];
}
function serveIndex(res, reactDir) {
  const indexPath = path__namespace.join(reactDir, "index.html");
  if (fs__namespace.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send(
      "<h1>React Dashboard not built.</h1><p>Run <code>npm run build</code> in the frontend/ directory.</p>"
    );
  }
}
function siteRoutes() {
  const router = express.Router();
  router.get("/sites", (_req, res) => {
    try {
      const sites = getSites();
      res.json(sites);
    } catch (error) {
      console.error("[sites] GET /sites error:", error);
      res.status(500).json({ error: "Failed to fetch sites" });
    }
  });
  router.get("/sites/:id", (req, res) => {
    try {
      const site = getSiteById(req.params.id);
      if (!site) {
        return res.status(404).json({ error: "Site not found" });
      }
      res.json(site);
    } catch (error) {
      console.error("[sites] GET /sites/:id error:", error);
      res.status(500).json({ error: "Failed to fetch site" });
    }
  });
  router.post("/sites", (req, res) => {
    try {
      const siteData = { ...req.body };
      if (!siteData.name) {
        return res.status(400).json({ error: "Missing required field: name" });
      }
      if (!siteData.center) {
        return res.status(400).json({ error: "Missing required field: center" });
      }
      const { lat, lon } = siteData.center;
      if (typeof lat !== "number" || typeof lon !== "number" || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return res.status(400).json({ error: "Invalid center coordinates: lat must be [-90,90], lon must be [-180,180]" });
      }
      if (siteData.boundary_polygon && !Array.isArray(siteData.boundary_polygon)) {
        siteData.boundary_polygon = siteData.boundary_polygon.points ?? [];
      }
      if (!siteData.boundary_polygon) {
        siteData.boundary_polygon = [];
      }
      if (siteData.boundary_polygon && siteData.boundary_polygon.length >= 3 && !siteData.boundary) {
        const coords = siteData.boundary_polygon.map((p) => [p.lon, p.lat]);
        coords.push(coords[0]);
        siteData.boundary = { type: "Polygon", coordinates: [coords] };
      }
      const site = createSite(siteData);
      res.status(201).json(site);
    } catch (error) {
      console.error("[sites] POST /sites error:", error);
      res.status(500).json({ error: "Failed to create site" });
    }
  });
  router.put("/sites/:id", (req, res) => {
    try {
      const updates = req.body;
      if (updates.boundary_polygon && !Array.isArray(updates.boundary_polygon)) {
        updates.boundary_polygon = updates.boundary_polygon.points ?? [];
      }
      if (updates.boundary_polygon && updates.boundary_polygon.length >= 3 && !updates.boundary) {
        const coords = updates.boundary_polygon.map((p) => [p.lon, p.lat]);
        coords.push(coords[0]);
        updates.boundary = { type: "Polygon", coordinates: [coords] };
      }
      const site = updateSite(req.params.id, updates);
      if (!site) {
        return res.status(404).json({ error: "Site not found" });
      }
      res.json(site);
    } catch (error) {
      console.error("[sites] PUT /sites/:id error:", error);
      res.status(500).json({ error: "Failed to update site" });
    }
  });
  router.delete("/sites/:id", (req, res) => {
    try {
      const sessions = getTestSessionsBySite(req.params.id);
      if (sessions.length > 0) {
        return res.status(400).json({
          error: "Cannot delete site with associated test sessions",
          session_count: sessions.length
        });
      }
      const deleted = deleteSite(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Site not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("[sites] DELETE /sites/:id error:", error);
      res.status(500).json({ error: "Failed to delete site" });
    }
  });
  router.post("/sites/:id/duplicate", (req, res) => {
    try {
      const { name } = req.body;
      if (!name) {
        return res.status(400).json({ error: "New name is required" });
      }
      const site = duplicateSite(req.params.id, name);
      if (!site) {
        return res.status(404).json({ error: "Site not found" });
      }
      res.status(201).json(site);
    } catch (error) {
      console.error("[sites] POST /sites/:id/duplicate error:", error);
      res.status(500).json({ error: "Failed to duplicate site" });
    }
  });
  router.get("/sites/:id/sessions", (req, res) => {
    try {
      const site = getSiteById(req.params.id);
      if (!site) {
        return res.status(404).json({ error: "Site not found" });
      }
      const sessions = getTestSessionsBySite(req.params.id);
      res.json(sessions);
    } catch (error) {
      console.error("[sites] GET /sites/:id/sessions error:", error);
      res.status(500).json({ error: "Failed to fetch sessions" });
    }
  });
  return router;
}
function droneProfileRoutes() {
  const router = express.Router();
  router.get("/drone-profiles", (_req, res) => {
    try {
      const profiles = getDroneProfiles();
      res.json(profiles);
    } catch (error) {
      console.error("[drone-profiles] GET /drone-profiles error:", error);
      res.status(500).json({ error: "Failed to fetch drone profiles" });
    }
  });
  router.get("/drone-profiles/:id", (req, res) => {
    try {
      const profile = getDroneProfileById(req.params.id);
      if (!profile) {
        return res.status(404).json({ error: "Drone profile not found" });
      }
      res.json(profile);
    } catch (error) {
      console.error("[drone-profiles] GET /drone-profiles/:id error:", error);
      res.status(500).json({ error: "Failed to fetch drone profile" });
    }
  });
  router.post("/drone-profiles", (req, res) => {
    try {
      const profileData = req.body;
      if (!profileData.name || !profileData.make || !profileData.model) {
        return res.status(400).json({ error: "Missing required fields: name, make, model" });
      }
      if (!profileData.weight_class) {
        return res.status(400).json({ error: "Missing required field: weight_class" });
      }
      if (!profileData.expected_failsafe) {
        return res.status(400).json({ error: "Missing required field: expected_failsafe" });
      }
      const profile = createDroneProfile(profileData);
      res.status(201).json(profile);
    } catch (error) {
      console.error("[drone-profiles] POST /drone-profiles error:", error);
      res.status(500).json({ error: "Failed to create drone profile" });
    }
  });
  router.put("/drone-profiles/:id", (req, res) => {
    try {
      const updates = req.body;
      const profile = updateDroneProfile(req.params.id, updates);
      if (!profile) {
        return res.status(404).json({ error: "Drone profile not found" });
      }
      res.json(profile);
    } catch (error) {
      console.error("[drone-profiles] PUT /drone-profiles/:id error:", error);
      res.status(500).json({ error: "Failed to update drone profile" });
    }
  });
  router.delete("/drone-profiles/:id", (req, res) => {
    try {
      const deleted = deleteDroneProfile(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Drone profile not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("[drone-profiles] DELETE /drone-profiles/:id error:", error);
      res.status(500).json({ error: "Failed to delete drone profile" });
    }
  });
  return router;
}
function cuasProfileRoutes() {
  const router = express.Router();
  router.get("/cuas-profiles", (_req, res) => {
    try {
      const profiles = getCUASProfiles();
      res.json(profiles);
    } catch (error) {
      console.error("[cuas-profiles] GET /cuas-profiles error:", error);
      res.status(500).json({ error: "Failed to fetch CUAS profiles" });
    }
  });
  router.get("/cuas-profiles/:id", (req, res) => {
    try {
      const profile = getCUASProfileById(req.params.id);
      if (!profile) {
        return res.status(404).json({ error: "CUAS profile not found" });
      }
      res.json(profile);
    } catch (error) {
      console.error("[cuas-profiles] GET /cuas-profiles/:id error:", error);
      res.status(500).json({ error: "Failed to fetch CUAS profile" });
    }
  });
  router.post("/cuas-profiles", (req, res) => {
    try {
      const profileData = req.body;
      if (!profileData.name || !profileData.vendor || !profileData.type) {
        return res.status(400).json({ error: "Missing required fields: name, vendor, type" });
      }
      if (typeof profileData.effective_range_m !== "number") {
        return res.status(400).json({ error: "Missing required field: effective_range_m" });
      }
      const validTypes = ["jammer", "rf_sensor", "radar", "eo_ir_camera", "acoustic", "combined"];
      if (!validTypes.includes(profileData.type)) {
        return res.status(400).json({
          error: `Invalid type. Must be one of: ${validTypes.join(", ")}`
        });
      }
      const profile = createCUASProfile(profileData);
      res.status(201).json(profile);
    } catch (error) {
      console.error("[cuas-profiles] POST /cuas-profiles error:", error);
      res.status(500).json({ error: "Failed to create CUAS profile" });
    }
  });
  router.put("/cuas-profiles/:id", (req, res) => {
    try {
      const updates = req.body;
      const profile = updateCUASProfile(req.params.id, updates);
      if (!profile) {
        return res.status(404).json({ error: "CUAS profile not found" });
      }
      res.json(profile);
    } catch (error) {
      console.error("[cuas-profiles] PUT /cuas-profiles/:id error:", error);
      res.status(500).json({ error: "Failed to update CUAS profile" });
    }
  });
  router.delete("/cuas-profiles/:id", (req, res) => {
    try {
      const deleted = deleteCUASProfile(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "CUAS profile not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("[cuas-profiles] DELETE /cuas-profiles/:id error:", error);
      res.status(500).json({ error: "Failed to delete CUAS profile" });
    }
  });
  router.post("/cuas-profiles/:id/update-measured", (req, res) => {
    try {
      const { measured_range_m } = req.body;
      if (typeof measured_range_m !== "number") {
        return res.status(400).json({ error: "measured_range_m must be a number" });
      }
      const profile = updateCUASProfile(req.params.id, { measured_range_m });
      if (!profile) {
        return res.status(404).json({ error: "CUAS profile not found" });
      }
      res.json(profile);
    } catch (error) {
      console.error("[cuas-profiles] POST /cuas-profiles/:id/update-measured error:", error);
      res.status(500).json({ error: "Failed to update measured performance" });
    }
  });
  return router;
}
function haversineDistance$3(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaPhi = (lat2 - lat1) * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
function extractJammingWindows(events2) {
  const windows = [];
  let jamStartTime = null;
  let currentCuasId;
  for (const event of events2) {
    if (event.type === "jam_on") {
      jamStartTime = new Date(event.timestamp).getTime();
      currentCuasId = event.cuas_id;
    } else if (event.type === "jam_off" && jamStartTime !== null) {
      const endTime = new Date(event.timestamp).getTime();
      windows.push({
        start_time_ms: jamStartTime,
        end_time_ms: endTime,
        duration_s: (endTime - jamStartTime) / 1e3,
        cuas_id: currentCuasId
      });
      jamStartTime = null;
      currentCuasId = void 0;
    }
  }
  if (jamStartTime !== null) {
    const lastEvent = events2[events2.length - 1];
    const endTime = new Date(lastEvent.timestamp).getTime();
    windows.push({
      start_time_ms: jamStartTime,
      end_time_ms: endTime,
      duration_s: (endTime - jamStartTime) / 1e3,
      cuas_id: currentCuasId
    });
  }
  return windows;
}
function calculateTimeToEffect(events2, trackData) {
  const jamOnEvent = events2.find((e) => e.type === "jam_on");
  if (!jamOnEvent) return void 0;
  const jamStartTime = new Date(jamOnEvent.timestamp).getTime();
  const firstDegradedPoint = trackData.points.find(
    (p) => p.timestamp_ms >= jamStartTime && (p.quality === "degraded" || p.quality === "lost")
  );
  if (!firstDegradedPoint) return void 0;
  return (firstDegradedPoint.timestamp_ms - jamStartTime) / 1e3;
}
function calculateTimeToFullDenial(events2, trackData) {
  const jamOnEvent = events2.find((e) => e.type === "jam_on");
  if (!jamOnEvent) return void 0;
  const jamStartTime = new Date(jamOnEvent.timestamp).getTime();
  const firstLostPoint = trackData.points.find(
    (p) => p.timestamp_ms >= jamStartTime && p.quality === "lost"
  );
  if (!firstLostPoint) return void 0;
  return (firstLostPoint.timestamp_ms - jamStartTime) / 1e3;
}
function calculateRecoveryTime(events2, trackData) {
  const jamOffEvent = events2.find((e) => e.type === "jam_off");
  if (!jamOffEvent) return void 0;
  const jamEndTime = new Date(jamOffEvent.timestamp).getTime();
  const firstGoodPoint = trackData.points.find(
    (p) => p.timestamp_ms >= jamEndTime && p.quality === "good"
  );
  if (!firstGoodPoint) return void 0;
  return (firstGoodPoint.timestamp_ms - jamEndTime) / 1e3;
}
function calculateMaxLateralDrift(trackData, jammingWindows) {
  let maxDrift = 0;
  for (const window of jammingWindows) {
    const preJamPoints = trackData.points.filter(
      (p) => p.timestamp_ms >= window.start_time_ms - 5e3 && p.timestamp_ms < window.start_time_ms
    );
    if (preJamPoints.length === 0) continue;
    const avgPreJamLat = preJamPoints.reduce((sum, p) => sum + p.lat, 0) / preJamPoints.length;
    const avgPreJamLon = preJamPoints.reduce((sum, p) => sum + p.lon, 0) / preJamPoints.length;
    const jamPoints = trackData.points.filter(
      (p) => p.timestamp_ms >= window.start_time_ms && p.timestamp_ms <= window.end_time_ms
    );
    for (const point of jamPoints) {
      const drift = haversineDistance$3(avgPreJamLat, avgPreJamLon, point.lat, point.lon);
      maxDrift = Math.max(maxDrift, drift);
    }
  }
  return Math.round(maxDrift * 10) / 10;
}
function calculateAltitudeDelta(trackData, jammingWindows) {
  let maxDelta = 0;
  for (const window of jammingWindows) {
    const preJamPoints = trackData.points.filter(
      (p) => p.timestamp_ms >= window.start_time_ms - 5e3 && p.timestamp_ms < window.start_time_ms && p.alt_m !== null
    );
    if (preJamPoints.length === 0) continue;
    const avgPreJamAlt = preJamPoints.reduce((sum, p) => sum + (p.alt_m || 0), 0) / preJamPoints.length;
    const jamPoints = trackData.points.filter(
      (p) => p.timestamp_ms >= window.start_time_ms && p.timestamp_ms <= window.end_time_ms && p.alt_m !== null
    );
    for (const point of jamPoints) {
      const delta = Math.abs((point.alt_m || 0) - avgPreJamAlt);
      maxDelta = Math.max(maxDelta, delta);
    }
  }
  return Math.round(maxDelta * 10) / 10;
}
function detectFailsafe(events2, trackData) {
  const failsafeEvent = events2.find((e) => e.type === "failsafe");
  if (failsafeEvent) {
    return {
      triggered: true,
      type: failsafeEvent.metadata?.failsafe_type || "unknown"
    };
  }
  const recoverEvent = events2.find((e) => e.type === "recover");
  if (recoverEvent) {
    return { triggered: true, type: "rth" };
  }
  return { triggered: false };
}
function calculateEffectiveRange(cuasPosition, events2, trackData) {
  const jamOnEvent = events2.find((e) => e.type === "jam_on");
  if (!jamOnEvent) return void 0;
  const jamStartTime = new Date(jamOnEvent.timestamp).getTime();
  const droneAtJam = trackData.points.find(
    (p) => p.timestamp_ms >= jamStartTime && p.timestamp_ms <= jamStartTime + 1e3
  );
  if (!droneAtJam) return void 0;
  return Math.round(haversineDistance$3(
    cuasPosition.lat,
    cuasPosition.lon,
    droneAtJam.lat,
    droneAtJam.lon
  ));
}
function determinePassFail(expectedFailsafe, actualFailsafe, timeToEffect, maxDrift) {
  if (timeToEffect !== void 0 && timeToEffect < 30) {
    return "pass";
  }
  if (maxDrift && maxDrift > 100) {
    return "partial";
  }
  return "fail";
}
function generateAltitudeProfile(trackData) {
  return trackData.points.filter((p) => p.alt_m !== null).map((p) => ({
    time_ms: p.timestamp_ms,
    alt_m: p.alt_m
  }));
}
function generateDriftProfile(trackData, jammingWindows) {
  const driftProfile = [];
  if (jammingWindows.length === 0) {
    return trackData.points.map((p) => ({ time_ms: p.timestamp_ms, drift_m: 0 }));
  }
  const window = jammingWindows[0];
  const preJamPoints = trackData.points.filter(
    (p) => p.timestamp_ms >= window.start_time_ms - 5e3 && p.timestamp_ms < window.start_time_ms
  );
  if (preJamPoints.length === 0) {
    return trackData.points.map((p) => ({ time_ms: p.timestamp_ms, drift_m: 0 }));
  }
  const refLat = preJamPoints.reduce((sum, p) => sum + p.lat, 0) / preJamPoints.length;
  const refLon = preJamPoints.reduce((sum, p) => sum + p.lon, 0) / preJamPoints.length;
  for (const point of trackData.points) {
    const drift = haversineDistance$3(refLat, refLon, point.lat, point.lon);
    driftProfile.push({
      time_ms: point.timestamp_ms,
      drift_m: Math.round(drift * 10) / 10
    });
  }
  return driftProfile;
}
function analyzeSession(session, trackData, cuasPositions) {
  const results = /* @__PURE__ */ new Map();
  const jammingWindows = extractJammingWindows(session.events);
  const totalJammingTime = jammingWindows.reduce((sum, w) => sum + w.duration_s, 0);
  for (const [trackerId, data] of trackData.entries()) {
    const assignment = session.tracker_assignments.find((a) => a.tracker_id === trackerId);
    const expectedFailsafe = assignment ? void 0 : void 0;
    const timeToEffect = calculateTimeToEffect(session.events, data);
    const timeToFullDenial = calculateTimeToFullDenial(session.events, data);
    const recoveryTime = calculateRecoveryTime(session.events, data);
    const maxLateralDrift = calculateMaxLateralDrift(data, jammingWindows);
    const altitudeDelta = calculateAltitudeDelta(data, jammingWindows);
    const failsafe = detectFailsafe(session.events);
    const firstCuasPlacement = session.cuas_placements[0];
    const effectiveRange = firstCuasPlacement && cuasPositions.has(firstCuasPlacement.cuas_profile_id) ? calculateEffectiveRange(
      cuasPositions.get(firstCuasPlacement.cuas_profile_id),
      session.events,
      data
    ) : void 0;
    const passFail = determinePassFail(expectedFailsafe, failsafe, timeToEffect, maxLateralDrift);
    const metrics = {
      total_flight_time_s: (data.end_time_ms - data.start_time_ms) / 1e3,
      time_under_jamming_s: totalJammingTime,
      time_to_effect_s: timeToEffect,
      time_to_full_denial_s: timeToFullDenial,
      recovery_time_s: recoveryTime,
      effective_range_m: effectiveRange,
      max_altitude_under_jam_m: void 0,
      // Would calculate from track data
      altitude_delta_m: altitudeDelta,
      max_lateral_drift_m: maxLateralDrift,
      connection_loss_duration_s: void 0,
      // Would calculate from gaps
      failsafe_triggered: failsafe.triggered,
      failsafe_type: failsafe.type,
      failsafe_expected: expectedFailsafe,
      pass_fail: passFail
    };
    const gpsQualityChanges = [];
    let lastQuality = data.points[0]?.quality || "unknown";
    for (const point of data.points) {
      if (point.quality !== lastQuality) {
        gpsQualityChanges.push({
          time_ms: point.timestamp_ms,
          quality: point.quality
        });
        lastQuality = point.quality;
      }
    }
    results.set(trackerId, {
      session_id: session.id,
      tracker_id: trackerId,
      metrics,
      jamming_windows: jammingWindows,
      altitude_profile: generateAltitudeProfile(data),
      position_drift: generateDriftProfile(data, jammingWindows),
      gps_quality_changes: gpsQualityChanges
    });
  }
  return results;
}
function aggregateSessionMetrics(trackerResults) {
  const allMetrics = [];
  for (const result of trackerResults.values()) {
    allMetrics.push(result.metrics);
  }
  if (allMetrics.length === 0) {
    return {
      total_flight_time_s: 0,
      time_under_jamming_s: 0,
      failsafe_triggered: false,
      pass_fail: "fail"
    };
  }
  const totalFlightTime = Math.max(...allMetrics.map((m) => m.total_flight_time_s));
  const totalJammingTime = Math.max(...allMetrics.map((m) => m.time_under_jamming_s));
  const timesToEffect = allMetrics.map((m) => m.time_to_effect_s).filter((t) => t !== void 0);
  const timesToFullDenial = allMetrics.map((m) => m.time_to_full_denial_s).filter((t) => t !== void 0);
  const recoveryTimes = allMetrics.map((m) => m.recovery_time_s).filter((t) => t !== void 0);
  const effectiveRanges = allMetrics.map((m) => m.effective_range_m).filter((r) => r !== void 0);
  const lateralDrifts = allMetrics.map((m) => m.max_lateral_drift_m).filter((d) => d !== void 0);
  const altitudeDeltas = allMetrics.map((m) => m.altitude_delta_m).filter((d) => d !== void 0);
  const anyFailsafe = allMetrics.some((m) => m.failsafe_triggered);
  const failsafeTypes = allMetrics.map((m) => m.failsafe_type).filter((t) => t !== void 0);
  const passFails = allMetrics.map((m) => m.pass_fail).filter(Boolean);
  let overallPassFail = "fail";
  if (passFails.includes("pass")) overallPassFail = "pass";
  else if (passFails.includes("partial")) overallPassFail = "partial";
  return {
    total_flight_time_s: totalFlightTime,
    time_under_jamming_s: totalJammingTime,
    time_to_effect_s: timesToEffect.length > 0 ? Math.min(...timesToEffect) : void 0,
    time_to_full_denial_s: timesToFullDenial.length > 0 ? Math.min(...timesToFullDenial) : void 0,
    recovery_time_s: recoveryTimes.length > 0 ? Math.max(...recoveryTimes) : void 0,
    effective_range_m: effectiveRanges.length > 0 ? Math.min(...effectiveRanges) : void 0,
    altitude_delta_m: altitudeDeltas.length > 0 ? Math.max(...altitudeDeltas) : void 0,
    max_lateral_drift_m: lateralDrifts.length > 0 ? Math.max(...lateralDrifts) : void 0,
    failsafe_triggered: anyFailsafe,
    failsafe_type: failsafeTypes[0],
    pass_fail: overallPassFail
  };
}
function positionsToTrackData(trackerId, positions) {
  const sorted = [...positions].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const points = sorted.map((p) => ({
    lat: p.latitude,
    lon: p.longitude,
    alt_m: p.altitude_m,
    baro_alt_m: null,
    timestamp_ms: new Date(p.timestamp).getTime(),
    hdop: p.hdop ?? null,
    satellites: p.satellites ?? null,
    speed_mps: p.speed_ms,
    course_deg: p.heading_deg,
    fix_valid: p.gps_quality !== "poor",
    rssi_dbm: p.rssi_dbm ?? null,
    quality: p.gps_quality === "good" ? "good" : p.gps_quality === "degraded" ? "degraded" : "lost",
    source: "live"
  }));
  return {
    tracker_id: trackerId,
    points,
    start_time_ms: points.length > 0 ? points[0].timestamp_ms : 0,
    end_time_ms: points.length > 0 ? points[points.length - 1].timestamp_ms : 0
  };
}
function autoComputeOnSessionComplete(sessionId) {
  try {
    const session = getTestSessionById(sessionId);
    if (!session) {
      log.warn(`[MetricsEngine] Cannot auto-compute: session ${sessionId} not found`);
      return null;
    }
    const positionsByTracker = sessionDataCollector.getPositionsByTracker(sessionId);
    if (positionsByTracker.size === 0) {
      log.warn(`[MetricsEngine] No track data for session ${sessionId}, skipping auto-compute`);
      return null;
    }
    const trackData = /* @__PURE__ */ new Map();
    for (const [trackerId, positions] of positionsByTracker) {
      if (positions.length === 0) continue;
      trackData.set(trackerId, positionsToTrackData(trackerId, positions));
    }
    const cuasPositions = /* @__PURE__ */ new Map();
    for (const placement of session.cuas_placements || []) {
      if (placement.position) {
        cuasPositions.set(placement.cuas_profile_id, {
          lat: placement.position.lat,
          lon: placement.position.lon
        });
      }
    }
    const trackerResults = analyzeSession(session, trackData, cuasPositions);
    const sessionMetrics = aggregateSessionMetrics(trackerResults);
    updateTestSession(sessionId, {
      metrics: sessionMetrics,
      analysis_completed: true
    });
    log.info(`[MetricsEngine] Auto-computed metrics for session ${sessionId}: pass_fail=${sessionMetrics.pass_fail}`);
    return sessionMetrics;
  } catch (error) {
    log.error(`[MetricsEngine] Auto-compute failed for session ${sessionId}:`, error);
    return null;
  }
}
function haversineDistance$2(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaPhi = (lat2 - lat1) * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
function haversine3DDistance(lat1, lon1, alt1, lat2, lon2, alt2) {
  const horizontalDist = haversineDistance$2(lat1, lon1, lat2, lon2);
  if (alt1 !== null && alt2 !== null) {
    const altDelta = alt2 - alt1;
    return Math.sqrt(horizontalDist * horizontalDist + altDelta * altDelta);
  }
  return horizontalDist;
}
function findDegradationOnsetTime(points, afterTime, hdopThreshold = 2) {
  for (const point of points) {
    if (point.timestamp_ms >= afterTime && point.hdop !== null && point.hdop > hdopThreshold) {
      return point.timestamp_ms;
    }
  }
  return null;
}
function findSustainedRecoveryTime(points, afterTime, sustainedDurationMs = 5e3, hdopThreshold = 2) {
  let goodStartTime = null;
  for (const point of points) {
    if (point.timestamp_ms < afterTime) continue;
    const isGood = point.fix_valid && point.hdop !== null && point.hdop <= hdopThreshold;
    if (isGood) {
      if (goodStartTime === null) {
        goodStartTime = point.timestamp_ms;
      } else if (point.timestamp_ms - goodStartTime >= sustainedDurationMs) {
        return goodStartTime;
      }
    } else {
      goodStartTime = null;
    }
  }
  return null;
}
function findPositionAtTime(points, targetTime, toleranceMs = 5e3) {
  let closest = null;
  let minDiff = Infinity;
  for (const point of points) {
    const diff = Math.abs(point.timestamp_ms - targetTime);
    if (diff < minDiff && diff <= toleranceMs) {
      minDiff = diff;
      closest = point;
    }
  }
  return closest;
}
function calculateTrackerMetrics(trackerId, sessionId, trackData, sessionEvents, cuasPlacements, fixLossEvents) {
  const jammingWindows = extractJammingWindows(sessionEvents);
  const points = trackData?.points ?? [];
  const metrics = {
    tracker_id: trackerId,
    session_id: sessionId,
    time_to_effect_s: null,
    time_to_full_denial_s: null,
    time_to_degradation_s: null,
    recovery_time_s: null,
    rssi_history_before_loss: [],
    effective_range_m: null,
    cuas_position: null,
    drone_position_at_effect: null,
    total_denial_duration_s: 0,
    denial_event_count: 0,
    max_lateral_drift_m: 0,
    altitude_delta_m: 0,
    gps_availability_percent: 0,
    avg_hdop: null,
    avg_satellites: null
  };
  const firstCuas = cuasPlacements.length > 0 ? cuasPlacements[0] : null;
  if (firstCuas) {
    metrics.cuas_position = {
      lat: firstCuas.position.lat,
      lon: firstCuas.position.lon
    };
  }
  if (fixLossEvents.length > 0) {
    metrics.denial_event_count = fixLossEvents.length;
    let totalDenialMs = 0;
    for (const event of fixLossEvents) {
      totalDenialMs += event.duration_ms;
    }
    metrics.total_denial_duration_s = totalDenialMs / 1e3;
    const firstLoss = fixLossEvents[0];
    if (firstLoss.rssi_history_before_loss) {
      metrics.rssi_history_before_loss = firstLoss.rssi_history_before_loss;
    }
  }
  if (jammingWindows.length > 0 && firstCuas && points.length > 0) {
    const jamOnTime = jammingWindows[0].start_time_ms;
    const droneAtJamOn = findPositionAtTime(points, jamOnTime, 2e3);
    if (droneAtJamOn) {
      const cuasAlt = firstCuas.height_agl_m ?? 0;
      metrics.drone_position_at_effect = {
        lat: droneAtJamOn.lat,
        lon: droneAtJamOn.lon,
        alt_m: droneAtJamOn.alt_m
      };
      metrics.effective_range_m = haversine3DDistance(
        firstCuas.position.lat,
        firstCuas.position.lon,
        cuasAlt,
        droneAtJamOn.lat,
        droneAtJamOn.lon,
        droneAtJamOn.alt_m
      );
    }
  }
  if (jammingWindows.length > 0 && points.length > 0) {
    const firstJamStart = jammingWindows[0].start_time_ms;
    const degradationTime = findDegradationOnsetTime(points, firstJamStart, 2);
    if (degradationTime !== null) {
      metrics.time_to_degradation_s = (degradationTime - firstJamStart) / 1e3;
    }
  }
  if (jammingWindows.length > 0 && fixLossEvents.length > 0) {
    const firstJamStart = jammingWindows[0].start_time_ms;
    const firstLossTime = new Date(fixLossEvents[0].lost_at).getTime();
    if (firstLossTime >= firstJamStart) {
      if (metrics.time_to_degradation_s !== null) {
        metrics.time_to_effect_s = metrics.time_to_degradation_s;
      } else {
        metrics.time_to_effect_s = (firstLossTime - firstJamStart) / 1e3;
      }
      metrics.time_to_full_denial_s = (firstLossTime - firstJamStart) / 1e3;
    }
  }
  if (jammingWindows.length > 0 && points.length > 0) {
    const lastJamEnd = jammingWindows[jammingWindows.length - 1].end_time_ms;
    const sustainedRecoveryTime = findSustainedRecoveryTime(points, lastJamEnd, 5e3, 2);
    if (sustainedRecoveryTime !== null) {
      metrics.recovery_time_s = (sustainedRecoveryTime - lastJamEnd) / 1e3;
    } else {
      for (const event of fixLossEvents) {
        if (event.recovered_at) {
          const recoveryTime = new Date(event.recovered_at).getTime();
          if (recoveryTime >= lastJamEnd) {
            metrics.recovery_time_s = (recoveryTime - lastJamEnd) / 1e3;
            break;
          }
        }
      }
    }
  }
  if (jammingWindows.length > 0 && points.length > 0) {
    const firstJam = jammingWindows[0];
    const refPoint = findPositionAtTime(points, firstJam.start_time_ms);
    if (refPoint) {
      let maxDrift = 0;
      let minAlt = refPoint.alt_m ?? 0;
      let maxAlt = refPoint.alt_m ?? 0;
      for (const point of points) {
        if (point.timestamp_ms >= firstJam.start_time_ms && point.timestamp_ms <= firstJam.end_time_ms) {
          const drift = haversineDistance$2(
            refPoint.lat,
            refPoint.lon,
            point.lat,
            point.lon
          );
          if (drift > maxDrift) {
            maxDrift = drift;
          }
          if (point.alt_m !== null) {
            if (point.alt_m < minAlt) minAlt = point.alt_m;
            if (point.alt_m > maxAlt) maxAlt = point.alt_m;
          }
        }
      }
      metrics.max_lateral_drift_m = maxDrift;
      metrics.altitude_delta_m = maxAlt - minAlt;
    }
  }
  if (points.length > 0) {
    let hdopSum = 0;
    let hdopCount = 0;
    let satSum = 0;
    let satCount = 0;
    let validCount = 0;
    for (const point of points) {
      if (point.hdop !== null && point.hdop !== void 0) {
        hdopSum += point.hdop;
        hdopCount++;
      }
      if (point.satellites !== null && point.satellites !== void 0) {
        satSum += point.satellites;
        satCount++;
      }
      if (point.quality !== "lost") {
        validCount++;
      }
    }
    if (hdopCount > 0) {
      metrics.avg_hdop = hdopSum / hdopCount;
    }
    if (satCount > 0) {
      metrics.avg_satellites = satSum / satCount;
    }
    if (points.length > 0) {
      metrics.gps_availability_percent = validCount / points.length * 100;
    }
  }
  return metrics;
}
function testSessionRoutes() {
  const router = express.Router();
  router.get("/test-sessions", (req, res) => {
    try {
      let sessions = getTestSessions();
      const status = req.query.status;
      if (status) {
        sessions = sessions.filter((s) => s.status === status);
      }
      const siteId = req.query.site_id;
      if (siteId) {
        sessions = sessions.filter((s) => s.site_id === siteId);
      }
      sessions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch test sessions" });
    }
  });
  router.get("/test-sessions/:id", (req, res) => {
    try {
      const session = getTestSessionById(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Test session not found" });
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch test session" });
    }
  });
  router.post("/test-sessions", (req, res) => {
    try {
      const sessionData = req.body;
      if (!sessionData.name) {
        return res.status(400).json({ error: "Missing required field: name" });
      }
      if (sessionData.site_id) {
        const site = getSiteById(sessionData.site_id);
        if (!site) {
          return res.status(400).json({ error: "Site not found" });
        }
      }
      const session = createTestSession({
        ...sessionData,
        status: sessionData.status || "planning",
        tracker_assignments: sessionData.tracker_assignments || [],
        cuas_placements: sessionData.cuas_placements || [],
        asset_placements: sessionData.asset_placements || [],
        events: sessionData.events || [],
        sd_card_merged: false,
        analysis_completed: false
      });
      res.status(201).json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to create test session" });
    }
  });
  router.put("/test-sessions/:id", (req, res) => {
    try {
      const updates = req.body;
      const session = updateTestSession(req.params.id, updates);
      if (!session) {
        return res.status(404).json({ error: "Test session not found" });
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to update test session" });
    }
  });
  router.patch("/test-sessions/:id/tracker-assignment/:trackerId", (req, res) => {
    try {
      const session = getTestSessionById(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Test session not found" });
      }
      const { trackerId } = req.params;
      const { model_3d_override } = req.body;
      const assignments = session.tracker_assignments?.map(
        (a) => a.tracker_id === trackerId ? { ...a, model_3d_override } : a
      );
      if (!assignments?.some((a) => a.tracker_id === trackerId)) {
        return res.status(404).json({ error: "Tracker assignment not found" });
      }
      const updated = updateTestSession(req.params.id, { tracker_assignments: assignments });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update tracker assignment" });
    }
  });
  router.patch("/test-sessions/:id/cuas-placement/:placementId", (req, res) => {
    try {
      const session = getTestSessionById(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Test session not found" });
      }
      const { placementId } = req.params;
      const { model_3d_override } = req.body;
      const placements = session.cuas_placements?.map(
        (p) => p.id === placementId ? { ...p, model_3d_override } : p
      );
      if (!placements?.some((p) => p.id === placementId)) {
        return res.status(404).json({ error: "CUAS placement not found" });
      }
      const updated = updateTestSession(req.params.id, { cuas_placements: placements });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update CUAS placement" });
    }
  });
  router.delete("/test-sessions/:id", (req, res) => {
    try {
      const deleted = deleteTestSession(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Test session not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete test session" });
    }
  });
  router.post("/test-sessions/:id/start", (req, res) => {
    try {
      const session = getTestSessionById(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Test session not found" });
      }
      if (session.status !== "planning") {
        return res.status(400).json({ error: "Session must be in planning status to start" });
      }
      const assignedTrackerIds = session.tracker_assignments?.map((a) => a.tracker_id) ?? [];
      log.info(`Starting session ${session.id} with ${assignedTrackerIds.length} assigned trackers: ${assignedTrackerIds.join(", ") || "none (recording all)"}`);
      sessionDataCollector.startSession(session.id, assignedTrackerIds);
      const config = loadConfig();
      const safeName = session.name.replace(/[^a-zA-Z0-9-_]/g, "_");
      const sessionDirName = `${safeName}_${Date.now()}`;
      const sessionPath = path__namespace.join(config.log_root_folder, "test-sessions", sessionDirName);
      fs__namespace.mkdirSync(sessionPath, { recursive: true });
      log.info(`Created session directory: ${sessionPath}`);
      const updated = updateTestSession(req.params.id, {
        status: "active",
        start_time: (/* @__PURE__ */ new Date()).toISOString(),
        live_data_path: sessionPath
      });
      res.json(updated);
    } catch (error) {
      log.error("Failed to start session:", error);
      res.status(500).json({ error: "Failed to start session" });
    }
  });
  router.post("/test-sessions/:id/stop", async (req, res) => {
    try {
      const session = getTestSessionById(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Test session not found" });
      }
      if (session.status !== "active") {
        return res.status(400).json({ error: "Session must be active to stop" });
      }
      sessionDataCollector.stopSession(session.id);
      let fetchedEngagements = [];
      const fetchEngagementsFromPython = async () => {
        const abortCtrl = new AbortController();
        const fetchTimeout = setTimeout(() => abortCtrl.abort(), 15e3);
        try {
          const engRes = await fetch(`http://127.0.0.1:8083/api/v2/sessions/${session.id}/engagements`, {
            signal: abortCtrl.signal
          });
          if (!engRes.ok) throw new Error(`HTTP ${engRes.status}`);
          const engWrapper = await engRes.json();
          const engJson = engWrapper.engagements || engWrapper || [];
          return Array.isArray(engJson) ? engJson : [];
        } finally {
          clearTimeout(fetchTimeout);
        }
      };
      try {
        fetchedEngagements = await fetchEngagementsFromPython();
      } catch (firstError) {
        log.warn(`[CSV Export] First engagement fetch failed: ${firstError.message} — retrying in 1s...`);
        try {
          await new Promise((r) => setTimeout(r, 1e3));
          fetchedEngagements = await fetchEngagementsFromPython();
        } catch (retryError) {
          log.warn(`[CSV Export] Retry also failed: ${retryError.message}`);
        }
      }
      if (fetchedEngagements.length > 0) {
        const engagements = fetchedEngagements.map((e) => ({
          id: e.id,
          cuas_placement_id: e.cuas_placement_id || void 0,
          cuas_name: e.cuas_name || e.name || void 0,
          target_tracker_ids: (e.targets || []).map((t) => t.tracker_id),
          engage_timestamp: e.engage_timestamp || void 0,
          disengage_timestamp: e.disengage_timestamp || void 0,
          jam_on_at: e.jam_on_at || void 0,
          jam_off_at: e.jam_off_at || void 0,
          jam_duration_s: e.jam_duration_s ?? void 0,
          time_to_effect_s: e.time_to_effect_s ?? void 0,
          pass_fail: e.metrics?.pass_fail || void 0
        }));
        sessionDataCollector.setSessionEngagements(session.id, engagements);
        log.info(`[CSV Export] Fetched ${engagements.length} engagements for session ${session.id}`);
        updateTestSession(session.id, { engagements: fetchedEngagements });
        log.info(`[Engagements] Persisted ${fetchedEngagements.length} engagements to JSON store for session ${session.id}`);
      } else {
        log.warn(`[CSV Export] No engagements fetched from Python backend`);
      }
      let exportSummary = {
        files_created: [],
        total_positions: 0,
        trackers_exported: []
      };
      if (session.live_data_path) {
        try {
          const createdFiles = await sessionDataCollector.exportToCSV(session.id, session.live_data_path);
          const summary = sessionDataCollector.getSessionSummary(session.id);
          exportSummary = {
            files_created: createdFiles.map((f) => path__namespace.basename(f)),
            total_positions: summary?.totalPositions || 0,
            trackers_exported: summary?.trackerSummaries.map((t) => t.trackerId) || []
          };
          log.info(`Session ${session.id} exported: ${createdFiles.length} files, ${exportSummary.total_positions} positions`);
        } catch (exportError) {
          log.error("Error exporting session data:", exportError);
        }
      }
      const endTime = Date.now();
      const startTime = session.start_time ? new Date(session.start_time).getTime() : null;
      const duration_seconds = startTime ? Math.floor((endTime - startTime) / 1e3) : 0;
      const updated = updateTestSession(req.params.id, {
        status: "completed",
        end_time: new Date(endTime).toISOString(),
        duration_seconds
      });
      let computedMetrics = null;
      try {
        const config = loadConfig();
        if (config.auto_compute_metrics !== false) {
          log.info(`[AutoMetrics] Auto-computing metrics for session ${req.params.id}`);
          computedMetrics = autoComputeOnSessionComplete(req.params.id);
        }
      } catch (metricsError) {
        log.error("Error auto-computing metrics:", metricsError);
      }
      res.json({
        ...updated,
        export_summary: exportSummary,
        metrics: computedMetrics
      });
    } catch (error) {
      log.error("Failed to stop session:", error);
      res.status(500).json({ error: "Failed to stop session" });
    }
  });
  router.post("/test-sessions/:id/analyze", (req, res) => {
    try {
      const session = getTestSessionById(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Test session not found" });
      }
      if (session.status !== "completed" && session.status !== "capturing" && session.status !== "analyzing") {
        return res.status(400).json({ error: "Session must be completed, capturing, or analyzing status" });
      }
      updateTestSession(req.params.id, {
        status: "analyzing"
      });
      const computedMetrics = autoComputeOnSessionComplete(req.params.id);
      const updated = updateTestSession(req.params.id, {
        status: computedMetrics ? "completed" : "analyzing",
        analysis_completed: computedMetrics !== null,
        metrics: computedMetrics ?? void 0
      });
      res.json({
        ...updated,
        metrics: computedMetrics
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to start analysis" });
    }
  });
  router.get("/test-sessions/:id/analysis", (req, res) => {
    try {
      const session = getTestSessionById(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Test session not found" });
      }
      const positionsByTracker = sessionDataCollector.getPositionsByTracker(req.params.id);
      const sessionSummary = sessionDataCollector.getSessionSummary(req.params.id);
      const trackData = /* @__PURE__ */ new Map();
      for (const [trackerId, positions] of positionsByTracker) {
        if (positions.length === 0) continue;
        const sortedPositions = [...positions].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        const enhancedPoints = sortedPositions.map((p) => ({
          lat: p.latitude,
          lon: p.longitude,
          alt_m: p.altitude_m,
          baro_alt_m: null,
          timestamp_ms: new Date(p.timestamp).getTime(),
          hdop: null,
          satellites: null,
          speed_mps: p.speed_ms,
          course_deg: p.heading_deg,
          fix_valid: p.gps_quality !== "poor",
          rssi_dbm: p.rssi_dbm ?? null,
          quality: p.gps_quality === "good" ? "good" : p.gps_quality === "degraded" ? "degraded" : "lost",
          source: p.source === "mock" ? "live" : p.source
        }));
        trackData.set(trackerId, {
          tracker_id: trackerId,
          points: enhancedPoints,
          start_time_ms: new Date(sortedPositions[0].timestamp).getTime(),
          end_time_ms: new Date(sortedPositions[sortedPositions.length - 1].timestamp).getTime()
        });
      }
      const cuasPositions = /* @__PURE__ */ new Map();
      for (const placement of session.cuas_placements || []) {
        if (placement.position) {
          cuasPositions.set(placement.cuas_profile_id, {
            lat: placement.position.lat,
            lon: placement.position.lon
          });
        }
      }
      let analysisResults;
      if (trackData.size > 0) {
        analysisResults = analyzeSession(session, trackData, cuasPositions);
      }
      const jammingWindows = extractJammingWindows(session.events);
      const response = {
        session_id: session.id,
        session_name: session.name,
        status: session.status,
        tracker_count: trackData.size,
        total_points: sessionSummary?.totalPositions || 0,
        duration_seconds: sessionSummary?.duration_seconds || 0,
        jamming_windows: jammingWindows,
        total_jamming_time_s: jammingWindows.reduce((sum, w) => sum + w.duration_s, 0),
        events: session.events,
        trackers: []
      };
      if (analysisResults) {
        for (const [trackerId, result] of analysisResults) {
          response.trackers.push({
            tracker_id: trackerId,
            point_count: trackData.get(trackerId)?.points.length || 0,
            metrics: result.metrics,
            altitude_profile: result.altitude_profile,
            position_drift: result.position_drift,
            gps_quality_changes: result.gps_quality_changes
          });
        }
      }
      if (response.trackers.length === 0) {
        log.info(`No track data available for session ${req.params.id} analysis`);
      }
      res.json(response);
    } catch (error) {
      log.error("Analysis error:", error);
      res.status(500).json({ error: "Failed to get analysis results" });
    }
  });
  router.get("/test-sessions/:id/tracker-metrics", (req, res) => {
    try {
      const session = getTestSessionById(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Test session not found" });
      }
      const filterTrackerId = req.query.tracker_id;
      const positionsByTracker = sessionDataCollector.getPositionsByTracker(req.params.id);
      let gpsHealthTracker = null;
      try {
        gpsHealthTracker = getDashboardApp().stateManager.getGPSHealthTracker();
      } catch (e) {
        log.warn("Could not get GPS health tracker:", e);
      }
      const trackDataMap = /* @__PURE__ */ new Map();
      const fixLossEventsMap = /* @__PURE__ */ new Map();
      for (const [trackerId, positions] of positionsByTracker) {
        if (filterTrackerId && trackerId !== filterTrackerId) continue;
        if (positions.length === 0) continue;
        const sortedPositions = [...positions].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        const enhancedPoints = sortedPositions.map((p) => ({
          lat: p.latitude,
          lon: p.longitude,
          alt_m: p.altitude_m,
          baro_alt_m: null,
          timestamp_ms: new Date(p.timestamp).getTime(),
          hdop: null,
          satellites: null,
          speed_mps: p.speed_ms,
          course_deg: p.heading_deg,
          fix_valid: p.gps_quality !== "poor",
          rssi_dbm: p.rssi_dbm ?? null,
          quality: p.gps_quality === "good" ? "good" : p.gps_quality === "degraded" ? "degraded" : "lost",
          source: "live"
        }));
        trackDataMap.set(trackerId, {
          tracker_id: trackerId,
          points: enhancedPoints,
          start_time_ms: new Date(sortedPositions[0].timestamp).getTime(),
          end_time_ms: new Date(sortedPositions[sortedPositions.length - 1].timestamp).getTime()
        });
        if (gpsHealthTracker) {
          const fixLossEvents = gpsHealthTracker.getFixLossEvents(trackerId);
          fixLossEventsMap.set(trackerId, fixLossEvents);
        }
      }
      const trackerMetrics = [];
      for (const [trackerId, trackData] of trackDataMap) {
        const fixLossEvents = fixLossEventsMap.get(trackerId) ?? [];
        const metrics = calculateTrackerMetrics(
          trackerId,
          session.id,
          trackData,
          session.events,
          session.cuas_placements || [],
          fixLossEvents
        );
        trackerMetrics.push(metrics);
      }
      res.json({
        session_id: session.id,
        tracker_metrics: trackerMetrics
      });
    } catch (error) {
      log.error("Tracker metrics error:", error);
      res.status(500).json({ error: "Failed to get tracker metrics" });
    }
  });
  router.get("/test-sessions/:id/events", (req, res) => {
    try {
      const session = getTestSessionById(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Test session not found" });
      }
      const type = req.query.type;
      let events2 = session.events;
      if (type) {
        events2 = events2.filter((e) => e.type === type);
      }
      events2.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      res.json(events2);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });
  router.post("/test-sessions/:id/events", (req, res) => {
    try {
      const eventData = req.body;
      if (!eventData.type || !eventData.timestamp || !eventData.source) {
        return res.status(400).json({ error: "Missing required fields: type, timestamp, source" });
      }
      const session = addEventToSession(req.params.id, eventData);
      if (!session) {
        return res.status(404).json({ error: "Test session not found" });
      }
      const newEvent = session.events[session.events.length - 1];
      res.status(201).json(newEvent);
    } catch (error) {
      res.status(500).json({ error: "Failed to add event" });
    }
  });
  router.delete("/test-sessions/:id/events/:eventId", (req, res) => {
    try {
      const session = removeEventFromSession(req.params.id, req.params.eventId);
      if (!session) {
        return res.status(404).json({ error: "Test session or event not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove event" });
    }
  });
  router.post("/test-sessions/:id/assign-tracker", (req, res) => {
    try {
      const { tracker_id, drone_profile_id, session_color, target_altitude_m, flight_plan } = req.body;
      if (!tracker_id || !drone_profile_id) {
        return res.status(400).json({ error: "Missing required fields: tracker_id, drone_profile_id" });
      }
      const session = getTestSessionById(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Test session not found" });
      }
      const existingAssignment = session.tracker_assignments.find((a) => a.tracker_id === tracker_id);
      if (existingAssignment) {
        return res.status(400).json({ error: "Tracker already assigned in this session" });
      }
      const assignment = {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        tracker_id,
        drone_profile_id,
        session_color: session_color || generateColor(session.tracker_assignments.length),
        target_altitude_m,
        flight_plan,
        assigned_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      const updated = updateTestSession(req.params.id, {
        tracker_assignments: [...session.tracker_assignments, assignment]
      });
      res.status(201).json(assignment);
    } catch (error) {
      res.status(500).json({ error: "Failed to assign tracker" });
    }
  });
  router.delete("/test-sessions/:id/assign-tracker/:assignmentId", (req, res) => {
    try {
      const session = getTestSessionById(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Test session not found" });
      }
      const updated = updateTestSession(req.params.id, {
        tracker_assignments: session.tracker_assignments.filter((a) => a.id !== req.params.assignmentId)
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove tracker assignment" });
    }
  });
  router.post("/test-sessions/:id/cuas-placement", (req, res) => {
    try {
      const { cuas_profile_id, position, height_agl_m, orientation_deg, elevation_deg, notes } = req.body;
      if (!cuas_profile_id || !position || typeof height_agl_m !== "number" || typeof orientation_deg !== "number") {
        return res.status(400).json({
          error: "Missing required fields: cuas_profile_id, position, height_agl_m, orientation_deg"
        });
      }
      const session = getTestSessionById(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Test session not found" });
      }
      const placement = {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        cuas_profile_id,
        position,
        height_agl_m,
        orientation_deg,
        elevation_deg,
        active: true,
        notes
      };
      const updated = updateTestSession(req.params.id, {
        cuas_placements: [...session.cuas_placements, placement]
      });
      res.status(201).json(placement);
    } catch (error) {
      res.status(500).json({ error: "Failed to add CUAS placement" });
    }
  });
  router.put("/test-sessions/:id/cuas-placement/:placementId", (req, res) => {
    try {
      const session = getTestSessionById(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Test session not found" });
      }
      const placementIndex = session.cuas_placements.findIndex((p) => p.id === req.params.placementId);
      if (placementIndex === -1) {
        return res.status(404).json({ error: "CUAS placement not found" });
      }
      const updatedPlacements = [...session.cuas_placements];
      updatedPlacements[placementIndex] = {
        ...updatedPlacements[placementIndex],
        ...req.body,
        id: req.params.placementId
        // Prevent ID change
      };
      const updated = updateTestSession(req.params.id, {
        cuas_placements: updatedPlacements
      });
      res.json(updatedPlacements[placementIndex]);
    } catch (error) {
      res.status(500).json({ error: "Failed to update CUAS placement" });
    }
  });
  router.delete("/test-sessions/:id/cuas-placement/:placementId", (req, res) => {
    try {
      const session = getTestSessionById(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Test session not found" });
      }
      const updated = updateTestSession(req.params.id, {
        cuas_placements: session.cuas_placements.filter((p) => p.id !== req.params.placementId)
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove CUAS placement" });
    }
  });
  router.get("/test-sessions/:id/raw-telemetry", async (req, res) => {
    try {
      const sessionId = req.params.id;
      let session = getTestSessionById(sessionId);
      let pythonEngagements = null;
      if (!session) {
        try {
          const pyRes = await fetch(`http://127.0.0.1:8083/api/v2/sessions/${sessionId}`, {
            signal: AbortSignal.timeout(5e3)
          });
          if (pyRes.ok) {
            const pySession = await pyRes.json();
            const liveDataPath = pySession.live_data_path ?? getSessionLiveDataPath(sessionId);
            session = {
              id: pySession.id,
              name: pySession.name ?? "",
              status: pySession.status ?? "completed",
              live_data_path: liveDataPath,
              engagements: [],
              events: []
            };
            try {
              const engRes = await fetch(`http://127.0.0.1:8083/api/v2/sessions/${sessionId}/engagements`, {
                signal: AbortSignal.timeout(5e3)
              });
              if (engRes.ok) {
                const engData = await engRes.json();
                pythonEngagements = Array.isArray(engData) ? engData : engData?.engagements ?? [];
              }
            } catch {
            }
          }
        } catch (e) {
          log.warn(`[raw-telemetry] Python backend unavailable: ${e.message}`);
        }
      }
      if (!session) {
        return res.status(404).json({ error: "Test session not found" });
      }
      const positionsByTracker = sessionDataCollector.getPositionsByTracker(sessionId);
      const allPositions = [];
      for (const [trackerId, positions] of positionsByTracker) {
        for (const p of positions) {
          const tsMs = new Date(p.timestamp).getTime();
          allPositions.push({
            id: `${trackerId}_${tsMs}`,
            tracker_id: trackerId,
            timestamp: p.timestamp,
            timestamp_ms: tsMs,
            time_gps: null,
            lat: p.latitude,
            lon: p.longitude,
            alt_m: p.altitude_m,
            speed_mps: p.speed_ms,
            course_deg: p.heading_deg,
            hdop: p.hdop ?? null,
            satellites: p.satellites ?? null,
            rssi_dbm: p.rssi_dbm ?? null,
            baro_alt_m: null,
            baro_temp_c: null,
            baro_press_hpa: null,
            fix_valid: p.fix_valid ?? p.gps_quality !== "poor",
            battery_mv: p.battery_mv ?? null,
            latency_ms: null,
            gps_quality: p.gps_quality
          });
        }
      }
      if (allPositions.length === 0 && session.live_data_path && fs__namespace.existsSync(session.live_data_path)) {
        const csvFiles = fs__namespace.readdirSync(session.live_data_path).filter((f) => f.startsWith("tracker_") && f.endsWith(".csv"));
        for (const csvFile of csvFiles) {
          const csvPath = path__namespace.join(session.live_data_path, csvFile);
          const content = fs__namespace.readFileSync(csvPath, "utf-8");
          const lines = content.trim().split("\n");
          if (lines.length < 2) continue;
          const headers = lines[0].split(",");
          for (let i = 1; i < lines.length; i++) {
            try {
              const vals = lines[i].split(",");
              const row = {};
              headers.forEach((h, idx) => {
                row[h] = vals[idx] || "";
              });
              const timestamp = row.time_local_received || "";
              const tsMs = timestamp ? new Date(timestamp).getTime() : 0;
              const trackerId = row.tracker_id || "";
              allPositions.push({
                id: `${trackerId}_${tsMs}`,
                tracker_id: trackerId,
                timestamp,
                timestamp_ms: tsMs,
                time_gps: row.time_gps || null,
                lat: row.lat ? parseFloat(row.lat) : null,
                lon: row.lon ? parseFloat(row.lon) : null,
                alt_m: row.alt_m ? parseFloat(row.alt_m) : null,
                speed_mps: row.speed_mps ? parseFloat(row.speed_mps) : null,
                course_deg: row.course_deg ? parseFloat(row.course_deg) : null,
                hdop: row.hdop ? parseFloat(row.hdop) : null,
                satellites: row.satellites ? parseInt(row.satellites, 10) : null,
                rssi_dbm: row.rssi_dbm ? parseFloat(row.rssi_dbm) : null,
                baro_alt_m: row.baro_alt_m ? parseFloat(row.baro_alt_m) : null,
                baro_temp_c: row.baro_temp_c ? parseFloat(row.baro_temp_c) : null,
                baro_press_hpa: row.baro_press_hpa ? parseFloat(row.baro_press_hpa) : null,
                fix_valid: row.fix_valid === "true",
                battery_mv: row.battery_mv ? parseInt(row.battery_mv, 10) : null,
                latency_ms: row.latency_ms ? parseInt(row.latency_ms, 10) : null,
                gps_quality: null
              });
            } catch (rowErr) {
              console.warn(`Skipping malformed CSV row ${i} in ${csvFile}:`, rowErr);
            }
          }
        }
      }
      const filteredPositions = filterPositionsBySessionTime(
        allPositions,
        session.start_time,
        session.end_time
      );
      filteredPositions.sort((a, b) => a.timestamp_ms - b.timestamp_ms);
      res.json({
        session_id: sessionId,
        session_name: session.name,
        total_count: filteredPositions.length,
        positions: filteredPositions,
        engagements: pythonEngagements ?? session.engagements ?? [],
        events: session.events ?? []
      });
    } catch (error) {
      log.error("Failed to get raw telemetry:", error);
      res.status(500).json({ error: "Failed to get raw telemetry" });
    }
  });
  return router;
}
function generateColor(index) {
  const colors = [
    "#ff6b00",
    // Orange (primary)
    "#00c8b4",
    // Cyan
    "#6366f1",
    // Indigo
    "#a855f7",
    // Purple
    "#22c55e",
    // Green
    "#f59e0b",
    // Amber
    "#ef4444",
    // Red
    "#3b82f6"
    // Blue
  ];
  return colors[index % colors.length];
}
function parseSDCardFile(filePath, trackerId) {
  try {
    if (!fs__namespace.existsSync(filePath)) {
      log.error(`SD card file not found: ${filePath}`);
      return null;
    }
    const content = fs__namespace.readFileSync(filePath, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim());
    if (lines.length < 2) {
      log.warn(`SD card file has no data: ${filePath}`);
      return null;
    }
    const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
    const colIndex = {
      timestamp: findColumn(header, ["timestamp", "time", "ts", "time_ms"]),
      lat: findColumn(header, ["lat", "latitude"]),
      lon: findColumn(header, ["lon", "lng", "longitude"]),
      alt: findColumn(header, ["alt", "altitude", "gps_alt"]),
      baro_alt: findColumn(header, ["baro_alt", "baro", "pressure_alt"]),
      hdop: findColumn(header, ["hdop", "dop"]),
      satellites: findColumn(header, ["satellites", "sats", "sat_count", "numsat"]),
      speed: findColumn(header, ["speed", "speed_mps", "velocity"]),
      course: findColumn(header, ["course", "heading", "bearing", "track"]),
      fix: findColumn(header, ["fix", "fix_valid", "gps_fix", "fix_type"])
    };
    if (colIndex.lat === -1 || colIndex.lon === -1) {
      log.error(`SD card file missing required lat/lon columns: ${filePath}`);
      return null;
    }
    const points = [];
    let validPoints = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map((c) => c.trim());
      if (cols.length < 3) continue;
      const lat = parseFloat(cols[colIndex.lat]);
      const lon = parseFloat(cols[colIndex.lon]);
      if (isNaN(lat) || isNaN(lon) || lat === 0 || lon === 0) continue;
      const point = {
        lat,
        lon,
        alt_m: colIndex.alt !== -1 ? parseFloatOrNull(cols[colIndex.alt]) : null,
        baro_alt_m: colIndex.baro_alt !== -1 ? parseFloatOrNull(cols[colIndex.baro_alt]) : null,
        timestamp_ms: colIndex.timestamp !== -1 ? parseTimestamp(cols[colIndex.timestamp]) : Date.now(),
        hdop: colIndex.hdop !== -1 ? parseFloatOrNull(cols[colIndex.hdop]) : null,
        satellites: colIndex.satellites !== -1 ? parseIntOrNull(cols[colIndex.satellites]) : null,
        speed_mps: colIndex.speed !== -1 ? parseFloatOrNull(cols[colIndex.speed]) : null,
        course_deg: colIndex.course !== -1 ? parseFloatOrNull(cols[colIndex.course]) : null,
        fix_valid: colIndex.fix !== -1 ? parseBoolOrTrue(cols[colIndex.fix]) : true
      };
      if (point.fix_valid) validPoints++;
      points.push(point);
    }
    if (points.length === 0) {
      log.warn(`No valid points found in SD card file: ${filePath}`);
      return null;
    }
    points.sort((a, b) => a.timestamp_ms - b.timestamp_ms);
    const startTime = points[0].timestamp_ms;
    const endTime = points[points.length - 1].timestamp_ms;
    const durationS = (endTime - startTime) / 1e3;
    const sampleRateHz = durationS > 0 ? points.length / durationS : 0;
    return {
      tracker_id: trackerId,
      filename: path__namespace.basename(filePath),
      start_time_ms: startTime,
      end_time_ms: endTime,
      points,
      metadata: {
        total_points: points.length,
        valid_points: validPoints,
        duration_s: durationS,
        sample_rate_hz: sampleRateHz
      }
    };
  } catch (error) {
    log.error(`Error parsing SD card file: ${filePath}`, error);
    return null;
  }
}
function determineGPSQuality(hdop, satellites) {
  if (hdop !== null) {
    if (hdop <= 2) return "good";
    if (hdop <= 5) return "good";
    if (hdop <= 20) return "degraded";
    return "lost";
  }
  if (satellites !== null) {
    if (satellites >= 6) return "good";
    if (satellites >= 4) return "degraded";
    return "lost";
  }
  return "good";
}
function mergeTrackData(livePoints, sdCardData, trackerId) {
  const allPoints = [];
  for (const p of livePoints) {
    allPoints.push({
      ...p,
      baro_alt_m: p.baro_alt_m ?? null,
      hdop: p.hdop ?? null,
      satellites: p.satellites ?? null,
      speed_mps: p.speed_mps ?? null,
      course_deg: p.course_deg ?? null,
      rssi_dbm: null,
      source: "live",
      quality: determineGPSQuality(p.hdop ?? null, p.satellites ?? null)
    });
  }
  if (sdCardData) {
    for (const p of sdCardData.points) {
      const existingIdx = allPoints.findIndex(
        (lp) => Math.abs(lp.timestamp_ms - p.timestamp_ms) < 100
        // Within 100ms
      );
      if (existingIdx === -1) {
        allPoints.push({
          ...p,
          baro_alt_m: p.baro_alt_m ?? null,
          hdop: p.hdop ?? null,
          satellites: p.satellites ?? null,
          speed_mps: p.speed_mps ?? null,
          course_deg: p.course_deg ?? null,
          rssi_dbm: null,
          source: "sd_card",
          quality: determineGPSQuality(p.hdop ?? null, p.satellites ?? null)
        });
      } else {
        const existing = allPoints[existingIdx];
        if (existing.quality === "lost" && p.fix_valid) {
          allPoints[existingIdx] = {
            ...existing,
            lat: p.lat,
            lon: p.lon,
            alt_m: p.alt_m ?? existing.alt_m,
            baro_alt_m: p.baro_alt_m ?? existing.baro_alt_m,
            hdop: p.hdop ?? existing.hdop,
            satellites: p.satellites ?? existing.satellites,
            quality: determineGPSQuality(p.hdop ?? null, p.satellites ?? null)
          };
        }
      }
    }
  }
  allPoints.sort((a, b) => a.timestamp_ms - b.timestamp_ms);
  const segments = [];
  const gaps = [];
  let currentSegment = [];
  let currentQuality = "good";
  const GAP_THRESHOLD_MS = 5e3;
  for (let i = 0; i < allPoints.length; i++) {
    const point = allPoints[i];
    const prevPoint = i > 0 ? allPoints[i - 1] : null;
    if (prevPoint && point.timestamp_ms - prevPoint.timestamp_ms > GAP_THRESHOLD_MS) {
      if (currentSegment.length > 0) {
        segments.push({
          tracker_id: trackerId,
          points: currentSegment,
          quality: currentQuality,
          start_time_ms: currentSegment[0].timestamp_ms,
          end_time_ms: currentSegment[currentSegment.length - 1].timestamp_ms
        });
      }
      gaps.push({
        start_ms: prevPoint.timestamp_ms,
        end_ms: point.timestamp_ms,
        duration_s: (point.timestamp_ms - prevPoint.timestamp_ms) / 1e3
      });
      currentSegment = [];
    }
    const pointQuality = point.source === "sd_card" && livePoints.length === 0 ? "sd_only" : point.quality;
    if (currentSegment.length === 0 || pointQuality !== currentQuality) {
      if (currentSegment.length > 0) {
        segments.push({
          tracker_id: trackerId,
          points: currentSegment,
          quality: currentQuality,
          start_time_ms: currentSegment[0].timestamp_ms,
          end_time_ms: currentSegment[currentSegment.length - 1].timestamp_ms
        });
        currentSegment = [];
      }
      currentQuality = pointQuality;
    }
    currentSegment.push(point);
  }
  if (currentSegment.length > 0) {
    segments.push({
      tracker_id: trackerId,
      points: currentSegment,
      quality: currentQuality,
      start_time_ms: currentSegment[0].timestamp_ms,
      end_time_ms: currentSegment[currentSegment.length - 1].timestamp_ms
    });
  }
  const liveCount = allPoints.filter((p) => p.source === "live").length;
  const sdCount = allPoints.filter((p) => p.source === "sd_card").length;
  const interpolatedCount = allPoints.filter((p) => p.source === "interpolated").length;
  const totalDuration = allPoints.length > 0 ? allPoints[allPoints.length - 1].timestamp_ms - allPoints[0].timestamp_ms : 0;
  const gapDuration = gaps.reduce((sum, g) => sum + g.duration_s * 1e3, 0);
  const coveragePercent = totalDuration > 0 ? (totalDuration - gapDuration) / totalDuration * 100 : 100;
  return {
    tracker_id: trackerId,
    segments,
    total_points: allPoints.length,
    live_points: liveCount,
    sd_points: sdCount,
    interpolated_points: interpolatedCount,
    gaps,
    coverage_percent: Math.round(coveragePercent * 10) / 10
  };
}
function findColumn(header, candidates) {
  for (const c of candidates) {
    const idx = header.indexOf(c);
    if (idx !== -1) return idx;
  }
  return -1;
}
function parseFloatOrNull(val) {
  const num = parseFloat(val);
  return isNaN(num) ? null : num;
}
function parseIntOrNull(val) {
  const num = parseInt(val, 10);
  return isNaN(num) ? null : num;
}
function parseTimestamp(val) {
  const num = parseInt(val, 10);
  if (!isNaN(num)) {
    return num < 1e12 ? num * 1e3 : num;
  }
  const date = new Date(val);
  return date.getTime() || Date.now();
}
function parseBoolOrTrue(val) {
  const lower = val.toLowerCase();
  return lower !== "0" && lower !== "false" && lower !== "no";
}
function getSDCardTrackSeparate(sdCardData, timeOffset = 0) {
  return sdCardData.points.map((p) => ({
    lat: p.lat,
    lon: p.lon,
    alt_m: p.alt_m,
    baro_alt_m: p.baro_alt_m ?? null,
    timestamp_ms: p.timestamp_ms + timeOffset,
    hdop: p.hdop ?? null,
    satellites: p.satellites ?? null,
    fix_valid: p.fix_valid,
    speed_mps: p.speed_mps ?? null,
    course_deg: p.course_deg ?? null,
    rssi_dbm: null,
    source: "sd_card",
    quality: determineGPSQuality(p.hdop ?? null, p.satellites ?? null)
  }));
}
function detectConnectionGaps(livePoints, sdCardData, gapThresholdMs = 5e3) {
  if (livePoints.length === 0 || !sdCardData || sdCardData.points.length === 0) {
    return [];
  }
  const gaps = [];
  const sortedLive = [...livePoints].sort((a, b) => a.timestamp_ms - b.timestamp_ms);
  for (let i = 0; i < sortedLive.length - 1; i++) {
    const currentEnd = sortedLive[i].timestamp_ms;
    const nextStart = sortedLive[i + 1].timestamp_ms;
    const gapDuration = nextStart - currentEnd;
    if (gapDuration > gapThresholdMs) {
      const sdPointsInGap = sdCardData.points.filter(
        (p) => p.timestamp_ms > currentEnd && p.timestamp_ms < nextStart
      );
      if (sdPointsInGap.length > 0) {
        gaps.push({
          start_ms: currentEnd,
          end_ms: nextStart,
          duration_s: Math.round(gapDuration / 100) / 10
        });
      }
    }
  }
  return gaps;
}
const getUploadDir = () => {
  const userDataPath = electron.app?.getPath?.("userData") || process.env.HOME || ".";
  const uploadDir = path__namespace.join(userDataPath, "sd-uploads");
  if (!fs__namespace.existsSync(uploadDir)) {
    fs__namespace.mkdirSync(uploadDir, { recursive: true });
  }
  return uploadDir;
};
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, getUploadDir());
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.random().toString(36).substring(7);
    cb(null, `sd-${uniqueSuffix}${path__namespace.extname(file.originalname)}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  // 100MB max
  fileFilter: (_req, file, cb) => {
    const ext = path__namespace.extname(file.originalname).toLowerCase();
    if ([".csv", ".log", ".txt", ".bin"].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV, LOG, TXT, and BIN files are allowed"));
    }
  }
});
const parsedSDCardCache = /* @__PURE__ */ new Map();
function sdMergeRoutes() {
  const router = express.Router();
  router.post("/sd-merge/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      const trackerId = req.body.tracker_id || "unknown";
      const sessionId = req.body.session_id;
      log.info(`Parsing SD card file: ${req.file.filename} for tracker ${trackerId}`);
      const parsed = parseSDCardFile(req.file.path, trackerId);
      if (!parsed) {
        fs__namespace.unlinkSync(req.file.path);
        return res.status(400).json({ error: "Failed to parse SD card file" });
      }
      const cacheKey = `${sessionId || "default"}-${trackerId}`;
      parsedSDCardCache.set(cacheKey, parsed);
      if (sessionId) {
        const session = getTestSessionById(sessionId);
        if (session) {
          const sdPaths = session.sd_card_paths || [];
          if (!sdPaths.includes(req.file.path)) {
            sdPaths.push(req.file.path);
          }
          updateTestSession(sessionId, {
            sd_card_paths: sdPaths,
            sd_card_merged: false
          });
        }
      }
      res.json({
        success: true,
        filename: parsed.filename,
        tracker_id: parsed.tracker_id,
        start_time: new Date(parsed.start_time_ms).toISOString(),
        end_time: new Date(parsed.end_time_ms).toISOString(),
        metadata: parsed.metadata
      });
    } catch (error) {
      log.error("SD card upload error:", error);
      res.status(500).json({ error: error.message || "Failed to upload SD card file" });
    }
  });
  router.post("/sd-merge/merge", async (req, res) => {
    try {
      const { session_id, tracker_id, live_points } = req.body;
      if (!tracker_id) {
        return res.status(400).json({ error: "tracker_id is required" });
      }
      const cacheKey = `${session_id || "default"}-${tracker_id}`;
      const sdCardData = parsedSDCardCache.get(cacheKey) || null;
      let livePointsData = live_points || [];
      if (livePointsData.length === 0 && session_id) {
        const positionsByTracker = sessionDataCollector.getPositionsByTracker(session_id);
        const trackerPositions = positionsByTracker.get(tracker_id) || [];
        livePointsData = trackerPositions;
        log.info(`Retrieved ${livePointsData.length} live points from session collector for tracker ${tracker_id}`);
      }
      const liveData = livePointsData.map((p) => ({
        lat: p.lat ?? p.latitude,
        lon: p.lon ?? p.longitude,
        alt_m: p.alt_m ?? p.altitude_m ?? p.alt ?? null,
        baro_alt_m: p.baro_alt_m ?? null,
        timestamp_ms: p.timestamp_ms ?? (p.timestamp ? new Date(p.timestamp).getTime() : Date.now()),
        hdop: p.hdop ?? null,
        satellites: p.satellites ?? null,
        speed_mps: p.speed_mps ?? p.speed_ms ?? null,
        course_deg: p.course_deg ?? p.heading_deg ?? null,
        fix_valid: p.fix_valid ?? true
      }));
      const merged = mergeTrackData(liveData, sdCardData, tracker_id);
      if (session_id) {
        const session = getTestSessionById(session_id);
        if (session && (sdCardData || liveData.length > 0)) {
          updateTestSession(session_id, {
            sd_card_merged: true
          });
        }
      }
      res.json({
        success: true,
        merged,
        live_points_count: liveData.length,
        sd_points_count: sdCardData?.points?.length || 0
      });
    } catch (error) {
      log.error("SD card merge error:", error);
      res.status(500).json({ error: error.message || "Failed to merge track data" });
    }
  });
  router.post("/sd-merge/preview", async (req, res) => {
    try {
      const { session_id, tracker_id, time_offset } = req.body;
      if (!tracker_id) {
        return res.status(400).json({ error: "tracker_id is required" });
      }
      const cacheKey = `${session_id || "default"}-${tracker_id}`;
      const sdCardData = parsedSDCardCache.get(cacheKey);
      if (!sdCardData) {
        return res.status(404).json({
          error: "No SD card data found for this tracker. Please upload an SD card file first."
        });
      }
      const timeOffset = parseInt(time_offset) || 0;
      const sdCardTrack = getSDCardTrackSeparate(sdCardData, timeOffset);
      let livePoints = [];
      if (session_id) {
        const positionsByTracker = sessionDataCollector.getPositionsByTracker(session_id);
        const trackerPositions = positionsByTracker.get(tracker_id) || [];
        livePoints = trackerPositions.map((p) => ({
          lat: p.lat ?? p.latitude,
          lon: p.lon ?? p.longitude,
          alt_m: p.alt_m ?? p.altitude_m ?? null,
          baro_alt_m: p.baro_alt_m ?? null,
          timestamp_ms: p.timestamp_ms ?? (p.timestamp ? new Date(p.timestamp).getTime() : Date.now()),
          hdop: p.hdop ?? null,
          satellites: p.satellites ?? null,
          speed_mps: p.speed_mps ?? p.speed_ms ?? null,
          course_deg: p.course_deg ?? p.heading_deg ?? null,
          fix_valid: p.fix_valid ?? true
        }));
      }
      const connectionGaps = detectConnectionGaps(livePoints, sdCardData);
      log.info(`SD card preview for ${tracker_id}: ${sdCardTrack.length} points, ${connectionGaps.length} gaps detected`);
      res.json({
        success: true,
        tracker_id,
        sd_card_track: sdCardTrack,
        time_range: {
          start_ms: sdCardData.start_time_ms + timeOffset,
          end_ms: sdCardData.end_time_ms + timeOffset,
          start: new Date(sdCardData.start_time_ms + timeOffset).toISOString(),
          end: new Date(sdCardData.end_time_ms + timeOffset).toISOString()
        },
        connection_gaps: connectionGaps,
        live_points_count: livePoints.length,
        sd_points_count: sdCardTrack.length,
        time_offset_applied: timeOffset
      });
    } catch (error) {
      log.error("SD card preview error:", error);
      res.status(500).json({ error: error.message || "Failed to preview SD card track" });
    }
  });
  router.get("/sd-merge/live-data/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const trackerId = req.query.tracker_id;
      const positionsByTracker = sessionDataCollector.getPositionsByTracker(sessionId);
      const summary = sessionDataCollector.getSessionSummary(sessionId);
      if (trackerId) {
        const positions = positionsByTracker.get(trackerId) || [];
        res.json({
          session_id: sessionId,
          tracker_id: trackerId,
          positions,
          point_count: positions.length
        });
      } else {
        const trackers = [];
        for (const [id, positions] of positionsByTracker) {
          trackers.push({ tracker_id: id, point_count: positions.length });
        }
        res.json({
          session_id: sessionId,
          trackers,
          total_points: summary?.totalPositions || 0,
          summary
        });
      }
    } catch (error) {
      log.error("Get live data error:", error);
      res.status(500).json({ error: error.message || "Failed to get live data" });
    }
  });
  router.get("/sd-merge/status/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const session = getTestSessionById(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      const sdFiles = [];
      for (const [key, data] of parsedSDCardCache.entries()) {
        if (key.startsWith(sessionId)) {
          sdFiles.push({
            tracker_id: data.tracker_id,
            filename: data.filename,
            points: data.points.length
          });
        }
      }
      res.json({
        session_id: sessionId,
        sd_card_paths: session.sd_card_paths || [],
        sd_card_merged: session.sd_card_merged,
        parsed_files: sdFiles
      });
    } catch (error) {
      log.error("SD card status error:", error);
      res.status(500).json({ error: error.message || "Failed to get SD card status" });
    }
  });
  router.delete("/sd-merge/cache/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      let cleared = 0;
      for (const key of parsedSDCardCache.keys()) {
        if (key.startsWith(sessionId)) {
          parsedSDCardCache.delete(key);
          cleared++;
        }
      }
      res.json({ success: true, cleared });
    } catch (error) {
      log.error("SD card cache clear error:", error);
      res.status(500).json({ error: error.message || "Failed to clear cache" });
    }
  });
  return router;
}
const DEFAULT_OPTIONS = {
  includeEvents: true,
  includeMetrics: true,
  includeMap: true,
  includeCharts: true
};
function formatDuration(seconds) {
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) {
    return `${minutes}m ${secs.toFixed(0)}s`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}
function formatTimestamp(ts) {
  try {
    const date = new Date(ts);
    return date.toLocaleString();
  } catch {
    return ts;
  }
}
function getEventTypeName(type) {
  const names = {
    jam_on: "JAM ON",
    jam_off: "JAM OFF",
    launch: "LAUNCH",
    recover: "RECOVER",
    failsafe: "FAILSAFE",
    note: "NOTE",
    gps_lost: "GPS LOST",
    gps_acquired: "GPS ACQUIRED",
    altitude_anomaly: "ALTITUDE ANOMALY",
    position_jump: "POSITION JUMP",
    geofence_breach: "GEOFENCE BREACH",
    link_lost: "LINK LOST",
    link_restored: "LINK RESTORED",
    custom: "CUSTOM"
  };
  return names[type] || type.toUpperCase();
}
function getPassFailColor(result) {
  switch (result) {
    case "pass":
      return "#22c55e";
    case "fail":
      return "#ef4444";
    case "partial":
      return "#eab308";
    default:
      return "#6b7280";
  }
}
function generateHTMLReport(data, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { session, site, droneProfiles, cuasProfiles, mapImageBase64, chartImageBase64 } = data;
  const classification = opts.classification || session.classification || "";
  const passFailColor = getPassFailColor(session.metrics?.pass_fail);
  let html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Report: ${escapeHtml(session.name)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
      line-height: 1.5;
      color: #1f2937;
      background: #fff;
      padding: 40px;
    }
    .report-header {
      text-align: center;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 2px solid #1f2937;
    }
    .classification {
      font-size: 14px;
      font-weight: bold;
      color: #dc2626;
      text-transform: uppercase;
      letter-spacing: 2px;
      margin-bottom: 10px;
    }
    .report-title {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 5px;
    }
    .report-subtitle {
      font-size: 14px;
      color: #6b7280;
    }
    .section {
      margin-bottom: 25px;
    }
    .section-title {
      font-size: 14px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #374151;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 5px;
      margin-bottom: 12px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
    }
    .info-item {
      display: flex;
      flex-direction: column;
    }
    .info-label {
      font-size: 10px;
      text-transform: uppercase;
      color: #6b7280;
      letter-spacing: 0.5px;
    }
    .info-value {
      font-size: 13px;
      font-weight: 500;
    }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 15px;
    }
    .metric-card {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 12px;
      text-align: center;
    }
    .metric-value {
      font-size: 20px;
      font-weight: 700;
      color: #1f2937;
    }
    .metric-label {
      font-size: 10px;
      text-transform: uppercase;
      color: #6b7280;
      margin-top: 2px;
    }
    .pass-fail-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 4px;
      font-weight: 600;
      text-transform: uppercase;
      color: white;
    }
    .event-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }
    .event-table th,
    .event-table td {
      border: 1px solid #e5e7eb;
      padding: 8px;
      text-align: left;
    }
    .event-table th {
      background: #f3f4f6;
      font-weight: 600;
      text-transform: uppercase;
      font-size: 10px;
    }
    .event-type {
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 10px;
    }
    .event-type.jam_on, .event-type.jam_off { background: #fef2f2; color: #dc2626; }
    .event-type.launch { background: #f0fdf4; color: #16a34a; }
    .event-type.recover { background: #eff6ff; color: #2563eb; }
    .event-type.failsafe { background: #fefce8; color: #ca8a04; }
    .event-type.gps_lost, .event-type.link_lost { background: #fef2f2; color: #991b1b; }
    .event-type.gps_acquired, .event-type.link_restored { background: #f0fdf4; color: #166534; }
    .map-image {
      width: 100%;
      max-height: 400px;
      object-fit: contain;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
    }
    .chart-image {
      width: 100%;
      max-height: 300px;
      object-fit: contain;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      margin-top: 15px;
    }
    .equipment-list {
      list-style: none;
    }
    .equipment-item {
      padding: 8px 0;
      border-bottom: 1px solid #e5e7eb;
    }
    .equipment-item:last-child { border-bottom: none; }
    .equipment-name { font-weight: 500; }
    .equipment-detail { font-size: 11px; color: #6b7280; }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      color: #6b7280;
      font-size: 10px;
    }
    @media print {
      body { padding: 20px; }
      .section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="report-header">
    ${classification ? `<div class="classification">${escapeHtml(classification)}</div>` : ""}
    <h1 class="report-title">CUAS Test Report</h1>
    <div class="report-subtitle">${escapeHtml(session.name)}</div>
  </div>

  <div class="section">
    <h2 class="section-title">Session Information</h2>
    <div class="info-grid">
      <div class="info-item">
        <span class="info-label">Session ID</span>
        <span class="info-value">${escapeHtml(session.id)}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Site</span>
        <span class="info-value">${escapeHtml(site?.name || "Unknown")}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Start Time</span>
        <span class="info-value">${session.start_time ? formatTimestamp(session.start_time) : "N/A"}</span>
      </div>
      <div class="info-item">
        <span class="info-label">End Time</span>
        <span class="info-value">${session.end_time ? formatTimestamp(session.end_time) : "N/A"}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Operator</span>
        <span class="info-value">${escapeHtml(session.operator_name || "N/A")}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Status</span>
        <span class="info-value">${escapeHtml(session.status.toUpperCase())}</span>
      </div>
    </div>
    ${session.weather_notes ? `
      <div style="margin-top: 12px;">
        <span class="info-label">Weather Notes</span>
        <p style="margin-top: 4px;">${escapeHtml(session.weather_notes)}</p>
      </div>
    ` : ""}
  </div>
`;
  if (opts.includeMetrics && session.metrics) {
    const m = session.metrics;
    html += `
  <div class="section">
    <h2 class="section-title">Test Results</h2>
    ${m.pass_fail ? `
      <div style="margin-bottom: 15px;">
        <span class="pass-fail-badge" style="background: ${passFailColor}">
          ${m.pass_fail.toUpperCase()}
        </span>
      </div>
    ` : ""}
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-value">${formatDuration(m.total_flight_time_s)}</div>
        <div class="metric-label">Total Flight Time</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${formatDuration(m.time_under_jamming_s)}</div>
        <div class="metric-label">Time Under Jamming</div>
      </div>
      ${m.time_to_effect_s !== void 0 ? `
        <div class="metric-card">
          <div class="metric-value">${formatDuration(m.time_to_effect_s)}</div>
          <div class="metric-label">Time to Effect</div>
        </div>
      ` : ""}
      ${m.effective_range_m !== void 0 ? `
        <div class="metric-card">
          <div class="metric-value">${m.effective_range_m.toFixed(0)}m</div>
          <div class="metric-label">Effective Range</div>
        </div>
      ` : ""}
      ${m.max_altitude_under_jam_m !== void 0 ? `
        <div class="metric-card">
          <div class="metric-value">${m.max_altitude_under_jam_m.toFixed(1)}m</div>
          <div class="metric-label">Max Altitude Under Jam</div>
        </div>
      ` : ""}
      ${m.max_lateral_drift_m !== void 0 ? `
        <div class="metric-card">
          <div class="metric-value">${m.max_lateral_drift_m.toFixed(1)}m</div>
          <div class="metric-label">Max Lateral Drift</div>
        </div>
      ` : ""}
    </div>
    ${m.failsafe_triggered ? `
      <div style="margin-top: 15px;">
        <strong>Failsafe:</strong> ${escapeHtml(m.failsafe_type || "Triggered")}
        ${m.failsafe_expected ? ` (Expected: ${escapeHtml(m.failsafe_expected)})` : ""}
      </div>
    ` : ""}
  </div>
`;
  }
  html += `
  <div class="section">
    <h2 class="section-title">Equipment</h2>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
      <div>
        <h3 style="font-size: 12px; margin-bottom: 8px;">Drones (${session.tracker_assignments.length})</h3>
        <ul class="equipment-list">
          ${session.tracker_assignments.map((a) => {
    const profile = droneProfiles.get(a.drone_profile_id);
    const displayName = getTrackerDisplayName(a.tracker_id);
    const showTrackerId = displayName !== a.tracker_id;
    return `
              <li class="equipment-item">
                <div class="equipment-name">${escapeHtml(displayName)}</div>
                <div class="equipment-detail">
                  ${showTrackerId ? `#${escapeHtml(a.tracker_id)} • ` : ""}${profile ? `${escapeHtml(profile.make)} ${escapeHtml(profile.model)}` : "Unknown Profile"}
                  ${a.target_altitude_m ? ` • Target: ${a.target_altitude_m}m` : ""}
                </div>
              </li>
            `;
  }).join("")}
        </ul>
      </div>
      <div>
        <h3 style="font-size: 12px; margin-bottom: 8px;">CUAS Systems (${session.cuas_placements.length})</h3>
        <ul class="equipment-list">
          ${session.cuas_placements.map((p) => {
    const profile = cuasProfiles.get(p.cuas_profile_id);
    return `
              <li class="equipment-item">
                <div class="equipment-name">${escapeHtml(profile?.name || "Unknown")}</div>
                <div class="equipment-detail">
                  ${profile ? `${escapeHtml(profile.vendor)} • ${escapeHtml(profile.type)}` : ""}
                  • Range: ${profile?.effective_range_m || 0}m • Orient: ${p.orientation_deg}°
                </div>
              </li>
            `;
  }).join("")}
        </ul>
      </div>
    </div>
  </div>
`;
  if (opts.includeMap && mapImageBase64) {
    html += `
  <div class="section">
    <h2 class="section-title">Flight Track</h2>
    <img src="${mapImageBase64}" alt="Flight Track Map" class="map-image" />
  </div>
`;
  }
  if (opts.includeCharts && chartImageBase64) {
    html += `
  <div class="section">
    <h2 class="section-title">Analysis Charts</h2>
    <img src="${chartImageBase64}" alt="Analysis Charts" class="chart-image" />
  </div>
`;
  }
  if (opts.includeEvents && session.events.length > 0) {
    html += `
  <div class="section">
    <h2 class="section-title">Event Log (${session.events.length} events)</h2>
    <table class="event-table">
      <thead>
        <tr>
          <th style="width: 140px;">Time</th>
          <th style="width: 120px;">Type</th>
          <th style="width: 80px;">Source</th>
          <th>Details</th>
        </tr>
      </thead>
      <tbody>
        ${session.events.map((e) => {
      const trackerDisplay = e.tracker_id ? getTrackerDisplayName(e.tracker_id) : null;
      const showTrackerId = trackerDisplay && trackerDisplay !== e.tracker_id;
      return `
          <tr>
            <td>${formatTimestamp(e.timestamp)}</td>
            <td><span class="event-type ${e.type}">${getEventTypeName(e.type)}</span></td>
            <td>${escapeHtml(e.source)}</td>
            <td>
              ${trackerDisplay ? `Tracker: ${escapeHtml(trackerDisplay)}${showTrackerId ? ` (#${escapeHtml(e.tracker_id)})` : ""}` : ""}
              ${e.cuas_id ? `CUAS: ${escapeHtml(e.cuas_id)}` : ""}
              ${e.note ? `<br/>${escapeHtml(e.note)}` : ""}
            </td>
          </tr>
        `;
    }).join("")}
      </tbody>
    </table>
  </div>
`;
  }
  if (session.post_test_notes) {
    html += `
  <div class="section">
    <h2 class="section-title">Post-Test Notes</h2>
    <p>${escapeHtml(session.post_test_notes)}</p>
  </div>
`;
  }
  html += `
  <div class="footer">
    <p>Generated by SCENSUS Dashboard on ${(/* @__PURE__ */ new Date()).toLocaleString()}</p>
    ${classification ? `<p class="classification">${escapeHtml(classification)}</p>` : ""}
  </div>
</body>
</html>
`;
  return html;
}
function generateTextReport(data, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { session, site, droneProfiles, cuasProfiles } = data;
  const classification = opts.classification || session.classification || "";
  const divider = "═".repeat(60);
  const subDivider = "─".repeat(40);
  let text = "";
  if (classification) {
    text += `${classification.toUpperCase()}

`;
  }
  text += `${divider}
`;
  text += `CUAS TEST REPORT
`;
  text += `${session.name}
`;
  text += `${divider}

`;
  text += `SESSION INFORMATION
${subDivider}
`;
  text += `Session ID:     ${session.id}
`;
  text += `Site:           ${site?.name || "Unknown"}
`;
  text += `Start Time:     ${session.start_time ? formatTimestamp(session.start_time) : "N/A"}
`;
  text += `End Time:       ${session.end_time ? formatTimestamp(session.end_time) : "N/A"}
`;
  text += `Operator:       ${session.operator_name || "N/A"}
`;
  text += `Status:         ${session.status.toUpperCase()}
`;
  if (session.weather_notes) {
    text += `Weather:        ${session.weather_notes}
`;
  }
  text += "\n";
  if (opts.includeMetrics && session.metrics) {
    const m = session.metrics;
    text += `TEST RESULTS
${subDivider}
`;
    if (m.pass_fail) {
      text += `Overall Result: ${m.pass_fail.toUpperCase()}

`;
    }
    text += `Total Flight Time:      ${formatDuration(m.total_flight_time_s)}
`;
    text += `Time Under Jamming:     ${formatDuration(m.time_under_jamming_s)}
`;
    if (m.time_to_effect_s !== void 0) {
      text += `Time to Effect:         ${formatDuration(m.time_to_effect_s)}
`;
    }
    if (m.effective_range_m !== void 0) {
      text += `Effective Range:        ${m.effective_range_m.toFixed(0)}m
`;
    }
    if (m.max_altitude_under_jam_m !== void 0) {
      text += `Max Alt Under Jam:      ${m.max_altitude_under_jam_m.toFixed(1)}m
`;
    }
    if (m.max_lateral_drift_m !== void 0) {
      text += `Max Lateral Drift:      ${m.max_lateral_drift_m.toFixed(1)}m
`;
    }
    if (m.failsafe_triggered) {
      text += `Failsafe Triggered:     ${m.failsafe_type || "Yes"}`;
      if (m.failsafe_expected) {
        text += ` (Expected: ${m.failsafe_expected})`;
      }
      text += "\n";
    }
    text += "\n";
  }
  text += `EQUIPMENT
${subDivider}
`;
  text += `
Drones (${session.tracker_assignments.length}):
`;
  session.tracker_assignments.forEach((a, i) => {
    const profile = droneProfiles.get(a.drone_profile_id);
    const displayName = getTrackerDisplayName(a.tracker_id);
    const showTrackerId = displayName !== a.tracker_id;
    text += `  ${i + 1}. ${displayName}`;
    if (showTrackerId) {
      text += ` (#${a.tracker_id})`;
    }
    if (profile) {
      text += ` - ${profile.make} ${profile.model}`;
    }
    if (a.target_altitude_m) {
      text += ` (Target: ${a.target_altitude_m}m)`;
    }
    text += "\n";
  });
  text += `
CUAS Systems (${session.cuas_placements.length}):
`;
  session.cuas_placements.forEach((p, i) => {
    const profile = cuasProfiles.get(p.cuas_profile_id);
    text += `  ${i + 1}. ${profile?.name || "Unknown"}`;
    if (profile) {
      text += ` - ${profile.vendor} ${profile.type}`;
    }
    text += ` (Range: ${profile?.effective_range_m || 0}m, Orient: ${p.orientation_deg}°)
`;
  });
  text += "\n";
  if (opts.includeEvents && session.events.length > 0) {
    text += `EVENT LOG (${session.events.length} events)
${subDivider}
`;
    session.events.forEach((e) => {
      text += `${formatTimestamp(e.timestamp).padEnd(22)} ${getEventTypeName(e.type).padEnd(18)} ${e.source.padEnd(10)}`;
      if (e.tracker_id) {
        const trackerDisplay = getTrackerDisplayName(e.tracker_id);
        const showId = trackerDisplay !== e.tracker_id;
        text += ` [${trackerDisplay}${showId ? ` (#${e.tracker_id})` : ""}]`;
      }
      if (e.cuas_id) text += ` [CUAS: ${e.cuas_id}]`;
      if (e.note) text += ` - ${e.note}`;
      text += "\n";
    });
    text += "\n";
  }
  if (session.post_test_notes) {
    text += `POST-TEST NOTES
${subDivider}
`;
    text += `${session.post_test_notes}

`;
  }
  text += `${divider}
`;
  text += `Generated by SCENSUS Dashboard on ${(/* @__PURE__ */ new Date()).toLocaleString()}
`;
  if (classification) {
    text += `${classification.toUpperCase()}
`;
  }
  return text;
}
function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
async function saveHTMLReport(data, outputPath, options) {
  const html = generateHTMLReport(data, options);
  await fs__namespace.promises.writeFile(outputPath, html, "utf-8");
  log.info(`HTML report saved: ${outputPath}`);
  return outputPath;
}
async function saveTextReport(data, outputPath, options) {
  const text = generateTextReport(data, options);
  await fs__namespace.promises.writeFile(outputPath, text, "utf-8");
  log.info(`Text report saved: ${outputPath}`);
  return outputPath;
}
async function generatePDFBuffer(data, options) {
  const html = generateHTMLReport(data, options);
  try {
    const { BrowserWindow } = await import("electron");
    const win = new BrowserWindow({
      show: false,
      width: 1024,
      height: 768,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise((resolve) => setTimeout(resolve, 1e3));
    const pdfBuffer = await win.webContents.printToPDF({
      landscape: false,
      printBackground: true,
      pageSize: "Letter",
      margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 }
    });
    win.close();
    return Buffer.from(pdfBuffer);
  } catch {
    return Buffer.from(html, "utf-8");
  }
}
function generateReportFilename(session, extension) {
  const date = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const safeName = session.name.replace(/[^a-zA-Z0-9-_]/g, "_").substring(0, 30);
  return `CUAS_Report_${safeName}_${date}.${extension}`;
}
const ALLOWED_REPORTS_BASE = path__namespace.join(process.cwd(), "reports");
function isPathWithinBase(targetPath, basePath) {
  const resolvedTarget = path__namespace.resolve(targetPath);
  const resolvedBase = path__namespace.resolve(basePath);
  return resolvedTarget.startsWith(resolvedBase + path__namespace.sep) || resolvedTarget === resolvedBase;
}
function reportsRoutes() {
  const router = express.Router();
  router.post("/reports/html", async (req, res) => {
    try {
      const { sessionId, options, mapImageBase64, chartImageBase64 } = req.body;
      if (!sessionId) {
        return res.status(400).json({ error: "sessionId is required" });
      }
      const session = getTestSessionById(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      const site = session.site_id ? getSiteById(session.site_id) : void 0;
      const droneProfiles = new Map(
        getDroneProfiles().map((p) => [p.id, p])
      );
      const cuasProfiles = new Map(
        getCUASProfiles().map((p) => [p.id, p])
      );
      const reportData = {
        session,
        site,
        droneProfiles,
        cuasProfiles,
        mapImageBase64,
        chartImageBase64
      };
      const html = generateHTMLReport(reportData, options);
      res.setHeader("Content-Type", "text/html");
      res.send(html);
    } catch (error) {
      log.error("Error generating HTML report:", error);
      res.status(500).json({ error: error.message });
    }
  });
  router.post("/reports/text", async (req, res) => {
    try {
      const { sessionId, options } = req.body;
      if (!sessionId) {
        return res.status(400).json({ error: "sessionId is required" });
      }
      const session = getTestSessionById(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      const site = session.site_id ? getSiteById(session.site_id) : void 0;
      const droneProfiles = new Map(
        getDroneProfiles().map((p) => [p.id, p])
      );
      const cuasProfiles = new Map(
        getCUASProfiles().map((p) => [p.id, p])
      );
      const reportData = {
        session,
        site,
        droneProfiles,
        cuasProfiles
      };
      const text = generateTextReport(reportData, options);
      res.setHeader("Content-Type", "text/plain");
      res.send(text);
    } catch (error) {
      log.error("Error generating text report:", error);
      res.status(500).json({ error: error.message });
    }
  });
  router.post("/reports/save", async (req, res) => {
    try {
      const { sessionId, format, options, mapImageBase64, chartImageBase64, outputDir } = req.body;
      if (!sessionId) {
        return res.status(400).json({ error: "sessionId is required" });
      }
      if (!format || !["html", "txt"].includes(format)) {
        return res.status(400).json({ error: 'format must be "html" or "txt"' });
      }
      const session = getTestSessionById(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      const site = session.site_id ? getSiteById(session.site_id) : void 0;
      const droneProfiles = new Map(
        getDroneProfiles().map((p) => [p.id, p])
      );
      const cuasProfiles = new Map(
        getCUASProfiles().map((p) => [p.id, p])
      );
      const reportData = {
        session,
        site,
        droneProfiles,
        cuasProfiles,
        mapImageBase64,
        chartImageBase64
      };
      const dir = outputDir || ALLOWED_REPORTS_BASE;
      if (!isPathWithinBase(dir, ALLOWED_REPORTS_BASE)) {
        return res.status(403).json({ error: "Output directory not allowed" });
      }
      if (!fs__namespace.existsSync(dir)) {
        fs__namespace.mkdirSync(dir, { recursive: true });
      }
      const filename = generateReportFilename(session, format);
      const outputPath = path__namespace.join(dir, filename);
      if (!isPathWithinBase(outputPath, ALLOWED_REPORTS_BASE)) {
        return res.status(403).json({ error: "Output path not allowed" });
      }
      if (format === "html") {
        await saveHTMLReport(reportData, outputPath, options);
      } else {
        await saveTextReport(reportData, outputPath, options);
      }
      updateTestSession(sessionId, { report_path: outputPath });
      res.json({
        success: true,
        path: outputPath,
        filename
      });
    } catch (error) {
      log.error("Error saving report:", error);
      res.status(500).json({ error: error.message });
    }
  });
  router.get("/reports/download/:sessionId/:format", async (req, res) => {
    try {
      const { sessionId, format } = req.params;
      if (!["html", "txt", "pdf"].includes(format)) {
        return res.status(400).json({ error: 'format must be "html", "txt", or "pdf"' });
      }
      const session = getTestSessionById(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      const site = session.site_id ? getSiteById(session.site_id) : void 0;
      const droneProfiles = new Map(
        getDroneProfiles().map((p) => [p.id, p])
      );
      const cuasProfiles = new Map(
        getCUASProfiles().map((p) => [p.id, p])
      );
      const reportData = {
        session,
        site,
        droneProfiles,
        cuasProfiles
      };
      const filename = generateReportFilename(session, format);
      if (format === "pdf") {
        try {
          const pdfBuffer = await generatePDFBuffer(reportData);
          res.setHeader("Content-Type", "application/pdf");
          res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
          res.send(pdfBuffer);
        } catch (pdfError) {
          log.error("Error generating PDF:", pdfError);
          res.status(500).json({ error: "PDF generation failed: " + pdfError.message });
        }
        return;
      }
      let content;
      let contentType;
      if (format === "html") {
        content = generateHTMLReport(reportData);
        contentType = "text/html";
      } else {
        content = generateTextReport(reportData);
        contentType = "text/plain";
      }
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(content);
    } catch (error) {
      log.error("Error downloading report:", error);
      res.status(500).json({ error: error.message });
    }
  });
  return router;
}
const EARTH_R = 6371e3;
function haversineDistance$1(lat1, lon1, lat2, lon2) {
  const r1 = lat1 * Math.PI / 180;
  const r2 = lat2 * Math.PI / 180;
  const dl = (lat2 - lat1) * Math.PI / 180;
  const dn = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dl / 2) ** 2 + Math.cos(r1) * Math.cos(r2) * Math.sin(dn / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(a));
}
function bearingDeg(lat1, lon1, lat2, lon2) {
  const r1 = lat1 * Math.PI / 180;
  const r2 = lat2 * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;
  const x = Math.sin(dl) * Math.cos(r2);
  const y = Math.cos(r1) * Math.sin(r2) - Math.sin(r1) * Math.cos(r2) * Math.cos(dl);
  return (Math.atan2(x, y) * 180 / Math.PI + 360) % 360;
}
function destPoint(lat, lon, brngDeg, distM) {
  const rl = lat * Math.PI / 180;
  const rn = lon * Math.PI / 180;
  const br = brngDeg * Math.PI / 180;
  const d = distM / EARTH_R;
  const nl = Math.asin(Math.sin(rl) * Math.cos(d) + Math.cos(rl) * Math.sin(d) * Math.cos(br));
  const nn = rn + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(rl), Math.cos(d) - Math.sin(rl) * Math.sin(nl));
  return [nl * 180 / Math.PI, nn * 180 / Math.PI];
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
class MockTrackerProvider extends events.EventEmitter {
  trackers = /* @__PURE__ */ new Map();
  interval = null;
  enabled = false;
  updateRate = 1e3;
  // 1Hz default
  gpsDenialZones = [];
  constructor(updateRateMs = 1e3) {
    super();
    this.updateRate = updateRateMs;
  }
  /**
   * Set GPS denial zones for spatial degradation
   */
  setGpsDenialZones(zones) {
    this.gpsDenialZones = zones;
    log.info(`Set ${zones.length} GPS denial zone(s)`);
  }
  /**
   * Add a mock tracker with configuration
   */
  addMockTracker(config) {
    const trackerIndex = this.trackers.size;
    const phaseOffset = trackerIndex * 20;
    const isLowBatTracker = config.trackerId.includes("LOW-BAT");
    const initialBattery = isLowBatTracker ? 3100 + Math.random() * 200 : 3800 + Math.random() * 400;
    this.trackers.set(config.trackerId, {
      config,
      position: [...config.startPosition],
      heading: config.heading,
      waypointIndex: 0,
      hoverTime: 0,
      // GPS health simulation - start with different phases for variety
      gpsHealthPhase: "healthy",
      gpsHealthTimer: phaseOffset,
      // Staggered offset for phase changes
      batteryMv: initialBattery,
      // Extended waypoint state
      segmentT: 0,
      currentAltitude: config.altitude,
      currentSpeed: config.speed,
      finished: false,
      // GPS denial drift
      driftLat: 0,
      driftLon: 0
    });
    log.info(`Added mock tracker: ${config.trackerId} (phase offset: ${phaseOffset}s, battery: ${initialBattery}mV)`);
  }
  /**
   * Remove a mock tracker
   */
  removeMockTracker(trackerId) {
    this.trackers.delete(trackerId);
    log.info(`Removed mock tracker: ${trackerId}`);
  }
  /**
   * Get all tracker IDs
   */
  getTrackerIds() {
    return Array.from(this.trackers.keys());
  }
  /**
   * Check if mock mode is running
   */
  isRunning() {
    return this.enabled;
  }
  /**
   * Start mock tracker simulation
   */
  start() {
    if (this.enabled) {
      log.warn("MockTrackerProvider already running");
      return;
    }
    this.enabled = true;
    log.info(`Starting mock tracker simulation with ${this.trackers.size} trackers`);
    this.interval = setInterval(() => {
      if (!this.enabled) return;
      for (const [trackerId, state] of this.trackers) {
        if (state.finished) continue;
        this.updateTrackerPosition(state);
        const position = this.createPositionUpdate(trackerId, state);
        this.emit("position", position);
      }
    }, this.updateRate);
  }
  /**
   * Stop mock tracker simulation
   */
  stop() {
    this.enabled = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    log.info("Stopped mock tracker simulation");
  }
  /**
   * Clear all trackers
   */
  clear() {
    this.stop();
    this.trackers.clear();
    this.gpsDenialZones = [];
    log.info("Cleared all mock trackers");
  }
  /**
   * Update tracker position based on pattern
   */
  updateTrackerPosition(state) {
    const { config } = state;
    const dt = this.updateRate / 1e3;
    if (config.extendedWaypoints && config.extendedWaypoints.length > 1) {
      this.updateExtendedWaypoints(state, dt);
      return;
    }
    const speedDeg = config.speed / 111e3;
    switch (config.pattern) {
      case "linear":
        state.position[0] += speedDeg * Math.sin(state.heading * Math.PI / 180);
        state.position[1] += speedDeg * Math.cos(state.heading * Math.PI / 180);
        break;
      case "circular":
        state.heading = (state.heading + 2) % 360;
        state.position[0] += speedDeg * Math.sin(state.heading * Math.PI / 180);
        state.position[1] += speedDeg * Math.cos(state.heading * Math.PI / 180);
        break;
      case "waypoints":
        if (config.waypoints && config.waypoints.length > 0) {
          const target = config.waypoints[state.waypointIndex];
          const dx = target[0] - state.position[0];
          const dy = target[1] - state.position[1];
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < speedDeg * 2) {
            state.waypointIndex = (state.waypointIndex + 1) % config.waypoints.length;
          } else {
            state.heading = Math.atan2(dx, dy) * 180 / Math.PI;
            state.position[0] += dx / dist * speedDeg;
            state.position[1] += dy / dist * speedDeg;
          }
        }
        break;
      case "random":
        state.heading += (Math.random() - 0.5) * 30;
        state.heading = (state.heading % 360 + 360) % 360;
        state.position[0] += speedDeg * Math.sin(state.heading * Math.PI / 180);
        state.position[1] += speedDeg * Math.cos(state.heading * Math.PI / 180);
        break;
      case "hover":
        state.position[0] += (Math.random() - 0.5) * speedDeg * 0.1;
        state.position[1] += (Math.random() - 0.5) * speedDeg * 0.1;
        state.hoverTime += this.updateRate / 1e3;
        break;
    }
  }
  /**
   * Extended waypoints: segment-progress interpolation (ported from Python Drone.tick())
   * Waypoints are [lon, lat, alt, speed]. Progress along each segment is
   * computed from interpolated speed and haversine segment distance.
   */
  updateExtendedWaypoints(state, dt) {
    const wps = state.config.extendedWaypoints;
    if (state.waypointIndex + 1 >= wps.length) {
      const first = wps[0];
      const last = wps[wps.length - 1];
      if (first[0] === last[0] && first[1] === last[1]) {
        state.waypointIndex = 0;
        state.segmentT = 0;
      } else {
        state.finished = true;
        return;
      }
    }
    const w0 = wps[state.waypointIndex];
    const w1 = wps[state.waypointIndex + 1];
    const segDist = haversineDistance$1(w0[1], w0[0], w1[1], w1[0]);
    if (segDist < 0.1) {
      state.waypointIndex++;
      state.segmentT = 0;
      return;
    }
    const interpSpeed = lerp(w0[3], w1[3], state.segmentT);
    state.segmentT += interpSpeed * dt / segDist;
    if (state.segmentT >= 1) {
      state.waypointIndex++;
      state.segmentT = 0;
      state.position[0] = w1[0];
      state.position[1] = w1[1];
      state.currentAltitude = w1[2];
      state.currentSpeed = w1[3];
      if (state.waypointIndex + 1 < wps.length) {
        const w2 = wps[state.waypointIndex + 1];
        state.heading = bearingDeg(w1[1], w1[0], w2[1], w2[0]);
      }
      return;
    }
    const t = state.segmentT;
    state.position[0] = lerp(w0[0], w1[0], t);
    state.position[1] = lerp(w0[1], w1[1], t);
    state.currentAltitude = lerp(w0[2], w1[2], t);
    state.currentSpeed = interpSpeed;
    state.heading = bearingDeg(w0[1], w0[0], w1[1], w1[0]);
  }
  /**
   * Create position update with realistic noise and GPS health simulation
   */
  createPositionUpdate(trackerId, state) {
    const { config } = state;
    const useExtended = !!(config.extendedWaypoints && config.extendedWaypoints.length > 1);
    if (config.gpsDenialAffected && this.gpsDenialZones.length > 0) {
      return this.createDenialPositionUpdate(trackerId, state, useExtended);
    }
    state.gpsHealthTimer += this.updateRate / 1e3;
    const cycleTime = 60;
    const phase = state.gpsHealthTimer % cycleTime;
    let hdop;
    let satellites;
    let fixValid;
    let gpsQuality;
    if (phase < 40) {
      state.gpsHealthPhase = "healthy";
      hdop = 1 + Math.random() * 0.8;
      satellites = 8 + Math.floor(Math.random() * 4);
      fixValid = true;
      gpsQuality = "good";
    } else if (phase < 50) {
      state.gpsHealthPhase = "degrading";
      hdop = 3 + Math.random() * 3;
      satellites = 4 + Math.floor(Math.random() * 3);
      fixValid = true;
      gpsQuality = "degraded";
    } else if (phase < 55) {
      state.gpsHealthPhase = "lost";
      hdop = 10 + Math.random() * 5;
      satellites = Math.floor(Math.random() * 3);
      fixValid = false;
      gpsQuality = "poor";
    } else {
      state.gpsHealthPhase = "recovering";
      hdop = 2 + Math.random() * 2;
      satellites = 5 + Math.floor(Math.random() * 3);
      fixValid = true;
      gpsQuality = "degraded";
    }
    const noiseFactor = state.gpsHealthPhase === "healthy" ? 1 : state.gpsHealthPhase === "lost" ? 5 : 2;
    const latNoise = (Math.random() - 0.5) * 1e-5 * noiseFactor;
    const lonNoise = (Math.random() - 0.5) * 1e-5 * noiseFactor;
    const altNoise = (Math.random() - 0.5) * 2 * noiseFactor;
    const speedNoise = (Math.random() - 0.5) * 1;
    const baseRssi = state.gpsHealthPhase === "healthy" ? -50 : state.gpsHealthPhase === "lost" ? -80 : -65;
    const rssiVariation = Math.random() * 10;
    const rssi = baseRssi - rssiVariation;
    state.batteryMv -= 0.05;
    if (state.batteryMv < 3e3) {
      state.batteryMv = 3800 + Math.random() * 400;
    }
    const altitude = useExtended ? state.currentAltitude : config.altitude;
    const speed = useExtended ? state.currentSpeed : config.speed;
    return {
      tracker_id: trackerId,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      latitude: fixValid ? state.position[1] + latNoise : state.position[1],
      longitude: fixValid ? state.position[0] + lonNoise : state.position[0],
      altitude_m: altitude + altNoise,
      speed_ms: Math.max(0, speed + speedNoise),
      heading_deg: state.heading,
      rssi_dbm: rssi,
      gps_quality: gpsQuality,
      source: "mock",
      hdop,
      satellites,
      fix_valid: fixValid,
      battery_mv: Math.round(state.batteryMv)
    };
  }
  /**
   * Create position update with spatial GPS denial degradation.
   * When the drone is inside a denial zone, GPS quality degrades proportionally
   * to distance from zone center (ported from Python Drone._apply_denial()).
   */
  createDenialPositionUpdate(trackerId, state, useExtended) {
    const { config } = state;
    let inZone = false;
    let strength = 0;
    let activeZone = null;
    for (const zone of this.gpsDenialZones) {
      const dist = haversineDistance$1(state.position[1], state.position[0], zone.center[1], zone.center[0]);
      if (dist < zone.radiusM) {
        const s = 1 - dist / zone.radiusM;
        if (s > strength) {
          strength = s;
          activeZone = zone;
          inZone = true;
        }
      }
    }
    let hdop;
    let satellites;
    let fixValid;
    let gpsQuality;
    let reportLat = state.position[1];
    let reportLon = state.position[0];
    if (!inZone || !activeZone) {
      hdop = 0.9 + Math.random() * 0.2;
      satellites = 11 + Math.floor(Math.random() * 3);
      fixValid = true;
      gpsQuality = "good";
      state.driftLat = 0;
      state.driftLon = 0;
    } else {
      const dz = activeZone;
      satellites = Math.max(dz.minSats, Math.floor(lerp(12, dz.minSats, strength)) + Math.floor(Math.random() * (dz.maxSats + 1)));
      hdop = lerp(0.9, dz.hdopMax, strength) + (Math.random() - 0.5) * 2;
      fixValid = Math.random() > 0.3 * strength;
      const driftStep = dz.driftM * strength * Math.random();
      const driftBrng = Math.random() * 360;
      const [dl, dn] = destPoint(0, 0, driftBrng, driftStep);
      state.driftLat = state.driftLat * 0.8 + dl * 0.2;
      state.driftLon = state.driftLon * 0.8 + dn * 0.2;
      reportLat += state.driftLat;
      reportLon += state.driftLon;
      gpsQuality = strength > 0.6 ? "poor" : strength > 0.3 ? "degraded" : "good";
    }
    const altNoise = (Math.random() - 0.5) * 2;
    const speedNoise = (Math.random() - 0.5) * 1;
    const rssi = -50 - Math.random() * 10;
    state.batteryMv -= 0.05;
    if (state.batteryMv < 3e3) {
      state.batteryMv = 3800 + Math.random() * 400;
    }
    const altitude = useExtended ? state.currentAltitude : config.altitude;
    const speed = useExtended ? state.currentSpeed : config.speed;
    return {
      tracker_id: trackerId,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      latitude: reportLat,
      longitude: reportLon,
      altitude_m: altitude + altNoise,
      speed_ms: Math.max(0, speed + speedNoise),
      heading_deg: state.heading,
      rssi_dbm: rssi,
      gps_quality: gpsQuality,
      source: "mock",
      hdop,
      satellites,
      fix_valid: fixValid,
      battery_mv: Math.round(state.batteryMv)
    };
  }
  /**
   * Get default demo tracker configurations
   * Creates 4 trackers with different flight patterns and GPS health scenarios
   */
  static getDefaultDemoTrackers(siteCenter) {
    const center = siteCenter || [-122.4194, 37.7749];
    return [
      {
        trackerId: "DEMO-001",
        startPosition: [center[0] + 5e-3, center[1] + 3e-3],
        altitude: 50,
        speed: 10,
        heading: 45,
        pattern: "circular",
        color: "#ff6b00"
        // Orange - will cycle through GPS health states
      },
      {
        trackerId: "DEMO-002",
        startPosition: [center[0] - 3e-3, center[1] + 5e-3],
        altitude: 100,
        speed: 15,
        heading: 180,
        pattern: "waypoints",
        waypoints: [
          [center[0] - 3e-3, center[1] + 5e-3],
          [center[0] + 3e-3, center[1] + 5e-3],
          [center[0] + 3e-3, center[1] - 3e-3],
          [center[0] - 3e-3, center[1] - 3e-3]
        ],
        color: "#00c8b4"
        // Cyan - will cycle through GPS health states (offset)
      },
      {
        trackerId: "DEMO-003",
        startPosition: [center[0] - 2e-3, center[1] - 4e-3],
        altitude: 30,
        speed: 8,
        heading: 90,
        pattern: "hover",
        color: "#6366f1"
        // Indigo - will cycle through GPS health states (offset)
      },
      {
        trackerId: "DEMO-LOW-BAT",
        startPosition: [center[0] + 2e-3, center[1] - 3e-3],
        altitude: 40,
        speed: 12,
        heading: 270,
        pattern: "random",
        color: "#ef4444"
        // Red - demonstrates low battery warning
      }
    ];
  }
  /**
   * Get current positions of all trackers
   */
  getCurrentPositions() {
    const positions = [];
    for (const [trackerId, state] of this.trackers) {
      positions.push(this.createPositionUpdate(trackerId, state));
    }
    return positions;
  }
}
let mockProviderInstance = null;
function getMockTrackerProvider() {
  if (!mockProviderInstance) {
    mockProviderInstance = new MockTrackerProvider();
  }
  return mockProviderInstance;
}
function resetMockTrackerProvider() {
  if (mockProviderInstance) {
    mockProviderInstance.clear();
    mockProviderInstance = null;
  }
}
const BMO_FIELD_SCENARIO = {
  id: "bmo-field",
  name: "BMO Field, Toronto",
  description: "5 drones approaching BMO Field from multiple directions with GPS denial zone",
  siteCenter: [-79.4186, 43.6332],
  gpsDenialZones: [
    {
      center: [-79.4186, 43.6332],
      radiusM: 400,
      minSats: 0,
      maxSats: 3,
      hdopMax: 25,
      driftM: 20
    }
  ],
  trackers: [
    {
      trackerId: "ALPHA-01",
      description: "North approach over Exhibition Place — steady descent",
      startPosition: [-79.418, 43.642],
      altitude: 80,
      speed: 18,
      heading: 180,
      pattern: "waypoints",
      gpsDenialAffected: false,
      color: "#ff6b00",
      extendedWaypoints: [
        [-79.418, 43.642, 80, 18],
        [-79.4183, 43.6395, 80, 16],
        [-79.4185, 43.637, 75, 12],
        [-79.4186, 43.6355, 60, 8],
        [-79.4186, 43.634, 50, 5],
        [-79.4186, 43.6332, 40, 3]
      ]
    },
    {
      trackerId: "BRAVO-02",
      description: "East approach from downtown Toronto — high altitude recon",
      startPosition: [-79.39, 43.645],
      altitude: 200,
      speed: 25,
      heading: 240,
      pattern: "waypoints",
      gpsDenialAffected: false,
      color: "#00c8b4",
      extendedWaypoints: [
        [-79.39, 43.645, 200, 25],
        [-79.398, 43.642, 180, 22],
        [-79.405, 43.639, 150, 18],
        [-79.412, 43.6365, 120, 14],
        [-79.416, 43.6345, 100, 10],
        [-79.418, 43.6335, 80, 6],
        [-79.4186, 43.6332, 60, 3]
      ]
    },
    {
      trackerId: "CHARLIE-03",
      description: "Southwest from Lake Ontario — GPS denial active",
      startPosition: [-79.428, 43.626],
      altitude: 60,
      speed: 20,
      heading: 45,
      pattern: "waypoints",
      gpsDenialAffected: true,
      color: "#ef4444",
      extendedWaypoints: [
        [-79.428, 43.626, 60, 20],
        [-79.426, 43.6275, 65, 18],
        [-79.424, 43.629, 70, 15],
        [-79.422, 43.6305, 75, 12],
        [-79.42, 43.6318, 70, 8],
        [-79.419, 43.633, 55, 5],
        [-79.4186, 43.6332, 45, 2]
      ]
    },
    {
      trackerId: "DELTA-04",
      description: "West approach from Parkdale — low and fast",
      startPosition: [-79.435, 43.6365],
      altitude: 35,
      speed: 22,
      heading: 90,
      pattern: "waypoints",
      gpsDenialAffected: false,
      color: "#6366f1",
      extendedWaypoints: [
        [-79.435, 43.6365, 35, 22],
        [-79.431, 43.6358, 35, 20],
        [-79.427, 43.635, 30, 18],
        [-79.424, 43.6345, 28, 14],
        [-79.421, 43.634, 25, 10],
        [-79.4195, 43.6335, 22, 6],
        [-79.4186, 43.6332, 20, 3]
      ]
    },
    {
      trackerId: "ECHO-05",
      description: "Southeast orbit — circling surveillance pattern",
      startPosition: [-79.412, 43.629],
      altitude: 120,
      speed: 15,
      heading: 315,
      pattern: "waypoints",
      gpsDenialAffected: false,
      color: "#eab308",
      extendedWaypoints: [
        [-79.412, 43.629, 120, 15],
        [-79.414, 43.631, 120, 15],
        [-79.413, 43.634, 115, 14],
        [-79.416, 43.6355, 110, 14],
        [-79.42, 43.635, 110, 13],
        [-79.422, 43.633, 108, 13],
        [-79.42, 43.6305, 105, 12],
        [-79.417, 43.629, 105, 12],
        [-79.412, 43.629, 120, 15]
        // loop back to start
      ]
    }
  ]
};
const GRAND_FORKS_AFB_SCENARIO = {
  id: "grand-forks-afb",
  name: "Grand Forks AFB",
  description: "4 drones probing AFB perimeter with RF denial zone over airfield",
  siteCenter: [-97.4001, 47.9547],
  gpsDenialZones: [
    {
      center: [-97.395, 47.956],
      radiusM: 500,
      minSats: 1,
      maxSats: 4,
      hdopMax: 20,
      driftM: 15
    }
  ],
  trackers: [
    {
      trackerId: "HAWK-01",
      description: "North approach along runway corridor — fast ingress",
      startPosition: [-97.4001, 47.975],
      altitude: 90,
      speed: 22,
      heading: 180,
      pattern: "waypoints",
      gpsDenialAffected: false,
      color: "#ff6b00",
      extendedWaypoints: [
        [-97.4001, 47.975, 90, 22],
        [-97.4005, 47.971, 85, 20],
        [-97.4, 47.967, 75, 16],
        [-97.399, 47.963, 65, 12],
        [-97.398, 47.959, 55, 8],
        [-97.397, 47.956, 45, 5]
      ]
    },
    {
      trackerId: "HAWK-02",
      description: "East approach from GrandSky — low altitude recon",
      startPosition: [-97.37, 47.96],
      altitude: 40,
      speed: 18,
      heading: 270,
      pattern: "waypoints",
      gpsDenialAffected: true,
      color: "#ef4444",
      extendedWaypoints: [
        [-97.37, 47.96, 40, 18],
        [-97.377, 47.959, 40, 16],
        [-97.384, 47.9575, 38, 14],
        [-97.39, 47.9565, 35, 10],
        [-97.395, 47.9555, 32, 7],
        [-97.4, 47.9547, 30, 4]
      ]
    },
    {
      trackerId: "HAWK-03",
      description: "Southwest approach — high altitude surveillance orbit",
      startPosition: [-97.43, 47.94],
      altitude: 150,
      speed: 15,
      heading: 45,
      pattern: "waypoints",
      gpsDenialAffected: false,
      color: "#6366f1",
      extendedWaypoints: [
        [-97.43, 47.94, 150, 15],
        [-97.425, 47.943, 145, 15],
        [-97.42, 47.946, 140, 14],
        [-97.415, 47.949, 130, 13],
        [-97.41, 47.952, 120, 12],
        [-97.405, 47.954, 110, 10],
        [-97.4001, 47.9547, 100, 8]
      ]
    },
    {
      trackerId: "HAWK-04",
      description: "West perimeter probe — nap-of-earth flight",
      startPosition: [-97.435, 47.958],
      altitude: 15,
      speed: 20,
      heading: 90,
      pattern: "waypoints",
      gpsDenialAffected: false,
      color: "#eab308",
      extendedWaypoints: [
        [-97.435, 47.958, 15, 20],
        [-97.429, 47.9575, 15, 18],
        [-97.423, 47.9568, 18, 16],
        [-97.417, 47.956, 20, 14],
        [-97.411, 47.9555, 22, 10],
        [-97.405, 47.955, 25, 6]
      ]
    }
  ]
};
const DEFAULT_SCENARIO = {
  id: "default",
  name: "Default (4 drones)",
  description: "Generic demo with 4 trackers using simple flight patterns",
  siteCenter: [-122.4194, 37.7749],
  trackers: []
  // empty signals use of getDefaultDemoTrackers()
};
const DEMO_SCENARIOS = [DEFAULT_SCENARIO, BMO_FIELD_SCENARIO, GRAND_FORKS_AFB_SCENARIO];
function getScenarioById(id) {
  return DEMO_SCENARIOS.find((s) => s.id === id);
}
let demoModeEnabled = false;
let activeDemoScenario = null;
let demoModeApp = null;
function systemRoutes(app) {
  const router = express.Router();
  demoModeApp = app;
  router.get("/system/status", (_req, res) => {
    const libraryStats = getLibraryStats();
    const mockProvider = getMockTrackerProvider();
    res.json({
      demoMode: {
        enabled: demoModeEnabled,
        trackerCount: mockProvider.isRunning() ? mockProvider.getTrackerIds().length : 0,
        trackerIds: mockProvider.isRunning() ? mockProvider.getTrackerIds() : []
      },
      recording: {
        activeSessionIds: sessionDataCollector.getActiveSessionIds(),
        allSessionIds: sessionDataCollector.getAllSessionIds()
      },
      libraries: libraryStats,
      anomalyDetection: {
        enabled: app.isAnomalyDetectionEnabled()
      }
    });
  });
  router.post("/system/demo-mode", (req, res) => {
    const { enabled, siteCenter, scenario } = req.body;
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "enabled must be a boolean" });
    }
    try {
      if (enabled) {
        enableDemoMode(siteCenter, scenario);
        res.json({
          success: true,
          message: "Demo mode enabled",
          trackerIds: getMockTrackerProvider().getTrackerIds(),
          scenario: activeDemoScenario
        });
      } else {
        disableDemoMode();
        res.json({
          success: true,
          message: "Demo mode disabled"
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      log.error("Error toggling demo mode:", error);
      res.status(500).json({ error: message });
    }
  });
  router.get("/system/demo-mode", (_req, res) => {
    const mockProvider = getMockTrackerProvider();
    res.json({
      enabled: demoModeEnabled,
      running: mockProvider.isRunning(),
      trackerCount: mockProvider.isRunning() ? mockProvider.getTrackerIds().length : 0,
      trackerIds: mockProvider.isRunning() ? mockProvider.getTrackerIds() : [],
      scenario: activeDemoScenario
    });
  });
  router.get("/system/demo-mode/scenarios", (_req, res) => {
    res.json(
      DEMO_SCENARIOS.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        trackerCount: s.trackers.length || 4,
        // default scenario has 4
        hasGpsDenial: !!(s.gpsDenialZones && s.gpsDenialZones.length > 0)
      }))
    );
  });
  router.post("/system/demo-mode/trackers", (req, res) => {
    if (!demoModeEnabled) {
      return res.status(400).json({ error: "Demo mode is not enabled" });
    }
    const { trackers } = req.body;
    if (!Array.isArray(trackers)) {
      return res.status(400).json({ error: "trackers must be an array" });
    }
    const mockProvider = getMockTrackerProvider();
    for (const tracker of trackers) {
      if (!tracker.trackerId || !tracker.startPosition) {
        continue;
      }
      mockProvider.addMockTracker({
        trackerId: tracker.trackerId,
        startPosition: tracker.startPosition,
        altitude: tracker.altitude || 50,
        speed: tracker.speed || 10,
        heading: tracker.heading || 0,
        pattern: tracker.pattern || "circular",
        waypoints: tracker.waypoints,
        color: tracker.color
      });
    }
    res.json({
      success: true,
      trackerCount: mockProvider.getTrackerIds().length,
      trackerIds: mockProvider.getTrackerIds()
    });
  });
  router.delete("/system/demo-mode/trackers/:trackerId", (req, res) => {
    if (!demoModeEnabled) {
      return res.status(400).json({ error: "Demo mode is not enabled" });
    }
    const { trackerId } = req.params;
    const mockProvider = getMockTrackerProvider();
    mockProvider.removeMockTracker(trackerId);
    res.json({
      success: true,
      trackerCount: mockProvider.getTrackerIds().length
    });
  });
  router.post("/system/recording/start", (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }
    sessionDataCollector.startSession(sessionId);
    res.json({
      success: true,
      message: `Started recording session: ${sessionId}`
    });
  });
  router.post("/system/recording/stop", (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }
    sessionDataCollector.stopSession(sessionId);
    const summary = sessionDataCollector.getSessionSummary(sessionId);
    res.json({
      success: true,
      message: `Stopped recording session: ${sessionId}`,
      summary
    });
  });
  router.get("/system/recording/:sessionId", (req, res) => {
    const { sessionId } = req.params;
    const data = sessionDataCollector.exportSessionData(sessionId);
    if (data.positions.length === 0 && data.events.length === 0) {
      return res.status(404).json({ error: "No data found for session" });
    }
    res.json(data);
  });
  router.delete("/system/recording/:sessionId", (req, res) => {
    const { sessionId } = req.params;
    sessionDataCollector.clearSession(sessionId);
    res.json({
      success: true,
      message: `Cleared session data: ${sessionId}`
    });
  });
  return router;
}
function enableDemoMode(siteCenter, scenarioId) {
  if (demoModeEnabled) {
    log.info("Demo mode already enabled");
    return;
  }
  const mockProvider = getMockTrackerProvider();
  const scenario = scenarioId ? getScenarioById(scenarioId) : null;
  if (scenario && scenario.trackers.length > 0) {
    activeDemoScenario = scenario.id;
    for (const t of scenario.trackers) {
      mockProvider.addMockTracker({
        trackerId: t.trackerId,
        startPosition: t.startPosition,
        altitude: t.altitude,
        speed: t.speed,
        heading: t.heading,
        pattern: t.pattern,
        extendedWaypoints: t.extendedWaypoints,
        gpsDenialAffected: t.gpsDenialAffected,
        color: t.color
      });
    }
    if (scenario.gpsDenialZones) {
      mockProvider.setGpsDenialZones(scenario.gpsDenialZones);
    }
  } else {
    activeDemoScenario = "default";
    const defaultTrackers = MockTrackerProvider.getDefaultDemoTrackers(siteCenter);
    for (const tracker of defaultTrackers) {
      mockProvider.addMockTracker(tracker);
    }
  }
  mockProvider.on("position", (position) => {
    if (demoModeApp) {
      const record = {
        tracker_id: position.tracker_id,
        time_local_received: position.timestamp,
        time_gps: position.timestamp,
        time_received: position.timestamp,
        lat: position.latitude,
        lon: position.longitude,
        alt_m: position.altitude_m,
        speed_mps: position.speed_ms,
        course_deg: position.heading_deg,
        hdop: position.hdop,
        satellites: position.satellites,
        rssi_dbm: position.rssi_dbm,
        baro_alt_m: null,
        baro_temp_c: null,
        baro_press_hpa: null,
        fix_valid: position.fix_valid,
        battery_mv: position.battery_mv,
        latency_ms: null
      };
      demoModeApp.stateManager.updateTracker(record);
      for (const sessionId of sessionDataCollector.getActiveSessionIds()) {
        sessionDataCollector.recordPosition(sessionId, position);
      }
    }
  });
  mockProvider.start();
  demoModeEnabled = true;
  log.info(`Demo mode enabled with ${mockProvider.getTrackerIds().length} trackers`);
  if (demoModeApp) {
    demoModeApp.broadcastMessage({
      type: "demo_mode_changed",
      data: {
        enabled: true,
        trackerIds: mockProvider.getTrackerIds()
      }
    });
  }
}
function disableDemoMode() {
  if (!demoModeEnabled) {
    return;
  }
  resetMockTrackerProvider();
  demoModeEnabled = false;
  activeDemoScenario = null;
  log.info("Demo mode disabled");
  if (demoModeApp) {
    demoModeApp.broadcastMessage({
      type: "demo_mode_changed",
      data: {
        enabled: false,
        trackerIds: []
      }
    });
  }
}
function crmRoutes() {
  const router = express.Router();
  router.get("/crm/tags", (req, res) => {
    try {
      const tags = getAllTags();
      res.json({ tags });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tags" });
    }
  });
  router.get("/crm/sessions/by-tag/:tag", (req, res) => {
    try {
      const sessions = getSessionsByTag(req.params.tag);
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch sessions by tag" });
    }
  });
  router.post("/crm/sessions/:id/tags", (req, res) => {
    try {
      const { tag } = req.body;
      if (!tag || typeof tag !== "string") {
        return res.status(400).json({ error: "Tag is required" });
      }
      const session = addTagToSession(req.params.id, tag);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      res.json({ tags: session.tags });
    } catch (error) {
      res.status(500).json({ error: "Failed to add tag" });
    }
  });
  router.delete("/crm/sessions/:id/tags/:tag", (req, res) => {
    try {
      const session = removeTagFromSession(req.params.id, req.params.tag);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      res.json({ tags: session.tags });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove tag" });
    }
  });
  router.get("/crm/sessions/:id/tags", (req, res) => {
    try {
      const tags = getSessionTags(req.params.id);
      res.json({ tags });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch session tags" });
    }
  });
  router.get("/crm/sessions/:id/annotations", (req, res) => {
    try {
      const type = req.query.type;
      const annotations = getSessionAnnotations(req.params.id, type);
      res.json({ annotations });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch annotations" });
    }
  });
  router.post("/crm/sessions/:id/annotations", (req, res) => {
    try {
      const { content, type, author, timestamp_ref } = req.body;
      if (!content || typeof content !== "string") {
        return res.status(400).json({ error: "Content is required" });
      }
      const validTypes = ["note", "observation", "issue", "recommendation"];
      const annotationType = validTypes.includes(type) ? type : "note";
      const session = addAnnotationToSession(
        req.params.id,
        content,
        annotationType,
        author,
        timestamp_ref
      );
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      const newAnnotation = session.annotations?.[session.annotations.length - 1];
      res.status(201).json(newAnnotation);
    } catch (error) {
      res.status(500).json({ error: "Failed to add annotation" });
    }
  });
  router.put("/crm/sessions/:id/annotations/:annotationId", (req, res) => {
    try {
      const { content } = req.body;
      if (!content || typeof content !== "string") {
        return res.status(400).json({ error: "Content is required" });
      }
      const session = updateAnnotation(req.params.id, req.params.annotationId, content);
      if (!session) {
        return res.status(404).json({ error: "Session or annotation not found" });
      }
      const updatedAnnotation = session.annotations?.find((a) => a.id === req.params.annotationId);
      res.json(updatedAnnotation);
    } catch (error) {
      res.status(500).json({ error: "Failed to update annotation" });
    }
  });
  router.delete("/crm/sessions/:id/annotations/:annotationId", (req, res) => {
    try {
      const session = removeAnnotationFromSession(req.params.id, req.params.annotationId);
      if (!session) {
        return res.status(404).json({ error: "Session or annotation not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove annotation" });
    }
  });
  router.post("/crm/sessions/search", (req, res) => {
    try {
      const filters = req.body;
      const sessions = searchSessions(filters);
      res.json({
        sessions,
        total: sessions.length,
        filters
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to search sessions" });
    }
  });
  router.get("/crm/sessions/search", (req, res) => {
    try {
      const filters = {
        search: req.query.q,
        status: req.query.status ? req.query.status.split(",") : void 0,
        siteId: req.query.site_id,
        tags: req.query.tags ? req.query.tags.split(",") : void 0,
        passFail: req.query.pass_fail,
        droneProfileId: req.query.drone_profile_id,
        cuasProfileId: req.query.cuas_profile_id,
        startDate: req.query.start_date,
        endDate: req.query.end_date,
        operatorName: req.query.operator
      };
      const sessions = searchSessions(filters);
      res.json({
        sessions,
        total: sessions.length
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to search sessions" });
    }
  });
  router.get("/crm/dashboard", (req, res) => {
    try {
      const stats = getDashboardStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
  });
  router.get("/crm/drone-profiles/:id/sessions", (req, res) => {
    try {
      const sessions = getSessionsByDroneProfile(req.params.id);
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch sessions for drone profile" });
    }
  });
  router.get("/crm/drone-profiles/:id/stats", (req, res) => {
    try {
      const stats = getDroneProfileStats(req.params.id);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch drone profile stats" });
    }
  });
  router.get("/crm/cuas-profiles/:id/sessions", (req, res) => {
    try {
      const sessions = getSessionsByCUASProfile(req.params.id);
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch sessions for CUAS profile" });
    }
  });
  router.get("/crm/cuas-profiles/:id/stats", (req, res) => {
    try {
      const stats = getCUASProfileStats(req.params.id);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch CUAS profile stats" });
    }
  });
  router.get("/crm/sites/:id/sessions", (req, res) => {
    try {
      const sessions = searchSessions({ siteId: req.params.id });
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch sessions for site" });
    }
  });
  return router;
}
function trackerAliasRoutes() {
  const router = express.Router();
  router.get("/tracker-aliases", (_req, res) => {
    try {
      const aliases = getTrackerAliases();
      res.json(aliases);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tracker aliases" });
    }
  });
  router.get("/tracker-aliases/by-tracker/:trackerId", (req, res) => {
    try {
      const alias = getTrackerAliasByTrackerId(req.params.trackerId);
      if (!alias) {
        return res.status(404).json({ error: "Alias not found for tracker" });
      }
      res.json(alias);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tracker alias" });
    }
  });
  router.get("/tracker-aliases/:id", (req, res) => {
    try {
      const alias = getTrackerAliasById(req.params.id);
      if (!alias) {
        return res.status(404).json({ error: "Tracker alias not found" });
      }
      res.json(alias);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tracker alias" });
    }
  });
  router.post("/tracker-aliases", (req, res) => {
    try {
      const aliasData = req.body;
      if (!aliasData.tracker_id) {
        return res.status(400).json({ error: "Missing required field: tracker_id" });
      }
      if (!aliasData.alias) {
        return res.status(400).json({ error: "Missing required field: alias" });
      }
      const alias = createTrackerAlias(aliasData);
      res.status(201).json(alias);
    } catch (error) {
      if (error instanceof Error && error.message.includes("already exists")) {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to create tracker alias" });
    }
  });
  router.put("/tracker-aliases/:id", (req, res) => {
    try {
      const updates = req.body;
      const alias = updateTrackerAlias(req.params.id, updates);
      if (!alias) {
        return res.status(404).json({ error: "Tracker alias not found" });
      }
      res.json(alias);
    } catch (error) {
      if (error instanceof Error && error.message.includes("already exists")) {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to update tracker alias" });
    }
  });
  router.delete("/tracker-aliases/:id", (req, res) => {
    try {
      const deleted = deleteTrackerAlias(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Tracker alias not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete tracker alias" });
    }
  });
  return router;
}
function comparisonRoutes() {
  const router = express.Router();
  router.get("/sessions/compare", (req, res) => {
    try {
      const idsParam = req.query.ids;
      if (!idsParam) {
        return res.status(400).json({ error: "ids query parameter required (comma-separated)" });
      }
      const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
      if (ids.length < 2) {
        return res.status(400).json({ error: "At least 2 session IDs required for comparison" });
      }
      const sessions = [];
      for (const id of ids) {
        const session = getTestSessionById(id);
        if (!session) {
          return res.status(404).json({ error: `Session ${id} not found` });
        }
        const site = session.site_id ? getSiteById(session.site_id) : null;
        const droneNames = [];
        for (const assignment of session.tracker_assignments || []) {
          const drone = getDroneProfileById(assignment.drone_profile_id);
          if (drone) {
            droneNames.push(`${drone.make} ${drone.model}`);
          }
        }
        const cuasNames = [];
        for (const placement of session.cuas_placements || []) {
          const cuas = getCUASProfileById(placement.cuas_profile_id);
          if (cuas) {
            cuasNames.push(cuas.name);
          }
        }
        sessions.push({
          session_id: session.id,
          name: session.name,
          status: session.status,
          site_name: site?.name || null,
          start_time: session.start_time || null,
          end_time: session.end_time || null,
          duration_seconds: session.duration_seconds || null,
          drone_names: droneNames,
          cuas_names: cuasNames,
          tracker_count: session.tracker_assignments?.length || 0,
          event_count: session.events?.length || 0,
          metrics: session.metrics || null,
          analysis_completed: session.analysis_completed
        });
      }
      const metricKeys = [
        "total_flight_time_s",
        "time_under_jamming_s",
        "time_to_effect_s",
        "time_to_full_denial_s",
        "recovery_time_s",
        "effective_range_m",
        "max_lateral_drift_m",
        "altitude_delta_m",
        "pass_fail"
      ];
      const comparison = {};
      for (const key of metricKeys) {
        comparison[key] = sessions.map((s) => {
          if (!s.metrics) return null;
          return s.metrics[key] ?? null;
        });
      }
      res.json({
        sessions,
        comparison,
        metric_keys: metricKeys
      });
    } catch (error) {
      log.error("Comparison error:", error);
      res.status(500).json({ error: "Failed to compare sessions" });
    }
  });
  return router;
}
const SEVEN_DAYS_S = 86400 * 7;
class CloudSyncBuffer {
  db = null;
  dbPath;
  constructor(dbPath) {
    if (dbPath) {
      this.dbPath = dbPath;
    } else {
      const cfgDir = process.env.LOCALAPPDATA ? path__namespace.join(process.env.LOCALAPPDATA, "SCENSUS") : path__namespace.join(os__namespace.homedir(), ".scensus");
      this.dbPath = path__namespace.join(cfgDir, "cloud_sync_buffer.db");
    }
  }
  /** Open the database and create tables if needed. */
  open() {
    const dir = path__namespace.dirname(this.dbPath);
    if (!fs__namespace.existsSync(dir)) {
      fs__namespace.mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(this.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS buffer (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payload TEXT NOT NULL,
        created_at REAL NOT NULL,
        retry_count INTEGER DEFAULT 0,
        last_retry_at REAL DEFAULT 0
      )
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_buffer_created
      ON buffer(created_at)
    `);
    log.info(`Cloud sync buffer opened: ${this.dbPath}`);
  }
  /** Close the database connection. */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
  /** Add records to the buffer. Returns count enqueued. */
  enqueue(records) {
    if (!this.db || records.length === 0) return 0;
    const now = Date.now() / 1e3;
    const insert = this.db.prepare(
      "INSERT INTO buffer (payload, created_at) VALUES (?, ?)"
    );
    const insertMany = this.db.transaction((recs) => {
      for (const rec of recs) {
        insert.run(JSON.stringify(rec), now);
      }
    });
    insertMany(records);
    return records.length;
  }
  /** Dequeue the oldest un-pushed records. */
  dequeue(batchSize = 100) {
    if (!this.db) return [];
    const rows = this.db.prepare("SELECT id, payload, retry_count FROM buffer ORDER BY id ASC LIMIT ?").all(batchSize);
    const results = [];
    for (const row of rows) {
      try {
        results.push({
          id: row.id,
          payload: JSON.parse(row.payload),
          retries: row.retry_count
        });
      } catch {
        log.warn(`Corrupt buffer row ${row.id}, removing`);
        this.db.prepare("DELETE FROM buffer WHERE id = ?").run(row.id);
      }
    }
    return results;
  }
  /** Remove successfully pushed records. */
  ack(ids) {
    if (!this.db || ids.length === 0) return;
    const placeholders = ids.map(() => "?").join(",");
    this.db.prepare(`DELETE FROM buffer WHERE id IN (${placeholders})`).run(...ids);
  }
  /** Mark records as failed (increment retry count). */
  nack(ids) {
    if (!this.db || ids.length === 0) return;
    const now = Date.now() / 1e3;
    const placeholders = ids.map(() => "?").join(",");
    this.db.prepare(
      `UPDATE buffer SET retry_count = retry_count + 1, last_retry_at = ? WHERE id IN (${placeholders})`
    ).run(now, ...ids);
  }
  /** Return number of records waiting to be pushed. */
  pendingCount() {
    if (!this.db) return 0;
    const row = this.db.prepare("SELECT COUNT(*) as cnt FROM buffer").get();
    return row.cnt;
  }
  /** Remove records older than maxAgeS (default: 7 days). Returns count removed. */
  purgeOld(maxAgeS = SEVEN_DAYS_S) {
    if (!this.db) return 0;
    const cutoff = Date.now() / 1e3 - maxAgeS;
    const result = this.db.prepare("DELETE FROM buffer WHERE created_at < ?").run(cutoff);
    return result.changes;
  }
}
const DEFAULT_CLOUD_SYNC_CONFIG = {
  enabled: false,
  cloud_url: "https://api.scensus.io",
  api_key: "",
  organization_id: "",
  push_interval_ms: 5e3,
  batch_size: 100,
  max_retry_attempts: 5
};
class CloudSyncManager {
  config;
  sqliteBuffer;
  pushTimer = null;
  consecutiveFailures = 0;
  lastPushAt = null;
  lastError = null;
  constructor() {
    this.config = { ...DEFAULT_CLOUD_SYNC_CONFIG };
    this.sqliteBuffer = new CloudSyncBuffer();
    this.loadConfig();
  }
  /** Load cloud sync config from disk. */
  loadConfig() {
    try {
      const cfgDir = process.env.LOCALAPPDATA ? path__namespace.join(process.env.LOCALAPPDATA, "SCENSUS") : path__namespace.join(os__namespace.homedir(), ".scensus");
      const cfgPath = path__namespace.join(cfgDir, "cloud_sync.json");
      if (fs__namespace.existsSync(cfgPath)) {
        const data = JSON.parse(fs__namespace.readFileSync(cfgPath, "utf-8"));
        this.config = { ...DEFAULT_CLOUD_SYNC_CONFIG, ...data };
      }
    } catch (e) {
      log.warn("Failed to load cloud sync config:", e);
    }
  }
  /** Save cloud sync config to disk. */
  saveConfig(updates) {
    this.config = { ...this.config, ...updates };
    try {
      const cfgDir = process.env.LOCALAPPDATA ? path__namespace.join(process.env.LOCALAPPDATA, "SCENSUS") : path__namespace.join(os__namespace.homedir(), ".scensus");
      if (!fs__namespace.existsSync(cfgDir)) {
        fs__namespace.mkdirSync(cfgDir, { recursive: true });
      }
      const cfgPath = path__namespace.join(cfgDir, "cloud_sync.json");
      fs__namespace.writeFileSync(cfgPath, JSON.stringify(this.config, null, 2), "utf-8");
    } catch (e) {
      log.error("Failed to save cloud sync config:", e);
    }
  }
  getConfig() {
    return { ...this.config };
  }
  /** Start the push loop. Opens SQLite buffer and re-queues crash survivors. */
  start() {
    if (!this.config.enabled || this.pushTimer) return;
    this.sqliteBuffer.open();
    const purged = this.sqliteBuffer.purgeOld();
    if (purged > 0) {
      log.info(`Cloud sync: purged ${purged} records older than 7 days`);
    }
    const pending = this.sqliteBuffer.pendingCount();
    if (pending > 0) {
      log.info(`Cloud sync: ${pending} records from prior session ready for push`);
    }
    log.info(`Cloud sync started → ${this.config.cloud_url}`);
    this.pushTimer = setInterval(() => this.pushBatch(), this.config.push_interval_ms);
  }
  /** Stop the push loop and close the buffer. */
  stop() {
    if (this.pushTimer) {
      clearInterval(this.pushTimer);
      this.pushTimer = null;
    }
    this.sqliteBuffer.close();
    log.info("Cloud sync stopped");
  }
  /** Enqueue tracker records for cloud push (persisted to SQLite). */
  enqueue(records) {
    if (!this.config.enabled) return;
    this.sqliteBuffer.enqueue(records);
  }
  /** Get current sync status. */
  getStatus() {
    return {
      enabled: this.config.enabled,
      connected: this.consecutiveFailures === 0 && this.lastPushAt !== null,
      pending_records: this.sqliteBuffer.pendingCount(),
      last_push_at: this.lastPushAt,
      last_error: this.lastError,
      consecutive_failures: this.consecutiveFailures
    };
  }
  /** Push a batch of records to the cloud. */
  async pushBatch() {
    const batch = this.sqliteBuffer.dequeue(this.config.batch_size);
    if (batch.length === 0) return;
    const ids = batch.map((b) => b.id);
    const records = batch.map((b) => b.payload);
    const success = await this.httpPush(records);
    if (success) {
      this.sqliteBuffer.ack(ids);
      this.consecutiveFailures = 0;
      this.lastPushAt = (/* @__PURE__ */ new Date()).toISOString();
      this.lastError = null;
      const remaining = this.sqliteBuffer.pendingCount();
      log.info(`Cloud sync: pushed ${batch.length} records (${remaining} remaining)`);
    } else {
      this.consecutiveFailures++;
      this.sqliteBuffer.nack(ids);
      const maxRetries = this.config.max_retry_attempts;
      const overRetried = batch.filter((b) => b.retries >= maxRetries);
      if (overRetried.length > 0) {
        const dropIds = overRetried.map((b) => b.id);
        this.sqliteBuffer.ack(dropIds);
        log.warn(`Cloud sync: dropping ${dropIds.length} records after ${maxRetries} retries`);
      }
    }
  }
  /** HTTP POST with HMAC signing. */
  async httpPush(records) {
    const urlPath = "/api/v2/telemetry/ingest";
    const url = this.config.cloud_url.replace(/\/+$/, "") + urlPath;
    const payload = JSON.stringify({
      organization_id: this.config.organization_id,
      records
    });
    const headers = {
      "Content-Type": "application/json",
      "X-Organization-ID": this.config.organization_id
    };
    if (this.config.api_key) {
      const timestamp = Math.floor(Date.now() / 1e3).toString();
      const bodyHash = crypto__namespace.createHash("sha256").update(payload).digest("hex");
      const message = `POST
${urlPath}
${timestamp}
${bodyHash}`;
      const signature = crypto__namespace.createHmac("sha256", this.config.api_key).update(message).digest("hex");
      headers["X-HMAC-Signature"] = signature;
      headers["X-HMAC-Timestamp"] = timestamp;
    }
    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: payload,
        signal: AbortSignal.timeout(3e4)
      });
      if (response.ok) {
        return true;
      }
      const text = await response.text().catch(() => "");
      this.lastError = `HTTP ${response.status}: ${text.substring(0, 200)}`;
      log.warn(`Cloud sync push failed: ${this.lastError}`);
      return false;
    } catch (e) {
      this.lastError = e.message || "Network error";
      log.warn(`Cloud sync push error: ${this.lastError}`);
      return false;
    }
  }
}
const cloudSyncManager = new CloudSyncManager();
function cloudSyncRoutes() {
  const router = express.Router();
  router.get("/cloud-sync/status", (_req, res) => {
    res.json(cloudSyncManager.getStatus());
  });
  router.get("/cloud-sync/config", (_req, res) => {
    const config = cloudSyncManager.getConfig();
    res.json({
      ...config,
      api_key: config.api_key ? "***" : ""
    });
  });
  router.put("/cloud-sync/config", (req, res) => {
    try {
      const updates = req.body;
      cloudSyncManager.saveConfig(updates);
      if ("enabled" in updates) {
        if (updates.enabled) {
          cloudSyncManager.start();
        } else {
          cloudSyncManager.stop();
        }
      }
      res.json({ success: true, config: cloudSyncManager.getConfig() });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  router.post("/cloud-sync/start", (_req, res) => {
    cloudSyncManager.saveConfig({ enabled: true });
    cloudSyncManager.start();
    res.json({ success: true, status: cloudSyncManager.getStatus() });
  });
  router.post("/cloud-sync/stop", (_req, res) => {
    cloudSyncManager.stop();
    cloudSyncManager.saveConfig({ enabled: false });
    res.json({ success: true, status: cloudSyncManager.getStatus() });
  });
  return router;
}
function getReconDir() {
  return path__namespace.join(electron.app.getPath("userData"), "site-recon");
}
function getSiteDir(siteId) {
  return path__namespace.join(getReconDir(), siteId);
}
function getMetaPath(siteId) {
  return path__namespace.join(getSiteDir(siteId), "meta.json");
}
function ensureDir(dirPath) {
  if (!fs__namespace.existsSync(dirPath)) {
    fs__namespace.mkdirSync(dirPath, { recursive: true });
  }
}
function getReconData(siteId) {
  const metaPath = getMetaPath(siteId);
  if (!fs__namespace.existsSync(metaPath)) return null;
  try {
    const raw = fs__namespace.readFileSync(metaPath, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    log.warn(`[site-recon] Failed to read meta for ${siteId}:`, err);
    return null;
  }
}
function saveReconImage(siteId, captureId, label, base64Data, cameraState) {
  const siteDir = getSiteDir(siteId);
  ensureDir(siteDir);
  const filename = `${captureId}.png`;
  const imagePath = path__namespace.join(siteDir, filename);
  const raw = base64Data.replace(/^data:image\/\w+;base64,/, "");
  fs__namespace.writeFileSync(imagePath, Buffer.from(raw, "base64"));
  const meta = {
    id: captureId,
    label,
    filename,
    cameraState,
    capturedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  let reconData = getReconData(siteId);
  if (!reconData) {
    reconData = {
      siteId,
      captures: [],
      capturedAt: (/* @__PURE__ */ new Date()).toISOString(),
      status: "captured"
    };
  }
  const existingIdx = reconData.captures.findIndex((c) => c.label === label);
  if (existingIdx >= 0) {
    reconData.captures[existingIdx] = meta;
  } else {
    reconData.captures.push(meta);
  }
  reconData.capturedAt = (/* @__PURE__ */ new Date()).toISOString();
  reconData.status = "captured";
  const metaPath = getMetaPath(siteId);
  const tmpPath = metaPath + ".tmp";
  fs__namespace.writeFileSync(tmpPath, JSON.stringify(reconData, null, 2));
  fs__namespace.renameSync(tmpPath, metaPath);
  log.info(`[site-recon] Saved ${label} for site ${siteId}`);
  return meta;
}
function getReconImagePath(siteId, captureId) {
  const reconData = getReconData(siteId);
  if (!reconData) return null;
  const capture = reconData.captures.find((c) => c.id === captureId);
  if (!capture) return null;
  const imgPath = path__namespace.join(getSiteDir(siteId), capture.filename);
  return fs__namespace.existsSync(imgPath) ? imgPath : null;
}
function deleteRecon(siteId) {
  const siteDir = getSiteDir(siteId);
  if (!fs__namespace.existsSync(siteDir)) return false;
  try {
    fs__namespace.rmSync(siteDir, { recursive: true, force: true });
    log.info(`[site-recon] Deleted recon data for site ${siteId}`);
    return true;
  } catch (err) {
    log.warn(`[site-recon] Failed to delete recon for ${siteId}:`, err);
    return false;
  }
}
function siteReconRoutes() {
  const router = express.Router();
  router.get("/site-recon/:siteId", (req, res) => {
    try {
      const data = getReconData(req.params.siteId);
      if (!data) {
        return res.json({ siteId: req.params.siteId, captures: [], status: "none" });
      }
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: "Failed to get recon data" });
    }
  });
  router.put("/site-recon/:siteId/image", (req, res) => {
    try {
      const { captureId, label, base64, cameraState } = req.body;
      if (!captureId || !label || !base64 || !cameraState) {
        return res.status(400).json({ error: "Missing captureId, label, base64, or cameraState" });
      }
      const meta = saveReconImage(req.params.siteId, captureId, label, base64, cameraState);
      res.json(meta);
    } catch (err) {
      res.status(500).json({ error: "Failed to save recon image" });
    }
  });
  router.get("/site-recon/:siteId/images/:captureId", (req, res) => {
    try {
      const imgPath = getReconImagePath(req.params.siteId, req.params.captureId);
      if (!imgPath) {
        return res.status(404).json({ error: "Image not found" });
      }
      res.sendFile(path__namespace.resolve(imgPath));
    } catch (err) {
      res.status(500).json({ error: "Failed to serve image" });
    }
  });
  router.delete("/site-recon/:siteId", (req, res) => {
    try {
      const deleted = deleteRecon(req.params.siteId);
      res.json({ deleted });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete recon data" });
    }
  });
  return router;
}
var IFFCategory = /* @__PURE__ */ ((IFFCategory2) => {
  IFFCategory2["BLUE"] = "BLUE";
  IFFCategory2["RED"] = "RED";
  IFFCategory2["YELLOW"] = "YELLOW";
  IFFCategory2["GRAY"] = "GRAY";
  return IFFCategory2;
})(IFFCategory || {});
const IFF_REGISTRY_FILE = "iff-registry.json";
function generateId() {
  return `iff-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
function getRegistryDir() {
  const userDataPath = electron.app?.getPath?.("userData") || process.env.HOME || ".";
  const registryDir = path__namespace.join(userDataPath, "ops");
  if (!fs__namespace.existsSync(registryDir)) {
    fs__namespace.mkdirSync(registryDir, { recursive: true });
    log.info(`Created ops directory: ${registryDir}`);
  }
  return registryDir;
}
function getRegistryPath() {
  return path__namespace.join(getRegistryDir(), IFF_REGISTRY_FILE);
}
function readRegistry() {
  const filePath = getRegistryPath();
  try {
    if (fs__namespace.existsSync(filePath)) {
      const data = fs__namespace.readFileSync(filePath, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    log.error("Error reading IFF registry:", error);
  }
  return [];
}
function writeRegistry(entries) {
  const filePath = getRegistryPath();
  const tempPath = `${filePath}.tmp`;
  try {
    fs__namespace.writeFileSync(tempPath, JSON.stringify(entries, null, 2), "utf-8");
    fs__namespace.renameSync(tempPath, filePath);
    log.info(`Saved IFF registry (${entries.length} entries)`);
  } catch (error) {
    log.error("Error writing IFF registry:", error);
    if (fs__namespace.existsSync(tempPath)) {
      fs__namespace.unlinkSync(tempPath);
    }
    throw error;
  }
}
class IFFRegistry {
  entries = [];
  loaded = false;
  /**
   * Ensure registry is loaded from disk
   */
  ensureLoaded() {
    if (!this.loaded) {
      this.entries = readRegistry();
      this.loaded = true;
      log.info(`IFF registry loaded: ${this.entries.length} entries`);
    }
  }
  /**
   * Reload registry from disk (useful if external changes occurred)
   */
  reload() {
    this.entries = readRegistry();
    this.loaded = true;
  }
  /**
   * Get all registry entries
   */
  getAll() {
    this.ensureLoaded();
    return [...this.entries];
  }
  /**
   * Get a single entry by its ID
   */
  getById(id) {
    this.ensureLoaded();
    return this.entries.find((e) => e.id === id);
  }
  /**
   * Get entry by tracker_id. Returns the first match.
   */
  getByTrackerId(trackerId) {
    this.ensureLoaded();
    return this.entries.find((e) => e.tracker_id === trackerId);
  }
  /**
   * Get all entries matching a given IFF category
   */
  getByCategory(category) {
    this.ensureLoaded();
    return this.entries.filter((e) => e.iff_category === category);
  }
  /**
   * Add a new entry to the registry
   */
  add(data) {
    this.ensureLoaded();
    const existing = this.entries.find((e) => e.tracker_id === data.tracker_id);
    if (existing) {
      throw new Error(`Registry entry already exists for tracker_id: ${data.tracker_id}`);
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const entry = {
      ...data,
      id: generateId(),
      created_at: now,
      updated_at: now
    };
    this.entries.push(entry);
    writeRegistry(this.entries);
    log.info(`IFF registry: added ${entry.callsign} (${entry.tracker_id}) as ${entry.iff_category}`);
    return entry;
  }
  /**
   * Update an existing entry
   */
  update(id, updates) {
    this.ensureLoaded();
    const index = this.entries.findIndex((e) => e.id === id);
    if (index === -1) {
      return void 0;
    }
    if (updates.tracker_id && updates.tracker_id !== this.entries[index].tracker_id) {
      const conflict = this.entries.find((e) => e.tracker_id === updates.tracker_id && e.id !== id);
      if (conflict) {
        throw new Error(`Registry entry already exists for tracker_id: ${updates.tracker_id}`);
      }
    }
    this.entries[index] = {
      ...this.entries[index],
      ...updates,
      id,
      // prevent ID change
      created_at: this.entries[index].created_at,
      // prevent created_at change
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    writeRegistry(this.entries);
    log.info(`IFF registry: updated ${this.entries[index].callsign} (${this.entries[index].tracker_id})`);
    return this.entries[index];
  }
  /**
   * Remove an entry by ID
   */
  remove(id) {
    this.ensureLoaded();
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => e.id !== id);
    if (this.entries.length === before) {
      return false;
    }
    writeRegistry(this.entries);
    log.info(`IFF registry: removed entry ${id}`);
    return true;
  }
  /**
   * Clear all entries (use with caution)
   */
  clear() {
    this.entries = [];
    writeRegistry(this.entries);
    log.info("IFF registry: cleared all entries");
  }
  /**
   * Get count of entries by category
   */
  getCategoryCounts() {
    this.ensureLoaded();
    const counts = {
      [
        "BLUE"
        /* BLUE */
      ]: 0,
      [
        "RED"
        /* RED */
      ]: 0,
      [
        "YELLOW"
        /* YELLOW */
      ]: 0,
      [
        "GRAY"
        /* GRAY */
      ]: 0
    };
    for (const entry of this.entries) {
      counts[entry.iff_category]++;
    }
    return counts;
  }
}
const iffRegistry = new IFFRegistry();
function iffRoutes() {
  const router = express.Router();
  router.get("/iff/registry", (_req, res) => {
    try {
      const entries = iffRegistry.getAll();
      res.json({
        entries,
        counts: iffRegistry.getCategoryCounts(),
        total: entries.length
      });
    } catch (error) {
      log.error("[IFF API] Failed to get registry:", error);
      res.status(500).json({ error: "Failed to fetch IFF registry" });
    }
  });
  router.post("/iff/registry", (req, res) => {
    try {
      const { tracker_id, iff_category, drone_type, callsign, notes, icon } = req.body;
      if (!tracker_id) {
        return res.status(400).json({ error: "Missing required field: tracker_id" });
      }
      if (!callsign) {
        return res.status(400).json({ error: "Missing required field: callsign" });
      }
      if (!iff_category || !Object.values(IFFCategory).includes(iff_category)) {
        return res.status(400).json({
          error: `Invalid iff_category. Must be one of: ${Object.values(IFFCategory).join(", ")}`
        });
      }
      const entry = iffRegistry.add({
        tracker_id,
        iff_category,
        drone_type: drone_type || "",
        callsign,
        notes: notes || "",
        icon
      });
      log.info(`[IFF API] Created registry entry: ${callsign} (${tracker_id})`);
      res.status(201).json(entry);
    } catch (error) {
      if (error.message?.includes("already exists")) {
        return res.status(409).json({ error: error.message });
      }
      log.error("[IFF API] Failed to create registry entry:", error);
      res.status(500).json({ error: "Failed to create registry entry" });
    }
  });
  router.put("/iff/registry/:id", (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      if (updates.iff_category && !Object.values(IFFCategory).includes(updates.iff_category)) {
        return res.status(400).json({
          error: `Invalid iff_category. Must be one of: ${Object.values(IFFCategory).join(", ")}`
        });
      }
      const entry = iffRegistry.update(id, updates);
      if (!entry) {
        return res.status(404).json({ error: "Registry entry not found" });
      }
      log.info(`[IFF API] Updated registry entry: ${entry.callsign} (${entry.tracker_id})`);
      res.json(entry);
    } catch (error) {
      if (error.message?.includes("already exists")) {
        return res.status(409).json({ error: error.message });
      }
      log.error("[IFF API] Failed to update registry entry:", error);
      res.status(500).json({ error: "Failed to update registry entry" });
    }
  });
  router.delete("/iff/registry/:id", (req, res) => {
    try {
      const { id } = req.params;
      const deleted = iffRegistry.remove(id);
      if (!deleted) {
        return res.status(404).json({ error: "Registry entry not found" });
      }
      log.info(`[IFF API] Deleted registry entry: ${id}`);
      res.json({ success: true });
    } catch (error) {
      log.error("[IFF API] Failed to delete registry entry:", error);
      res.status(500).json({ error: "Failed to delete registry entry" });
    }
  });
  router.get("/iff/category/:trackerId", (req, res) => {
    try {
      const { trackerId } = req.params;
      const entry = iffRegistry.getByTrackerId(trackerId);
      if (!entry) {
        return res.json({
          tracker_id: trackerId,
          iff_category: IFFCategory.YELLOW,
          in_registry: false,
          message: "Tracker not found in IFF registry, classified as UNKNOWN"
        });
      }
      res.json({
        tracker_id: trackerId,
        iff_category: entry.iff_category,
        callsign: entry.callsign,
        drone_type: entry.drone_type,
        in_registry: true,
        entry
      });
    } catch (error) {
      log.error("[IFF API] Failed to get IFF category:", error);
      res.status(500).json({ error: "Failed to get IFF category" });
    }
  });
  router.get("/iff/registry/:id", (req, res) => {
    try {
      const entry = iffRegistry.getById(req.params.id);
      if (!entry) {
        return res.status(404).json({ error: "Registry entry not found" });
      }
      res.json(entry);
    } catch (error) {
      log.error("[IFF API] Failed to get registry entry:", error);
      res.status(500).json({ error: "Failed to get registry entry" });
    }
  });
  router.get("/iff/stats", (_req, res) => {
    try {
      const counts = iffRegistry.getCategoryCounts();
      const all = iffRegistry.getAll();
      res.json({
        total: all.length,
        counts,
        last_updated: all.length > 0 ? all.reduce(
          (latest, e) => new Date(e.updated_at) > new Date(latest.updated_at) ? e : latest
        ).updated_at : null
      });
    } catch (error) {
      log.error("[IFF API] Failed to get stats:", error);
      res.status(500).json({ error: "Failed to get IFF stats" });
    }
  });
  return router;
}
const AFFILIATION_MAP = {
  "f": "friendly",
  "h": "hostile",
  "u": "unknown",
  "n": "neutral",
  "a": "other",
  // assumed friendly (pending)
  "j": "other",
  // joker
  "k": "other",
  // faker
  "o": "other",
  // none specified
  "p": "other",
  // pending
  "s": "other"
  // suspect
};
function extractAttr(xml, tagName, attrName) {
  const tagPattern = new RegExp(`<${tagName}[\\s][^>]*${attrName}\\s*=\\s*"([^"]*)"`, "i");
  const match = xml.match(tagPattern);
  return match ? match[1] : null;
}
function extractSelfClosingAttr(xml, tagName, attrName) {
  const tagPattern = new RegExp(`<${tagName}[\\s][^>]*${attrName}\\s*=\\s*"([^"]*)"[^>]*/?>`, "i");
  const match = xml.match(tagPattern);
  return match ? match[1] : null;
}
function extractElement(xml, tagName) {
  const selfClosing = new RegExp(`<${tagName}[^>]*/\\s*>`, "i");
  const selfMatch = xml.match(selfClosing);
  if (selfMatch) return selfMatch[0];
  const pattern = new RegExp(`<${tagName}[^>]*>[\\s\\S]*?</${tagName}>`, "i");
  const match = xml.match(pattern);
  return match ? match[0] : null;
}
function parseCotTime(timeStr) {
  if (!timeStr) return null;
  try {
    const d = new Date(timeStr);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}
function parseFloat2(value) {
  if (!value) return null;
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}
function parseCotXml(xml) {
  try {
    xml = xml.trim();
    if (!xml.startsWith("<event") && !xml.startsWith("<?xml")) {
      return null;
    }
    xml = xml.replace(/<\?xml[^?]*\?>\s*/, "");
    const uid = extractAttr(xml, "event", "uid");
    const type = extractAttr(xml, "event", "type");
    const time = extractAttr(xml, "event", "time");
    const start = extractAttr(xml, "event", "start");
    const stale = extractAttr(xml, "event", "stale");
    const how = extractAttr(xml, "event", "how");
    if (!uid || !type) {
      log.warn("[CoT] Missing required uid or type in event");
      return null;
    }
    const lat = parseFloat2(extractSelfClosingAttr(xml, "point", "lat"));
    const lon = parseFloat2(extractSelfClosingAttr(xml, "point", "lon"));
    const hae = parseFloat2(extractSelfClosingAttr(xml, "point", "hae"));
    const ce = parseFloat2(extractSelfClosingAttr(xml, "point", "ce"));
    const le = parseFloat2(extractSelfClosingAttr(xml, "point", "le"));
    if (lat === null || lon === null) {
      log.warn(`[CoT] Missing lat/lon in event uid=${uid}`);
      return null;
    }
    const course = parseFloat2(extractSelfClosingAttr(xml, "track", "course"));
    const speed = parseFloat2(extractSelfClosingAttr(xml, "track", "speed"));
    const detailRaw = extractElement(xml, "detail");
    const timestamp = parseCotTime(time) || (/* @__PURE__ */ new Date()).toISOString();
    return {
      uid,
      type,
      lat,
      lon,
      alt_m: hae,
      course_deg: course,
      speed_mps: speed,
      timestamp,
      start_time: parseCotTime(start),
      stale_time: parseCotTime(stale),
      how,
      detail_raw: detailRaw,
      ce,
      le,
      hae
    };
  } catch (error) {
    log.error("[CoT] Failed to parse XML:", error);
    return null;
  }
}
function parseCotBuffer(buffer) {
  const events2 = [];
  const eventPattern = /<event[\s\S]*?<\/event>/gi;
  let match;
  while ((match = eventPattern.exec(buffer)) !== null) {
    const event = parseCotXml(match[0]);
    if (event) {
      events2.push(event);
    }
  }
  return events2;
}
function getCotAffiliation(cotType) {
  if (!cotType) return "unknown";
  if (cotType.startsWith("a-")) {
    const parts = cotType.split("-");
    if (parts.length >= 2) {
      const affiliationCode = parts[1].toLowerCase();
      return AFFILIATION_MAP[affiliationCode] || "unknown";
    }
  }
  return "unknown";
}
const DEFAULT_CONFIG = {
  proximity_threshold_m: 50,
  position_staleness_s: 60
};
const EARTH_RADIUS_M$1 = 6371e3;
function toRad$1(deg) {
  return deg * Math.PI / 180;
}
function haversineDistanceM(lat1, lon1, lat2, lon2) {
  const dLat = toRad$1(lat2 - lat1);
  const dLon = toRad$1(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad$1(lat1)) * Math.cos(toRad$1(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M$1 * c;
}
const MAX_DETECTIONS = 1e3;
let detectionStore = [];
let detectionIdCounter = 0;
function generateDetectionId() {
  detectionIdCounter++;
  return `det-${Date.now()}-${detectionIdCounter}`;
}
function getRecentDetections(limit = 100) {
  return detectionStore.slice(-limit);
}
function getDetectionById(id) {
  return detectionStore.find((d) => d.id === id);
}
function updateDetectionClassification(id, iffCategory, notes) {
  const detection = detectionStore.find((d) => d.id === id);
  if (!detection) return void 0;
  detection.iff_category = iffCategory;
  detection.classification = {
    tracker_id: detection.tracker_id || "",
    iff_category: iffCategory,
    confidence: 1,
    matched_entry_id: null,
    reason: "Manual operator classification"
  };
  if (notes !== void 0) {
    detection.notes = notes;
  }
  log.info(`[Deconfliction] Detection ${id} manually classified as ${iffCategory}`);
  return detection;
}
function pushDetection(detection) {
  detectionStore.push(detection);
  if (detectionStore.length > MAX_DETECTIONS) {
    detectionStore = detectionStore.slice(-MAX_DETECTIONS);
  }
}
class DeconflictionEngine {
  config;
  alertCallback = null;
  knownPositions = /* @__PURE__ */ new Map();
  constructor(config) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  /**
   * Set the callback to receive deconfliction alerts.
   */
  setAlertCallback(callback) {
    this.alertCallback = callback;
  }
  /**
   * Update config values.
   */
  updateConfig(config) {
    this.config = { ...this.config, ...config };
  }
  /**
   * Feed a known blue tracker position for proximity correlation.
   * Should be called whenever a friendly tracker updates its position.
   */
  updateTrackerPosition(position) {
    this.knownPositions.set(position.tracker_id, position);
  }
  /**
   * Remove a tracker from the known positions map.
   */
  removeTrackerPosition(trackerId) {
    this.knownPositions.delete(trackerId);
  }
  /**
   * Process a CoT event through the deconfliction pipeline.
   * Returns the resulting Detection with IFF classification.
   */
  processCotEvent(event) {
    const classification = this.classify(event.uid, event.lat, event.lon, event.type);
    const detection = {
      id: generateDetectionId(),
      tracker_id: event.uid,
      lat: event.lat,
      lon: event.lon,
      alt_m: event.alt_m,
      speed_mps: event.speed_mps,
      course_deg: event.course_deg,
      timestamp: event.timestamp,
      source: "cot",
      iff_category: classification.iff_category,
      classification,
      raw_type: event.type,
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    pushDetection(detection);
    this.emitAlertIfNeeded(detection);
    return detection;
  }
  /**
   * Process a raw detection from any source (sensor, manual entry, etc.)
   */
  processDetection(params) {
    const classification = this.classify(
      params.tracker_id,
      params.lat,
      params.lon,
      params.raw_type || null
    );
    const detection = {
      id: generateDetectionId(),
      tracker_id: params.tracker_id,
      lat: params.lat,
      lon: params.lon,
      alt_m: params.alt_m ?? null,
      speed_mps: params.speed_mps ?? null,
      course_deg: params.course_deg ?? null,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      source: params.source,
      iff_category: classification.iff_category,
      classification,
      raw_type: params.raw_type,
      notes: params.notes,
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    pushDetection(detection);
    this.emitAlertIfNeeded(detection);
    return detection;
  }
  // ===========================================================================
  // Classification Logic
  // ===========================================================================
  /**
   * Core classification: check IFF registry, then CoT type, then proximity.
   */
  classify(trackerId, lat, lon, cotType) {
    if (trackerId) {
      const registryEntry = iffRegistry.getByTrackerId(trackerId);
      if (registryEntry) {
        return {
          tracker_id: trackerId,
          iff_category: registryEntry.iff_category,
          confidence: 1,
          matched_entry_id: registryEntry.id,
          reason: `Matched IFF registry entry: ${registryEntry.callsign} (${registryEntry.iff_category})`
        };
      }
    }
    if (cotType) {
      const affiliation = getCotAffiliation(cotType);
      const cotCategory = this.affiliationToIFF(affiliation);
      if (cotCategory !== IFFCategory.YELLOW) {
        return {
          tracker_id: trackerId || "",
          iff_category: cotCategory,
          confidence: 0.7,
          matched_entry_id: null,
          reason: `CoT type affiliation: ${cotType} -> ${affiliation}`
        };
      }
    }
    const proximityMatch = this.checkProximity(lat, lon);
    if (proximityMatch) {
      return {
        tracker_id: trackerId || "",
        iff_category: IFFCategory.BLUE,
        confidence: 0.6,
        matched_entry_id: null,
        reason: `Proximity match: within ${this.config.proximity_threshold_m}m of blue tracker ${proximityMatch.tracker_id}`
      };
    }
    return {
      tracker_id: trackerId || "",
      iff_category: IFFCategory.YELLOW,
      confidence: 0,
      matched_entry_id: null,
      reason: "No match found in registry, CoT type, or proximity. Classified as UNKNOWN."
    };
  }
  /**
   * Check if a position is within proximity_threshold_m of any known blue tracker.
   */
  checkProximity(lat, lon) {
    const now = Date.now();
    const stalenessMs = this.config.position_staleness_s * 1e3;
    const blueEntries = iffRegistry.getByCategory(IFFCategory.BLUE);
    const blueTrackerIds = new Set(blueEntries.map((e) => e.tracker_id));
    for (const [trackerId, position] of this.knownPositions) {
      if (!blueTrackerIds.has(trackerId)) continue;
      const posAge = now - new Date(position.timestamp).getTime();
      if (posAge > stalenessMs) continue;
      const distance = haversineDistanceM(lat, lon, position.lat, position.lon);
      if (distance <= this.config.proximity_threshold_m) {
        log.debug(
          `[Deconfliction] Proximity match: ${distance.toFixed(1)}m from blue tracker ${trackerId}`
        );
        return position;
      }
    }
    return null;
  }
  /**
   * Map CoT affiliation to IFF category.
   */
  affiliationToIFF(affiliation) {
    switch (affiliation) {
      case "friendly":
        return IFFCategory.BLUE;
      case "hostile":
        return IFFCategory.RED;
      case "neutral":
        return IFFCategory.GRAY;
      case "unknown":
      case "other":
      default:
        return IFFCategory.YELLOW;
    }
  }
  /**
   * Emit an alert if the detection warrants operator attention.
   */
  emitAlertIfNeeded(detection) {
    if (!this.alertCallback) return;
    let level = null;
    let message = "";
    switch (detection.iff_category) {
      case IFFCategory.RED:
        level = "critical";
        message = `HOSTILE contact detected: ${detection.tracker_id || "unknown"} at ${detection.lat.toFixed(5)}, ${detection.lon.toFixed(5)}`;
        break;
      case IFFCategory.YELLOW:
        level = "warning";
        message = `UNKNOWN contact detected: ${detection.tracker_id || "unidentified"} at ${detection.lat.toFixed(5)}, ${detection.lon.toFixed(5)}`;
        break;
      case IFFCategory.BLUE:
        if (detection.classification && detection.classification.confidence < 0.8) {
          level = "info";
          message = `Friendly contact (low confidence): ${detection.tracker_id || "unknown"} - ${detection.classification.reason}`;
        }
        break;
      case IFFCategory.GRAY:
        level = "info";
        message = `Neutral contact: ${detection.tracker_id || "unknown"} at ${detection.lat.toFixed(5)}, ${detection.lon.toFixed(5)}`;
        break;
    }
    if (level) {
      const alert = {
        id: `alert-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        detection_id: detection.id,
        tracker_id: detection.tracker_id,
        level,
        iff_category: detection.iff_category,
        message,
        lat: detection.lat,
        lon: detection.lon,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      };
      log.info(`[Deconfliction] Alert [${level}]: ${message}`);
      this.alertCallback(alert);
    }
  }
}
const deconflictionEngine = new DeconflictionEngine();
function detectionRoutes() {
  const router = express.Router();
  router.get("/detections", (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 100;
      const category = req.query.category;
      const source = req.query.source;
      let detections = getRecentDetections(Math.min(limit, 1e3));
      if (category && Object.values(IFFCategory).includes(category)) {
        detections = detections.filter((d) => d.iff_category === category);
      }
      if (source) {
        detections = detections.filter((d) => d.source === source);
      }
      const sorted = [...detections].reverse();
      res.json({
        detections: sorted,
        total: sorted.length,
        filters: {
          category: category || null,
          source: source || null,
          limit
        }
      });
    } catch (error) {
      log.error("[Detections API] Failed to get detections:", error);
      res.status(500).json({ error: "Failed to fetch detections" });
    }
  });
  router.get("/detections/:id", (req, res) => {
    try {
      const detection = getDetectionById(req.params.id);
      if (!detection) {
        return res.status(404).json({ error: "Detection not found" });
      }
      res.json(detection);
    } catch (error) {
      log.error("[Detections API] Failed to get detection:", error);
      res.status(500).json({ error: "Failed to fetch detection" });
    }
  });
  router.post("/detections/:id/classify", (req, res) => {
    try {
      const { id } = req.params;
      const { iff_category, notes } = req.body;
      if (!iff_category || !Object.values(IFFCategory).includes(iff_category)) {
        return res.status(400).json({
          error: `Invalid iff_category. Must be one of: ${Object.values(IFFCategory).join(", ")}`
        });
      }
      const detection = updateDetectionClassification(id, iff_category, notes);
      if (!detection) {
        return res.status(404).json({ error: "Detection not found" });
      }
      log.info(`[Detections API] Detection ${id} classified as ${iff_category}`);
      res.json(detection);
    } catch (error) {
      log.error("[Detections API] Failed to classify detection:", error);
      res.status(500).json({ error: "Failed to classify detection" });
    }
  });
  router.get("/detections/summary/stats", (_req, res) => {
    try {
      const detections = getRecentDetections(1e3);
      const byCat = {
        [IFFCategory.BLUE]: 0,
        [IFFCategory.RED]: 0,
        [IFFCategory.YELLOW]: 0,
        [IFFCategory.GRAY]: 0
      };
      const bySource = {};
      for (const d of detections) {
        byCat[d.iff_category] = (byCat[d.iff_category] || 0) + 1;
        bySource[d.source] = (bySource[d.source] || 0) + 1;
      }
      res.json({
        total: detections.length,
        by_category: byCat,
        by_source: bySource,
        oldest: detections.length > 0 ? detections[0].timestamp : null,
        newest: detections.length > 0 ? detections[detections.length - 1].timestamp : null
      });
    } catch (error) {
      log.error("[Detections API] Failed to get stats:", error);
      res.status(500).json({ error: "Failed to get detection stats" });
    }
  });
  return router;
}
const EARTH_RADIUS_M = 6371e3;
function toRad(deg) {
  return deg * Math.PI / 180;
}
function haversineDistance(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function analysisRoutes() {
  const router = express.Router();
  router.get("/sessions/:sessionId/range-timeline", (req, res) => {
    const { sessionId } = req.params;
    const cuasId = req.query.cuas_id;
    const trackerId = req.query.tracker_id;
    if (!cuasId || !trackerId) {
      return res.status(400).json({ error: "cuas_id and tracker_id are required" });
    }
    const session = getTestSessionById(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    const cuasPlacement = (session.cuas_placements || []).find(
      (p) => p.id === cuasId
    );
    if (!cuasPlacement) {
      return res.status(404).json({ error: "CUAS placement not found" });
    }
    const cuasLat = cuasPlacement.position?.lat ?? cuasPlacement.lat;
    const cuasLon = cuasPlacement.position?.lon ?? cuasPlacement.lon;
    if (cuasLat == null || cuasLon == null) {
      return res.status(400).json({ error: "CUAS placement has no position" });
    }
    let positionsByTracker;
    try {
      positionsByTracker = sessionDataCollector.getPositionsByTracker(sessionId);
    } catch {
      return res.status(404).json({ error: "No recorded data for this session" });
    }
    const trackerPositions = positionsByTracker.get(trackerId);
    if (!trackerPositions || trackerPositions.length === 0) {
      return res.json({ points: [], events: [] });
    }
    const points = trackerPositions.map((pos) => {
      const lat = pos.latitude ?? pos.lat;
      const lon = pos.longitude ?? pos.lon;
      const range = haversineDistance(cuasLat, cuasLon, lat, lon);
      const ts = pos.timestamp ? new Date(pos.timestamp).getTime() : pos.timestamp_ms || 0;
      return {
        timestamp_ms: ts,
        range_m: Math.round(range * 10) / 10,
        gps_quality: pos.gps_quality || "good",
        hdop: pos.hdop ?? 1,
        satellites: pos.satellites ?? 12
      };
    }).sort((a, b) => a.timestamp_ms - b.timestamp_ms);
    let events2 = [];
    try {
      const sessionEvents = sessionDataCollector.getSessionEvents(sessionId);
      events2 = sessionEvents.filter((e) => !e.trackerId || e.trackerId === trackerId).map((e) => ({
        timestamp_ms: new Date(e.timestamp).getTime(),
        type: e.type
      }));
    } catch {
    }
    return res.json({ points, events: events2 });
  });
  return router;
}
const PYTHON_BACKEND_PORT = 8083;
const PYTHON_BACKEND_URL = `http://127.0.0.1:${PYTHON_BACKEND_PORT}`;
let pythonAvailable = false;
let lastHealthCheck = 0;
const HEALTH_CHECK_INTERVAL_MS = 1e4;
async function checkPythonHealth() {
  const now = Date.now();
  if (now - lastHealthCheck < HEALTH_CHECK_INTERVAL_MS) {
    return pythonAvailable;
  }
  lastHealthCheck = now;
  try {
    const res = await fetch(`${PYTHON_BACKEND_URL}/api/v2/health`, {
      signal: AbortSignal.timeout(500)
    });
    pythonAvailable = res.ok;
  } catch {
    pythonAvailable = false;
  }
  return pythonAvailable;
}
function simplePythonProxy() {
  return async (req, res, next) => {
    if (!req.path.startsWith("/api/v2")) {
      return next();
    }
    const isAvailable = await checkPythonHealth();
    if (!isAvailable) {
      req.url = req.url.replace("/api/v2", "/api");
      req.originalUrl = req.originalUrl.replace("/api/v2", "/api");
      return next();
    }
    const url = `${PYTHON_BACKEND_URL}${req.originalUrl}`;
    try {
      const headers = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === "string") {
          headers[key] = value;
        }
      }
      delete headers["host"];
      const fetchOptions = {
        method: req.method,
        headers,
        signal: AbortSignal.timeout(3e3)
      };
      if (["POST", "PUT", "PATCH"].includes(req.method) && req.body) {
        fetchOptions.body = JSON.stringify(req.body);
      }
      const response = await fetch(url, fetchOptions);
      if (response.status === 404 || response.status === 502) {
        log.info(`[proxy] Python returned ${response.status} for ${req.path}, falling back to Express routes`);
        req.url = req.url.replace("/api/v2", "/api");
        req.originalUrl = req.originalUrl.replace("/api/v2", "/api");
        return next();
      }
      res.status(response.status);
      response.headers.forEach((value, key) => {
        if (!["transfer-encoding", "content-encoding", "content-length"].includes(key.toLowerCase())) {
          res.setHeader(key, value);
        }
      });
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        try {
          const data = await response.json();
          res.json(data);
        } catch (jsonErr) {
          log.warn(`[proxy] Malformed JSON from Python for ${req.path}`);
          const text = await response.text().catch(() => "");
          res.send(text);
        }
      } else if (contentType.includes("image/")) {
        const buffer = Buffer.from(await response.arrayBuffer());
        res.send(buffer);
      } else {
        const text = await response.text();
        res.send(text);
      }
    } catch (e) {
      log.info(`[proxy] Python backend unavailable for ${req.path} (${e.name}), falling back to Express routes`);
      pythonAvailable = false;
      req.url = req.url.replace("/api/v2", "/api");
      req.originalUrl = req.originalUrl.replace("/api/v2", "/api");
      next();
    }
  };
}
class CotListener {
  socket = null;
  running = false;
  options;
  callback;
  // Stats
  messagesReceived = 0;
  eventsParsed = 0;
  parseErrors = 0;
  bytesReceived = 0;
  startedAt = null;
  lastMessageAt = null;
  constructor(options, callback) {
    this.options = {
      port: options.port,
      bindAddress: options.bindAddress || "0.0.0.0",
      bufferSize: options.bufferSize || 65536,
      multicastGroup: options.multicastGroup
    };
    this.callback = callback;
  }
  /**
   * Start listening for CoT messages on the configured UDP port.
   */
  start() {
    return new Promise((resolve, reject) => {
      if (this.running) {
        log.warn("[CoT Listener] Already running");
        resolve();
        return;
      }
      try {
        this.socket = dgram__namespace.createSocket({
          type: "udp4",
          reuseAddr: true
        });
        this.socket.on("listening", () => {
          const address = this.socket.address();
          log.info(`[CoT Listener] Listening on ${address.address}:${address.port}`);
          try {
            this.socket.setRecvBufferSize(this.options.bufferSize);
          } catch (err) {
            log.warn("[CoT Listener] Could not set receive buffer size:", err);
          }
          if (this.options.multicastGroup) {
            try {
              this.socket.addMembership(this.options.multicastGroup);
              log.info(`[CoT Listener] Joined multicast group: ${this.options.multicastGroup}`);
            } catch (err) {
              log.error("[CoT Listener] Failed to join multicast group:", err);
            }
          }
          this.running = true;
          this.startedAt = (/* @__PURE__ */ new Date()).toISOString();
          this.resetStats();
          resolve();
        });
        this.socket.on("message", (msg, rinfo) => {
          this.handleMessage(msg, rinfo);
        });
        this.socket.on("error", (err) => {
          log.error(`[CoT Listener] Socket error:`, err);
          if (!this.running) {
            reject(err);
            return;
          }
          log.warn("[CoT Listener] Attempting to recover from error");
        });
        this.socket.on("close", () => {
          log.info("[CoT Listener] Socket closed");
          this.running = false;
        });
        this.socket.bind(this.options.port, this.options.bindAddress);
      } catch (err) {
        log.error("[CoT Listener] Failed to create socket:", err);
        reject(err);
      }
    });
  }
  /**
   * Stop the listener and close the socket.
   */
  stop() {
    return new Promise((resolve) => {
      if (!this.running || !this.socket) {
        this.running = false;
        resolve();
        return;
      }
      log.info("[CoT Listener] Stopping...");
      if (this.options.multicastGroup) {
        try {
          this.socket.dropMembership(this.options.multicastGroup);
        } catch {
        }
      }
      this.socket.close(() => {
        this.socket = null;
        this.running = false;
        log.info("[CoT Listener] Stopped");
        resolve();
      });
    });
  }
  /**
   * Check if the listener is currently running.
   */
  isRunning() {
    return this.running;
  }
  /**
   * Get listener statistics.
   */
  getStats() {
    return {
      running: this.running,
      port: this.options.port,
      bind_address: this.options.bindAddress,
      messages_received: this.messagesReceived,
      events_parsed: this.eventsParsed,
      parse_errors: this.parseErrors,
      bytes_received: this.bytesReceived,
      started_at: this.startedAt,
      last_message_at: this.lastMessageAt
    };
  }
  /**
   * Update the callback function.
   */
  setCallback(callback) {
    this.callback = callback;
  }
  /**
   * Update listen port. Requires restart.
   */
  getPort() {
    return this.options.port;
  }
  // ===========================================================================
  // Private
  // ===========================================================================
  handleMessage(msg, rinfo) {
    this.messagesReceived++;
    this.bytesReceived += msg.length;
    this.lastMessageAt = (/* @__PURE__ */ new Date()).toISOString();
    try {
      const xmlStr = msg.toString("utf-8");
      let events2 = [];
      const singleEvent = parseCotXml(xmlStr);
      if (singleEvent) {
        events2 = [singleEvent];
      } else {
        events2 = parseCotBuffer(xmlStr);
      }
      if (events2.length > 0) {
        this.eventsParsed += events2.length;
        log.debug(
          `[CoT Listener] Parsed ${events2.length} event(s) from ${rinfo.address}:${rinfo.port}`
        );
        this.callback(events2);
      } else {
        this.parseErrors++;
        log.warn(
          `[CoT Listener] No valid events parsed from ${rinfo.address}:${rinfo.port} (${msg.length} bytes)`
        );
      }
    } catch (error) {
      this.parseErrors++;
      log.error(
        `[CoT Listener] Error processing message from ${rinfo.address}:${rinfo.port}:`,
        error
      );
    }
  }
  resetStats() {
    this.messagesReceived = 0;
    this.eventsParsed = 0;
    this.parseErrors = 0;
    this.bytesReceived = 0;
    this.lastMessageAt = null;
  }
}
let cotListener = null;
let dashboardApp = null;
let httpServer = null;
function getDashboardApp() {
  if (!dashboardApp) throw new Error("DashboardApp not initialized");
  return dashboardApp;
}
async function startServer(port) {
  const app = express();
  app.use(cors({ origin: `http://127.0.0.1:${port}` }));
  app.use(express.json({ limit: "10mb" }));
  const server = http.createServer(app);
  httpServer = server;
  dashboardApp = new DashboardApp();
  setupWebSocket(server, dashboardApp);
  cotActorBridge.setBroadcast((msg) => {
    dashboardApp.broadcastMessage(msg);
  });
  app.use(sessionBridgeMiddleware());
  app.use(simplePythonProxy());
  app.use("/api", healthRoutes(dashboardApp));
  app.use("/api", configRoutes(dashboardApp));
  app.use("/api", trackerRoutes(dashboardApp));
  app.use("/api", sessionRoutes(dashboardApp));
  app.use("/api", replayRoutes(dashboardApp));
  app.use("/api", exportRoutes(dashboardApp));
  app.use("/api", uploadRoutes(dashboardApp));
  app.use("/api", siteRoutes());
  app.use("/api", droneProfileRoutes());
  app.use("/api", cuasProfileRoutes());
  app.use("/api", testSessionRoutes());
  app.use("/api", sdMergeRoutes());
  app.use("/api", reportsRoutes());
  app.use("/api", systemRoutes(dashboardApp));
  app.use("/api", trackerAliasRoutes());
  app.use("/api", crmRoutes());
  app.use("/api", comparisonRoutes());
  app.use("/api", cloudSyncRoutes());
  app.use("/api", siteReconRoutes());
  app.use("/api", analysisRoutes());
  app.use("/api", iffRoutes());
  app.use("/api", detectionRoutes());
  app.use("/", staticRoutes());
  const config = loadConfig();
  const bindHost = config.ops_mode ? config.ops_bind_host || "0.0.0.0" : "127.0.0.1";
  if (config.ops_mode) {
    app.use(cors({ origin: true }));
    log.info(`[Ops Mode] Enabled - binding to ${bindHost}, CORS opened for network access`);
  }
  return new Promise((resolve, reject) => {
    server.listen(port, bindHost, async () => {
      log.info(`Server listening on http://${bindHost}:${port}`);
      const pythonBackend = getPythonBackend({
        logRootFolder: config.log_root_folder
      });
      let pythonReady = false;
      try {
        pythonReady = await pythonBackend.start();
        log.info(pythonReady ? "[server] Python backend ready — /api/v2/* proxied" : "[server] Python backend not available — /api/v2/* will fall through to Express");
      } catch (err) {
        log.warn(`[server] Python backend start failed: ${err}`);
      }
      if (pythonReady) {
        try {
          await syncProfilesFromPython();
          log.info("[server] Profile sync from Python → Express complete");
        } catch (err) {
          log.warn(`[server] Profile sync failed (non-fatal): ${err}`);
        }
      }
      if (config.ops_mode && config.cot_enabled) {
        cotListener = new CotListener(
          {
            port: config.cot_listen_port,
            multicastGroup: config.cot_multicast_group
          },
          (events2) => {
            for (const event of events2) {
              deconflictionEngine.processCotEvent(event);
            }
            cotActorBridge.processCotEvents(events2);
          }
        );
        deconflictionEngine.updateConfig({
          proximity_threshold_m: config.iff_proximity_threshold_m
        });
        cotListener.start().then(() => {
          log.info(`[Ops Mode] CoT listener started on UDP port ${config.cot_listen_port}`);
        }).catch((err) => {
          log.warn(`[Ops Mode] CoT listener failed to start: ${err}`);
        });
      }
      try {
        await dashboardApp.startup();
        resolve();
      } catch (err) {
        reject(err);
      }
    });
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        log.error(`Port ${port} is already in use`);
        reject(new Error(
          `Port ${port} is already in use. Another instance may be running, or another application is using this port.`
        ));
      } else {
        reject(err);
      }
    });
  });
}
async function stopServer() {
  if (cotListener) {
    await cotListener.stop();
    cotListener = null;
  }
  try {
    const pythonBackend = getPythonBackend();
    if (pythonBackend.isRunning) {
      pythonBackend.stop();
    }
  } catch {
  }
  if (httpServer) {
    await new Promise((resolve) => {
      httpServer.close(() => resolve());
    });
    httpServer = null;
  }
}
function createWindow(serverPort) {
  const iconPath = process.platform === "darwin" ? path.join(__dirname, "../../resources/icon.icns") : path.join(__dirname, "../../resources/icon.ico");
  const win = new electron.BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false
  });
  win.once("ready-to-show", () => {
    win.show();
    if (process.env.NODE_ENV === "development" || !electron.app.isPackaged) {
      win.webContents.openDevTools();
    }
  });
  win.webContents.on("did-fail-load", (_event, errorCode, _errorDesc, _url, isMainFrame) => {
    if (isMainFrame && errorCode !== -3) {
      log.warn(`[window] Page load failed (code ${errorCode}), retrying in 1s...`);
      setTimeout(() => {
        if (!win.isDestroyed()) {
          win.loadURL(`http://127.0.0.1:${serverPort}/app/`);
        }
      }, 1e3);
    }
  });
  win.loadURL(`http://127.0.0.1:${serverPort}/app/`);
  win.on("close", (event) => {
    event.preventDefault();
    win.hide();
  });
  return win;
}
let tray = null;
function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
function setupTray(mainWindow2) {
  const iconPath = path.join(__dirname, "../../resources/tray-icon.png");
  const icon = electron.nativeImage.createFromPath(iconPath);
  tray = new electron.Tray(icon.isEmpty() ? electron.nativeImage.createEmpty() : icon);
  tray.setToolTip("SCENSUS Dashboard");
  const contextMenu = electron.Menu.buildFromTemplate([
    {
      label: "Show Dashboard",
      click: () => {
        mainWindow2.show();
        mainWindow2.focus();
      }
    },
    { type: "separator" },
    {
      label: "Status: Monitoring",
      enabled: false
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        mainWindow2.removeAllListeners("close");
        electron.app.quit();
      }
    }
  ]);
  tray.setContextMenu(contextMenu);
  tray.on("double-click", () => {
    mainWindow2.show();
    mainWindow2.focus();
  });
}
function setupMenu(mainWindow2) {
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "Open Folder...",
          accelerator: "CmdOrCtrl+O",
          click: async () => {
            const result = await electron.dialog.showOpenDialog(mainWindow2, {
              properties: ["openDirectory"],
              title: "Select Log Folder"
            });
            if (!result.canceled && result.filePaths.length > 0) {
              mainWindow2.webContents.send("folder-selected", result.filePaths[0]);
            }
          }
        },
        { type: "separator" },
        {
          label: "Settings",
          accelerator: "CmdOrCtrl+,",
          click: () => {
            mainWindow2.webContents.send("open-settings");
          }
        },
        { type: "separator" },
        {
          label: "Exit",
          accelerator: "Alt+F4",
          click: () => {
            mainWindow2.removeAllListeners("close");
            electron.app.quit();
          }
        }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About SCENSUS Dashboard",
          click: () => {
            electron.dialog.showMessageBox(mainWindow2, {
              type: "info",
              title: "About SCENSUS Dashboard",
              message: `SCENSUS Dashboard v${electron.app.getVersion()}`,
              detail: "Real-time UAS tracking and monitoring system."
            });
          }
        },
        {
          label: "Check for Updates",
          click: () => {
            mainWindow2.webContents.send("check-updates");
          }
        }
      ]
    }
  ];
  const menu = electron.Menu.buildFromTemplate(template);
  electron.Menu.setApplicationMenu(menu);
}
function setupIPC() {
  electron.ipcMain.handle("select-folder", async () => {
    const result = await electron.dialog.showOpenDialog({
      properties: ["openDirectory"],
      title: "Select Log Folder"
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });
  electron.ipcMain.handle("get-version", () => {
    return electron.app.getVersion();
  });
  electron.ipcMain.handle("get-app-path", () => {
    return electron.app.getPath("userData");
  });
}
function setupAutoUpdater(mainWindow2) {
  electronUpdater.autoUpdater.logger = log;
  electronUpdater.autoUpdater.on("checking-for-update", () => {
    log.info("Checking for updates...");
  });
  electronUpdater.autoUpdater.on("update-available", (info) => {
    log.info("Update available:", info.version);
    mainWindow2.webContents.send("update-available", info.version);
  });
  electronUpdater.autoUpdater.on("update-not-available", () => {
    log.info("No updates available");
  });
  electronUpdater.autoUpdater.on("download-progress", (progress) => {
    mainWindow2.webContents.send("update-progress", progress.percent);
  });
  electronUpdater.autoUpdater.on("update-downloaded", () => {
    log.info("Update downloaded");
    mainWindow2.webContents.send("update-ready");
  });
  electronUpdater.autoUpdater.on("error", (err) => {
    log.error("Update error:", err);
  });
  setTimeout(() => {
    electronUpdater.autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      log.warn("Auto-update check failed:", err.message);
    });
  }, 1e4);
}
log.transports.file.resolvePathFn = () => {
  const logDir = path.join(electron.app.getPath("userData"), "logs");
  return path.join(logDir, "main.log");
};
log.transports.file.maxSize = 5 * 1024 * 1024;
log.transports.console.level = false;
const SERVER_PORT = 8082;
let mainWindow = null;
const gotTheLock = electron.app.requestSingleInstanceLock();
if (!gotTheLock) {
  electron.dialog.showErrorBox(
    "Already Running",
    "Another instance of SCENSUS Dashboard is already running."
  );
  electron.app.quit();
}
electron.app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});
process.on("uncaughtException", (error) => {
  log.error("Uncaught exception:", error);
  if (error.code === "EPIPE" || error.message?.includes("EPIPE")) {
    log.info("EPIPE error ignored (client disconnected)");
    return;
  }
  electron.dialog.showErrorBox(
    "Unexpected Error",
    `An unexpected error occurred:

${error.message}

The application will continue running but may be unstable.`
  );
});
process.on("unhandledRejection", (reason) => {
  log.error("Unhandled rejection:", reason);
});
async function bootstrap() {
  await startServer(SERVER_PORT);
  mainWindow = createWindow(SERVER_PORT);
  setupTray(mainWindow);
  setupMenu(mainWindow);
  setupIPC();
  setupAutoUpdater(mainWindow);
}
electron.app.whenReady().then(async () => {
  try {
    await bootstrap();
  } catch (err) {
    log.error("Bootstrap failed:", err);
    electron.dialog.showErrorBox(
      "Startup Error",
      `Failed to start the application:

${err.message}`
    );
    electron.app.quit();
  }
});
electron.app.on("before-quit", async () => {
  log.info("Application quitting, cleaning up...");
  try {
    const dashApp = getDashboardApp();
    await dashApp.shutdown();
    await stopServer();
  } catch (e) {
    log.error("Error during shutdown:", e);
  }
  destroyTray();
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") ;
});
electron.app.on("activate", () => {
  if (mainWindow === null || mainWindow.isDestroyed()) {
    mainWindow = createWindow(SERVER_PORT);
  } else {
    mainWindow.show();
  }
});
