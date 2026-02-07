---
phase: quick
plan: 003
type: execute
wave: 1
depends_on: []
files_modified:
  - src/hooks/useSingleLineVerovio.ts
  - src/renderers/SingleLineRenderer.tsx
autonomous: true

must_haves:
  truths:
    - "Staff lines appear at the same vertical position across all sections"
    - "Sections with different heights (dynamics, slurs, lyrics) still align staff lines"
    - "No visual jump or offset when camera moves between sections"
  artifacts:
    - path: "src/hooks/useSingleLineVerovio.ts"
      provides: "Staff Y offset extraction per section"
    - path: "src/renderers/SingleLineRenderer.tsx"
      provides: "Consistent vertical alignment using staff offsets"
  key_links:
    - from: "useSingleLineVerovio.ts"
      to: "SingleLineRenderer.tsx"
      via: "sectionStaffOffsets array"
---

<objective>
Align staff lines consistently across sections in SingleLineRenderer.

Purpose: When sections have different heights (due to dynamics, lyrics, slurs extending above/below), the staff lines currently don't align visually because each section's SVG has different padding. This makes section transitions jarring.

Output: Staff lines at the same vertical position across all sections, creating a seamless horizontal scroll experience.
</objective>

<execution_context>
@/Users/emirahmed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/emirahmed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/hooks/useSingleLineVerovio.ts
@src/renderers/SingleLineRenderer.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extract staff Y offset from each section SVG</name>
  <files>src/hooks/useSingleLineVerovio.ts</files>
  <action>
1. Add a new return value `sectionStaffOffsets: number[]` to UseSingleLineVerovioResult interface

2. Create a helper function `extractStaffYOffset(svgString: string): number` that:
   - Parses the SVG string to find the first `g.staff` element
   - Extracts the Y position from its transform or child path elements
   - Verovio SVG structure: `<g class="staff">` contains `<path>` elements for staff lines
   - The staff line paths have `d="M x1,y L x2,y"` where y is the staff line position
   - Return the Y coordinate of the first staff line (topmost line of first staff)

3. After rendering sections, compute sectionStaffOffsets by calling extractStaffYOffset on each SVG

4. Compute `referenceStaffY = Math.min(...sectionStaffOffsets)` - the topmost staff position across all sections

5. Return sectionStaffOffsets alongside other section data
  </action>
  <verify>
Add console.log in useSingleLineVerovio to output sectionStaffOffsets array. Load a score with varying dynamics/lyrics. Confirm offsets differ between sections.
  </verify>
  <done>
sectionStaffOffsets array returned from hook, containing Y position of first staff line for each section.
  </done>
</task>

<task type="auto">
  <name>Task 2: Apply vertical alignment offsets in SingleLineRenderer</name>
  <files>src/renderers/SingleLineRenderer.tsx</files>
  <action>
1. Destructure `sectionStaffOffsets` from useSingleLineVerovio hook call

2. Compute the reference staff Y (minimum offset across all sections):
   ```ts
   const referenceStaffY = sectionStaffOffsets.length > 0
     ? Math.min(...sectionStaffOffsets)
     : 0;
   ```

3. In the sections.map() render loop, calculate alignment offset for each section:
   ```ts
   const alignmentOffset = referenceStaffY - sectionStaffOffsets[i];
   ```
   This will be 0 for the section with the topmost staff, and negative for sections where the staff is lower.

4. Apply the alignment offset as a CSS transform on each section container:
   ```tsx
   <div
     key={i}
     ref={(el) => { sectionContainerRefs.current[i] = el; }}
     className={`preview-score${i > 0 ? ' section-continuation' : ''}`}
     style={{
       flexShrink: 0,
       width: sectionWidths[i],
       height: maxHeight,
       display: 'flex',
       alignItems: 'flex-start',
       transform: `translateY(${alignmentOffset}px)`,
     }}
     dangerouslySetInnerHTML={{ __html: svg }}
   />
   ```

5. Remove the console.log from Task 1 after verifying alignment works.
  </action>
  <verify>
Load a score with sections that have different amounts of content above/below staff (dynamics, lyrics, slurs). Verify staff lines align horizontally across section boundaries during playback.
  </verify>
  <done>
Staff lines appear at consistent vertical position across all sections. Camera scroll shows seamless staff line continuity.
  </done>
</task>

</tasks>

<verification>
1. Load a score with varying dynamics/articulations (some sections have markings above staff, some below)
2. Play through the score and observe section transitions
3. Staff lines should appear as one continuous horizontal line
4. No visual "jump" when crossing section boundaries
</verification>

<success_criteria>
- Staff lines aligned to within 1px across all sections
- Section transitions during playback appear seamless
- No regression in existing SingleLineRenderer functionality
</success_criteria>

<output>
After completion, create `.planning/quick/003-consistent-staff-line-alignment-across-s/003-SUMMARY.md`
</output>
