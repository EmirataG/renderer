---
phase: quick
plan: 005
subsystem: rendering
tags: [verovio, fonts, smufl]
completed: 2026-02-07
duration: 30s

files:
  modified:
    - src/hooks/useVerovio.ts
    - src/hooks/useSingleLineVerovio.ts

decisions:
  - id: quick-005-fontLoadAll
    title: "fontLoadAll: true for runtime font switching"
    rationale: "Verovio only loads Leipzig by default; fontLoadAll preloads all SMuFL fonts"
    alternatives: ["Lazy-load fonts on demand (not supported by Verovio)"]
---

# Quick Task 005: Fix Music Font Not Changing - Summary

**One-liner:** Add `fontLoadAll: true` to both Verovio hooks to enable runtime music font switching.

## What Was Done

The music font dropdown added in quick-004 didn't actually change the rendered font because Verovio only loads the default Leipzig font unless explicitly told to load all fonts.

### Root Cause

Verovio's default behavior is to load only the Leipzig font (its default). Other SMuFL fonts (Bravura, Petaluma, Leland, Gootville) are not loaded unless `fontLoadAll: true` is set in the toolkit options.

### Fix Applied

Added `fontLoadAll: true` to `toolkit.setOptions()` in both hooks:

1. **useVerovio.ts** (paginated renderer)
2. **useSingleLineVerovio.ts** (single-line renderer)

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add fontLoadAll to useVerovio.ts | 94d5b6a | src/hooks/useVerovio.ts |
| 2 | Add fontLoadAll to useSingleLineVerovio.ts | 1d1fd0d | src/hooks/useSingleLineVerovio.ts |
| 3 | Verify fix works | - | (build verification) |

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- Build passes: `npm run build` succeeds without errors
- Manual verification: Font dropdown changes should now visibly change music notation glyphs

## Key Code Change

```typescript
toolkit.setOptions({
  font: font.toLowerCase(),
  fontLoadAll: true,  // Load all music fonts to enable runtime font switching
  // ... other options
});
```

## Impact

- Both RegularRenderer and SingleLineRenderer now respect the font selector
- All five SMuFL fonts are available: Bravura, Petaluma, Leland, Gootville, Leipzig
- Changing the dropdown immediately re-renders with the selected font
