# Codebase Structure

**Analysis Date:** 2026-02-03

## Directory Layout

```
/Users/emirahmed/Desktop/Manuscript/renderer/
├── src/                          # Source code
│   ├── App.tsx                   # Root component: main UI orchestrator
│   ├── main.tsx                  # React entry point
│   ├── index.css                 # Global styles
│   ├── vite-env.d.ts             # Vite type declarations
│   ├── components/               # Reusable UI components
│   │   ├── BorderPicker.tsx       # Border style selector
│   │   ├── ScoreRegionEditor.tsx  # Interactive score region editor
│   │   ├── SyncEditor.tsx         # Timeline-based sync anchor editor
│   │   ├── TimestampInput.tsx     # Timestamp input control
│   │   ├── Toast.tsx              # Toast notification provider/display
│   │   └── UploadDropZone.tsx     # File upload drag-drop zone
│   ├── renderers/                # Score rendering components
│   │   └── RegularRenderer.tsx    # Main OSMD-based score renderer with animation
│   ├── stores/                   # State management
│   │   └── syncStore.ts          # Zustand store for sync anchors
│   ├── hooks/                    # Custom React hooks
│   │   └── useToast.ts           # Toast notification hook
│   ├── lib/                      # Business logic utilities
│   │   ├── animationController.ts # Puppeteer frame control interface
│   │   ├── fileValidation.ts      # File type/size validation
│   │   ├── getEvents.ts           # Event extraction from OSMD
│   │   ├── interpolation.ts       # Timestamp interpolation algorithm
│   │   ├── musicxmlValidation.ts  # MusicXML format validation
│   │   └── noteAnimation.ts       # Notehead animation helpers
│   ├── borders/                  # Border styling components
│   │   └── index.tsx             # Border implementations (line, ornate, flourish)
│   └── types/                    # TypeScript definitions
│       ├── global.d.ts           # Global type augmentation
│       └── score.ts              # ScoreRegion and related types
├── index.html                    # HTML entry point
├── vite.config.ts                # Vite configuration
├── tsconfig.json                 # TypeScript root config (references tsconfig.app.json)
├── tsconfig.app.json             # TypeScript application config
├── package.json                  # Dependencies and scripts
├── .planning/
│   └── codebase/                 # Planning documents (this directory)
├── dist/                         # Build output (generated)
└── node_modules/                 # Dependencies (generated)
```

## Directory Purposes

**src/:**
- Purpose: All TypeScript/TSX source code
- Contains: Components, utilities, types, configuration
- Key files: App.tsx (root), main.tsx (entry), index.css (global styles)

**src/components/:**
- Purpose: Reusable UI components for user interactions
- Contains: File upload, sync editor, region editor, toast notifications
- Key files: UploadDropZone.tsx (file handling), SyncEditor.tsx (sync UI), Toast.tsx (notifications)

**src/renderers/:**
- Purpose: Score rendering and animation engines
- Contains: OSMD integration, animation loops, camera system
- Key files: RegularRenderer.tsx (900+ lines, core renderer)

**src/stores/:**
- Purpose: Global state management
- Contains: Zustand stores for app-wide state
- Key files: syncStore.ts (sync anchor persistence)

**src/hooks/:**
- Purpose: Custom React hooks for shared stateful logic
- Contains: Reusable hook implementations
- Key files: useToast.ts (toast context and management)

**src/lib/:**
- Purpose: Core business logic and utilities
- Contains: Event extraction, timing algorithms, file validation, animation helpers
- Key files:
  - `getEvents.ts` (OSMD event extraction)
  - `interpolation.ts` (sync timestamp computation)
  - `animationController.ts` (Puppeteer frame interface)
  - `musicxmlValidation.ts` (MusicXML parsing/validation)

**src/borders/:**
- Purpose: Decorative score border SVG components
- Contains: Border style implementations
- Key files: `index.tsx` (all border types, registry, helpers)

**src/types/:**
- Purpose: TypeScript type definitions
- Contains: Interfaces shared across codebase
- Key files:
  - `score.ts` (ScoreRegion interface)
  - `global.d.ts` (type augmentation)

## Key File Locations

**Entry Points:**
- `src/main.tsx`: React app initialization (renders App to #root)
- `src/App.tsx`: Root component containing layout and state orchestration
- `index.html`: HTML shell with root div and script tag

**Configuration:**
- `vite.config.ts`: Vite build tool configuration (React plugin)
- `tsconfig.app.json`: TypeScript compiler options (ES2020, React JSX)
- `package.json`: Dependencies, build scripts, metadata

**Core Logic:**
- `src/renderers/RegularRenderer.tsx`: Score rendering, animation loops, camera system
- `src/components/SyncEditor.tsx`: Event timeline UI, anchor management
- `src/stores/syncStore.ts`: Zustand store for sync state
- `src/lib/interpolation.ts`: Timestamp calculation algorithm

**Testing:**
- No test files present (see CONCERNS.md)

## Naming Conventions

**Files:**
- React components: PascalCase, .tsx extension (e.g., `App.tsx`, `RegularRenderer.tsx`)
- Utilities: camelCase, .ts extension (e.g., `syncStore.ts`, `interpolation.ts`)
- Directories: kebab-case (e.g., `src/components/`, `src/renderers/`)

**Functions:**
- Components: PascalCase (export default function App())
- Utilities: camelCase (export function interpolateTimestamps())
- Hooks: camelCase with 'use' prefix (export function useToast())
- Callbacks: camelCase with verb prefix (e.g., handleDragOver, processMusicXML, getEventsWithY)

**Variables:**
- State setters: camelCase with Ref suffix for refs (e.g., audioRef, eventIndexRef)
- State values: camelCase (e.g., isPlaying, currentTime, scoreColor)
- Constants: UPPER_SNAKE_CASE (e.g., DEFAULT_BPM, WIDTH, OFFSET, Y_THRESHOLD)

**Types:**
- Interfaces: PascalCase with suffix (e.g., Props, Events, Store) (e.g., `MusicalEvent`, `InterpolatedEvent`, `SyncStore`)
- Type aliases: PascalCase (e.g., `BorderStyle`)

## Where to Add New Code

**New Feature (e.g., scoring system, playback modes):**
- Primary code: `src/components/` (UI) + `src/lib/` (logic)
- State: Add to `src/stores/syncStore.ts` if shared; use local useState if component-scoped
- Tests: Create in `src/__tests__/` (currently not present)

**New Component/Module:**
- Implementation: `src/components/` for UI components, `src/lib/` for utilities
- Exports: Export directly from file or via barrel file (none currently used)
- Props: Define Props interface at top of component file

**Utilities/Helpers:**
- Shared helpers: `src/lib/` as new .ts files
- Animation utilities: `src/lib/animationController.ts` or `src/lib/noteAnimation.ts`
- Validation: `src/lib/fileValidation.ts` or new validation file in `src/lib/`

**Styles:**
- Global: `src/index.css` (Tailwind imports and custom classes)
- Component-scoped: Inline className or \<style\> tags in components (RegularRenderer uses inline styles for SVG scope)

**Types:**
- Core domain types: `src/types/score.ts`
- Global augmentation: `src/types/global.d.ts`
- Local interfaces: Define in component file if not shared

## Special Directories

**dist/:**
- Purpose: Build output directory
- Generated: Yes (by `npm run build`)
- Committed: No (in .gitignore)

**node_modules/:**
- Purpose: Installed npm dependencies
- Generated: Yes (by `npm install`)
- Committed: No (in .gitignore)

**.planning/codebase/:**
- Purpose: Architecture and planning documents
- Generated: No (manually created)
- Committed: Yes
- Contains: ARCHITECTURE.md, STRUCTURE.md (this file), CONVENTIONS.md, TESTING.md, CONCERNS.md

## Architectural Patterns

**Component Organization:**
- Presentational components: `src/components/` (stateless or minimal state)
- Container components: App.tsx (orchestrates state and passes to children)
- Renderer components: `src/renderers/` (complex, side-effect-heavy)

**State Management:**
- Global: Zustand store (`src/stores/syncStore.ts`) for cross-component state
- Local: React hooks (useState, useRef) for component-level state
- Derived state: useEffect dependencies for recomputation

**Code Reuse:**
- Custom hooks: `src/hooks/useToast.ts` for shared stateful logic
- Utility functions: `src/lib/` for pure functions and algorithms
- Border components: Registry pattern in `src/borders/index.tsx` (getBorderComponent, getBorderHeight)

**Data Flow:**
- Top-down: App.tsx passes state via props to RegularRenderer, SyncEditor
- Bottom-up: Child callbacks invoke parent handlers (onMusicXMLUpload, onAudioUpload)
- Global: Zustand store for sync anchors (useSyncStore hook)

---

*Structure analysis: 2026-02-03*
