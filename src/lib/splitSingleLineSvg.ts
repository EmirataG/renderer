/**
 * Split a single-system (breaks: 'none') Verovio SVG into per-section SVG
 * strings WITHOUT re-running layout.
 *
 * Verovio lays out the whole score once, so spacing between staves and the
 * vertical position of every system element is globally consistent. Splitting
 * the rendered SVG preserves that geometry exactly — unlike re-rendering each
 * measure range through toolkit.select() + redoLayout(), where every section
 * gets its own layout pass and staff distances visibly jump at section
 * boundaries.
 *
 * Document shape this relies on (verified against Verovio 6.x output):
 *
 *   <svg viewBox="0 0 {Wpx} {Hpx}" overflow="visible" ...>     ← outer, CSS px
 *     <svg class="definition-scale" viewBox="0 0 {W} {H}" ...> ← inner units
 *       <g class="page-margin" ...>
 *         ... wrappers ...
 *           <g class="measure" id="...">...</g>                ← contiguous
 *           <g class="measure" id="...">...</g>
 *       ...closing tags...
 *
 * Each section reuses the full document prefix (defs, wrappers) and suffix
 * (closing tags) around its slice of contiguous measure groups, with both
 * viewBoxes rewritten to window the section's X range. Content that overflows
 * a section's window (ties/slurs into the next section) still paints because
 * overflow="visible" is forced on both <svg> tags — section containers must
 * therefore NOT establish paint containment (no content-visibility).
 */

interface SplitSection {
  svg: string;
  /** Section width in outer (CSS px) units. */
  width: number;
  /** Section height in outer (CSS px) units — full score height for all sections. */
  height: number;
}

interface MeasureSpan {
  start: number;
  end: number;
}

const VIEWBOX_RE = /viewBox="(-?[\d.]+)[ ,]+(-?[\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)"/g;

/**
 * Locate every top-level <g class="measure"> span via a depth-counting token
 * scan. Handles self-closing <g ... /> tags (Verovio emits milestone markers
 * like <g class="section systemMilestone" />), which have no matching </g>.
 */
function findMeasureSpans(svg: string): MeasureSpan[] {
  const spans: MeasureSpan[] = [];
  const re = /<g\b[^>]*>|<\/g>/g;
  let m: RegExpExecArray | null;
  let depth = 0; // depth within the current measure (0 = outside any measure)
  let start = -1;
  while ((m = re.exec(svg))) {
    const tok = m[0];
    if (tok === '</g>') {
      if (start >= 0) {
        depth--;
        if (depth === 0) {
          spans.push({ start, end: re.lastIndex });
          start = -1;
        }
      }
      continue;
    }
    const selfClosing = tok.endsWith('/>');
    if (start >= 0) {
      if (!selfClosing) depth++;
    } else if (!selfClosing && /class="measure"/.test(tok)) {
      start = m.index;
      depth = 1;
    }
  }
  return spans;
}

/**
 * Right edge (inner units) of a measure: the max X of its barline paths.
 * Returns -Infinity when no barline coordinate is found.
 */
function measureEndX(measureSvg: string): number {
  let maxX = -Infinity;
  const blRe = /<g\b[^>]*class="barLine"[^>]*>([\s\S]*?)<\/g>/g;
  let bl: RegExpExecArray | null;
  while ((bl = blRe.exec(measureSvg))) {
    const coordRe = /M(-?[\d.]+)/g;
    let c: RegExpExecArray | null;
    while ((c = coordRe.exec(bl[1]))) {
      const x = parseFloat(c[1]);
      if (x > maxX) maxX = x;
    }
  }
  return maxX;
}

/** Force overflow="visible" on every <svg> open tag in the given markup. */
function forceSvgOverflowVisible(markup: string): string {
  return markup.replace(/<svg\b[^>]*>/g, (tag) => {
    if (/overflow="/.test(tag)) return tag.replace(/overflow="[^"]*"/, 'overflow="visible"');
    return tag.replace(/<svg\b/, '<svg overflow="visible"');
  });
}

/**
 * Split `fullSvg` into sections of `measuresPerSection` measures.
 * Returns null when splitting is not possible or not worthwhile (document
 * shape unexpected, no barlines found, or not enough measures for more than
 * one section) — callers should fall back to the single full SVG.
 */
export function splitSingleLineSvg(
  fullSvg: string,
  measuresPerSection: number,
): SplitSection[] | null {
  VIEWBOX_RE.lastIndex = 0;
  const vbs = [...fullSvg.matchAll(VIEWBOX_RE)];
  if (vbs.length < 2) return null;

  const outerW = parseFloat(vbs[0][3]);
  const outerH = parseFloat(vbs[0][4]);
  const innerX = parseFloat(vbs[1][1]);
  const innerY = parseFloat(vbs[1][2]);
  const innerW = parseFloat(vbs[1][3]);
  const innerH = parseFloat(vbs[1][4]);
  if (!(outerW > 0) || !(innerW > 0)) return null;
  const ratio = outerW / innerW; // inner units → CSS px

  const spans = findMeasureSpans(fullSvg);
  if (spans.length <= measuresPerSection) return null;

  const prefix = fullSvg.slice(0, spans[0].start);
  const suffix = fullSvg.slice(spans[spans.length - 1].end);

  const sections: SplitSection[] = [];
  let chunkStartX = innerX;

  for (let i = 0; i < spans.length; i += measuresPerSection) {
    const lastIdx = Math.min(i + measuresPerSection, spans.length) - 1;
    const isLastChunk = lastIdx === spans.length - 1;

    let chunkEndX: number;
    if (isLastChunk) {
      chunkEndX = innerX + innerW;
    } else {
      const endX = measureEndX(fullSvg.slice(spans[lastIdx].start, spans[lastIdx].end));
      if (!Number.isFinite(endX) || endX <= chunkStartX) return null;
      chunkEndX = endX;
    }
    const wInner = chunkEndX - chunkStartX;
    if (wInner <= 0) return null;

    // Rewrite the two viewBoxes in the shared prefix. String.replace swaps
    // the first occurrence, so doing the outer first leaves the inner as the
    // next match even if both viewBox strings were identical.
    let head = prefix.replace(
      vbs[0][0],
      `viewBox="0 0 ${wInner * ratio} ${outerH}"`,
    );
    head = head.replace(
      vbs[1][0],
      `viewBox="${chunkStartX} ${innerY} ${wInner} ${innerH}"`,
    );
    head = forceSvgOverflowVisible(head);

    sections.push({
      svg: head + fullSvg.slice(spans[i].start, spans[lastIdx].end) + suffix,
      width: wInner * ratio,
      height: outerH,
    });
    chunkStartX = chunkEndX;
  }

  return sections;
}
