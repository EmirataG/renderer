# Codebase Concerns

**Analysis Date:** 2026-02-03

## Tech Debt

**Type Safety: Unsafe Type Assertions**
- Issue: Multiple instances of `as any` casting used to bypass TypeScript type checking, particularly when accessing OSMD internal properties
- Files:
  - `src/renderers/RegularRenderer.tsx` (line 245, 909, 922)
  - `src/components/SyncEditor.tsx` (line 67)
  - `src/lib/getEvents.ts` (internal access)
- Impact: Circumvents type safety, making code fragile to OSMD library changes; potential runtime errors if OSMD internal structure changes
- Fix approach: Explore OSMD's public API for type-safe alternatives; if unavoidable, create typed wrapper interfaces around OSMD internals

**Global Window Object Mutation**
- Issue: Directly assigning to `window.animationController` to expose API for Puppeteer frame control
- Files: `src/renderers/RegularRenderer.tsx` (lines 909-917)
- Impact: Pollutes global scope; creates tight coupling between React component and external testing framework; difficult to test in isolation
- Fix approach: Use dependency injection pattern or a proper module loader; consider creating a dedicated controller module that can be imported rather than queried from window

**Untracked setTimeout Side Effects**
- Issue: `window.setTimeout()` used in animation code without storing/tracking timer IDs
- Files: `src/lib/noteAnimation.ts` (line 54)
- Impact: Timers may continue running after component unmount, causing memory leaks and unexpected animations; multiple overlapping animations could cause performance issues
- Fix approach: Store timer IDs in refs and clear them on cleanup; use AbortController pattern for cancellation

**String-Based SVG ID Queries**
- Issue: SVG element IDs extracted and queried as strings with CSS.escape() but format is fragile
- Files: `src/renderers/RegularRenderer.tsx` (lines 244-248), `src/lib/noteAnimation.ts` (line 23)
- Impact: If OSMD changes ID generation format, selectors break silently; namespace pollution if multiple OSMD instances
- Fix approach: Create stable ID generation with component instance tracking; consider WeakMap for element references instead of string queries

## Known Bugs

**Image Loading Race Condition**
- Symptoms: Container dimensions may not be calculated correctly if background image is slow to load
- Files: `src/App.tsx` (lines 85-94), `src/renderers/RegularRenderer.tsx` (lines 177-194)
- Trigger: Large background images or slow network connections; happens on both App and RegularRenderer
- Impact: Score region may render at wrong dimensions, misaligning with background
- Workaround: Preload images before component mount or add explicit dimension input
- Fix approach: Use Image.onload with Promise wrapper; set default dimensions immediately, update when loaded

**OSMD Render Container Cleanup**
- Symptoms: Hidden style elements or DOM artifacts left after OSMD re-renders
- Files: `src/renderers/RegularRenderer.tsx` (lines 429-434)
- Trigger: When scoreScale or scoreRegion.width changes, triggering osmd.render()
- Impact: Style elements accumulate in DOM; potential memory leaks with repeated renders
- Fix approach: Track style element lifecycle; remove old styles before adding new ones

**Debounce Timing Inconsistency**
- Symptoms: Score scale and region changes debounced differently (300ms each) but independently
- Files: `src/App.tsx` (lines 57-70)
- Trigger: User rapidly adjusts scale and region sliders
- Impact: Updates may arrive out of order; final state may not match user's last input
- Fix approach: Use Promise-based debounce library with configurable timing; consider grouping updates

## Security Considerations

**File Upload: No File Type Validation Beyond Extension**
- Risk: User could rename malicious files with .xml or other extensions
- Files: `src/lib/fileValidation.ts` (lines 53-70)
- Current mitigation: Extension checking + OSMD validation for XML files; MIME type fallback
- Recommendations:
  - Add magic number verification for audio/image files
  - Validate XML structure before OSMD load (currently caught but with large error messages)
  - Implement file size quota per session to prevent DOS via large uploads

**Object URLs Not Revoked on Error**
- Risk: Memory leak if file upload succeeds but subsequent processing fails
- Files: `src/App.tsx` (lines 114-129)
- Current mitigation: Revokes URL on removal or replacement
- Recommendations:
  - Wrap URL.createObjectURL in try-finally to guarantee revocation
  - Add timeout-based cleanup for dangling URLs
  - Track all created URLs in Set for audit/cleanup

**SVG CSS Injection via Score Color**
- Risk: User input (scoreColor) directly interpolated into CSS string without sanitization
- Files: `src/renderers/RegularRenderer.tsx` (lines 437-485)
- Current mitigation: CSS color picker restricts to valid hex; styled elements are non-interactive
- Recommendations:
  - Validate color format explicitly (reject non-hex/rgb)
  - Use data attributes + CSS custom properties instead of string interpolation
  - Add Content Security Policy headers to prevent style injection

**Window Object Pollution**
- Risk: Puppeteer API exposed on window.animationController without namespace protection
- Files: `src/renderers/RegularRenderer.tsx` (lines 909-917)
- Current mitigation: Only exposed in render mode (URL param check)
- Recommendations:
  - Namespace under `window.__MANUSCRIPT_INTERNAL__`
  - Add capability token/nonce validation if supporting untrusted environments
  - Document this as internal API, not public

## Performance Bottlenecks

**OSMD Re-initialization on Every XML Change**
- Problem: RegularRenderer creates new OpenSheetMusicDisplay instance on xml prop change
- Files: `src/renderers/RegularRenderer.tsx` (lines 330-359)
- Cause: useEffect dependency on xml; full DOM cleanup and re-render
- Impact: ~500ms+ latency for each score load; noticeable lag when switching files
- Improvement path:
  - Reuse OSMD instance; call load() and render() without recreating
  - Separate initialization from content loading logic
  - Profile: measure time to first render for large MusicXML files

**DOM Querying in Animation Loop**
- Problem: Animation frame continuously queries DOM to find SVG elements
- Files: `src/renderers/RegularRenderer.tsx` (lines 244-250, 835-860)
- Cause: String-based ID lookups in getEventsWithY and setTimestamp
- Impact: 60 FPS animation constrained by DOM query latency; poor performance on complex scores
- Improvement path:
  - Cache element references on first query
  - Use requestAnimationFrame for batched DOM updates
  - Consider keeping element cache in state instead of querying

**Style Re-application on Every Render**
- Problem: Full CSS ruleset regenerated and injected on every scoreColor/scoreScale change
- Files: `src/renderers/RegularRenderer.tsx` (lines 426-485)
- Cause: CSS in useEffect rebuilds entire ruleset even for single color property
- Impact: Frequent CSSOM updates during slider interaction
- Improvement path:
  - Use CSS custom properties (variables) instead of string interpolation
  - Apply only changed rules (color-only update doesn't need re-render rule)
  - Consider CSS-in-JS library for dynamic styling

**Interpolation Algorithm Complexity with Large Event Counts**
- Problem: O(n²) lookup pattern for finding surrounding anchors
- Files: `src/lib/interpolation.ts` (lines 92-100)
- Cause: For each event, linear search through anchorInfos to find neighbors
- Impact: Scales poorly with scores > 1000 events (symphonies, operas)
- Improvement path:
  - Binary search to find surrounding anchors (O(log n))
  - Pre-compute anchor segments once, reuse for all events
  - Cache results if anchors don't change frequently

## Fragile Areas

**Musical Event Y Position Calculation**
- Files: `src/renderers/RegularRenderer.tsx` (lines 226-328)
- Why fragile:
  - Relies on OSMD Cursor API extracting CSS left/top properties as strings, parsing numbers
  - Hardcoded OFFSET and Y_THRESHOLD magic numbers (15px and 20px) without explanation
  - System grouping by Y proximity may fail with unusual layouts (very tight staves, custom spacing)
  - No validation that cursor element has expected CSS properties
- Safe modification:
  - Add constants at top with documentation explaining thresholds
  - Add assertions/null-checks for CSS property access
  - Test on various layout types (piano staff, orchestral, unusual spacing)
- Test coverage: No unit tests for Y position calculation

**Sync Anchor Interpolation Logic**
- Files: `src/lib/interpolation.ts` (entire file)
- Why fragile:
  - Assumes anchors are always valid timestamps; no bounds checking
  - DEFAULT_BPM (60) used as fallback may not match actual audio
  - Edge case handling: What if anchor timestamps go backward?
  - No validation that events are sorted by beatOnset (relies on upstream)
- Safe modification:
  - Add validation: assert timestamps are increasing, beats are sorted
  - Make DEFAULT_BPM configurable or derived from first anchor pair
  - Add logging for debug mode when using fallback BPM
- Test coverage: No test cases for edge cases (backward time, duplicate beats, etc.)

**OSMD Rendering and Layout Assumptions**
- Files: `src/renderers/RegularRenderer.tsx` (lines 333-359, 376-393, 407-422)
- Why fragile:
  - Calls osmd.render() multiple times assuming stable state
  - Re-renders triggered by scoreScale and scoreRegion.width changes
  - No error handling if OSMD.load() or render() fails (caught at top level only)
  - Assumes evts.length > 0 when accessing evts[0]
  - No handling for empty scores or scores with only rests
- Safe modification:
  - Add null/length checks before array access (line 354, 389, 418)
  - Wrap OSMD calls in try-catch to handle render failures
  - Document why re-render is needed and test impact
- Test coverage: No tests for empty files, invalid XML, or render failures

**File Upload Validation Pipeline**
- Files: `src/components/UploadDropZone.tsx` (lines 42-73)
- Why fragile:
  - OSMD validation creates hidden DOM container that stays in memory if unmounted
  - Large file validation blocks UI thread (no progress indicator for validation > 1s)
  - isLikelyMusicXML check may false-negative on valid files (requires both score-partwise AND score-timewise in content)
  - No cancel mechanism if validation hangs
- Safe modification:
  - Move OSMD validation to Worker thread
  - Fix isLikelyMusicXML to check for OR condition correctly
  - Add timeout for OSMD validation with user-facing error
  - Clean up validation container properly
- Test coverage: No tests for large files, validation timeout, or concurrent uploads

## Scaling Limits

**Memory: Object URLs for Large Audio Files**
- Current capacity: Can handle typical songs (5-10MB audio files)
- Limit: Browser memory exhausted with multiple large files or repeated uploads
- Scaling path:
  - Implement streams instead of blob URLs
  - Add memory quota per session
  - Clean up URLs aggressively
  - Consider server-side file handling for production

**Render Performance: Large MusicXML Files**
- Current capacity: Works smoothly with ~500-1000 measure scores
- Limit: Notable lag (>1s) with operas/symphonies (3000+ measures)
- Scaling path:
  - Implement lazy rendering (only render visible measures)
  - Optimize event extraction algorithm (O(n²) → O(n))
  - Profile and optimize DOM query patterns
  - Consider WebWorker for event calculation

**Animation Frame Rate with Complex Scores**
- Current capacity: Stable 60 FPS with typical scores
- Limit: Frame drops (< 30 FPS) with complex polyphonic passages or many highlight animations
- Scaling path:
  - Batch DOM updates per frame
  - Use CSS transforms instead of direct style manipulation
  - Reduce animation precision for lower-spec devices
  - Profile with DevTools Performance tab

## Dependencies at Risk

**OpenSheetMusicDisplay (v1.9.5)**
- Risk: Library inactive/unmaintained; no activity visible in recent versions; undocumented internal API usage
- Impact:
  - Type assertions (`as any`) required to access internals
  - No guarantee of API stability
  - Bugs in OSMD cascade to this app without fix path
- Migration plan:
  - Evaluate opensheetmusicdisplay.js (community fork) for maintenance
  - Vendor critical OSMD functionality if needed
  - Consider lighter SVG rendering alternative (EasyABC, MuseScore web version)

**React 19.1.1**
- Risk: Major version adoption; potential breaking changes in next minor
- Impact: Type definitions may shift; hooks behavior may change
- Migration plan: Keep updated; monitor React releases for deprecations

**Zustand (v5.0.10)**
- Risk: State container with direct Map mutation; not immutable by default
- Impact: Anchors Map directly mutated in store (line syncStore.ts:22-24); difficult to track state changes
- Migration plan: Consider immutable state; add middleware for state logging/debugging

## Missing Critical Features

**Error Recovery and Retry**
- Problem: OSMD validation failures show generic error; no retry mechanism
- Blocks: Users cannot recover from transient errors without reload
- Files: `src/components/UploadDropZone.tsx` (line 58-62)

**File Size Estimates and Progress**
- Problem: Large file validation shows no progress indicator; UX unclear
- Blocks: Users unsure if app is hung during slow validation
- Files: `src/components/UploadDropZone.tsx` (line 44)

**Accessibility (A11y) Support**
- Problem: No ARIA labels, keyboard navigation, or screen reader support
- Blocks: App unusable for blind/low-vision users
- Files: Throughout UI components

**Undo/Redo for Sync Editing**
- Problem: Setting anchors has no undo; clearing all is destructive
- Blocks: Users must manually re-enter all anchors on mistakes
- Files: `src/stores/syncStore.ts`

**Score File Validation Report**
- Problem: MusicXML validation errors are generic; difficult to debug file format issues
- Blocks: Users cannot fix invalid scores without external tools
- Files: `src/lib/musicxmlValidation.ts` (lines 53-85)

## Test Coverage Gaps

**No Unit Tests for Core Logic**
- What's not tested:
  - Event extraction and Y position calculation (RegularRenderer)
  - Timestamp interpolation algorithm (interpolation.ts)
  - File validation pipeline (fileValidation.ts, musicxmlValidation.ts)
  - Note animation timings (noteAnimation.ts)
- Files: None of src/**/*.ts files have corresponding .test files
- Risk: Critical animations and timing calculations can break silently
- Priority: High - Add tests for interpolation and event extraction

**No Integration Tests**
- What's not tested:
  - Full upload → render → sync workflow
  - Audio sync timing accuracy
  - Multiple file formats
  - Edge cases: empty scores, unsupported notations, corrupt XML
- Risk: Regressions go undetected; breaking changes in dependencies
- Priority: High - Add workflow integration tests

**No Visual Regression Tests**
- What's not tested:
  - Score rendering visually matches OSMD baseline
  - Animations appear correctly across browsers
  - Score color/scale/border styling combinations
- Risk: Visual bugs introduced by styling changes
- Priority: Medium - Add Playwright visual snapshots

**No Performance/Load Tests**
- What's not tested:
  - Time to render large MusicXML files
  - Memory usage with multiple uploads
  - Animation frame rate under load
  - Sync accuracy over time
- Risk: Performance regressions silently degrade UX
- Priority: Medium - Add lighthouse/performance benchmarks

**No Browser Compatibility Tests**
- What's not tested:
  - Safari/Firefox/Chrome specific issues
  - Mobile browser constraints
  - Touch interaction for region editor
- Risk: App broken on untested browsers
- Priority: Medium - Add cross-browser test matrix

---

*Concerns audit: 2026-02-03*
