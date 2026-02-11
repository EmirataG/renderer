# Phase 22: Next.js Scaffold & Migration - Research

**Researched:** 2026-02-11
**Domain:** Vite SPA to Next.js 16 App Router migration with Verovio WASM preservation
**Confidence:** HIGH

## Summary

This phase migrates the Manuscript Renderer from a Vite SPA to Next.js 16 App Router while preserving all existing editor functionality. The migration is architecturally a **framework swap** -- no new features, no Firebase, no auth. Every existing component remains a client component wrapped in a single `dynamic({ ssr: false })` boundary.

The critical technical risk is Verovio WASM compatibility with Next.js/Turbopack. Analysis of the verovio npm package (v6.0.1) reveals that `verovio/wasm` is a 6.4MB self-contained Emscripten module with the WASM binary **embedded inline as base64** in the JavaScript file. It does NOT use a separate `.wasm` file. This means Turbopack's documented WASM limitations (no direct `.wasm` imports) likely do NOT apply -- Turbopack treats verovio-module.mjs as a regular JavaScript module. However, the module does use `import.meta.url` for path resolution and conditionally imports `node:module`, `node:fs`, and `node:url` in Node.js environments, which could cause issues during SSR. The `dynamic({ ssr: false })` pattern completely prevents server-side evaluation, eliminating this risk.

The migration follows the official Next.js Vite migration guide exactly: catch-all `[[...slug]]` route wrapping the entire existing SPA in a client-only dynamic import, then clean up Vite artifacts. The export service (separate Fastify process) stays untouched -- only `import.meta.env.DEV` references in the frontend need updating.

**Primary recommendation:** Follow the official Next.js Vite migration guide step-by-step. Use the `[[...slug]]` catch-all SPA pattern with `dynamic({ ssr: false })` wrapping the entire App component. Do NOT attempt to split into server/client components in this phase. Do NOT add Firebase or new features. Validate Verovio WASM loads and renders correctly before declaring success.

## Standard Stack

### Core (Phase 22 Only)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | ^16.1.x | Framework replacing Vite | Current stable. Turbopack default bundler. App Router. |
| react | ^19.1.x | UI library (already installed) | Ships with Next.js 16. Already at 19.1.1 in project. |
| react-dom | ^19.1.x | DOM rendering (already installed) | Ships with Next.js 16. Already at 19.1.1. |
| typescript | ~5.9.x | Type safety (already installed) | Already at 5.9.3. Next.js 16 requires >=5.1. |
| tailwindcss | ^4.x | Styling (already installed) | Already at 4.1.16. PostCSS config carries over. |

### Retained (Zero Changes)

| Library | Version | Purpose | Migration Impact |
|---------|---------|---------|-----------------|
| verovio | ^6.0.1 | MusicXML WASM rendering | None. Wrapped in ssr:false boundary. |
| zustand | ^5.0.10 | Client state management | None. Global store pattern stays. |
| react-rnd | ^10.5.2 | Drag/resize UI | None. Client-only. |
| react-zoom-pan-pinch | ^3.7.0 | Pan/zoom for score preview | None. Client-only. |

### Removed (Vite-Specific)

| Library | Why Removed |
|---------|------------|
| vite | Replaced by Next.js/Turbopack |
| @vitejs/plugin-react | Next.js has built-in React support |
| vite-plugin-wasm | Not needed -- verovio embeds WASM inline, loaded only client-side |
| vite-plugin-top-level-await | Not needed -- async WASM init happens in useEffect |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Turbopack (default) | `next dev --webpack` / `next build --webpack` | Webpack has proven WASM support via asyncWebAssembly experiment. Use as escape hatch ONLY if Turbopack fails with verovio. |
| `output: 'export'` (static SPA) | Default SSR mode | Static export means no future server features. Start without `output: 'export'` to allow progressive adoption of server components in later phases. |

**Installation:**
```bash
# Install Next.js (react and react-dom already installed)
npm install next@latest

# Update TypeScript types for Next.js
npm install -D @types/react@latest @types/react-dom@latest

# Remove Vite-specific packages
npm uninstall vite @vitejs/plugin-react vite-plugin-wasm vite-plugin-top-level-await
```

## Architecture Patterns

### Migration Strategy: SPA-First, Minimal Changes

The official Next.js Vite migration guide recommends keeping the app as a purely client-side SPA initially, then progressively adding server features. Phase 22 follows this exactly.

### Recommended Project Structure After Migration

```
src/
  app/                          # NEW: Next.js App Router
    layout.tsx                  # NEW: Root layout (RSC) - HTML shell, CSS import
    [[...slug]]/                # NEW: Catch-all SPA route
      page.tsx                  # NEW: Server Component shell
      client.tsx                # NEW: Client boundary with dynamic import
  components/                   # MOVED from src/ root (optional, for clarity)
    App.tsx                     # UNCHANGED (existing editor)
    SyncEditor.tsx              # UNCHANGED
    ScoreRegionEditor.tsx       # UNCHANGED
    UploadDropZone.tsx          # UNCHANGED
    BorderPicker.tsx            # UNCHANGED
    TimestampInput.tsx          # UNCHANGED
    Toast.tsx                   # UNCHANGED
  renderers/                    # UNCHANGED location
    RegularRenderer.tsx         # UNCHANGED
    SingleLineRenderer.tsx      # UNCHANGED
  RenderApp.tsx                 # UNCHANGED (export service entry)
  hooks/                        # UNCHANGED
    useVerovio.ts               # UNCHANGED
    useSingleLineVerovio.ts     # UNCHANGED
    useToast.ts                 # UNCHANGED
  stores/                       # UNCHANGED
    syncStore.ts                # UNCHANGED
    eventStore.ts               # UNCHANGED
  lib/                          # UNCHANGED
    verovioService.ts           # UNCHANGED
    exportClient.ts             # MODIFIED: import.meta.env -> process.env
    animationController.ts      # UNCHANGED
    noteAnimation.ts            # UNCHANGED
    getEvents.ts                # UNCHANGED
    interpolation.ts            # UNCHANGED
    fileValidation.ts           # UNCHANGED
    musicxmlValidation.ts       # UNCHANGED
  borders/                      # UNCHANGED
    index.tsx                   # UNCHANGED
  types/                        # MODIFIED
    score.ts                    # UNCHANGED
    global.d.ts                 # UNCHANGED
    verovio-augments.d.ts       # UNCHANGED
  index.css                     # UNCHANGED (Tailwind entry)
next.config.ts                  # NEW (replaces vite.config.ts)
postcss.config.js               # UNCHANGED (already configured for Tailwind 4)
tsconfig.json                   # MODIFIED (Next.js compatibility)
```

### Pattern 1: Catch-All SPA Route with Client-Only Boundary

**What:** A `[[...slug]]` directory catches all routes and renders the entire existing app inside a `dynamic({ ssr: false })` wrapper.
**When:** Phase 22 only. Later phases replace this with real routing.
**Why:** Minimizes migration risk. The existing app runs EXACTLY as before -- just under Next.js instead of Vite.

```typescript
// src/app/[[...slug]]/page.tsx (Server Component)
import { ClientOnly } from './client';

export function generateStaticParams() {
  return [{ slug: [''] }];
}

export default function Page() {
  return <ClientOnly />;
}
```

```typescript
// src/app/[[...slug]]/client.tsx (Client Component)
'use client';

import dynamic from 'next/dynamic';

const App = dynamic(() => import('../../App'), { ssr: false });

export function ClientOnly() {
  return <App />;
}
```

**Source:** [Next.js Official Vite Migration Guide](https://nextjs.org/docs/app/guides/migrating/from-vite)

### Pattern 2: Root Layout Replacing index.html

**What:** The root `layout.tsx` replaces `index.html` as the HTML shell.
**When:** Always.

```typescript
// src/app/layout.tsx (Server Component)
import type { Metadata } from 'next';
import '../index.css';

export const metadata: Metadata = {
  title: 'Manuscript Renderer',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div id="root">{children}</div>
      </body>
    </html>
  );
}
```

**Source:** [Next.js Official Vite Migration Guide](https://nextjs.org/docs/app/guides/migrating/from-vite)

### Pattern 3: RenderApp Route for Export Service

**What:** The export service uses Puppeteer to load `RenderApp.tsx` via a special URL. This must continue working under Next.js.
**When:** The export service navigates to the app URL with `window.__EXPORT_CONFIG__` set.
**Why:** `main.tsx` currently checks `window.__EXPORT_CONFIG__` and loads either `App` or `RenderApp`. This routing logic must be preserved.

**Option A (recommended):** Create a dedicated `/render` route:
```typescript
// src/app/render/page.tsx
import { RenderClient } from './client';

export default function RenderPage() {
  return <RenderClient />;
}
```

```typescript
// src/app/render/client.tsx
'use client';

import dynamic from 'next/dynamic';

const RenderApp = dynamic(() => import('../../RenderApp'), { ssr: false });

export function RenderClient() {
  return <RenderApp />;
}
```

Then update the export service to navigate to `/render` instead of `/?render=true`.

**Option B (compatible):** Keep the `[[...slug]]` catch-all and check for `__EXPORT_CONFIG__` client-side:
```typescript
// src/app/[[...slug]]/client.tsx
'use client';

import dynamic from 'next/dynamic';

const App = dynamic(() => import('../../App'), { ssr: false });
const RenderApp = dynamic(() => import('../../RenderApp'), { ssr: false });

export function ClientOnly() {
  if (typeof window !== 'undefined' && window.__EXPORT_CONFIG__) {
    return <RenderApp />;
  }
  return <App />;
}
```

### Pattern 4: Environment Variable Migration

**What:** Replace all `import.meta.env` references with Next.js equivalents.
**When:** During migration.

| Vite | Next.js | Locations |
|------|---------|-----------|
| `import.meta.env.DEV` | `process.env.NODE_ENV !== 'production'` | App.tsx lines 185, 198, 255 |
| `import.meta.env.PROD` | `process.env.NODE_ENV === 'production'` | (none currently) |
| `import.meta.env.SSR` | `typeof window === 'undefined'` | (none currently) |

**Source:** [Next.js Official Vite Migration Guide, Step 7](https://nextjs.org/docs/app/guides/migrating/from-vite)

### Anti-Patterns to Avoid

- **Splitting into server/client components prematurely:** Phase 22 keeps everything client-side. Do NOT try to make anything a Server Component yet. That is for later phases.
- **Adding `output: 'export'` to next.config:** This locks out all future server features. We want the option to add API routes and server components in later phases.
- **Configuring webpack WASM experiments unnecessarily:** Verovio's WASM is embedded in JavaScript, not a separate `.wasm` file. The `asyncWebAssembly` webpack experiment is NOT needed unless there are other WASM modules.
- **Removing `postcss.config.js`:** Next.js reads this file automatically. The existing `@tailwindcss/postcss` plugin configuration works as-is.
- **Using `ssr: false` directly in a Server Component:** This throws an error. The `dynamic({ ssr: false })` call MUST be in a file marked `'use client'`. This is why we have `client.tsx` as a separate file.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SPA catch-all routing | Custom router logic | `[[...slug]]` directory convention | Official Next.js pattern, zero config |
| HTML shell | Manual `<html>` injection | `layout.tsx` + Metadata API | Next.js handles charset, viewport, doctype |
| CSS import chain | Custom PostCSS setup | Import `index.css` in layout.tsx | Next.js reads postcss.config.js automatically |
| Dev server | Custom dev script | `next dev` | Turbopack HMR built-in, much faster than Vite for large apps |
| Build pipeline | Custom build script | `next build` | Handles code splitting, optimization automatically |
| TypeScript compilation | Separate `tsc -b` step | Next.js built-in TS | Next.js compiles TS during build (no separate tsc step needed) |

## Common Pitfalls

### Pitfall 1: `ssr: false` Used in Server Component

**What goes wrong:** Using `dynamic(() => import('./Comp'), { ssr: false })` directly in a `page.tsx` (Server Component) throws: "ssr: false is not allowed with next/dynamic in Server Components."
**Why it happens:** `page.tsx` files are Server Components by default. The `ssr: false` option is only valid in Client Components.
**How to avoid:** Always create a separate `client.tsx` file with `'use client'` directive that contains the dynamic import. Import that client component from `page.tsx`.
**Warning signs:** Build error mentioning "ssr: false is not allowed in Server Components"
**Source:** [Next.js Lazy Loading Docs](https://nextjs.org/docs/app/guides/lazy-loading) -- "ssr: false option is not supported in Server Components."

### Pitfall 2: Verovio WASM Evaluated During SSR

**What goes wrong:** If the App component tree is NOT wrapped in `dynamic({ ssr: false })`, Next.js attempts to prerender it on the server. `verovioService.ts` imports `verovio/wasm` which detects Node.js environment and tries to resolve the WASM binary via `import.meta.url` + `node:fs`. Path resolution fails or Emscripten's Node.js code path produces errors.
**Why it happens:** Client Components (`'use client'`) are still prerendered on the server by default. `'use client'` does NOT mean "client-only" -- it means "this can use hooks."
**How to avoid:** Use `dynamic({ ssr: false })` for the entire App component tree. This completely prevents server-side evaluation of verovio.
**Warning signs:** Errors containing "failed to asynchronously prepare wasm", "Cannot find module 'node:fs'", or path resolution errors during `next build`.

### Pitfall 3: `import.meta.env` References Break Build

**What goes wrong:** `import.meta.env.DEV` is Vite-specific. Next.js does not support `import.meta.env`. TypeScript compilation fails with "Property 'env' does not exist on type 'ImportMeta'."
**Why it happens:** Three locations in App.tsx reference `import.meta.env.DEV`.
**How to avoid:** Global find-and-replace before first build:
  - `import.meta.env.DEV` -> `process.env.NODE_ENV !== 'production'`
  - Remove `vite-env.d.ts` (provides the `ImportMeta` type augmentation for Vite)
**Warning signs:** TypeScript errors during `next build`.

### Pitfall 4: Vite Type References Cause TS Errors

**What goes wrong:** `src/vite-env.d.ts` contains `/// <reference types="vite/client" />` which provides Vite-specific type augmentations. After removing Vite, this file references a nonexistent package, causing TypeScript errors.
**Why it happens:** The file is a Vite convention for ambient type declarations.
**How to avoid:** Delete `src/vite-env.d.ts`. Next.js auto-generates `next-env.d.ts` at the project root which provides its own type augmentations.
**Warning signs:** "Cannot find type definition file for 'vite/client'"

### Pitfall 5: tsconfig.json Incompatible with Next.js

**What goes wrong:** The current `tsconfig.json` uses a project reference to `tsconfig.app.json` which is a Vite convention. Next.js requires specific compiler options including `{ "name": "next" }` plugin, `esModuleInterop: true`, `incremental: true`, and paths in the `include` array for Next.js generated types.
**Why it happens:** Vite and Next.js have different TypeScript configuration expectations.
**How to avoid:** Follow the official migration guide's tsconfig changes exactly. Merge `tsconfig.app.json` settings into `tsconfig.json` and remove the project reference structure.
**Warning signs:** Various TypeScript compilation errors during `next build`.

### Pitfall 6: Export Service Cannot Find RenderApp After Migration

**What goes wrong:** The export service (Puppeteer) navigates to the app URL and expects `window.__EXPORT_CONFIG__` to trigger `RenderApp`. After migration, `main.tsx` no longer exists -- the routing logic that checked `__EXPORT_CONFIG__` is gone.
**Why it happens:** `main.tsx` is deleted as part of the Vite cleanup. The conditional `if (exportConfig) RenderApp else App` logic must be preserved somewhere.
**How to avoid:** Either create a dedicated `/render` route that always loads RenderApp, or add the `__EXPORT_CONFIG__` check in the catch-all client component.
**Warning signs:** Export service produces blank or broken exports after migration.

### Pitfall 7: Dev Port Conflict with Export Service

**What goes wrong:** Next.js dev server defaults to port 3000. The Fastify export service runs on port 3001. The current App.tsx hardcodes `localhost:3001` for the export service URL. If the port allocation changes or is misconfigured, export fails.
**Why it happens:** Port allocation is implicit, not documented.
**How to avoid:** Keep Next.js on 3000 (default) and export service on 3001 (existing). The `import.meta.env.DEV` -> `process.env.NODE_ENV` change handles the URL correctly since the hardcoded `localhost:3001` pattern stays the same.
**Warning signs:** Export service connection refused errors.

## Code Examples

### next.config.ts (Minimal for Phase 22)

```typescript
// Source: Derived from Next.js official Vite migration guide
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // No output: 'export' -- we want the ability to add server features later
  // Turbopack is default in Next.js 16 -- no explicit config needed
  // No webpack WASM config needed -- verovio embeds WASM inline in JS
};

export default nextConfig;
```

### tsconfig.json (After Migration)

```json
// Source: Next.js official Vite migration guide + existing tsconfig.app.json settings
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true,
    "allowJs": true,
    "forceConsistentCasingInFileNames": true,
    "incremental": true,
    "plugins": [{ "name": "next" }]
  },
  "include": ["src", ".next/types/**/*.ts", "next-env.d.ts"],
  "exclude": ["node_modules"]
}
```

### package.json Scripts (After Migration)

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  }
}
```

### Environment Variable Replacement (App.tsx)

```typescript
// BEFORE (3 locations in App.tsx)
const backendUrl = import.meta.env.DEV ? 'http://localhost:3001' : '';
const wsBase = import.meta.env.DEV ? 'ws://localhost:3001' : `${wsProtocol}//${window.location.host}`;
const base = import.meta.env.DEV ? 'http://localhost:3001' : '';

// AFTER
const backendUrl = process.env.NODE_ENV !== 'production' ? 'http://localhost:3001' : '';
const wsBase = process.env.NODE_ENV !== 'production' ? 'ws://localhost:3001' : `${wsProtocol}//${window.location.host}`;
const base = process.env.NODE_ENV !== 'production' ? 'http://localhost:3001' : '';
```

## State of the Art

| Old Approach (Vite) | Current Approach (Next.js 16) | Impact on This Migration |
|---------------------|-------------------------------|--------------------------|
| `vite.config.ts` with plugins | `next.config.ts` with Turbopack | Remove 3 Vite plugins, minimal next.config |
| `index.html` as entry point | `app/layout.tsx` as root layout | HTML shell moves to React component |
| `main.tsx` with `createRoot` | `app/page.tsx` + App Router | Entry point is automatic, no manual `createRoot` |
| `import.meta.env.DEV` | `process.env.NODE_ENV !== 'production'` | 3 replacements in App.tsx |
| `vite-plugin-wasm` for WASM | Not needed (verovio embeds WASM in JS) | Remove plugin, no replacement needed |
| `middleware.ts` for route guards | `proxy.ts` (renamed in Next.js 16) | Not needed in Phase 22, relevant for later auth phases |
| Webpack asyncWebAssembly experiment | Turbopack default bundler | Turbopack handles JS modules fine; verovio is just a large JS module |

**Key insight for this migration:** Verovio v6.0.1 ships `verovio/wasm` as `verovio-module.mjs` -- a 6.4MB JavaScript file with the WASM binary embedded as base64 inside the JavaScript. This means:
1. No separate `.wasm` file for bundlers to handle
2. No webpack `asyncWebAssembly` experiment needed
3. Turbopack treats it as a regular (large) JavaScript module
4. The only requirement is that it runs in the browser (handled by `ssr: false`)

## Open Questions

1. **Turbopack Performance with 6.4MB Module**
   - What we know: Turbopack handles regular JavaScript imports. Verovio is a 6.4MB JS file.
   - What's unclear: Will Turbopack's dev server handle this large module efficiently, or will HMR/page loads be slow?
   - Recommendation: Test during implementation. If slow, consider if Turbopack code-splits the module automatically. Worst case, Turbopack still works -- just slower than ideal.

2. **RenderApp Route Strategy**
   - What we know: The export service needs `RenderApp` accessible via a URL. Currently `main.tsx` conditionally loads it based on `window.__EXPORT_CONFIG__`.
   - What's unclear: Does the export service need to be updated to navigate to a different URL path?
   - Recommendation: Create a `/render` route (simplest, cleanest). Update export service's Puppeteer navigation URL if needed. OR keep the catch-all with a client-side check for `__EXPORT_CONFIG__` to avoid touching the export service at all.

3. **Production Build Hosting**
   - What we know: The current Vite build produces static files. Next.js without `output: 'export'` requires a Node.js server.
   - What's unclear: Where will this be hosted? Vercel? Self-hosted?
   - Recommendation: This is a later-phase decision. For Phase 22, just verify `next dev` and `next build` both work. Production hosting is out of scope.

4. **Tailwind CSS v4 + Next.js PostCSS Integration**
   - What we know: The existing `postcss.config.js` uses `@tailwindcss/postcss`. Next.js reads PostCSS config automatically.
   - What's unclear: Does Next.js 16 + Turbopack fully support Tailwind CSS v4's PostCSS plugin? (Tailwind v4 is CSS-first, not config-file-first.)
   - Recommendation: Test during implementation. The existing setup should work since Next.js reads `postcss.config.js`. If issues arise, Tailwind v4 also supports `@import "tailwindcss"` directly in CSS which Next.js handles natively.

## Sources

### Primary (HIGH confidence)
- [Next.js Official Vite Migration Guide](https://nextjs.org/docs/app/guides/migrating/from-vite) -- Step-by-step migration, `[[...slug]]` catch-all, `dynamic({ ssr: false })`, environment variable mapping, TypeScript config
- [Next.js Lazy Loading / next/dynamic Docs](https://nextjs.org/docs/app/guides/lazy-loading) -- Confirms `ssr: false` NOT allowed in Server Components, must be in Client Component
- [Next.js SPA Guide](https://nextjs.org/docs/app/guides/single-page-applications) -- SPA patterns, `dynamic(() => import('./component'), { ssr: false })` for browser-only components
- [Next.js proxy.ts File Convention](https://nextjs.org/docs/app/api-reference/file-conventions/proxy) -- Replaces middleware.ts in v16, Node.js runtime, cookie/header manipulation
- [Next.js Turbopack Config](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack) -- Turbopack options, rules, resolveAlias, supported loaders
- Codebase analysis: `verovio/dist/verovio-module.mjs` (6.4MB inline WASM), `App.tsx`, `main.tsx`, `verovioService.ts`, `exportClient.ts`, `syncStore.ts`, `RenderApp.tsx`, `vite.config.ts`, `postcss.config.js`, `tsconfig.app.json`

### Secondary (MEDIUM confidence)
- [Turbopack WASM Issue #84972](https://github.com/vercel/next.js/issues/84972) -- Closed, confirms Turbopack handles WASM with correct patterns
- [Turbopack WASM Discussion #75430](https://github.com/vercel/next.js/discussions/75430) -- Community discussion on WASM file loading approaches
- [Next.js 16 Release Blog](https://nextjs.org/blog/next-16) -- Turbopack stable, proxy.ts, React 19.2
- Existing project research: `.planning/research/STACK.md`, `ARCHITECTURE-nextjs-firebase.md`, `PITFALLS-nextjs-firebase.md`

### Tertiary (LOW confidence)
- [Resolving WASM Module Loading in Turbopack](https://codenote.net/en/posts/resolve-wasm-module-turbopack-nextjs-vercel/) -- Server-side WASM patterns (less relevant since we use ssr: false)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Next.js 16 migration is well-documented officially, versions verified
- Architecture: HIGH -- Official migration guide provides exact patterns, verovio WASM loading mechanism verified by reading source
- Pitfalls: HIGH -- `ssr: false` constraint confirmed in official docs, `import.meta.env` locations identified precisely, RenderApp export service dependency mapped
- WASM compatibility: MEDIUM -- Verovio's inline WASM approach theoretically avoids Turbopack limitations, but not tested in practice with this specific library

**Research date:** 2026-02-11
**Valid until:** 2026-03-11 (stable -- Next.js 16 is current, verovio 6.0.1 is current)
