'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ImageCropModalProps {
  imageSrc: string;
  /** Target aspect ratio (width / height) the crop must match. */
  aspectRatio: number;
  onCrop: (file: File) => void;
  onCancel: () => void;
}

/**
 * Pan-to-place crop modal. The crop box is locked to `aspectRatio` and the user
 * drags to choose which part of the image fills the frame. The result is a JPEG
 * cropped to exactly the target aspect ratio, so it fills the frame edge-to-edge.
 *
 * Rendered through a portal to document.body so it escapes ancestor stacking
 * contexts, and it locks page scroll while open.
 */
export function ImageCropModal({ imageSrc, aspectRatio, onCrop, onCancel }: ImageCropModalProps) {
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

  // Lock page scroll + Escape to close.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onCancel]);

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

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-overlay backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 bg-surface border border-line p-5 max-w-2xl w-full mx-4">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-fg mb-2">
          Place Background
        </h3>
        <p className="text-[11px] text-fg-subtle mb-4">
          Drag to choose which part of the image fills the frame.
        </p>

        {/* Crop area. The wrapper shrinks to the rendered image (inline-block),
            so the percentage-based overlay maps exactly to the image — even when
            the image is constrained by max-height. */}
        <div className="flex justify-center mb-4">
        <div
          ref={containerRef}
          className="relative select-none overflow-hidden bg-canvas inline-block"
          style={{
            lineHeight: 0,
            // Hold a placeholder size while the image is still loading so the
            // box doesn't collapse and the loader has room to show.
            minWidth: imgNatW > 0 ? undefined : 320,
            minHeight: imgNatW > 0 ? undefined : 200,
          }}
        >
          <img
            ref={imgRef}
            src={imageSrc}
            alt="Crop preview"
            onLoad={handleImgLoad}
            className="block"
            style={{ maxHeight: '60vh', maxWidth: '100%', width: 'auto', height: 'auto' }}
            draggable={false}
          />
          {/* Loading spinner until the image has decoded */}
          {imgNatW === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <svg
                className="w-6 h-6 animate-spin text-fg-subtle"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" opacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" />
              </svg>
            </div>
          )}
          {/* Dark overlay outside crop */}
          {imgNatW > 0 && (
            <>
              {/* Top */}
              <div className="absolute left-0 right-0 top-0 bg-overlay" style={{ height: `${cropY * 100}%` }} />
              {/* Bottom */}
              <div className="absolute left-0 right-0 bottom-0 bg-overlay" style={{ height: `${(1 - cropY - cropH) * 100}%` }} />
              {/* Left */}
              <div className="absolute left-0 bg-overlay" style={{ top: `${cropY * 100}%`, height: `${cropH * 100}%`, width: `${cropX * 100}%` }} />
              {/* Right */}
              <div className="absolute right-0 bg-overlay" style={{ top: `${cropY * 100}%`, height: `${cropH * 100}%`, width: `${(1 - cropX - cropW) * 100}%` }} />

              {/* Crop box (draggable) */}
              <div
                className="absolute border border-accent"
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
                  <div className="absolute left-1/3 top-0 bottom-0 w-px bg-surface-muted" />
                  <div className="absolute left-2/3 top-0 bottom-0 w-px bg-surface-muted" />
                  <div className="absolute top-1/3 left-0 right-0 h-px bg-surface-muted" />
                  <div className="absolute top-2/3 left-0 right-0 h-px bg-surface-muted" />
                </div>
              </div>
            </>
          )}
        </div>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="grunge-btn grunge-btn-sm">Cancel</button>
          <button onClick={handleCrop} className="grunge-btn-primary grunge-btn-sm">Apply</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
