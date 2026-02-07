---
phase: quick-004
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/hooks/useSingleLineVerovio.ts
  - src/renderers/SingleLineRenderer.tsx
  - src/hooks/useVerovio.ts
  - src/App.tsx
autonomous: true

must_haves:
  truths:
    - "quick-003 staff alignment changes are fully reverted"
    - "SingleLineRenderer renders without translateY alignment offsets"
    - "User can select music font from dropdown in inspector"
    - "Selected font is applied to Verovio rendering"
  artifacts:
    - path: "src/hooks/useSingleLineVerovio.ts"
      provides: "Single-line Verovio hook without staff offset extraction"
    - path: "src/renderers/SingleLineRenderer.tsx"
      provides: "Renderer without alignment offset logic"
    - path: "src/App.tsx"
      provides: "Font selector dropdown in Score Appearance section"
---

<objective>
Revert the failed quick-003 staff line alignment feature and add a music font selection dropdown to the inspector UI.

Purpose: quick-003 introduced vertical staff alignment that didn't work correctly. Remove it entirely and add a new feature: music font selection (Bravura, Petaluma, Leland, Gootville, Leipzig).

Output: Clean renderer without alignment offsets + font selector in inspector
</objective>

<execution_context>
@/Users/emirahmed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/emirahmed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/hooks/useSingleLineVerovio.ts
@src/renderers/SingleLineRenderer.tsx
@src/hooks/useVerovio.ts
@src/App.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Revert quick-003 staff alignment changes</name>
  <files>src/hooks/useSingleLineVerovio.ts, src/renderers/SingleLineRenderer.tsx</files>
  <action>
Revert the quick-003 changes by removing staff alignment code:

In `src/hooks/useSingleLineVerovio.ts`:
1. Remove `sectionStaffOffsets` from the `UseSingleLineVerovioResult` interface (line 10)
2. Remove the entire `extractStaffYOffset` function (lines 35-68)
3. Remove `sectionStaffOffsets` state: `const [sectionStaffOffsets, setSectionStaffOffsets] = useState<number[]>([]);` (line 79)
4. Remove all `setSectionStaffOffsets([])` calls in error/empty handlers
5. Remove `const staffOffsets = renderedSections.map(extractStaffYOffset);` (line 203)
6. Remove `setSectionStaffOffsets(staffOffsets);` (line 210)
7. Remove `sectionStaffOffsets` from the return object (line 248)

In `src/renderers/SingleLineRenderer.tsx`:
1. Remove `sectionStaffOffsets` from the useSingleLineVerovio destructure (line 88)
2. Remove the `referenceStaffY` computation (lines 92-94)
3. In the sections.map() JSX (around line 837-850), remove the `alignmentOffset` calculation and the `transform: alignmentOffset !== 0 ? ...` style

Keep `alignItems: 'flex-start'` in the section container style as that's correct baseline behavior.
  </action>
  <verify>
- `npm run build` passes with no TypeScript errors
- `sectionStaffOffsets` and `extractStaffYOffset` no longer exist in codebase
- `grep -r "sectionStaffOffsets" src/` returns no results
  </verify>
  <done>All quick-003 staff alignment code removed; SingleLineRenderer renders sections without vertical translateY offsets</done>
</task>

<task type="auto">
  <name>Task 2: Add music font selector to inspector</name>
  <files>src/App.tsx, src/hooks/useVerovio.ts, src/hooks/useSingleLineVerovio.ts</files>
  <action>
Add a music font selection dropdown to the Score Appearance section in the inspector.

**In `src/App.tsx`:**

1. Add state for music font after `scoreScale` state (around line 56):
```typescript
const [musicFont, setMusicFont] = useState<string>('Bravura');
```

2. Add the font selector dropdown in the "Score Appearance" section, after the "Size" slider (around line 262). Add it before the "Shadow" slider:
```tsx
<div className="space-y-2">
  <label className="block text-xs text-neutral-300 font-medium">
    Music Font
  </label>
  <select
    value={musicFont}
    onChange={(e) => setMusicFont(e.target.value)}
    className="grunge-select w-full"
  >
    <option value="Bravura">Bravura</option>
    <option value="Petaluma">Petaluma</option>
    <option value="Leland">Leland</option>
    <option value="Gootville">Gootville</option>
    <option value="Leipzig">Leipzig</option>
  </select>
</div>
```

3. Pass `musicFont` prop to both renderers (SingleLineRenderer and RegularRenderer):
```tsx
musicFont={musicFont}
```

**In `src/renderers/RegularRenderer.tsx`:**
Add `musicFont?: string` to Props interface and pass it through.

**In `src/renderers/SingleLineRenderer.tsx`:**
Add `musicFont?: string` to Props interface and pass it through.

**In `src/hooks/useVerovio.ts`:**

1. Add `font` parameter to function signature:
```typescript
export function useVerovio(
  xml: string,
  containerWidth: number,
  scale: number = 40,
  font: string = 'Bravura'
): UseVerovioResult {
```

2. Add `font` to setOptions (Verovio uses lowercase font names):
```typescript
toolkit.setOptions({
  font: font.toLowerCase(),
  // ... existing options
});
```

3. Add `font` to useEffect dependency array.

**In `src/hooks/useSingleLineVerovio.ts`:**

1. Add `font` parameter:
```typescript
export function useSingleLineVerovio(
  xml: string,
  scale: number = 40,
  measuresPerSection: number = 15,
  font: string = 'Bravura'
): UseSingleLineVerovioResult {
```

2. Add `font` to setOptions:
```typescript
toolkit.setOptions({
  font: font.toLowerCase(),
  // ... existing options
});
```

3. Add `font` to useEffect dependency array.

**Add grunge-select style to index.css** (if not already present - check first):
```css
.grunge-select {
  @apply bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-sm text-neutral-100;
  @apply focus:outline-none focus:border-neutral-500;
}
```
  </action>
  <verify>
- `npm run build` passes
- App loads without errors
- Music Font dropdown appears in Score Appearance section
- Changing font re-renders the score with the selected font
  </verify>
  <done>Music font dropdown in inspector; selecting a font applies it to Verovio rendering</done>
</task>

</tasks>

<verification>
1. Build passes: `npm run build`
2. App loads: `npm run dev` and visit http://localhost:5173
3. No alignment code: `grep -r "sectionStaffOffsets\|extractStaffYOffset\|referenceStaffY\|alignmentOffset" src/` returns no results
4. Font selector visible in inspector under Score Appearance
5. Changing font re-renders the score with different glyphs
</verification>

<success_criteria>
- quick-003 staff alignment fully reverted (no sectionStaffOffsets, no translateY offsets)
- Music font dropdown in inspector (Bravura, Petaluma, Leland, Gootville, Leipzig)
- Selected font applies to both RegularRenderer and SingleLineRenderer
- Build passes, no TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/004-revert-003-add-music-font-selector/004-SUMMARY.md`
</output>
