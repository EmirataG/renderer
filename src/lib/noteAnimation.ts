export interface NoteheadAnimationOptions {
  scale?: number;
  entryMs?: number;
  holdMs?: number;
  exitMs?: number;
  color?: string;
  colorFullNote?: boolean;
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
  // replaced the SVG), fall back to a live querySelector.
  if (cached && cached.isConnected) return cached;
  return root.querySelector<SVGGElement>(`#${CSS.escape(id)}`);
}

// Selectors for note sub-elements beyond the notehead (stems, accidentals, etc.)
const FULL_NOTE_SELECTORS = "g.stem, g.accid, g.flag, g.dots, g.artic";

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
    colorFullNote = false,
  }: NoteheadAnimationOptions = {},
  cache?: ElementCache,
) {
  if (!root) return;

  svgIds.forEach((id) => {
    const element = cachedLookup(root, id, cache);
    if (!element) return;

    // Determine the animation target(s):
    // - If element is a g.chord, animate all g.note children
    // - If element is a g.note, animate it directly
    // - Otherwise, search for noteheads within (legacy behavior)
    let targets: SVGGElement[];
    if (element.classList.contains('chord')) {
      targets = Array.from(element.querySelectorAll<SVGGElement>('g.note'));
    } else if (element.classList.contains('note')) {
      targets = [element];
    } else {
      targets = [element];
    }

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

        window.setTimeout(() => {
          nh.style.transition = `transform ${exitMs}ms ease-in`;
          nh.style.transform = "scale(1)";

          shapes.forEach((shape) => {
            if (color) {
              clearColorFromElement(shape, exitMs, "ease-in");
            }
          });
        }, totalDelay);
      });
    });

    /* ---------------- full note coloring (stem, accidentals, etc.) ---------------- */
    // Search from the original element (chord or note) for stems, accidentals, etc.
    if (color && colorFullNote) {
      const extras = element.querySelectorAll<SVGGraphicsElement>(FULL_NOTE_SELECTORS);
      extras.forEach((group) => {
        // Color all renderable children (path, use, polygon, etc.)
        const children = group.querySelectorAll<SVGGraphicsElement>("path, use, polygon, line");
        children.forEach((child) => applyColorToElement(child, color, entryMs, "ease-out"));
        // Also color the group itself (for elements with direct fill)
        applyColorToElement(group as SVGGraphicsElement, color, entryMs, "ease-out");
      });

      const totalDelay = entryMs + holdMs;
      window.setTimeout(() => {
        extras.forEach((group) => {
          const children = group.querySelectorAll<SVGGraphicsElement>("path, use, polygon, line");
          children.forEach((child) => clearColorFromElement(child, exitMs, "ease-in"));
          clearColorFromElement(group as SVGGraphicsElement, exitMs, "ease-in");
        });
      }, totalDelay);
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

  // Also reset full-note coloring on stems, accidentals, etc.
  const extras = root.querySelectorAll<SVGGraphicsElement>(
    "g.stem, g.accid, g.flag, g.dots, g.artic"
  );
  extras.forEach((group) => {
    group.style.removeProperty("fill");
    group.style.removeProperty("stroke");
    group.style.removeProperty("color");
    group.style.transition = "";
    group.querySelectorAll<SVGGraphicsElement>("path, use, polygon, line").forEach((child) => {
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
  colorFullNote: boolean,
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

    // Reset full-note coloring (stems, accidentals, etc.)
    if (colorFullNote) {
      const extras = stavenote.querySelectorAll<SVGGraphicsElement>(
        FULL_NOTE_SELECTORS
      );
      extras.forEach((group) => {
        group.style.removeProperty("fill");
        group.style.removeProperty("stroke");
        group.style.removeProperty("color");
        group.style.transition = "";

        group.querySelectorAll<SVGGraphicsElement>("path, use, polygon, line").forEach((child) => {
          child.style.removeProperty("fill");
          child.style.removeProperty("stroke");
          child.style.removeProperty("color");
        });
      });
    }
  }
}
