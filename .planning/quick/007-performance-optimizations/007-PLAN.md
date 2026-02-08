---
phase: quick-007
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/renderers/SingleLineRenderer.tsx
  - src/renderers/RegularRenderer.tsx
  - src/hooks/useSingleLineVerovio.ts
  - src/hooks/useVerovio.ts
autonomous: true

must_haves:
  truths:
    - "Score rendering performance is improved without visual changes"
    - "CSS is not regenerated on every render when scoreColor unchanged"
    - "Timeline lookup is O(log n) instead of O(n)"
    - "Zustand selectors batch state reads in single subscription"
    - "SVG regex patterns are compiled once at module load"
  artifacts:
    - path: "src/renderers/SingleLineRenderer.tsx"
      provides: "Memoized CSS, binary search, shallow selector"
    - path: "src/renderers/RegularRenderer.tsx"
      provides: "Memoized CSS, binary search, shallow selector"
    - path: "src/hooks/useSingleLineVerovio.ts"
      provides: "Pre-compiled regex patterns"
    - path: "src/hooks/useVerovio.ts"
      provides: "Pre-compiled regex patterns"
  key_links:
    - from: "SingleLineRenderer.tsx"
      to: "useEventStore"
      via: "useShallow selector"
      pattern: "useShallow.*events.*svgPagesRef.*setEvents"
---

<objective>
Implement high-impact, low-risk performance optimizations across both renderers and Verovio hooks.

Purpose: Reduce unnecessary re-renders and improve timeline lookup efficiency during playback.
Output: Optimized renderers with memoized CSS, binary search, shallow selectors, and pre-compiled regex.
</objective>

<execution_context>
@/Users/emirahmed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/emirahmed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/renderers/SingleLineRenderer.tsx
@src/renderers/RegularRenderer.tsx
@src/hooks/useSingleLineVerovio.ts
@src/hooks/useVerovio.ts
@src/stores/eventStore.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Memoize CSS and use binary search in both renderers</name>
  <files>
    src/renderers/SingleLineRenderer.tsx
    src/renderers/RegularRenderer.tsx
  </files>
  <action>
In both SingleLineRenderer.tsx and RegularRenderer.tsx:

1. **useMemo for scoreColorCss** (HIGH IMPACT):
   - Wrap `scoreColorCss` template literal in `useMemo(() => ..., [scoreColor])`
   - Import useMemo from React (already imported in both files)
   - This prevents CSS string recreation on every render

2. **Binary search for getEventAtTimestamp** (MEDIUM IMPACT):
   - Replace the linear O(n) reverse loop with binary search O(log n)
   - Target: Find last event where `computedTimestamp <= timestampSec`
   - Binary search pattern:
     ```typescript
     function getEventAtTimestamp(timestampSec: number) {
       if (interpolatedEvents.length === 0) return { event: null, index: -1 };

       let low = 0;
       let high = interpolatedEvents.length - 1;
       let result = -1;

       while (low <= high) {
         const mid = Math.floor((low + high) / 2);
         if (interpolatedEvents[mid].computedTimestamp <= timestampSec) {
           result = mid;
           low = mid + 1;
         } else {
           high = mid - 1;
         }
       }

       if (result < 0) return { event: null, index: -1 };
       return { event: interpolatedEvents[result], index: result };
     }
     ```
   - Also update the binary search in `setTimestamp` callback (same pattern)

3. **useShallow for Zustand selectors** (HIGH IMPACT):
   - Import `useShallow` from `zustand/react/shallow`
   - Combine the three separate selectors into one with useShallow:
     ```typescript
     const { events, svgPagesRef, setEvents: setEventsInStore } = useEventStore(
       useShallow((state) => ({
         events: state.events,
         svgPagesRef: state.svgPagesRef,
         setEvents: state.setEvents,
       }))
     );
     ```
   - This prevents re-renders when unrelated store state changes
  </action>
  <verify>
    - `npm run build` succeeds with no TypeScript errors
    - Load a score and verify playback works identically
    - No visual differences in rendered output
  </verify>
  <done>
    - scoreColorCss wrapped in useMemo with [scoreColor] dependency
    - getEventAtTimestamp uses binary search in both files
    - setTimestamp callback uses binary search in both files
    - Zustand selectors use useShallow pattern
  </done>
</task>

<task type="auto">
  <name>Task 2: Pre-compile regex patterns in Verovio hooks</name>
  <files>
    src/hooks/useSingleLineVerovio.ts
    src/hooks/useVerovio.ts
  </files>
  <action>
In both useSingleLineVerovio.ts and useVerovio.ts:

1. **Move regex patterns to module scope** (MEDIUM IMPACT):
   - Extract regex patterns from `extractSectionDimensions` and `extractPageHeight` functions
   - Compile once at module load instead of every function call

   In useSingleLineVerovio.ts (around line 19-32):
   ```typescript
   // Pre-compiled regex patterns (module scope)
   const WIDTH_REGEX = /width="(\d+(?:\.\d+)?)px"/;
   const HEIGHT_REGEX = /height="(\d+(?:\.\d+)?)px"/;
   const VIEWBOX_REGEX = /viewBox="0 0 ([\d.]+) ([\d.]+)"/;

   function extractSectionDimensions(svgString: string): { width: number; height: number } {
     const widthMatch = svgString.match(WIDTH_REGEX);
     const heightMatch = svgString.match(HEIGHT_REGEX);
     if (widthMatch && heightMatch) {
       return { width: parseFloat(widthMatch[1]), height: parseFloat(heightMatch[1]) };
     }
     const vbMatch = svgString.match(VIEWBOX_REGEX);
     if (vbMatch) {
       return { width: parseFloat(vbMatch[1]), height: parseFloat(vbMatch[2]) };
     }
     return { width: 0, height: 0 };
   }
   ```

   In useVerovio.ts (around line 16-23):
   ```typescript
   // Pre-compiled regex patterns (module scope)
   const HEIGHT_REGEX = /height="(\d+(?:\.\d+)?)px"/;
   const VIEWBOX_HEIGHT_REGEX = /viewBox="0 0 [\d.]+ ([\d.]+)"/;

   function extractPageHeight(svgString: string): number {
     const match = svgString.match(HEIGHT_REGEX);
     if (match) return parseFloat(match[1]);
     const vbMatch = svgString.match(VIEWBOX_HEIGHT_REGEX);
     if (vbMatch) return parseFloat(vbMatch[1]);
     return 0;
   }
   ```

2. **Also pre-compile the measure count regex** in useSingleLineVerovio.ts (line 122):
   ```typescript
   // At module scope
   const MEASURE_REGEX = /<measure /g;

   // In render function
   const measureMatches = mei.match(MEASURE_REGEX);
   // Reset lastIndex for global regex reuse
   MEASURE_REGEX.lastIndex = 0;
   ```
  </action>
  <verify>
    - `npm run build` succeeds with no TypeScript errors
    - Load a score in both Regular and SingleLine modes
    - Rendering works correctly with no dimension calculation errors
  </verify>
  <done>
    - All regex patterns in useSingleLineVerovio.ts moved to module scope
    - All regex patterns in useVerovio.ts moved to module scope
    - Regex instances are created once at module load, not per function call
  </done>
</task>

</tasks>

<verification>
1. Build passes: `npm run build`
2. Both renderers load and play scores correctly
3. No visual differences in rendering
4. Console shows no new errors or warnings
</verification>

<success_criteria>
- All 4 optimizations implemented (useMemo CSS, binary search, useShallow, pre-compiled regex)
- No behavior changes - purely performance improvements
- Build succeeds with no errors
- Manual verification shows identical playback behavior
</success_criteria>

<output>
After completion, create `.planning/quick/007-performance-optimizations/007-SUMMARY.md`
</output>
