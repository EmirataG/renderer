/**
 * Border SVG string generation.
 * Ported from export-service/src/standalone/borders.ts
 */

export type BorderStyle = 'none' | 'line' | 'double-line' | 'ornate-1' | 'ornate-2' | 'flourish';

export function getBorderHeight(style: BorderStyle): number {
  switch (style) {
    case 'line': return 8;
    case 'double-line': return 12;
    case 'ornate-1': return 28;
    case 'ornate-2': return 24;
    case 'flourish': return 36;
    default: return 0;
  }
}

function lineBorder(w: number, c: string, pos: 'top' | 'bottom'): string {
  const y = pos === 'top' ? 6 : 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="8" viewBox="0 0 ${w} 8"><line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="${c}" stroke-width="2"/></svg>`;
}

function doubleLineBorder(w: number, c: string, pos: 'top' | 'bottom'): string {
  const y1 = pos === 'top' ? 4 : 2;
  const y2 = pos === 'top' ? 10 : 8;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="12" viewBox="0 0 ${w} 12"><line x1="0" y1="${y1}" x2="${w}" y2="${y1}" stroke="${c}" stroke-width="1.5"/><line x1="0" y1="${y2}" x2="${w}" y2="${y2}" stroke="${c}" stroke-width="1.5"/></svg>`;
}

function ornateBorder1(w: number, c: string, pos: 'top' | 'bottom'): string {
  const h = 28, mid = w / 2;
  const flip = pos === 'bottom' ? -1 : 1;
  const yBase = pos === 'top' ? h - 2 : 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
    + `<line x1="0" y1="${yBase}" x2="${w}" y2="${yBase}" stroke="${c}" stroke-width="1.5"/>`
    + `<path d="M 30,${yBase} Q 30,${yBase - flip * 14} 70,${yBase - flip * 14}" fill="none" stroke="${c}" stroke-width="1.5"/>`
    + `<line x1="70" y1="${yBase - flip * 14}" x2="${mid - 25}" y2="${yBase - flip * 14}" stroke="${c}" stroke-width="1.5"/>`
    + `<path d="M ${mid},${yBase - flip * 6} L ${mid - 7},${yBase - flip * 14} L ${mid},${yBase - flip * 22} L ${mid + 7},${yBase - flip * 14} Z" fill="${c}"/>`
    + `<line x1="${mid + 25}" y1="${yBase - flip * 14}" x2="${w - 70}" y2="${yBase - flip * 14}" stroke="${c}" stroke-width="1.5"/>`
    + `<path d="M ${w - 70},${yBase - flip * 14} Q ${w - 30},${yBase - flip * 14} ${w - 30},${yBase}" fill="none" stroke="${c}" stroke-width="1.5"/>`
    + `</svg>`;
}

function ornateBorder2(w: number, c: string, pos: 'top' | 'bottom'): string {
  const h = 24;
  const flip = pos === 'bottom' ? -1 : 1;
  const yBase = pos === 'top' ? h - 2 : 2;
  const yWave = yBase - flip * 10;
  const segs = Math.floor(w / 50);
  let wavePath = `M 20,${yWave}`;
  for (let i = 0; i < segs; i++) {
    const x0 = 20 + i * 50;
    wavePath += ` Q ${x0 + 12},${yWave - flip * 6} ${x0 + 25},${yWave}`;
    wavePath += ` Q ${x0 + 38},${yWave + flip * 6} ${x0 + 50},${yWave}`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
    + `<line x1="0" y1="${yBase}" x2="${w}" y2="${yBase}" stroke="${c}" stroke-width="1.5"/>`
    + `<path d="${wavePath}" fill="none" stroke="${c}" stroke-width="1.5"/>`
    + `<circle cx="20" cy="${yWave}" r="3" fill="${c}"/>`
    + `<circle cx="${w - 20}" cy="${yWave}" r="3" fill="${c}"/>`
    + `<line x1="20" y1="${yBase}" x2="20" y2="${yWave}" stroke="${c}" stroke-width="1"/>`
    + `<line x1="${w - 20}" y1="${yBase}" x2="${w - 20}" y2="${yWave}" stroke="${c}" stroke-width="1"/>`
    + `</svg>`;
}

function flourishBorder(w: number, c: string, pos: 'top' | 'bottom'): string {
  const h = 36, mid = w / 2;
  const flip = pos === 'bottom' ? -1 : 1;
  const yBase = pos === 'top' ? h - 2 : 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
    + `<line x1="0" y1="${yBase}" x2="${w}" y2="${yBase}" stroke="${c}" stroke-width="1.5"/>`
    + `<path d="M 15,${yBase} C 25,${yBase - flip * 8} 35,${yBase - flip * 18} 55,${yBase - flip * 18} S 75,${yBase - flip * 10} 95,${yBase - flip * 16} Q 115,${yBase - flip * 20} ${mid - 35},${yBase - flip * 18}" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/>`
    + `<ellipse cx="${mid}" cy="${yBase - flip * 18}" rx="14" ry="9" fill="none" stroke="${c}" stroke-width="1.5"/>`
    + `<ellipse cx="${mid}" cy="${yBase - flip * 18}" rx="6" ry="4" fill="${c}"/>`
    + `<path d="M ${w - 15},${yBase} C ${w - 25},${yBase - flip * 8} ${w - 35},${yBase - flip * 18} ${w - 55},${yBase - flip * 18} S ${w - 75},${yBase - flip * 10} ${w - 95},${yBase - flip * 16} Q ${w - 115},${yBase - flip * 20} ${mid + 35},${yBase - flip * 18}" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round"/>`
    + `<circle cx="15" cy="${yBase}" r="2.5" fill="${c}"/>`
    + `<circle cx="${w - 15}" cy="${yBase}" r="2.5" fill="${c}"/>`
    + `</svg>`;
}

export function generateBorderSvg(
  style: BorderStyle, width: number, color: string, position: 'top' | 'bottom',
): string {
  switch (style) {
    case 'line': return lineBorder(width, color, position);
    case 'double-line': return doubleLineBorder(width, color, position);
    case 'ornate-1': return ornateBorder1(width, color, position);
    case 'ornate-2': return ornateBorder2(width, color, position);
    case 'flourish': return flourishBorder(width, color, position);
    default: return '';
  }
}
