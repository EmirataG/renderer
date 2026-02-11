/**
 * Border SVG string generation (no React).
 *
 * Ported from src/borders/index.tsx -- converts React JSX components
 * to vanilla SVG string generators. Produces identical SVG markup.
 *
 * JSX attribute conversions applied:
 *   strokeWidth -> stroke-width
 *   strokeLinecap -> stroke-linecap
 *   viewBox stays as-is
 */

export type BorderStyle =
  | 'none'
  | 'line'
  | 'double-line'
  | 'ornate-1'
  | 'ornate-2'
  | 'flourish';

/**
 * Get the height (in px) of a given border style.
 * Matches src/borders/index.tsx getBorderHeight exactly.
 */
export function getBorderHeight(style: BorderStyle): number {
  switch (style) {
    case 'line':
      return 8;
    case 'double-line':
      return 12;
    case 'ornate-1':
      return 28;
    case 'ornate-2':
      return 24;
    case 'flourish':
      return 36;
    default:
      return 0;
  }
}

// ---------------------------------------------------------------------------
// Individual border generators
// ---------------------------------------------------------------------------

function lineBorder(
  width: number,
  color: string,
  position: 'top' | 'bottom',
): string {
  const y = position === 'top' ? 6 : 2;
  return `<svg width="${width}" height="8" viewBox="0 0 ${width} 8" style="display:block"><line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="${color}" stroke-width="2"/></svg>`;
}

function doubleLineBorder(
  width: number,
  color: string,
  position: 'top' | 'bottom',
): string {
  const y1 = position === 'top' ? 4 : 2;
  const y2 = position === 'top' ? 10 : 8;
  return `<svg width="${width}" height="12" viewBox="0 0 ${width} 12" style="display:block"><line x1="0" y1="${y1}" x2="${width}" y2="${y1}" stroke="${color}" stroke-width="1.5"/><line x1="0" y1="${y2}" x2="${width}" y2="${y2}" stroke="${color}" stroke-width="1.5"/></svg>`;
}

function ornateBorder1(
  width: number,
  color: string,
  position: 'top' | 'bottom',
): string {
  const height = 28;
  const mid = width / 2;
  const flip = position === 'bottom' ? -1 : 1;
  const yBase = position === 'top' ? height - 2 : 2;

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="display:block">`
    // Baseline
    + `<line x1="0" y1="${yBase}" x2="${width}" y2="${yBase}" stroke="${color}" stroke-width="1.5"/>`
    // Left curved bracket
    + `<path d="M 30,${yBase} Q 30,${yBase - flip * 14} 70,${yBase - flip * 14}" fill="none" stroke="${color}" stroke-width="1.5"/>`
    // Decorative line to center
    + `<line x1="70" y1="${yBase - flip * 14}" x2="${mid - 25}" y2="${yBase - flip * 14}" stroke="${color}" stroke-width="1.5"/>`
    // Center diamond ornament
    + `<path d="M ${mid},${yBase - flip * 6} L ${mid - 7},${yBase - flip * 14} L ${mid},${yBase - flip * 22} L ${mid + 7},${yBase - flip * 14} Z" fill="${color}"/>`
    // Decorative line from center
    + `<line x1="${mid + 25}" y1="${yBase - flip * 14}" x2="${width - 70}" y2="${yBase - flip * 14}" stroke="${color}" stroke-width="1.5"/>`
    // Right curved bracket
    + `<path d="M ${width - 70},${yBase - flip * 14} Q ${width - 30},${yBase - flip * 14} ${width - 30},${yBase}" fill="none" stroke="${color}" stroke-width="1.5"/>`
    + `</svg>`;
}

function ornateBorder2(
  width: number,
  color: string,
  position: 'top' | 'bottom',
): string {
  const height = 24;
  const flip = position === 'bottom' ? -1 : 1;
  const yBase = position === 'top' ? height - 2 : 2;
  const yWave = yBase - flip * 10;

  // Generate wave pattern
  const waveSegments = Math.floor(width / 50);
  let wavePath = `M 20,${yWave}`;
  for (let i = 0; i < waveSegments; i++) {
    const x0 = 20 + i * 50;
    const x1 = x0 + 12;
    const x2 = x0 + 25;
    const x3 = x0 + 38;
    const x4 = x0 + 50;
    wavePath += ` Q ${x1},${yWave - flip * 6} ${x2},${yWave}`;
    wavePath += ` Q ${x3},${yWave + flip * 6} ${x4},${yWave}`;
  }

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="display:block">`
    // Baseline
    + `<line x1="0" y1="${yBase}" x2="${width}" y2="${yBase}" stroke="${color}" stroke-width="1.5"/>`
    // Wave pattern
    + `<path d="${wavePath}" fill="none" stroke="${color}" stroke-width="1.5"/>`
    // Decorative dots at wave endpoints
    + `<circle cx="20" cy="${yWave}" r="3" fill="${color}"/>`
    + `<circle cx="${width - 20}" cy="${yWave}" r="3" fill="${color}"/>`
    // Small connecting lines from baseline to wave
    + `<line x1="20" y1="${yBase}" x2="20" y2="${yWave}" stroke="${color}" stroke-width="1"/>`
    + `<line x1="${width - 20}" y1="${yBase}" x2="${width - 20}" y2="${yWave}" stroke="${color}" stroke-width="1"/>`
    + `</svg>`;
}

function flourishBorder(
  width: number,
  color: string,
  position: 'top' | 'bottom',
): string {
  const height = 36;
  const mid = width / 2;
  const flip = position === 'bottom' ? -1 : 1;
  const yBase = position === 'top' ? height - 2 : 2;

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="display:block">`
    // Baseline
    + `<line x1="0" y1="${yBase}" x2="${width}" y2="${yBase}" stroke="${color}" stroke-width="1.5"/>`
    // Left flourish
    + `<path d="M 15,${yBase} C 25,${yBase - flip * 8} 35,${yBase - flip * 18} 55,${yBase - flip * 18} S 75,${yBase - flip * 10} 95,${yBase - flip * 16} Q 115,${yBase - flip * 20} ${mid - 35},${yBase - flip * 18}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>`
    // Center ornament - elegant oval with inner dot
    + `<ellipse cx="${mid}" cy="${yBase - flip * 18}" rx="14" ry="9" fill="none" stroke="${color}" stroke-width="1.5"/>`
    + `<ellipse cx="${mid}" cy="${yBase - flip * 18}" rx="6" ry="4" fill="${color}"/>`
    // Right flourish (mirror)
    + `<path d="M ${width - 15},${yBase} C ${width - 25},${yBase - flip * 8} ${width - 35},${yBase - flip * 18} ${width - 55},${yBase - flip * 18} S ${width - 75},${yBase - flip * 10} ${width - 95},${yBase - flip * 16} Q ${width - 115},${yBase - flip * 20} ${mid + 35},${yBase - flip * 18}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>`
    // Small decorative dots where flourishes meet baseline
    + `<circle cx="15" cy="${yBase}" r="2.5" fill="${color}"/>`
    + `<circle cx="${width - 15}" cy="${yBase}" r="2.5" fill="${color}"/>`
    + `</svg>`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate border SVG markup as an HTML string.
 * Returns empty string for 'none' style.
 *
 * @param style - Border style name
 * @param width - SVG width in px
 * @param color - Stroke/fill color (hex or rgb string)
 * @param position - 'top' or 'bottom' (affects vertical direction)
 */
export function generateBorderSvg(
  style: BorderStyle,
  width: number,
  color: string,
  position: 'top' | 'bottom',
): string {
  switch (style) {
    case 'none':
      return '';
    case 'line':
      return lineBorder(width, color, position);
    case 'double-line':
      return doubleLineBorder(width, color, position);
    case 'ornate-1':
      return ornateBorder1(width, color, position);
    case 'ornate-2':
      return ornateBorder2(width, color, position);
    case 'flourish':
      return flourishBorder(width, color, position);
    default:
      return '';
  }
}
