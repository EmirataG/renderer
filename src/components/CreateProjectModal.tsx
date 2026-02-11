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

const SCORE_EXTENSIONS = ['.musicxml', '.mxl', '.mei'];
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
  const [isCreating, setIsCreating] = useState(false);

  const scoreInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setStep(1);
    setScoreFile(null);
    setAudioFile(null);
    setProjectName('');
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
    if (!projectName.trim()) return;
    setIsCreating(true);

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: projectName.trim(), viewMode: 'page' }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create project');
      }

      const { id } = await res.json();
      const now = new Date().toISOString();
      const project: Project = {
        id,
        userId: '', // Not needed client-side
        name: projectName.trim(),
        viewMode: 'page',
        createdAt: now,
        updatedAt: now,
      };

      onCreated(project);
      resetState();
      router.push(`/project/${id}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create project', 'error');
      setIsCreating(false);
    }
  }, [projectName, onCreated, resetState, router, showToast]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 max-w-lg w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-neutral-100">New Project</h2>
          <span className="text-xs text-neutral-500">Step {step} of 2</span>
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
                className="px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setStep(2)}
                disabled={!scoreFile || !audioFile}
                className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-2.5 text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-500 transition-colors"
            />

            {/* View mode cards */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              {/* Page view - active */}
              <div className="border-2 border-blue-500/60 bg-blue-500/10 rounded-lg p-3 flex items-center gap-3">
                <div className="w-4 h-4 rounded-full border-2 border-blue-400 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-blue-400" />
                </div>
                <span className="text-sm text-neutral-200">Page view</span>
              </div>

              {/* Single line - disabled */}
              <div className="border-2 border-neutral-700 bg-neutral-800/50 rounded-lg p-3 flex items-center gap-3 opacity-50 cursor-not-allowed">
                <div className="w-4 h-4 rounded-full border-2 border-neutral-600" />
                <div>
                  <span className="text-sm text-neutral-400">Single line</span>
                  <span className="block text-[10px] text-neutral-500 mt-0.5">Coming soon</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setStep(1)}
                className="px-4 py-2 text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleCreate}
                disabled={!projectName.trim() || isCreating}
                className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
      <div className="border-2 border-neutral-700 bg-neutral-800/50 rounded-lg p-3 flex flex-col items-center gap-2">
        <CheckIcon className="w-5 h-5 text-green-400" />
        <span className="text-xs text-neutral-300 text-center truncate w-full">{file.name}</span>
        <button
          onClick={onClear}
          className="text-[10px] text-neutral-500 hover:text-neutral-300 transition-colors"
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
      className={`border-2 border-dashed rounded-lg p-4 flex flex-col items-center gap-2 cursor-pointer transition-colors ${
        isDragOver
          ? 'border-blue-500 bg-blue-500/10'
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
