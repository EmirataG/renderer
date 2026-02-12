import { useProjectStore } from '../stores/projectStore';

export function SaveIndicator() {
  const saveStatus = useProjectStore((s) => s.saveStatus);
  const lastSaveError = useProjectStore((s) => s.lastSaveError);

  if (saveStatus === 'idle') return null;

  return (
    <div className="flex items-center gap-1.5 text-xs">
      {saveStatus === 'saving' && (
        <span className="text-neutral-400">Saving...</span>
      )}
      {saveStatus === 'saved' && (
        <span className="text-green-500">Saved</span>
      )}
      {saveStatus === 'error' && (
        <span className="text-red-400" title={lastSaveError ?? undefined}>Save error</span>
      )}
    </div>
  );
}
