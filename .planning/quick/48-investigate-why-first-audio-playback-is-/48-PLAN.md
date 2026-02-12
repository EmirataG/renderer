---
phase: quick-48
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/api/projects/[id]/audio/route.ts
  - src/renderers/RegularRenderer.tsx
  - src/renderers/SingleLineRenderer.tsx
  - src/App.tsx
autonomous: true
must_haves:
  truths:
    - "First audio playback starts within 1-2 seconds, not 5-10+"
    - "Audio seeking works correctly with range requests"
    - "Audio elements only download full content when play is triggered"
  artifacts:
    - path: "src/app/api/projects/[id]/audio/route.ts"
      provides: "Streaming audio proxy with true range request support"
      contains: "createReadStream"
    - path: "src/renderers/RegularRenderer.tsx"
      provides: "Audio with metadata-only preload"
      contains: "preload"
    - path: "src/renderers/SingleLineRenderer.tsx"
      provides: "Audio with metadata-only preload"
      contains: "preload"
    - path: "src/App.tsx"
      provides: "Hidden audio element with metadata-only preload"
      contains: "preload"
  key_links:
    - from: "src/renderers/RegularRenderer.tsx"
      to: "src/app/api/projects/[id]/audio/route.ts"
      via: "Audio element HTTP requests"
      pattern: "preload.*metadata"
---

<objective>
Fix slow first audio playback by streaming audio from Firebase Storage instead of downloading entire file into memory, and setting preload="metadata" on all audio elements to defer full download until play.

Purpose: First audio play after opening a project takes 5-10+ seconds because the API route downloads the entire file (up to 50MB) from Firebase before responding, and audio elements eagerly download the full file on mount.
Output: Responsive audio playback with true streaming range request support.
</objective>

<execution_context>
@/Users/emirahmed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/emirahmed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/app/api/projects/[id]/audio/route.ts
@src/renderers/RegularRenderer.tsx
@src/renderers/SingleLineRenderer.tsx
@src/App.tsx
@src/components/SyncEditor.tsx (line 511 — reference for preload="metadata" pattern)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Stream audio from Firebase Storage instead of downloading entire file</name>
  <files>src/app/api/projects/[id]/audio/route.ts</files>
  <action>
Replace the `file.download()` approach with `file.createReadStream()` for true streaming.

**For range requests (HTTP 206):**
- Parse the Range header as currently done
- Use `file.createReadStream({ start, end })` to stream only the requested byte range from Firebase Storage
- Wrap the Node.js readable stream into a Web ReadableStream:
  ```
  const nodeStream = file.createReadStream({ start, end });
  const webStream = new ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk) => controller.enqueue(new Uint8Array(chunk)));
      nodeStream.on('end', () => controller.close());
      nodeStream.on('error', (err) => controller.error(err));
    }
  });
  ```
- Return `new Response(webStream, { status: 206, headers: { Content-Type, Content-Range, Content-Length, Accept-Ranges } })`

**For full requests (no Range header):**
- Use `file.createReadStream()` with no options to stream the entire file
- Wrap into Web ReadableStream using the same pattern
- Return `new Response(webStream, { headers: { Content-Type, Content-Length, Accept-Ranges } })`

**Remove** the `const [contents] = await file.download();` line entirely. The file metadata fetch (`file.getMetadata()`) stays since it's needed for Content-Length and Content-Type.

**Add error handling:** Wrap the stream creation in try/catch. If createReadStream fails, return 500.
  </action>
  <verify>
Run `npm run build` to confirm no TypeScript errors. Manually test in browser: open a project with audio, check Network tab — audio requests should start receiving data immediately (not wait for full download). Range requests (seeking) should return 206 with only the requested bytes.
  </verify>
  <done>Audio API route streams directly from Firebase Storage. No full-file download into memory. Range requests only fetch the requested byte range.</done>
</task>

<task type="auto">
  <name>Task 2: Set preload="metadata" on all audio elements</name>
  <files>src/renderers/RegularRenderer.tsx, src/renderers/SingleLineRenderer.tsx, src/App.tsx</files>
  <action>
Three changes, following the pattern already used in SyncEditor.tsx line 511:

1. **RegularRenderer.tsx** (line ~177): After `const audio = new Audio(audioUrl);`, add:
   ```
   audio.preload = "metadata";
   ```

2. **SingleLineRenderer.tsx** (line ~127): After `const audio = new Audio(audioUrl);`, add:
   ```
   audio.preload = "metadata";
   ```

3. **App.tsx** (line ~592): Change:
   ```
   <audio ref={audioRef} src={audioFile.url} className="hidden" />
   ```
   to:
   ```
   <audio ref={audioRef} src={audioFile.url} preload="metadata" className="hidden" />
   ```

This ensures browsers only fetch audio metadata (duration, format) on mount. Full audio data downloads only when the user clicks play. The hidden audio element in App.tsx only needs duration for export — metadata is sufficient.
  </action>
  <verify>
Run `npm run build` to confirm no TypeScript errors. In browser Network tab, opening a project should show a small initial audio request (~50-200KB for metadata) instead of the full file. Full download should only begin when play is clicked.
  </verify>
  <done>All audio elements use preload="metadata". No eager full-file downloads on page load. Duration detection still works from metadata.</done>
</task>

</tasks>

<verification>
1. `npm run build` passes with no errors
2. Open a project with audio in the browser
3. Network tab shows the initial audio request completes quickly (metadata only, not full file)
4. Click play — audio starts promptly, streams progressively
5. Seek to a different position — range request returns 206 with only the requested bytes
6. Duration displays correctly in the UI (from metadata)
</verification>

<success_criteria>
- Audio API route uses createReadStream instead of file.download()
- Range requests stream only the requested byte range from Firebase Storage
- All 4 audio elements use preload="metadata" (RegularRenderer, SingleLineRenderer, App.tsx, plus existing SyncEditor)
- First playback is responsive (1-2 seconds, not 5-10+)
- No memory spike from loading entire audio files into Node.js memory
</success_criteria>

<output>
After completion, create `.planning/quick/48-investigate-why-first-audio-playback-is-/48-SUMMARY.md`
</output>
