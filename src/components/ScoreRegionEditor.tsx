import { useState, useRef, useEffect, useCallback } from 'react';
import { Rnd } from 'react-rnd';
import type { ScoreRegion } from '../types/score';

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
  const [isRotating, setIsRotating] = useState(false);
  const rotationRef = useRef(rotation);
  const initialAngleRef = useRef(0);
  const startRotationRef = useRef(0);
  const regionRef = useRef(currentRegion);

  // Keep refs in sync
  useEffect(() => {
    rotationRef.current = rotation;
  }, [rotation]);
  useEffect(() => {
    regionRef.current = currentRegion;
  }, [currentRegion]);

  const handleDragStop = (_e: unknown, d: { x: number; y: number }) => {
    const newRegion: ScoreRegion = {
      x: d.x,
      y: d.y,
      width: currentRegion.width,
      height: currentRegion.height,
      rotation,
    };
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
    const newRegion: ScoreRegion = {
      x: position.x,
      y: position.y,
      width: ref.offsetWidth,
      height: ref.offsetHeight,
      rotation,
    };
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
      const finalRotation = rotationRef.current;
      const region = regionRef.current;
      const newRegion: ScoreRegion = {
        ...region,
        rotation: finalRotation,
      };
      setCurrentRegion(newRegion);
      onRegionChange(newRegion);

      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [scale, onRegionChange]);

  // Position of rotation handle: centered above the Rnd box
  const handleLineHeight = 30;
  const handleSize = 22;

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
        {/* Rotation handle - positioned above the region center */}
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
          resizeHandleComponent={{
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
              Drag to move &middot; Corners to resize &middot; Top handle to rotate
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
