import { useState, useEffect } from "react";
import RegularRenderer from "./renderers/RegularRenderer";
import { useSyncStore } from "./stores/syncStore";
import type { ScoreRegion } from "./types/score";
import type { BorderStyle } from "./borders";

/**
 * Minimal render-mode wrapper for headless Chrome frame capture.
 * Reads __EXPORT_CONFIG__ (injected by Puppeteer's evaluateOnNewDocument),
 * injects sync anchors into Zustand, and renders RegularRenderer with
 * renderMode=true and all settings from config.
 */
export default function RenderApp() {
  const config = window.__EXPORT_CONFIG__!;
  const [ready, setReady] = useState(false);
  const anchors = useSyncStore((state) => state.anchors);

  // Inject sync anchors into Zustand before rendering
  useEffect(() => {
    const anchorEntries = Object.entries(config.syncAnchors);
    console.log(`[RenderApp] Injecting ${anchorEntries.length} sync anchors, audioDuration=${config.audioDuration}`);
    useSyncStore.setState({
      anchors: new Map(anchorEntries),
    });
    setReady(true);
  }, []);

  if (!ready) return null;

  // Match reference app pattern: render at WIDTH=980, CSS-scale to fill viewport.
  // CSS transform: scale() is NOT bitmap scaling -- the browser renders SVGs,
  // text, and borders at native viewport resolution. Everything stays crisp.
  const EDITOR_WIDTH = 980;
  const scaleFactor = config.viewportWidth / EDITOR_WIDTH;

  return (
    <div
      style={{
        width: config.viewportWidth,
        height: config.viewportHeight,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          transformOrigin: "top left",
          transform: `scale(${scaleFactor})`,
        }}
      >
        <RegularRenderer
          xml={config.musicXml}
          bgUrl={config.bgUrl ?? undefined}
          fps={config.fps}
          scoreColor={config.scoreColor}
          syncAnchors={anchors}
          scoreRegion={config.scoreRegion as ScoreRegion | null}
          scoreBorder={(config.scoreBorder ?? "none") as BorderStyle}
          scoreScale={config.scoreScale ?? 1}
          musicFont={config.musicFont ?? "Bravura"}
          activeNoteheadColor={config.activeNoteheadColor ?? undefined}
          activeNoteheadScale={config.activeNoteheadScale ?? 1}
          activeNoteheadAnimationEntryMs={config.activeNoteheadEntryMs ?? 50}
          activeNoteheadAnimationHoldMs={config.activeNoteheadHoldMs ?? 200}
          activeNoteheadAnimationExitMs={config.activeNoteheadExitMs ?? 200}
          colorFullNote={config.colorFullNote ?? false}
          hideLabels={config.hideLabels ?? false}
          renderMode={true}
          audioDuration={config.audioDuration}
        />
      </div>
    </div>
  );
}
