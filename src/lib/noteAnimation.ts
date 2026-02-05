export interface NoteheadAnimationOptions {
  scale?: number;
  entryMs?: number;
  holdMs?: number;
  exitMs?: number;
  color?: string;
  colorFullNote?: boolean;
}

// Selectors for note sub-elements beyond the notehead (stems, accidentals, etc.)
const FULL_NOTE_SELECTORS = "g.stem, g.accid, g.flag, g.dots, g.artic";

function applyColorToElement(el: SVGGraphicsElement, color: string, transitionMs: number, easing: string) {
  el.style.transition = `fill ${transitionMs}ms ${easing}, stroke ${transitionMs}ms ${easing}`;
  el.style.fill = color;
  el.style.stroke = color;
  el.style.color = color;
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
  }: NoteheadAnimationOptions = {}
) {
  if (!root) return;

  svgIds.forEach((id) => {
    const stavenote = root.querySelector<SVGGElement>(`#${CSS.escape(id)}`);
    if (!stavenote) return;

    const noteheads = stavenote.querySelectorAll<SVGGElement>("g.notehead");

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

    /* ---------------- full note coloring (stem, accidentals, etc.) ---------------- */

    if (color && colorFullNote) {
      const extras = stavenote.querySelectorAll<SVGGraphicsElement>(FULL_NOTE_SELECTORS);
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
