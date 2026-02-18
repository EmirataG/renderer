import { useState, useRef, useEffect, useCallback } from 'react';
import { Rnd } from 'react-rnd';
import type { ScoreRegion, PerspectiveCorners } from '../types/score';
import { computeMatrix3d, hasPerspective } from '../lib/perspectiveTransform';

const DEFAULT_CORNERS: PerspectiveCorners = {
  topLeft: { x: 0, y: 0 },
  topRight: { x: 0, y: 0 },
  bottomRight: { x: 0, y: 0 },
  bottomLeft: { x: 0, y: 0 },
};

interface Props {
  containerWidth: number;
  containerHeight: number;
  initialRegion: ScoreRegion | null;
  onRegionChange: (region: ScoreRegion | null) => void;
  scale?: number;
}

export function ScoreRegionEditor({
  containerWidth,
  containerHeight,
  initialRegion,
  onRegionChange,
  scale = 1,
}: Props) {
  const [currentRegion, setCurrentRegion] = useState<ScoreRegion>(() => {
    return initialRegion || {
      x: 0,
      y: 0,
      width: containerWidth,
      height: containerHeight,
    };
  });

  const [rotation, setRotation] = useState(() => initialRegion?.rotation ?? 0);
  const [perspectiveCorners, setPerspectiveCorners] = useState<PerspectiveCorners>(
    () => initialRegion?.perspective ?? { ...DEFAULT_CORNERS }
  );
  const [perspectiveMode, setPerspectiveMode] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const rotationRef = useRef(rotation);
  const initialAngleRef = useRef(0);
  const startRotationRef = useRef(0);
  const regionRef = useRef(currentRegion);
  const perspectiveCornersRef = useRef(perspectiveCorners);

  // Keep refs in sync
  useEffect(() => {
    rotationRef.current = rotation;
  }, [rotation]);
  useEffect(() => {
    regionRef.current = currentRegion;
  }, [currentRegion]);
  useEffect(() => {
    perspectiveCornersRef.current = perspectiveCorners;
  }, [perspectiveCorners]);

  /** Build a full ScoreRegion from current state */
  const buildRegion = useCallback((
    overrides?: Partial<{ x: number; y: number; width: number; height: number; rot: number; persp: PerspectiveCorners }>
  ): ScoreRegion => {
    const region = regionRef.current;
    return {
      x: overrides?.x ?? region.x,
      y: overrides?.y ?? region.y,
      width: overrides?.width ?? region.width,
      height: overrides?.height ?? region.height,
      rotation: overrides?.rot ?? rotationRef.current,
      perspective: overrides?.persp ?? perspectiveCornersRef.current,
    };
  }, []);

  const handleDragStop = (_e: unknown, d: { x: number; y: number }) => {
    const newRegion = buildRegion({ x: d.x, y: d.y });
    setCurrentRegion(newRegion);
    onRegionChange(newRegion);
  };

  const handleResizeStop = (
    _e: unknown,
    _direction: unknown,
    ref: HTMLElement,
    _delta: unknown,
    position: { x: number; y: number }
  ) => {
    const newRegion = buildRegion({ x: position.x, y: position.y, width: ref.offsetWidth, height: ref.offsetHeight });
    setCurrentRegion(newRegion);
    onRegionChange(newRegion);
  };

  const handleRotateMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const region = regionRef.current;
    // Center of the region in page coordinates, accounting for scale
    const centerX = (region.x + region.width / 2) * scale;
    const centerY = (region.y + region.height / 2) * scale;

    // Get the container element's position for coordinate offset
    const container = (e.target as HTMLElement).closest('.absolute.inset-0.z-50');
    const containerRect = container?.getBoundingClientRect() ?? { left: 0, top: 0 };

    // Initial angle from center to mouse
    const mouseX = e.clientX - containerRect.left;
    const mouseY = e.clientY - containerRect.top;
    const initialAngle = Math.atan2(mouseY - centerY, mouseX - centerX) * (180 / Math.PI);

    initialAngleRef.current = initialAngle;
    startRotationRef.current = rotationRef.current;
    setIsRotating(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const mx = moveEvent.clientX - containerRect.left;
      const my = moveEvent.clientY - containerRect.top;
      const currentAngle = Math.atan2(my - centerY, mx - centerX) * (180 / Math.PI);
      let newRotation = startRotationRef.current + (currentAngle - initialAngleRef.current);

      // Normalize to -180..180
      newRotation = ((newRotation + 180) % 360 + 360) % 360 - 180;

      // Snap to 0 when within +/- 3 degrees
      if (Math.abs(newRotation) <= 3) {
        newRotation = 0;
      }

      // Round to 1 decimal
      newRotation = Math.round(newRotation * 10) / 10;

      rotationRef.current = newRotation;
      setRotation(newRotation);
    };

    const handleMouseUp = () => {
      setIsRotating(false);
      const newRegion = buildRegion({ rot: rotationRef.current });
      setCurrentRegion(newRegion);
      onRegionChange(newRegion);

      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [scale, onRegionChange, buildRegion]);

  /** Handle perspective corner drag */
  const handlePerspectiveMouseDown = useCallback((
    e: React.MouseEvent,
    cornerKey: keyof PerspectiveCorners,
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startOffset = { ...perspectiveCornersRef.current[cornerKey] };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = (moveEvent.clientX - startMouseX) / scale;
      const dy = (moveEvent.clientY - startMouseY) / scale;

      const newCorners: PerspectiveCorners = {
        ...perspectiveCornersRef.current,
        [cornerKey]: {
          x: Math.round(startOffset.x + dx),
          y: Math.round(startOffset.y + dy),
        },
      };

      perspectiveCornersRef.current = newCorners;
      setPerspectiveCorners(newCorners);
    };

    const handleMouseUp = () => {
      const newRegion = buildRegion({ persp: perspectiveCornersRef.current });
      setCurrentRegion(newRegion);
      onRegionChange(newRegion);

      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [scale, onRegionChange, buildRegion]);

  // Position of rotation handle: centered above the Rnd box
  const handleLineHeight = 30;
  const handleSize = 22;

  // Perspective corner handle positions (relative to rotation wrapper)
  const cornerPositions: { key: keyof PerspectiveCorners; baseX: number; baseY: number }[] = [
    { key: 'topLeft', baseX: 0, baseY: 0 },
    { key: 'topRight', baseX: currentRegion.width, baseY: 0 },
    { key: 'bottomRight', baseX: currentRegion.width, baseY: currentRegion.height },
    { key: 'bottomLeft', baseX: 0, baseY: currentRegion.height },
  ];

  // Compute the matrix3d preview
  const perspectiveMatrix = hasPerspective(perspectiveCorners)
    ? computeMatrix3d(currentRegion.width, currentRegion.height, perspectiveCorners)
    : '';

  return (
    <div
      className="absolute inset-0 z-50"
      style={{ width: containerWidth, height: containerHeight }}
    >
      {/* Semi-transparent backdrop */}
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />

      {/* Rotation wrapper - rotates the entire Rnd + handle group */}
      <div
        style={{
          position: 'absolute',
          left: currentRegion.x,
          top: currentRegion.y,
          width: currentRegion.width,
          height: currentRegion.height,
          transform: `rotate(${rotation}deg)`,
          transformOrigin: 'center center',
          pointerEvents: 'none',
          zIndex: 10,
        }}
      >
        {/* Rotation handle + perspective toggle - positioned above the region center */}
        <div
          style={{
            position: 'absolute',
            top: -(handleLineHeight + handleSize),
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            pointerEvents: 'auto',
            zIndex: 20,
          }}
        >
          {/* Row: rotation circle + perspective toggle */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 6,
            }}
          >
            {/* Handle circle with rotation icon */}
            <div
              onMouseDown={handleRotateMouseDown}
              style={{
                width: handleSize,
                height: handleSize,
                borderRadius: '50%',
                backgroundColor: 'white',
                border: '1px solid #525252',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: isRotating ? 'grabbing' : 'grab',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#525252" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                <polyline points="21 3 21 9 15 9" />
              </svg>
            </div>
            {/* Perspective mode toggle button */}
            <button
              onClick={() => setPerspectiveMode((prev) => !prev)}
              title="Toggle perspective mode"
              style={{
                width: handleSize,
                height: handleSize,
                borderRadius: '50%',
                backgroundColor: perspectiveMode ? '#06b6d4' : 'white',
                border: perspectiveMode ? '1px solid white' : '1px solid #525252',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <rect
                  x="6"
                  y="1"
                  width="5"
                  height="5"
                  rx="0.5"
                  transform="rotate(45 6 1)"
                  stroke={perspectiveMode ? 'white' : '#525252'}
                  strokeWidth="1.5"
                  fill="none"
                />
              </svg>
            </button>
          </div>
          {/* Connecting line */}
          <div
            style={{
              width: 1,
              height: handleLineHeight,
              backgroundColor: 'white',
              opacity: 0.7,
            }}
          />
        </div>

        {/* Rotation angle label */}
        {rotation !== 0 && (
          <div
            style={{
              position: 'absolute',
              top: -(handleLineHeight + handleSize + 20),
              left: '50%',
              transform: 'translateX(-50%)',
              pointerEvents: 'none',
              zIndex: 20,
            }}
          >
            <div
              style={{
                backgroundColor: 'rgba(0,0,0,0.7)',
                border: '1px solid #404040',
                padding: '1px 6px',
                fontSize: '10px',
                color: '#a3a3a3',
                whiteSpace: 'nowrap',
                letterSpacing: '0.05em',
              }}
            >
              {Math.round(rotation)}&deg;
            </div>
          </div>
        )}

        {/* Perspective preview overlay */}
        {perspectiveMatrix && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: currentRegion.width,
              height: currentRegion.height,
              transform: perspectiveMatrix,
              transformOrigin: '0 0',
              border: '1px dashed #06b6d4',
              pointerEvents: 'none',
              zIndex: 15,
              opacity: 0.5,
            }}
          />
        )}

        {/* Perspective corner handles - only shown in perspective mode */}
        {perspectiveMode && cornerPositions.map(({ key, baseX, baseY }) => {
          const offset = perspectiveCorners[key];
          return (
            <div
              key={key}
              onMouseDown={(e) => handlePerspectiveMouseDown(e, key)}
              style={{
                position: 'absolute',
                left: baseX + offset.x - 6,
                top: baseY + offset.y - 6,
                width: 12,
                height: 12,
                transform: 'rotate(45deg)',
                backgroundColor: 'rgba(6, 182, 212, 0.3)',
                border: '1.5px solid #06b6d4',
                cursor: 'move',
                pointerEvents: 'auto',
                zIndex: 25,
              }}
            />
          );
        })}
      </div>

      {/* Draggable/resizable region */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: containerWidth,
          height: containerHeight,
        }}
      >
        <Rnd
          scale={scale}
          default={{
            x: currentRegion.x,
            y: currentRegion.y,
            width: currentRegion.width,
            height: currentRegion.height,
          }}
          minWidth={200}
          minHeight={150}
          bounds="parent"
          onDragStop={handleDragStop}
          onResizeStop={handleResizeStop}
          resizeHandleStyles={{
            top: { cursor: 'ns-resize' },
            right: { cursor: 'ew-resize' },
            bottom: { cursor: 'ns-resize' },
            left: { cursor: 'ew-resize' },
            topRight: { cursor: 'nesw-resize' },
            bottomRight: { cursor: 'nwse-resize' },
            bottomLeft: { cursor: 'nesw-resize' },
            topLeft: { cursor: 'nwse-resize' },
          }}
          resizeHandleComponent={perspectiveMode ? {} : {
            topLeft: <ResizeHandle />,
            topRight: <ResizeHandle />,
            bottomLeft: <ResizeHandle />,
            bottomRight: <ResizeHandle />,
          }}
          className="border border-white bg-white/5"
          style={{ zIndex: 10 }}
        >
          <div className="w-full h-full flex items-center justify-center">
            <div className="bg-black/70 border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 pointer-events-none uppercase tracking-wider">
              {perspectiveMode
                ? <>Drag to move &middot; Diamond handles for perspective &middot; Click button to exit</>
                : <>Drag to move &middot; Corners to resize &middot; Top handle to rotate</>
              }
            </div>
          </div>
        </Rnd>
      </div>
    </div>
  );
}

function ResizeHandle() {
  return (
    <div
      style={{
        width: 10,
        height: 10,
        backgroundColor: 'white',
        border: '1px solid #404040',
      }}
    />
  );
}
