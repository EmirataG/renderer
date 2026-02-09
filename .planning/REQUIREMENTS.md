# Requirements: Manuscript Renderer v1.4 Backend Video Export

**Defined:** 2026-02-09
**Core Value:** Scores render correctly and efficiently -- high-quality engraving with smooth playback, even on long scores.

## v1.4 Requirements

### Backend Server

- [ ] **SRV-01**: Export API accepts MusicXML + audio + all settings via multipart upload
- [ ] **SRV-02**: Settings validation rejects incomplete exports (missing audio, MusicXML, or sync anchors)
- [ ] **SRV-03**: Multiple concurrent exports supported with controlled concurrency
- [ ] **SRV-04**: Temporary files cleaned up after export completion or failure

### Render Mode

- [ ] **RND-01**: Headless Chrome reproduces exact preview animation frame-for-frame
- [ ] **RND-02**: All settings transfer to render mode (score region, colors, fonts, animation params, sync anchors)
- [ ] **RND-03**: Page virtualization disabled in render mode (all pages mounted)
- [ ] **RND-04**: CSS transitions disabled in render mode for frame-accurate capture

### Video Encoding

- [ ] **VID-01**: FFmpeg encodes captured frames to H.264 MP4 with yuv420p pixel format
- [ ] **VID-02**: Audio muxed into final MP4 with correct sync
- [ ] **VID-03**: Output MP4 has faststart flag for streaming playback

### Progress & Download

- [ ] **PRG-01**: WebSocket streams real-time progress with frame count and percentage
- [ ] **PRG-02**: User can download completed MP4 directly from browser
- [ ] **PRG-03**: Export errors reported with clear message to user
- [ ] **PRG-04**: User can cancel in-progress export

### Configuration

- [ ] **CFG-01**: Configurable resolution with presets (720p, 1080p, 4K)
- [ ] **CFG-02**: Configurable frame rate (30 or 60 fps)

### Deployment

- [ ] **DEP-01**: Backend deployed on Fly.io with Docker (Chrome + FFmpeg)
- [ ] **DEP-02**: Auto-stop/auto-start for cost efficiency when idle

### Frontend UI

- [ ] **UI-01**: Export button in browser triggers export with current settings
- [ ] **UI-02**: Export progress displayed in browser during rendering

## Deferred to Future Milestones

### Export Queue & History

- **QUE-01**: Export queue with status tracking (needs BullMQ + Redis)
- **QUE-02**: Export history with re-download capability (needs file storage + metadata DB)

### Format Options

- **FMT-01**: Aspect ratio presets for 9:16 vertical (TikTok/Reels) and 1:1 square (Instagram)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Client-side video encoding | MediaRecorder produces WebM not MP4, audio sync unreliable, Canvas capture misses SVG details |
| Real-time export preview | Users already have browser preview, adds complexity for zero value |
| Pause/resume export | Puppeteer state expensive to serialize, easier to restart from scratch |
| Browser-based FFmpeg (ffmpeg.wasm) | 10-50x slower than native, memory-constrained |
| Export time estimation | Defer to v1.5 — requires calibration data from real exports |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SRV-01 | — | Pending |
| SRV-02 | — | Pending |
| SRV-03 | — | Pending |
| SRV-04 | — | Pending |
| RND-01 | — | Pending |
| RND-02 | — | Pending |
| RND-03 | — | Pending |
| RND-04 | — | Pending |
| VID-01 | — | Pending |
| VID-02 | — | Pending |
| VID-03 | — | Pending |
| PRG-01 | — | Pending |
| PRG-02 | — | Pending |
| PRG-03 | — | Pending |
| PRG-04 | — | Pending |
| CFG-01 | — | Pending |
| CFG-02 | — | Pending |
| DEP-01 | — | Pending |
| DEP-02 | — | Pending |
| UI-01 | — | Pending |
| UI-02 | — | Pending |

**Coverage:**
- v1.4 requirements: 21 total
- Mapped to phases: 0
- Unmapped: 21

---
*Requirements defined: 2026-02-09*
