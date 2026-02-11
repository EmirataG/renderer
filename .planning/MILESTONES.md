# Milestones

## v1.3 Performance & Polish (Shipped: 2026-02-09)

**Phases completed:** 1 phase, 2 plans, 5 tasks

**Key accomplishments:**
- Camera-driven page virtualization: only visible pages + 1-page buffer mounted in DOM
- Removed isRenderMode from RegularRenderer (Puppeteer moving to backend)
- Two-phase mount lifecycle: all pages mount for event extraction, then virtualize
- Gap-free page stacking via Verovio adjustPageHeight + viewBox trimming
- Staff lines appear continuous across page boundaries (no visible seams)

---

## v1.4 Backend Video Export (Shipped: 2026-02-11)

**Phases completed:** 6 phases (15-20), 29 plans total

**Key accomplishments:**
- Fastify export service with TypeBox schema validation
- Puppeteer browser pool with frame-by-frame capture via animationController API
- FFmpeg encoding (CRF 18 veryfast) with two-step encode+mux pipeline
- WebSocket progress streaming with 250ms throttle
- Direct download endpoint for completed exports
- Docker image with Puppeteer + FFmpeg (Fly.io deployment deferred)

---

