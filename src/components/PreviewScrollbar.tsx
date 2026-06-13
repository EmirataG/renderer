import { useEffect, useRef, useCallback } from 'react';

interface PreviewScrollbarProps {
  orientation: 'vertical' | 'horizontal';
  cameraPositionRef: React.RefObject<number>;
  totalSize: number;
  viewportSize: number;
  onSeek: (cameraPosition: number) => void;
}

export function PreviewScrollbar({
  orientation,
  cameraPositionRef,
  totalSize,
  viewportSize,
  onSeek,
}: PreviewScrollbarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ mouse: 0, thumb: 0 });

  const isVertical = orientation === 'vertical';
  const maxScroll = Math.max(0, totalSize - viewportSize);
  const thumbRatio = Math.min(1, viewportSize / totalSize);
  const shouldShow = totalSize > viewportSize && maxScroll > 0;

  // Animation loop: read camera ref and update thumb position via DOM
  useEffect(() => {
    if (!shouldShow) return;

    // The loop runs continuously, but the camera only moves during playback
    // and seeks — skip the layout read/write entirely on idle frames.
    let lastPos = -1;

    const update = () => {
      if (!thumbRef.current || !trackRef.current || isDraggingRef.current) {
        rafRef.current = requestAnimationFrame(update);
        return;
      }

      const pos = cameraPositionRef.current ?? 0;
      if (pos === lastPos) {
        rafRef.current = requestAnimationFrame(update);
        return;
      }
      lastPos = pos;
      const trackSize = isVertical
        ? trackRef.current.clientHeight
        : trackRef.current.clientWidth;
      const thumbSize = Math.max(30, thumbRatio * trackSize);
      const maxThumbOffset = trackSize - thumbSize;
      const thumbOffset = maxScroll > 0 ? (pos / maxScroll) * maxThumbOffset : 0;

      if (isVertical) {
        thumbRef.current.style.top = `${thumbOffset}px`;
        thumbRef.current.style.height = `${thumbSize}px`;
      } else {
        thumbRef.current.style.left = `${thumbOffset}px`;
        thumbRef.current.style.width = `${thumbSize}px`;
      }

      rafRef.current = requestAnimationFrame(update);
    };

    rafRef.current = requestAnimationFrame(update);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [shouldShow, totalSize, viewportSize, maxScroll, thumbRatio, isVertical, cameraPositionRef]);

  // Click on track -> jump to that position
  const handleTrackClick = useCallback(
    (e: React.PointerEvent) => {
      if (!trackRef.current) return;
      if (thumbRef.current && thumbRef.current.contains(e.target as Node)) return;

      const rect = trackRef.current.getBoundingClientRect();
      const trackSize = isVertical ? rect.height : rect.width;
      const clickPos = isVertical ? e.clientY - rect.top : e.clientX - rect.left;
      const ratio = clickPos / trackSize;
      const newCameraPos = ratio * maxScroll;
      onSeek(Math.max(0, Math.min(maxScroll, newCameraPos)));
    },
    [isVertical, maxScroll, onSeek],
  );

  // Thumb drag
  const handleThumbPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      isDraggingRef.current = true;

      const thumbEl = thumbRef.current;
      if (!thumbEl || !trackRef.current) return;

      const trackRect = trackRef.current.getBoundingClientRect();
      const thumbRect = thumbEl.getBoundingClientRect();
      const currentThumbOffset = isVertical
        ? thumbRect.top - trackRect.top
        : thumbRect.left - trackRect.left;

      dragStartRef.current = {
        mouse: isVertical ? e.clientY : e.clientX,
        thumb: currentThumbOffset,
      };

      const handleMove = (me: PointerEvent) => {
        if (!trackRef.current || !thumbRef.current) return;
        const trackSize = isVertical
          ? trackRef.current.clientHeight
          : trackRef.current.clientWidth;
        const thumbSize = Math.max(30, thumbRatio * trackSize);
        const maxThumbOffset = trackSize - thumbSize;

        const mouseDelta = (isVertical ? me.clientY : me.clientX) - dragStartRef.current.mouse;
        const newThumbOffset = Math.max(0, Math.min(maxThumbOffset, dragStartRef.current.thumb + mouseDelta));

        if (isVertical) {
          thumbRef.current.style.top = `${newThumbOffset}px`;
        } else {
          thumbRef.current.style.left = `${newThumbOffset}px`;
        }

        const newCameraPos = maxThumbOffset > 0
          ? (newThumbOffset / maxThumbOffset) * maxScroll
          : 0;
        onSeek(Math.max(0, Math.min(maxScroll, newCameraPos)));
      };

      const handleUp = () => {
        isDraggingRef.current = false;
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
    },
    [isVertical, maxScroll, thumbRatio, onSeek],
  );

  if (!shouldShow) return null;

  const trackStyle: React.CSSProperties = isVertical
    ? {
        position: 'absolute',
        right: 4,
        top: 8,
        bottom: 8,
        width: 8,
        borderRadius: 4,
        backgroundColor: 'rgba(255,255,255,0.05)',
        zIndex: 10,
        cursor: 'pointer',
        pointerEvents: 'auto',
      }
    : {
        position: 'absolute',
        bottom: 4,
        left: 8,
        right: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: 'rgba(255,255,255,0.05)',
        zIndex: 10,
        cursor: 'pointer',
        pointerEvents: 'auto',
      };

  const thumbStyle: React.CSSProperties = isVertical
    ? {
        position: 'absolute',
        width: '100%',
        borderRadius: 4,
        backgroundColor: 'rgba(255,255,255,0.25)',
        cursor: 'grab',
        transition: 'background-color 150ms',
      }
    : {
        position: 'absolute',
        height: '100%',
        borderRadius: 4,
        backgroundColor: 'rgba(255,255,255,0.25)',
        cursor: 'grab',
        transition: 'background-color 150ms',
      };

  return (
    <div
      ref={trackRef}
      style={trackStyle}
      onPointerDown={(e) => {
        e.stopPropagation();
        handleTrackClick(e);
      }}
    >
      <div
        ref={thumbRef}
        style={thumbStyle}
        onPointerDown={handleThumbPointerDown}
        onPointerEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(255,255,255,0.45)';
        }}
        onPointerLeave={(e) => {
          if (!isDraggingRef.current) {
            (e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(255,255,255,0.25)';
          }
        }}
      />
    </div>
  );
}
