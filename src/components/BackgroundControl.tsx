'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { useToast } from '../hooks/useToast';
import { ImageCropModal } from './ImageCropModal';

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
// Treat aspect ratios within this tolerance as "matching" the frame (skip crop).
const AR_EPSILON = 0.01;

interface BackgroundControlProps {
  projectId: string;
  /** Effective frame aspect ratio (width / height). */
  aspectRatio: number;
  /** Stored cropped image (shown in image mode); kept even while color is active. */
  bgUrl: string | null;
  bgFileName: string | null;
  /** Server URL of the uncropped original (re-crop after reload). */
  originalUrl: string | null;
  bgColor: string | null;
  bgMode: 'color' | 'image';
  /** Update the displayed background image (optimistic preview / clear). */
  onImageUpload: (url: string, fileName: string, file?: File) => void;
  /** Persist a solid background color (null clears it). */
  onColorChange: (color: string | null) => void;
  /** Persist which background is active. */
  onModeChange: (mode: 'color' | 'image') => void;
}

function getExtension(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i).toLowerCase();
}

/**
 * Control-panel background picker: Color / Image.
 *
 * - The active background is an explicit mode (`bgMode`) so a color and an
 *   uploaded image can coexist: switching to Color keeps the image on disk, and
 *   switching back to Image restores it exactly as it was cropped.
 * - Picking an image whose aspect ratio differs from the frame opens a
 *   crop-to-frame modal. The uncropped original is uploaded alongside the
 *   cropped result so the crop can be redone ("Re-crop") — even after a reload.
 */
export function BackgroundControl({
  projectId,
  aspectRatio,
  bgUrl,
  bgFileName,
  originalUrl,
  bgColor,
  bgMode,
  onImageUpload,
  onColorChange,
  onModeChange,
}: BackgroundControlProps) {
  const { show: showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // In-session object URL of the last picked original (for immediate re-crop).
  const [originalSrc, setOriginalSrc] = useState<string | null>(null);
  const originalSrcRef = useRef<string | null>(null);
  const setOriginal = useCallback((url: string | null) => {
    if (originalSrcRef.current && originalSrcRef.current !== url) {
      URL.revokeObjectURL(originalSrcRef.current);
    }
    originalSrcRef.current = url;
    setOriginalSrc(url);
  }, []);
  useEffect(() => () => {
    if (originalSrcRef.current) URL.revokeObjectURL(originalSrcRef.current);
  }, []);

  // While set, the placement modal is open showing this image. `pendingOriginal`
  // is the uncropped file to persist when this crop is applied (null = re-crop,
  // where the original is already stored).
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [pendingOriginal, setPendingOriginal] = useState<File | null>(null);

  // Upload a cropped image (+ optionally its uncropped original): optimistic
  // preview, switch to image mode, then PUT.
  const uploadImage = useCallback(async (cropped: File, original: File | null) => {
    onModeChange('image');

    const blobUrl = URL.createObjectURL(cropped);
    onImageUpload(blobUrl, original?.name ?? cropped.name, cropped);

    const formData = new FormData();
    formData.append('background', cropped);
    if (original) formData.append('original', original);
    try {
      const res = await fetch(`/api/projects/${projectId}/background`, {
        method: 'PUT',
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to upload background');
      }
      showToast('Background updated', 'success');
    } catch (err) {
      URL.revokeObjectURL(blobUrl);
      onImageUpload('', '');
      showToast(err instanceof Error ? err.message : 'Failed to upload background', 'error');
    }
  }, [projectId, onImageUpload, onModeChange, showToast]);

  // A file was chosen: validate, then crop-to-frame if the AR differs.
  const handleFile = useCallback((file: File) => {
    if (!IMAGE_EXTENSIONS.includes(getExtension(file.name))) {
      showToast(`Invalid image. Accepted: ${IMAGE_EXTENSIONS.join(', ')}`, 'error');
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setOriginal(url); // retain for re-crop (revokes any previous)
      const imgAR = img.naturalWidth / img.naturalHeight;
      if (Math.abs(imgAR - aspectRatio) <= AR_EPSILON) {
        uploadImage(file, file); // already matches the frame
      } else {
        setPendingOriginal(file);
        setCropSrc(url); // open placement modal
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      showToast('Could not read that image', 'error');
    };
    img.src = url;
  }, [aspectRatio, uploadImage, showToast, setOriginal]);

  const recropSrc = originalSrc ?? originalUrl;

  return (
    <div className="space-y-2.5">
      {/* Mode selector */}
      <div className="flex gap-1.5">
        {([
          ['color', 'Color', () => onModeChange('color')],
          ['image', 'Image', () => {
            onModeChange('image');
            if (!bgUrl) fileInputRef.current?.click();
          }],
        ] as const).map(([key, label, onClick]) => (
          <button
            key={key}
            onClick={onClick}
            className={`flex-1 py-1.5 text-[10px] font-semibold uppercase tracking-wide border transition-all ${
              bgMode === key
                ? 'bg-accent text-accent-fg border-accent'
                : 'bg-transparent text-fg-subtle border-line-strong hover:text-fg-muted'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {bgMode === 'image' && (
        bgUrl ? (
          <div className="flex items-center gap-2 border border-line p-2">
            <img src={bgUrl} alt="" className="w-10 h-10 object-cover flex-shrink-0" />
            <span className="flex-1 min-w-0 text-[11px] text-fg-muted truncate">
              {bgFileName || 'Background image'}
            </span>
            {recropSrc && (
              <button
                onClick={() => { setPendingOriginal(null); setCropSrc(recropSrc); }}
                className="text-[10px] text-fg-subtle hover:text-fg uppercase tracking-wider font-semibold"
              >
                Re-crop
              </button>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-[10px] text-fg-subtle hover:text-fg uppercase tracking-wider font-semibold"
            >
              Replace
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full border border-dashed border-line-strong hover:border-line p-4 text-[11px] text-fg-subtle hover:text-fg-muted transition-colors"
          >
            Click to add an image
          </button>
        )
      )}

      {bgMode === 'color' && (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={bgColor || '#ffffff'}
            onChange={(e) => onColorChange(e.target.value)}
            className="grunge-color-picker"
          />
          <span className="text-[11px] text-fg-subtle">{bgColor || '#ffffff'}</span>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={IMAGE_EXTENSIONS.join(',')}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = '';
        }}
        className="hidden"
      />

      {cropSrc && (
        <ImageCropModal
          imageSrc={cropSrc}
          aspectRatio={aspectRatio}
          onCrop={(file) => {
            const original = pendingOriginal;
            setPendingOriginal(null);
            setCropSrc(null);
            uploadImage(file, original);
          }}
          onCancel={() => {
            setPendingOriginal(null);
            setCropSrc(null);
          }}
        />
      )}
    </div>
  );
}
