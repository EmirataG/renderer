# Quick Task 21: Memo RegularRenderer to Prevent Re-renders from Export Progress

## Problem

During video export, the WebSocket progress updates caused `exportState` changes in App.tsx,
which re-rendered the entire component tree including RegularRenderer. The `<style
dangerouslySetInnerHTML>` tag replaces DOM content on every render even when the HTML string
is identical. This killed in-flight CSS transitions on noteheads, breaking playback animations
during export.

## Fix

**File:** `src/renderers/RegularRenderer.tsx`

Wrapped RegularRenderer with `React.memo`. All props passed from App.tsx are stable references
(primitives, useState values, zustand selectors), so memo's shallow comparison correctly
prevents re-renders when only unrelated state like `exportState` changes.

## Commit
`de925d5`
