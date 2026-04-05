import { useProjectStore } from '../stores/projectStore';
import { useSyncStore } from '../stores/syncStore';
import type { ProjectSettings } from '../stores/projectStore';

const SAVE_DEBOUNCE_MS = 1500;
const SAVED_DISPLAY_MS = 3000;

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let savedDismissTimer: ReturnType<typeof setTimeout> | null = null;

/** Extract only saveable settings keys from the project store state. */
function getSaveableSettings(state: ReturnType<typeof useProjectStore.getState>): ProjectSettings {
  return {
    viewMode: state.viewMode,
    scoreColor: state.scoreColor,
    scoreScale: state.scoreScale,
    musicFont: state.musicFont,
    scoreBorder: state.scoreBorder,
    hideLabels: state.hideLabels,
    scoreRegion: state.scoreRegion,
    activeNoteheadColor: state.activeNoteheadColor,
    activeNoteheadScale: state.activeNoteheadScale,
    activeNoteheadEntryMs: state.activeNoteheadEntryMs,
    activeNoteheadHoldMs: state.activeNoteheadHoldMs,
    activeNoteheadExitMs: state.activeNoteheadExitMs,
    activeNoteheadUseNoteDuration: state.activeNoteheadUseNoteDuration,
    colorFullNote: state.colorFullNote,
    fps: state.fps,
    scoreShadowDistance: state.scoreShadowDistance,
    hideUnplayedNotes: state.hideUnplayedNotes,
    smoothReveal: state.smoothReveal,
  };
}

async function performSave(projectId: string): Promise<void> {
  const { setSaveStatus } = useProjectStore.getState();
  setSaveStatus('saving');

  // Clear any existing dismiss timer since we're saving again
  if (savedDismissTimer) {
    clearTimeout(savedDismissTimer);
    savedDismissTimer = null;
  }

  try {
    const state = useProjectStore.getState();
    const settings = getSaveableSettings(state);
    const anchors = useSyncStore.getState().anchors;
    const serializedAnchors = Object.fromEntries(anchors);

    const response = await fetch(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings, anchors: serializedAnchors, name: state.projectName }),
    });

    if (response.ok) {
      setSaveStatus('saved');
      savedDismissTimer = setTimeout(() => {
        useProjectStore.getState().setSaveStatus('idle');
        savedDismissTimer = null;
      }, SAVED_DISPLAY_MS);
    } else {
      setSaveStatus('error', response.statusText);
    }
  } catch (err) {
    setSaveStatus('error', err instanceof Error ? err.message : 'Save failed');
  }
}

function scheduleSave(): void {
  const { projectId } = useProjectStore.getState();
  if (!projectId) return;

  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    performSave(projectId);
    saveTimer = null;
  }, SAVE_DEBOUNCE_MS);
}

/**
 * Initialize auto-save subscriptions on projectStore and syncStore.
 * Call AFTER initial settings have been loaded to avoid spurious saves.
 * Returns an unsubscribe function to tear down all subscriptions and timers.
 */
export function initAutoSave(): () => void {
  // Subscribe to project settings changes (JSON deep equality)
  const unsub1 = useProjectStore.subscribe(
    (state) => getSaveableSettings(state),
    () => scheduleSave(),
    { equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b) }
  );

  // Subscribe to project name changes
  const unsub3 = useProjectStore.subscribe(
    (state) => state.projectName,
    () => scheduleSave(),
  );

  // Subscribe to sync anchor changes (Map value equality)
  const unsub2 = useSyncStore.subscribe(
    (state) => state.anchors,
    () => scheduleSave(),
    {
      equalityFn: (a, b) => {
        if (a.size !== b.size) return false;
        for (const [k, v] of a) {
          if (b.get(k) !== v) return false;
        }
        return true;
      },
    }
  );

  return () => {
    unsub1();
    unsub2();
    unsub3();
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (savedDismissTimer) {
      clearTimeout(savedDismissTimer);
      savedDismissTimer = null;
    }
  };
}
