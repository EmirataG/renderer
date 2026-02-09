# Phase 15: Backend Foundation & Settings Transfer - Research

**Researched:** 2026-02-09
**Domain:** Fastify HTTP server with multipart upload, settings validation, temp file management
**Confidence:** HIGH

## Summary

Phase 15 establishes the backend foundation: a Fastify HTTP server that accepts export requests containing MusicXML files, audio files, and all rendering settings via multipart upload. The backend validates the settings schema (including Map serialization for sync anchors), creates a unique job ID, stores uploaded files to a temporary directory, and cleans up after completion or failure.

This phase is entirely backend-side -- it creates the `export-service/` directory as a sibling package in the monorepo with its own `package.json` and TypeScript configuration. The core technical challenges are: (1) correctly receiving mixed file/field multipart uploads via `@fastify/multipart`, (2) defining and validating the complete settings schema that mirrors all frontend App.tsx state, and (3) implementing robust temporary file lifecycle management with cleanup on both success and error paths.

The existing milestone research (`.planning/research/`) has already verified the stack at HIGH confidence: Fastify v5, @fastify/multipart, @fastify/cors, crypto.randomUUID for job IDs, and TypeScript. This phase-specific research focuses on the practical patterns for implementing these within the Phase 15 scope.

**Primary recommendation:** Use `@fastify/multipart` with `request.parts()` iterator for streaming multipart handling, Fastify's built-in JSON Schema validation for the settings field, `fs.mkdtemp` for isolated per-job temp directories, and `try/finally` cleanup in all code paths.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastify | ^5.7.4 | HTTP server framework | 3-4x faster than Express, built-in JSON schema validation via Ajv, Pino structured logging included, first-class TypeScript |
| @fastify/multipart | ^9.4.0 | Multipart file upload (MusicXML + audio + bg image) | Official Fastify plugin, stream-based, configurable size limits, `saveRequestFiles()` for disk storage |
| @fastify/cors | ^11.2.0 | CORS for cross-origin requests from frontend | Frontend on different port/domain needs to call backend |
| typescript | ~5.9.x | Type safety | Matches frontend TypeScript version |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @fastify/type-provider-typebox | ^6.1.0 | TypeBox integration for type-safe route schemas | When defining route schemas -- provides automatic TypeScript inference from JSON Schema |
| @sinclair/typebox | ^0.34.x | Schema + type definition library | Define ExportSettings schema once, get both JSON Schema validation and TypeScript types |
| tsx | ^4.0.0 | TypeScript execution for development | `tsx watch src/server.ts` for dev mode with hot reload |
| @types/node | ^22.0.0 | Node.js type definitions | TypeScript compilation |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| TypeBox schemas | Raw JSON Schema + hand-written types | TypeBox eliminates type/schema drift; raw JSON Schema requires maintaining types separately |
| @fastify/multipart | busboy directly | Fastify plugin integrates hooks, limits, and TypeScript types automatically |
| fs.mkdtemp | @fastify/multipart saveRequestFiles | saveRequestFiles auto-cleans after response, but we need files to persist across the job lifecycle (beyond the request) |

**Installation:**
```bash
# Run from export-service/ directory
npm install \
  fastify@^5.7.4 \
  @fastify/multipart@^9.4.0 \
  @fastify/cors@^11.2.0 \
  @sinclair/typebox@^0.34.0 \
  @fastify/type-provider-typebox@^6.1.0

npm install -D \
  typescript@~5.9.3 \
  @types/node@^22.0.0 \
  tsx@^4.0.0
```

## Architecture Patterns

### Recommended Project Structure

```
Manuscript/
  renderer/                    # Existing frontend SPA (unchanged this phase)
  export-service/              # NEW: Backend service
    package.json
    tsconfig.json
    src/
      server.ts                # Entry point: create Fastify, register plugins, start
      routes/
        export.ts              # POST /api/export -- multipart upload + validation
        status.ts              # GET /api/export/:jobId/status -- job status
      jobs/
        jobManager.ts          # In-memory job store, lifecycle, cleanup scheduling
        types.ts               # ExportJob, JobStatus types
      shared/
        exportSettings.ts      # ExportSettings TypeBox schema + TypeScript type
        validation.ts          # Settings validation logic (Map round-trip, field checks)
        config.ts              # Server configuration constants
      utils/
        tempDir.ts             # Temp directory creation + cleanup helpers
```

### Pattern 1: Multipart Upload with Mixed Files and Fields

**What:** Accept MusicXML (file), audio (file), background image (file, optional), and settings (JSON string field) in a single multipart POST request.

**When to use:** The export endpoint -- the only route that receives data from the frontend.

**Example:**
```typescript
// Source: @fastify/multipart README -- request.parts() iterator
import { type MultipartFile } from '@fastify/multipart';

fastify.post('/api/export', async (request, reply) => {
  const parts = request.parts();

  let settingsJson: string | null = null;
  let syncAnchorsJson: string | null = null;
  const files: Record<string, { buffer: Buffer; mimetype: string; filename: string }> = {};

  for await (const part of parts) {
    if (part.type === 'field') {
      if (part.fieldname === 'settings') settingsJson = part.value as string;
      if (part.fieldname === 'syncAnchors') syncAnchorsJson = part.value as string;
    } else if (part.type === 'file') {
      // Consume file stream to buffer
      const buffer = await part.toBuffer();
      files[part.fieldname] = {
        buffer,
        mimetype: part.mimetype,
        filename: part.filename,
      };
    }
  }

  // Validate and process...
});
```

**Critical constraint:** Field ordering matters with @fastify/multipart. Frontend MUST send text fields (settings, syncAnchors) BEFORE file fields (musicXml, audio, bgImage) in the FormData. This ensures fields are available when processing begins.

### Pattern 2: Job Lifecycle with In-Memory Store

**What:** Track export jobs through a state machine with cleanup on terminal states.

**When to use:** Every export request creates a job. JobManager tracks state across the request/response boundary.

**Example:**
```typescript
// Source: Milestone research ARCHITECTURE.md
import { randomUUID } from 'node:crypto';

type JobStatus = 'queued' | 'preparing' | 'rendering' | 'encoding' | 'complete' | 'error';

interface ExportJob {
  id: string;
  status: JobStatus;
  createdAt: number;
  completedAt?: number;
  tempDir: string;
  error?: string;
  settings: ExportSettings;
}

class JobManager {
  private jobs = new Map<string, ExportJob>();

  createJob(tempDir: string, settings: ExportSettings): ExportJob {
    const job: ExportJob = {
      id: randomUUID(),
      status: 'queued',
      createdAt: Date.now(),
      tempDir,
      settings,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  getJob(id: string): ExportJob | undefined {
    return this.jobs.get(id);
  }

  updateStatus(id: string, status: JobStatus): void {
    const job = this.jobs.get(id);
    if (job) {
      job.status = status;
      if (status === 'complete' || status === 'error') {
        job.completedAt = Date.now();
      }
    }
  }
}
```

### Pattern 3: Temp Directory per Job with try/finally Cleanup

**What:** Each job gets an isolated temp directory under `os.tmpdir()`. Cleanup happens in finally blocks AND via periodic sweeps.

**When to use:** Every job that stores files.

**Example:**
```typescript
// Source: Node.js fs docs + best practices research
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function createJobTempDir(jobId: string): Promise<string> {
  const prefix = join(tmpdir(), `manuscript-export-${jobId}-`);
  return mkdtemp(prefix);
}

async function cleanupTempDir(tempDir: string): Promise<void> {
  try {
    await rm(tempDir, { recursive: true, force: true });
  } catch (err) {
    // Log but don't throw -- cleanup failure should not crash the server
    console.error(`Failed to cleanup ${tempDir}:`, err);
  }
}

// Usage in route handler
const tempDir = await createJobTempDir(jobId);
try {
  await writeFile(join(tempDir, 'score.xml'), musicXmlBuffer);
  await writeFile(join(tempDir, 'audio' + audioExt), audioBuffer);
  if (bgImageBuffer) {
    await writeFile(join(tempDir, 'bg' + bgExt), bgImageBuffer);
  }
  // ... create job, return jobId
} catch (err) {
  await cleanupTempDir(tempDir);
  throw err;
}
```

### Pattern 4: Settings Schema with TypeBox

**What:** Define the complete export settings schema using TypeBox. Gets both JSON Schema validation (via Fastify) and TypeScript types from a single definition.

**When to use:** Validating the settings JSON field in the multipart upload.

**Example:**
```typescript
// Source: @sinclair/typebox + @fastify/type-provider-typebox docs
import { Type, Static } from '@sinclair/typebox';

const ScoreRegionSchema = Type.Object({
  x: Type.Number(),
  y: Type.Number(),
  width: Type.Number(),
  height: Type.Number(),
});

const ExportSettingsSchema = Type.Object({
  fps: Type.Number({ minimum: 15, maximum: 60 }),
  scoreColor: Type.String({ pattern: '^#[0-9a-fA-F]{6}$' }),
  scoreShadowDistance: Type.Number({ minimum: 0, maximum: 6 }),
  hideUnplayedNotes: Type.Boolean(),
  smoothReveal: Type.Boolean(),
  scoreRegion: Type.Union([ScoreRegionSchema, Type.Null()]),
  scoreBorder: Type.Union([
    Type.Literal('none'),
    Type.Literal('line'),
    Type.Literal('double-line'),
    Type.Literal('ornate-1'),
    Type.Literal('ornate-2'),
    Type.Literal('flourish'),
  ]),
  scoreScale: Type.Number({ minimum: 0.5, maximum: 1.5 }),
  musicFont: Type.Union([
    Type.Literal('Bravura'),
    Type.Literal('Petaluma'),
    Type.Literal('Leland'),
    Type.Literal('Gootville'),
    Type.Literal('Leipzig'),
  ]),
  activeNoteheadColor: Type.Union([
    Type.String({ pattern: '^#[0-9a-fA-F]{6}$' }),
    Type.Null(),
  ]),
  activeNoteheadScale: Type.Number({ minimum: 1, maximum: 1.6 }),
  activeNoteheadEntryMs: Type.Number({ minimum: 0, maximum: 300 }),
  activeNoteheadHoldMs: Type.Number({ minimum: 0, maximum: 1000 }),
  activeNoteheadExitMs: Type.Number({ minimum: 0, maximum: 1000 }),
  colorFullNote: Type.Boolean(),
  audioDuration: Type.Optional(Type.Number({ minimum: 0 })),
});

// TypeScript type derived from schema -- always in sync
type ExportSettings = Static<typeof ExportSettingsSchema>;
```

### Anti-Patterns to Avoid

- **Using `saveRequestFiles()` for job files:** This auto-cleans files after the response ends, but our files need to persist across the full job lifecycle (which continues long after the POST response). Use `request.parts()` with manual `writeFile` instead.

- **Storing settings in URL query params:** URL length limits prevent this. MusicXML can be 2MB. Use multipart upload.

- **JSON.stringify(map) for sync anchors:** `JSON.stringify(new Map([['a', 1]]))` returns `'{}'`. Frontend MUST use `Object.fromEntries(anchors)` before sending. Backend MUST validate the result is non-empty.

- **Skipping validation on "trusted" frontend data:** The backend must validate independently. A broken frontend, network corruption, or malicious request can send invalid data. Validate everything.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multipart parsing | Custom multipart parser | @fastify/multipart | Edge cases with boundaries, encoding, streaming are well-solved |
| JSON Schema validation | Custom if/else validation | Fastify built-in Ajv + TypeBox | Ajv is battle-tested, TypeBox gives type inference for free |
| Unique IDs | Custom ID generator | `crypto.randomUUID()` | Built-in Node.js, RFC 4122 v4, zero dependencies |
| CORS handling | Custom headers middleware | @fastify/cors | Handles preflight, credentials, varied origins correctly |
| Temp directory creation | Manual `mkdir` + random suffix | `fs.mkdtemp()` | Atomic creation, OS-appropriate temp path, prevents race conditions |

**Key insight:** Phase 15 is foundational plumbing. Every component has a well-tested library solution. Hand-rolling any of these introduces bugs that will be discovered much later during integration phases.

## Common Pitfalls

### Pitfall 1: Map Serialization Loses Sync Anchors

**What goes wrong:** Sync anchors are stored as `Map<string, number>` in the frontend Zustand store. `JSON.stringify(new Map([['evt-0', 1.5]]))` produces `'{}'` -- an empty object. All sync timing data is silently lost. Export runs but produces a video with no note animations.

**Why it happens:** JavaScript Maps are not directly JSON-serializable. This is a well-known footgun.

**How to avoid:** Frontend must serialize with `Object.fromEntries(anchors)` before sending. Backend must validate `syncAnchors` is a non-empty Record and reconstruct with `new Map(Object.entries(data))` when needed. Add explicit validation: if `Object.keys(syncAnchors).length === 0`, reject with error "Sync anchors are empty -- Map serialization may have failed".

**Warning signs:** Export request succeeds but resulting video has no note highlighting. The `syncAnchors` field in the stored settings is `{}`.

### Pitfall 2: Multipart Field Ordering Causes Missing Settings

**What goes wrong:** `@fastify/multipart` processes parts in serial order (via busboy). If files are placed before text fields in the FormData, the settings JSON may not be available when needed during streaming processing.

**Why it happens:** Multipart streams are consumed sequentially. You cannot "rewind" to read an earlier field.

**How to avoid:** Frontend MUST append text fields (`settings`, `syncAnchors`) BEFORE file fields (`musicXml`, `audio`, `bgImage`) when constructing FormData. Backend should use `request.parts()` iterator which processes all parts in order, collecting both fields and files before validation.

**Warning signs:** Settings fields are undefined/null after parsing multipart despite being sent by the frontend.

### Pitfall 3: Temp Files Not Cleaned on Error Paths

**What goes wrong:** An exception during file writing or validation creates orphaned temp directories. Over time, these fill the disk.

**Why it happens:** Error handling forgets to clean up partially-written temp directories. The "happy path" has cleanup but the error path does not.

**How to avoid:** Always wrap temp dir usage in try/finally. Also implement a periodic cleanup sweep at server startup and on a timer (e.g., every hour) that removes temp directories older than 2 hours. Use Fastify's `onClose` hook to clean up when the server shuts down.

**Warning signs:** `ls /tmp/manuscript-export-*` shows growing number of directories.

### Pitfall 4: Missing File Extension Causes MIME Detection Failures

**What goes wrong:** Audio files are saved without their original extension (e.g., saved as `audio` instead of `audio.mp3`). Later phases that use `ffprobe` to get audio duration may fail because ffprobe relies on file extension hints for container format detection.

**Why it happens:** The original filename from the upload is not preserved, or the extension is stripped during processing.

**How to avoid:** Extract the file extension from the original filename (`path.extname(part.filename)`) or derive it from the MIME type. Always save with the correct extension: `audio.mp3`, `audio.wav`, `audio.ogg`, etc.

**Warning signs:** ffprobe or FFmpeg fails with "Invalid data found when processing input" in later phases.

### Pitfall 5: Oversized Uploads Hang or OOM the Server

**What goes wrong:** A large audio file (100MB+) or background image (50MB+) is buffered entirely in memory via `part.toBuffer()`, causing memory spikes or OOM.

**Why it happens:** `toBuffer()` accumulates the entire file in RAM. For large files this is dangerous.

**How to avoid:** Set file size limits when registering `@fastify/multipart`: `{ limits: { fileSize: 50 * 1024 * 1024 } }` (50MB). For audio files which can be large, stream directly to disk using `pipeline(part.file, createWriteStream(filePath))` instead of buffering. Only buffer small files (MusicXML, settings JSON).

**Warning signs:** Server process RSS memory spikes during upload. Upload requests hang for very large files.

## Code Examples

Verified patterns from official sources:

### Server Entry Point

```typescript
// Source: Fastify v5 official docs
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';

const server = Fastify({
  logger: true, // Pino structured logging
});

// Register plugins
await server.register(cors, {
  origin: true, // Reflect request origin (development); restrict in production
});

await server.register(multipart, {
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max per file
    files: 3, // max 3 files: musicXml, audio, bgImage
    fieldSize: 5 * 1024 * 1024, // 5MB for settings JSON field (MusicXML content may be large)
  },
});

// Health check
server.get('/health', async () => ({ status: 'ok' }));

// Register routes
await server.register(exportRoutes, { prefix: '/api' });

// Start
await server.listen({ port: 3001, host: '0.0.0.0' });
```

### Export Route Handler

```typescript
// Source: @fastify/multipart docs + Fastify validation docs
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

async function exportRoute(fastify: FastifyInstance) {
  fastify.post('/export', async (request, reply) => {
    const parts = request.parts();

    let settingsRaw: string | null = null;
    let syncAnchorsRaw: string | null = null;
    const uploadedFiles: Map<string, { path: string; mimetype: string }> = new Map();

    // Create temp dir first
    const jobId = randomUUID();
    const tempDir = await createJobTempDir(jobId);

    try {
      for await (const part of parts) {
        if (part.type === 'field') {
          if (part.fieldname === 'settings') settingsRaw = part.value as string;
          if (part.fieldname === 'syncAnchors') syncAnchorsRaw = part.value as string;
        } else if (part.type === 'file') {
          const ext = extname(part.filename) || mimeToExt(part.mimetype);
          const destPath = join(tempDir, `${part.fieldname}${ext}`);
          // Stream large files to disk (audio can be 100MB+)
          await pipeline(part.file, createWriteStream(destPath));
          uploadedFiles.set(part.fieldname, { path: destPath, mimetype: part.mimetype });
        }
      }

      // Validate required fields
      if (!settingsRaw) throw createError(400, 'Missing settings field');
      if (!syncAnchorsRaw) throw createError(400, 'Missing syncAnchors field');
      if (!uploadedFiles.has('musicXml')) throw createError(400, 'Missing MusicXML file');
      if (!uploadedFiles.has('audio')) throw createError(400, 'Missing audio file');

      // Parse and validate settings
      const settings = JSON.parse(settingsRaw);
      const syncAnchors = JSON.parse(syncAnchorsRaw);

      // Validate sync anchors are non-empty
      if (typeof syncAnchors !== 'object' || Object.keys(syncAnchors).length === 0) {
        throw createError(400, 'syncAnchors is empty -- ensure Map is serialized with Object.fromEntries()');
      }

      // Validate settings against schema
      const validationErrors = validateExportSettings(settings);
      if (validationErrors.length > 0) {
        throw createError(400, `Invalid settings: ${validationErrors.join(', ')}`);
      }

      // Create job
      const job = jobManager.createJob(jobId, tempDir, { ...settings, syncAnchors });

      return reply.code(201).send({
        jobId: job.id,
        status: job.status,
      });
    } catch (err) {
      // Cleanup on error
      await cleanupTempDir(tempDir);
      throw err;
    }
  });
}
```

### Settings Validation

```typescript
// Source: Fastify validation docs + TypeBox
import { Value } from '@sinclair/typebox/value';

function validateExportSettings(settings: unknown): string[] {
  const errors: string[] = [];

  // Validate against TypeBox schema
  if (!Value.Check(ExportSettingsSchema, settings)) {
    const schemaErrors = [...Value.Errors(ExportSettingsSchema, settings)];
    for (const err of schemaErrors) {
      errors.push(`${err.path}: ${err.message}`);
    }
  }

  return errors;
}

function validateSyncAnchors(anchors: unknown): string[] {
  const errors: string[] = [];

  if (typeof anchors !== 'object' || anchors === null) {
    errors.push('syncAnchors must be an object');
    return errors;
  }

  const entries = Object.entries(anchors as Record<string, unknown>);
  if (entries.length === 0) {
    errors.push('syncAnchors is empty -- Map serialization likely failed');
    return errors;
  }

  for (const [key, value] of entries) {
    if (typeof value !== 'number' || isNaN(value)) {
      errors.push(`syncAnchors["${key}"] must be a number, got ${typeof value}`);
    }
    if (typeof value === 'number' && value < 0) {
      errors.push(`syncAnchors["${key}"] must be non-negative`);
    }
  }

  return errors;
}
```

### Complete Settings Interface (Derived from App.tsx Analysis)

```typescript
// Source: Codebase analysis of App.tsx state variables
// All settings that must transfer from frontend to backend:

interface ExportSettings {
  // Playback
  fps: number;                    // 15-60, default 60

  // Score appearance
  scoreColor: string;             // #RRGGBB hex
  scoreShadowDistance: number;     // 0-6
  hideUnplayedNotes: boolean;
  smoothReveal: boolean;
  scoreRegion: ScoreRegion | null; // { x, y, width, height }
  scoreBorder: BorderStyle;       // 'none' | 'line' | 'double-line' | 'ornate-1' | 'ornate-2' | 'flourish'
  scoreScale: number;             // 0.5-1.5
  musicFont: string;              // 'Bravura' | 'Petaluma' | 'Leland' | 'Gootville' | 'Leipzig'

  // Note animation
  activeNoteheadColor: string | null; // #RRGGBB hex or null (disabled)
  activeNoteheadScale: number;    // 1-1.6
  activeNoteheadEntryMs: number;  // 0-300
  activeNoteheadHoldMs: number;   // 0-1000
  activeNoteheadExitMs: number;   // 0-1000
  colorFullNote: boolean;

  // Audio duration hint (frontend knows from <audio> element)
  audioDuration?: number;
}

interface ScoreRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

type BorderStyle = 'none' | 'line' | 'double-line' | 'ornate-1' | 'ornate-2' | 'flourish';

// Sync anchors are sent separately as a plain object (NOT inside settings)
// because they are serialized from Map<string, number> via Object.fromEntries()
type SyncAnchorsPayload = Record<string, number>;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Express.js + multer | Fastify v5 + @fastify/multipart | Fastify v5 stable (2025) | 3-4x performance, built-in validation, Pino logging |
| fluent-ffmpeg wrapper | child_process.spawn directly | fluent-ffmpeg archived May 2025 | No deprecated dependency; simpler for single-command use |
| uuid / nanoid packages | crypto.randomUUID() | Node.js 14.17+ (native) | Zero dependencies, faster |
| JSON Schema + separate types | TypeBox (schema + types from one source) | TypeBox 0.34+ | Eliminates type/schema drift |

**Deprecated/outdated:**
- Express.js: Still works but Fastify v5 is the modern choice for new Node.js services
- fluent-ffmpeg: Archived May 2025, do not use
- Manual CORS headers: Use @fastify/cors plugin

## Open Questions

1. **MusicXML: File upload vs. string field?**
   - What we know: MusicXML content is a string (XML text), typically 50KB-2MB. The frontend already has it as a string in `musicXMLFile.xml`.
   - What's unclear: Should it be sent as a file upload or as a text field in the multipart form?
   - Recommendation: Send as a **file** (not a text field). Text fields in multipart have a default size limit of 1MB in busboy. MusicXML can exceed this. File streams have separate, configurable limits. Save to `score.xml` in the temp directory.

2. **Audio duration: Client hint vs. ffprobe?**
   - What we know: Frontend has audio duration from `<audio>` element. Backend will eventually need ffprobe (Phase 18) for exact duration.
   - What's unclear: Should Phase 15 compute audio duration with ffprobe, or defer to Phase 18?
   - Recommendation: Accept `audioDuration` as an optional field in settings. Do NOT add ffprobe dependency in Phase 15 -- it adds FFmpeg as a system dependency before we need it. Phase 18 will verify with ffprobe when encoding starts.

3. **Frontend changes in this phase?**
   - What we know: Phase 15 is "backend only" but the frontend needs to construct the FormData with correct field ordering and Map serialization.
   - What's unclear: Should the frontend export trigger be built now, or deferred?
   - Recommendation: Build a minimal "export service client" utility in the frontend that constructs the FormData correctly. This validates the data contract end-to-end. The full Export button UI can come in Phase 21.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `src/App.tsx` -- complete list of all settings (17 state variables analyzed)
- Codebase analysis: `src/stores/syncStore.ts` -- `Map<string, number>` for sync anchors confirmed
- Codebase analysis: `src/types/score.ts` -- ScoreRegion interface: `{ x, y, width, height }`
- Codebase analysis: `src/borders/index.tsx` -- BorderStyle type: `'none' | 'line' | 'double-line' | 'ornate-1' | 'ornate-2' | 'flourish'`
- [Fastify v5 Validation and Serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/) -- JSON Schema validation, Ajv configuration, error handling
- [@fastify/multipart GitHub README](https://github.com/fastify/fastify-multipart) -- `request.parts()`, `saveRequestFiles()`, `attachFieldsToBody`, file limits
- [@fastify/multipart npm v9.4.0](https://www.npmjs.com/package/@fastify/multipart) -- Version verification
- [@fastify/cors GitHub](https://github.com/fastify/fastify-cors) -- CORS configuration options
- [Node.js crypto.randomUUID](https://nodejs.org/api/crypto.html#cryptorandomuuidoptions) -- Built-in UUID
- [Node.js fs.mkdtemp](https://nodejs.org/api/fs.html) -- Temp directory creation
- Milestone research: `.planning/research/STACK.md` -- Full stack verification at HIGH confidence
- Milestone research: `.planning/research/ARCHITECTURE.md` -- Data flow, component boundaries
- Milestone research: `.planning/research/PITFALLS.md` -- Pitfall #12 (Map serialization), Pitfall #14 (temp cleanup)

### Secondary (MEDIUM confidence)
- [Fastify TypeBox Type Provider](https://github.com/fastify/fastify-type-provider-typebox) -- v6.1.0, TypeBox integration
- [Fastify Type Providers docs](https://fastify.dev/docs/latest/Reference/Type-Providers/) -- TypeBox and json-schema-to-ts providers
- [@sinclair/typebox](https://github.com/sinclairzx81/typebox) -- Schema + type definitions
- [Better Stack: File Uploads with Fastify](https://betterstack.com/community/guides/scaling-nodejs/fastify-file-uploads/) -- Practical upload patterns
- [Node.js temp directory patterns](https://advancedweb.hu/secure-tempfiles-in-nodejs-without-dependencies/) -- try/finally cleanup pattern

### Tertiary (LOW confidence)
- [saveRequestFiles cleanup issue #546](https://github.com/fastify/fastify-multipart/issues/546) -- Known issue with request cancellation cleanup

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All versions verified on npm, consistent with milestone research
- Architecture: HIGH -- Based on direct codebase analysis of App.tsx state, syncStore Map, borders types
- Settings schema: HIGH -- Every field traced to specific App.tsx useState call with exact types and ranges
- Pitfalls: HIGH -- Map serialization is documented JavaScript behavior; temp cleanup patterns are well-established

**Research date:** 2026-02-09
**Valid until:** 60 days (Fastify plugin versions stable; check before implementation)
