---
phase: 18-ffmpeg-encoding-audio-mux
plan: 01
subsystem: encoding
tags: [ffmpeg, h264, aac, child_process, spawn, backpressure, drain, mp4]

# Dependency graph
requires:
  - phase: 17-puppeteer-integration
    provides: "captureFrames async generator yielding PNG buffers, renderJob orchestrator"
provides:
  - "FFmpeg video encoder with drain-aware frame piping (startVideoEncode)"
  - "FFmpeg audio muxer producing final MP4 (muxAudio, findAudioFile)"
  - "Refactored renderJob piping frames to FFmpeg stdin instead of memory"
  - "ExportJob.outputPath field for download endpoint"
affects: [19-download-cleanup, 20-docker]

# Tech tracking
tech-stack:
  added: [ffmpeg (system binary via child_process.spawn)]
  patterns: [drain-aware writes, two-step encode+mux, process lifecycle promises]

key-files:
  created:
    - export-service/src/encoding/encodeVideo.ts
    - export-service/src/encoding/muxAudio.ts
  modified:
    - export-service/src/jobs/types.ts
    - export-service/src/jobs/jobManager.ts

key-decisions:
  - "Direct child_process.spawn over fluent-ffmpeg (archived May 2025)"
  - "Two-step encode+mux: stdin piping for frames, then separate mux pass for audio"
  - "CRF 18 medium preset for visually lossless quality on score animations"
  - "Always transcode audio to AAC (simplicity over conditional codec copy)"

patterns-established:
  - "Drain-aware writes: check write() return, await once(stdin, 'drain') for backpressure"
  - "FFmpeg process lifecycle: attach close+error listeners BEFORE stdin.end() to avoid race"
  - "Intermediate file cleanup: unlink silent video after mux, ignore ENOENT"

# Metrics
duration: 2min
completed: 2026-02-09
---

# Phase 18 Plan 1: FFmpeg Encoding & Audio Mux Summary

**H.264 video encoding via FFmpeg stdin piping with drain-aware backpressure, AAC audio muxing, and +faststart MP4 output**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-09T20:19:09Z
- **Completed:** 2026-02-09T20:21:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created FFmpeg encoding module with drain-aware writeFrame preventing memory bloat
- Created audio muxing module with AAC transcoding and -shortest flag for duration alignment
- Eliminated in-memory frame buffer accumulation (90-450MB savings for typical videos)
- Added type-safe outputPath field to ExportJob for Phase 19 download endpoint

## Task Commits

Each task was committed atomically:

1. **Task 1: Create FFmpeg encoding and audio muxing modules** - `edfd3ad` (feat)
2. **Task 2: Refactor renderJob to pipe frames to FFmpeg and mux audio** - `fdfbf8d` (feat)

## Files Created/Modified
- `export-service/src/encoding/encodeVideo.ts` - FFmpeg video encoder: startVideoEncode with drain-aware writeFrame and finish helpers
- `export-service/src/encoding/muxAudio.ts` - Audio muxer: muxAudio (video+audio to MP4) and findAudioFile (temp dir lookup)
- `export-service/src/jobs/types.ts` - Added outputPath field to ExportJob interface
- `export-service/src/jobs/jobManager.ts` - Refactored renderJob to pipe frames to FFmpeg stdin, mux audio, clean up intermediates

## Decisions Made
- Used direct `child_process.spawn('ffmpeg', ...)` with no wrapper library (fluent-ffmpeg archived May 2025)
- Two-step approach: (1) pipe PNG frames to stdin for H.264 encoding, (2) separate mux pass for audio -- necessary because -movflags +faststart requires seekable file output and stdin can only carry one stream
- CRF 18 with medium preset for visually lossless quality on music score animations
- Always transcode audio to AAC (-c:a aac -b:a 192k) regardless of input format for simplicity
- Kept single 'rendering' status for capture+encode loop (concurrent operations), no separate 'encoding' status transition needed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. FFmpeg must be available on PATH (already installed locally, Phase 20 Docker will install it in the image).

## Next Phase Readiness
- outputPath field on ExportJob ready for Phase 19 download endpoint
- Final MP4 written to job.tempDir/output.mp4 with faststart for streaming
- Existing cleanupTempDir handles full cleanup when job is done

## Self-Check: PASSED

All files verified present. All commit hashes verified in git log.

---
*Phase: 18-ffmpeg-encoding-audio-mux*
*Completed: 2026-02-09*
