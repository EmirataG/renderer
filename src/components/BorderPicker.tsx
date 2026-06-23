import { BorderStyle, BORDER_OPTIONS, getBorderComponent } from '../borders';

interface BorderPickerProps {
  value: BorderStyle;
  onChange: (style: BorderStyle) => void;
  color: string;
}

export function BorderPicker({ value, onChange, color }: BorderPickerProps) {
  return (
    <div className="grunge-field">
      <label className="grunge-label">Score Border</label>
      <div className="grid grid-cols-2 gap-1.5">
        {BORDER_OPTIONS.map((option) => {
          const BorderComponent = getBorderComponent(option.value);
          const isSelected = value === option.value;

          return (
            <button
              key={option.value}
              onClick={() => onChange(option.value)}
              className={`
                flex flex-col items-center justify-center p-2 border transition-colors cursor-pointer
                ${isSelected
                  ? 'border-neutral-300 bg-white/[0.08]'
                  : 'border-neutral-800 bg-transparent hover:border-neutral-600'
                }
              `}
            >
              {/* Preview area */}
              <div className="w-full h-8 flex items-center justify-center overflow-hidden">
                {BorderComponent ? (
                  <BorderComponent width={100} color={color} position="top" />
                ) : (
                  <span className="text-neutral-600 text-[11px]">No border</span>
                )}
              </div>
              {/* Label */}
              <span className={`text-[11px] mt-1 ${isSelected ? 'text-white' : 'text-neutral-500'}`}>
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
