export interface Project {
  id: string;
  name: string;
  viewMode?: 'page' | 'single-line';
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  scoreUrl?: string;
  scoreFileName?: string;
  audioUrl?: string;
  audioFileName?: string;
  backgroundUrl?: string;
  backgroundFileName?: string;
  /** Uncropped source image, retained so the placement crop can be redone. */
  originalBackgroundUrl?: string;
  originalBackgroundFileName?: string;
  aspectRatio?: number;
  bgColor?: string;
  bgMode?: 'color' | 'image';

  // Settings (all optional -- missing = use defaults)
  scoreColor?: string;
  scoreScale?: number;
  musicFont?: string;
  scoreBorder?: string;
  hideLabels?: boolean;
  scoreRegion?: { x: number; y: number; width: number; height: number; rotation?: number } | null;
  activeNoteheadColor?: string | null;
  activeNoteheadScale?: number;
  activeNoteheadHoldMs?: number;
  activeNoteheadExitMs?: number;
  activeNoteheadUseNoteDuration?: boolean;
  colorAccidentals?: boolean;
  colorDots?: boolean;
  colorArticulations?: boolean;
  fps?: number;
  scoreShadowDistance?: number;
  hideUnplayedNotes?: boolean;
  smoothReveal?: boolean;
  unplayedOpacity?: number;
  activeLinePosition?: number;
  revealLinePosition?: number;

  // Sync anchors (plain object, not Map)
  anchors?: Record<string, number>;
}
