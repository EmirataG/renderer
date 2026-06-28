import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { BorderStyle } from '../borders';
import type { ScoreRegion } from '../types/score';

export interface ProjectSettings {
  viewMode: 'page' | 'single-line';
  scoreColor: string;
  scoreScale: number;
  musicFont: string;
  scoreBorder: BorderStyle;
  hideLabels: boolean;
  scoreRegion: ScoreRegion | null;
  activeNoteheadColor: string | null;
  activeNoteheadScale: number;
  activeNoteheadHoldMs: number;
  activeNoteheadExitMs: number;
  activeNoteheadUseNoteDuration: boolean;
  colorAccidentals: boolean;
  colorDots: boolean;
  colorArticulations: boolean;
  fps: number;
  scoreShadowDistance: number;
  hideUnplayedNotes: boolean;
  smoothReveal: boolean;
  /** Opacity (0..1) of the unplayed region when hideUnplayedNotes is on.
   *  0 = fully hidden; >0 = unplayed content shown faded at this opacity. */
  unplayedOpacity: number;
  /** Solid background color for the frame. Defaults to white. */
  bgColor: string | null;
  /** Which background to show: a solid color or the uploaded image. */
  bgMode: 'color' | 'image';
  /** Frame aspect ratio (width / height). */
  aspectRatio: number;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export const DEFAULT_SETTINGS: ProjectSettings = {
  viewMode: 'single-line',
  scoreColor: '#000000',
  scoreScale: 1.0,
  musicFont: 'Bravura',
  scoreBorder: 'none',
  hideLabels: false,
  scoreRegion: null,
  activeNoteheadColor: '#000000',
  activeNoteheadScale: 1.2,
  activeNoteheadHoldMs: 200,
  activeNoteheadExitMs: 500,
  activeNoteheadUseNoteDuration: false,
  colorAccidentals: false,
  colorDots: false,
  colorArticulations: false,
  fps: 30,
  scoreShadowDistance: 0,
  hideUnplayedNotes: false,
  smoothReveal: true,
  unplayedOpacity: 0,
  bgColor: '#ffffff',
  bgMode: 'color',
  aspectRatio: 16 / 9,
};

interface ProjectStore extends ProjectSettings {
  projectId: string | null;
  projectName: string;
  saveStatus: SaveStatus;
  lastSaveError: string | null;

  // Actions
  setSetting: <K extends keyof ProjectSettings>(key: K, value: ProjectSettings[K]) => void;
  loadSettings: (settings: Partial<ProjectSettings>) => void;
  setProjectId: (id: string | null) => void;
  setProjectName: (name: string) => void;
  setSaveStatus: (status: SaveStatus, error?: string) => void;
  resetSettings: () => void;
}

export const useProjectStore = create<ProjectStore>()(
  subscribeWithSelector((set) => ({
    ...DEFAULT_SETTINGS,
    projectId: null,
    projectName: 'Untitled Project',
    saveStatus: 'idle' as SaveStatus,
    lastSaveError: null,

    setSetting: (key, value) => set({ [key]: value } as Partial<ProjectStore>),

    loadSettings: (settings) => set(settings as Partial<ProjectStore>),

    setProjectId: (id) => set({ projectId: id }),

    setProjectName: (name) => set({ projectName: name }),

    setSaveStatus: (status, error) =>
      set({ saveStatus: status, lastSaveError: error ?? null }),

    resetSettings: () =>
      set({
        ...DEFAULT_SETTINGS,
        projectId: null,
        projectName: 'Untitled Project',
        saveStatus: 'idle' as SaveStatus,
        lastSaveError: null,
      }),
  }))
);
