import { useState, useRef, useEffect, useCallback } from 'react';
import type { ScoreRegion } from '../types/score';

interface Props {
  containerWidth: number;
  containerHeight: number;
  initialRegion: ScoreRegion | null;
  /** Region used when there is no saved region yet. */
  defaultRegion?: ScoreRegion | null;
  minWidth?: number;
  minHeight?: number;
  onRegionChange: (region: ScoreRegion | null) => void;
  /** Zoom scale applied to the preview (pointer deltas are divided by it). */
  scale?: number;
  /** Axis the camera pans along: 'x' for single-line (vertical lines), 'y' for
   *  page mode (horizontal lines). */
  lineAxis?: 'x' | 'y';
  /** Position (0..1) of the active-note line, along lineAxis within the region. */
  activeLinePosition: number;
  onActiveLineChange: (pos: number) => void;
  /** Show + allow editing the reveal line (single-line + hide feature on). */
  showRevealLine?: boolean;
  /** Position (0..1) of the reveal line; kept >= activeLinePosition. */
  revealLinePosition: number;
  onRevealLineChange: (pos: number) => void;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

type Region = Required<Pick<ScoreRegion, 'x' | 'y' | 'width' | 'height'>> & { rotation: number };

// Snap thresholds (editor px / degrees).
const EDGE_SNAP = 6;
const ANGLE_SNAP = 3;

const deg2rad = (d: number) => (d * Math.PI) / 180;
// Rotate a vector by the region angle (CSS rotate, y-down screen space).
function rot(x: number, y: number, theta: number): [number, number] {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [x * c - y * s, x * s + y * c];
}

export function ScoreRegionEditor({
  containerWidth,
  containerHeight,
  initialRegion,
  defaultRegion,
  minWidth = 200,
  minHeight = 150,
  onRegionChange,
  scale = 1,
  lineAxis = 'x',
  activeLinePosition,
  onActiveLineChange,
  showRevealLine = false,
  revealLinePosition,
  onRevealLineChange,
}: Props) {
  const [region, setRegion] = useState<Region>(() => {
    const base = initialRegion ?? defaultRegion;
    return base
      ? { x: base.x, y: base.y, width: base.width, height: base.height, rotation: base.rotation ?? 0 }
      : { x: 0, y: 0, width: containerWidth, height: containerHeight, rotation: 0 };
  });

  const regionRef = useRef(region);
  useEffect(() => { regionRef.current = region; }, [region]);

  const [isRotating, setIsRotating] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const commit = useCallback(() => {
    onRegionChange(regionRef.current);
  }, [onRegionChange]);

  // Snap the unrotated rect's edges to the frame borders. Applied to whichever
  // edges a gesture moved (`movedX`/`movedY` describe which side, -1/0/1).
  const snapEdges = useCallback((r: Region, movedX: 0 | 1 | -1, movedY: 0 | 1 | -1): Region => {
    let { x, y, width, height } = r;
    if (movedX <= 0 && Math.abs(x) < EDGE_SNAP) { width += x; x = 0; }
    if (movedX >= 0 && Math.abs(x + width - containerWidth) < EDGE_SNAP) { width = containerWidth - x; }
    if (movedY <= 0 && Math.abs(y) < EDGE_SNAP) { height += y; y = 0; }
    if (movedY >= 0 && Math.abs(y + height - containerHeight) < EDGE_SNAP) { height = containerHeight - y; }
    return { ...r, x, y, width: Math.max(minWidth, width), height: Math.max(minHeight, height) };
  }, [containerWidth, containerHeight, minWidth, minHeight]);

  /* ---------------- drag to move ---------------- */
  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const start = regionRef.current;
    const sx = e.clientX, sy = e.clientY;

    const onMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - sx) / scale;
      const dy = (ev.clientY - sy) / scale;
      const next: Region = { ...start, x: start.x + dx, y: start.y + dy };
      // Snap edges to the frame while moving — only when axis-aligned, where the
      // unrotated edges coincide with the visual edges (matches resize snapping).
      if (Math.abs(start.rotation) < 0.5) {
        if (Math.abs(next.x) < EDGE_SNAP) next.x = 0;
        else if (Math.abs(next.x + next.width - containerWidth) < EDGE_SNAP) next.x = containerWidth - next.width;
        if (Math.abs(next.y) < EDGE_SNAP) next.y = 0;
        else if (Math.abs(next.y + next.height - containerHeight) < EDGE_SNAP) next.y = containerHeight - next.height;
      }
      regionRef.current = next;
      setRegion(next);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      commit();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [scale, containerWidth, containerHeight, commit]);

  /* ---------------- resize (rotation-aware, opposite corner/edge pinned) ---------------- */
  const startResize = useCallback((hx: -1 | 0 | 1, hy: -1 | 0 | 1) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const r0 = regionRef.current;
    const theta = deg2rad(r0.rotation);
    const w0 = r0.width, h0 = r0.height;
    const cx = r0.x + w0 / 2, cy = r0.y + h0 / 2;
    // Anchor (opposite edge/corner midpoint) — world, stays fixed.
    const [aox, aoy] = rot((-hx * w0) / 2, (-hy * h0) / 2, theta);
    const ax = cx + aox, ay = cy + aoy;
    // Dragged handle's starting world position.
    const [hox, hoy] = rot((hx * w0) / 2, (hy * h0) / 2, theta);
    const hpx = cx + hox, hpy = cy + hoy;
    const sx = e.clientX, sy = e.clientY;

    const cos = Math.cos(theta), sin = Math.sin(theta);

    const onMove = (ev: MouseEvent) => {
      const mx = hpx + (ev.clientX - sx) / scale;
      const my = hpy + (ev.clientY - sy) / scale;
      const dx = mx - ax, dy = my - ay;
      // Project the anchor→mouse vector onto the box's local axes.
      const du = dx * cos + dy * sin;       // along local x (u)
      const dv = -dx * sin + dy * cos;      // along local y (v)
      const newW = hx !== 0 ? Math.max(minWidth, hx * du) : w0;
      const newH = hy !== 0 ? Math.max(minHeight, hy * dv) : h0;
      // New center keeps the anchor fixed: C' = A - R·(-hx*newW/2, -hy*newH/2)
      const [ox, oy] = rot((-hx * newW) / 2, (-hy * newH) / 2, theta);
      const ncx = ax - ox, ncy = ay - oy;
      let next: Region = {
        rotation: r0.rotation,
        width: newW,
        height: newH,
        x: ncx - newW / 2,
        y: ncy - newH / 2,
      };
      // Edge snapping only makes sense while axis-aligned.
      if (Math.abs(r0.rotation) < 0.5) next = snapEdges(next, hx, hy);
      regionRef.current = next;
      setRegion(next);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      commit();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [scale, minWidth, minHeight, snapEdges, commit]);

  /* ---------------- rotation ---------------- */
  const startRotate = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const start = regionRef.current;
    // The box's bounding-rect center equals its rotation center at any angle.
    const rect = boxRef.current?.getBoundingClientRect();
    const ccx = rect ? rect.left + rect.width / 2 : 0;
    const ccy = rect ? rect.top + rect.height / 2 : 0;
    const startAngle = Math.atan2(e.clientY - ccy, e.clientX - ccx) * (180 / Math.PI);
    setIsRotating(true);

    const onMove = (ev: MouseEvent) => {
      const cur = Math.atan2(ev.clientY - ccy, ev.clientX - ccx) * (180 / Math.PI);
      let next = start.rotation + (cur - startAngle);
      next = ((next + 180) % 360 + 360) % 360 - 180; // normalize to -180..180
      // Snap to the nearest 0/90/180/270.
      const nearest = Math.round(next / 90) * 90;
      if (Math.abs(next - nearest) <= ANGLE_SNAP) next = nearest;
      next = Math.round(next * 10) / 10;
      const r: Region = { ...regionRef.current, rotation: next };
      regionRef.current = r;
      setRegion(r);
    };
    const onUp = () => {
      setIsRotating(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      commit();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [commit]);

  /* ---------------- active / reveal line dragging ----------------
   * Drag projects the pointer onto the region's local pan axis (so it works
   * under rotation), in the box's [0,1] space. The reveal line is kept at or
   * ahead of the active line. onChange fires live for instant preview. */
  const startLineDrag = useCallback(
    (which: 'active' | 'reveal') => (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const r = regionRef.current;
      const theta = deg2rad(r.rotation);
      const cos = Math.cos(theta), sin = Math.sin(theta);
      const size = lineAxis === 'x' ? r.width : r.height;
      const startActive = activeLinePosition;
      const startReveal = revealLinePosition;
      const startFrac = which === 'active' ? startActive : startReveal;
      const sx = e.clientX, sy = e.clientY;

      // Snap to a target fraction when within EDGE_SNAP px of it.
      const snapTo = (f: number, targets: number[]) => {
        for (const t of targets) {
          if (size > 0 && Math.abs((f - t) * size) < EDGE_SNAP) return t;
        }
        return f;
      };
      const onMove = (ev: MouseEvent) => {
        const dx = (ev.clientX - sx) / scale;
        const dy = (ev.clientY - sy) / scale;
        const along = lineAxis === 'x' ? dx * cos + dy * sin : -dx * sin + dy * cos;
        let frac = clamp01(startFrac + (size > 0 ? along / size : 0));
        if (which === 'active') {
          frac = snapTo(frac, [0.5]); // snap back to the middle
          onActiveLineChange(frac);
          // Reveal can never sit behind the active line — push it ahead, and
          // let it settle back to where it was once the active line retreats.
          onRevealLineChange(Math.max(startReveal, frac));
        } else {
          frac = snapTo(frac, [0.5, startActive]); // snap to middle or onto the active line
          onRevealLineChange(Math.max(frac, startActive));
        }
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [scale, lineAxis, activeLinePosition, revealLinePosition, onActiveLineChange, onRevealLineChange],
  );

  const HANDLE = 10;
  // Corner + edge resize handles, keyed by which local extreme they control.
  const handles: { hx: -1 | 0 | 1; hy: -1 | 0 | 1; cursor: string }[] = [
    { hx: -1, hy: -1, cursor: 'nwse-resize' },
    { hx: 1, hy: -1, cursor: 'nesw-resize' },
    { hx: 1, hy: 1, cursor: 'nwse-resize' },
    { hx: -1, hy: 1, cursor: 'nesw-resize' },
    { hx: 0, hy: -1, cursor: 'ns-resize' },
    { hx: 0, hy: 1, cursor: 'ns-resize' },
    { hx: -1, hy: 0, cursor: 'ew-resize' },
    { hx: 1, hy: 0, cursor: 'ew-resize' },
  ];

  // Active / reveal marker line + its drag handle, drawn inside the rotated box.
  // `atStart` puts the handle on the leading edge (top/left for active), `!atStart`
  // on the trailing edge (bottom/right for reveal) — so handles never collide even
  // when the two lines overlap.
  const isX = lineAxis === 'x';
  const renderLine = (
    kind: 'active' | 'reveal',
    frac: number,
    color: string,
    atStart: boolean,
  ) => {
    const pct = `${clamp01(frac) * 100}%`;
    const dashed = kind === 'reveal';
    return (
      <div key={kind} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 15 }}>
        <div
          style={{
            position: 'absolute',
            ...(isX
              ? { left: pct, top: 0, bottom: 0, borderLeft: `2px ${dashed ? 'dashed' : 'solid'} ${color}`, transform: 'translateX(-1px)' }
              : { top: pct, left: 0, right: 0, borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${color}`, transform: 'translateY(-1px)' }),
          }}
        />
        <div
          onMouseDown={startLineDrag(kind)}
          title={kind === 'active' ? 'Where the playing note sits' : 'Where notes get revealed'}
          style={{
            position: 'absolute',
            pointerEvents: 'auto',
            cursor: isX ? 'ew-resize' : 'ns-resize',
            background: color,
            color: '#000',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.08em',
            padding: '2px 6px',
            borderRadius: 4,
            whiteSpace: 'nowrap',
            userSelect: 'none',
            boxShadow: '0 1px 4px rgba(0,0,0,0.6)',
            zIndex: 25,
            ...(isX
              ? { left: pct, transform: 'translateX(-50%)', ...(atStart ? { top: -24 } : { bottom: -24 }) }
              : { top: pct, transform: 'translateY(-50%)', ...(atStart ? { left: -2 } : { right: -2 }) }),
          }}
        >
          {kind === 'active' ? 'ACTIVE' : 'REVEAL'}
        </div>
      </div>
    );
  };

  return (
    <div className="absolute inset-0 z-50" style={{ width: containerWidth, height: containerHeight }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />

      {/* The region box — actually rotated, so it reflects the applied rotation */}
      <div
        ref={boxRef}
        onMouseDown={startDrag}
        style={{
          position: 'absolute',
          left: region.x,
          top: region.y,
          width: region.width,
          height: region.height,
          transform: region.rotation !== 0 ? `rotate(${region.rotation}deg)` : undefined,
          transformOrigin: 'center center',
          border: '1px solid white',
          backgroundColor: 'rgba(255,255,255,0.05)',
          cursor: 'move',
          zIndex: 10,
        }}
      >
        {/* Hint */}
        <div className="w-full h-full flex items-center justify-center">
          <div className="bg-black/70 border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 pointer-events-none uppercase tracking-wider">
            Drag to move &middot; Handles to resize &middot; Top handle to rotate
          </div>
        </div>

        {/* Look-ahead zone: the gap where notes are revealed before they play */}
        {showRevealLine && isX && revealLinePosition > activeLinePosition && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${clamp01(activeLinePosition) * 100}%`,
              width: `${clamp01(revealLinePosition - activeLinePosition) * 100}%`,
              background: 'rgba(245,158,11,0.10)',
              pointerEvents: 'none',
              zIndex: 14,
            }}
          />
        )}

        {/* Active line (always) + reveal line (single-line + hide feature). The
            reveal handle sits on the opposite edge so the two stay grabbable
            even when the lines overlap. */}
        {renderLine('active', activeLinePosition, '#22d3ee', true)}
        {showRevealLine && renderLine('reveal', revealLinePosition, '#f59e0b', false)}

        {/* Resize handles (rotate with the box) */}
        {handles.map(({ hx, hy, cursor }) => (
          <div
            key={`${hx},${hy}`}
            onMouseDown={startResize(hx, hy)}
            style={{
              position: 'absolute',
              left: `calc(${(hx + 1) * 50}% - ${HANDLE / 2}px)`,
              top: `calc(${(hy + 1) * 50}% - ${HANDLE / 2}px)`,
              width: HANDLE,
              height: HANDLE,
              backgroundColor: 'white',
              border: '1px solid #404040',
              cursor,
              zIndex: 20,
            }}
          />
        ))}

        {/* Rotation handle + connector + angle label, above the box center.
            The wrapper ignores pointer events so its connector line doesn't
            cover the top-center resize handle; only the circle is interactive. */}
        <div
          style={{
            position: 'absolute',
            top: -52,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            pointerEvents: 'none',
            zIndex: 20,
          }}
        >
          {region.rotation !== 0 && (
            <div
              style={{
                marginBottom: 4,
                backgroundColor: 'rgba(0,0,0,0.7)',
                border: '1px solid #404040',
                padding: '1px 6px',
                fontSize: 10,
                color: '#a3a3a3',
                whiteSpace: 'nowrap',
                letterSpacing: '0.05em',
              }}
            >
              {Math.round(region.rotation)}&deg;
            </div>
          )}
          <div
            onMouseDown={startRotate}
            style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              backgroundColor: 'white',
              border: '1px solid #525252',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'auto',
              cursor: isRotating ? 'grabbing' : 'grab',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#525252" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              <polyline points="21 3 21 9 15 9" />
            </svg>
          </div>
          <div style={{ width: 1, height: 30, backgroundColor: 'white', opacity: 0.7 }} />
        </div>
      </div>
    </div>
  );
}
