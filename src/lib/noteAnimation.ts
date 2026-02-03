export interface NoteheadAnimationOptions {
  scale?: number;
  entryMs?: number;
  holdMs?: number;
  exitMs?: number;
  color?: string;
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
  }: NoteheadAnimationOptions = {}
) {
  if (!root) return;

  svgIds.forEach((id) => {
    const stavenote = root.querySelector<SVGGElement>(`#${CSS.escape(id)}`);
    if (!stavenote) return;

    const noteheads = stavenote.querySelectorAll<SVGGElement>(".vf-notehead");

    noteheads.forEach((nh) => {
      /* ---------------- scale (group) ---------------- */

      nh.style.transformBox = "fill-box";
      nh.style.transformOrigin = "center";
      nh.style.transition = `transform ${entryMs}ms ease-out`;
      nh.style.transform = `scale(${scale})`;

      /* ---------------- color override (shapes) ---------------- */

      const shapes = nh.querySelectorAll<SVGGraphicsElement>("path, ellipse");

      shapes.forEach((shape) => {
        if (color) {
          shape.style.transition = `fill ${entryMs}ms ease-out, stroke ${entryMs}ms ease-out`;

          // TEMPORARY override
          shape.style.fill = color;
          shape.style.stroke = color;
        }
      });

      /* ---------------- exit ---------------- */

      const totalDelay = entryMs + holdMs;

      window.setTimeout(() => {
        nh.style.transition = `transform ${exitMs}ms ease-in`;
        nh.style.transform = "scale(1)";

        shapes.forEach((shape) => {
          if (color) {
            shape.style.transition = `fill ${exitMs}ms ease-in, stroke ${exitMs}ms ease-in`;

            // Remove override -> fall back to current score color
            shape.style.removeProperty("fill");
            shape.style.removeProperty("stroke");
          }
        });
      }, totalDelay);
    });
  });
}

export function resetNoteheadAnimations(root: HTMLElement | null) {
  if (!root) return;

  root.querySelectorAll<SVGGElement>(".vf-notehead").forEach((nh) => {
    // Reset scale
    nh.style.transform = "scale(1)";
    nh.style.transition = "";

    // Remove color overrides from shapes
    nh.querySelectorAll<SVGGraphicsElement>("path, ellipse").forEach(
      (shape) => {
        shape.style.removeProperty("fill");
        shape.style.removeProperty("stroke");
        shape.style.transition = "";
      }
    );
  });
}
