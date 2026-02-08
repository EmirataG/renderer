/**
 * Unplayed score styling utilities
 *
 * Hybrid approach:
 * - Discrete elements (noteheads, stems, accidentals, dots): direct style changes
 * - Continuous elements (staff lines, barlines, beams): clip-path reveal
 */

export type UnplayedStyleMode = 'dimmed' | 'invisible' | 'color';

export interface UnplayedStyleOptions {
  mode: UnplayedStyleMode;
  dimOpacity?: number;      // 0.3 default for 'dimmed'
  unplayedColor?: string;   // For 'color' mode
  playedColor?: string;     // Typically scoreColor
}

/**
 * Selectors for discrete elements that get direct styling
 * These elements have clear play/unplay boundaries tied to individual notes
 */
export const DISCRETE_ELEMENT_SELECTORS = `
  g.notehead use,
  g.stem path,
  g.stem use,
  g.accid use,
  g.dots ellipse,
  g.dots use,
  g.flag use,
  g.artic use
`;

/**
 * Selectors for continuous elements that use clip-path
 * These elements span multiple notes and need progressive reveal
 */
export const CONTINUOUS_ELEMENT_SELECTORS = `
  g.staff > path,
  g.barLine path,
  g.beam polygon,
  g.ledgerLines path
`;

/**
 * Apply unplayed styling to a note element and its children
 * Used for discrete elements (noteheads, stems, accidentals, dots)
 */
export function applyUnplayedStyleToNote(
  noteElement: Element,
  isPlayed: boolean,
  options: UnplayedStyleOptions
): void {
  const targets = noteElement.querySelectorAll<SVGElement>(DISCRETE_ELEMENT_SELECTORS);

  targets.forEach(el => {
    if (options.mode === 'invisible') {
      el.style.opacity = isPlayed ? '1' : '0';
    } else if (options.mode === 'dimmed') {
      el.style.opacity = isPlayed ? '1' : String(options.dimOpacity ?? 0.3);
    } else if (options.mode === 'color') {
      const color = isPlayed ? (options.playedColor ?? '') : (options.unplayedColor ?? '#666666');
      el.style.fill = color;
      el.style.stroke = color;
    }
  });
}

/**
 * Reset unplayed styling on a note element
 * Removes inline styles applied by applyUnplayedStyleToNote
 */
export function resetUnplayedStyleOnNote(noteElement: Element): void {
  const targets = noteElement.querySelectorAll<SVGElement>(DISCRETE_ELEMENT_SELECTORS);

  targets.forEach(el => {
    el.style.opacity = '';
    el.style.fill = '';
    el.style.stroke = '';
  });
}

/**
 * Apply unplayed styling to all notes in a container
 * Used for initial state (before playback) or after reset
 */
export function applyUnplayedStyleToAllNotes(
  container: Element,
  options: UnplayedStyleOptions
): void {
  const notes = container.querySelectorAll('g.note');
  notes.forEach(note => {
    applyUnplayedStyleToNote(note, false, options);
  });
}

/**
 * Reset unplayed styling on all notes in a container
 */
export function resetUnplayedStyleOnAllNotes(container: Element): void {
  const notes = container.querySelectorAll('g.note');
  notes.forEach(note => {
    resetUnplayedStyleOnNote(note);
  });
}
