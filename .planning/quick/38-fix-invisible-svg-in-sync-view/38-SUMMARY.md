---
phase: quick-38
plan: 1
duration: 1min
completed: 2026-02-11
---
# Quick Task 38: Fix Invisible SVG

`w-fit` collapsed scoreRef to 0 width because Verovio SVGs use percentage width with svgViewBox.
Replaced with explicit pixel width from the measured containerWidth. Parent overflow-auto handles scrolling.
