# Quick Task 15: Fix Export ENOENT on musicXml.xml

## Root Cause

`buildExportConfig()` in `pageSetup.ts` hardcoded `join(job.tempDir, 'musicXml.xml')`.
The upload route saves files as `${fieldname}${extname(filename)}`, so when a user
uploads a `.musicxml` file, it gets saved as `musicXml.musicxml` — but the reader
looked for `musicXml.xml`, causing ENOENT.

## Fix

**File:** `export-service/src/browser/pageSetup.ts`

Changed `buildExportConfig()` to use `readdir()` + `startsWith('musicXml')` to find
the MusicXML file regardless of extension (`.xml` or `.musicxml`). Same pattern already
used by `buildBgInfo()` for background images.

## Commit
`7b5fbbb`
