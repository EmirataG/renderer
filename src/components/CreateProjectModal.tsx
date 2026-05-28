'use client';

import { useState, useRef, useCallback, useEffect, type DragEvent } from 'react';
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
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

const ASPECT_RATIOS = [
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
  { label: '4:3', value: 4 / 3 },
  { label: '1:1', value: 1 },
  { label: '4:5', value: 4 / 5 },
] as const;

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

  // Background: either an image file or a plain color
  const [bgMode, setBgMode] = useState<'image' | 'color'>('image');
  const [bgImageFile, setBgImageFile] = useState<File | null>(null);
  const [bgImagePreview, setBgImagePreview] = useState<string | null>(null);
  const [bgColor, setBgColor] = useState('#000000');

  // Aspect ratio
  const [aspectRatio, setAspectRatio] = useState<number>(16 / 9);

  // Crop state
  const [showCrop, setShowCrop] = useState(false);
  const [croppedFile, setCroppedFile] = useState<File | null>(null);

  const scoreInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setStep(1);
    setScoreFile(null);
    setAudioFile(null);
    setProjectName('');
    setViewMode('page');
    setIsCreating(false);
    setBgMode('image');
    setBgImageFile(null);
    setBgImagePreview(null);
    setBgColor('#000000');
    setAspectRatio(16 / 9);
    setShowCrop(false);
    setCroppedFile(null);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [resetState, onClose]);

  // Revoke preview URL on cleanup
  useEffect(() => {
    return () => {
      if (bgImagePreview) URL.revokeObjectURL(bgImagePreview);
    };
  }, [bgImagePreview]);

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

  const handleBgImage = useCallback((file: File) => {
    const ext = getExtension(file.name);
    if (!IMAGE_EXTENSIONS.includes(ext)) {
      showToast(`Invalid image file. Accepted: ${IMAGE_EXTENSIONS.join(', ')}`, 'error');
      return;
    }
    setBgImageFile(file);
    setCroppedFile(null);
    if (bgImagePreview) URL.revokeObjectURL(bgImagePreview);
    setBgImagePreview(URL.createObjectURL(file));
  }, [showToast, bgImagePreview]);

  const clearBgImage = useCallback(() => {
    if (bgImagePreview) URL.revokeObjectURL(bgImagePreview);
    setBgImageFile(null);
    setBgImagePreview(null);
    setCroppedFile(null);
  }, [bgImagePreview]);

  // When user wants to crop: show the crop modal
  const handleCropRequest = useCallback(() => {
    if (bgImageFile) setShowCrop(true);
  }, [bgImageFile]);

  const handleCreate = useCallback(async () => {
    if (!projectName.trim() || !scoreFile || !audioFile) return;
    setIsCreating(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);

    try {
      // Build a single FormData with everything (score, audio, bg) so
      // the project is fully ready before we navigate to it.
      const formData = new FormData();
      formData.append('name', projectName.trim());
      formData.append('viewMode', viewMode);
      formData.append('score', scoreFile);
      formData.append('audio', audioFile);
      formData.append('aspectRatio', String(aspectRatio));

      if (bgMode === 'color') {
        formData.append('bgColor', bgColor);
      }

      // Include background image (cropped version takes priority)
      const finalBgFile = croppedFile || bgImageFile;
      if (bgMode === 'image' && finalBgFile) {
        formData.append('background', finalBgFile);
      }

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
  }, [projectName, scoreFile, audioFile, viewMode, aspectRatio, bgMode, bgColor, bgImageFile, croppedFile, onCreated, resetState, router, showToast]);

  if (!isOpen) return null;

  const selectedRatioLabel = ASPECT_RATIOS.find(r => Math.abs(r.value - aspectRatio) < 0.01)?.label;
  const needsCrop = bgMode === 'image' && bgImageFile && !croppedFile;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center"
        onClick={(e) => {
          if (e.target === e.currentTarget) handleClose();
        }}
      >
        <div className="bg-[#0a0a0a] border border-neutral-800 p-6 max-w-lg w-full mx-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-neutral-200">New Project</h2>
            <span className="text-[10px] text-neutral-600 tabular-nums">Step {step}/2</span>
          </div>

          {step === 1 ? (
            /* Step 1: File Upload */
            <div>
              <p className="text-[11px] text-neutral-500 mb-4">Upload your score and audio files</p>
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

              <div className="flex justify-end gap-2 mt-6">
                <button onClick={handleClose} className="grunge-btn grunge-btn-sm">Cancel</button>
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
            /* Step 2: Project Details + Background + Aspect Ratio */
            <div className="space-y-4">
              {/* Project name */}
              <div>
                <label className="block text-[10px] text-neutral-500 uppercase tracking-wider mb-1.5">Project Name</label>
                <input
                  type="text"
                  placeholder="My Project"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && projectName.trim()) handleCreate();
                  }}
                  autoFocus
                  className="grunge-input w-full px-3 py-2"
                />
              </div>

              {/* View mode */}
              <div>
                <label className="block text-[10px] text-neutral-500 uppercase tracking-wider mb-1.5">Layout</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setViewMode('page')}
                    className={`border p-2.5 flex items-center gap-2.5 text-left transition-all ${
                      viewMode === 'page'
                        ? 'border-white bg-white/5'
                        : 'border-neutral-800 hover:border-neutral-600'
                    }`}
                  >
                    <div className={`w-3 h-3 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      viewMode === 'page' ? 'border-white' : 'border-neutral-600'
                    }`}>
                      {viewMode === 'page' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <span className="text-[11px] font-medium text-neutral-300">Page</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('single-line')}
                    className={`border p-2.5 flex items-center gap-2.5 text-left transition-all ${
                      viewMode === 'single-line'
                        ? 'border-white bg-white/5'
                        : 'border-neutral-800 hover:border-neutral-600'
                    }`}
                  >
                    <div className={`w-3 h-3 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      viewMode === 'single-line' ? 'border-white' : 'border-neutral-600'
                    }`}>
                      {viewMode === 'single-line' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <span className="text-[11px] font-medium text-neutral-300">Single Line</span>
                  </button>
                </div>
              </div>

              {/* Aspect ratio */}
              <div>
                <label className="block text-[10px] text-neutral-500 uppercase tracking-wider mb-1.5">Aspect Ratio</label>
                <div className="flex gap-1.5">
                  {ASPECT_RATIOS.map((r) => (
                    <button
                      key={r.label}
                      onClick={() => setAspectRatio(r.value)}
                      className={`flex-1 py-2 text-[10px] font-semibold uppercase tracking-wide border transition-all cursor-pointer ${
                        Math.abs(r.value - aspectRatio) < 0.01
                          ? 'bg-white text-black border-white'
                          : 'bg-transparent text-neutral-500 border-neutral-700 hover:border-neutral-500 hover:text-neutral-300'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Background */}
              <div>
                <label className="block text-[10px] text-neutral-500 uppercase tracking-wider mb-1.5">Background</label>
                {/* Mode toggle */}
                <div className="flex gap-1.5 mb-2.5">
                  <button
                    onClick={() => setBgMode('image')}
                    className={`flex-1 py-1.5 text-[10px] font-semibold uppercase tracking-wide border transition-all cursor-pointer ${
                      bgMode === 'image'
                        ? 'bg-white text-black border-white'
                        : 'bg-transparent text-neutral-500 border-neutral-700 hover:border-neutral-500 hover:text-neutral-300'
                    }`}
                  >
                    Image
                  </button>
                  <button
                    onClick={() => setBgMode('color')}
                    className={`flex-1 py-1.5 text-[10px] font-semibold uppercase tracking-wide border transition-all cursor-pointer ${
                      bgMode === 'color'
                        ? 'bg-white text-black border-white'
                        : 'bg-transparent text-neutral-500 border-neutral-700 hover:border-neutral-500 hover:text-neutral-300'
                    }`}
                  >
                    Color
                  </button>
                </div>

                {bgMode === 'image' ? (
                  <div>
                    {bgImagePreview ? (
                      <div className="border border-neutral-800 p-2 flex items-center gap-3">
                        <img
                          src={bgImagePreview}
                          alt="Background preview"
                          className="w-12 h-12 object-cover flex-shrink-0"
                          style={{ borderRadius: 2 }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-neutral-300 truncate">{bgImageFile?.name}</p>
                          <div className="flex gap-2 mt-1">
                            <button
                              onClick={handleCropRequest}
                              className="text-[10px] text-neutral-500 hover:text-white transition-colors uppercase tracking-wider font-semibold"
                            >
                              Crop to {selectedRatioLabel}
                            </button>
                            {croppedFile && (
                              <span className="text-[10px] text-green-500 uppercase tracking-wider font-semibold">Cropped</span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={clearBgImage}
                          className="text-neutral-600 hover:text-neutral-300 transition-colors p-1"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() => bgInputRef.current?.click()}
                        className="border border-dashed border-neutral-700 hover:border-neutral-500 p-4 flex flex-col items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <svg className="w-5 h-5 text-neutral-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <polyline points="21,15 16,10 5,21" />
                        </svg>
                        <span className="text-[11px] text-neutral-500">Drop image or click to browse</span>
                        <span className="text-[10px] text-neutral-700">Optional</span>
                      </div>
                    )}
                    <input
                      ref={bgInputRef}
                      type="file"
                      accept={IMAGE_EXTENSIONS.join(',')}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleBgImage(f);
                        e.target.value = '';
                      }}
                      className="hidden"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                      className="grunge-color-picker"
                    />
                    <span className="text-[11px] text-neutral-600">{bgColor}</span>
                    {/* Small preview of what the bg looks like at the chosen ratio */}
                    <div
                      className="ml-auto border border-neutral-800"
                      style={{
                        backgroundColor: bgColor,
                        width: aspectRatio >= 1 ? 48 : 48 * aspectRatio,
                        height: aspectRatio >= 1 ? 48 / aspectRatio : 48,
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setStep(1)} className="grunge-btn grunge-btn-sm">Back</button>
                <button
                  onClick={handleCreate}
                  disabled={!projectName.trim() || isCreating}
                  className="grunge-btn-primary grunge-btn-sm"
                >
                  {isCreating ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Image Crop Modal */}
      {showCrop && bgImagePreview && (
        <ImageCropModal
          imageSrc={bgImagePreview}
          aspectRatio={aspectRatio}
          onCrop={(file) => {
            setCroppedFile(file);
            setShowCrop(false);
          }}
          onCancel={() => setShowCrop(false)}
        />
      )}
    </>
  );
}

/* ==================================================================
   Image Crop Modal
   ================================================================== */

interface ImageCropModalProps {
  imageSrc: string;
  aspectRatio: number;
  onCrop: (file: File) => void;
  onCancel: () => void;
}

function ImageCropModal({ imageSrc, aspectRatio, onCrop, onCancel }: ImageCropModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Crop region in image-relative coordinates (0-1)
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [cropW, setCropW] = useState(1);
  const [cropH, setCropH] = useState(1);
  const [imgNatW, setImgNatW] = useState(0);
  const [imgNatH, setImgNatH] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ mx: 0, my: 0, ox: 0, oy: 0 });

  // Initialize crop region when image loads
  const handleImgLoad = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    const natW = img.naturalWidth;
    const natH = img.naturalHeight;
    setImgNatW(natW);
    setImgNatH(natH);

    const imgAR = natW / natH;
    let w: number, h: number;
    if (imgAR > aspectRatio) {
      // Image is wider than target — crop width
      h = 1;
      w = (aspectRatio / imgAR);
    } else {
      // Image is taller than target — crop height
      w = 1;
      h = (imgAR / aspectRatio);
    }
    setCropW(w);
    setCropH(h);
    setCropX((1 - w) / 2);
    setCropY((1 - h) / 2);
  }, [aspectRatio]);

  // Drag to move crop region
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    dragStart.current = { mx: e.clientX, my: e.clientY, ox: cropX, oy: cropY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [cropX, cropY]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging || !containerRef.current || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const dx = (e.clientX - dragStart.current.mx) / rect.width;
    const dy = (e.clientY - dragStart.current.my) / rect.height;
    const newX = Math.max(0, Math.min(1 - cropW, dragStart.current.ox + dx));
    const newY = Math.max(0, Math.min(1 - cropH, dragStart.current.oy + dy));
    setCropX(newX);
    setCropY(newY);
  }, [dragging, cropW, cropH]);

  const handlePointerUp = useCallback(() => {
    setDragging(false);
  }, []);

  const handleCrop = useCallback(async () => {
    if (!imgNatW || !imgNatH) return;

    const canvas = document.createElement('canvas');
    const sx = Math.round(cropX * imgNatW);
    const sy = Math.round(cropY * imgNatH);
    const sw = Math.round(cropW * imgNatW);
    const sh = Math.round(cropH * imgNatH);
    canvas.width = sw;
    canvas.height = sh;

    const ctx = canvas.getContext('2d')!;
    const img = imgRef.current!;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.92)
    );
    const file = new File([blob], 'background-cropped.jpg', { type: 'image/jpeg' });
    onCrop(file);
  }, [cropX, cropY, cropW, cropH, imgNatW, imgNatH, onCrop]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 bg-[#0a0a0a] border border-neutral-800 p-5 max-w-2xl w-full mx-4">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-neutral-200 mb-4">
          Crop Background
        </h3>

        {/* Crop area */}
        <div
          ref={containerRef}
          className="relative select-none overflow-hidden bg-black mb-4"
          style={{ maxHeight: '60vh' }}
        >
          <img
            ref={imgRef}
            src={imageSrc}
            alt="Crop preview"
            onLoad={handleImgLoad}
            className="w-full h-auto block"
            draggable={false}
          />
          {/* Dark overlay outside crop */}
          {imgNatW > 0 && (
            <>
              {/* Top */}
              <div className="absolute left-0 right-0 top-0 bg-black/60" style={{ height: `${cropY * 100}%` }} />
              {/* Bottom */}
              <div className="absolute left-0 right-0 bottom-0 bg-black/60" style={{ height: `${(1 - cropY - cropH) * 100}%` }} />
              {/* Left */}
              <div className="absolute left-0 bg-black/60" style={{ top: `${cropY * 100}%`, height: `${cropH * 100}%`, width: `${cropX * 100}%` }} />
              {/* Right */}
              <div className="absolute right-0 bg-black/60" style={{ top: `${cropY * 100}%`, height: `${cropH * 100}%`, width: `${(1 - cropX - cropW) * 100}%` }} />

              {/* Crop box (draggable) */}
              <div
                className="absolute border border-white/80"
                style={{
                  left: `${cropX * 100}%`,
                  top: `${cropY * 100}%`,
                  width: `${cropW * 100}%`,
                  height: `${cropH * 100}%`,
                  cursor: dragging ? 'grabbing' : 'grab',
                }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              >
                {/* Rule of thirds grid */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/20" />
                  <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/20" />
                  <div className="absolute top-1/3 left-0 right-0 h-px bg-white/20" />
                  <div className="absolute top-2/3 left-0 right-0 h-px bg-white/20" />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="grunge-btn grunge-btn-sm">Cancel</button>
          <button onClick={handleCrop} className="grunge-btn-primary grunge-btn-sm">Apply Crop</button>
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
      <div className="border border-neutral-800 bg-neutral-900/50 p-3 flex flex-col items-center gap-2">
        <CheckIcon className="w-4 h-4 text-green-500" />
        <span className="text-[11px] text-neutral-300 text-center truncate w-full">{file.name}</span>
        <button
          onClick={onClear}
          className="text-[10px] text-neutral-600 hover:text-neutral-300 uppercase tracking-wider font-semibold transition-colors"
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
      <span className="text-neutral-600">{icon}</span>
      <span className="text-[11px] text-neutral-400">{label}</span>
      <span className="text-[10px] text-neutral-700">{hint}</span>
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
