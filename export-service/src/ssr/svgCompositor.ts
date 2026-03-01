/**
 * Composite SVG builder for server-side rendering.
 *
 * Builds a single SVG document per frame that combines all visual layers:
 * - Background image
 * - Score color CSS
 * - Scale wrapper (maps editor coordinates to viewport)
 * - Rotation + positioning of the score region
 * - Clipped score area with camera tracking
 * - SVG-to-editor scale transform (maps Verovio coords to editor coords)
 * - Vertically stacked score pages (as nested SVGs)
 * - Top and bottom border SVGs
 *
 * The composite SVG is self-contained and ready for rasterization by resvg-js.
 */

import { generateBorderSvg, getBorderHeight, type BorderStyle } from '../standalone/borders.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompositorConfig {
  /** Viewport width in pixels (output image width) */
  viewportWidth: number;
  /** Viewport height in pixels (output image height) */
  viewportHeight: number;
  /** Scale factor: viewportWidth / editorWidth */
  scaleFactor: number;
  /** Editor-space container width */
  containerWidth: number;
  /** Editor-space container height */
  containerHeight: number;
  /** Score region dimensions (null = full container) */
  scoreRegion: { x: number; y: number; width: number; height: number; rotation?: number } | null;
  /** Score color (hex) */
  scoreColor: string;
  /** Whether to hide instrument labels */
  hideLabels: boolean;
  /** Border style */
  borderStyle: BorderStyle;
  /** Background image data URL (null = no background) */
  bgUrl: string | null;
  /**
   * Ratio to scale pages from Verovio SVG coordinates to editor coordinates.
   * = regionWidth / svgViewBoxWidth (e.g., 980 / 2450 = 0.4)
   * In the browser, SVGs auto-scale to their container. In the composite
   * SVG, we apply this as an explicit transform.
   */
  svgScaleRatio: number;
}

export interface PageInfo {
  /** Serialized SVG string of the page (after animation modifications) */
  svgString: string;
  /** Page viewBox height (in SVG/Verovio coordinate units) */
  viewBoxHeight: number;
  /** Cumulative Y offset in SVG coordinates (sum of previous viewBox heights) */
  yOffset: number;
  /** Page viewBox width (in SVG/Verovio coordinate units) */
  viewBoxWidth: number;
  /** Full viewBox string "x y w h" */
  viewBox: string;
}

// ---------------------------------------------------------------------------
// Score color CSS
// ---------------------------------------------------------------------------

function buildScoreColorCss(scoreColor: string, hideLabels: boolean): string {
  return `
    .preview-score path,
    .preview-score rect,
    .preview-score polygon,
    .preview-score ellipse,
    .preview-score use {
      fill: ${scoreColor};
    }
    .preview-score text {
      fill: ${scoreColor};
    }
    .preview-score g.staff > path {
      fill: none !important;
      stroke: ${scoreColor} !important;
      shape-rendering: crispEdges !important;
    }
    ${hideLabels ? '.preview-score .label, .preview-score .labelAbbr { display: none !important; }' : ''}
  `;
}

// ---------------------------------------------------------------------------
// SVG extraction helpers
// ---------------------------------------------------------------------------

const SVG_OPEN_RE = /^<svg[^>]*>/;
const SVG_CLOSE_RE = /<\/svg>\s*$/;

/**
 * Extract the inner content of an SVG string (everything between the
 * root <svg> opening and closing tags).
 */
function extractSvgInnerContent(svgString: string): string {
  return svgString
    .replace(SVG_OPEN_RE, '')
    .replace(SVG_CLOSE_RE, '');
}

/**
 * Remove `style="display:block"` from border SVG strings.
 * This CSS property is for HTML layout and not needed in SVG embedding.
 */
function cleanBorderSvg(borderSvg: string): string {
  return borderSvg.replace(/\s*style="display:block"/, '');
}

// ---------------------------------------------------------------------------
// Composite builder
// ---------------------------------------------------------------------------

/**
 * Build a complete composite SVG string for a single frame.
 *
 * @param config - Static compositor configuration (set once per job)
 * @param pages - Per-frame page info (SVG strings may have animation modifications)
 * @param cameraY - Current camera Y offset in SVG coordinates (from animation state)
 * @returns Complete SVG string ready for rasterization
 */
export function buildCompositeSvg(
  config: CompositorConfig,
  pages: PageInfo[],
  cameraY: number,
): string {
  const {
    viewportWidth: vpW,
    viewportHeight: vpH,
    scaleFactor,
    scoreRegion,
    scoreColor,
    hideLabels,
    borderStyle,
    bgUrl,
    svgScaleRatio,
  } = config;

  const regionW = scoreRegion?.width ?? config.containerWidth;
  const regionH = scoreRegion?.height ?? config.containerHeight;
  const regionX = scoreRegion?.x ?? 0;
  const regionY = scoreRegion?.y ?? 0;
  const rotation = scoreRegion?.rotation ?? 0;

  // Build border SVGs
  const borderHeight = getBorderHeight(borderStyle);
  const topBorderSvg = borderStyle !== 'none'
    ? cleanBorderSvg(generateBorderSvg(borderStyle, regionW, scoreColor, 'top'))
    : '';
  const bottomBorderSvg = borderStyle !== 'none'
    ? cleanBorderSvg(generateBorderSvg(borderStyle, regionW, scoreColor, 'bottom'))
    : '';

  // Build page SVGs as nested <svg> elements stacked vertically.
  // Pages use their viewBox dimensions (Verovio coordinate space).
  // The svgScaleRatio transform (below) maps these to editor space.
  const pagesSvg = pages.map((page) => {
    const innerContent = extractSvgInnerContent(page.svgString);
    return `<svg x="0" y="${page.yOffset}" width="${page.viewBoxWidth}" height="${page.viewBoxHeight}" viewBox="${page.viewBox}" xmlns="http://www.w3.org/2000/svg">${innerContent}</svg>`;
  }).join('\n');

  // Rotation transform string
  const rotationTransform = rotation !== 0
    ? ` rotate(${rotation}, ${regionW / 2}, ${regionH / 2})`
    : '';

  // Assemble composite SVG
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${vpW}" height="${vpH}" viewBox="0 0 ${vpW} ${vpH}">`,
  ];

  // Background image
  if (bgUrl) {
    parts.push(
      `<image href="${bgUrl}" width="${vpW}" height="${vpH}" preserveAspectRatio="xMidYMid slice"/>`,
    );
  }

  // Score color CSS
  parts.push(`<style>${buildScoreColorCss(scoreColor, hideLabels)}</style>`);

  // Scale wrapper (editor coords → viewport coords)
  parts.push(`<g transform="scale(${scaleFactor})">`);

  // Rotation + position wrapper (in editor coords)
  parts.push(`<g transform="translate(${regionX}, ${regionY})${rotationTransform}">`);

  // Clip path definition (clips at editor-space dimensions)
  parts.push(`<defs><clipPath id="scoreClip"><rect width="${regionW}" height="${regionH}"/></clipPath></defs>`);

  // Clipped score region
  parts.push(`<g clip-path="url(#scoreClip)">`);

  // SVG-to-editor scale: maps Verovio SVG coordinates → editor coordinates.
  // In the browser, this scaling happens automatically when the SVG element
  // fits inside its CSS-sized container. Here we apply it explicitly.
  parts.push(`<g transform="scale(${svgScaleRatio})">`);

  // Camera group (translateY in SVG coordinates for vertical scroll tracking)
  parts.push(`<g transform="translate(0, ${-cameraY})">`);

  // Score pages wrapper
  parts.push(`<g class="preview-score">`);
  parts.push(pagesSvg);
  parts.push(`</g>`);

  // Close camera group
  parts.push(`</g>`);

  // Close SVG-to-editor scale
  parts.push(`</g>`);

  // Close clipped region
  parts.push(`</g>`);

  // Top border (positioned above the score region, in editor coords)
  if (topBorderSvg) {
    parts.push(`<g transform="translate(0, ${-borderHeight})">${topBorderSvg}</g>`);
  }

  // Bottom border (positioned below the score region, in editor coords)
  if (bottomBorderSvg) {
    parts.push(`<g transform="translate(0, ${regionH})">${bottomBorderSvg}</g>`);
  }

  // Close rotation wrapper
  parts.push(`</g>`);

  // Close scale wrapper
  parts.push(`</g>`);

  // Close root SVG
  parts.push(`</svg>`);

  return parts.join('\n');
}
