# Technology Stack

**Analysis Date:** 2026-02-03

## Languages

**Primary:**
- TypeScript ~5.9.3 - All application code, strict mode enabled
- JSX/TSX - React component syntax throughout codebase

**Secondary:**
- JavaScript - PostCSS configuration files
- CSS - Tailwind CSS styling (via PostCSS)

## Runtime

**Environment:**
- Node.js (no specific version locked, development only)

**Package Manager:**
- npm (with package-lock.json v3 lockfile present)

## Frameworks

**Core:**
- React 19.1.1 - UI framework for building components
- React DOM 19.1.1 - DOM rendering for React components

**State Management:**
- Zustand 5.0.10 - Lightweight state management for sync anchors

**Music Rendering:**
- OpenSheetMusicDisplay 1.9.5 - Music notation rendering from MusicXML

**Drag & Drop:**
- react-rnd 10.5.2 - Draggable and resizable region editor component

**Styling:**
- Tailwind CSS 4.1.16 - Utility-first CSS framework
- @tailwindcss/postcss 4.1.0 - PostCSS plugin for Tailwind

**Build/Dev:**
- Vite 6.3.5 - Build tool and dev server
- @vitejs/plugin-react 4.5.2 - React Fast Refresh for Vite

## Key Dependencies

**Critical:**
- opensheetmusicdisplay 1.9.5 - Core musical notation rendering library, used in `src/renderers/RegularRenderer.tsx` and `src/components/SyncEditor.tsx`
- zustand 5.0.10 - State management for sync anchors in `src/stores/syncStore.ts`
- react-rnd 10.5.2 - Enables draggable/resizable score region editor in `src/components/ScoreRegionEditor.tsx`

**Infrastructure:**
- TypeScript type definitions (@types/react, @types/react-dom) for type safety

## Configuration

**Environment:**
- No environment variables detected in codebase
- All configuration is compile-time (Vite, TypeScript, Tailwind)
- No .env files used

**Build:**
- `vite.config.ts` - Vite configuration with React plugin enabled
- `tsconfig.json` - TypeScript root configuration (references tsconfig.app.json)
- `tsconfig.app.json` - Application-specific TypeScript settings with ES2020 target, strict mode, React JSX
- `postcss.config.js` - PostCSS configuration with Tailwind plugin

**Browser Targets:**
- ES2020 JavaScript features (configured in tsconfig.app.json)
- DOM and DOM.Iterable APIs required

## Platform Requirements

**Development:**
- Node.js (any recent version compatible with npm v10+)
- npm 10+ for package management

**Production:**
- Modern browsers supporting ES2020
- No server-side rendering or backend required
- Pure client-side SPA (Single Page Application)
- Deployment target: Static file hosting (Vite dist/ output)

## Build Output

**Commands:**
- `npm run dev` - Start Vite dev server with hot reload
- `npm run build` - TypeScript type check (`tsc -b`) + Vite production build to `dist/`
- `npm run preview` - Preview production build locally

**Output:**
- Static files in `dist/` directory ready for hosting
- Bundled JavaScript with code splitting
- CSS minified and optimized

---

*Stack analysis: 2026-02-03*
