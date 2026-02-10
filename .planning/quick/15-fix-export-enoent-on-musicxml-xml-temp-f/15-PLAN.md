---
phase: quick-15
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - export-service/src/browser/pageSetup.ts
autonomous: true
---

# Fix export ENOENT on musicXml.xml temp file

## Root Cause

`buildExportConfig()` in `pageSetup.ts` hardcodes `join(job.tempDir, 'musicXml.xml')`.
The upload route (`export.ts:67`) saves files as `${fieldname}${ext}` where `ext = extname(part.filename)`.
If the user uploads a `.musicxml` file, it gets saved as `musicXml.musicxml` — but the reader looks for `musicXml.xml`.

## Fix

In `buildExportConfig()`, use `readdir()` to find the file starting with `musicXml` (same pattern as `buildBgInfo` already uses for `bgImage`). This handles both `.xml` and `.musicxml` extensions.
