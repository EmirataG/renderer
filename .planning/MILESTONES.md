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

