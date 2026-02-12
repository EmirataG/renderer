# Summary: Fix project card thumbnails not showing background images

## What changed
- **`src/app/page.tsx`**: Added `backgroundUrl: doc.data().backgroundUrl || undefined` to the project mapping in the dashboard server component.

## Root cause
The server component manually picked only 5 fields (`id`, `name`, `viewMode`, `createdAt`, `updatedAt`) when mapping Firestore docs. `backgroundUrl` was omitted, so `ProjectCard` always rendered the fallback music note icon.

## Commit
- `e90e711`: fix(quick-52): include backgroundUrl in dashboard project query
