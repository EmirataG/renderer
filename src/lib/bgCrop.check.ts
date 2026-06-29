// Self-check for the crop math. Run: npx tsx src/lib/bgCrop.check.ts
import assert from 'node:assert';
import { bgCropPosition } from './bgCrop';

// null / full image → centered cover
assert.equal(bgCropPosition(null), '50% 50%');
assert.equal(bgCropPosition({ x: 0, y: 0, w: 1, h: 1 }), '50% 50%');

// horizontal pan (image wider than frame, cropH = 1)
assert.equal(bgCropPosition({ x: 0, y: 0, w: 0.5, h: 1 }), '0% 50%');     // left edge
assert.equal(bgCropPosition({ x: 0.5, y: 0, w: 0.5, h: 1 }), '100% 50%'); // right edge
assert.equal(bgCropPosition({ x: 0.25, y: 0, w: 0.5, h: 1 }), '50% 50%'); // centered

// vertical pan (image taller than frame, cropW = 1)
assert.equal(bgCropPosition({ x: 0, y: 0.5, w: 1, h: 0.5 }), '50% 100%'); // bottom

console.log('bgCrop.check: ok');
