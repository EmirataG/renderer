---
phase: quick
plan: 005
type: execute
wave: 1
depends_on: []
files_modified:
  - src/hooks/useVerovio.ts
  - src/hooks/useSingleLineVerovio.ts
autonomous: true

must_haves:
  truths:
    - "Changing music font dropdown immediately re-renders score with new font"
    - "All five fonts work: Bravura, Petaluma, Leland, Gootville, Leipzig"
  artifacts:
    - path: "src/hooks/useVerovio.ts"
      provides: "Verovio hook with fontLoadAll option"
      contains: "fontLoadAll: true"
    - path: "src/hooks/useSingleLineVerovio.ts"
      provides: "Single-line Verovio hook with fontLoadAll option"
      contains: "fontLoadAll: true"
  key_links:
    - from: "App.tsx musicFont state"
      to: "useVerovio/useSingleLineVerovio font param"
      via: "prop drilling through renderers"
      pattern: "font.*lowercase"
---

<objective>
Fix music font selector not changing the rendered font.

Purpose: The font dropdown added in quick-004 doesn't actually change the font because Verovio only loads the default Leipzig font unless `fontLoadAll: true` is set in options.

Output: Working font selector that immediately re-renders with selected font.
</objective>

<execution_context>
@/Users/emirahmed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/emirahmed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/hooks/useVerovio.ts
@src/hooks/useSingleLineVerovio.ts
</context>

<root_cause>
**Verovio default behavior:** By default, Verovio only loads the Leipzig font (which is the default). Other SMuFL fonts (Bravura, Petaluma, Leland, Gootville) are not loaded unless explicitly requested.

**The fix:** Add `fontLoadAll: true` to the Verovio options in both hooks. This tells Verovio to load all available music fonts when the toolkit initializes, allowing runtime font switching.

From Verovio TypeScript definitions:
```typescript
/**
 * Load all music fonts
 * default: false
 */
fontLoadAll?: boolean;
```

The current code correctly sets `font: font.toLowerCase()` - this part is fine. The missing piece is loading all fonts so the font option actually has effect.
</root_cause>

<tasks>

<task type="auto">
  <name>Task 1: Add fontLoadAll to useVerovio.ts</name>
  <files>src/hooks/useVerovio.ts</files>
  <action>
Add `fontLoadAll: true` to the toolkit.setOptions() call in useVerovio.ts.

Current options block (around line 63-75):
```typescript
toolkit.setOptions({
  font: font.toLowerCase(),
  pageWidth: (containerWidth * 100) / scale,
  ...
});
```

Updated options block:
```typescript
toolkit.setOptions({
  font: font.toLowerCase(),
  fontLoadAll: true,  // Load all music fonts to enable runtime font switching
  pageWidth: (containerWidth * 100) / scale,
  ...
});
```
  </action>
  <verify>TypeScript compiles: `npm run build` succeeds</verify>
  <done>fontLoadAll: true present in useVerovio.ts setOptions call</done>
</task>

<task type="auto">
  <name>Task 2: Add fontLoadAll to useSingleLineVerovio.ts</name>
  <files>src/hooks/useSingleLineVerovio.ts</files>
  <action>
Add `fontLoadAll: true` to the toolkit.setOptions() call in useSingleLineVerovio.ts.

Current options block (around line 79-94):
```typescript
toolkit.setOptions({
  font: font.toLowerCase(),
  breaks: 'none',
  ...
});
```

Updated options block:
```typescript
toolkit.setOptions({
  font: font.toLowerCase(),
  fontLoadAll: true,  // Load all music fonts to enable runtime font switching
  breaks: 'none',
  ...
});
```
  </action>
  <verify>TypeScript compiles: `npm run build` succeeds</verify>
  <done>fontLoadAll: true present in useSingleLineVerovio.ts setOptions call</done>
</task>

<task type="auto">
  <name>Task 3: Verify fix works</name>
  <files></files>
  <action>
1. Run `npm run dev` to start the dev server
2. Open the app in browser
3. Load a MusicXML file
4. Change the "Music Font" dropdown to each option (Bravura, Petaluma, Leland, Gootville, Leipzig)
5. Confirm the score re-renders with visibly different notation glyphs for each font

Each font has a distinct visual style:
- Bravura: Standard modern engraving style
- Petaluma: Hand-drawn/jazz style with rounder shapes
- Leland: MuseScore's default font, clean and modern
- Gootville: Informal handwritten style
- Leipzig: Traditional engraving style (Verovio's default)
  </action>
  <verify>
Manual verification: Changing font dropdown visibly changes the music notation glyphs.
Build passes: `npm run build` succeeds.
  </verify>
  <done>All five fonts render correctly when selected from dropdown</done>
</task>

</tasks>

<verification>
1. `npm run build` passes without errors
2. Font dropdown changes are reflected in rendered score
3. Both RegularRenderer and SingleLineRenderer respect font selection
</verification>

<success_criteria>
- fontLoadAll: true added to both Verovio hooks
- Build succeeds
- Font selector dropdown works in the UI - changing font immediately re-renders with new font
</success_criteria>

<output>
After completion, create `.planning/quick/005-fix-music-font-not-changing/005-SUMMARY.md`
</output>
