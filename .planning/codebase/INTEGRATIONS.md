# External Integrations

**Analysis Date:** 2026-02-03

## APIs & External Services

**None detected.**

The application does not integrate with external APIs, cloud services, or third-party web services. All processing is client-side.

## Data Storage

**Databases:**
- None - Application is a pure frontend SPA with no database

**File Storage:**
- Local filesystem only (browser File API)
  - Users upload MusicXML, audio, and image files through drag-drop UI
  - Files are stored in browser memory as JavaScript objects/blob URLs
  - `src/components/UploadDropZone.tsx` handles file input validation and processing
  - `src/lib/fileValidation.ts` validates file types (MusicXML, audio, images)
  - Audio blob URLs created with `URL.createObjectURL()` in `src/App.tsx` lines 117, 125

**Caching:**
- None - No HTTP caching or data cache layer

## Authentication & Identity

**Auth Provider:**
- None - No user authentication system
- Application is public access with no login/user accounts
- No session management or identity verification

## Monitoring & Observability

**Error Tracking:**
- None - No error reporting service configured

**Logs:**
- Browser console only (standard `console.log` type calls via `window.setTimeout`)
- No centralized logging system
- Application-level logging happens in `src/lib/noteAnimation.ts` via `window.setTimeout`

## CI/CD & Deployment

**Hosting:**
- Not determined - Application builds to static files (`dist/`)
- Can be deployed to any static hosting (Vercel, Netlify, GitHub Pages, S3, etc.)

**CI Pipeline:**
- None detected - No GitHub Actions, Jenkins, or other CI service configuration

**Build Process:**
- Local development: `npm run dev` (Vite dev server)
- Production: `npm run build` (TypeScript check + Vite bundling)
- Preview: `npm run preview` (local preview of production build)

## Environment Configuration

**Required env vars:**
- None - Application has no environment variable dependencies

**Secrets location:**
- Not applicable - No API keys, credentials, or secrets used

## Webhooks & Callbacks

**Incoming:**
- None - Application does not accept webhooks

**Outgoing:**
- None - Application does not make external API calls or webhooks

## Browser APIs Used

**File Handling:**
- `File API` - File upload and reading
- `Blob API` - Audio and image blob URL creation/revocation
  - `URL.createObjectURL()` in `src/App.tsx` lines 117, 125
  - `URL.revokeObjectURL()` in `src/App.tsx` lines 117, 125

**DOM APIs:**
- `document.createElement()` - DOM manipulation for score validation in `src/lib/musicxmlValidation.ts`
- `document.body.appendChild/removeChild()` - Temporary container management in `src/lib/musicxmlValidation.ts`

**Timing APIs:**
- `window.setTimeout()` - Animation timing in `src/lib/noteAnimation.ts`
- `requestAnimationFrame()` - Animation loop (via Vite/React)

**Window Extensions:**
- Custom window API for Puppeteer integration defined in `src/types/global.d.ts`:
  - `window.setAnimationFrame(frame, fps)` - Set animation to specific frame
  - `window.setAnimationTimestamp(seconds)` - Set animation to specific timestamp
  - `window.getAnimationDuration()` - Get animation duration
  - `window.isAnimationReady()` - Check if animation controller ready

## Performance & Constraints

**Client-Side Processing:**
- All music notation rendering via OpenSheetMusicDisplay (no server processing)
- Animation calculations in browser via `src/lib/animationController.ts`
- No file size limits enforced (limited by browser memory)

**Bandwidth:**
- No network requests (except initial HTML/JS/CSS load)
- Audio and image files must be uploaded by user to memory
- No streaming support

---

*Integration audit: 2026-02-03*
