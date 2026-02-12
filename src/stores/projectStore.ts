import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { BorderStyle } from '../borders';
import type { ScoreRegion } from '../types/score';

export interface ProjectSettings {
  scoreColor: string;
  scoreScale: number;
  musicFont: string;
  scoreBorder: BorderStyle;
  hideLabels: boolean;
  scoreRegion: ScoreRegion | null;
  activeNoteheadColor: string | null;
  activeNoteheadScale: number;
  activeNoteheadEntryMs: number;
  activeNoteheadHoldMs: number;
  activeNoteheadExitMs: number;
  colorFullNote: boolean;
  fps: number;
  scoreShadowDistance: number;
  hideUnplayedNotes: boolean;
  smoothReveal: boolean;
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export const DEFAULT_SETTINGS: ProjectSettings = {
  scoreColor: '#000000',
  scoreScale: 1.0,
  musicFont: 'Bravura',
  scoreBorder: 'none',
  hideLabels: false,
  scoreRegion: null,
  activeNoteheadColor: '#000000',
  activeNoteheadScale: 1.2,
  activeNoteheadEntryMs: 50,
  activeNoteheadHoldMs: 200,
  activeNoteheadExitMs: 500,
  colorFullNote: false,
  fps: 30,
  scoreShadowDistance: 0,
  hideUnplayedNotes: true,
  smoothReveal: true,
};

interface ProjectStore extends ProjectSettings {
  projectId: string | null;
  saveStatus: SaveStatus;
  lastSaveError: string | null;

  // Actions
  setSetting: <K extends keyof ProjectSettings>(key: K, value: ProjectSettings[K]) => void;
  loadSettings: (settings: Partial<ProjectSettings>) => void;
  setProjectId: (id: string | null) => void;
  setSaveStatus: (status: SaveStatus, error?: string) => void;
  resetSettings: () => void;
}

export const useProjectStore = create<ProjectStore>()(
  subscribeWithSelector((set) => ({
    ...DEFAULT_SETTINGS,
    projectId: null,
    saveStatus: 'idle' as SaveStatus,
    lastSaveError: null,

    setSetting: (key, value) => set({ [key]: value } as Partial<ProjectStore>),

    loadSettings: (settings) => set(settings as Partial<ProjectStore>),

    setProjectId: (id) => set({ projectId: id }),

    setSaveStatus: (status, error) =>
      set({ saveStatus: status, lastSaveError: error ?? null }),

    resetSettings: () =>
      set({
        ...DEFAULT_SETTINGS,
        projectId: null,
        saveStatus: 'idle' as SaveStatus,
        lastSaveError: null,
      }),
  }))
);
