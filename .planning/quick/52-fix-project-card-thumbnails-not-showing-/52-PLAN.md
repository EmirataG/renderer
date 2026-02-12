# Plan: Fix project card thumbnails not showing background images

## Goal
Background images should appear in project card thumbnails on the dashboard.

## Root Cause
The server component `src/app/page.tsx` (line 28-34) manually picks only `id`, `name`, `viewMode`, `createdAt`, `updatedAt` when mapping Firestore docs to projects. It omits `backgroundUrl` and `backgroundFileName`, so `project.backgroundUrl` is always undefined in the dashboard, causing the fallback music note icon to always show.

## Tasks

### Task 1: Add backgroundUrl to dashboard server component query
**File:** `src/app/page.tsx`

Add `backgroundUrl` (and optionally `backgroundFileName`) to the project mapping at lines 28-34 so the ProjectCard can detect whether a background exists.
