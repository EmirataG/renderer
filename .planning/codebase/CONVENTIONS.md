# Coding Conventions

**Analysis Date:** 2026-02-03

## Naming Patterns

**Files:**
- React components: PascalCase with `.tsx` extension (e.g., `App.tsx`, `UploadDropZone.tsx`, `BorderPicker.tsx`)
- Utilities/libraries: camelCase with `.ts` extension (e.g., `fileValidation.ts`, `interpolation.ts`, `noteAnimation.ts`)
- Type definitions: Named in files with `.ts` extension, often in dedicated `types/` directory (e.g., `types/score.ts`)
- Index files: `index.tsx` or `index.ts` for directory exports (e.g., `borders/index.tsx`)

**Functions:**
- React components: PascalCase (e.g., `RegularRenderer`, `UploadDropZone`, `BorderPicker`)
- Hooks: camelCase with `use` prefix (e.g., `useToast`, `useToastProvider`)
- Regular functions: camelCase (e.g., `validateFile`, `interpolateTimestamps`, `animateNoteheads`)
- Private/internal functions: camelCase, sometimes prefixed with underscore for DOM queries (e.g., `setDims`, `detectFileCategory`)

**Variables:**
- State variables: camelCase (e.g., `musicXMLFile`, `isValidating`, `scoreColor`, `debouncedScoreScale`)
- Type unions for state: camelCase (e.g., `'renderer' | 'sync'`)
- Constants: UPPER_SNAKE_CASE (e.g., `WIDTH`, `DEFAULT_BPM`, `SIZE_LIMITS`)
- Maps/collections: camelCase with semantic names (e.g., `anchors`, `anchorInfos`)

**Types:**
- Interfaces: PascalCase (e.g., `Props`, `SyncStore`, `ValidationResult`, `UploadDropZoneProps`)
- Type aliases: PascalCase (e.g., `FileCategory`, `BorderStyle`, `ToastType`)
- Generic parameters: Single uppercase letter or descriptive (e.g., `T`, `K`, `V`)

## Code Style

**Formatting:**
- No explicit linter or formatter configured (no eslint, prettier, or biome found)
- TypeScript strict mode enabled in `tsconfig.app.json`
- Tab/space convention: 2-space indentation observed throughout
- Line length: No explicit limit observed; lines up to ~80 characters typical for clarity

**Linting:**
- TypeScript compiler flags in use:
  - `strict: true` - Full strict type checking
  - `noUnusedLocals: false` - Allows unused variables
  - `noUnusedParameters: false` - Allows unused parameters
  - `noFallthroughCasesInSwitch: true` - Prevents switch fall-through
  - `noUncheckedSideEffectImports: true` - Warns about unchecked side-effect imports

**JSX Style:**
- Self-closing tags when component has no children (e.g., `<LoadingIcon className="..." />`)
- Inline conditional rendering with ternary operators and && operators
- Template literals for dynamic classNames, often with conditional CSS classes
- Comments inline with code: `// Comment describing next line or section`

## Import Organization

**Order:**
1. React/library imports (`import { useState } from "react"`)
2. Third-party library imports (`import { OpenSheetMusicDisplay } from "opensheetmusicdisplay"`)
3. Local type imports (`import type { MusicalEvent } from "../lib/getEvents"`)
4. Local component imports (`import RegularRenderer from "./renderers/RegularRenderer"`)
5. Local function/utility imports (`import { validateFile } from "../lib/fileValidation"`)
6. Style imports (`import './index.css'`)

**Path Aliases:**
- No aliases configured in tsconfig (moduleResolution: "bundler")
- Relative imports used throughout: `../`, `./`

## Error Handling

**Patterns:**
- Try-catch blocks with descriptive error messages for validation (e.g., `fileValidation.ts`, `musicxmlValidation.ts`)
- Error checking with optional chaining and nullish coalescing (e.g., `error?.message ?? String(error)`)
- Custom error categorization in catch blocks (e.g., checking error message strings for "parse", "XML", "render")
- Validation objects with `{ valid: boolean; error?: string; category?: T }` pattern
- Fallback error messages when specific error type cannot be determined
- Finally blocks used for cleanup (e.g., removing DOM elements, clearing OSMD instances)

**Toast notifications for user-facing errors:**
- Success messages: `showToast("Loaded ${file.name}", "success")`
- Error messages: `showToast("File is too large...", "error")`
- Info messages: `showToast("Validating MusicXML...", "info")`

## Logging

**Framework:** `console` (no dedicated logging library)

**Patterns:**
- No active logging in production code observed
- Comments used for developer documentation (e.g., "// Quick pre-flight check", "// Full OSMD validation")
- Comments explain "why" not "what" (e.g., "// Debounce scoreScale to avoid OSMD re-render on every slider tick")

## Comments

**When to Comment:**
- When non-obvious algorithm is used (e.g., interpolation logic, animation timing calculations)
- When explaining integration with complex libraries (e.g., OSMD specific code)
- When documenting state management or side effects (e.g., "// Get sync anchors from store")
- Section headers in large components (e.g., "/* File upload state */", "/* UPLOAD SECTION */")

**JSDoc/TSDoc:**
- Full JSDoc comments on exported utility functions (e.g., `interpolateTimestamps`, `validateMusicXML`)
- Includes: purpose, parameters, return type, behavior notes
- Example from `interpolation.ts`:
  ```typescript
  /**
   * Interpolates timestamps for musical events based on user-set anchor points.
   * @param events - Array of musical events sorted by beatOnset
   * @param anchors - Map of event IDs to their user-set timestamps
   * @returns Array of events with computed timestamps and anchor flags
   */
  ```

## Function Design

**Size:**
- Components: typically 100-300 lines (e.g., `App.tsx` is 595 lines, large due to UI state)
- Utilities: typically 20-80 lines
- No single function should handle multiple unrelated concerns

**Parameters:**
- Props interfaces used for component parameters
- Named parameters over positional for functions with multiple arguments
- Optional parameters marked with `?` in interfaces and function signatures
- Default values provided in function signatures (e.g., `bpm = 20, fps = 60`)

**Return Values:**
- Functions return specific types, never implicit `any`
- Validation functions return objects with `{ valid: boolean; error?: string; ... }`
- Async functions clearly marked with `async` keyword
- Callback functions use `useCallback` hook to memoize and prevent unnecessary re-renders

## Module Design

**Exports:**
- Named exports for utilities: `export function validateFile(file: File)`
- Named exports for types: `export interface ValidationResult`
- Default exports for React components: `export default function App()`
- Type-only imports: `import type { MusicalEvent }`

**Barrel Files:**
- Used in `borders/index.tsx`: exports `BorderStyle`, `BorderProps`, and all border components
- Simplifies imports: `import { BorderStyle, getBorderComponent } from "../borders"`
- Not used uniformly across all directories (optional pattern)

## State Management

**React Hooks:**
- `useState` for local component state
- `useRef` for DOM references and non-state mutable values
- `useCallback` for memoizing event handlers to prevent unnecessary re-renders
- `useEffect` for side effects (subscriptions, DOM manipulation, debouncing)

**Zustand Store:**
- Global state in `stores/syncStore.ts`
- Immutable update pattern with Map copying: `new Map(state.anchors)`
- Selectors used to extract needed state: `const { anchors } = useSyncStore()`

## TypeScript Conventions

**Type Annotations:**
- Always explicitly type function parameters and return values
- Use `null` for intentional absence, `undefined` for optional
- Use `type` for union types and `interface` for objects with structure
- Generic types for reusable data structures

**Casting:**
- Type assertions with `as` keyword only when necessary (e.g., `error instanceof Error`)
- Non-null assertion (`!`) used sparingly: `document.getElementById('root')!`

---

*Convention analysis: 2026-02-03*
