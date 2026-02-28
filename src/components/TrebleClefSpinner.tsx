/**
 * Animated treble clef (G-clef) spinner.
 *
 * The path is extracted from a real MuseScore-engraved treble clef glyph,
 * so it looks exactly like a proper music notation clef.
 * Animated with a gentle pulse and opacity breathe.
 */

interface TrebleClefSpinnerProps {
  /** Pixel height of the clef. Width scales proportionally. */
  size?: number;
  className?: string;
}

// Real treble clef path from MuseScore/Bravura, viewBox "0 -112 64 179"
const TREBLE_CLEF_PATH =
  "M42,20.6C40,21,38.1,21.2,36.2,21.2C21.9,21.2,9.7,11.2,9.7-3.9" +
  "C9.7-16.1,18.3-27,27.1-34.6C28.8-36.1,30.4-37.5,31.9-39" +
  "C32.8-33.6,33.5-28.9,34.2-24.8C25.1-22.1,18.9-12.5,18.9-3.1" +
  "C18.9,3.9,24.4,13.5,32.4,13.5C33.2,13.5,34.1,13.1,34.1,12.2" +
  "C34.1,11.3,33.1,10.8,31.9,10C28,7.6,25.8,5,25.8,0.1" +
  "C25.8-6,30.3-10.9,36.2-12.3L42,20.6" +
  "M33.2-82.2C34.1-86.2,38.7-96.7,43.9-96.7C45.4-96.7,47.8-91.8,47.8-84.9" +
  "C47.8-74.5,40.1-66.7,33.2-59.9C32.6-63.9,32.1-67.8,32.1-72" +
  "C32.1-75.7,32.4-79.1,33.2-82.2" +
  "M56.2,2.1C56.2,9.2,53.3,16.5,46.2,19.4C44.1,7.4,41.4-8.5,40.7-12.9" +
  "C49.7-12.9,56.2-6.8,56.2,2.1" +
  "M12.2,51.3C12.2,57.9,17.3,66.6,30.8,66.6C35.5,66.6,39.6,65.4,43.2,63.2" +
  "C48.6,59.4,50,52.8,50,46.5C50,42.6,49.4,38.1,48.4,32.4" +
  "C48.1,30.4,47.5,27.4,46.9,23.5C56.7,20.3,64,10.1,64-0.2" +
  "C64-15.3,53.3-25.5,38.7-25.5C37.7-31.5,36.7-37.4,35.8-43" +
  "C46.4-54.1,53.7-66.6,53.7-82.5C53.7-91.6,50.9-99,49.3-102.6" +
  "C46.9-107.7,44-111.2,42.2-111.2C41.5-111.2,38.4-110,35.1-106.1" +
  "C28.7-98.5,26.9-85.7,26.9-77.3C26.9-71.9,27.4-67,29.1-55.8" +
  "C29-55.7,23.8-50.4,21.7-48.7C12.6-40.2,0-28.1,0-8.1" +
  "C0,10.6,16.3,25.3,34.9,25.3C37.8,25.3,40.5,25,42.8,24.6" +
  "C44.7,34.2,45.8,41.2,45.8,46.5C45.8,56.9,40.5,62.4,30.4,62.4" +
  "C28,62.4,25.9,61.9,25.7,61.9C25.6,61.8,25.4,61.7,25.4,61.6" +
  "C25.4,61.4,25.6,61.3,25.9,61.2C30.6,60.5,35.3,56.5,35.3,50.1" +
  "C35.3,44.7,31.2,39,23.7,39C16.7,39,12.2,44.7,12.2,51.3";

export function TrebleClefSpinner({
  size = 64,
  className = "",
}: TrebleClefSpinnerProps) {
  // Glyph spans x: 0→64, y: -112→67 → width 64, height 179
  const width = Math.round(size * (64 / 179));

  return (
    <svg
      viewBox="0 -112 64 179"
      width={width}
      height={size}
      className={className}
      aria-hidden="true"
    >
      <style>{`
        @keyframes treble-pulse {
          0%, 100% { opacity: 0.4; transform: scale(0.97); }
          50%      { opacity: 1;   transform: scale(1); }
        }
        .treble-clef-anim {
          transform-origin: center;
          animation: treble-pulse 2s ease-in-out infinite;
        }
      `}</style>
      <path
        className="treble-clef-anim"
        d={TREBLE_CLEF_PATH}
        fill="currentColor"
      />
    </svg>
  );
}
