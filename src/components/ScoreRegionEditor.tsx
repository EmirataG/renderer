import { useState } from 'react';
import { Rnd } from 'react-rnd';
import type { ScoreRegion } from '../types/score';

interface Props {
  containerWidth: number;
  containerHeight: number;
  initialRegion: ScoreRegion | null;
  onRegionChange: (region: ScoreRegion | null) => void;
  onClose: () => void;
}

export function ScoreRegionEditor({
  containerWidth,
  containerHeight,
  initialRegion,
  onRegionChange,
  onClose,
}: Props) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [currentRegion, setCurrentRegion] = useState<ScoreRegion>(() => {
    return initialRegion || {
      x: 0,
      y: 0,
      width: containerWidth,
      height: containerHeight,
    };
  });

  const handleResetClick = () => setShowConfirm(true);

  const handleConfirmReset = () => {
    onRegionChange(null);
    setCurrentRegion({
      x: 0,
      y: 0,
      width: containerWidth,
      height: containerHeight,
    });
    setShowConfirm(false);
  };

  const handleDragStop = (_e: unknown, d: { x: number; y: number }) => {
    const newRegion = {
      x: d.x,
      y: d.y,
      width: currentRegion.width,
      height: currentRegion.height,
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
    const newRegion = {
      x: position.x,
      y: position.y,
      width: ref.offsetWidth,
      height: ref.offsetHeight,
    };
    setCurrentRegion(newRegion);
    onRegionChange(newRegion);
  };

  return (
    <div
      className="absolute inset-0 z-50"
      style={{ width: containerWidth, height: containerHeight }}
    >
      {/* Semi-transparent backdrop */}
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />

      {/* Controls bar - fixed to bottom center of viewport */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex gap-2 z-[60]">
        <button
          onClick={handleResetClick}
          className="grunge-btn grunge-btn-sm"
        >
          Use Full Background
        </button>
        <button
          onClick={onClose}
          className="grunge-btn-primary grunge-btn-sm"
        >
          Done
        </button>
      </div>

      {/* Confirmation dialog */}
      {showConfirm && (
        <div className="fixed inset-0 flex items-center justify-center z-[70]">
          <div className="bg-black border border-neutral-700 p-6 max-w-sm mx-4">
            <h3 className="text-sm font-bold text-white mb-2 uppercase tracking-wider" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
              Reset Score Region?
            </h3>
            <p className="text-xs text-neutral-400 mb-4">
              This will reset the score to use the full background area.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                className="grunge-btn grunge-btn-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReset}
                className="grunge-btn-primary grunge-btn-sm"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Draggable/resizable region */}
      <Rnd
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
            Drag to move &middot; Corners to resize
          </div>
        </div>
      </Rnd>
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
