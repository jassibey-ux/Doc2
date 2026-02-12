/**
 * CUAS Icon SVG Definitions and Utilities
 * Provides equipment-specific icons for CUAS system visualization
 */

import type { CUASType } from '../types/workflow';

// SVG icon paths for each CUAS type (viewBox 0 0 32 32)
export const CUAS_ICON_SVGS: Record<CUASType, string> = {
  // Jammer - Tower with radiating waves and lightning bolt
  jammer: `
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Tower base -->
      <path d="M13 28L15 16H17L19 28H13Z" fill="currentColor"/>
      <!-- Tower body -->
      <rect x="14" y="12" width="4" height="4" rx="0.5" fill="currentColor"/>
      <!-- Radiating waves -->
      <path d="M8 8C8 8 10 4 16 4C22 4 24 8 24 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>
      <path d="M5 5C5 5 8 0 16 0C24 0 27 5 27 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.4"/>
      <!-- Lightning bolt -->
      <path d="M17 6L14 10H17L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `,

  // RF Sensor - Human silhouette with handheld device
  rf_sensor: `
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Human head -->
      <circle cx="12" cy="8" r="4" fill="currentColor"/>
      <!-- Human body -->
      <path d="M8 14H16L15 22H9L8 14Z" fill="currentColor"/>
      <!-- Legs -->
      <path d="M9 22L7 30M15 22L17 30" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <!-- Arm holding device -->
      <path d="M16 16L22 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <!-- Device -->
      <rect x="20" y="4" width="3" height="8" rx="1" fill="currentColor" transform="rotate(30 21.5 8)"/>
      <!-- Signal waves -->
      <path d="M26 4C26 4 28 6 28 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/>
      <path d="M28 2C28 2 31 5 31 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
    </svg>
  `,

  // Radar - Dish antenna on mast
  radar: `
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Tripod base -->
      <path d="M8 30L16 22L24 30" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <!-- Mast -->
      <rect x="14" y="14" width="4" height="10" fill="currentColor"/>
      <!-- Dish -->
      <path d="M4 10C4 10 8 2 16 2C24 2 28 10 28 10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
      <!-- Feed horn -->
      <circle cx="16" cy="8" r="3" fill="currentColor"/>
      <line x1="16" y1="8" x2="16" y2="14" stroke="currentColor" stroke-width="2"/>
    </svg>
  `,

  // EO/IR Camera - Camera on tripod
  eo_ir_camera: `
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Tripod -->
      <path d="M8 30L16 18L24 30" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <line x1="16" y1="18" x2="16" y2="12" stroke="currentColor" stroke-width="2"/>
      <!-- Camera body -->
      <rect x="8" y="4" width="16" height="10" rx="2" fill="currentColor"/>
      <!-- Lens -->
      <circle cx="16" cy="9" r="4" fill="none" stroke="white" stroke-width="1.5"/>
      <circle cx="16" cy="9" r="2" fill="white" opacity="0.5"/>
      <!-- IR indicator -->
      <circle cx="22" cy="6" r="1.5" fill="#ef4444"/>
    </svg>
  `,

  // Acoustic - Microphone array
  acoustic: `
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Pole -->
      <rect x="14" y="12" width="4" height="18" fill="currentColor"/>
      <!-- Microphone array mount -->
      <path d="M6 10H26" stroke="currentColor" stroke-width="2"/>
      <!-- Microphones -->
      <circle cx="6" cy="6" r="3" fill="currentColor"/>
      <circle cx="16" cy="4" r="3" fill="currentColor"/>
      <circle cx="26" cy="6" r="3" fill="currentColor"/>
      <!-- Connecting lines -->
      <line x1="6" y1="6" x2="6" y2="10" stroke="currentColor" stroke-width="1.5"/>
      <line x1="16" y1="4" x2="16" y2="10" stroke="currentColor" stroke-width="1.5"/>
      <line x1="26" y1="6" x2="26" y2="10" stroke="currentColor" stroke-width="1.5"/>
    </svg>
  `,

  // Combined - Multi-sensor tower
  combined: `
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Base tower -->
      <rect x="13" y="16" width="6" height="14" fill="currentColor"/>
      <!-- Tripod hint -->
      <path d="M10 30L16 28L22 30" stroke="currentColor" stroke-width="1.5"/>
      <!-- Radar dish (top) -->
      <path d="M6 6C6 6 9 2 16 2C23 2 26 6 26 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <!-- Antenna -->
      <circle cx="16" cy="4" r="2" fill="currentColor"/>
      <line x1="16" y1="4" x2="16" y2="8" stroke="currentColor" stroke-width="2"/>
      <!-- Camera module -->
      <rect x="10" y="8" width="12" height="6" rx="1" fill="currentColor"/>
      <circle cx="16" cy="11" r="2" fill="white" opacity="0.5"/>
      <!-- IR indicator -->
      <circle cx="20" cy="9" r="1" fill="#ef4444"/>
    </svg>
  `,
};

// Color mapping for CUAS types
export const CUAS_TYPE_COLORS: Record<CUASType, { primary: string; active: string; glow: string }> = {
  jammer: { primary: '#ef4444', active: '#f87171', glow: 'rgba(239, 68, 68, 0.6)' },
  rf_sensor: { primary: '#3b82f6', active: '#60a5fa', glow: 'rgba(59, 130, 246, 0.6)' },
  radar: { primary: '#22c55e', active: '#4ade80', glow: 'rgba(34, 197, 94, 0.6)' },
  eo_ir_camera: { primary: '#f97316', active: '#fb923c', glow: 'rgba(249, 115, 22, 0.6)' },
  acoustic: { primary: '#8b5cf6', active: '#a78bfa', glow: 'rgba(139, 92, 246, 0.6)' },
  combined: { primary: '#ec4899', active: '#f472b6', glow: 'rgba(236, 72, 153, 0.6)' },
};

// Default type if not specified
export const DEFAULT_CUAS_TYPE: CUASType = 'jammer';

/**
 * Get the color for a CUAS type based on its state
 */
export function getCUASColor(type: CUASType, isJamming: boolean = false): string {
  const colors = CUAS_TYPE_COLORS[type] || CUAS_TYPE_COLORS[DEFAULT_CUAS_TYPE];
  return isJamming ? colors.active : colors.primary;
}

/**
 * Generate complete SVG markup for a CUAS icon
 */
export function generateCUASIconSVG(
  type: CUASType,
  color: string,
  size: number = 32
): string {
  const svgTemplate = CUAS_ICON_SVGS[type] || CUAS_ICON_SVGS[DEFAULT_CUAS_TYPE];

  // Inject color and size
  return svgTemplate
    .replace('viewBox="0 0 32 32"', `viewBox="0 0 32 32" width="${size}" height="${size}"`)
    .replace(/currentColor/g, color);
}

/**
 * Create an HTML marker element for MapLibre
 */
export function createCUASMarkerElement(
  type: CUASType,
  name: string,
  orientation: number = 0,
  isJamming: boolean = false
): HTMLDivElement {
  const el = document.createElement('div');
  el.className = `cuas-marker-3d cuas-type-${type}`;

  if (isJamming) {
    el.classList.add('jamming');
  }

  const colors = CUAS_TYPE_COLORS[type] || CUAS_TYPE_COLORS[DEFAULT_CUAS_TYPE];
  const color = isJamming ? colors.active : colors.primary;

  // Icon container with rotation for directional equipment
  const iconContainer = document.createElement('div');
  iconContainer.className = 'cuas-icon-container-3d';
  iconContainer.style.transform = `rotate(${orientation}deg)`;
  iconContainer.style.color = color;
  iconContainer.style.borderColor = color;
  if (isJamming) {
    iconContainer.style.boxShadow = `0 0 15px ${colors.glow}`;
  }
  iconContainer.innerHTML = generateCUASIconSVG(type, color, 28);

  // Label below icon
  const label = document.createElement('div');
  label.className = 'cuas-label-3d';
  label.textContent = name;
  label.style.borderColor = color;

  el.appendChild(iconContainer);
  el.appendChild(label);

  return el;
}

/**
 * CSS styles for CUAS markers (to be injected or imported)
 */
export const CUAS_MARKER_STYLES = `
  .cuas-marker-3d {
    display: flex;
    flex-direction: column;
    align-items: center;
    cursor: pointer;
    transition: transform 0.2s ease;
    pointer-events: auto;
  }

  .cuas-marker-3d:hover {
    transform: scale(1.15);
  }

  .cuas-icon-container-3d {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(10, 10, 20, 0.9);
    border-radius: 50%;
    border: 2px solid currentColor;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
    transition: all 0.3s ease;
  }

  .cuas-marker-3d.jamming .cuas-icon-container-3d {
    animation: cuas-jamming-active 0.8s ease-in-out infinite;
    border: 3px solid #ef4444;
    background: rgba(239, 68, 68, 0.3);
  }

  .cuas-marker-3d.jamming .cuas-label-3d {
    background: rgba(239, 68, 68, 0.85);
    border-color: #ef4444;
    animation: cuas-label-pulse 0.8s ease-in-out infinite;
  }

  .cuas-label-3d {
    margin-top: 4px;
    font-size: 10px;
    font-weight: 600;
    color: #fff;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
    background: rgba(10, 10, 20, 0.85);
    padding: 2px 8px;
    border-radius: 4px;
    border: 1px solid;
    white-space: nowrap;
    max-width: 80px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @keyframes cuas-pulse {
    0%, 100% {
      transform: scale(1);
      box-shadow: 0 0 10px currentColor;
    }
    50% {
      transform: scale(1.1);
      box-shadow: 0 0 25px currentColor;
    }
  }

  @keyframes cuas-jamming-active {
    0%, 100% {
      transform: scale(1);
      box-shadow: 0 0 20px #ef4444, 0 0 40px rgba(239, 68, 68, 0.5);
      filter: brightness(1);
    }
    50% {
      transform: scale(1.15);
      box-shadow: 0 0 40px #ef4444, 0 0 80px rgba(239, 68, 68, 0.8);
      filter: brightness(1.3);
    }
  }

  @keyframes cuas-label-pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.7;
    }
  }
`;
