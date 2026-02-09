# Phase 18: FFmpeg Encoding & Audio Mux - Research

**Researched:** 2026-02-09
**Domain:** FFmpeg process spawning from Node.js, H.264 encoding, audio muxing, stream backpressure
**Confidence:** HIGH

## Summary

Phase 18 transforms the PNG frame buffers produced by Phase 17's async generator into a final H.264 MP4 with synced audio. The implementation uses Node.js `child_process.spawn()` to launch FFmpeg directly -- no wrapper library is needed or recommended since `fluent-ffmpeg` was archived in May 2025 and no maintained alternative exists. FFmpeg reads PNG frames piped to stdin via `-f image2pipe -c:v png`, encodes to H.264 with `-c:v libx264 -pix_fmt yuv420p`, and writes to a file in the job's temp directory.

The architecture uses a **two-step approach**: Step 1 encodes piped PNG frames to a silent H.264 MP4 video file with `-movflags +faststart`. Step 2 muxes the audio file into the video using stream copy (`-c:v copy -c:a aac`). This two-step approach is necessary because `-movflags +faststart` requires a seekable output (file, not stdout), and because stdin (`pipe:0`) can only carry one stream -- using a single FFmpeg command with both `-i pipe:0` (PNG frames) and `-i audio.mp3` (file) is technically possible but the two-step approach is simpler, more debuggable, and decouples the encode and mux concerns.

The critical integration change is refactoring `renderJob` in `jobManager.ts`. Instead of collecting all frame buffers in a `Uint8Array[]` array (the current Phase 17 approach, which consumes 90-450MB for a typical video), the render loop will pipe each frame buffer directly to FFmpeg's stdin as it's captured. This requires drain-aware writes: check the return value of `ffmpeg.stdin.write()`, and if it returns `false`, await the `'drain'` event before writing the next frame. This keeps memory usage bounded to a few frames at most.

**Primary recommendation:** Use `child_process.spawn('ffmpeg', [...])` directly with no wrapper. Two-step encode: (1) pipe PNG frames to stdin, encode H.264 to temp file, (2) mux audio into final MP4. Drain-aware writes for backpressure. `events.once()` for async drain awaiting.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js `child_process` | built-in | Spawn FFmpeg process | Standard Node.js API, no external dependency needed |
| Node.js `events.once` | built-in | Async/await drain event handling | Promise-based event waiting, avoids callback soup |
| Node.js `stream/promises` | built-in | Pipeline utilities | Promise-based stream piping with auto backpressure |
| FFmpeg (system binary) | 8.x (local), any 5+ | Video encoding and audio muxing | Industry standard, supports all required codecs and flags |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js `fs/promises` | built-in | Read tempDir for audio file, write output | Finding audio file, file existence checks |
| Node.js `path` | built-in | Path construction for temp files | Building file paths in tempDir |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct `spawn()` | fluent-ffmpeg | Archived May 2025, unmaintained, adds unnecessary abstraction over spawn args |
| Direct `spawn()` | ffmpeg-stream (npm) | Thin wrapper but low download count (~300/week), not worth the dependency |
| Two-step encode+mux | Single FFmpeg command | Single command works (`-i pipe:0 -i audio.mp3`) but harder to debug, faststart requires file output anyway, and separating concerns makes error handling cleaner |
| `-c:a aac` (always transcode) | `-c:a copy` (stream copy when input is AAC) | AAC is universally compatible with MP4; always transcoding avoids conditional codec detection logic with minimal speed cost |

**Installation:**
```bash
# No npm packages to install. FFmpeg must be available on PATH.
# For Docker (Phase 20): apt-get install -y ffmpeg
# Local dev: brew install ffmpeg (already installed: v8.0.1)
```

## Architecture Patterns

### Recommended Project Structure
```
export-service/src/
  encoding/
    encodeVideo.ts      # Step 1: Pipe PNG frames to FFmpeg stdin, produce silent H.264 MP4
    muxAudio.ts         # Step 2: Mux audio file into video MP4, produce final output
    ffmpegArgs.ts       # FFmpeg argument builders (pure functions, easy to test)
  browser/
    captureFrames.ts    # Existing: async generator yielding PNG buffers
    pageSetup.ts        # Existing: page config injection + readiness
    browserPool.ts      # Existing: browser pool
  jobs/
    jobManager.ts       # Refactored: renderJob pipes to encoder, then muxes audio
    types.ts            # Updated: add outputPath to ExportJob
  ...existing files...
```

### Pattern 1: Spawn FFmpeg with PNG Stdin Input
**What:** Spawn FFmpeg reading PNG frames from stdin, encoding H.264 to a file.
**When to use:** Step 1 of the encode pipeline -- converting captured frames to video.
**Example:**
```typescript
// Source: FFmpeg official docs + Node.js child_process docs
import { spawn } from 'node:child_process';

const ffmpeg = spawn('ffmpeg', [
  // Input: PNG frames piped to stdin
  '-f', 'image2pipe',
  '-c:v', 'png',
  '-framerate', String(fps),
  '-i', 'pipe:0',

  // Output: H.264 video
  '-c:v', 'libx264',
  '-pix_fmt', 'yuv420p',
  '-preset', 'medium',
  '-crf', '18',
  '-movflags', '+faststart',
  '-an',  // No audio in step 1
  outputVideoPath,
], {
  stdio: ['pipe', 'ignore', 'pipe'],  // stdin=pipe, stdout=ignore, stderr=pipe
});
```

### Pattern 2: Drain-Aware Frame Writing
**What:** Write PNG buffers to FFmpeg stdin respecting backpressure. When `write()` returns `false`, await the `'drain'` event before writing the next frame.
**When to use:** Every frame write in the capture loop.
**Example:**
```typescript
// Source: Node.js Stream docs (writable.write return value + drain event)
import { once } from 'node:events';

async function writeFrame(
  stdin: NodeJS.WritableStream,
  buffer: Uint8Array,
): Promise<void> {
  const canContinue = stdin.write(buffer);
  if (!canContinue) {
    await once(stdin, 'drain');
  }
}

// Usage in capture loop:
for await (const { buffer } of captureFrames(page, totalFrames, fps)) {
  await writeFrame(ffmpeg.stdin, buffer);
}
ffmpeg.stdin.end();  // Signal EOF to FFmpeg
```

### Pattern 3: Audio Muxing as Second Step
**What:** After video encoding completes, spawn a second FFmpeg to mux the audio file into the video.
**When to use:** Step 2 -- after the silent video file is produced.
**Example:**
```typescript
// Source: FFmpeg muxing docs
import { spawn } from 'node:child_process';

const ffmpeg = spawn('ffmpeg', [
  '-i', silentVideoPath,       // Input 1: silent H.264 video
  '-i', audioFilePath,         // Input 2: original audio file
  '-c:v', 'copy',              // Copy video stream (no re-encode)
  '-c:a', 'aac',               // Transcode audio to AAC (MP4-compatible)
  '-b:a', '192k',              // Audio bitrate
  '-shortest',                 // Trim to shorter stream duration
  '-movflags', '+faststart',   // Web-optimized MP4
  '-y',                        // Overwrite output
  finalOutputPath,
], {
  stdio: ['ignore', 'ignore', 'pipe'],
});
```

### Pattern 4: FFmpeg Process Lifecycle Management
**What:** Wrap FFmpeg spawn in a Promise that resolves on exit code 0, rejects on non-zero exit with stderr output for debugging.
**When to use:** Both encode and mux steps.
**Example:**
```typescript
// Source: Node.js child_process docs
function spawnFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, {
      stdio: ['pipe', 'ignore', 'pipe'],
    });

    let stderr = '';
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err) => {
      reject(new Error(`FFmpeg failed to start: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`));
      }
    });

    // Return proc for stdin access if needed
  });
}
```

### Pattern 5: Finding the Audio File in TempDir
**What:** The audio file is stored in tempDir with fieldname "audio" plus MIME-derived extension (e.g., `audio.mp3`, `audio.wav`, `audio.ogg`, `audio.m4a`). Find it by listing the directory.
**When to use:** Before muxing step, to locate the uploaded audio file.
**Example:**
```typescript
// Source: Node.js fs docs
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

async function findAudioFile(tempDir: string): Promise<string> {
  const files = await readdir(tempDir);
  const audioFile = files.find((f) => f.startsWith('audio.'));
  if (!audioFile) {
    throw new Error('Audio file not found in temp directory');
  }
  return join(tempDir, audioFile);
}
```

### Anti-Patterns to Avoid
- **Collecting all frame buffers in memory before encoding:** This is what Phase 17 does temporarily (`(job as any).frameBuffers`). Phase 18 MUST replace this with direct piping to FFmpeg stdin. Holding 900+ frames (90-450MB) causes OOM.
- **Using `fluent-ffmpeg`:** Archived May 2025. No maintained FFmpeg wrapper library for Node.js. Use `spawn()` directly.
- **Piping FFmpeg output to stdout with faststart:** `-movflags +faststart` requires seeking backward in the output file to rewrite the moov atom. This is impossible with pipes/stdout. Always write to a file.
- **Ignoring FFmpeg stderr:** FFmpeg writes ALL diagnostic output to stderr, including progress info and error details. Always capture stderr for debugging.
- **Not calling `stdin.end()` after last frame:** FFmpeg hangs indefinitely waiting for more input if stdin is not explicitly ended. This is a guaranteed hang bug.
- **Ignoring `write()` return value:** Writing without checking for `false` causes unbounded memory growth in Node.js as buffers queue in the writable stream.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Video encoding | Custom pixel manipulation | FFmpeg `libx264` via spawn | H.264 encoding is incredibly complex; FFmpeg handles all the edge cases |
| Audio transcoding | Manual audio decoding/encoding | FFmpeg `-c:a aac` | Audio codec handling with sample rate conversion, channel mapping |
| MP4 container formatting | Custom moov/mdat atom writer | FFmpeg MP4 muxer | MP4 container format has dozens of atom types, timing tables, sample tables |
| Stream backpressure | Custom queue with manual buffer management | Node.js `write()` return + `drain` event | Built-in Node.js stream protocol handles all the edge cases |
| FFmpeg argument construction | String concatenation | Array of arguments to `spawn()` | Avoids shell injection, proper escaping, works cross-platform |

**Key insight:** FFmpeg is the encoding engine. The Node.js code's only job is orchestrating process lifecycle and piping data. Keep the Node.js layer thin -- spawn, pipe frames, wait for exit, done.

## Common Pitfalls

### Pitfall 1: FFmpeg Hangs Because stdin.end() Was Not Called
**What goes wrong:** FFmpeg process never exits, job hangs forever, resources leak.
**Why it happens:** FFmpeg reads stdin until EOF. If `stdin.end()` is never called (e.g., error thrown before reaching it), FFmpeg waits forever.
**How to avoid:** Always call `stdin.end()` in a `finally` block after the frame capture loop, or on error. Also set a timeout on the FFmpeg process as a safety net.
**Warning signs:** Job status stays at "encoding" forever. FFmpeg process visible in `ps` but consuming 0% CPU.

### Pitfall 2: Memory Bloat from Ignoring Backpressure
**What goes wrong:** Node.js heap grows to gigabytes as hundreds of PNG buffers queue in the writable stream's internal buffer.
**Why it happens:** `stdin.write(buffer)` is called in a tight loop without checking the return value. Each PNG is 100-500KB, and they accumulate faster than FFmpeg can consume them.
**How to avoid:** Check `stdin.write()` return value. If `false`, await `once(stdin, 'drain')` before writing the next frame. This bounds memory to ~`highWaterMark` (default 16KB) plus the current frame.
**Warning signs:** Node.js heap grows linearly during encoding. Process eventually OOMs or triggers excessive GC pauses.

### Pitfall 3: faststart Flag Ignored When Piping to stdout
**What goes wrong:** Output MP4 has moov atom at the end, not the beginning. Video doesn't play until fully downloaded.
**Why it happens:** `-movflags +faststart` works by writing the file, then seeking back to move the moov atom to the front. Pipes don't support seeking.
**How to avoid:** Always write FFmpeg output to a file (not `pipe:1` / stdout) when using `-movflags +faststart`.
**Warning signs:** Video doesn't start playing in browser until fully loaded. Tools like `mp4info` show moov atom after mdat.

### Pitfall 4: Audio/Video Duration Mismatch
**What goes wrong:** Video is longer or shorter than audio, causing desync. Video may have black frames at the end or audio cuts off early.
**Why it happens:** Video duration is `totalFrames / fps`, derived from animation duration. Audio duration is the original file's duration. These should match (both derived from `audioDuration`), but floating-point rounding can cause slight differences.
**How to avoid:** Use `-shortest` flag when muxing to trim the longer stream. The video frame count is `Math.ceil(duration * fps)`, so video will be at most 1 frame longer than audio. `-shortest` handles this.
**Warning signs:** Final MP4 has a brief silence gap at the end, or last fraction of audio is cut.

### Pitfall 5: FFmpeg Not Found on PATH
**What goes wrong:** `spawn('ffmpeg', ...)` throws ENOENT error.
**Why it happens:** FFmpeg is not installed or not on PATH in the deployment environment (Docker, CI).
**How to avoid:** Phase 20 (Docker) will ensure FFmpeg is installed in the image. For local dev, verify with `which ffmpeg`. Add an early check at server startup or before first encode.
**Warning signs:** `Error: spawn ffmpeg ENOENT` in logs.

### Pitfall 6: Not Cleaning Up Intermediate Files
**What goes wrong:** Temp directory accumulates silent video files, growing disk usage.
**Why it happens:** The two-step encode produces an intermediate `video-silent.mp4` that is no longer needed after muxing.
**How to avoid:** Delete the intermediate silent video file after the mux step succeeds. The final output MP4 and the audio file are the only files needed. Existing `cleanupTempDir` handles full cleanup when the job is done.
**Warning signs:** Temp directories are 2x expected size (both silent and final MP4 present).

### Pitfall 7: Unhandled FFmpeg Process Error Event
**What goes wrong:** Node.js emits an unhandled error event, potentially crashing the server.
**Why it happens:** The `spawn()` process emits an 'error' event (e.g., ENOENT) that has no listener.
**How to avoid:** Always attach an `'error'` listener to the spawned process. The Promise wrapper pattern in Pattern 4 handles this.
**Warning signs:** `Error [ERR_UNHANDLED_ERROR]` in logs.

## Code Examples

Verified patterns from official sources:

### Complete Encode Pipeline: Frames to Silent Video
```typescript
// Source: Node.js child_process docs, FFmpeg image2pipe docs
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';

interface EncodeResult {
  process: ChildProcess;
  writeFrame: (buffer: Uint8Array) => Promise<void>;
  finish: () => Promise<void>;
}

/**
 * Start FFmpeg process that reads PNG frames from stdin and encodes
 * to a silent H.264 MP4 file. Returns write/finish helpers.
 */
function startVideoEncode(
  outputPath: string,
  fps: number,
  width: number,
  height: number,
): EncodeResult {
  const proc = spawn('ffmpeg', [
    '-y',
    '-f', 'image2pipe',
    '-c:v', 'png',
    '-framerate', String(fps),
    '-i', 'pipe:0',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'medium',
    '-crf', '18',
    '-movflags', '+faststart',
    '-an',
    outputPath,
  ], {
    stdio: ['pipe', 'ignore', 'pipe'],
  });

  let stderr = '';
  proc.stderr!.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const writeFrame = async (buffer: Uint8Array): Promise<void> => {
    const canContinue = proc.stdin!.write(buffer);
    if (!canContinue) {
      await once(proc.stdin!, 'drain');
    }
  };

  const finish = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg encode failed (code ${code}): ${stderr.slice(-500)}`));
      });
      proc.on('error', (err) => {
        reject(new Error(`FFmpeg failed to start: ${err.message}`));
      });
      proc.stdin!.end();
    });
  };

  return { process: proc, writeFrame, finish };
}
```

### Complete Mux Pipeline: Audio into Video
```typescript
// Source: FFmpeg muxing docs, Node.js child_process docs
import { spawn } from 'node:child_process';

/**
 * Mux audio file into silent video file, producing final output MP4.
 * Uses stream copy for video (no re-encode), transcodes audio to AAC.
 */
function muxAudio(
  silentVideoPath: string,
  audioPath: string,
  outputPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-y',
      '-i', silentVideoPath,
      '-i', audioPath,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-shortest',
      '-movflags', '+faststart',
      outputPath,
    ], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';
    proc.stderr!.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err) => {
      reject(new Error(`FFmpeg mux failed to start: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg mux failed (code ${code}): ${stderr.slice(-500)}`));
    });
  });
}
```

### Drain-Aware Write Helper
```typescript
// Source: Node.js Stream docs, events.once docs
import { once } from 'node:events';

/**
 * Write a buffer to a writable stream, respecting backpressure.
 * If the internal buffer is full, waits for 'drain' before returning.
 */
async function drainAwareWrite(
  stream: NodeJS.WritableStream,
  data: Uint8Array,
): Promise<void> {
  const ok = stream.write(data);
  if (!ok) {
    await once(stream, 'drain');
  }
}
```

### Integration with renderJob (Refactored Flow)
```typescript
// Pseudocode showing the refactored renderJob pipeline
async renderJob(jobId: string): Promise<void> {
  // ... acquire browser, setup page (existing Phase 17 code) ...

  this.updateStatus(jobId, 'encoding');

  // Step 1: Start FFmpeg encode process
  const silentVideoPath = join(job.tempDir, 'video-silent.mp4');
  const encoder = startVideoEncode(silentVideoPath, fps, 1920, 1080);

  // Pipe captured frames directly to FFmpeg stdin (no memory accumulation)
  for await (const { buffer } of captureFrames(page, totalFrames, fps)) {
    await encoder.writeFrame(buffer);
  }

  // Signal end of frames, wait for FFmpeg to finish encoding
  await encoder.finish();

  // Step 2: Mux audio into the silent video
  const audioPath = await findAudioFile(job.tempDir);
  const outputPath = join(job.tempDir, 'output.mp4');
  await muxAudio(silentVideoPath, audioPath, outputPath);

  // Clean up intermediate file
  await unlink(silentVideoPath);

  // Store output path on job for download endpoint (Phase 19)
  job.outputPath = outputPath;

  this.updateStatus(jobId, 'complete');
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| fluent-ffmpeg wrapper | Direct `child_process.spawn()` | fluent-ffmpeg archived May 2025 | No maintained FFmpeg wrapper for Node.js; use spawn directly |
| Callback-based drain handling | `await once(stream, 'drain')` | Node.js 11.13+ (events.once) | Clean async/await backpressure without callback pyramids |
| `stream.pipeline()` callback | `stream/promises.pipeline()` | Node.js 15+ | Promise-based pipeline with auto cleanup |
| Manual file globbing | `fs.readdir()` + `.find()` | Node.js 22 has `fs.glob()` but readdir is simpler for single-directory search | Either works; readdir + find is fewer lines for this use case |
| `page.screenshot()` returns Buffer | Returns `Uint8Array` | Puppeteer v20+ | `Uint8Array` works directly with `stream.write()` -- no conversion needed |

**Deprecated/outdated:**
- `fluent-ffmpeg`: Archived May 2025, repo read-only. Do not use.
- `ffmpeg.wasm`: WASM build of FFmpeg, much slower than native binary. Not suitable for server-side encoding.

## Open Questions

1. **CRF value selection: 18 vs 23**
   - What we know: CRF 18 is "visually lossless" and produces ~2x the bitrate of CRF 23 (default). For music score animation with text and sharp edges, lower CRF preserves detail better.
   - What's unclear: Whether the file size increase from CRF 18 matters for this use case (scores are relatively simple visually).
   - Recommendation: Use CRF 18 for highest quality. File sizes will still be reasonable for 30-60s music videos. Can be made configurable later.

2. **FFmpeg `-preset` selection: medium vs fast**
   - What we know: `medium` is the default preset. `fast` reduces encoding time by ~25-30% with slightly larger file size. `slow` reduces file size but takes 2x longer.
   - What's unclear: Whether encoding speed is a bottleneck compared to frame capture time (each frame requires a full page screenshot).
   - Recommendation: Use `medium` (default) initially. Frame capture is likely the bottleneck (50-200ms per frame vs. ~5ms per frame for encoding). Profile before optimizing.

3. **Audio codec handling: always transcode vs. conditional copy**
   - What we know: Supported upload formats are MP3, WAV, OGG, M4A. MP4 containers support AAC and MP3 audio natively. WAV and OGG require transcoding.
   - What's unclear: Whether the extra complexity of detecting the input codec and conditionally using `-c:a copy` for MP3/AAC is worth the speed improvement.
   - Recommendation: Always transcode to AAC (`-c:a aac -b:a 192k`). Transcoding audio is fast (~1-2 seconds even for long files). Simplicity beats marginal speed gain.

4. **Error recovery: partial FFmpeg output**
   - What we know: If FFmpeg crashes mid-encode, the output file may be incomplete or corrupted.
   - What's unclear: Whether to attempt recovery or just fail the job and clean up.
   - Recommendation: Fail the job, clean up temp files, report error with FFmpeg's stderr output. No partial recovery.

## Sources

### Primary (HIGH confidence)
- [Node.js Stream docs](https://nodejs.org/api/stream.html) - writable.write() return value, drain event, pipeline, backpressure
- [Node.js child_process docs](https://nodejs.org/api/child_process.html) - spawn(), stdio configuration, process events
- [Node.js Backpressure Guide](https://nodejs.org/en/learn/modules/backpressuring-in-streams) - Official guide on drain/backpressure patterns
- [FFmpeg Formats Documentation](https://ffmpeg.org/ffmpeg-formats.html) - image2pipe format, movflags faststart, MP4 muxer
- [FFmpeg Documentation](https://ffmpeg.org/ffmpeg.html) - CLI arguments, -shortest flag, codec options, pipe protocol
- [FFmpeg Codecs Documentation](https://ffmpeg.org/ffmpeg-codecs.html) - libx264, AAC encoder options
- Local FFmpeg v8.0.1 verified with `ffmpeg -version` - libx264, libmp3lame, AAC support confirmed

### Secondary (MEDIUM confidence)
- [fluent-ffmpeg archival notice](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg/issues/1324) - Confirmed archived May 2025, no successor
- [Transloadit: Stream video processing with Node.js and FFmpeg](https://transloadit.com/devtips/stream-video-processing-with-node-js-and-ffmpeg/) - spawn() patterns, process lifecycle, error handling
- [CRF Guide by slhck](https://slhck.info/video/2017/02/24/crf-guide.html) - CRF 18 visually lossless, 0-51 scale, quality/size tradeoffs
- [FFmpeg faststart mailing list](https://ffmpeg-user.ffmpeg.narkive.com/xcr4yD0s/using-the-flags-movflags-faststart) - Confirmed faststart requires seekable output (file, not pipe)
- [Mux: combine audio and video](https://www.mux.com/articles/merge-audio-and-video-files-with-ffmpeg) - Two-input muxing with -shortest, stream copy

### Tertiary (LOW confidence)
- [Medium: Producing real-time Video with Node.js and FFmpeg](https://ofarukcaki.medium.com/producing-real-time-video-with-node-js-and-ffmpeg-a59ac27461a1) - image2pipe pattern (could not verify -- 403)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No npm packages needed; Node.js built-in `child_process` + `events.once` verified in official docs; FFmpeg verified locally installed with required codecs
- Architecture: HIGH - Two-step encode+mux pattern verified against FFmpeg docs (faststart requires file output); drain-aware writes verified against Node.js stream docs; Phase 17's async generator already yields individual buffers ready for piping
- Pitfalls: HIGH - stdin.end() hang, backpressure bloat, and faststart pipe limitation all verified against official docs; fluent-ffmpeg archival confirmed on GitHub

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (30 days -- FFmpeg CLI is stable, Node.js stream APIs unchanged for years)
