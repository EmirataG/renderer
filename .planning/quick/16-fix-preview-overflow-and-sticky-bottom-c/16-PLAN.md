---
phase: quick-16
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/App.tsx
autonomous: true
---

# Fix preview overflow and sticky bottom control buttons

## Problem

When the background image is tall, the preview area overflows `h-screen`, making the
entire page scrollable. Scrolling down reveals a black void below the inspector sidebar.
Also, the Export section is buried deep in the inspector and requires scrolling to reach.

## Fix

1. **Preview overflow**: Add `overflow-hidden` to the flex-1 content wrapper at line 675
   so the renderer is clipped to the available viewport height.

2. **Sticky bottom export bar**: Extract the Export section from the scrollable inspector
   body and place it as a `flex-shrink-0` bottom bar on the aside, always visible.
   The aside layout becomes: header (flex-shrink-0) | scrollable content (flex-1 overflow-auto) | export bar (flex-shrink-0).
