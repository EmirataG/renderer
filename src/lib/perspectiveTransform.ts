/**
 * Perspective transform utility.
 *
 * Computes a CSS matrix3d() string from 4 source corners (rectangle)
 * mapped to 4 destination corners (distorted quadrilateral).
 *
 * Uses the Direct Linear Transform (DLT) approach to solve for the
 * 3x3 homography matrix, then converts it to CSS matrix3d format.
 *
 * IMPORTANT: When applying this transform, set transform-origin to "0 0"
 * since the homography is computed relative to the top-left corner.
 */

import type { PerspectiveCorners } from '../types/score';

/**
 * Check if any corner has a non-zero offset.
 */
export function hasPerspective(corners: PerspectiveCorners | undefined): boolean {
  if (!corners) return false;
  return (
    corners.topLeft.x !== 0 || corners.topLeft.y !== 0 ||
    corners.topRight.x !== 0 || corners.topRight.y !== 0 ||
    corners.bottomRight.x !== 0 || corners.bottomRight.y !== 0 ||
    corners.bottomLeft.x !== 0 || corners.bottomLeft.y !== 0
  );
}

/**
 * Solve a 3x3 homography from 4 point correspondences using the adjugate method.
 *
 * Given source points (rectangle corners) and destination points (distorted corners),
 * compute the 3x3 projective transform matrix H such that:
 *   H * [sx, sy, 1]^T ~ [dx, dy, 1]^T
 *
 * Returns the matrix as a flat array [a, b, c, d, e, f, g, h] where the
 * full 3x3 matrix is:
 *   | a  b  c |
 *   | d  e  f |
 *   | g  h  1 |
 */
function computeHomography(
  src: [number, number][],
  dst: [number, number][],
): number[] {
  // Build the 8x8 system of equations: A * h = b
  // For each point correspondence (sx, sy) -> (dx, dy):
  //   sx*a + sy*b + c - sx*dx*g - sy*dx*h = dx
  //   sx*d + sy*e + f - sx*dy*g - sy*dy*h = dy

  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const [sx, sy] = src[i];
    const [dx, dy] = dst[i];

    A.push([sx, sy, 1, 0, 0, 0, -sx * dx, -sy * dx]);
    b.push(dx);
    A.push([0, 0, 0, sx, sy, 1, -sx * dy, -sy * dy]);
    b.push(dy);
  }

  // Solve using Gaussian elimination with partial pivoting
  const n = 8;
  const aug: number[][] = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // Find pivot
    let maxVal = Math.abs(aug[col][col]);
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > maxVal) {
        maxVal = Math.abs(aug[row][col]);
        maxRow = row;
      }
    }

    // Swap rows
    if (maxRow !== col) {
      [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    }

    // Eliminate below
    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-10) {
      // Singular matrix -- return identity
      return [1, 0, 0, 0, 1, 0, 0, 0];
    }

    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / pivot;
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  // Back-substitution
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = aug[i][n];
    for (let j = i + 1; j < n; j++) {
      x[i] -= aug[i][j] * x[j];
    }
    x[i] /= aug[i][i];
  }

  return x; // [a, b, c, d, e, f, g, h]
}

/**
 * Compute a CSS matrix3d() string from corner offsets.
 *
 * Source corners are the rectangle: (0,0), (w,0), (w,h), (0,h)
 * Destination corners are source + offsets from PerspectiveCorners.
 *
 * Returns the matrix3d(...) CSS value, or empty string if all offsets are zero.
 */
export function computeMatrix3d(
  width: number,
  height: number,
  corners: PerspectiveCorners,
): string {
  if (!hasPerspective(corners)) return '';

  // Source corners (rectangle)
  const src: [number, number][] = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ];

  // Destination corners (source + offset)
  const dst: [number, number][] = [
    [corners.topLeft.x, corners.topLeft.y],
    [width + corners.topRight.x, corners.topRight.y],
    [width + corners.bottomRight.x, height + corners.bottomRight.y],
    [corners.bottomLeft.x, height + corners.bottomLeft.y],
  ];

  const h = computeHomography(src, dst);
  // h = [a, b, c, d, e, f, g, h]
  // 3x3 matrix:
  //   | a  b  c |     | h[0]  h[1]  h[2] |
  //   | d  e  f |  =  | h[3]  h[4]  h[5] |
  //   | g  h  1 |     | h[6]  h[7]  1    |
  //
  // CSS matrix3d maps as:
  //   matrix3d(
  //     a, d, 0, g,
  //     b, e, 0, h,
  //     0, 0, 1, 0,
  //     c, f, 0, 1
  //   )

  const a = h[0], b = h[1], c = h[2];
  const d = h[3], e = h[4], f = h[5];
  const g = h[6], hh = h[7];

  return `matrix3d(${a}, ${d}, 0, ${g}, ${b}, ${e}, 0, ${hh}, 0, 0, 1, 0, ${c}, ${f}, 0, 1)`;
}
