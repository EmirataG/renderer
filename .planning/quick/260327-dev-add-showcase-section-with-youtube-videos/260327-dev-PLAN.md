---
phase: quick
plan: 260327-dev
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/login/page.tsx
  - src/index.css
autonomous: true
requirements: [showcase-youtube-videos]
must_haves:
  truths:
    - "White animated down-arrow is visible at the bottom of the login hero screen"
    - "Clicking the arrow smoothly scrolls to the showcase section"
    - "Three YouTube videos are embedded and playable in the showcase section"
    - "Showcase section matches the existing dark/grunge aesthetic"
  artifacts:
    - path: "src/app/login/page.tsx"
      provides: "Login page with hero + showcase section + scroll arrow"
    - path: "src/index.css"
      provides: "Bounce animation for the scroll arrow"
  key_links:
    - from: "scroll arrow button"
      to: "showcase section"
      via: "scrollIntoView with smooth behavior"
      pattern: "scrollIntoView.*smooth"
---

<objective>
Add a showcase section with YouTube video embeds below the login hero screen, with a white animated down-arrow that smooth-scrolls to it.

Purpose: Let visitors see example output videos before signing in, building trust and demonstrating the product.
Output: Updated login page with hero + showcase scroll experience.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/app/login/page.tsx
@src/app/login/client.tsx
@src/index.css
</context>

<interfaces>
<!-- From src/app/login/page.tsx — server component, currently single full-screen div -->
<!-- From src/app/login/client.tsx — exports GoogleSignInButton (client component) -->
<!-- From src/index.css — grunge design system with .grunge-section-title, .grunge-btn, etc. -->

Key design tokens from index.css:
- Section titles: Georgia serif, 0.6875rem, uppercase, tracking 0.1em, color #999
- Buttons: 0.75rem, uppercase, tracking 0.05em, 2px white border
- Background: black (#000), accent: white, muted: #999/#777
- Panels: black bg, borders #555 or #404040
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Restructure login page with hero, scroll arrow, and showcase section</name>
  <files>src/app/login/page.tsx</files>
  <action>
Restructure the login page.tsx to have two full-height sections:

1. **Outer wrapper**: Change the outer div from `min-h-screen ... overflow-hidden` to a scrollable container. Remove `overflow-hidden` from the outermost div. Instead, make the page a vertical stack of two sections. The outermost wrapper should NOT constrain height — let the page naturally scroll. Keep the scrollbar hidden (already handled by global `::-webkit-scrollbar { display: none }`).

2. **Hero section** (first screen): Wrap the existing content in a `<section>` with `min-h-screen` (or `h-screen`), `relative`, `flex items-center justify-center`, `bg-black`, `overflow-hidden`. Move the scrolling score background and content div inside this section. Below the GoogleSignInButton (outside the z-10 content div but still inside the hero section), add a scroll-arrow button:
   - Position it at the bottom center of the hero: `absolute bottom-8 left-1/2 -translate-x-1/2 z-10`
   - Render a white downward chevron using an inline SVG: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8"><polyline points="6 9 12 15 18 9" /></svg>`
   - Style: `text-white opacity-70 hover:opacity-100 transition-opacity cursor-pointer`
   - Add CSS class `animate-bounce-gentle` for a subtle bounce animation
   - onClick handler: `document.getElementById('showcase')?.scrollIntoView({ behavior: 'smooth' })` — since page.tsx is a server component, this must be done via a small client component OR by converting the arrow to a client component. The simplest approach: add a `ScrollArrow` client component in `client.tsx` (or inline as a separate export). Actually, the simplest approach is to make the arrow an `<a href="#showcase">` anchor tag styled as a button, combined with CSS `scroll-behavior: smooth` on the html element. This avoids needing JavaScript entirely.
   - USE the anchor approach: `<a href="#showcase" className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 text-white opacity-70 hover:opacity-100 transition-opacity animate-bounce-gentle" aria-label="Scroll to showcase">` with the SVG chevron inside.

3. **Showcase section**: Below the hero section, add a `<section id="showcase">` with:
   - `min-h-screen bg-black flex flex-col items-center justify-center py-20 px-4`
   - A heading: `<h2>` with classes matching grunge aesthetic — use `font-serif text-sm font-bold uppercase tracking-widest text-neutral-500 mb-12` (mirrors .grunge-section-title but larger context). Text: "See It In Action"
   - A grid/flex container for 3 YouTube embeds: `grid grid-cols-1 md:grid-cols-1 gap-10 w-full max-w-3xl`
   - Each video: wrap in a `<div>` with `aspect-video w-full border border-neutral-800` containing an `<iframe>` with:
     - `src="https://www.youtube.com/embed/{VIDEO_ID}"` (extract IDs from the URLs)
     - Video IDs: `aoACVvk15ko`, `4xn6EL6nL-Q`, `u9xhKRkJFLw`
     - `allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"`
     - `allowFullScreen`
     - `className="w-full h-full"`
     - `frameBorder="0"`
   - Below the videos, add a subtle "Back to top" link: `<a href="#" className="mt-12 text-neutral-600 hover:text-white text-xs uppercase tracking-widest transition-colors">Back to top</a>` (this also uses smooth scroll via CSS)

4. **Add `scroll-behavior: smooth` to the html element** in index.css (in the `@layer base` block or on `html` selector).

Keep the page as a server component — no JavaScript needed since we use anchor-based smooth scrolling.
  </action>
  <verify>
    <automated>cd /Users/emirahmed/Desktop/Manuscript/renderer && npx next build 2>&1 | tail -20</automated>
  </verify>
  <done>Login page has two sections: hero (with scroll arrow at bottom) and showcase (with 3 YouTube embeds). Clicking arrow smooth-scrolls to showcase. Visual style matches dark/grunge aesthetic.</done>
</task>

<task type="auto">
  <name>Task 2: Add bounce animation for scroll arrow in CSS</name>
  <files>src/index.css</files>
  <action>
Add two things to src/index.css:

1. **Smooth scroll behavior** on `html`:
```css
html {
  scroll-behavior: smooth;
}
```
Add this near the top, after the `@import "tailwindcss";` line and before or within `@layer base`.

2. **Gentle bounce animation** in `@layer base` (alongside the existing `scroll-score-bg` animation):
```css
.animate-bounce-gentle {
  animation: bounce-gentle 2s ease-in-out infinite;
}

@keyframes bounce-gentle {
  0%, 100% {
    transform: translateY(0) translateX(-50%);
  }
  50% {
    transform: translateY(8px) translateX(-50%);
  }
}
```

Note: Since the arrow uses `left-1/2 -translate-x-1/2` via Tailwind for centering, and a custom animation will override `transform`, we need to include `translateX(-50%)` in the keyframes to maintain horizontal centering. Alternatively, wrap the arrow in a centering div and only animate the inner element. The cleaner approach: wrap the SVG in a `<span className="inline-block animate-bounce-gentle">` and apply the animation to just the span (not the anchor). Then the keyframes only need translateY:

```css
.animate-bounce-gentle {
  animation: bounce-gentle 2s ease-in-out infinite;
}

@keyframes bounce-gentle {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(8px);
  }
}
```

And in page.tsx, the anchor uses `-translate-x-1/2` for centering and the inner `<span className="inline-block animate-bounce-gentle">` wraps the SVG. Update Task 1 implementation accordingly: the `animate-bounce-gentle` class goes on an inner span, NOT on the anchor tag.
  </action>
  <verify>
    <automated>cd /Users/emirahmed/Desktop/Manuscript/renderer && grep -c "bounce-gentle" src/index.css && grep -c "scroll-behavior" src/index.css</automated>
  </verify>
  <done>CSS has smooth scroll behavior on html and a gentle bounce keyframe animation for the scroll arrow. Animation bounces vertically without interfering with Tailwind's horizontal centering transform.</done>
</task>

</tasks>

<verification>
- `npx next build` completes without errors
- Login page renders hero section with logo, tagline, sign-in button, and animated arrow
- Showcase section contains 3 YouTube iframe embeds with correct video IDs
- Arrow anchor links to `#showcase` and smooth-scrolls
- All styling uses black bg, white/neutral accents, uppercase tracking — consistent with grunge system
</verification>

<success_criteria>
- White animated down-arrow visible at bottom of hero, bouncing gently
- Clicking arrow smooth-scrolls to showcase section
- Three YouTube videos embedded and playable (aoACVvk15ko, 4xn6EL6nL-Q, u9xhKRkJFLw)
- Showcase section has dark bg, grunge-styled heading, subtle borders on video containers
- "Back to top" link scrolls back to hero
- Build passes with no errors
</success_criteria>

<output>
After completion, create `.planning/quick/260327-dev-add-showcase-section-with-youtube-videos/260327-dev-SUMMARY.md`
</output>
