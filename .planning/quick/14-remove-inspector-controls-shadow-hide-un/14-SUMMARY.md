# Quick Task 14: Remove Inspector Controls + Enlarge Sync Icons

## Changes

### Inspector Cleanup (App.tsx)
- Removed **Shadow** slider from Score Appearance section
- Removed **Hide Unplayed Notes** checkbox
- Removed **Smooth Reveal** checkbox (was nested under Hide Unplayed Notes)
- Removed **Audio Preview** section (heading, filename, visible audio player)
- Kept hidden `<audio>` element with `audioRef` — still needed for `audioDuration` in export settings

### Sync View Icons (SyncEditor.tsx)
- Play/pause button: `w-10 h-10` → `w-12 h-12`
- Play/pause SVG icons: `w-5 h-5` → `w-7 h-7`

## Commit
`28148e2`
