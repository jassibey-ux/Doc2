/**
 * SVG data URI generators for Cesium billboard markers.
 * Extracted from CesiumMap.tsx and Site3DViewer.tsx.
 */

/** Ellipse marker for drones */
export function createDroneDataUri(color: string, isSelected: boolean): string {
  const strokeColor = isSelected ? '#fff' : '#000';
  const strokeWidth = isSelected ? 3 : 1.5;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <ellipse cx="12" cy="12" rx="10" ry="6" fill="${color}" stroke="${strokeColor}" stroke-width="${strokeWidth}" opacity="0.9"/>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/** Circle with "J" marker for CUAS systems */
export function createCUASDataUri(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
    <circle cx="14" cy="14" r="12" fill="${color}" stroke="#000" stroke-width="2" opacity="0.9"/>
    <text x="14" y="19" text-anchor="middle" fill="#fff" font-size="14" font-weight="bold">J</text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}
