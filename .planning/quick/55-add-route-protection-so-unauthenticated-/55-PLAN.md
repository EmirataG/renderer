---
phase: quick-55
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/middleware.ts
  - src/app/login/page.tsx
autonomous: true
must_haves:
  truths:
    - "Unauthenticated users visiting / are redirected to /login"
    - "Unauthenticated users visiting /project/[id] are redirected to /login"
    - "Authenticated users visiting /login are redirected to /"
    - "API routes are NOT affected by middleware redirects"
    - "Static assets and Next.js internals are NOT affected"
  artifacts:
    - path: "src/middleware.ts"
      provides: "Route protection via session cookie check"
  key_links:
    - from: "src/middleware.ts"
      to: "__session cookie"
      via: "request.cookies.get"
      pattern: "request\\.cookies\\.get.*__session"
---

<objective>
Add Next.js middleware for route protection so unauthenticated users can only access /login.

Purpose: Prevent unauthenticated access to dashboard and project editor pages.
Output: src/middleware.ts that redirects based on session cookie presence. Login page that redirects authenticated users to dashboard.
</objective>

<execution_context>
@/Users/emirahmed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/emirahmed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/app/api/auth/session/route.ts (session cookie name: __session)
@src/app/login/page.tsx (current login page -- server component)
@src/app/login/client.tsx (Google sign-in, redirects to / on success)
@src/app/page.tsx (dashboard -- reads __session cookie server-side)
@src/app/project/[id]/page.tsx (editor page)
@src/lib/firebase-admin.ts (Admin SDK -- server-only, NOT Edge-compatible)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create Next.js middleware for route protection</name>
  <files>src/middleware.ts</files>
  <action>
Create `src/middleware.ts` with the following behavior:

1. Read the `__session` cookie from the request.
2. Define public routes that don't require auth: `/login`, `/api/auth/session`.
3. If the request path is `/login` AND the session cookie EXISTS, redirect to `/` (authenticated user on login page).
4. If the request path is NOT a public route AND the session cookie DOES NOT exist, redirect to `/login`.
5. Otherwise, call `NextResponse.next()`.

Use `matcher` config to exclude static files and Next.js internals:
```ts
export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, public assets
     */
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
```

IMPORTANT: Do NOT import firebase-admin or any server-only module. Firebase Admin SDK uses Node.js APIs that are incompatible with Edge runtime. The middleware only checks cookie PRESENCE -- actual cryptographic verification remains in server components and API routes (src/app/page.tsx already does `adminAuth.verifySessionCookie`).

Also ensure `/api/*` routes (except `/api/auth/session`) still pass through -- they have their own auth checks. The matcher already excludes static assets. For API routes, let them through without redirect (they return 401 JSON, not HTML redirects).
  </action>
  <verify>
Run `npx next build` or `npx next lint` to verify the middleware compiles without errors. Verify the file exists at src/middleware.ts and uses only Edge-compatible imports (NextResponse, NextRequest from 'next/server').
  </verify>
  <done>
src/middleware.ts exists, uses Edge-compatible code only, redirects unauthenticated users to /login, redirects authenticated users away from /login to /, and does not interfere with API routes or static assets.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add server-side auth redirect on login page</name>
  <files>src/app/login/page.tsx</files>
  <action>
Update `src/app/login/page.tsx` to add a server-side auth check as a belt-and-suspenders measure alongside the middleware:

1. Import `cookies` from `next/headers` and `redirect` from `next/navigation`.
2. At the top of the `LoginPage` component (before the return), read the `__session` cookie.
3. If the cookie exists, call `redirect('/')` to send authenticated users to the dashboard.
4. Keep all existing JSX and the `force-dynamic` export unchanged.

This provides defense-in-depth: even if middleware is bypassed or misconfigured, the login page itself will redirect authenticated users. No need to verify the cookie cryptographically here -- the dashboard page already does that. If the cookie is invalid/expired, the dashboard will just show empty projects and the user can re-login.
  </action>
  <verify>
Verify `src/app/login/page.tsx` imports `cookies` and `redirect`, checks for `__session` cookie, and calls `redirect('/')` if present. Ensure the component is still async (needed for `await cookies()`). Run `npx next lint` to check for errors.
  </verify>
  <done>
Login page redirects authenticated users (those with __session cookie) to / via server-side redirect. Unauthenticated users see the normal login form.
  </done>
</task>

</tasks>

<verification>
1. Without __session cookie: visiting `/` redirects to `/login`
2. Without __session cookie: visiting `/project/some-id` redirects to `/login`
3. With __session cookie: visiting `/login` redirects to `/`
4. With __session cookie: visiting `/` shows dashboard normally
5. API routes (`/api/projects`, `/api/auth/session`) are not affected by redirects
6. Static assets (images, SVGs) load normally
7. The app builds without errors (`npx next build`)
</verification>

<success_criteria>
- Unauthenticated users are redirected to /login from all protected routes
- Authenticated users are redirected from /login to /
- No Edge runtime errors (no firebase-admin or server-only imports in middleware)
- API routes remain unaffected (return JSON responses, not HTML redirects)
</success_criteria>

<output>
After completion, create `.planning/quick/55-add-route-protection-so-unauthenticated-/55-SUMMARY.md`
</output>
