import type { BgCrop } from '../types/project';

/**
 * Crop math for the background-placement feature. The crop rect is normalized
 * (0–1) and AR-matched to the frame, so it pairs with `background-size: cover`
 * (DOM) / a cover-scaled `drawImage` (canvas): cover fixes the scale, the crop
 * only chooses which part is shown. null = centered cover (legacy / AR-matched).
 */

/** CSS `background-position` for a crop rect (use with `background-size: cover`). */
export function bgCropPosition(crop: BgCrop | null | undefined): string {
  if (!crop) return '50% 50%';
  const px = crop.w >= 1 ? 0.5 : crop.x / (1 - crop.w);
  const py = crop.h >= 1 ? 0.5 : crop.y / (1 - crop.h);
  return `${px * 100}% ${py * 100}%`;
}

/** Source rect (image pixels) to draw a crop rect onto a frame-sized canvas. */
export function bgCropSourceRect(crop: BgCrop, imgW: number, imgH: number) {
  return { sx: crop.x * imgW, sy: crop.y * imgH, sw: crop.w * imgW, sh: crop.h * imgH };
}
