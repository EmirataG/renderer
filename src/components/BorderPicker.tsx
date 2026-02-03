import React from 'react';
import { BorderStyle, BORDER_OPTIONS, getBorderComponent } from '../borders';

interface BorderPickerProps {
  value: BorderStyle;
  onChange: (style: BorderStyle) => void;
  color: string;
}

export function BorderPicker({ value, onChange, color }: BorderPickerProps) {
  return (
    <div className="space-y-2">
      <label className="block text-xs text-neutral-300 font-medium">
        Score Border
      </label>
      <div className="grid grid-cols-2 gap-2">
        {BORDER_OPTIONS.map((option) => {
          const BorderComponent = getBorderComponent(option.value);
          const isSelected = value === option.value;

          return (
            <button
              key={option.value}
              onClick={() => onChange(option.value)}
              className={`
                flex flex-col items-center justify-center p-2 border transition-colors
                ${isSelected
                  ? 'border-white bg-white/10'
                  : 'border-neutral-600 bg-neutral-800/50 hover:border-neutral-500'
                }
              `}
            >
              {/* Preview area */}
              <div className="w-full h-8 flex items-center justify-center overflow-hidden">
                {BorderComponent ? (
                  <BorderComponent width={100} color={color} position="top" />
                ) : (
                  <span className="text-neutral-500 text-xs">No border</span>
                )}
              </div>
              {/* Label */}
              <span className={`text-xs mt-1 ${isSelected ? 'text-white' : 'text-neutral-400'}`}>
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
