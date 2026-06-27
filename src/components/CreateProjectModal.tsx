'use client';

import { useState, useRef, useCallback, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/useToast';
import type { Project } from '@/types/project';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (project: Project) => void;
}

const SCORE_EXTENSIONS = ['.xml', '.musicxml', '.mxl', '.mei'];
const AUDIO_EXTENSIONS = ['.mp3', '.wav'];

const ASPECT_RATIOS = [
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
  { label: '4:3', value: 4 / 3 },
  { label: '1:1', value: 1 },
  { label: '4:5', value: 4 / 5 },
] as const;

// Reasonable bounds for a custom aspect ratio (width / height): 1:3 to 3:1.
const AR_MIN = 1 / 3;
const AR_MAX = 3;

function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.slice(lastDot).toLowerCase();
}

export function CreateProjectModal({ isOpen, onClose, onCreated }: CreateProjectModalProps) {
  const router = useRouter();
  const { show: showToast } = useToast();

  const [scoreFile, setScoreFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [projectName, setProjectName] = useState('');
  const [viewMode, setViewMode] = useState<'page' | 'single-line'>('single-line');
  const [isCreating, setIsCreating] = useState(false);

  // Aspect ratio: a preset value, or 'custom' with width/height inputs.
  const [aspectRatio, setAspectRatio] = useState<number>(16 / 9);
  const [isCustomAR, setIsCustomAR] = useState(false);
  const [customW, setCustomW] = useState('16');
  const [customH, setCustomH] = useState('9');

  const scoreInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const customRatio = Number(customW) / Number(customH);
  const customValid =
    Number.isFinite(customRatio) && customRatio >= AR_MIN && customRatio <= AR_MAX;
  const effectiveAR = isCustomAR ? customRatio : aspectRatio;

  const resetState = useCallback(() => {
    setScoreFile(null);
    setAudioFile(null);
    setProjectName('');
    setViewMode('single-line');
    setIsCreating(false);
    setAspectRatio(16 / 9);
    setIsCustomAR(false);
    setCustomW('16');
    setCustomH('9');
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [resetState, onClose]);

  const validateAndSetScore = useCallback((file: File) => {
    const ext = getExtension(file.name);
    if (!SCORE_EXTENSIONS.includes(ext)) {
      showToast(`Invalid score file. Accepted: ${SCORE_EXTENSIONS.join(', ')}`, 'error');
      return;
    }
    setScoreFile(file);
  }, [showToast]);

  const validateAndSetAudio = useCallback((file: File) => {
    const ext = getExtension(file.name);
    if (!AUDIO_EXTENSIONS.includes(ext)) {
      showToast(`Invalid audio file. Accepted: ${AUDIO_EXTENSIONS.join(', ')}`, 'error');
      return;
    }
    setAudioFile(file);
  }, [showToast]);

  const canCreate =
    !!projectName.trim() && !!scoreFile && !!audioFile && (!isCustomAR || customValid);

  const handleCreate = useCallback(async () => {
    if (!projectName.trim() || !scoreFile || !audioFile) return;
    if (isCustomAR && !customValid) {
      showToast(`Aspect ratio must be between 1:3 and 3:1`, 'error');
      return;
    }
    setIsCreating(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);

    try {
      const formData = new FormData();
      formData.append('name', projectName.trim());
      formData.append('viewMode', viewMode);
      formData.append('score', scoreFile);
      formData.append('audio', audioFile);
      formData.append('aspectRatio', String(effectiveAR));

      const res = await fetch('/api/projects', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create project');
      }

      const { id } = await res.json();

      const now = new Date().toISOString();
      const project: Project = {
        id,
        name: projectName.trim(),
        viewMode,
        createdAt: now,
        updatedAt: now,
      };

      onCreated(project);
      resetState();
      router.push(`/project/${id}`);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        showToast('Project creation timed out. Please try again.', 'error');
      } else {
        showToast(err instanceof Error ? err.message : 'Failed to create project', 'error');
      }
      setIsCreating(false);
    } finally {
      clearTimeout(timeoutId);
    }
  }, [projectName, scoreFile, audioFile, viewMode, effectiveAR, isCustomAR, customValid, onCreated, resetState, router, showToast]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-overlay backdrop-blur-sm z-50 flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="bg-surface border border-line p-6 max-w-lg w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-fg">New Project</h2>
        </div>

        <div className="space-y-4">
          {/* Project name */}
          <div>
            <label className="block text-[10px] text-fg-subtle uppercase tracking-wider mb-1.5">Project Name</label>
            <input
              type="text"
              placeholder="My Project"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canCreate) handleCreate();
              }}
              autoFocus
              className="grunge-input w-full px-3 py-2"
            />
          </div>

          {/* Files */}
          <div className="grid grid-cols-2 gap-3">
            <DropZone
              label="Score file"
              icon={<ScoreIcon className="w-5 h-5" />}
              accept={SCORE_EXTENSIONS.join(',')}
              hint={SCORE_EXTENSIONS.join(', ')}
              file={scoreFile}
              onFile={validateAndSetScore}
              onClear={() => setScoreFile(null)}
              inputRef={scoreInputRef}
            />
            <DropZone
              label="Audio file"
              icon={<AudioIcon className="w-5 h-5" />}
              accept={AUDIO_EXTENSIONS.join(',')}
              hint={AUDIO_EXTENSIONS.join(', ')}
              file={audioFile}
              onFile={validateAndSetAudio}
              onClear={() => setAudioFile(null)}
              inputRef={audioInputRef}
            />
          </div>

          {/* View mode */}
          <div>
            <label className="block text-[10px] text-fg-subtle uppercase tracking-wider mb-1.5">Layout</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                ['single-line', 'Single Line'],
                ['page', 'Page'],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className={`border p-2.5 flex items-center gap-2.5 text-left transition-all ${
                    viewMode === mode
                      ? 'border-accent bg-surface-muted'
                      : 'border-line hover:border-line-strong'
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    viewMode === mode ? 'border-accent' : 'border-line-strong'
                  }`}>
                    {viewMode === mode && <div className="w-1.5 h-1.5 rounded-full bg-accent" />}
                  </div>
                  <span className="text-[11px] font-medium text-fg-muted">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Aspect ratio */}
          <div>
            <label className="block text-[10px] text-fg-subtle uppercase tracking-wider mb-1.5">Aspect Ratio</label>
            <div className="flex gap-1.5">
              {ASPECT_RATIOS.map((r) => (
                <button
                  key={r.label}
                  onClick={() => { setIsCustomAR(false); setAspectRatio(r.value); }}
                  className={`flex-1 py-2 text-[10px] font-semibold uppercase tracking-wide border transition-all ${
                    !isCustomAR && Math.abs(r.value - aspectRatio) < 0.01
                      ? 'bg-accent text-accent-fg border-accent'
                      : 'bg-transparent text-fg-subtle border-line-strong hover:text-fg-muted'
                  }`}
                >
                  {r.label}
                </button>
              ))}
              <button
                onClick={() => setIsCustomAR(true)}
                className={`flex-1 py-2 text-[10px] font-semibold uppercase tracking-wide border transition-all ${
                  isCustomAR
                    ? 'bg-accent text-accent-fg border-accent'
                    : 'bg-transparent text-fg-subtle border-line-strong hover:text-fg-muted'
                }`}
              >
                Custom
              </button>
            </div>

            {isCustomAR && (
              <div className="mt-2.5 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={customW}
                  onChange={(e) => setCustomW(e.target.value)}
                  className="grunge-input w-16 px-2 py-1.5 text-center tabular-nums"
                  aria-label="Custom width"
                />
                <span className="text-fg-subtle text-xs">:</span>
                <input
                  type="number"
                  min={1}
                  value={customH}
                  onChange={(e) => setCustomH(e.target.value)}
                  className="grunge-input w-16 px-2 py-1.5 text-center tabular-nums"
                  aria-label="Custom height"
                />
                <span className={`text-[10px] ml-1 ${customValid ? 'text-fg-subtle' : 'text-red-400'}`}>
                  {customValid ? `${customRatio.toFixed(2)}:1` : 'Must be between 1:3 and 3:1'}
                </span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={handleClose} className="grunge-btn grunge-btn-sm">Cancel</button>
            <button
              onClick={handleCreate}
              disabled={!canCreate || isCreating}
              className="grunge-btn-primary grunge-btn-sm"
            >
              {isCreating ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ==================================================================
   DropZone sub-component
   ================================================================== */

interface DropZoneProps {
  label: string;
  icon: React.ReactNode;
  accept: string;
  hint: string;
  file: File | null;
  onFile: (file: File) => void;
  onClear: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

function DropZone({ label, icon, accept, hint, file, onFile, onClear, inputRef }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) onFile(droppedFile);
  }, [onFile]);

  if (file) {
    return (
      <div className="border border-line bg-surface-muted p-3 flex flex-col items-center gap-2">
        <CheckIcon className="w-4 h-4 text-green-500" />
        <span className="text-[11px] text-fg-muted text-center truncate w-full">{file.name}</span>
        <button
          onClick={onClear}
          className="text-[10px] text-fg-subtle hover:text-fg-muted uppercase tracking-wider font-semibold transition-colors"
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`border border-dashed p-4 flex flex-col items-center gap-1.5 cursor-pointer transition-colors ${
        isDragOver
          ? 'border-accent bg-surface-muted'
          : 'border-line-strong hover:border-line-strong'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
        className="hidden"
      />
      <span className="text-fg-subtle">{icon}</span>
      <span className="text-[11px] text-fg-muted">{label}</span>
      <span className="text-[10px] text-fg-subtle">{hint}</span>
    </div>
  );
}

/* ==================================================================
   Icons
   ================================================================== */

function ScoreIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

function AudioIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <polygon points="11,5 6,9 2,9 2,15 6,15 11,19 11,5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="20,6 9,17 4,12" />
    </svg>
  );
}
