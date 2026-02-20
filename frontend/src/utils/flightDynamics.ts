/**
 * flightDynamics.ts — Shared pitch/roll computation for realistic drone flight
 * dynamics. Used by both Google Maps 3D and CesiumJS viewers.
 *
 * Pitch: derived from acceleration (speed delta). Nose tilts down when accelerating.
 * Roll: derived from heading change rate. Drone banks into turns.
 */

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum forward/backward pitch in degrees */
export const MAX_PITCH_DEG = 15;

/** Maximum bank roll in degrees */
export const MAX_ROLL_DEG = 25;

/** Pitch response factor: degrees of pitch per (m/s²) of acceleration */
export const PITCH_FACTOR = 3.0;

/** Roll response factor: degrees of roll per (deg/s) of heading change */
export const ROLL_FACTOR = 0.8;

/** Slight nose-down at cruise for realism (degrees) */
export const CRUISE_PITCH_DEG = -2.5;

/** Speed threshold below which drone is considered hovering (m/s) */
export const HOVER_SPEED_THRESHOLD = 0.5;

// ─── Core Functions ─────────────────────────────────────────────────────────

/**
 * Compute pitch in degrees based on speed change (acceleration).
 *
 * - Accelerating → nose-down (negative pitch)
 * - Decelerating → nose-up (positive pitch)
 * - Cruising → slight nose-down (CRUISE_PITCH_DEG)
 * - Hovering → level (0)
 *
 * @param currentSpeedMps Current speed in m/s
 * @param prevSpeedMps Previous speed in m/s
 * @param dtSeconds Time delta in seconds
 * @returns Pitch in degrees (negative = nose down)
 */
export function computePitch(
  currentSpeedMps: number,
  prevSpeedMps: number,
  dtSeconds: number,
): number {
  if (dtSeconds <= 0) return 0;

  // Hovering — level
  if (currentSpeedMps < HOVER_SPEED_THRESHOLD) return 0;

  const acceleration = (currentSpeedMps - prevSpeedMps) / dtSeconds;

  // Acceleration-based pitch (negative = nose down when accelerating)
  const accelPitch = -acceleration * PITCH_FACTOR;

  // Add cruise offset when at speed with minimal acceleration
  const isAccelerating = Math.abs(acceleration) > 0.3;
  const basePitch = isAccelerating ? accelPitch : CRUISE_PITCH_DEG;

  return clamp(basePitch, -MAX_PITCH_DEG, MAX_PITCH_DEG);
}

/**
 * Compute roll in degrees based on heading change rate (turn rate).
 *
 * - Turning right → positive roll (right bank)
 * - Turning left → negative roll (left bank)
 * - Straight flight → 0
 *
 * @param currentHeadingDeg Current heading in degrees (0-360)
 * @param prevHeadingDeg Previous heading in degrees (0-360)
 * @param dtSeconds Time delta in seconds
 * @returns Roll in degrees (positive = right bank)
 */
export function computeRoll(
  currentHeadingDeg: number,
  prevHeadingDeg: number,
  dtSeconds: number,
): number {
  if (dtSeconds <= 0) return 0;

  // Compute shortest heading delta (handles 359 → 1 wrap-around)
  let headingDelta = currentHeadingDeg - prevHeadingDeg;
  if (headingDelta > 180) headingDelta -= 360;
  if (headingDelta < -180) headingDelta += 360;

  const headingRateDegsPerSec = headingDelta / dtSeconds;
  const roll = headingRateDegsPerSec * ROLL_FACTOR;

  return clamp(roll, -MAX_ROLL_DEG, MAX_ROLL_DEG);
}

/**
 * Exponential smoothing helper — eases current value toward target.
 *
 * @param current Current smoothed value
 * @param target Target value
 * @param factor Smoothing factor (0-1). Higher = snappier, lower = smoother.
 * @returns New smoothed value
 */
export function smoothValue(current: number, target: number, factor: number): number {
  return current + (target - current) * factor;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
