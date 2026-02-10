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

  return (
    <div
      style={{
        width: config.viewportWidth,
        height: config.viewportHeight,
        overflow: "hidden",
        background: config.bgUrl
          ? `url(${config.bgUrl}) center/cover no-repeat`
          : "#000",
      }}
    >
      <RegularRenderer
        xml={config.musicXml}
        bgUrl={config.bgUrl ?? undefined}
        fps={config.fps}
        viewportWidth={config.viewportWidth}
        viewportHeight={config.viewportHeight}
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
        renderMode={true}
        audioDuration={config.audioDuration}
      />
    </div>
  );
}
