/**
 * Manuscript wordmark — "MANUSCRIPT" in serif caps over a five-line music
 * staff with a final barline. Recreated 1:1 from the original 2500×400 raster
 * (staff-line centers, barline positions and letter extents were measured from
 * the PNG) so it renders crisply at any size and recolors with the theme.
 *
 * The lettering uses `var(--fg)` so it flips white→ink between dark and light
 * themes; the staff/barlines use the neutral staff gray (#9f9f9f), which reads
 * on both canvases. `textLength` pins the wordmark to its exact original width
 * regardless of the available serif metrics.
 */
export function ManuscriptLogo({ className }: { className?: string }) {
  const STAFF = '#9f9f9f';
  // Measured staff-line centers and final-barline positions (in 2500×400 space).
  const lineYs = [26, 113, 201, 289, 376];
  const top = 19;
  const bottom = 383;

  return (
    <svg
      viewBox="0 0 2500 400"
      className={className}
      role="img"
      aria-label="Manuscript"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Staff */}
      <g stroke={STAFF} strokeWidth={15} shapeRendering="crispEdges">
        {lineYs.map((y) => (
          <line key={y} x1={0} y1={y} x2={2492} y2={y} />
        ))}
      </g>

      {/* Final barline (thin + thick) */}
      <g stroke={STAFF}>
        <line x1={2419} y1={top} x2={2419} y2={bottom} strokeWidth={15} />
        <line x1={2477} y1={top} x2={2477} y2={bottom} strokeWidth={44} />
      </g>

      {/* Wordmark */}
      <text
        x={150}
        y={320}
        textLength={2204}
        lengthAdjust="spacingAndGlyphs"
        fill="var(--fg, #ffffff)"
        fontFamily='Georgia, "Times New Roman", serif'
        fontSize={347}
        letterSpacing={0}
      >
        MANUSCRIPT
      </text>
    </svg>
  );
}
