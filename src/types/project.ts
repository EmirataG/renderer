/** Background placement crop in normalized image coords (0–1), AR-matched to the
 *  frame. Applied over the stored (uncropped) image at render/export time;
 *  null = centered cover. */
export interface BgCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

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
  /** Placement crop applied over the (uncropped) background image at render time. */
  bgCrop?: BgCrop | null;
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
