---
phase: quick-49
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/api/projects/[id]/audio/route.ts
autonomous: true
must_haves:
  truths:
    - "Note highlighting works during audio playback (notes light up in sync with music)"
    - "Audio streaming still works (no full buffering, range requests supported)"
    - "No resource leaks when browser cancels stream (preload=metadata, navigation)"
  artifacts:
    - path: "src/app/api/projects/[id]/audio/route.ts"
      provides: "Streaming audio endpoint with proper Node-to-Web stream conversion"
      contains: "Readable.toWeb"
  key_links:
    - from: "src/app/api/projects/[id]/audio/route.ts"
      to: "browser HTMLAudioElement"
      via: "Web ReadableStream with correct backpressure and cancellation"
      pattern: "Readable\\.toWeb"
---

<objective>
Fix note highlighting regression caused by quick task 48's manual ReadableStream wrapping.

Purpose: Quick task 48 introduced audio streaming via manual `new ReadableStream({ start(controller) { ... } })` wrapping of Node.js streams. This manual approach lacks cancel/backpressure handling, which causes the browser's audio element to receive malformed or incomplete stream data, breaking the time-update events that drive note highlighting. Replace with `Readable.toWeb()` which handles all stream lifecycle concerns correctly.

Output: Fixed audio streaming endpoint that preserves both streaming performance and note highlighting.
</objective>

<execution_context>
@/Users/emirahmed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/emirahmed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/app/api/projects/[id]/audio/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace manual ReadableStream wrapping with Readable.toWeb()</name>
  <files>src/app/api/projects/[id]/audio/route.ts</files>
  <action>
Replace the manual `new ReadableStream` wrapping in BOTH the range request path (line 55-61) and the full request path (line 81-86) with Node.js built-in `Readable.toWeb()`.

1. Add import at top of file: `import { Readable } from 'stream';`

2. For the range request section (inside the `if (rangeHeader)` block), replace:
```typescript
const webStream = new ReadableStream({
  start(controller) {
    nodeStream.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
    nodeStream.on('end', () => controller.close());
    nodeStream.on('error', (err: Error) => controller.error(err));
  },
});
```
With:
```typescript
const webStream = Readable.toWeb(nodeStream) as ReadableStream;
```

3. For the full request section (the else/default path), apply the exact same replacement.

4. Keep everything else unchanged: auth, metadata lookup, range parsing, response headers, error handling.

`Readable.toWeb()` is available in Node.js 17+ (this project uses Node.js 22). It properly handles backpressure (pauses Node stream when browser reads slowly), cancellation (destroys Node stream when browser aborts), and error propagation -- all of which the manual version was missing.
  </action>
  <verify>
    - `npx tsc --noEmit` passes (type-check)
    - `npm run build` succeeds
    - Manual test: open a project with audio, play it, verify note highlighting works during playback
    - Manual test: seek to different positions, verify highlighting resumes correctly
  </verify>
  <done>
    Audio route uses `Readable.toWeb()` for both range and full requests. Note highlighting works during playback. Audio streaming and seeking still function correctly.
  </done>
</task>

</tasks>

<verification>
- Audio endpoint returns streaming responses (not buffered)
- Range requests return 206 with correct Content-Range headers
- Full requests return 200 with Content-Length header
- Note highlighting activates during playback
- No console errors related to stream handling
</verification>

<success_criteria>
Note highlighting works during audio playback (regression fixed). Audio streaming performance preserved. No resource leaks on stream cancellation.
</success_criteria>

<output>
After completion, create `.planning/quick/49-fix-note-highlighting-regression-after-a/49-SUMMARY.md`
</output>
