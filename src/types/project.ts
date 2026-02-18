export interface Project {
  id: string;
  name: string;
  viewMode: 'page';
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  scoreUrl?: string;
  scoreFileName?: string;
  audioUrl?: string;
  audioFileName?: string;
  backgroundUrl?: string;
  backgroundFileName?: string;

  // Settings (all optional -- missing = use defaults)
  scoreColor?: string;
  scoreScale?: number;
  musicFont?: string;
  scoreBorder?: string;
  hideLabels?: boolean;
  scoreRegion?: { x: number; y: number; width: number; height: number; rotation?: number; perspective?: { topLeft: { x: number; y: number }; topRight: { x: number; y: number }; bottomRight: { x: number; y: number }; bottomLeft: { x: number; y: number } } } | null;
  activeNoteheadColor?: string | null;
  activeNoteheadScale?: number;
  activeNoteheadEntryMs?: number;
  activeNoteheadHoldMs?: number;
  activeNoteheadExitMs?: number;
  colorFullNote?: boolean;
  fps?: number;
  scoreShadowDistance?: number;
  hideUnplayedNotes?: boolean;
  smoothReveal?: boolean;

  // Sync anchors (plain object, not Map)
  anchors?: Record<string, number>;
}
