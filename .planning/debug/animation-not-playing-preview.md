---
status: investigating
trigger: "Animation is not playing in preview mode — no notehead highlight, no scaling. This broke after recent changes to Phase 26 (auto-save & data persistence)."
created: 2026-02-11T00:00:00Z
updated: 2026-02-11T00:00:00Z
symptoms_prefilled: true
---

## Current Focus

hypothesis: Project loading is not restoring animation settings, OR settings are being reset after load
test: Check if project has animation settings persisted, check if store initialization overwrites them
expecting: Either database missing fields or store resets after project load
next_action: Check database schema and auto-save logic for potential reset triggers

## Symptoms

expected: Notehead highlights and scales during preview playback
actual: No notehead highlight, no scaling during preview
errors: None reported
reproduction: Play preview mode
started: After Phase 26 changes (commits around 7d2caec)

## Eliminated

## Evidence

- timestamp: 2026-02-11T00:01:00Z
  checked: App.tsx props passed to RegularRenderer
  found: Props are passed correctly - activeNoteheadColor, activeNoteheadScale, activeNoteheadAnimationEntryMs, activeNoteheadAnimationHoldMs, activeNoteheadAnimationExitMs, colorFullNote all present (lines 852-857)
  implication: Prop passing from App.tsx looks correct, issue must be in RegularRenderer itself or how it uses these props

- timestamp: 2026-02-11T00:01:30Z
  checked: RegularRenderer Props interface
  found: Interface expects activeNoteheadAnimationEntryMs, activeNoteheadAnimationHoldMs, activeNoteheadAnimationExitMs
  implication: Props interface matches what App.tsx is sending

- timestamp: 2026-02-11T00:03:00Z
  checked: Old default value before migration (commit d914b37~1)
  found: useState default was "#000000" (enabled), DEFAULT_SETTINGS is also "#000000"
  implication: Defaults are consistent, but need to verify project data loading

- timestamp: 2026-02-11T00:03:30Z
  checked: Nullish coalescing behavior in loadSettings
  found: `null ?? '#000000'` correctly returns '#000000'
  implication: Logic should work correctly, suggesting issue elsewhere

- timestamp: 2026-02-11T00:05:00Z
  checked: animateNoteheads function implementation
  found: Scaling animation (line 68) is unconditional - always runs. Color animation (line 74) only runs if color is truthy.
  implication: If BOTH scaling and color aren't working, animateNoteheads isn't being called at all. Not a prop value issue.

## Resolution

root_cause:
fix:
verification:
files_changed: []
