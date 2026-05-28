import { useEffect, useRef } from 'react';
import WaveSurfer from 'wavesurfer.js';

interface WaveformScrubberProps {
  audioElement: HTMLAudioElement | null;
  audioUrl: string;
  duration: number;
  events: Array<{ computedTimestamp: number }>;
  onSeek: (time: number) => void;
  height?: number;
}

export function WaveformScrubber({
  audioElement,
  audioUrl,
  duration,
  events,
  onSeek,
  height = 80,
}: WaveformScrubberProps) {
  const containerRef = useRef<HTMLDivElement>(null);
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
      waveColor: '#555',
      progressColor: '#f59e0b',
      cursorColor: '#fff',
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

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {/* Wavesurfer renders here */}
      <div ref={containerRef} style={{ width: '100%' }} />

      {/* Note entry tick marks overlay */}
      {duration > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            pointerEvents: 'none',
          }}
        >
          {events.map((evt, i) => {
            const pct = (evt.computedTimestamp / duration) * 100;
            if (pct < 0 || pct > 100) return null;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: `${pct}%`,
                  top: 0,
                  width: 1,
                  height: '100%',
                  backgroundColor: 'rgba(34, 197, 94, 0.3)',
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
