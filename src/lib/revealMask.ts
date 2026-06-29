/**
 * Progressive score reveal ("hide unplayed notes").
 *
 * `applyReveal` clips/fades an element to the played region as the playhead
 * sweeps across it. It's SPATIAL — a CSS `clip-path: inset()` and/or
 * `mask-image: linear-gradient()` — so WIDE horizontal elements (beams, slurs,
 * hairpins) reveal *partially*.
 *
 * CRITICAL: the caller applies this to the section's HTML container `<div>`
 * (the whole section — staff + notes — dims uniformly), NOT to an inner SVG
 * element. Chromium does not invalidate a `mask-image` set on an SVG `<g>`/
 * `<svg>` when only the gradient's color stops change, so an SVG-level opacity
 * fade froze under virtualization (every repaint-forcing trick failed). HTML
 * elements invalidate `mask-image` correctly. (`clip-path` updates fine on SVG
 * too, but for a single, uniform mechanism both modes target the HTML div.)
 *
 * `unplayedOpacity` (0..1) is the alpha of the UNPLAYED region:
 *   - 0   → unplayed region fully hidden (a hard `clip-path` cut, optionally
 *           with a soft `mask-image` fade band at the leading edge).
 *   - >0  → unplayed region shown faded at that alpha, via `mask-image` (a clip
 *           can only hide, not fade): alpha steps from 1 in the played region
 *           down to `unplayedOpacity` (a gradient band at the boundary when
 *           `smoothReveal`, a hard step otherwise). No clip-path in this case.
 */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export interface RevealParams {
  /** Fraction (0..1) of the section width that is PLAYED (faded in at full
   *  opacity). 0 = nothing played, 1 = all played. This is the fade-IN boundary;
   *  content to its right is unplayed (hidden/faded). */
  playedFrac: number;
  /** Width of the soft fade band, as a fraction (0..1) of the section width.
   *  0 = hard edge. Only used when smoothReveal is on. Shared by both sides. */
  bandFrac: number;
  /** Alpha (0..1) of the unplayed/faded region. 0 = hidden, >0 = faded. */
  unplayedOpacity: number;
  /** Fade-OUT boundary (0..1, same axis as playedFrac): content to its LEFT
   *  fades down to `unplayedOpacity` over `bandFrac`, mirroring the fade-in side.
   *  Omit for no fade-out (the trailing edge stays at full opacity). */
  fadeOutFrac?: number;
}

/**
 * Apply a left→right spatial reveal to an element via CSS clip-path (hidden
 * mode) and/or mask-image (faded mode). Idempotent per node (deduped via a
 * dataset key) so it's cheap to call every frame.
 *
 * Apply this to the section's HTML container `<div>`, NOT an inner SVG element:
 * Chromium does not invalidate a `mask-image` set on an SVG `<g>`/`<svg>` when
 * only the gradient's color stops change, so an SVG-level fade froze under
 * virtualization (layer promotion, none→mask, and display-toggle repaint forces
 * all failed). HTML elements invalidate `mask-image` correctly.
 *
 * The unplayed region is cut/faded from the RIGHT (fade in); with `fadeOutFrac`
 * the trailing played region is cut/faded from the LEFT (fade out), symmetric.
 * Top/bottom are overscanned by 50% so tall elements aren't clipped.
 *
 * The gradient stops are deliberately NOT clamped to [0%, 100%]: a section is
 * one slice of the global score, so a fade band that straddles a section
 * boundary must extend past the box on one side and start before it on the
 * other. CSS extrapolates beyond the box, and both sides of a seam share the
 * same playhead + band, so the alpha matches exactly across the boundary — a
 * clamp here is what made smooth reveal hard-edge at section boundaries.
 */
export function applyReveal(el: HTMLElement, params: RevealParams): void {
  const bandPct = Math.max(0, params.bandFrac) * 100;
  const p = params.playedFrac * 100;            // % of section width played (unclamped)
  const fe = p + bandPct;                        // fade-in band end (unclamped, fe >= p)
  const op = clamp01(params.unplayedOpacity);

  // Fade-out (trailing) side: content left of `q` fades to `op` over a band
  // ending at `q` and starting at `fs = q - band`. Omitted ⇒ no fade-out.
  const hasFadeOut = params.fadeOutFrac != null;
  const q = (params.fadeOutFrac ?? 0) * 100;
  const fs = q - bandPct;
  const fullyPlayed = p >= 100;

  const f2 = (n: number) => n.toFixed(2);
  // inset() order is top right bottom left. Top/bottom overscanned so tall
  // elements aren't clipped; left/right cut the hidden head/tail.
  const insetFor = (rightCut: number, leftCut: number) =>
    `inset(-50% ${f2(rightCut)}% -50% ${f2(Math.max(0, leftCut))}%)`;

  let clipPath = 'none';
  let maskImage = 'none';

  if (fullyPlayed && !hasFadeOut) {
    // Fully played, no fade-out — reveal everything (clip/mask stay 'none').
  } else if (op > 0) {
    // FADED hidden regions. Mask only (a clip can't fade). Build stops left→right:
    // faded-out tail → solid middle → faded-in head. Coincident stops give a hard
    // step when band === 0.
    const a = op.toFixed(4);
    const stops: string[] = [];
    if (hasFadeOut) stops.push(`rgba(0,0,0,${a}) ${f2(fs)}%`, `#000 ${f2(q)}%`);
    if (!fullyPlayed) stops.push(`#000 ${f2(p)}%`, `rgba(0,0,0,${a}) ${f2(fe)}%`);
    else stops.push('#000 100%'); // keep the right solid when fully played
    maskImage = `linear-gradient(to right, ${stops.join(', ')})`;
  } else {
    // HIDDEN regions (op === 0): clip-path cuts the hidden head/tail; a soft mask
    // band feathers each boundary when smooth (band > 0).
    const rightCut = fullyPlayed ? 0 : 100 - fe;
    const leftCut = hasFadeOut ? fs : 0;
    clipPath = insetFor(rightCut, leftCut);
    const stops: string[] = [];
    if (hasFadeOut && q > fs) stops.push(`transparent ${f2(fs)}%`, `#000 ${f2(q)}%`);
    if (!fullyPlayed && fe > p) stops.push(`#000 ${f2(p)}%`, `transparent ${f2(fe)}%`);
    else if (stops.length) stops.push('#000 100%'); // close the tail band into solid
    if (stops.length) maskImage = `linear-gradient(to right, ${stops.join(', ')})`;
  }

  const key = `${clipPath}|${maskImage}`;
  if (el.dataset.revealKey === key) return;
  el.dataset.revealKey = key;

  el.style.clipPath = clipPath === 'none' ? '' : clipPath;
  const mask = maskImage === 'none' ? '' : maskImage;
  const s = el.style as CSSStyleDeclaration & { webkitMaskImage?: string };
  el.style.maskImage = mask;
  s.webkitMaskImage = mask;
}

/** Clear any reveal styles (clip-path / mask) previously applied to an element
 *  — when the feature is turned off or a section scrolls out. */
export function clearRevealStyles(el: HTMLElement): void {
  if (!el.dataset.revealKey && !el.style.clipPath && !el.style.maskImage) return;
  el.style.clipPath = '';
  el.style.maskImage = '';
  (el.style as CSSStyleDeclaration & { webkitMaskImage?: string }).webkitMaskImage = '';
  delete el.dataset.revealKey;
}

