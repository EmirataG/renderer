import React from 'react';

export type BorderStyle = 'none' | 'line' | 'double-line' | 'ornate-1' | 'ornate-2' | 'flourish';

export interface BorderProps {
  width: number;
  color: string;
  position: 'top' | 'bottom';
}

// Simple line border
export const LineBorder: React.FC<BorderProps> = ({ width, color, position }) => (
  <svg
    width={width}
    height="8"
    viewBox={`0 0 ${width} 8`}
    style={{ display: 'block' }}
  >
    <line
      x1="0"
      y1={position === 'top' ? 6 : 2}
      x2={width}
      y2={position === 'top' ? 6 : 2}
      stroke={color}
      strokeWidth="2"
    />
  </svg>
);

// Double line border
export const DoubleLineBorder: React.FC<BorderProps> = ({ width, color, position }) => (
  <svg
    width={width}
    height="12"
    viewBox={`0 0 ${width} 12`}
    style={{ display: 'block' }}
  >
    <line
      x1="0"
      y1={position === 'top' ? 4 : 2}
      x2={width}
      y2={position === 'top' ? 4 : 2}
      stroke={color}
      strokeWidth="1.5"
    />
    <line
      x1="0"
      y1={position === 'top' ? 10 : 8}
      x2={width}
      y2={position === 'top' ? 10 : 8}
      stroke={color}
      strokeWidth="1.5"
    />
  </svg>
);

// Ornate border style 1 - curved brackets with center ornament + baseline
export const OrnateBorder1: React.FC<BorderProps> = ({ width, color, position }) => {
  const height = 28;
  const mid = width / 2;
  const flip = position === 'bottom' ? -1 : 1;
  // yBase is where the baseline sits (touching the score)
  const yBase = position === 'top' ? height - 2 : 2;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block' }}
    >
      {/* Baseline - sits right at the score edge */}
      <line
        x1="0"
        y1={yBase}
        x2={width}
        y2={yBase}
        stroke={color}
        strokeWidth="1.5"
      />
      {/* Left curved bracket rising from baseline */}
      <path
        d={`M 30,${yBase} Q 30,${yBase - flip * 14} 70,${yBase - flip * 14}`}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
      />
      {/* Decorative line to center */}
      <line
        x1="70"
        y1={yBase - flip * 14}
        x2={mid - 25}
        y2={yBase - flip * 14}
        stroke={color}
        strokeWidth="1.5"
      />
      {/* Center diamond ornament */}
      <path
        d={`M ${mid},${yBase - flip * 6} L ${mid - 7},${yBase - flip * 14} L ${mid},${yBase - flip * 22} L ${mid + 7},${yBase - flip * 14} Z`}
        fill={color}
      />
      {/* Decorative line from center */}
      <line
        x1={mid + 25}
        y1={yBase - flip * 14}
        x2={width - 70}
        y2={yBase - flip * 14}
        stroke={color}
        strokeWidth="1.5"
      />
      {/* Right curved bracket descending to baseline */}
      <path
        d={`M ${width - 70},${yBase - flip * 14} Q ${width - 30},${yBase - flip * 14} ${width - 30},${yBase}`}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
      />
    </svg>
  );
};

// Ornate border style 2 - flowing waves with baseline
export const OrnateBorder2: React.FC<BorderProps> = ({ width, color, position }) => {
  const height = 24;
  const flip = position === 'bottom' ? -1 : 1;
  // yBase is where the baseline sits (touching the score)
  const yBase = position === 'top' ? height - 2 : 2;
  // yWave is where the wave pattern centers
  const yWave = yBase - flip * 10;

  // Generate wave pattern
  const waveSegments = Math.floor(width / 50);
  let wavePath = `M 20,${yWave}`;
  for (let i = 0; i < waveSegments; i++) {
    const x0 = 20 + i * 50;
    const x1 = x0 + 12;
    const x2 = x0 + 25;
    const x3 = x0 + 38;
    const x4 = x0 + 50;
    wavePath += ` Q ${x1},${yWave - flip * 6} ${x2},${yWave}`;
    wavePath += ` Q ${x3},${yWave + flip * 6} ${x4},${yWave}`;
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block' }}
    >
      {/* Baseline - sits right at the score edge */}
      <line
        x1="0"
        y1={yBase}
        x2={width}
        y2={yBase}
        stroke={color}
        strokeWidth="1.5"
      />
      {/* Wave pattern above/below baseline */}
      <path
        d={wavePath}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
      />
      {/* Decorative dots at wave endpoints */}
      <circle cx="20" cy={yWave} r="3" fill={color} />
      <circle cx={width - 20} cy={yWave} r="3" fill={color} />
      {/* Small connecting lines from baseline to wave */}
      <line x1="20" y1={yBase} x2="20" y2={yWave} stroke={color} strokeWidth="1" />
      <line x1={width - 20} y1={yBase} x2={width - 20} y2={yWave} stroke={color} strokeWidth="1" />
    </svg>
  );
};

// Flourish border - elegant scrollwork with baseline
export const FlourishBorder: React.FC<BorderProps> = ({ width, color, position }) => {
  const height = 36;
  const mid = width / 2;
  const flip = position === 'bottom' ? -1 : 1;
  // yBase is where the baseline sits (touching the score)
  const yBase = position === 'top' ? height - 2 : 2;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block' }}
    >
      {/* Baseline - sits right at the score edge */}
      <line
        x1="0"
        y1={yBase}
        x2={width}
        y2={yBase}
        stroke={color}
        strokeWidth="1.5"
      />
      {/* Left flourish - starts from baseline, curves up */}
      <path
        d={`M 15,${yBase}
            C 25,${yBase - flip * 8} 35,${yBase - flip * 18} 55,${yBase - flip * 18}
            S 75,${yBase - flip * 10} 95,${yBase - flip * 16}
            Q 115,${yBase - flip * 20} ${mid - 35},${yBase - flip * 18}`}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Center ornament - elegant oval with inner dot */}
      <ellipse
        cx={mid}
        cy={yBase - flip * 18}
        rx="14"
        ry="9"
        fill="none"
        stroke={color}
        strokeWidth="1.5"
      />
      <ellipse
        cx={mid}
        cy={yBase - flip * 18}
        rx="6"
        ry="4"
        fill={color}
      />
      {/* Right flourish (mirror) - curves down to baseline */}
      <path
        d={`M ${width - 15},${yBase}
            C ${width - 25},${yBase - flip * 8} ${width - 35},${yBase - flip * 18} ${width - 55},${yBase - flip * 18}
            S ${width - 75},${yBase - flip * 10} ${width - 95},${yBase - flip * 16}
            Q ${width - 115},${yBase - flip * 20} ${mid + 35},${yBase - flip * 18}`}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Small decorative dots where flourishes meet baseline */}
      <circle cx="15" cy={yBase} r="2.5" fill={color} />
      <circle cx={width - 15} cy={yBase} r="2.5" fill={color} />
    </svg>
  );
};

// Border component registry
export const BORDER_OPTIONS: { value: BorderStyle; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'line', label: 'Simple Line' },
  { value: 'double-line', label: 'Double Line' },
  { value: 'ornate-1', label: 'Classic Ornament' },
  { value: 'ornate-2', label: 'Wave Pattern' },
  { value: 'flourish', label: 'Flourish' },
];

// Get border component by style
export function getBorderComponent(style: BorderStyle): React.FC<BorderProps> | null {
  switch (style) {
    case 'line':
      return LineBorder;
    case 'double-line':
      return DoubleLineBorder;
    case 'ornate-1':
      return OrnateBorder1;
    case 'ornate-2':
      return OrnateBorder2;
    case 'flourish':
      return FlourishBorder;
    default:
      return null;
  }
}

// Get border height for layout calculations
export function getBorderHeight(style: BorderStyle): number {
  switch (style) {
    case 'line':
      return 8;
    case 'double-line':
      return 12;
    case 'ornate-1':
      return 28;
    case 'ornate-2':
      return 24;
    case 'flourish':
      return 36;
    default:
      return 0;
  }
}
