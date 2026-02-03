# Testing Patterns

**Analysis Date:** 2026-02-03

## Test Framework

**Not Detected**

- **No test runner configured**: No Jest, Vitest, or other test framework found in `package.json`
- **No test files**: No `.test.*` or `.spec.*` files found in codebase
- **No test configuration**: No `jest.config.*`, `vitest.config.*`, or similar files
- **Build setup**: TypeScript compilation only (`tsc -b && vite build`)

## Recommendations for Adding Tests

Given the current tech stack, recommended setup:

**Option 1 - Vitest (Recommended):**
- Aligns with Vite (already in use for build)
- Modern, fast, built for ES modules
- Easy setup: `npm install -D vitest @vitest/ui`
- Create `vitest.config.ts`:
  ```typescript
  import { defineConfig } from 'vitest/config'
  import react from '@vitejs/plugin-react'

  export default defineConfig({
    plugins: [react()],
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: [],
    },
  })
  ```

**Option 2 - Jest with React Testing Library:**
- Industry standard for React applications
- Mature ecosystem with extensive tooling
- Requires additional configuration for ES modules and JSX

## Test File Organization (Recommended Structure)

**Location:** Co-located with source files

**Pattern:**
```
src/
  components/
    UploadDropZone.tsx
    UploadDropZone.test.tsx
  lib/
    fileValidation.ts
    fileValidation.test.ts
  stores/
    syncStore.ts
    syncStore.test.ts
```

**Benefits:**
- Easy to locate tests for specific modules
- Clear relationship between source and test files
- Simpler imports (same relative paths)

## What Needs Testing (Priority Order)

### High Priority (Core Functionality)

**File Validation (`src/lib/fileValidation.ts`):**
- Test `validateFile()` with various file types and sizes
- Test size limit enforcement (10MB MusicXML, 50MB audio, 5MB image)
- Test extension detection fallback to MIME type
- Test error message clarity for different failure scenarios

**MusicXML Validation (`src/lib/musicxmlValidation.ts`):**
- Test `validateMusicXML()` with valid MusicXML documents
- Test error handling for malformed XML
- Test error handling for valid XML but invalid MusicXML
- Test `isLikelyMusicXML()` quick checks
- Test measure counting accuracy

**Timestamp Interpolation (`src/lib/interpolation.ts`):**
- Test with no anchors (all events get timestamp 0)
- Test with single anchor (extrapolation using DEFAULT_BPM)
- Test with multiple anchors (linear interpolation between, extrapolation outside)
- Test edge cases (events before first anchor, after last anchor)
- Test beats-per-second calculation accuracy

**State Management (`src/stores/syncStore.ts`):**
- Test `setAnchor()` and `removeAnchor()` operations
- Test `clearAllAnchors()` clears all entries
- Test `selectEvent()` for event selection
- Test immutability (new Map instances, no mutations)

### Medium Priority (Features)

**Upload Component (`src/components/UploadDropZone.tsx`):**
- Test drag-over detection and visual feedback
- Test file drop handling with multiple files
- Test file input change handling
- Test validation flow (invalid → error toast, valid → success toast)
- Test file removal for audio and image files

**Toast System (`src/hooks/useToast.ts`, `src/components/Toast.tsx`):**
- Test toast creation with different types (error, success, info)
- Test auto-dismiss after 4 seconds
- Test manual dismiss
- Test context provider setup
- Test error when used without provider

### Lower Priority (Integrations)

**Animation Functions (`src/lib/noteAnimation.ts`):**
- Test notehead scaling animation application
- Test color override application
- Test animation reset functionality
- Test with missing DOM elements (graceful handling)

**Border Components (`src/borders/index.tsx`):**
- Test each border style renders correctly
- Test color prop passes through to SVG
- Test BorderPicker component selection state

## Current Testing Gaps

**100% of codebase untested:**
- No unit tests for utilities
- No integration tests for workflows (upload → validate → render)
- No component tests for UI behavior
- No E2E tests for full application flow

**High-risk untested areas:**
1. File validation edge cases (malicious files, corrupted files)
2. MusicXML rendering with various score formats
3. Audio/video sync timing accuracy
4. Animation performance with large scores
5. State synchronization between components

## Testing Strategy

**Recommended approach:**

1. **Phase 1 (Immediate):** Unit tests for validation functions
   - `fileValidation.test.ts` - 15-20 test cases
   - `musicxmlValidation.test.ts` - 10-15 test cases
   - `interpolation.test.ts` - 10-15 test cases
   - Estimated: 1-2 hours

2. **Phase 2 (Important):** Component tests
   - `UploadDropZone.test.tsx` - 10-15 test cases
   - `Toast.test.tsx` - 5-8 test cases
   - `BorderPicker.test.tsx` - 5-8 test cases
   - Estimated: 2-3 hours

3. **Phase 3 (Valuable):** Integration tests
   - File upload → validation → state update flow
   - Sync anchor setting → timestamp interpolation flow
   - Estimated: 3-4 hours

4. **Phase 4 (E2E):** User workflows
   - Upload MusicXML → render score
   - Upload audio → sync with score
   - Apply visual effects
   - Estimated: 4-5 hours

## Test Data and Fixtures

**Recommended fixtures location:** `src/__tests__/fixtures/`

**Needed fixtures:**

```typescript
// Valid MusicXML files (various complexities)
export const SIMPLE_MUSICXML = '<?xml version="1.0"?>...'
export const COMPLEX_MUSICXML = '<?xml version="1.0"?>...'

// Invalid test files
export const INVALID_XML = '<invalid>not musicxml</invalid>'
export const EMPTY_STRING = ''

// Mock files
export function createMockFile(
  name: string,
  size: number,
  type: string
): File

// Mock OSMD instances
export function createMockOSMD(): Partial<OpenSheetMusicDisplay>
```

## Testing Patterns (When Implemented)

### Utility Function Tests

```typescript
// Pattern from fileValidation testing
import { validateFile, detectFileCategory } from '../fileValidation'

describe('fileValidation', () => {
  describe('validateFile', () => {
    it('accepts valid XML files', () => {
      const file = new File(['<xml/>'], 'test.xml', { type: 'application/xml' })
      const result = validateFile(file)
      expect(result.valid).toBe(true)
      expect(result.category).toBe('musicxml')
    })

    it('rejects files exceeding size limit', () => {
      const largeData = new ArrayBuffer(11 * 1024 * 1024)
      const file = new File([largeData], 'large.xml', { type: 'application/xml' })
      const result = validateFile(file)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('too large')
    })
  })
})
```

### Component Tests

```typescript
// Pattern for UploadDropZone testing
import { render, screen, fireEvent } from '@testing-library/react'
import { UploadDropZone } from '../UploadDropZone'

describe('UploadDropZone', () => {
  it('shows loading state during validation', async () => {
    const { rerender } = render(<UploadDropZone ... />)

    const input = screen.getByRole('button')
    fireEvent.drop(input, { dataTransfer: { files: [validFile] } })

    expect(screen.getByText(/Validating/i)).toBeInTheDocument()
  })
})
```

### Async Function Tests

```typescript
// Pattern for async validation testing
describe('validateMusicXML', () => {
  it('returns measure count for valid MusicXML', async () => {
    const result = await validateMusicXML(VALID_MUSICXML)
    expect(result.valid).toBe(true)
    expect(result.measureCount).toBeGreaterThan(0)
  })

  it('cleans up DOM after validation', async () => {
    const initialChildCount = document.body.children.length
    await validateMusicXML(INVALID_MUSICXML).catch(() => {})
    expect(document.body.children.length).toBe(initialChildCount)
  })
})
```

### Store Tests

```typescript
// Pattern for Zustand store testing
describe('syncStore', () => {
  it('sets anchor and updates anchors map', () => {
    const { result } = renderHook(() => useSyncStore())

    act(() => {
      result.current.setAnchor('event1', 2.5)
    })

    expect(result.current.anchors.get('event1')).toBe(2.5)
  })

  it('removes anchor from map', () => {
    const { result } = renderHook(() => useSyncStore())

    act(() => {
      result.current.setAnchor('event1', 2.5)
      result.current.removeAnchor('event1')
    })

    expect(result.current.anchors.has('event1')).toBe(false)
  })
})
```

## Coverage Goals (Recommended)

- **Utilities**: 90%+ (strict - these are pure functions)
- **Components**: 70%+ (interactive behavior, not UI details)
- **Stores**: 95%+ (state management must be reliable)
- **Integrations**: 60%+ (end-to-end flows)
- **Overall target**: 75%+

---

*Testing analysis: 2026-02-03*
