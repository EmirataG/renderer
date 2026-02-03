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
      <div className="absolute inset-0 bg-black/30 pointer-events-none" />

      {/* Controls bar at top */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-2 z-20">
        <button
          onClick={handleResetClick}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-600 transition-colors"
        >
          Use Full Background
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
        >
          Done
        </button>
      </div>

      {/* Confirmation dialog */}
      {showConfirm && (
        <div className="absolute inset-0 flex items-center justify-center z-30">
          <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-6 shadow-xl max-w-sm mx-4">
            <h3 className="text-lg font-medium text-white mb-2">Reset Score Region?</h3>
            <p className="text-sm text-neutral-400 mb-4">
              This will reset the score to use the full background area.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-neutral-700 hover:bg-neutral-600 text-neutral-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReset}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
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
          topLeft: <ResizeHandle position="topLeft" />,
          topRight: <ResizeHandle position="topRight" />,
          bottomLeft: <ResizeHandle position="bottomLeft" />,
          bottomRight: <ResizeHandle position="bottomRight" />,
        }}
        className="border-2 border-dashed border-blue-400 bg-blue-500/10"
        style={{ zIndex: 10 }}
      >
        <div className="w-full h-full flex items-center justify-center">
          <div className="bg-black/60 px-3 py-1.5 rounded text-xs text-blue-200 pointer-events-none">
            Drag to move, corners to resize
          </div>
        </div>
      </Rnd>
    </div>
  );
}

// Corner resize handle component
function ResizeHandle({ position }: { position: string }) {
  const getPositionStyles = () => {
    switch (position) {
      case 'topLeft':
        return { top: -4, left: -4 };
      case 'topRight':
        return { top: -4, right: -4 };
      case 'bottomLeft':
        return { bottom: -4, left: -4 };
      case 'bottomRight':
        return { bottom: -4, right: -4 };
      default:
        return {};
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        width: 12,
        height: 12,
        backgroundColor: '#3b82f6',
        border: '2px solid white',
        borderRadius: 2,
        ...getPositionStyles(),
      }}
    />
  );
}
