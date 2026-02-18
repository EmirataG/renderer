export interface PerspectiveCorners {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
}

export interface ScoreRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  perspective?: PerspectiveCorners;
}
