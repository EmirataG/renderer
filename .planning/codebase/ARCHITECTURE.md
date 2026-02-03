# Architecture

**Analysis Date:** 2026-02-03

## Pattern Overview

**Overall:** React-based music score renderer with dual-mode animation system and synchronization framework.

**Key Characteristics:**
- Component-driven UI with Zustand state management
- Two distinct animation modes: BPM-based (traditional) and sync-based (audio-timed)
- OpenSheetMusicDisplay (OSMD) integration for MusicXML rendering
- Frame-accurate animation controller for Puppeteer-based video generation
- Separated concerns between renderer, sync editor, and file handling

## Layers

**Presentation Layer:**
- Purpose: React components for UI and rendering
- Location: `src/components/`, `src/renderers/`
- Contains: UI controls, form inputs, preview rendering, editor interfaces
- Depends on: Store (state), Lib (utilities), Types
- Used by: App.tsx (main orchestrator)

**State Management Layer:**
- Purpose: Centralized state for sync anchors and event selection
- Location: `src/stores/syncStore.ts`
- Contains: Zustand store with anchor management
- Depends on: None
- Used by: App.tsx, SyncEditor, RegularRenderer

**Business Logic / Library Layer:**
- Purpose: Core algorithms for animation, interpolation, validation, and event extraction
- Location: `src/lib/`
- Contains: Event extraction, timestamp interpolation, animation control, file validation, music XML validation
- Depends on: OpenSheetMusicDisplay, Types
- Used by: Components, Renderers

**Visual Elements Layer:**
- Purpose: Decorative border components and styling
- Location: `src/borders/index.tsx`
- Contains: SVG-based border implementations (simple lines, ornate styles, flourish)
- Depends on: React, Types
- Used by: RegularRenderer

**Type Layer:**
- Purpose: TypeScript type definitions
- Location: `src/types/`
- Contains: Interfaces for ScoreRegion, MusicalEvent, InterpolatedEvent
- Depends on: None
- Used by: All layers

## Data Flow

**File Upload & Initialization:**

1. User drops/selects MusicXML, audio, or background image in UploadDropZone
2. File validation in `src/lib/fileValidation.ts` and `src/lib/musicxmlValidation.ts`
3. Callbacks invoke handlers in App.tsx to update state
4. RegularRenderer receives XML and initializes OpenSheetMusicDisplay
5. OSMD renders, events extracted via `getEventsWithY()` in RegularRenderer
6. Events stored in state, ready for animation

**Event-to-Display Flow:**

1. RegularRenderer extracts MusicalEvent[] from OSMD cursor iteration
2. Each event has beatOnset, svgIds (note IDs), Y position
3. Optional: Sync anchors (Map<eventId, timestamp>) passed to interpolation
4. `interpolateTimestamps()` computes absolute timestamps for each event
5. Animation loops read interpolatedEvents and position camera/highlight notes based on time
6. SVG noteheads animated via CSS transforms and color overrides

**Two Animation Modes:**

**BPM-based (Traditional):**
- No audio required
- Uses fixed BPM to calculate event durations in milliseconds
- `animateBPM()` loop: increments Y position at constant velocity between events
- Frame-rate limited with requestAnimationFrame
- Duration = (60_000 / bpm) * beatDuration milliseconds per event

**Sync-based (Audio-timed):**
- Requires audio file with computed anchor points
- Reads audioRef.current.currentTime for playback position
- `getEventAtTimestamp()` finds event at current audio time
- Interpolates Y position smoothly between events
- Driven by audio element, not wall-clock time
- Frame-rate is independent; audio time is ground truth

**State Management:**

- App.tsx holds all UI state: file references, settings (BPM, FPS, colors, animations)
- useSyncStore (Zustand) holds: anchors Map, selectedEventId
- SyncEditor writes anchors; RegularRenderer reads anchors
- Changes to store trigger re-interpolation in RegularRenderer via useEffect

## Key Abstractions

**RegularRenderer Component (`src/renderers/RegularRenderer.tsx`):**
- Purpose: Self-contained score rendering and animation engine
- Examples: Handles OSMD lifecycle, event extraction, camera system, animation loop
- Pattern: Heavy use of useRef for animation state (eventIndexRef, currentYRef, velocityRef)
- Responsibility: DOM rendering, animation logic, notehead styling

**SyncEditor Component (`src/components/SyncEditor.tsx`):**
- Purpose: OSMD-based UI for setting sync anchor timestamps
- Examples: Displays events as clickable timeline, allows timestamp input
- Pattern: Mirrors event extraction logic from RegularRenderer, manages timeline UI
- Responsibility: Visual event selection, timestamp input validation, audio preview sync

**MusicalEvent (`src/lib/getEvents.ts`, `src/types/score.ts`):**
- Purpose: Core abstraction for a point in the score requiring animation
- Pattern: Contains beatOnset (position in score), svgIds (which notes to highlight), spatial info (x, y)
- Used by: Event extraction, interpolation, animation loops

**InterpolatedEvent (`src/lib/interpolation.ts`):**
- Purpose: Extends MusicalEvent with computed absolute timestamps
- Pattern: Adds computedTimestamp (seconds) and isAnchor flag
- Used by: Animation loops for time-based sequencing

**Animation Controller (`src/lib/animationController.ts`):**
- Purpose: Frame-by-frame animation interface for Puppeteer video generation
- Pattern: Exposes window.animationController with setFrame/setTimestamp methods
- Responsibility: Synchronous highlight application without CSS transitions for frame capture

## Entry Points

**App Component (`src/App.tsx`):**
- Location: `src/App.tsx`
- Triggers: React root render in `src/main.tsx`
- Responsibilities:
  - File upload orchestration (MusicXML, audio, background)
  - Settings panel for playback and appearance
  - View toggling between renderer and sync editor
  - Passing configuration down to child components

**RegularRenderer (`src/renderers/RegularRenderer.tsx`):**
- Location: `src/renderers/RegularRenderer.tsx`
- Triggers: Called by App when musicXMLFile is set
- Responsibilities:
  - MusicXML-to-DOM rendering via OSMD
  - Animation loop management (BPM or sync-based)
  - Camera (vertical scroll) control
  - Notehead animation and color styling
  - Puppeteer integration (window.animationController exposure)

**SyncEditor (`src/components/SyncEditor.tsx`):**
- Location: `src/components/SyncEditor.tsx`
- Triggers: Called by App when currentView === 'sync'
- Responsibilities:
  - Event timeline display
  - Timestamp input UI
  - Audio preview synchronization
  - Anchor persistence to useSyncStore

## Error Handling

**Strategy:** Validation at file boundaries; graceful degradation in rendering.

**Patterns:**
- File upload: Validates MIME type, size, MusicXML structure before processing (`src/lib/fileValidation.ts`, `src/lib/musicxmlValidation.ts`)
- Music XML: OSMD load() catch block logs errors, prevents render
- Animation: Missing audio/events silently handled; animations skip or use defaults
- Toast notifications: User feedback for errors (see `src/components/Toast.tsx`)

## Cross-Cutting Concerns

**Logging:** Console.log used for debug info (animation controller exposure, OSMD load state) in RegularRenderer.

**Validation:**
- MusicXML: Pre-flight check for root element, full OSMD validation
- Files: Size, MIME type, format checks before accepting
- Timestamps: Input sanitization in SyncEditor

**Authentication:** Not applicable (client-side rendering tool).

**Styling:**
- Tailwind CSS for UI layout and component styling
- Scoped SVG styling in RegularRenderer via dynamic \<style\> elements (prevents SyncEditor interference)
- Color overrides applied directly to SVG shapes for animation

---

*Architecture analysis: 2026-02-03*
