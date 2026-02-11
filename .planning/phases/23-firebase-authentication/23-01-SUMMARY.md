---
phase: 23-firebase-authentication
plan: 01
subsystem: auth
tags: [firebase, google-auth, session-cookie, firebase-admin, httpOnly]

# Dependency graph
requires:
  - phase: 22-nextjs-scaffold-migration
    provides: Next.js 16 App Router with Turbopack, route structure
provides:
  - Firebase client SDK singleton (firebase-client.ts exporting auth)
  - Firebase Admin SDK singleton (firebase-admin.ts exporting adminAuth)
  - Session cookie Route Handler (POST create, DELETE clear)
  - Login page with Google sign-in popup flow
  - Environment variable template for all Firebase config
affects: [23-02, 24-firestore-data-model, route-protection, sign-out]

# Tech tracking
tech-stack:
  added: [firebase@12.9.0, firebase-admin@13.6.1, server-only@0.0.1]
  patterns: [firebase-singleton-with-hmr-guard, server-only-import-guard, session-cookie-auth, force-dynamic-for-client-sdk-pages]

key-files:
  created:
    - src/lib/firebase-client.ts
    - src/lib/firebase-admin.ts
    - src/app/api/auth/session/route.ts
    - src/app/login/page.tsx
    - src/app/login/client.tsx
    - .env.local.example
  modified:
    - package.json
    - tsconfig.json
    - .gitignore

key-decisions:
  - "Added @/ path alias to tsconfig.json for clean imports across the project"
  - "Firebase Admin SDK initializes without credentials when env vars missing (build-time safety)"
  - "Login page uses force-dynamic to prevent SSR prerender failure from Firebase client SDK"

patterns-established:
  - "Firebase singleton: getApps().length === 0 guard for HMR safety"
  - "Server-only guard: import 'server-only' as first line in server-only modules"
  - "Session cookie named __session for Firebase Hosting compatibility"
  - "Build-safe SDK init: graceful fallback when env vars are missing during build"

# Metrics
duration: 3min
completed: 2026-02-11
---

# Phase 23 Plan 01: Firebase Auth Infrastructure Summary

**Firebase client/admin SDK singletons with Google sign-in popup, httpOnly session cookie Route Handler, and login page**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-11T19:13:22Z
- **Completed:** 2026-02-11T19:16:43Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Firebase client SDK singleton with HMR-safe initialization exporting `auth`
- Firebase Admin SDK singleton with `server-only` guard exporting `adminAuth`
- Session cookie Route Handler: POST creates httpOnly cookie from ID token, DELETE clears it
- Login page with Google sign-in button triggering popup flow and session creation
- Environment variable template documenting all 9 Firebase config vars

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Firebase packages and create SDK singletons** - `2d41b7b` (feat)
2. **Task 2: Create session Route Handler and login page** - `d4d2798` (feat)

## Files Created/Modified
- `src/lib/firebase-client.ts` - Firebase client SDK singleton exporting `auth`
- `src/lib/firebase-admin.ts` - Firebase Admin SDK singleton exporting `adminAuth` with server-only guard
- `src/app/api/auth/session/route.ts` - Session cookie creation (POST) and destruction (DELETE)
- `src/app/login/page.tsx` - Login page server component shell with centered layout
- `src/app/login/client.tsx` - GoogleSignInButton client component with popup sign-in flow
- `.env.local.example` - Template with all 9 Firebase environment variables documented
- `package.json` - Added firebase, firebase-admin, server-only dependencies
- `tsconfig.json` - Added @/ path alias (baseUrl + paths)
- `.gitignore` - Added .env.local

## Decisions Made
- Added `@/` path alias to tsconfig.json -- required for clean imports like `@/lib/firebase-client`; existing project used relative paths only
- Firebase Admin SDK uses graceful fallback when env vars are missing -- initializes without credentials during build, preventing build failure when `.env.local` is not present
- Login page marked as `force-dynamic` -- prevents Next.js from trying to statically prerender a page that imports the Firebase client SDK (which needs runtime env vars)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added @/ path alias to tsconfig.json**
- **Found during:** Task 1 (SDK singleton creation)
- **Issue:** Plan specifies imports like `@/lib/firebase-client` but tsconfig.json had no path alias configured
- **Fix:** Added `baseUrl: "."` and `paths: { "@/*": ["src/*"] }` to tsconfig.json
- **Files modified:** tsconfig.json
- **Verification:** `npx tsc --noEmit` passes with @/ imports
- **Committed in:** 2d41b7b (Task 1 commit)

**2. [Rule 1 - Bug] Fixed firebase-admin crash on missing env vars during build**
- **Found during:** Task 2 (`npm run build` verification)
- **Issue:** `process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace()` throws TypeError when env var is undefined during Next.js build
- **Fix:** Wrapped initialization in `getOrInitApp()` function that checks for env var presence before using credentials; falls back to credential-less init during build
- **Files modified:** src/lib/firebase-admin.ts
- **Verification:** `npm run build` succeeds without .env.local present
- **Committed in:** d4d2798 (Task 2 commit)

**3. [Rule 1 - Bug] Added force-dynamic to login page to prevent SSR prerender failure**
- **Found during:** Task 2 (`npm run build` verification)
- **Issue:** Next.js tried to statically prerender /login, which imports GoogleSignInButton -> firebase-client.ts -> `initializeApp` with empty config, causing `auth/invalid-api-key` error
- **Fix:** Added `export const dynamic = 'force-dynamic'` to login/page.tsx
- **Files modified:** src/app/login/page.tsx
- **Verification:** `npm run build` succeeds, /login shown as dynamic route
- **Committed in:** d4d2798 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 bugs)
**Impact on plan:** All auto-fixes necessary for correctness. Path alias is a project-wide prerequisite. Build-time safety and dynamic rendering are standard Next.js patterns. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required

Firebase requires manual configuration before the auth flow will work at runtime. Users must:
1. Create a Firebase project (or use existing) at Firebase Console
2. Add a Web app to the project
3. Enable Google as a sign-in provider under Authentication -> Sign-in method
4. Generate a service account key under Project Settings -> Service accounts
5. Copy `.env.local.example` to `.env.local` and fill in all 9 values from the Firebase Console

See the plan frontmatter `user_setup` section for detailed env var sources.

## Next Phase Readiness
- Auth infrastructure complete: SDK singletons, session API, login page all built and type-checked
- Ready for Plan 02: route protection via proxy.ts and sign-out flow
- Runtime testing requires Firebase project configuration (env vars in .env.local)

---
*Phase: 23-firebase-authentication*
*Completed: 2026-02-11*
