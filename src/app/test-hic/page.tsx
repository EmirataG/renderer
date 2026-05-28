'use client';

/**
 * HTML-in-Canvas test bed.
 *
 * Tight feedback loop for the experimental Chrome drawElementImage API.
 * Renders /public/score.svg both as live DOM (control) and as a child
 * of a <canvas layoutsubtree> drawn via drawElementImage (test). Logs
 * everything that matters: feature availability, paint event count,
 * any errors, the rect drawElementImage returns.
 *
 * Use this to iterate on the API quickly. When the test column matches
 * the control column, the same pattern is ready to port back to
 * clientExport.
 */

import { useEffect, useRef, useState } from 'react';

const W = 600;
const H = 800;

export default function TestHic() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<HTMLDivElement>(null);

  const [svg, setSvg] = useState<string>('');
  const [available, setAvailable] = useState<'unknown' | boolean>('unknown');
  const [methodName, setMethodName] = useState<string>('');
  const [paintCount, setPaintCount] = useState(0);
  const [drawCalls, setDrawCalls] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastDOMMatrix, setLastDOMMatrix] = useState<string>('');
  const [sourceRect, setSourceRect] = useState<string>('');
  const [offscreen, setOffscreen] = useState(false);
  const [mirrorSrc, setMirrorSrc] = useState<string>('');
  const [tick, setTick] = useState(0);

  // Feature detect
  useEffect(() => {
    const probe = document
      .createElement('canvas')
      .getContext('2d') as unknown as Record<string, unknown>;
    if (typeof probe?.drawElementImage === 'function') {
      setAvailable(true);
      setMethodName('drawElementImage');
    } else if (typeof probe?.drawElement === 'function') {
      setAvailable(true);
      setMethodName('drawElement');
    } else {
      setAvailable(false);
      setLastError(
        'drawElementImage/drawElement not on CanvasRenderingContext2D. Enable chrome://flags/#canvas-draw-element and relaunch Chrome.',
      );
    }
  }, []);

  // Load the sample SVG
  useEffect(() => {
    fetch('/score.svg')
      .then((r) => r.text())
      .then(setSvg)
      .catch((e) => setLastError(`Failed to load /score.svg: ${e}`));
  }, []);

  // Wire up the canvas paint handler whenever we have everything
  useEffect(() => {
    if (available !== true || !svg) return;
    const canvas = canvasRef.current as
      | (HTMLCanvasElement & { onpaint?: ((e: Event) => void) | null; requestPaint?: () => void })
      | null;
    const source = sourceRef.current;
    if (!canvas || !source) return;

    const ctx = canvas.getContext('2d') as unknown as Record<string, unknown> &
      CanvasRenderingContext2D;
    const drawFn = (ctx[methodName] as Function).bind(ctx);

    let frameCount = 0;
    const onPaint = () => {
      try {
        ctx.reset();
        // Bright magenta fill — if drawElementImage actually paints
        // opaque pixels, magenta disappears wherever it draws.
        ctx.fillStyle = '#ff00ff';
        ctx.fillRect(0, 0, W, H);
        const m = drawFn(source, 0, 0, W, H) as DOMMatrix | undefined;
        if (m) setLastDOMMatrix(`a=${m.a.toFixed(2)} d=${m.d.toFixed(2)} e=${m.e.toFixed(2)} f=${m.f.toFixed(2)}`);
        const r = source.getBoundingClientRect();
        setSourceRect(`x=${r.x.toFixed(0)} y=${r.y.toFixed(0)} w=${r.width.toFixed(0)} h=${r.height.toFixed(0)}`);
        setDrawCalls((n) => n + 1);
        setPaintCount((n) => n + 1);
        // Mirror the canvas bitmap into an <img> every ~30 frames so we
        // can SEE what's in the bitmap even when the canvas is offscreen.
        if (frameCount++ % 30 === 0) {
          setMirrorSrc(canvas.toDataURL('image/png'));
        }
      } catch (e: unknown) {
        setLastError(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
      }
    };

    canvas.onpaint = onPaint;
    canvas.requestPaint?.();

    return () => {
      canvas.onpaint = null;
    };
  }, [available, svg, methodName, tick]);

  function forceRedraw() {
    const canvas = canvasRef.current as
      | (HTMLCanvasElement & { requestPaint?: () => void })
      | null;
    canvas?.requestPaint?.();
  }

  function mutateSource() {
    // Toggle an attribute on the SVG to verify the snapshot tracks
    // mutations frame-to-frame.
    const svgEl = sourceRef.current?.querySelector('svg');
    if (!svgEl) return;
    const current = svgEl.getAttribute('data-tick') ?? '0';
    const next = (parseInt(current, 10) + 1) % 6;
    svgEl.setAttribute('data-tick', String(next));
    const colors = ['#ffffff', '#ff5555', '#55ff55', '#5599ff', '#ffcc00', '#ff00ff'];
    svgEl.setAttribute('fill', colors[next]);
    svgEl.setAttribute('stroke', colors[next]);
    svgEl.querySelectorAll('polyline').forEach((pl) => pl.setAttribute('stroke', colors[next]));
    setTick((t) => t + 1);
  }

  return (
    <div
      style={{
        padding: 20,
        fontFamily: 'ui-monospace, monospace',
        color: '#ddd',
        background: '#0a0c10',
        minHeight: '100vh',
      }}
    >
      <h1 style={{ marginTop: 0 }}>HTML-in-Canvas test bed</h1>

      <div
        style={{
          padding: 12,
          background: '#161b22',
          borderRadius: 6,
          marginBottom: 16,
          lineHeight: 1.6,
        }}
      >
        <div>
          API available: <b style={{ color: available === true ? '#5f5' : '#f55' }}>{String(available)}</b>
          {available === true && <> &middot; using <code>{methodName}</code></>}
        </div>
        <div>Paint events: {paintCount} &middot; drawEl calls: {drawCalls}</div>
        <div>Last DOMMatrix from drawEl: <code>{lastDOMMatrix || '—'}</code></div>
        <div>Source rect: <code>{sourceRect || '—'}</code></div>
        {lastError && (
          <div style={{ color: '#f55', marginTop: 6 }}>
            <b>Error:</b> {lastError}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <button onClick={forceRedraw} style={btn}>requestPaint()</button>
        <button onClick={mutateSource} style={btn}>mutate source (cycle color)</button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={offscreen} onChange={(e) => setOffscreen(e.target.checked)} />
          canvas offscreen (position:fixed; left:-99999px) — mimics export
        </label>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* CONTROL: same SVG, live DOM */}
        <div>
          <h2 style={{ fontSize: 14, marginBottom: 8 }}>1. Live DOM (control)</h2>
          <div
            style={{
              width: W,
              height: H,
              background: '#fff',
              overflow: 'hidden',
              border: '1px solid #333',
            }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>

        {/* TEST: canvas with the same SVG as a layoutsubtree child */}
        <div>
          <h2 style={{ fontSize: 14, marginBottom: 8 }}>2. Canvas via {methodName || 'drawElementImage'}{offscreen ? ' (offscreen — see mirror →)' : ''}</h2>
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            // @ts-expect-error layoutsubtree is not in lib.dom yet
            layoutsubtree=""
            style={
              offscreen
                ? {
                    background: '#0e1116',
                    border: '1px solid #333',
                    width: W,
                    height: H,
                    display: 'block',
                    position: 'fixed',
                    left: -99999,
                    top: 0,
                  }
                : {
                    background: '#0e1116',
                    border: '1px solid #333',
                    width: W,
                    height: H,
                    display: 'block',
                    position: 'relative',
                  }
            }
          >
            {/* The drawElementImage source. Must be a direct child of
                the canvas. Positioned far above the canvas's border
                box so paint containment hides its natural rendering,
                but the snapshot drawElementImage takes is of the
                element's intrinsic content (position-independent). */}
            <div
              ref={sourceRef}
              style={{
                width: W,
                height: H,
                pointerEvents: 'none',
              }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </canvas>
        </div>

        {/* MIRROR: <img> populated from canvas.toDataURL() every ~30
            paints. Shows the canvas BITMAP regardless of where the
            canvas itself is positioned — so we can see the export-
            style offscreen canvas. */}
        <div>
          <h2 style={{ fontSize: 14, marginBottom: 8 }}>3. Canvas bitmap (mirror via toDataURL)</h2>
          {mirrorSrc ? (
            <img
              src={mirrorSrc}
              width={W}
              height={H}
              style={{ border: '1px solid #333', display: 'block' }}
              alt="canvas bitmap mirror"
            />
          ) : (
            <div style={{ width: W, height: H, border: '1px solid #333', display: 'grid', placeItems: 'center', color: '#666' }}>
              waiting for first paint...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const btn: React.CSSProperties = {
  padding: '6px 12px',
  background: '#21262d',
  color: '#ddd',
  border: '1px solid #444',
  borderRadius: 4,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
