# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Manuscript is a Next.js 16 (App Router) web app that turns a MusicXML score + an audio recording into a synced score-animation video. Users upload a score, audio, and optional background image; set sync anchors tying score events to audio timestamps; preview the animated score; and export an MP4 — all rendered and encoded client-side in the browser.

## Commands

```bash
npm run dev      # Next.js dev server (Turbopack)
npm run build    # Production build
npm start        # Serve production build
npx tsc --noEmit # Type-check (no lint or test setup exists)
```

There are no tests or linters configured. Firebase credentials live in `.env.local` (`NEXT_PUBLIC_FIREBASE_*` for the client SDK, `FIREBASE_ADMIN_*` for the admin SDK) — required for the app to run.

Sample scores/audio/backgrounds for manual testing are in `demo/`.

## Architecture

### Core pipeline (the thing to understand first)

1. **Verovio WASM** renders MusicXML → SVG. `src/lib/verovioService.ts` holds the singleton WASM module; toolkits are created per consumer. Hooks `useVerovio` (page layout) and `useSingleLineVerovio` (horizontal single-line layout) produce SVG pages/sections plus geometry.
2. **Event extraction** (`src/lib/getEvents.ts`): pulls note events from Verovio's timemap and MEI output — each event gets a `beatOnset` (beat-domain time), its SVG element IDs, and pixel positions. Tie chains are parsed from MEI so tied continuations aren't treated as new onsets. Results are cached in `eventStore`.
3. **Sync anchors** (`syncStore`): a `Map<eventId, timestampSeconds>` set by the user in the Sync Editor. `src/lib/interpolation.ts` converts beat-domain onsets to wall-clock timestamps: linear interpolation between anchors, tempo extrapolation outside them, default 60 BPM with a single anchor.
4. **Animation** (`src/lib/animationController.ts` + `src/lib/noteAnimation.ts`): a module-global controller with `setTimestamp`/`setFrame` that highlights/reveals noteheads by mutating SVG DOM inline styles. The same deterministic frame-stepping drives both live preview and export.
5. **Export** (`src/lib/clientExport/`): fully client-side — re-renders the score with Verovio, steps the animation per frame, rasterizes SVG → canvas, encodes H.264 via WebCodecs, and muxes MP4 + audio with `mp4-muxer`. No server involvement.

### Two view modes

`viewMode: 'page' | 'single-line'` selects between `src/renderers/RegularRenderer.tsx` (vertically stacked pages, camera scrolls down) and `src/renderers/SingleLineRenderer.tsx` (one horizontal strip, camera pans right). Event positions are axis-specific, so changing viewMode invalidates `eventStore`. Both renderers share a hardcoded `WIDTH = 980` editor width (duplicated as `EDITOR_WIDTH` in `clientExport/index.ts`); export scales up from this coordinate space.

### State (zustand)

- `projectStore` — all persistable project settings (`ProjectSettings`), project id/name, save status. `DEFAULT_SETTINGS` is the source of truth for defaults.
- `syncStore` — sync anchors Map + selected event.
- `eventStore` — cached extracted events; call `invalidate()` whenever the SVG layout changes.

`src/lib/autoSave.ts` subscribes to projectStore + syncStore (via `subscribeWithSelector`) and debounce-PATCHes `/api/projects/[id]`. `App.tsx` initializes it only *after* a project's settings/anchors finish loading, to avoid spurious saves; it is torn down and stores are reset when leaving a project.

### Shell

`src/App.tsx` is the editor shell (mounted by `app/project/[id]/client.tsx`): loads the project from the API, hydrates stores, owns upload/export/region-editing UI state, and switches between Preview and Sync Editor views. Note: settings sliders that trigger Verovio re-renders (scale, region) are debounced 300ms locally in App.tsx.

### Auth & persistence (Firebase)

- Client signs in with the Firebase client SDK (`firebase-client.ts`), then POSTs the ID token to `/api/auth/session`, which mints a 5-day httpOnly `__session` cookie.
- `src/proxy.ts` is the Next.js middleware (Next 16 "proxy" convention): redirects unauthenticated page requests to `/login`. API routes do their own auth via `adminAuth.verifySessionCookie`.
- Server-side: `firebase-admin.ts` / `firestore.ts` / `storage.ts` use lazy singletons (adminAuth is a Proxy that defers init until first property access — keep that pattern; eager init breaks builds without env vars).
- Data: Firestore at `users/{uid}/projects/{projectId}` (see `src/types/project.ts` for the document shape — settings are all optional, missing = default). Files in Storage under `users/{uid}/projects/{projectId}/`.
- Score/audio/background files are served through API proxy routes (`/api/projects/[id]/score|audio|background`) rather than Storage URLs, to avoid CORS and support range requests for audio seeking.

### Conventions & gotchas

- All timing math is beat-domain first (`beatOnset` in quarter-note units), converted to seconds only via `interpolateTimestamps`. Don't mix domains.
- SVG post-processing (trimming page top margins, reordering noteheads above stems, extracting dimensions) is done with regex on SVG strings — these helpers are intentionally duplicated between `useVerovio.ts` and `clientExport/index.ts`.
- Blob URLs are explicitly revoked when files are replaced or projects switch — preserve this when touching upload/load paths.
- Effects in `App.tsx` are written to survive React Strict Mode double-mounting (`cancelled` flags, cleanup of auto-save subscriptions). Recent git history shows regressions from breaking this; be careful with mount/unmount logic.
- `.mxl` (compressed MusicXML) is decompressed via Verovio in `musicxmlValidation.ts`; `.mei` is also accepted.
