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

function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.slice(lastDot).toLowerCase();
}

export function CreateProjectModal({ isOpen, onClose, onCreated }: CreateProjectModalProps) {
  const router = useRouter();
  const { show: showToast } = useToast();

  const [step, setStep] = useState<1 | 2>(1);
  const [scoreFile, setScoreFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [projectName, setProjectName] = useState('');
  const [viewMode, setViewMode] = useState<'page' | 'single-line'>('page');
  const [isCreating, setIsCreating] = useState(false);

  const scoreInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setStep(1);
    setScoreFile(null);
    setAudioFile(null);
    setProjectName('');
    setViewMode('page');
    setIsCreating(false);
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

  const handleCreate = useCallback(async () => {
    if (!projectName.trim() || !scoreFile || !audioFile) return;
    setIsCreating(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);
    const t0 = performance.now();

    try {
      const formData = new FormData();
      formData.append('name', projectName.trim());
      formData.append('viewMode', viewMode);
      formData.append('score', scoreFile);
      formData.append('audio', audioFile);

      console.log('[CreateProject] starting fetch', { scoreSize: scoreFile.size, audioSize: audioFile.size });
      const res = await fetch('/api/projects', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
        // NO Content-Type header -- browser sets multipart boundary automatically
      });
      console.log('[CreateProject] fetch responded', { status: res.status, elapsed: `${(performance.now() - t0).toFixed(0)}ms` });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create project');
      }

      const { id } = await res.json();
      console.log('[CreateProject] project created', { id, elapsed: `${(performance.now() - t0).toFixed(0)}ms` });

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
      console.log('[CreateProject] navigating to project', { elapsed: `${(performance.now() - t0).toFixed(0)}ms` });
      router.push(`/project/${id}`);
    } catch (err) {
      console.error('[CreateProject] error', { error: err, elapsed: `${(performance.now() - t0).toFixed(0)}ms` });
      if (err instanceof DOMException && err.name === 'AbortError') {
        showToast('Project creation timed out. Please try again.', 'error');
      } else {
        showToast(err instanceof Error ? err.message : 'Failed to create project', 'error');
      }
      setIsCreating(false);
    } finally {
      clearTimeout(timeoutId);
    }
  }, [projectName, scoreFile, audioFile, onCreated, resetState, router, showToast]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="bg-black border-2 border-neutral-700 p-6 max-w-lg w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-100" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>New Project</h2>
          <span className="text-xs text-neutral-500 font-mono">Step {step}/2</span>
        </div>

        {step === 1 ? (
          /* Step 1: File Upload */
          <div>
            <p className="text-sm text-neutral-400 mb-4">Upload your score and audio files</p>
            <div className="grid grid-cols-2 gap-3">
              <DropZone
                label="Score file"
                icon={<ScoreIcon className="w-6 h-6" />}
                accept={SCORE_EXTENSIONS.join(',')}
                hint={SCORE_EXTENSIONS.join(', ')}
                file={scoreFile}
                onFile={validateAndSetScore}
                onClear={() => setScoreFile(null)}
                inputRef={scoreInputRef}
              />
              <DropZone
                label="Audio file"
                icon={<AudioIcon className="w-6 h-6" />}
                accept={AUDIO_EXTENSIONS.join(',')}
                hint={AUDIO_EXTENSIONS.join(', ')}
                file={audioFile}
                onFile={validateAndSetAudio}
                onClear={() => setAudioFile(null)}
                inputRef={audioInputRef}
              />
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={handleClose}
                className="grunge-btn grunge-btn-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => setStep(2)}
                disabled={!scoreFile || !audioFile}
                className="grunge-btn-primary grunge-btn-sm"
              >
                Next
              </button>
            </div>
          </div>
        ) : (
          /* Step 2: Project Details */
          <div>
            <p className="text-sm text-neutral-400 mb-4">Name your project and choose a view mode</p>

            {/* Project name input */}
            <input
              type="text"
              placeholder="Project name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && projectName.trim()) handleCreate();
              }}
              autoFocus
              className="grunge-input w-full px-4 py-2.5"
            />

            {/* View mode cards */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              {/* Page view */}
              <button
                type="button"
                onClick={() => setViewMode('page')}
                className={`border-2 p-3 flex items-center gap-3 text-left transition-colors ${
                  viewMode === 'page'
                    ? 'border-white bg-white/5'
                    : 'border-neutral-700 hover:border-neutral-500'
                }`}
              >
                <div className="w-4 h-4 border-2 border-white flex items-center justify-center flex-shrink-0">
                  {viewMode === 'page' && <div className="w-2 h-2 bg-white" />}
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-200">Page view</span>
              </button>

              {/* Single line */}
              <button
                type="button"
                onClick={() => setViewMode('single-line')}
                className={`border-2 p-3 flex items-center gap-3 text-left transition-colors ${
                  viewMode === 'single-line'
                    ? 'border-white bg-white/5'
                    : 'border-neutral-700 hover:border-neutral-500'
                }`}
              >
                <div className="w-4 h-4 border-2 border-white flex items-center justify-center flex-shrink-0">
                  {viewMode === 'single-line' && <div className="w-2 h-2 bg-white" />}
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-200">Single line</span>
              </button>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setStep(1)}
                className="grunge-btn grunge-btn-sm"
              >
                Back
              </button>
              <button
                onClick={handleCreate}
                disabled={!projectName.trim() || isCreating}
                className="grunge-btn-primary grunge-btn-sm"
              >
                {isCreating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- DropZone sub-component ---- */

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
      <div className="border-2 border-neutral-700 bg-neutral-900 p-3 flex flex-col items-center gap-2">
        <CheckIcon className="w-5 h-5 text-green-400" />
        <span className="text-xs text-neutral-300 text-center truncate w-full">{file.name}</span>
        <button
          onClick={onClear}
          className="text-[10px] text-neutral-500 hover:text-neutral-300 uppercase tracking-wider font-bold transition-colors"
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
      className={`border-2 border-dashed p-4 flex flex-col items-center gap-2 cursor-pointer transition-colors ${
        isDragOver
          ? 'border-white bg-white/5'
          : 'border-neutral-700 hover:border-neutral-500'
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
      <span className="text-neutral-500">{icon}</span>
      <span className="text-xs text-neutral-400">{label}</span>
      <span className="text-[10px] text-neutral-600">{hint}</span>
    </div>
  );
}

/* ---- Icons ---- */

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
