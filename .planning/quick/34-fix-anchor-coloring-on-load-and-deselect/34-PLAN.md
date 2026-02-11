---
phase: "34"
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/SyncEditor.tsx
autonomous: true
---

<objective>
Fix two related issues:
1. Anchor coloring not applied on initial load and lost after SVG DOM replacement
2. Window resizing causes Verovio to re-render (replacing SVG DOM and wiping inline styles)

Root causes:
- ResizeObserver continuously fed new widths → Verovio re-rendered → SVG DOM replaced → inline styles (green anchors) wiped
- Anchor effect didn't depend on svgPages, so it didn't re-fire after SVG DOM updates

Fixes:
1. ResizeObserver: disconnect after first measurement (measure-once pattern)
2. Anchor effect: add svgPages to deps so it fires after every SVG DOM creation
</objective>
