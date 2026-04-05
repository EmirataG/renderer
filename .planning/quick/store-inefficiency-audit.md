# Store & Fetch Inefficiency Audit

## 1. Stream audio instead of buffering (`audio/route.ts`)

- For range requests: use `file.createReadStream({ start, end })`
- For full requests: stream via `file.createReadStream()`
- Eliminates 50MB memory spikes on every audio request

## 2. Direct file access instead of prefix listing (all 3 file routes)

- Use `scoreUrl`/`audioUrl`/`backgroundUrl` from Firestore doc to get exact Storage path
- Replace `getFiles({ prefix })` with `getBucket().file(path)`
- Saves one Storage LIST operation per file request

## 3. Add Cache-Control headers (all 3 file routes)

- Add `Cache-Control: private, max-age=3600` to GET responses
- Browser caches files for 1 hour, eliminating redundant fetches

## 4. Remove redundant Firestore read from PATCH (`[id]/route.ts`)

- Call `docRef.update()` directly, catch `NOT_FOUND` for 404
- Saves 1 Firestore read per auto-save

## 5. Add bulk `loadAnchors` to syncStore

- New method: `loadAnchors(entries: Record<string, number>)`
- Builds one Map, one `set()` call
- Update `App.tsx` to use it instead of looping `setAnchor()`

## Files to modify

- `src/app/api/projects/[id]/audio/route.ts`
- `src/app/api/projects/[id]/score/route.ts`
- `src/app/api/projects/[id]/background/route.ts`
- `src/app/api/projects/[id]/route.ts`
- `src/stores/syncStore.ts`
- `src/App.tsx`

## Verification

- Open a project, confirm score/audio/background load correctly
- Seek in audio player, confirm range requests work
- Check Network tab: file responses should have `Cache-Control: private, max-age=3600`
- Check Network tab: second visit to dashboard shows cached background thumbnails
- Change a setting, confirm auto-save still works (check Firestore)
- Load a project with anchors, confirm they load correctly
