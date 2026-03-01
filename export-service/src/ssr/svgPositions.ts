/**
 * SVG coordinate extraction for event positions.
 *
 * Replaces the browser-based computeEventPositions() from standalone/render.ts
 * which relied on getBoundingClientRect(). Instead, parses SVG transform
 * attributes to extract Y coordinates directly from the SVG structure.
 *
 * Verovio SVG structure:
 *   <svg viewBox="0 0 W H">
 *     <g class="page-margin" transform="translate(mx, my)">
 *       <g class="system" transform="translate(sx, sy)">
 *         <g class="staff" transform="translate(stx, sty)">
 *           ...staff lines, notes, etc...
 *         </g>
 *       </g>
 *     </g>
 *   </svg>
 */

import { DOMParser } from 'linkedom';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EventPosition {
  pageIndex: number;
  globalY: number;
}

export interface NoteheadCenter {
  /** Element ID of the g.notehead group (for lookup) */
  noteheadEl: Element;
  /** Center X in the notehead's local coordinate space */
  cx: number;
  /** Center Y in the notehead's local coordinate space */
  cy: number;
}

// ---------------------------------------------------------------------------
// SVG parsing helpers
// ---------------------------------------------------------------------------

const TRANSLATE_RE = /translate\(\s*([\d.eE+-]+)\s*[,\s]\s*([\d.eE+-]+)\s*\)/;
const VIEWBOX_RE = /viewBox="([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)"/;

function parseTranslate(transform: string | null): { x: number; y: number } {
  if (!transform) return { x: 0, y: 0 };
  const m = TRANSLATE_RE.exec(transform);
  if (!m) return { x: 0, y: 0 };
  return { x: parseFloat(m[1]), y: parseFloat(m[2]) };
}

function parseViewBox(svgString: string): { x: number; y: number; w: number; h: number } {
  const m = VIEWBOX_RE.exec(svgString);
  if (!m) return { x: 0, y: 0, w: 0, h: 0 };
  return {
    x: parseFloat(m[1]),
    y: parseFloat(m[2]),
    w: parseFloat(m[3]),
    h: parseFloat(m[4]),
  };
}

// ---------------------------------------------------------------------------
// System bounds computation
// ---------------------------------------------------------------------------

interface SystemBounds {
  /** Y position of the system's center in page-pixel coordinates */
  centerY: number;
}

/**
 * For a list of system elements on a page, compute each system's center Y
 * in page-pixel coordinates (matching what getBoundingClientRect would give
 * relative to the page container).
 *
 * Uses the transform chain: page-margin translate + system translate,
 * then subtracts the viewBox Y offset to get pixel coordinates.
 * System height is estimated from staff child elements or gaps between systems.
 */
function computeSystemBounds(
  systems: Element[],
  pageMarginY: number,
  viewBoxY: number,
): SystemBounds[] {
  // Collect absolute Y positions (in SVG coordinate space)
  const absYs: number[] = systems.map((sys) => {
    const { y } = parseTranslate(sys.getAttribute('transform'));
    return pageMarginY + y;
  });

  const bounds: SystemBounds[] = [];

  for (let i = 0; i < systems.length; i++) {
    const sys = systems[i];
    const absY = absYs[i];

    // Try to get system height from staff elements
    let systemHeight = estimateSystemHeight(sys);

    // If staff-based estimation failed, use gap between systems
    if (systemHeight <= 0) {
      if (i < systems.length - 1) {
        systemHeight = absYs[i + 1] - absY;
      } else if (i > 0) {
        systemHeight = absY - absYs[i - 1];
      } else {
        systemHeight = 100; // fallback for single-system pages
      }
    }

    // Convert to pixel coordinates (subtract viewBox Y offset)
    const pixelY = absY - viewBoxY;
    const centerY = pixelY + systemHeight / 2;

    bounds.push({ centerY });
  }

  return bounds;
}

/**
 * Estimate a system's visual height from its staff children.
 * Finds the top and bottom staff Y extents within the system.
 */
function estimateSystemHeight(systemEl: Element): number {
  const staves = systemEl.querySelectorAll('g.staff');
  if (!staves || staves.length === 0) return 0;

  let minY = Infinity;
  let maxY = -Infinity;

  for (const staff of staves) {
    const { y: staffY } = parseTranslate(staff.getAttribute('transform'));
    minY = Math.min(minY, staffY);

    // Staff lines span ~4 spaces. Parse actual staff line paths if available.
    let staffBottom = staffY;
    const staffLines = staff.querySelector('g.staffLines');
    if (staffLines) {
      const paths = staffLines.querySelectorAll('path');
      for (const path of paths) {
        const d = path.getAttribute('d');
        if (!d) continue;
        // Staff lines are horizontal: M x1,y1 L x2,y1
        const yMatch = d.match(/[ML]\s*[\d.eE+-]+\s*[,\s]\s*([\d.eE+-]+)/);
        if (yMatch) {
          staffBottom = Math.max(staffBottom, staffY + parseFloat(yMatch[1]));
        }
      }
    }
    // Fallback: typical 5-line staff is ~32 SVG units
    if (staffBottom <= staffY) {
      staffBottom = staffY + 32;
    }

    maxY = Math.max(maxY, staffBottom);
  }

  if (minY === Infinity) return 0;
  return maxY - minY;
}

// ---------------------------------------------------------------------------
// Main position computation
// ---------------------------------------------------------------------------

/**
 * Parse SVG pages and extract event positions without browser DOM.
 *
 * For each event, finds which page/system it belongs to and computes
 * the globalY position (system center Y + page offset).
 */
export function computeEventPositionsFromSvg(
  svgPages: string[],
  pageHeights: number[],
  pageOffsets: number[],
  events: { svgIds: string[]; id: string }[],
  toolkit: { getPageWithElement(id: string): number },
): Map<string, EventPosition> {
  const result = new Map<string, EventPosition>();
  const parser = new DOMParser();

  // Parse each page and compute system bounds
  const pageDocs: Document[] = [];
  const pageSystemBounds: SystemBounds[][] = [];

  for (let p = 0; p < svgPages.length; p++) {
    const doc = parser.parseFromString(svgPages[p], 'image/svg+xml') as unknown as Document;
    pageDocs.push(doc);

    const vb = parseViewBox(svgPages[p]);
    const pageMargin = doc.querySelector('g.page-margin');
    const pmTranslate = parseTranslate(pageMargin?.getAttribute('transform') ?? null);

    const systemEls = Array.from(doc.querySelectorAll('g.system'));
    const bounds = computeSystemBounds(systemEls, pmTranslate.y, vb.y);
    pageSystemBounds.push(bounds);
  }

  // Map each event to its system center Y
  for (const event of events) {
    if (event.svgIds.length === 0) {
      result.set(event.id, { pageIndex: 0, globalY: 0 });
      continue;
    }

    const pageNum = toolkit.getPageWithElement(event.svgIds[0]);
    if (pageNum === 0) {
      result.set(event.id, { pageIndex: 0, globalY: 0 });
      continue;
    }

    const pageIndex = pageNum - 1;
    if (pageIndex >= pageDocs.length) {
      result.set(event.id, { pageIndex: 0, globalY: 0 });
      continue;
    }

    const doc = pageDocs[pageIndex];

    // Find the note element and its ancestor system
    const noteEl = doc.getElementById(event.svgIds[0]);
    if (!noteEl) {
      result.set(event.id, { pageIndex, globalY: pageOffsets[pageIndex] });
      continue;
    }

    // Walk up to find ancestor system
    const systemEl = findAncestorSystem(noteEl);
    if (!systemEl) {
      result.set(event.id, { pageIndex, globalY: pageOffsets[pageIndex] });
      continue;
    }

    // Find which system index this is
    const systemEls = Array.from(doc.querySelectorAll('g.system'));
    const sysIndex = systemEls.indexOf(systemEl);
    const bounds = pageSystemBounds[pageIndex]?.[sysIndex];

    if (bounds) {
      result.set(event.id, {
        pageIndex,
        globalY: pageOffsets[pageIndex] + bounds.centerY,
      });
    } else {
      result.set(event.id, { pageIndex, globalY: pageOffsets[pageIndex] });
    }
  }

  return result;
}

/**
 * Walk up the DOM tree to find the nearest ancestor with class "system".
 */
function findAncestorSystem(el: Element): Element | null {
  let current = el.parentElement;
  while (current) {
    const cls = current.getAttribute('class') ?? '';
    if (cls.split(/\s+/).includes('system')) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Notehead center pre-computation
// ---------------------------------------------------------------------------

/**
 * Pre-compute center coordinates for all notehead groups referenced by events.
 * These centers are used for SVG transform-based scaling (replacing
 * CSS transform-box: fill-box; transform-origin: center).
 *
 * Returns a Map from notehead Element to its center coordinates.
 */
export function precomputeNoteheadCenters(
  pageDocs: Document[],
  events: { svgIds: string[] }[],
): Map<Element, { cx: number; cy: number }> {
  const centers = new Map<Element, { cx: number; cy: number }>();

  for (const event of events) {
    for (const id of event.svgIds) {
      for (const doc of pageDocs) {
        const stavenote = doc.getElementById(id);
        if (!stavenote) continue;

        const noteheads = stavenote.querySelectorAll('g.notehead');
        for (const nh of noteheads) {
          if (centers.has(nh)) continue;
          centers.set(nh, computeNoteheadCenter(nh));
        }
        break; // Found in this doc, skip others
      }
    }
  }

  return centers;
}

/**
 * Compute the center of a g.notehead element from its child <use> positions.
 * The center is in the notehead group's local coordinate space.
 */
function computeNoteheadCenter(nhGroup: Element): { cx: number; cy: number } {
  const uses = nhGroup.querySelectorAll('use');
  if (!uses || uses.length === 0) return { cx: 0, cy: 0 };

  let sumX = 0;
  let sumY = 0;
  let count = 0;

  for (const use of uses) {
    const x = parseFloat(use.getAttribute('x') ?? '0');
    const y = parseFloat(use.getAttribute('y') ?? '0');
    const w = parseFloat(use.getAttribute('width') ?? '0');
    const h = parseFloat(use.getAttribute('height') ?? '0');

    // If width/height available, use center; otherwise use glyph origin
    sumX += w > 0 ? x + w / 2 : x;
    sumY += h > 0 ? y + h / 2 : y;
    count++;
  }

  if (count === 0) return { cx: 0, cy: 0 };
  return { cx: sumX / count, cy: sumY / count };
}
