# Research Summary: Next.js Migration + Firebase Backend

**Domain:** Full-stack migration of browser-based MusicXML score renderer from Vite SPA to Next.js with Firebase
**Researched:** 2026-02-11
**Overall confidence:** HIGH

## Executive Summary

Migrating Manuscript Renderer from a Vite SPA to Next.js 16 with Firebase backend is a well-supported path with no blocking technical risks. The project already uses React 19, TypeScript 5.9, Tailwind CSS 4, and Zustand 5 -- all of which work unchanged in Next.js 16. The critical technical challenge is Verovio's WASM module, which must remain client-only. This is solved cleanly with `'use client'` + `dynamic({ ssr: false })`, requiring zero changes to the existing verovioService.ts.

Next.js 16 (released October 2025) is the current stable version, featuring Turbopack as the default bundler, React 19.2 integration, and a new `proxy.ts` file (renamed from middleware.ts) for request interception. The App Router is the recommended pattern, with Pages Router receiving no new features. For this project, the App Router's server components are valuable for the dashboard (server-side Firestore queries) while the editor page is entirely client-rendered.

Firebase provides all three backend services needed: Authentication (Google sign-in), Firestore (project data + auto-save), and Storage (MusicXML, audio, background images). The recommended auth pattern uses Firebase Auth directly with httpOnly session cookies -- this is the exact approach documented in Firebase's official Next.js codelab. The auto-save implementation uses Zustand store subscriptions with debounced Firestore writes (1500ms) via the use-debounce library. This avoids adding heavy dependencies like React Query or react-firebase-hooks (unmaintained for 3+ years).

The export service (Fastify + Puppeteer) remains separate and independent. It does not need to migrate to Next.js -- it continues running as a standalone service. The Next.js app communicates with it via HTTP/WebSocket as it does today.

## Key Findings

**Stack:** Next.js 16.1 + Firebase SDK 12.9 + firebase-admin 13.6 + use-debounce 10.1. Three new production dependencies total.
**Architecture:** App Router with server components for dashboard, client-only boundary for entire editor/renderer, proxy.ts for auth guards, httpOnly session cookies for auth state.
**Critical pitfall:** Verovio WASM must never execute server-side. The `dynamic({ ssr: false })` pattern is required -- forgetting this causes build failures or runtime crashes.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Next.js Scaffold + Vite Migration** - Set up Next.js 16 project structure, move existing components into App Router layout, verify Verovio WASM works with Turbopack.
   - Addresses: Framework migration, WASM compatibility validation
   - Avoids: Building features on an untested foundation
   - Note: This phase has the highest uncertainty (Turbopack + WASM interaction). Must validate early.

2. **Firebase Auth + Session Management** - Implement Google sign-in, session cookie flow, proxy.ts auth guard, login page.
   - Addresses: Authentication, route protection
   - Avoids: Building data features without user identity

3. **Firestore Data Model + Project CRUD** - Create Firestore schema, project creation, project list dashboard.
   - Addresses: Project persistence, dashboard UI
   - Avoids: Coupling storage to unvalidated auth

4. **Firebase Storage + File Upload Migration** - Migrate file uploads from local blob URLs to Firebase Storage, store download URLs in Firestore.
   - Addresses: File persistence across sessions, shareable URLs
   - Avoids: Trying to persist files before the data model exists

5. **Auto-Save + Real-Time Sync** - Implement debounced auto-save from Zustand to Firestore, onSnapshot listener for multi-tab sync.
   - Addresses: Seamless save/load, "saving..." indicator
   - Avoids: Data loss from unsaved work

6. **Dashboard Polish + Project Management** - Project renaming, deletion, duplicate, thumbnail previews.
   - Addresses: Project management UX
   - Avoids: Scope creep in earlier phases

**Phase ordering rationale:**
- Phase 1 first because all other phases depend on the Next.js foundation working, especially WASM.
- Phase 2 before 3 because Firestore security rules depend on auth (ownerId == uid).
- Phase 3 before 4 because file URLs are stored in the project document.
- Phase 4 before 5 because auto-save writes file URLs alongside settings.
- Phase 5 before 6 because dashboard features assume projects are persisted.

**Research flags for phases:**
- Phase 1: Likely needs deeper research (Turbopack + Verovio WASM interaction, import.meta.env migration to NEXT_PUBLIC_)
- Phase 2: Standard patterns, Firebase codelab provides exact implementation
- Phase 3: Standard patterns, Firestore CRUD is well-documented
- Phase 4: Standard patterns, Firebase Storage APIs are straightforward
- Phase 5: May need research (Zustand subscribe + Firestore write coordination, conflict resolution)
- Phase 6: Standard patterns, unlikely to need research

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified on npm and official docs within the last week. Next.js 16.1, Firebase 12.9, firebase-admin 13.6. |
| Features | HIGH | Feature set is well-defined: auth, CRUD, storage, auto-save, dashboard. No ambiguity in scope. |
| Architecture | HIGH | App Router + server components for dashboard, client boundary for editor. Proven patterns from Firebase codelab. |
| Pitfalls | HIGH | WASM SSR is the primary risk, with a clean mitigation (dynamic + ssr:false). Auth cookie pattern is officially documented. |

## Gaps to Address

- **Turbopack + Verovio WASM**: While GitHub issue #84972 confirms WASM works in Turbopack, the specific Verovio ESM/WASM dual-import pattern has not been tested with Turbopack. Must validate in Phase 1 before proceeding.
- **import.meta.env migration**: Vite uses `import.meta.env.DEV` and custom env vars. Next.js uses `process.env.NEXT_PUBLIC_*`. The export client (exportClient.ts) references `import.meta.env.DEV` -- this must be migrated.
- **Export service integration**: The existing Fastify export service runs separately. How it communicates with the Next.js app (same origin? CORS? API proxy?) needs validation during Phase 1.
- **Firestore offline persistence**: Firestore supports offline persistence in browsers, which could conflict with the auto-save debounce pattern if the user goes offline mid-save. Needs investigation in Phase 5.
- **Session cookie expiration and refresh**: Firebase session cookies have a max lifetime (14 days). The token refresh flow when a cookie expires needs implementation in Phase 2.
