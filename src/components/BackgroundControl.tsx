'use client';

import { useRef, useState, useCallback } from 'react';
import { useToast } from '../hooks/useToast';
import { ImageCropModal } from './ImageCropModal';
import { CropIcon, ReplaceIcon } from './icons';
import type { BgCrop } from '../types/project';

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
// Treat aspect ratios within this tolerance as "matching" the frame (skip crop).
const AR_EPSILON = 0.01;

interface BackgroundControlProps {
  projectId: string;
  /** Effective frame aspect ratio (width / height). */
  aspectRatio: number;
  /** Stored (uncropped) image; kept even while color is active. */
  bgUrl: string | null;
  bgFileName: string | null;
  /** Current placement crop, applied non-destructively over bgUrl. */
  bgCrop: BgCrop | null;
  bgColor: string | null;
  bgMode: 'color' | 'image';
  /** Update the displayed background image (optimistic preview / clear). */
  onImageUpload: (url: string, fileName: string, file?: File) => void;
  /** Persist the placement crop (null = centered cover). */
  onCropChange: (crop: BgCrop | null) => void;
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
 *   switching back to Image restores it exactly as it was placed.
 * - The full (uncropped) image is stored once; placement is a normalized crop
 *   rect (`bgCrop`) applied at render time, so "Re-crop" never re-uploads and
 *   only one copy of the image is ever stored.
 */
export function BackgroundControl({
  projectId,
  aspectRatio,
  bgUrl,
  bgFileName,
  bgCrop,
  bgColor,
  bgMode,
  onImageUpload,
  onCropChange,
  onColorChange,
  onModeChange,
}: BackgroundControlProps) {
  const { show: showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // While set, the placement modal is open showing this image (the stored
  // original — bgUrl — or an in-session blob for a freshly-picked file).
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  // Upload the (uncropped) image: optimistic preview, switch to image mode, PUT.
  const uploadImage = useCallback(async (file: File, previewUrl: string) => {
    onModeChange('image');
    onImageUpload(previewUrl, file.name, file);

    const formData = new FormData();
    formData.append('background', file);
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
      URL.revokeObjectURL(previewUrl);
      onImageUpload('', '');
      showToast(err instanceof Error ? err.message : 'Failed to upload background', 'error');
    }
  }, [projectId, onImageUpload, onModeChange, showToast]);

  // A file was chosen: validate, upload the original, then place it if the AR
  // differs from the frame.
  const handleFile = useCallback((file: File) => {
    if (!IMAGE_EXTENSIONS.includes(getExtension(file.name))) {
      showToast(`Invalid image. Accepted: ${IMAGE_EXTENSIONS.join(', ')}`, 'error');
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      uploadImage(file, url);
      onCropChange(null); // reset any prior placement; the modal sets a new one
      const imgAR = img.naturalWidth / img.naturalHeight;
      if (Math.abs(imgAR - aspectRatio) > AR_EPSILON) {
        setCropSrc(url); // open placement modal
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      showToast('Could not read that image', 'error');
    };
    img.src = url;
  }, [aspectRatio, uploadImage, onCropChange, showToast]);

  // Re-crop uses the stored image itself — it's the uncropped original.
  const recropSrc = bgUrl;

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
                onClick={() => setCropSrc(recropSrc)}
                className="flex-shrink-0 p-1 text-fg-subtle hover:text-fg transition-colors"
                title="Re-crop"
                aria-label="Re-crop"
              >
                <CropIcon className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-shrink-0 p-1 text-fg-subtle hover:text-fg transition-colors"
              title="Replace"
              aria-label="Replace"
            >
              <ReplaceIcon className="w-4 h-4" />
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
          initialCrop={bgCrop}
          onCrop={(crop) => {
            setCropSrc(null);
            onCropChange(crop);
          }}
          onCancel={() => setCropSrc(null)}
        />
      )}
    </div>
  );
}
