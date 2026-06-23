import { memo, useEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';

interface WaveformScrubberProps {
  audioElement: HTMLAudioElement | null;
  audioUrl: string;
  duration: number;
  events: Array<{ computedTimestamp: number }>;
  onSeek: (time: number) => void;
  height?: number;
}

// Resolve a CSS custom property to its current value (theme-aware). Wavesurfer
// paints to a canvas with literal colors, so we can't hand it `var(--x)` —
// read the computed value and re-apply when the theme changes.
function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

// Monochrome waveform palette, keyed to the app's grunge tokens:
//   unplayed → faint, played → mid, playhead → bright.
function waveColors() {
  return {
    waveColor: cssVar('--line-strong', '#525252'),
    progressColor: cssVar('--fg-muted', '#a3a3a3'),
    cursorColor: cssVar('--fg', '#f5f5f5'),
  };
}

/**
 * Waveform with note-onset tick marks.
 *
 * Memoized, and the ticks are drawn on a single canvas: the previous
 * implementation rendered one absolutely-positioned <div> per event, which
 * meant thousands of DOM nodes diffed on every parent render for long scores.
 */
export const WaveformScrubber = memo(function WaveformScrubber({
  audioElement,
  audioUrl,
  duration,
  events,
  onSeek,
  height = 80,
}: WaveformScrubberProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;

  // Create / recreate wavesurfer when audioUrl or audioElement changes
  useEffect(() => {
    if (!containerRef.current || !audioElement || !audioUrl) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      media: audioElement,
      height,
      ...waveColors(),
      cursorWidth: 2,
      barWidth: 2,
      barGap: 1,
      barRadius: 1,
      normalize: true,
      url: audioUrl,
    });

    ws.on('interaction', (newTime: number) => {
      onSeekRef.current(newTime);
    });

    wsRef.current = ws;

    return () => {
      ws.destroy();
      wsRef.current = null;
    };
    // Only recreate when the audio source changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl, audioElement, height]);

  // Re-apply the palette when the theme (data-theme on <html>) toggles —
  // the canvas colors are baked in at create time and won't update otherwise.
  useEffect(() => {
    const mo = new MutationObserver(() => {
      wsRef.current?.setOptions(waveColors());
    });
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => mo.disconnect();
  }, []);

  // Draw note-onset tick marks on the overlay canvas. Redraws only when the
  // events/duration change or the container resizes — never per frame.
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const draw = () => {
      const w = container.clientWidth;
      const h = container.clientHeight || height;
      if (w === 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (duration <= 0) return;
      ctx.fillStyle = 'rgba(34, 197, 94, 0.3)';
      const tickW = Math.max(1, Math.round(dpr));
      for (const evt of events) {
        const pct = evt.computedTimestamp / duration;
        if (pct < 0 || pct > 1) continue;
        ctx.fillRect(Math.round(pct * canvas.width), 0, tickW, canvas.height);
      }
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(container);
    return () => ro.disconnect();
  }, [events, duration, height]);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {/* Wavesurfer renders here */}
      <div ref={containerRef} style={{ width: '100%' }} />

      {/* Note entry tick marks overlay */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
});
