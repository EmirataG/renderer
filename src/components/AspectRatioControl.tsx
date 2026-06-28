'use client';

import { useState } from 'react';

const PRESETS = [
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
  { label: '4:3', value: 4 / 3 },
  { label: '1:1', value: 1 },
  { label: '4:5', value: 4 / 5 },
] as const;

// Reasonable bounds for a custom aspect ratio (width / height): 1:3 to 3:1.
const AR_MIN = 1 / 3;
const AR_MAX = 3;
const EPS = 0.01;

interface Props {
  value: number;
  /** Called with the new ratio whenever it changes. */
  onChange: (ratio: number) => void;
}

/**
 * Control-panel aspect-ratio picker: presets + a custom W:H. Changing it resizes
 * the frame; the caller resets the score region to its default.
 */
export function AspectRatioControl({ value, onChange }: Props) {
  const matchedPreset = PRESETS.find((p) => Math.abs(p.value - value) < EPS);
  const [isCustom, setIsCustom] = useState(!matchedPreset);
  const [customW, setCustomW] = useState('16');
  const [customH, setCustomH] = useState('9');

  const customRatio = Number(customW) / Number(customH);
  const customValid =
    Number.isFinite(customRatio) && customRatio >= AR_MIN && customRatio <= AR_MAX;

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5 flex-wrap">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => { setIsCustom(false); onChange(p.value); }}
            className={`flex-1 min-w-[2.5rem] py-1.5 text-[10px] font-semibold uppercase tracking-wide border transition-all ${
              !isCustom && matchedPreset?.label === p.label
                ? 'bg-accent text-accent-fg border-accent'
                : 'bg-transparent text-fg-subtle border-line-strong hover:text-fg-muted'
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => {
            setIsCustom(true);
            if (customValid) onChange(customRatio);
          }}
          className={`flex-1 min-w-[2.5rem] py-1.5 text-[10px] font-semibold uppercase tracking-wide border transition-all ${
            isCustom
              ? 'bg-accent text-accent-fg border-accent'
              : 'bg-transparent text-fg-subtle border-line-strong hover:text-fg-muted'
          }`}
        >
          Custom
        </button>
      </div>

      {isCustom && (
        <div className="flex items-center gap-2">
          {(['w', 'h'] as const).map((which, i) => (
            <span key={which} className="flex items-center gap-2">
              {i === 1 && <span className="text-fg-subtle text-xs">:</span>}
              <input
                type="number"
                min={1}
                value={which === 'w' ? customW : customH}
                onChange={(e) => {
                  const v = e.target.value;
                  const w = which === 'w' ? v : customW;
                  const h = which === 'h' ? v : customH;
                  if (which === 'w') setCustomW(v); else setCustomH(v);
                  const r = Number(w) / Number(h);
                  if (Number.isFinite(r) && r >= AR_MIN && r <= AR_MAX) onChange(r);
                }}
                className="grunge-input w-14 px-2 py-1 text-center tabular-nums"
                aria-label={which === 'w' ? 'Custom width' : 'Custom height'}
              />
            </span>
          ))}
          {!customValid && (
            <span className="text-[10px] text-red-400">1:3 to 3:1</span>
          )}
        </div>
      )}
    </div>
  );
}
