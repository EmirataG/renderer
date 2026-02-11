---
phase: quick-39
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/App.tsx
  - src/renderers/RegularRenderer.tsx
  - src/lib/exportClient.ts
  - src/types/global.d.ts
  - src/RenderApp.tsx
  - export-service/src/shared/exportSettings.ts
  - export-service/src/browser/pageSetup.ts
autonomous: true
must_haves:
  truths:
    - "Inspector has a 'Hide Instrument Labels' checkbox in Score Appearance section"
    - "When checkbox is checked, instrument labels (class 'label') are hidden from the rendered score preview"
    - "When checkbox is unchecked, instrument labels are visible (default)"
    - "Setting persists through video export (labels hidden in exported video when enabled)"
  artifacts:
    - path: "src/App.tsx"
      provides: "hideLabels state + checkbox UI + prop threading"
    - path: "src/renderers/RegularRenderer.tsx"
      provides: "hideLabels prop + CSS rule to hide .label elements"
  key_links:
    - from: "src/App.tsx"
      to: "src/renderers/RegularRenderer.tsx"
      via: "hideLabels prop"
    - from: "src/App.tsx"
      to: "export-service"
      via: "ExportSettings.hideLabels -> ExportConfig.hideLabels -> RenderApp.tsx prop"
---

<objective>
Add an inspector checkbox to hide instrument labels (Verovio SVG elements with class "label", e.g., "Piano", "Violin") from the rendered score. The setting flows through the full export pipeline so exported videos also respect it.

Purpose: Users want clean scores without instrument name labels cluttering the rendering.
Output: Working checkbox in inspector, CSS-based label hiding in preview and export.
</objective>

<execution_context>
@/Users/emirahmed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/emirahmed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/App.tsx
@src/renderers/RegularRenderer.tsx
@src/lib/exportClient.ts
@src/types/global.d.ts
@src/RenderApp.tsx
@export-service/src/shared/exportSettings.ts
@export-service/src/browser/pageSetup.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add hideLabels state and checkbox to inspector</name>
  <files>src/App.tsx</files>
  <action>
    1. Add state: `const [hideLabels, setHideLabels] = useState(false);`
       Place it near the other score appearance states (around line 69, after musicFont).

    2. Add checkbox in the "Score Appearance" section, after the Music Font select and before the Border Picker (around line 395). Use the exact same pattern as the "Highlight Active Notes" checkbox in the Note Animation section:
       ```tsx
       <div className="pt-1 pb-2">
         <label className="flex items-center gap-2.5 text-xs cursor-pointer group">
           <input
             type="checkbox"
             checked={hideLabels}
             onChange={(e) => setHideLabels(e.target.checked)}
             className="grunge-checkbox"
           />
           <span className="font-medium text-neutral-300 group-hover:text-neutral-100 transition-colors">
             Hide Instrument Labels
           </span>
         </label>
       </div>
       ```

    3. Pass `hideLabels={hideLabels}` prop to both RegularRenderer and SingleLineRenderer (around lines 700-720).

    4. Add `hideLabels` to the export settings object in handleExport (around line 173):
       ```ts
       const settings: ExportSettings = {
         fps, scoreColor, scoreShadowDistance, hideUnplayedNotes, smoothReveal,
         scoreRegion, scoreBorder, scoreScale,
         musicFont: musicFont as ExportSettings['musicFont'],
         activeNoteheadColor, activeNoteheadScale,
         activeNoteheadEntryMs, activeNoteheadHoldMs, activeNoteheadExitMs,
         colorFullNote, hideLabels,
         audioDuration: audioRef.current?.duration,
       };
       ```
  </action>
  <verify>TypeScript compiles without errors: `npx tsc --noEmit` from renderer root (warnings about SingleLineRenderer not accepting the prop are expected until Task 2 completes).</verify>
  <done>Inspector has "Hide Instrument Labels" checkbox in Score Appearance section. Prop is passed to renderers and included in export settings.</done>
</task>

<task type="auto">
  <name>Task 2: Implement CSS-based label hiding in RegularRenderer and thread through export pipeline</name>
  <files>
    src/renderers/RegularRenderer.tsx
    src/lib/exportClient.ts
    src/types/global.d.ts
    src/RenderApp.tsx
    export-service/src/shared/exportSettings.ts
    export-service/src/browser/pageSetup.ts
  </files>
  <action>
    **RegularRenderer.tsx:**
    1. Add `hideLabels?: boolean;` to the Props interface (after colorFullNote).
    2. Add `hideLabels = false` to the destructured props.
    3. In the `scoreColorCss` useMemo (around line 282), add `hideLabels` to the dependency array and append this CSS rule when hideLabels is true:
       ```ts
       const scoreColorCss = useMemo(() => `
         ... existing rules ...
         ${hideLabels ? '.preview-score .label { display: none !important; }' : ''}
       `, [scoreColor, hideLabels]);
       ```
       This targets Verovio's `.label` class which wraps instrument name text elements like "Piano".

    **exportClient.ts:**
    4. Add `hideLabels: boolean;` to the ExportSettings interface.

    **export-service/src/shared/exportSettings.ts:**
    5. Add `hideLabels: Type.Boolean()` to ExportSettingsSchema (after colorFullNote).

    **src/types/global.d.ts:**
    6. Add `hideLabels: boolean;` to the ExportConfig interface (after colorFullNote).

    **export-service/src/browser/pageSetup.ts:**
    7. Add `hideLabels: boolean;` to the ExportConfig interface (after colorFullNote).
    8. In buildExportConfig, add `hideLabels: job.settings.hideLabels,` to the returned object.

    **src/RenderApp.tsx:**
    9. Pass `hideLabels={config.hideLabels ?? false}` to RegularRenderer.
  </action>
  <verify>
    1. `npx tsc --noEmit` passes from renderer root (frontend).
    2. `cd export-service && npx tsc --noEmit` passes (backend).
    3. `npm run build` succeeds from renderer root.
  </verify>
  <done>hideLabels prop hides elements with class "label" via CSS display:none in preview. Setting flows through the full export pipeline: ExportSettings -> ExportConfig -> RenderApp -> RegularRenderer.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes in both renderer/ and export-service/
2. `npm run build` succeeds
3. Load a MusicXML score with instrument labels (e.g., a piano score showing "Piano" label)
4. Toggle "Hide Instrument Labels" checkbox -- labels should disappear/reappear in preview
</verification>

<success_criteria>
- Inspector checkbox toggles instrument label visibility via CSS
- Labels hidden when checked, visible when unchecked (default: unchecked)
- Export pipeline includes hideLabels setting end-to-end
- No TypeScript errors in frontend or backend
</success_criteria>

<output>
After completion, create `.planning/quick/39-add-inspector-option-to-remove-instrumen/39-SUMMARY.md`
</output>
