import { useState, useEffect } from 'react';

interface TimestampInputProps {
  value: number; // seconds
  onChange: (seconds: number) => void;
  disabled?: boolean;
  className?: string;
}

// Format seconds to MM:SS.mmm string
function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toFixed(3).padStart(6, '0')}`;
}

// Parse MM:SS.mmm string to seconds (or null if invalid)
function parseTimestamp(str: string): number | null {
  const match = str.match(/^(\d+):(\d{1,2}(?:\.\d{0,3})?)$/);
  if (!match) return null;
  const mins = parseInt(match[1], 10);
  const secs = parseFloat(match[2]);
  if (secs >= 60 || secs < 0) return null;
  return mins * 60 + secs;
}

export function TimestampInput({ value, onChange, disabled, className }: TimestampInputProps) {
  const [inputValue, setInputValue] = useState(formatTimestamp(value));

  // Sync internal state when external value changes
  useEffect(() => {
    setInputValue(formatTimestamp(value));
  }, [value]);

  const handleBlur = () => {
    const parsed = parseTimestamp(inputValue);
    if (parsed !== null && parsed !== value) {
      onChange(parsed);
    }
    // Always reset display to valid format
    setInputValue(formatTimestamp(parsed ?? value));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <input
      type="text"
      value={inputValue}
      onChange={(e) => setInputValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      placeholder="0:00.000"
      className={`font-mono text-sm ${className ?? ''}`}
    />
  );
}
