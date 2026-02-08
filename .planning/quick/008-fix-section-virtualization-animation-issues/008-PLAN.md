---
phase: quick
plan: 008
type: fix
files_modified:
  - src/renderers/SingleLineRenderer.tsx
---

# Quick Task 008: Fix Section Virtualization Animation Issues

## Problem
- Camera snaps back to beginning during playback
- Animations stop when sections change

## Tasks

1. Remove camera reset from Verovio section effect (was resetting on every re-render)
2. Compute visible sections directly from camera position in animation loop (avoid React state lag)
3. Ensure reset() properly resets section state
