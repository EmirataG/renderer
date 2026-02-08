---
phase: 11-single-line-event-extraction
created: 2026-02-05
source: /gsd:discuss-phase
---

# Phase 11: Single-Line Event Extraction - Context

## Decisions

### Event Data Structure

**Decision:** Extend existing `MusicEvent` type with horizontal position fields.

- Do NOT create a new type — add optional fields to existing MusicEvent
- No Y position needed for horizontal layout (Y is irrelevant in single-line mode)
- Events remain compatible with existing animation system

### Store Integration

**Decision:** Extend existing `eventStore` with horizontal position data.

- Do NOT create a separate store — extend eventStore
- Use the same `events` array (not separate arrays for vertical vs horizontal)
- Horizontal position fields are optional (only populated when SingleLineRenderer extracts them)

## Claude's Discretion

### X Position Fields

Claude decides which X-related fields to add to MusicEvent:
- `globalX` — absolute horizontal position across all sections (likely needed)
- `sectionIndex` — which section contains this event (likely needed)
- `localX` — position within a section (may or may not be needed)

Design for animation targeting: the animation system needs to position the camera so the active event is centered in the score region.

### Extraction Implementation

Claude decides:
- When extraction happens (during render, on score load, lazily)
- How to compute global X from section offsets + local element position
- Whether to cache positions or recompute on demand
- Integration with existing `getEventsFromVerovio` or separate extraction path

## Deferred Ideas

None identified during discussion.

## Notes

- Phase 11 requirement: ANI-03 (Each event has a single X coordinate for animation targeting)
- Extraction pattern should mirror v1.1 approach: timemap first, then DOM positions
- SyncEditor should continue working unchanged (reads from same store)
