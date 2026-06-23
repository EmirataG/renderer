/**
 * Progressive score reveal ("hide unplayed notes").
 *
 * Splits each Verovio `svg.definition-scale` into an always-visible SKELETON
 * layer (staff lines = bare `<path>` children of `g.staff`, + `g.barLine`) and
 * a CONTENT layer (everything else) clipped to the played region.
 *
 * Uses a CSS `clip-path: inset()` on the content group (percentages relative to
 * the content's bounding box). SVG `<mask>`/`<clipPath>` ELEMENTS silently fail
 * to render in this app's compositing context, but the CSS `clip-path` property
 * works (verified live). It is geometric, so it reveals WIDE horizontal
 * elements (beams, slurs, hairpins) partially as the playhead sweeps across.
 */

const SVGNS = 'http://www.w3.org/2000/svg';

export type RevealMode = 'page' | 'single-line';

interface SystemBand {
  top: number;
  bottom: number;
}

export interface RevealHandle {
  svg: SVGSVGElement;
  content: SVGGElement;
  /** Content bounding box (the inset reference frame). */
  bx: number;
  by: number;
  bw: number;
  bh: number;
  systems: SystemBand[];
  lastKey: string;
}

function isSkeletonNode(el: Element): boolean {
  return el.tagName === 'path' && !!el.parentElement?.classList.contains('staff');
}

/** Whether this svg already has the reveal structure applied. */
export function isRevealInit(svg: SVGSVGElement): boolean {
  const pm = svg.querySelector<SVGGElement>('g.page-margin');
  return !!pm?.querySelector(':scope > g.reveal-content');
}

export function computeSystems(h: RevealHandle): void {
  const systems: SystemBand[] = [];
  h.content.querySelectorAll<SVGGElement>('g.system').forEach((sys) => {
    try {
      const bb = sys.getBBox();
      if (bb.height > 0) systems.push({ top: bb.y, bottom: bb.y + bb.height });
    } catch {
      /* not laid out */
    }
  });
  systems.sort((a, b) => a.top - b.top);
  h.systems = systems;
}

export function setupReveal(svg: SVGSVGElement): RevealHandle | null {
  const pageMargin = svg.querySelector<SVGGElement>('g.page-margin');
  if (!pageMargin) return null;
  if (pageMargin.querySelector(':scope > g.reveal-content')) teardownReveal(svg);

  const skeleton = document.createElementNS(SVGNS, 'g');
  skeleton.setAttribute('class', 'reveal-skeleton');
  const content = document.createElementNS(SVGNS, 'g');
  content.setAttribute('class', 'reveal-content');

  Array.from(pageMargin.childNodes).forEach((node) => {
    if (node.nodeType === 1 && (node as Element).tagName === 'defs') return;
    content.appendChild(node);
  });
  content.querySelectorAll<SVGPathElement>('g.staff > path').forEach((p) => {
    if (isSkeletonNode(p)) skeleton.appendChild(p);
  });
  content.querySelectorAll<SVGGElement>('g.barLine').forEach((b) => skeleton.appendChild(b));
  pageMargin.append(skeleton, content);

  let bx = 0, by = 0, bw = 1, bh = 1;
  try {
    const bb = content.getBBox();
    if (bb.width > 0) { bx = bb.x; by = bb.y; bw = bb.width; bh = bb.height; }
  } catch {
    /* not laid out */
  }

  const handle: RevealHandle = { svg, content, bx, by, bw, bh, systems: [], lastKey: '' };
  computeSystems(handle);
  revealNone(handle);
  return handle;
}

const clamp = (v: number) => (v < 0 ? 0 : v > 100 ? 100 : v);

/* ------------------------------------------------------------------ *
 * Live page-margin split + edge clip (single-line screen-space path).
 *
 * The wrapper-split model failed on PLAY because it cached the injected
 * `g.reveal-content` node: virtualization remounts sections with a fresh
 * `dangerouslySetInnerHTML` SVG that has no reveal structure, leaving the
 * cached node detached — clips landed on nothing while the live section showed
 * the full score. The functions below keep the structural split (so staff
 * lines / barlines stay visible WITHOUT cloning — they are MOVED, not copied,
 * into an unclipped `g.reveal-skeleton`) but never cache a node: the renderer
 * calls `ensureRevealSplit` every frame, which rebuilds the split on a
 * freshly-mounted SVG and is a cheap no-op once present.
 *
 * The CSS `clip-path` property (and `mask-image` gradient) on these groups are
 * the reveal primitives verified to render in this app's compositing context —
 * SVG <mask>/<clipPath> ELEMENTS do not.
 * ------------------------------------------------------------------ */

/**
 * Idempotently split a section's `g.page-margin` into an always-visible
 * `g.reveal-skeleton` (staff lines + barlines, MOVED not cloned) drawn behind a
 * `g.reveal-content` (everything else) that the caller clips. Returns the
 * content group, or null if the SVG has no page-margin. Cheap no-op when the
 * split already exists, so it is safe to call per frame (re-establishes the
 * split on a remounted section before it is clipped → no full-score flash).
 */
export function ensureRevealSplit(svg: SVGSVGElement): SVGGElement | null {
  const pageMargin = svg.querySelector<SVGGElement>('g.page-margin');
  if (!pageMargin) return null;
  const existing = pageMargin.querySelector<SVGGElement>(':scope > g.reveal-content');
  if (existing) return existing;

  const skeleton = document.createElementNS(SVGNS, 'g');
  skeleton.setAttribute('class', 'reveal-skeleton');
  const content = document.createElementNS(SVGNS, 'g');
  content.setAttribute('class', 'reveal-content');

  // Move every non-defs child into the content group...
  Array.from(pageMargin.childNodes).forEach((node) => {
    if (node.nodeType === 1 && (node as Element).tagName === 'defs') return;
    content.appendChild(node);
  });
  // ...then lift the skeleton (staff lines + barlines) out of it. These keep
  // their position because all content shares one absolute coord space (only
  // page-margin / definition-scale transform).
  content.querySelectorAll<SVGPathElement>('g.staff > path').forEach((p) => {
    if (isSkeletonNode(p)) skeleton.appendChild(p);
  });
  content.querySelectorAll<SVGGElement>('g.barLine').forEach((b) => skeleton.appendChild(b));
  // Skeleton first → drawn behind the content (notes paint on top of staves).
  pageMargin.append(skeleton, content);
  return content;
}

/**
 * Reveal the content group's left portion, clipping `rightPct`% off the right.
 * 0 = fully revealed, 100 = fully hidden. `bandPct` > 0 softens the leading
 * edge with a `mask-image` gradient fading AHEAD of the playhead over that band,
 * backed by a hard `clip-path` cut just past the fade so it degrades to a hard
 * edge if the compositor won't render the mask. Overscans top/left/bottom by
 * 50% so tall elements / ledger lines aren't clipped vertically. Idempotent per
 * node (deduped via a dataset key) so it's cheap to call every frame.
 */
export function revealEdge(content: SVGGElement, rightPct: number, bandPct: number): void {
  const right = clamp(rightPct);
  const frontier = 100 - right; // % from the left that is revealed
  const band = bandPct > 0 ? bandPct : 0;

  let clipPath: string;
  let maskImage: string;
  if (frontier >= 100) {
    clipPath = 'none';
    maskImage = 'none';
  } else if (frontier <= 0) {
    clipPath = 'inset(-50% 100% -50% -50%)';
    maskImage = 'none';
  } else if (band <= 0) {
    clipPath = `inset(-50% ${right.toFixed(2)}% -50% -50%)`;
    maskImage = 'none';
  } else {
    const fadeEnd = clamp(frontier + band);
    const rightClip = clamp(100 - fadeEnd);
    clipPath = `inset(-50% ${rightClip.toFixed(2)}% -50% -50%)`;
    maskImage = `linear-gradient(to right, #000 0%, #000 ${frontier.toFixed(2)}%, transparent ${fadeEnd.toFixed(2)}%)`;
  }

  const key = `${clipPath}|${maskImage}`;
  if (content.dataset.revealKey === key) return;
  content.dataset.revealKey = key;

  content.style.clipPath = clipPath === 'none' ? '' : clipPath;
  const mask = maskImage === 'none' ? '' : maskImage;
  content.style.maskImage = mask;
  content.style.webkitMaskImage = mask;
}

/** Tear down the split on a section's SVG and clear any reveal styles. */
export function clearRevealSplit(svg: SVGSVGElement): void {
  teardownReveal(svg);
}

/** Recompute the content bbox if it wasn't laid out at setup time. The inset
 *  percentages depend on a correct width — a stale `bw` of ~1 makes every real
 *  frontier exceed it and reveal everything. */
function ensureBBox(h: RevealHandle): void {
  if (h.bw > 2) return;
  try {
    const bb = h.content.getBBox();
    if (bb.width > 2) { h.bx = bb.x; h.by = bb.y; h.bw = bb.width; h.bh = bb.height; }
  } catch {
    /* still not laid out */
  }
}

export function revealFull(h: RevealHandle): void {
  if (h.lastKey === 'full') return;
  h.lastKey = 'full';
  h.content.style.clipPath = 'none';
}

export function revealNone(h: RevealHandle): void {
  if (h.lastKey === 'none') return;
  h.lastKey = 'none';
  // Clip the entire width away (right inset = 100%).
  h.content.style.clipPath = 'inset(-50% 100% -50% -50%)';
}

/**
 * Reveal the content's left fraction, clipping `rightPct`% off the right.
 * `rightPct` is computed from screen-space measurement by the caller, so this
 * needs no knowledge of the content's coordinate system. clip-path percentages
 * are relative to the content's bbox, and a screen fraction equals a bbox
 * fraction (uniform scale), so the two agree.
 */
export function revealPct(h: RevealHandle, rightPct: number): void {
  const r = clamp(rightPct);
  if (r <= 0) { revealFull(h); return; }
  if (r >= 100) { revealNone(h); return; }
  const key = `pct:${r.toFixed(1)}`;
  if (h.lastKey === key) return;
  h.lastKey = key;
  h.content.style.clipPath = `inset(-50% ${r}% -50% -50%)`;
}

/** Single-line: reveal horizontally up to the frontier X (in content space). */
export function revealSingleLineAt(h: RevealHandle, frontierX: number, _band: number): void {
  ensureBBox(h);
  const rightPct = clamp(((h.bx + h.bw - frontierX) / h.bw) * 100);
  if (rightPct <= 0) { revealFull(h); return; }
  if (rightPct >= 100) { revealNone(h); return; }
  const key = `sl:${rightPct.toFixed(2)}`;
  if (h.lastKey === key) return;
  h.lastKey = key;
  // Reveal left → frontier, full height (overscan top/bottom/left so tall
  // elements and ledger lines above the staff aren't clipped).
  h.content.style.clipPath = `inset(-50% ${rightPct}% -50% -50%)`;
}

/** Page mode: reveal vertically down through the current system (full width). */
export function revealAt(h: RevealHandle, x: number, y: number, band: number, mode: RevealMode): void {
  if (mode === 'single-line') { revealSingleLineAt(h, x, band); return; }
  ensureBBox(h);
  const sys = currentSystem(h.systems, y);
  const bottom = sys ? sys.bottom : y;
  const bottomPct = clamp(((h.by + h.bh - bottom) / h.bh) * 100);
  if (bottomPct <= 0) { revealFull(h); return; }
  if (bottomPct >= 100) { revealNone(h); return; }
  const key = `p:${bottomPct.toFixed(2)}`;
  if (h.lastKey === key) return;
  h.lastKey = key;
  h.content.style.clipPath = `inset(-50% -50% ${bottomPct}% -50%)`;
}

export function teardownReveal(svg: SVGSVGElement): void {
  const pageMargin = svg.querySelector<SVGGElement>('g.page-margin');
  if (!pageMargin) return;
  const skeleton = pageMargin.querySelector<SVGGElement>(':scope > g.reveal-skeleton');
  const content = pageMargin.querySelector<SVGGElement>(':scope > g.reveal-content');
  if (!content) return;
  content.style.clipPath = '';
  content.style.maskImage = '';
  content.style.webkitMaskImage = '';
  delete content.dataset.revealKey;
  if (skeleton) {
    const frag = document.createDocumentFragment();
    while (skeleton.firstChild) frag.appendChild(skeleton.firstChild);
    content.insertBefore(frag, content.firstChild);
    skeleton.remove();
  }
  while (content.firstChild) pageMargin.appendChild(content.firstChild);
  content.remove();
}

function currentSystem(systems: SystemBand[], y: number): SystemBand | null {
  if (systems.length === 0) return null;
  let chosen: SystemBand | null = null;
  for (const s of systems) {
    if (y >= s.top && y <= s.bottom) return s;
    if (s.top <= y) chosen = s;
    else break;
  }
  return chosen ?? systems[0];
}
