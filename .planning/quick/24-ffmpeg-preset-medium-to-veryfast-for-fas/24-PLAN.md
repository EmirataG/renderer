# Quick Task 24: FFmpeg preset medium to veryfast

## Goal
Switch FFmpeg H.264 encoding preset from `medium` to `veryfast` for 3-5x faster export encoding with negligible quality impact on score animation content.

## Tasks

### Task 1: Change preset in encodeVideo.ts
- **File:** `export-service/src/encoding/encodeVideo.ts`
- **Change:** Line 25: `'-preset', 'medium'` → `'-preset', 'veryfast'`
- **Rationale:** Score animation is mostly static SVG with slow camera scroll — fast presets produce ~15-30% larger files but encode 3-5x faster. At CRF 18, visual quality is identical.
