---
phase: quick-11
plan: 01
type: execute
---

<objective>
Fix export pipeline loading stale dist/ instead of current source code.
Add FRONTEND_URL env var for dev/prod flexibility.
Rebuild dist/ with all accumulated quick-9/10 changes.
</objective>

<tasks>
<task type="auto">
  <name>Add FRONTEND_URL config and rebuild dist</name>
  <files>
    export-service/src/shared/config.ts
    export-service/src/jobs/jobManager.ts
  </files>
</task>
</tasks>
