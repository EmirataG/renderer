# Manuscript

Manuscript turns a **MusicXML score** and an **audio recording** into a synced
score-animation video. Upload a score, an audio file, and an optional background
image; tie score events to audio timestamps with sync anchors; preview the
animated score; and export a 4K MP4 — all rendered and encoded **entirely in the
browser**, with zero server-side rendering cost.

## Features

- **MusicXML → animated score.** Renders `.musicxml`, `.mxl` (compressed), and
  `.mei` into crisp vector notation via Verovio.
- **Audio sync.** Set anchors in the Sync Editor that map score events to audio
  timestamps; everything in between is interpolated (with tempo extrapolation
  outside the anchored range).
- **Two layouts.** *Page* mode scrolls vertically through stacked pages;
  *single-line* mode pans horizontally across one continuous strip.
- **Customizable look.** Score color, music font (Bravura, Petaluma, Leland,
  Gootville, Leipzig), active-notehead highlight color/scale/timing, borders,
  background image or solid color, and a positionable score region.
- **Client-side 4K export.** Re-renders the animation frame by frame, rasterizes
  to canvas, encodes H.264 via WebCodecs, and muxes MP4 + audio with
  `mp4-muxer`. No server involvement.
- **Projects.** Sign in with Google, and your scores, audio, settings, and sync
  anchors are saved per project and auto-saved as you work.

## How it works

The core pipeline:

1. **Render** — Verovio (WASM) renders MusicXML to SVG pages/sections.
2. **Extract** — note events are pulled from Verovio's timemap + MEI, each with a
   beat-domain onset, SVG element IDs, and pixel positions. Tie chains are parsed
   so tied continuations aren't treated as new onsets.
3. **Sync** — sync anchors (`Map<eventId, seconds>`) convert beat-domain onsets to
   wall-clock timestamps via linear interpolation.
4. **Animate** — a deterministic frame stepper highlights/reveals noteheads by
   mutating SVG styles. The same stepping drives both live preview and export.
5. **Export** — each frame is rasterized to canvas, encoded with WebCodecs H.264,
   and muxed into an MP4 with the audio track.

## Tech stack

- **Next.js 16** (App Router, Turbopack) + React + TypeScript
- **Verovio** (WASM) for MusicXML → SVG
- **WebCodecs** + **mp4-muxer** for client-side H.264/MP4 encoding
- **Zustand** for state
- **Firebase** — Auth (Google sign-in), Firestore (project data), Storage (files)

## Getting started

### Prerequisites

- Node.js 20+
- A Firebase project with Google sign-in enabled, plus Firestore and Storage
- A browser with **WebCodecs H.264 encoding** support (Chrome/Edge recommended)
  for video export

### 1. Install

```bash
npm install
```

### 2. Configure environment

Create `.env.local` in the project root with your Firebase credentials:

```bash
# Client SDK (public)
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...

# Admin SDK (server-only)
FIREBASE_ADMIN_PROJECT_ID=...
FIREBASE_ADMIN_CLIENT_EMAIL=...
FIREBASE_ADMIN_PRIVATE_KEY=...
```

The app requires these to run.

### 3. Run

```bash
npm run dev      # Next.js dev server (Turbopack)
```

Open the printed local URL, sign in, create a project, and upload a score + audio.

Sample scores, audio, and backgrounds for manual testing live in `demo/`.

## Commands

```bash
npm run dev      # dev server (Turbopack)
npm run build    # production build
npm start        # serve production build
npx tsc --noEmit # type-check
```

## Project structure

```
src/
  app/             # Next.js App Router routes + API handlers
    login/         # auth entry
    terms/         # public Terms of Service
    project/[id]/  # editor shell
    api/           # session, project CRUD, file proxy routes
  App.tsx          # editor shell: load project, upload/export UI, view switching
  renderers/       # RegularRenderer (page) + SingleLineRenderer (single-line)
  lib/
    verovioService.ts   # Verovio WASM singleton
    getEvents.ts        # event extraction from timemap + MEI
    interpolation.ts    # beat-domain → seconds
    noteAnimation.ts    # notehead highlight/reveal animation
    clientExport/       # frame stepping → canvas → WebCodecs → MP4
  hooks/           # useVerovio, useSingleLineVerovio
  stores/          # zustand: projectStore, syncStore, eventStore
  proxy.ts         # Next.js middleware (auth redirect for protected routes)
demo/              # sample scores / audio / backgrounds
```

## Notes

- All timing is **beat-domain first** (quarter-note units), converted to seconds
  only via interpolation — domains are not mixed.
- Score/audio/background files are served through API proxy routes (rather than
  Storage URLs) to avoid CORS and support audio range requests.
- Video export depends on the browser's WebCodecs H.264 encoder; the encoder
  configuration is selected at runtime from a fallback chain for compatibility
  across hardware.
