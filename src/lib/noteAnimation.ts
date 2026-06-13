export interface NoteheadAnimationOptions {
  scale?: number;
  entryMs?: number;
  holdMs?: number;
  exitMs?: number;
  color?: string;
  colorExtrasSelector?: string;
}

/**
 * Build a CSS selector for extra note elements to color based on individual flags.
 * Returns empty string if no extras should be colored.
 */
export function buildColorExtrasSelector(opts: {
  colorAccidentals?: boolean;
  colorDots?: boolean;
  colorArticulations?: boolean;
}): string {
  const parts: string[] = [];
  if (opts.colorAccidentals) parts.push('g.accid');
  if (opts.colorDots) parts.push('g.dots');
  if (opts.colorArticulations) parts.push('g.artic');
  return parts.join(', ');
}

/** Cached DOM element references for O(1) lookup by SVG id. */
export type ElementCache = Map<string, SVGGElement>;

/**
 * Build a cache of all id'd SVG group elements under `root`.
 * Call once after each SVG render; pass the result to animateNoteheads /
 * resetEventNoteheads to avoid per-frame querySelector overhead.
 */
export function buildElementCache(root: HTMLElement): ElementCache {
  const cache: ElementCache = new Map();
  const elements = root.querySelectorAll<SVGGElement>('g.note[id], g.chord[id]');
  elements.forEach((el) => {
    cache.set(el.id, el);
  });
  return cache;
}

/** Look up an element by id, using cache when available and valid. */
function cachedLookup(
  root: HTMLElement,
  id: string,
  cache?: ElementCache,
): SVGGElement | null {
  const cached = cache?.get(id);
  // Guard: if the cached node was detached (e.g. dangerouslySetInnerHTML
  // replaced the SVG, or page virtualization unmounted it), fall back to a
  // live querySelector.
  if (cached && cached.isConnected) return cached;
  const fresh = root.querySelector<SVGGElement>(`#${CSS.escape(id)}`);
  if (cache) {
    // Repair the cache so subsequent frames hit it again: replace the stale
    // entry with the live node, or drop it entirely so a detached subtree
    // isn't pinned in memory while its page is unmounted.
    if (fresh) cache.set(id, fresh);
    else if (cached) cache.delete(id);
  }
  return fresh;
}

// Default selectors for resetting all possible note sub-elements
const ALL_EXTRAS_SELECTORS = "g.stem, g.accid, g.flag, g.dots, g.artic";

/* ---------------- pending exit timers ----------------
 * animateNoteheads schedules a setTimeout per notehead for the exit phase
 * (entry + hold later). With "use note duration" holds these can be many
 * seconds long; their closures pin DOM nodes (including subtrees of pages
 * unmounted by virtualization) until they fire, and they must never fire
 * after the renderer unmounts. Track them so full resets and unmounts can
 * cancel the lot. Note: pause deliberately does NOT cancel — in-flight
 * highlights should finish their exit instead of freezing mid-animation.
 */
const pendingExitTimers = new Set<number>();

function scheduleExitTimer(delayMs: number, fn: () => void): void {
  const id = window.setTimeout(() => {
    pendingExitTimers.delete(id);
    fn();
  }, delayMs);
  pendingExitTimers.add(id);
}

/** Cancel all pending notehead exit timers (full reset / renderer unmount). */
export function cancelPendingNoteheadTimers(): void {
  pendingExitTimers.forEach((id) => window.clearTimeout(id));
  pendingExitTimers.clear();
}

function applyColorToElement(el: SVGGraphicsElement, color: string, transitionMs: number, easing: string) {
  el.style.transition = `fill ${transitionMs}ms ${easing}, stroke ${transitionMs}ms ${easing}`;
  // Use setProperty with 'important' to override CSS stylesheet rules
  el.style.setProperty('fill', color, 'important');
  el.style.setProperty('stroke', color, 'important');
  el.style.setProperty('color', color, 'important');
}

function clearColorFromElement(el: SVGGraphicsElement, transitionMs: number, easing: string) {
  el.style.transition = `fill ${transitionMs}ms ${easing}, stroke ${transitionMs}ms ${easing}`;
  el.style.removeProperty("fill");
  el.style.removeProperty("stroke");
  el.style.removeProperty("color");
}

export function animateNoteheads(
  root: HTMLElement | null,
  svgIds: string[],
  {
    scale = 1.2,
    entryMs = 120,
    holdMs = 0,
    exitMs = 120,
    color,
    colorExtrasSelector = '',
  }: NoteheadAnimationOptions = {},
  cache?: ElementCache,
) {
  if (!root) return;

  svgIds.forEach((id) => {
    const element = cachedLookup(root, id, cache);
    if (!element) return;

    // If element is a g.chord, animate all g.note children; otherwise animate it directly
    const targets: SVGGElement[] = element.classList.contains('chord')
      ? Array.from(element.querySelectorAll<SVGGElement>('g.note'))
      : [element];

    // Animate each target (note within chord or single note)
    targets.forEach((target) => {
      const noteheads = target.querySelectorAll<SVGGElement>("g.notehead");

      noteheads.forEach((nh) => {
        /* ---------------- scale (group) ---------------- */
        nh.style.transformBox = "fill-box";
        nh.style.transformOrigin = "center";
        nh.style.transition = `transform ${entryMs}ms ease-out`;
        nh.style.transform = `scale(${scale})`;

        /* ---------------- color override (notehead shapes) ---------------- */
        const shapes = nh.querySelectorAll<SVGGraphicsElement>("use");

        shapes.forEach((shape) => {
          if (color) {
            applyColorToElement(shape, color, entryMs, "ease-out");
          }
        });

        /* ---------------- exit ---------------- */
        const totalDelay = entryMs + holdMs;

        scheduleExitTimer(totalDelay, () => {
          nh.style.transition = `transform ${exitMs}ms ease-in`;
          nh.style.transform = "scale(1)";

          shapes.forEach((shape) => {
            if (color) {
              clearColorFromElement(shape, exitMs, "ease-in");
            }
          });
        });
      });
    });

    /* ---------------- extra element coloring (accidentals, dots, ornaments, etc.) ---------------- */
    // Search from the original element (chord or note) for selected extras.
    if (color && colorExtrasSelector) {
      const extras = element.querySelectorAll<SVGGraphicsElement>(colorExtrasSelector);
      extras.forEach((group) => {
        // Color all renderable children (path, use, polygon, ellipse, etc.)
        const children = group.querySelectorAll<SVGGraphicsElement>("path, use, polygon, line, ellipse");
        children.forEach((child) => applyColorToElement(child, color, entryMs, "ease-out"));
        // Also color the group itself (for elements with direct fill)
        applyColorToElement(group as SVGGraphicsElement, color, entryMs, "ease-out");
      });

      const totalDelay = entryMs + holdMs;
      scheduleExitTimer(totalDelay, () => {
        extras.forEach((group) => {
          const children = group.querySelectorAll<SVGGraphicsElement>("path, use, polygon, line, ellipse");
          children.forEach((child) => clearColorFromElement(child, exitMs, "ease-in"));
          clearColorFromElement(group as SVGGraphicsElement, exitMs, "ease-in");
        });
      });
    }
  });
}

/**
 * Reorder notehead elements to be the last child of their parent `g.note` group.
 * In SVG, rendering order is determined by DOM order (later elements paint on top).
 * Verovio generates SVG where `g.stem` appears after `g.notehead` within each `g.note`,
 * causing stems to paint over noteheads. When noteheads are colored (during playback
 * or export), the stem obscures them. Moving each `g.notehead` to be the last child
 * ensures noteheads always paint on top of stems.
 */
export function reorderNoteheadsAboveStems(root: HTMLElement | null): void {
  if (!root) return;

  // Move staff line groups to be the first child of their parent so they
  // paint behind all other elements (notes, beams, etc.).
  const staffGroups = root.querySelectorAll<SVGGElement>('g.staff');
  staffGroups.forEach((staff) => {
    const parent = staff.parentElement;
    if (parent && parent.firstElementChild !== staff) {
      parent.insertBefore(staff, parent.firstElementChild);
    }
  });

  // Move stems to be the first child of their parent so they paint first.
  // This handles chord-level stems (g.chord > g.stem) that would otherwise
  // paint over all g.note children, as well as note-level stems.
  const stems = root.querySelectorAll<SVGGElement>('g.stem');
  stems.forEach((stem) => {
    const parent = stem.parentElement;
    if (parent && parent.firstElementChild !== stem) {
      parent.insertBefore(stem, parent.firstElementChild);
    }
  });

  // Move noteheads to be the last child of their parent so they paint last.
  const noteheads = root.querySelectorAll<SVGGElement>('g.notehead');
  noteheads.forEach((nh) => {
    const parent = nh.parentElement;
    if (parent && parent.lastElementChild !== nh) {
      parent.appendChild(nh);
    }
  });
}

/**
 * Reorder notehead/stem elements in an SVG string so noteheads paint above stems.
 * Uses DOMParser to manipulate the SVG, then serializes back to a string.
 * This is the string-level equivalent of reorderNoteheadsAboveStems — applied
 * before React renders the SVG via dangerouslySetInnerHTML so the correct
 * order survives React re-renders.
 */
export function reorderNoteheadsInSvgString(svgString: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');

  // Check for parse errors
  const parseError = doc.querySelector('parsererror');
  if (parseError) return svgString;

  // Move staff line groups to first child so they paint behind everything
  doc.querySelectorAll('g.staff').forEach((staff) => {
    const parent = staff.parentElement;
    if (parent && parent.firstElementChild !== staff) {
      parent.insertBefore(staff, parent.firstElementChild);
    }
  });

  // Move stems to first child
  doc.querySelectorAll('g.stem').forEach((stem) => {
    const parent = stem.parentElement;
    if (parent && parent.firstElementChild !== stem) {
      parent.insertBefore(stem, parent.firstElementChild);
    }
  });

  // Move noteheads to last child
  doc.querySelectorAll('g.notehead').forEach((nh) => {
    const parent = nh.parentElement;
    if (parent && parent.lastElementChild !== nh) {
      parent.appendChild(nh);
    }
  });

  return new XMLSerializer().serializeToString(doc.documentElement);
}

export function resetNoteheadAnimations(root: HTMLElement | null) {
  if (!root) return;

  // Everything is reset to base state below — pending exit timers are
  // redundant (and would pin the nodes they close over until they fire).
  cancelPendingNoteheadTimers();

  root.querySelectorAll<SVGGElement>("g.notehead").forEach((nh) => {
    // Reset scale
    nh.style.transform = "scale(1)";
    nh.style.transition = "";

    // Remove color overrides from shapes
    nh.querySelectorAll<SVGGraphicsElement>("use").forEach(
      (shape) => {
        shape.style.removeProperty("fill");
        shape.style.removeProperty("stroke");
        shape.style.removeProperty("color");
        shape.style.transition = "";
      }
    );
  });

  // Also reset coloring on extra elements (accidentals, dots, ornaments, etc.)
  const extras = root.querySelectorAll<SVGGraphicsElement>(ALL_EXTRAS_SELECTORS);
  extras.forEach((group) => {
    group.style.removeProperty("fill");
    group.style.removeProperty("stroke");
    group.style.removeProperty("color");
    group.style.transition = "";
    group.querySelectorAll<SVGGraphicsElement>("path, use, polygon, line, ellipse").forEach((child) => {
      child.style.removeProperty("fill");
      child.style.removeProperty("stroke");
      child.style.removeProperty("color");
      child.style.transition = "";
    });
  });
}

/**
 * Reset notehead/stem/accid/flag/dots/artic styles for a single event's SVG elements.
 * This is the per-event inverse of the apply block in setTimestamp (delta-based animation),
 * scoped to a single event's DOM nodes instead of the entire score root.
 */
export function resetEventNoteheads(
  root: HTMLElement,
  svgIds: string[],
  colorExtrasSelector: string,
  cache?: ElementCache,
): void {
  for (const id of svgIds) {
    const stavenote = cachedLookup(root, id, cache);
    if (!stavenote) continue;

    // Reset noteheads: scale and color
    const noteheads = stavenote.querySelectorAll<SVGGElement>("g.notehead");
    noteheads.forEach((nh) => {
      nh.style.transform = "scale(1)";
      nh.style.transition = "";

      nh.querySelectorAll<SVGGraphicsElement>("use").forEach((shape) => {
        shape.style.removeProperty("fill");
        shape.style.removeProperty("stroke");
        shape.style.removeProperty("color");
      });
    });

    // Reset extra element coloring (accidentals, dots, ornaments, etc.)
    if (colorExtrasSelector) {
      const extras = stavenote.querySelectorAll<SVGGraphicsElement>(
        colorExtrasSelector
      );
      extras.forEach((group) => {
        group.style.removeProperty("fill");
        group.style.removeProperty("stroke");
        group.style.removeProperty("color");
        group.style.transition = "";

        group.querySelectorAll<SVGGraphicsElement>("path, use, polygon, line, ellipse").forEach((child) => {
          child.style.removeProperty("fill");
          child.style.removeProperty("stroke");
          child.style.removeProperty("color");
        });
      });
    }
  }
}
