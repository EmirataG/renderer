/**
 * Square Manuscript mark used in headers/favicon spots — a serif "M" on a
 * five-line staff with a final barline. Recreated 1:1 from the original 500×500
 * raster (measured staff-line centers, barline positions and the M's extent).
 *
 * Background is transparent; the "M" uses `var(--fg)` so it is white on a dark
 * theme and ink on a light one. The staff/barlines use the neutral staff gray
 * (#9f9f9f), which reads on either canvas.
 */
export function ManuscriptMark({ className }: { className?: string }) {
  const STAFF = '#9f9f9f';
  const lineYs = [9, 129, 249, 369, 489];

  return (
    <svg
      viewBox="0 0 500 500"
      className={className}
      role="img"
      aria-label="Manuscript"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Staff */}
      <g stroke={STAFF} strokeWidth={20} shapeRendering="crispEdges">
        {lineYs.map((y) => (
          <line key={y} x1={0} y1={y} x2={500} y2={y} />
        ))}
      </g>

      {/* Final barline (thin + thick) */}
      <g stroke={STAFF}>
        <line x1={389} y1={0} x2={389} y2={500} strokeWidth={20} />
        <line x1={469} y1={0} x2={469} y2={500} strokeWidth={60} />
      </g>

      {/* Serif M, drawn over the staff */}
      <text
        x={42}
        y={373}
        textLength={313}
        lengthAdjust="spacingAndGlyphs"
        fill="var(--fg, #ffffff)"
        fontFamily='Georgia, "Times New Roman", serif'
        fontSize={357}
      >
        M
      </text>
    </svg>
  );
}
