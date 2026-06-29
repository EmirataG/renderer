// Self-check for the two-sided reveal/fade mask. Run: npx tsx src/lib/revealMask.check.ts
import assert from 'node:assert';
import { applyReveal, type RevealParams } from './revealMask';

function run(params: RevealParams) {
  const el = { style: {} as Record<string, string>, dataset: {} as Record<string, string> };
  applyReveal(el as unknown as HTMLElement, params);
  return { clip: el.style.clipPath ?? '', mask: el.style.maskImage ?? '' };
}

// Fade-in only (op > 0) reproduces the original single-sided gradient.
assert.deepEqual(
  run({ playedFrac: 0.5, bandFrac: 0.1, unplayedOpacity: 0.3 }),
  { clip: '', mask: 'linear-gradient(to right, #000 50.00%, rgba(0,0,0,0.3000) 60.00%)' },
);

// Two-sided faded: tail fade-out (q=20, fs=10) + head fade-in (p=50, fe=60).
assert.deepEqual(
  run({ playedFrac: 0.5, bandFrac: 0.1, unplayedOpacity: 0.3, fadeOutFrac: 0.2 }),
  {
    clip: '',
    mask: 'linear-gradient(to right, rgba(0,0,0,0.3000) 10.00%, #000 20.00%, #000 50.00%, rgba(0,0,0,0.3000) 60.00%)',
  },
);

// Hidden (op === 0), hard edge, no fade-out → clip the tail only.
assert.deepEqual(
  run({ playedFrac: 0.5, bandFrac: 0, unplayedOpacity: 0 }),
  { clip: 'inset(-50% 50.00% -50% 0.00%)', mask: '' },
);

// Hidden, hard edge, with fade-out → clip both head and tail.
assert.deepEqual(
  run({ playedFrac: 0.5, bandFrac: 0, unplayedOpacity: 0, fadeOutFrac: 0.2 }),
  { clip: 'inset(-50% 50.00% -50% 20.00%)', mask: '' },
);

// Fully played, no fade-out → reveal everything.
assert.deepEqual(
  run({ playedFrac: 1.2, bandFrac: 0.1, unplayedOpacity: 0 }),
  { clip: '', mask: '' },
);

console.log('revealMask.check: ok');
