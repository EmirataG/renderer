import { create } from 'zustand';

export type UnplayedStyleMode = 'dimmed' | 'invisible' | 'color';

interface UnplayedStyleStore {
  enabled: boolean;
  mode: UnplayedStyleMode;
  dimOpacity: number;        // 0.3 default for 'dimmed' mode
  unplayedColor: string;     // For 'color' mode

  // Actions
  setEnabled: (enabled: boolean) => void;
  setMode: (mode: UnplayedStyleMode) => void;
  setDimOpacity: (opacity: number) => void;
  setUnplayedColor: (color: string) => void;
}

export const useUnplayedStyleStore = create<UnplayedStyleStore>((set) => ({
  enabled: false,
  mode: 'dimmed',
  dimOpacity: 0.3,
  unplayedColor: '#666666',

  setEnabled: (enabled) => set({ enabled }),
  setMode: (mode) => set({ mode }),
  setDimOpacity: (dimOpacity) => set({ dimOpacity }),
  setUnplayedColor: (unplayedColor) => set({ unplayedColor }),
}));
