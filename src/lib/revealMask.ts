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

const clamp = (v: number) => (v < 0 ? 0 : v > 100 ? 100 : v);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export interface RevealParams {
  /** Fraction (0..1) of the section width that is PLAYED (revealed at full
   *  opacity). 0 = nothing played, 1 = all played. */
  playedFrac: number;
  /** Width of the soft fade band, as a fraction (0..1) of the section width.
   *  0 = hard edge. Only used when smoothReveal is on. */
  bandFrac: number;
  /** Alpha (0..1) of the unplayed region. 0 = hidden, >0 = faded. */
  unplayedOpacity: number;
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
 * The unplayed region is cut/faded from the RIGHT; top/bottom are overscanned
 * by 50% (`inset(-50% … -50% -50%)`) so tall elements aren't clipped.
 */
export function applyReveal(el: HTMLElement, params: RevealParams): void {
  const played = clamp(params.playedFrac * 100); // % revealed
  const band = Math.max(0, params.bandFrac * 100);
  const op = clamp01(params.unplayedOpacity);

  // inset() order is top right bottom left.
  const insetFor = (cutPct: number) => `inset(-50% ${cutPct.toFixed(2)}% -50% -50%)`;

  let clipPath = 'none';
  let maskImage = 'none';

  if (played >= 100) {
    // Fully played — reveal everything (clip/mask stay 'none').
  } else if (op > 0) {
    // FADED unplayed region. Mask only (a clip can't fade). Alpha steps from
    // opaque (played) to `op` (unplayed), with a gradient band when smooth.
    const a = op.toFixed(4);
    if (band <= 0 || played <= 0) {
      const edge = clamp(played);
      maskImage = `linear-gradient(to right, #000 0%, #000 ${edge.toFixed(2)}%, rgba(0,0,0,${a}) ${edge.toFixed(2)}%, rgba(0,0,0,${a}) 100%)`;
    } else {
      const fadeEnd = clamp(played + band);
      maskImage = `linear-gradient(to right, #000 0%, #000 ${played.toFixed(2)}%, rgba(0,0,0,${a}) ${fadeEnd.toFixed(2)}%, rgba(0,0,0,${a}) 100%)`;
    }
  } else {
    // HIDDEN unplayed region (op === 0).
    if (played <= 0) {
      clipPath = insetFor(100); // nothing played — hide everything
    } else if (band <= 0) {
      clipPath = insetFor(100 - played); // hard cut just past the playhead
    } else {
      // Soft fade band ahead of the playhead, BACKED by a hard clip just past
      // the fade so it degrades to a hard edge if the mask won't render.
      const fadeEnd = clamp(played + band);
      clipPath = insetFor(100 - fadeEnd);
      maskImage = `linear-gradient(to right, #000 0%, #000 ${played.toFixed(2)}%, transparent ${fadeEnd.toFixed(2)}%)`;
    }
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

