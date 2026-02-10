# Quick Task 11: Fix Export Loading Stale dist/

## Root Cause

**All quick-9 and quick-10 changes had ZERO effect on actual exports.**

The export service navigates Puppeteer to `http://localhost:3001/` which serves the static `dist/` folder. The `dist/` was last built on Feb 9, before any of the viewport sizing, scoreRegion scaling, JPEG, or camera interpolation changes.

## Changes

1. **`export-service/src/shared/config.ts`** -- Added `frontendUrl` config with `FRONTEND_URL` env var. Defaults to self (`http://localhost:3001`). Set `FRONTEND_URL=http://localhost:5173` during dev to use Vite dev server.

2. **`export-service/src/jobs/jobManager.ts`** -- Uses `config.frontendUrl` instead of hardcoded `http://localhost:${config.port}`.

3. **Rebuilt `dist/`** -- Contains all quick-9/10 changes (dynamic viewport, scoreRegion scaling, JPEG screenshots, smooth camera interpolation, 30fps default).

## How to Use in Development

Start the export service with:
```
FRONTEND_URL=http://localhost:5173 npx tsx src/server.ts
```

This makes Puppeteer load the live Vite dev server instead of the stale dist/.

## Commit
- `7665e5f`: feat(quick-11): add FRONTEND_URL config for export dev/prod flexibility
