import { useState, useRef, useEffect } from "react";
import RegularRenderer from "./renderers/RegularRenderer";
import SingleLineRenderer from "./renderers/SingleLineRenderer";
import { SyncEditor } from "./components/SyncEditor";
import { ToastProvider } from "./components/Toast";
import { UploadDropZone } from "./components/UploadDropZone";
import { BackgroundControl } from "./components/BackgroundControl";
import { AspectRatioControl } from "./components/AspectRatioControl";
import { ScoreRegionEditor } from "./components/ScoreRegionEditor";
import { BorderPicker } from "./components/BorderPicker";
import { BorderStyle } from "./borders";
import { useSyncStore } from "./stores/syncStore";
import { useProjectStore, DEFAULT_SETTINGS } from "./stores/projectStore";
import { useEventStore } from "./stores/eventStore";
import { SaveIndicator } from "./components/SaveIndicator";
import { ManuscriptMark } from "./components/ManuscriptMark";
import { initAutoSave } from "./lib/autoSave";
import type { ScoreRegion } from "./types/score";
import { TrebleClefSpinner } from "./components/TrebleClefSpinner";
import { clientExport, type ExportSettings } from "./lib/clientExport";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { validateMxl, isMxlFile } from "./lib/musicxmlValidation";

interface AppProps {
  projectId?: string;
  onNavigateDashboard?: () => void;
}

export default function App({ projectId, onNavigateDashboard }: AppProps) {
  // Get sync anchors from store (use selector for proper reactivity)
  const anchors = useSyncStore((state) => state.anchors);

  // Project settings from store (replaces 16 individual useState calls)
  const fps = useProjectStore((s) => s.fps);
  const scoreColor = useProjectStore((s) => s.scoreColor);
  const scoreShadowDistance = useProjectStore((s) => s.scoreShadowDistance);
  const hideUnplayedNotes = useProjectStore((s) => s.hideUnplayedNotes);
  const smoothReveal = useProjectStore((s) => s.smoothReveal);
  const unplayedOpacity = useProjectStore((s) => s.unplayedOpacity);
  const activeLinePosition = useProjectStore((s) => s.activeLinePosition);
  const revealLinePosition = useProjectStore((s) => s.revealLinePosition);
  const fadeOutLinePosition = useProjectStore((s) => s.fadeOutLinePosition);
  const scoreRegion = useProjectStore((s) => s.scoreRegion);
  const scoreBorder = useProjectStore((s) => s.scoreBorder);
  const scoreScale = useProjectStore((s) => s.scoreScale);
  const musicFont = useProjectStore((s) => s.musicFont);
  const hideLabels = useProjectStore((s) => s.hideLabels);
  const activeNoteheadColor = useProjectStore((s) => s.activeNoteheadColor);
  const activeNoteheadScale = useProjectStore((s) => s.activeNoteheadScale);
  const activeNoteheadHoldMs = useProjectStore((s) => s.activeNoteheadHoldMs);
  const activeNoteheadExitMs = useProjectStore((s) => s.activeNoteheadExitMs);
  const activeNoteheadUseNoteDuration = useProjectStore(
    (s) => s.activeNoteheadUseNoteDuration,
  );
  const colorAccidentals = useProjectStore((s) => s.colorAccidentals);
  const colorDots = useProjectStore((s) => s.colorDots);
  const colorArticulations = useProjectStore((s) => s.colorArticulations);
  const bgColor = useProjectStore((s) => s.bgColor);
  const bgMode = useProjectStore((s) => s.bgMode);
  const bgCrop = useProjectStore((s) => s.bgCrop);
  const projectAspectRatio = useProjectStore((s) => s.aspectRatio);
  const setSetting = useProjectStore((s) => s.setSetting);
  const projectName = useProjectStore((s) => s.projectName);
  const setProjectName = useProjectStore((s) => s.setProjectName);

  // View mode from project store (page or single-line)
  const viewMode = useProjectStore((s) => s.viewMode);

  // File upload state
  const [musicXMLFile, setMusicXMLFile] = useState<{
    xml: string;
    name: string;
    measureCount: number;
  } | null>(null);
  const [audioFile, setAudioFile] = useState<{
    url: string;
    name: string;
    file: File | null;
  } | null>(null);
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [bgFileName, setBgFileName] = useState<string | null>(null);

  // Show the uploaded image only in image mode; otherwise the solid color (or
  // white) is shown. The image is kept on disk even while color is active.
  const showImageBg = bgMode === "image" && !!bgUrl;

  // Natural height (editor px) of the single-line score, reported by the
  // renderer. Drives the default + minimum region height in single-line mode.
  const [singleLineScoreHeight, setSingleLineScoreHeight] = useState(0);

  // Project loading state
  const [isLoadingProject, setIsLoadingProject] = useState(false);

  // Auto-save cleanup ref
  const autoSaveCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Clean up previous auto-save subscription if projectId changes
    autoSaveCleanupRef.current?.();
    autoSaveCleanupRef.current = null;

    if (!projectId) return;

    let cancelled = false;

    async function loadProject() {
      setIsLoadingProject(true);
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        if (!res.ok || cancelled) return;
        const { project } = await res.json();
        if (cancelled) return;

        // Load score via server proxy (avoids CORS with Storage URLs)
        if (project.scoreUrl) {
          const scoreRes = await fetch(`/api/projects/${projectId}/score`);
          if (cancelled) return;
          if (scoreRes.ok) {
            const fileName: string = project.scoreFileName || "score.xml";
            let xml: string;

            if (
              isMxlFile(fileName) ||
              scoreRes.headers.get("Content-Type")?.includes("recordare")
            ) {
              // MXL (compressed MusicXML) — decompress via Verovio
              const buffer = await scoreRes.arrayBuffer();
              const result = await validateMxl(buffer);
              xml = result.valid && result.xml ? result.xml : "";
            } else {
              xml = await scoreRes.text();
            }

            if (xml) {
              setMusicXMLFile({
                xml,
                name: fileName,
                measureCount: 0, // Verovio will calculate on render
              });
            }
          }
        }

        if (cancelled) return;

        // Set audio via server proxy (avoids CORS, supports range requests for seeking)
        if (project.audioUrl) {
          // Revoke any user-uploaded blob URL from the previous project.
          if (audioFile?.url?.startsWith("blob:")) {
            URL.revokeObjectURL(audioFile.url);
          }
          setAudioFile({
            url: `/api/projects/${projectId}/audio`,
            name: project.audioFileName || "audio.mp3",
            file: null,
          });
        }

        // Background image (if any). A solid color is held as a setting
        // (bgColor) and drawn natively by the renderers — no synthesized image.
        if (project.backgroundUrl) {
          // Revoke any user-uploaded blob URL from the previous project.
          if (bgUrl?.startsWith("blob:")) {
            URL.revokeObjectURL(bgUrl);
          }
          setBgUrl(`/api/projects/${projectId}/background`);
          setBgFileName(project.backgroundFileName || null);
        }

        // Load settings from API response into projectStore
        const { loadSettings, setProjectId, setProjectName } =
          useProjectStore.getState();
        setProjectId(projectId!);
        if (project.name) setProjectName(project.name);
        loadSettings({
          viewMode: (project.viewMode ?? DEFAULT_SETTINGS.viewMode) as
            | "page"
            | "single-line",
          scoreColor: project.scoreColor ?? DEFAULT_SETTINGS.scoreColor,
          scoreScale: project.scoreScale ?? DEFAULT_SETTINGS.scoreScale,
          musicFont: project.musicFont ?? DEFAULT_SETTINGS.musicFont,
          scoreBorder: (project.scoreBorder ??
            DEFAULT_SETTINGS.scoreBorder) as BorderStyle,
          hideLabels: project.hideLabels ?? DEFAULT_SETTINGS.hideLabels,
          scoreRegion: project.scoreRegion ?? DEFAULT_SETTINGS.scoreRegion,
          activeNoteheadColor:
            project.activeNoteheadColor ?? DEFAULT_SETTINGS.activeNoteheadColor,
          activeNoteheadScale:
            project.activeNoteheadScale ?? DEFAULT_SETTINGS.activeNoteheadScale,
          activeNoteheadHoldMs:
            project.activeNoteheadHoldMs ??
            DEFAULT_SETTINGS.activeNoteheadHoldMs,
          activeNoteheadExitMs:
            project.activeNoteheadExitMs ??
            DEFAULT_SETTINGS.activeNoteheadExitMs,
          activeNoteheadUseNoteDuration:
            project.activeNoteheadUseNoteDuration ??
            DEFAULT_SETTINGS.activeNoteheadUseNoteDuration,
          colorAccidentals:
            project.colorAccidentals ??
            project.colorFullNote ??
            DEFAULT_SETTINGS.colorAccidentals,
          colorDots:
            project.colorDots ??
            project.colorFullNote ??
            DEFAULT_SETTINGS.colorDots,
          colorArticulations:
            project.colorArticulations ??
            project.colorFullNote ??
            DEFAULT_SETTINGS.colorArticulations,
          fps: project.fps ?? DEFAULT_SETTINGS.fps,
          scoreShadowDistance:
            project.scoreShadowDistance ?? DEFAULT_SETTINGS.scoreShadowDistance,
          hideUnplayedNotes:
            project.hideUnplayedNotes ?? DEFAULT_SETTINGS.hideUnplayedNotes,
          smoothReveal: project.smoothReveal ?? DEFAULT_SETTINGS.smoothReveal,
          unplayedOpacity:
            project.unplayedOpacity ?? DEFAULT_SETTINGS.unplayedOpacity,
          activeLinePosition:
            project.activeLinePosition ?? DEFAULT_SETTINGS.activeLinePosition,
          revealLinePosition:
            project.revealLinePosition ?? DEFAULT_SETTINGS.revealLinePosition,
          fadeOutLinePosition:
            project.fadeOutLinePosition ?? DEFAULT_SETTINGS.fadeOutLinePosition,
          bgColor: project.bgColor ?? DEFAULT_SETTINGS.bgColor,
          // Back-compat: legacy projects with an image but no stored mode show it.
          bgMode: project.bgMode ?? (project.backgroundUrl ? "image" : "color"),
          bgCrop: project.bgCrop ?? DEFAULT_SETTINGS.bgCrop,
          aspectRatio: project.aspectRatio ?? DEFAULT_SETTINGS.aspectRatio,
        });

        // Load sync anchors from API response in one batch — clears stale
        // anchors from a previous project and avoids N intermediate Map copies
        if (project.anchors && typeof project.anchors === "object") {
          useSyncStore.getState().loadAnchors(project.anchors);
        } else {
          useSyncStore.getState().clearAllAnchors();
        }
        // Initialize auto-save AFTER settings and anchors are loaded.
        // Guard with `cancelled` so Strict Mode double-fire doesn't create
        // orphaned subscriptions that trigger on the second load's store writes.
        if (!cancelled) {
          autoSaveCleanupRef.current = initAutoSave();
        }
      } catch (err) {
        console.error("Failed to load project:", err);
      } finally {
        if (!cancelled) {
          setIsLoadingProject(false);
        }
      }
    }

    loadProject();

    return () => {
      cancelled = true;
      autoSaveCleanupRef.current?.();
      autoSaveCleanupRef.current = null;
      // Reset stores when leaving a project so the next project starts clean
      useProjectStore.getState().resetSettings();
      useSyncStore.getState().clearAllAnchors();
      useEventStore.getState().invalidate();
    };
  }, [projectId]);

  // Invalidate event store when viewMode changes (positions are axis-specific).
  // Skip the initial mount — only invalidate on actual user-driven changes.
  const prevViewModeRef = useRef(viewMode);
  useEffect(() => {
    if (prevViewModeRef.current !== viewMode) {
      prevViewModeRef.current = viewMode;
      useEventStore.getState().invalidate();
    }
  }, [viewMode]);

  // View toggle state
  const [currentView, setCurrentView] = useState<"renderer" | "sync">(
    "renderer",
  );

  // Audio ref for preview
  const audioRef = useRef<HTMLAudioElement>(null);

  // Transport bar portal target (play/pause/reset rendered here from RegularRenderer)
  const [transportEl, setTransportEl] = useState<HTMLDivElement | null>(null);

  // Transient UI state for region editing
  const [isEditingRegion, setIsEditingRegion] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomEnabled, setZoomEnabled] = useState(true);
  const [regionContainerDims, setRegionContainerDims] = useState<{
    width: number;
    height: number;
  } | null>(null);

  // Region editor min/default height. In single-line mode the region is framed
  // to the score's own height (centered); elsewhere it defaults to the frame.
  const isSingleLine = viewMode === "single-line";
  const editorMinHeight =
    isSingleLine && singleLineScoreHeight > 0 && regionContainerDims
      ? Math.min(singleLineScoreHeight, regionContainerDims.height)
      : 150;
  const editorDefaultRegion: ScoreRegion | null =
    isSingleLine && regionContainerDims && singleLineScoreHeight > 0
      ? {
          x: 0,
          y: (regionContainerDims.height - editorMinHeight) / 2,
          width: regionContainerDims.width,
          height: editorMinHeight,
          rotation: 0,
        }
      : null;

  // Verovio rendering debounces (local state, derived from store values)
  // Initialize from current store values so the first render uses real values
  // (avoids a flash where the score covers the entire background for 300ms).
  const [debouncedScoreScale, setDebouncedScoreScale] = useState(scoreScale);
  const [debouncedScoreRegion, setDebouncedScoreRegion] =
    useState<ScoreRegion | null>(scoreRegion);

  // Debounce scoreScale to avoid Verovio re-render on every slider tick
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedScoreScale(scoreScale);
    }, 300);
    return () => clearTimeout(timer);
  }, [scoreScale]);

  // Flush debounced values immediately when project finishes loading.
  // Without this, the renderer first renders with DEFAULT scale/region (captured
  // by useState at App mount), then 300ms later re-renders with the loaded values.
  const projectLoadedRef = useRef(false);
  useEffect(() => {
    if (isLoadingProject) {
      projectLoadedRef.current = false;
    } else if (projectId && !projectLoadedRef.current) {
      projectLoadedRef.current = true;
      setDebouncedScoreScale(scoreScale);
      setDebouncedScoreRegion(scoreRegion);
    }
  }, [isLoadingProject, projectId, scoreScale, scoreRegion]);

  // Debounce scoreRegion only during active editing to avoid Verovio re-render
  // on every drag tick. Outside editing (initial load, settings change), propagate
  // immediately to prevent the score flashing at full-container size.
  useEffect(() => {
    if (!isEditingRegion) {
      setDebouncedScoreRegion(scoreRegion);
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedScoreRegion(scoreRegion);
    }, 300);
    return () => clearTimeout(timer);
  }, [scoreRegion, isEditingRegion]);

  // Calculate container dimensions for score region editing. These must match
  // the renderer's frame, which is sized from the aspect ratio (fallback chain:
  // aspectRatio → bg image AR → 16:9).
  const WIDTH = 980; // Same as RegularRenderer WIDTH constant
  useEffect(() => {
    if (projectAspectRatio && projectAspectRatio > 0) {
      setRegionContainerDims({
        width: WIDTH,
        height: Math.floor(WIDTH / projectAspectRatio),
      });
      return;
    }
    if (!bgUrl) {
      // Default 16:9 dimensions when no background and no aspect ratio
      const f = WIDTH / 1920;
      setRegionContainerDims({
        width: Math.floor(1920 * f),
        height: Math.floor(1080 * f),
      });
      return;
    }

    const img = new Image();
    img.src = bgUrl;
    img.onload = () => {
      const f = WIDTH / img.naturalWidth;
      setRegionContainerDims({
        width: Math.floor(img.naturalWidth * f),
        height: Math.floor(img.naturalHeight * f),
      });
    };
  }, [bgUrl, projectAspectRatio]);

  // Export state
  const [exportState, setExportState] = useState<{
    status:
      | "idle"
      | "uploading"
      | "rendering"
      | "encoding"
      | "complete"
      | "error"
      | "cancelled";
    percent: number;
    stage: string | null;
    error: string | null;
    downloadUrl: string | null;
  }>({
    status: "idle",
    percent: 0,
    stage: null,
    error: null,
    downloadUrl: null,
  });
  const exportAbortRef = useRef<AbortController | null>(null);

  // Cancel export on unmount
  useEffect(() => {
    return () => {
      exportAbortRef.current?.abort();
    };
  }, []);

  // Upload handlers
  const handleMusicXMLUpload = (
    xml: string,
    fileName: string,
    measureCount: number,
  ) => {
    setMusicXMLFile({ xml, name: fileName, measureCount });
  };

  const handleAudioUpload = (
    audioUrl: string,
    fileName: string,
    file?: File,
  ) => {
    // Revoke the previous blob URL before replacing (also covers removal).
    if (audioFile?.url?.startsWith("blob:") && audioFile.url !== audioUrl) {
      URL.revokeObjectURL(audioFile.url);
    }
    setAudioFile(
      audioUrl ? { url: audioUrl, name: fileName, file: file || null } : null,
    );
  };

  const handleImageUpload = (
    imageUrl: string,
    fileName: string,
    file?: File,
  ) => {
    // Revoke the previous blob URL before replacing (also covers removal).
    // Server URLs and data: URLs don't need revocation — the cleanup is a
    // no-op for non-blob URLs, but skipping it avoids the lookup cost.
    if (bgUrl?.startsWith("blob:") && bgUrl !== imageUrl) {
      URL.revokeObjectURL(bgUrl);
    }
    setBgUrl(imageUrl || null);
    setBgFileName(fileName || null);

    // Reset score region when background changes — the old region dimensions
    // are sized for the previous image and become invalid. Setting to null
    // falls back to full container dimensions via scoreRegion?.width ?? containerWidth.
    setSetting("scoreRegion", null);
    setIsEditingRegion(false);
  };

  // Export handlers
  const handleExport = async () => {
    if (!musicXMLFile || !audioFile) return;

    setExportState({
      status: "uploading",
      percent: 0,
      stage: "Uploading...",
      error: null,
      downloadUrl: null,
    });

    // AbortController for cancellation
    const abortController = new AbortController();
    exportAbortRef.current = abortController;

    try {
      const settings: ExportSettings = {
        fps,
        scoreColor,
        scoreShadowDistance,
        hideUnplayedNotes,
        smoothReveal,
        unplayedOpacity,
        activeLinePosition,
        revealLinePosition,
        fadeOutLinePosition,
        scoreRegion,
        scoreBorder,
        scoreScale,
        musicFont: musicFont as ExportSettings["musicFont"],
        activeNoteheadColor,
        activeNoteheadScale,
        activeNoteheadHoldMs,
        activeNoteheadExitMs,
        activeNoteheadUseNoteDuration,
        colorAccidentals,
        colorDots,
        colorArticulations,
        hideLabels,
        audioDuration: audioRef.current?.duration,
        viewMode,
      };

      // If audio was loaded from Storage (no local File), fetch it as a Blob
      let audioFileForExport = audioFile.file;
      if (!audioFileForExport && audioFile.url) {
        const audioRes = await fetch(audioFile.url);
        const audioBlob = await audioRes.blob();
        audioFileForExport = new File([audioBlob], audioFile.name, {
          type: audioBlob.type,
        });
      }

      // Client-side export: render + encode entirely in the browser.
      // Background priority mirrors the renderers: an image wins; otherwise a
      // solid color; otherwise plain white. Frame dims come from aspectRatio.
      const mp4Blob = await clientExport({
        musicXml: musicXMLFile.xml,
        syncAnchors: anchors,
        settings,
        audioFile: audioFileForExport!,
        bgImageUrl: showImageBg ? bgUrl! : undefined,
        bgColor: showImageBg ? undefined : bgColor || undefined,
        bgCrop: showImageBg ? bgCrop ?? undefined : undefined,
        aspectRatio: projectAspectRatio || undefined,
        signal: abortController.signal,
        onProgress: (percent, stage) => {
          setExportState((prev) => ({
            ...prev,
            status: percent < 100 ? "rendering" : "complete",
            percent,
            stage,
          }));
        },
      });

      // Store blob URL for download
      const downloadUrl = URL.createObjectURL(mp4Blob);
      setExportState((prev) => ({
        ...prev,
        status: "complete",
        percent: 100,
        downloadUrl,
      }));
    } catch (err) {
      if (abortController.signal.aborted) {
        setExportState((prev) => ({ ...prev, status: "cancelled" }));
      } else {
        setExportState((prev) => ({
          ...prev,
          status: "error",
          error: (err as Error).message,
        }));
      }
    } finally {
      exportAbortRef.current = null;
    }
  };

  const handleCancelExport = () => {
    exportAbortRef.current?.abort();
  };

  const handleDownload = async () => {
    if (exportState.downloadUrl) {
      const a = document.createElement("a");
      a.href = exportState.downloadUrl;
      a.download = "export.mp4";
      a.click();
    }
  };

  const resetExport = () => {
    exportAbortRef.current?.abort();
    exportAbortRef.current = null;
    if (exportState.downloadUrl) URL.revokeObjectURL(exportState.downloadUrl);
    setExportState({
      status: "idle",
      percent: 0,
      stage: null,
      error: null,
      downloadUrl: null,
    });
  };

  // Build current files object for UploadDropZone
  const currentFiles = {
    musicxml: musicXMLFile
      ? { name: musicXMLFile.name, measureCount: musicXMLFile.measureCount }
      : undefined,
    audio: audioFile ? { name: audioFile.name } : undefined,
    image: bgFileName ? { name: bgFileName } : undefined,
  };

  return (
    <ToastProvider>
      <main className="h-screen flex flex-col bg-canvas text-fg">
        {/* Top header bar */}
        <div className="flex-shrink-0 bg-canvas border-b border-line px-3 py-2 flex items-center gap-3">
          {onNavigateDashboard && (
            <button
              onClick={onNavigateDashboard}
              className="flex items-center gap-1.5 text-fg-subtle hover:text-fg-muted transition-colors cursor-pointer"
              title="Dashboard"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          )}
          <ManuscriptMark className="h-5 w-5 opacity-70" />
          <div className="w-px h-4 bg-surface-muted" />
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            spellCheck={false}
            className="text-xs font-medium bg-transparent border-none outline-none text-fg-muted placeholder-fg-subtle focus:text-fg min-w-0 max-w-[200px] transition-colors"
            placeholder="Untitled Project"
          />
          {musicXMLFile && (
            <>
              <div className="w-px h-4 bg-surface-muted" />
              <div className="flex gap-1">
                <button
                  onClick={() => setCurrentView("renderer")}
                  className={
                    currentView === "renderer"
                      ? "grunge-tab-active"
                      : "grunge-tab"
                  }
                >
                  Preview
                </button>
                <button
                  onClick={() => setCurrentView("sync")}
                  className={
                    currentView === "sync" ? "grunge-tab-active" : "grunge-tab"
                  }
                >
                  Sync Editor
                </button>
              </div>
            </>
          )}
          <div className="flex-1" />
          {currentView === "renderer" && musicXMLFile && (
            <button
              onClick={() => setZoomEnabled((prev) => !prev)}
              className={zoomEnabled ? "grunge-tab-active" : "grunge-tab"}
            >
              {zoomEnabled ? "Disable Zoom" : "Enable Zoom"}
            </button>
          )}
          {projectId && <SaveIndicator />}
        </div>

        <div className="flex-1 flex min-h-0">
          <aside
            className="w-72 shrink-0 bg-surface border-r border-line flex flex-col overflow-hidden"
            style={{ display: currentView === "sync" ? "none" : undefined }}
          >
            <div className="flex-1 min-h-0 overflow-auto grunge-scrollbar px-4 py-1">
              {/* BACKGROUND SECTION */}
              <section className="grunge-section">
                <h2 className="grunge-section-title">Background</h2>
                <div className="grunge-section-body">
                  {projectId ? (
                    <BackgroundControl
                      projectId={projectId}
                      aspectRatio={projectAspectRatio || 16 / 9}
                      bgUrl={bgUrl}
                      bgFileName={bgFileName}
                      bgCrop={bgCrop}
                      bgColor={bgColor}
                      bgMode={bgMode}
                      onImageUpload={handleImageUpload}
                      onCropChange={(crop) => setSetting("bgCrop", crop)}
                      onColorChange={(color) => setSetting("bgColor", color)}
                      onModeChange={(m) => setSetting("bgMode", m)}
                    />
                  ) : (
                    <UploadDropZone
                      projectId={projectId}
                      onMusicXMLUpload={handleMusicXMLUpload}
                      onAudioUpload={handleAudioUpload}
                      onImageUpload={handleImageUpload}
                      currentFiles={currentFiles}
                    />
                  )}
                </div>
              </section>

              {/* ASPECT RATIO SECTION */}
              <section className="grunge-section">
                <h2 className="grunge-section-title">Frame Aspect Ratio</h2>
                <div className="grunge-section-body">
                  <AspectRatioControl
                    value={projectAspectRatio || 16 / 9}
                    onChange={(ratio) => {
                      setSetting("aspectRatio", ratio);
                      // The region is sized for the old frame — reset to default.
                      setSetting("scoreRegion", null);
                      setIsEditingRegion(false);
                    }}
                  />
                </div>
              </section>

              {/* Hidden audio element for duration detection (used by export).
                  preload="metadata": only the duration is needed here — the
                  renderer creates its own playback element, so without this
                  the same audio gets fetched/buffered twice. */}
              {audioFile && (
                <audio
                  ref={audioRef}
                  src={audioFile.url}
                  preload="metadata"
                  className="hidden"
                />
              )}

              {/* PLAYBACK SECTION */}
              <section className="grunge-section">
                <h2 className="grunge-section-title">Playback</h2>
                <div className="grunge-section-body">
                  <div className="grunge-field">
                    <div className="grunge-field-head">
                      <span className="grunge-label">Frame Rate</span>
                      <span className="grunge-field-value">{fps} fps</span>
                    </div>
                    <input
                      type="range"
                      min={15}
                      max={60}
                      step={1}
                      value={fps}
                      onChange={(e) =>
                        setSetting("fps", Number(e.target.value))
                      }
                      className="grunge-range"
                    />
                  </div>
                </div>
              </section>

              {/* SCORE APPEARANCE SECTION */}
              <section className="grunge-section">
                <h2 className="grunge-section-title">Score Appearance</h2>
                <div className="grunge-section-body">
                  <div className="grunge-field">
                    <label className="grunge-label">Layout</label>
                    <select
                      value={viewMode}
                      onChange={(e) =>
                        setSetting(
                          "viewMode",
                          e.target.value as "page" | "single-line",
                        )
                      }
                      className="grunge-select w-full"
                    >
                      <option value="page">Page</option>
                      <option value="single-line">Single Line</option>
                    </select>
                  </div>

                  <div className="grunge-field">
                    <label className="grunge-label">Music Font</label>
                    <select
                      value={musicFont}
                      onChange={(e) => setSetting("musicFont", e.target.value)}
                      className="grunge-select w-full"
                    >
                      <option value="Bravura">Bravura</option>
                      <option value="Petaluma">Petaluma</option>
                      <option value="Leland">Leland</option>
                      <option value="Gootville">Gootville</option>
                      <option value="Leipzig">Leipzig</option>
                    </select>
                  </div>

                  <div className="grunge-field">
                    <div className="grunge-field-head">
                      <span className="grunge-label">Size</span>
                      <span className="grunge-field-value">
                        {Math.round(scoreScale * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={1.5}
                      step={0.05}
                      value={scoreScale}
                      onChange={(e) =>
                        setSetting("scoreScale", Number(e.target.value))
                      }
                      className="grunge-range"
                    />
                  </div>

                  <div className="grunge-field">
                    <label className="grunge-label">Color</label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="color"
                        value={scoreColor}
                        onChange={(e) =>
                          setSetting("scoreColor", e.target.value)
                        }
                        className="grunge-color-picker"
                      />
                      <span className="grunge-color-value">{scoreColor}</span>
                    </div>
                  </div>

                  <BorderPicker
                    value={scoreBorder}
                    onChange={(style) => setSetting("scoreBorder", style)}
                    color={scoreColor}
                  />

                  <label className="grunge-toggle-row">
                    <input
                      type="checkbox"
                      checked={hideLabels}
                      onChange={(e) =>
                        setSetting("hideLabels", e.target.checked)
                      }
                      className="grunge-checkbox"
                    />
                    <span>Hide Instrument Labels</span>
                  </label>

                  {/* Score Region Editor */}
                  {isEditingRegion ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowResetConfirm(true)}
                        className="grunge-btn grunge-btn-sm flex-1"
                      >
                        Reset
                      </button>
                      <button
                        onClick={() => {
                          setIsEditingRegion(false);
                          setShowResetConfirm(false);
                        }}
                        className="grunge-btn-primary grunge-btn-sm flex-1"
                      >
                        Done
                      </button>
                    </div>
                  ) : (
                    <div className="grunge-field">
                      <button
                        onClick={() => setIsEditingRegion(true)}
                        disabled={!regionContainerDims}
                        className="grunge-btn grunge-btn-sm w-full"
                      >
                        Edit Score Region
                      </button>
                      {scoreRegion && (
                        <span className="grunge-label">
                          Custom region: {Math.round(scoreRegion.width)}x
                          {Math.round(scoreRegion.height)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </section>

              {/* NOTE ANIMATION SECTION */}
              <section className="grunge-section">
                <h2 className="grunge-section-title">Note Animation</h2>
                <div className="grunge-section-body">
                  <label className="grunge-toggle-row">
                    <input
                      type="checkbox"
                      checked={activeNoteheadColor !== null}
                      onChange={(e) =>
                        setSetting(
                          "activeNoteheadColor",
                          e.target.checked ? scoreColor : null,
                        )
                      }
                      className="grunge-checkbox"
                    />
                    <span>Highlight Active Notes</span>
                  </label>

                  {activeNoteheadColor !== null && (
                    <>
                      <div className="grunge-field">
                        <label className="grunge-label">Highlight Color</label>
                        <div className="flex gap-2 items-center">
                          <input
                            type="color"
                            value={activeNoteheadColor}
                            onChange={(e) =>
                              setSetting("activeNoteheadColor", e.target.value)
                            }
                            className="grunge-color-picker"
                          />
                          <span className="grunge-color-value">
                            {activeNoteheadColor}
                          </span>
                        </div>
                      </div>

                      <div className="grunge-field">
                        <span className="grunge-label">Also color</span>
                        <div className="flex gap-1.5">
                          {(
                            [
                              [
                                "colorAccidentals",
                                "Accidentals",
                                colorAccidentals,
                              ],
                              ["colorDots", "Dots", colorDots],
                              [
                                "colorArticulations",
                                "Articulations",
                                colorArticulations,
                              ],
                            ] as const
                          ).map(([key, label, value]) => (
                            <button
                              key={key}
                              onClick={() => setSetting(key, !value)}
                              className={
                                value
                                  ? "grunge-chip grunge-chip-active"
                                  : "grunge-chip"
                              }
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  <div className="grunge-field">
                    <div className="grunge-field-head">
                      <span className="grunge-label">Scale</span>
                      <span className="grunge-field-value">
                        {activeNoteheadScale.toFixed(2)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={1.6}
                      step={0.01}
                      value={activeNoteheadScale}
                      onChange={(e) =>
                        setSetting(
                          "activeNoteheadScale",
                          Number(e.target.value),
                        )
                      }
                      className="grunge-range"
                    />
                  </div>

                  <div className="grunge-field">
                    <div className="grunge-field-head">
                      <span className="grunge-label">Hold</span>
                      <span className="grunge-field-value">
                        {activeNoteheadUseNoteDuration
                          ? "auto"
                          : `${activeNoteheadHoldMs}ms`}
                      </span>
                    </div>
                    <label className="grunge-toggle-row">
                      <input
                        type="checkbox"
                        checked={activeNoteheadUseNoteDuration}
                        onChange={(e) =>
                          setSetting(
                            "activeNoteheadUseNoteDuration",
                            e.target.checked,
                          )
                        }
                        className="grunge-checkbox"
                      />
                      <span>Use note duration</span>
                    </label>
                    {!activeNoteheadUseNoteDuration && (
                      <input
                        type="range"
                        min={0}
                        max={1000}
                        step={20}
                        value={activeNoteheadHoldMs}
                        onChange={(e) =>
                          setSetting(
                            "activeNoteheadHoldMs",
                            Number(e.target.value),
                          )
                        }
                        className="grunge-range"
                      />
                    )}
                  </div>

                  <div className="grunge-field">
                    <div className="grunge-field-head">
                      <span className="grunge-label">Exit</span>
                      <span className="grunge-field-value">
                        {activeNoteheadExitMs}ms
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1000}
                      step={20}
                      value={activeNoteheadExitMs}
                      onChange={(e) =>
                        setSetting(
                          "activeNoteheadExitMs",
                          Number(e.target.value),
                        )
                      }
                      className="grunge-range"
                    />
                  </div>

                  {viewMode === "single-line" && (
                    <div className="grunge-field">
                      <label className="grunge-toggle-row">
                        <input
                          type="checkbox"
                          checked={hideUnplayedNotes}
                          onChange={(e) =>
                            setSetting("hideUnplayedNotes", e.target.checked)
                          }
                          className="grunge-checkbox"
                        />
                        <span>Hide Unplayed Notes</span>
                      </label>

                      {hideUnplayedNotes && (
                        <>
                          <label className="grunge-toggle-row">
                            <input
                              type="checkbox"
                              checked={smoothReveal}
                              onChange={(e) =>
                                setSetting("smoothReveal", e.target.checked)
                              }
                              className="grunge-checkbox"
                            />
                            <span>Smooth Fade</span>
                          </label>

                          <div className="grunge-field-head">
                            <span className="grunge-label">Unplayed Opacity</span>
                            <span className="grunge-field-value">
                              {Math.round(unplayedOpacity * 100)}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={5}
                            value={Math.round(unplayedOpacity * 100)}
                            onChange={(e) =>
                              setSetting(
                                "unplayedOpacity",
                                Number(e.target.value) / 100,
                              )
                            }
                            className="grunge-range"
                          />
                        </>
                      )}
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* EXPORT BAR */}
            <div className="flex-shrink-0 border-t border-line px-3 py-3 space-y-2 bg-surface">
              {exportState.status === "idle" && (
                <>
                  <button
                    onClick={handleExport}
                    disabled={!musicXMLFile || !audioFile || anchors.size === 0}
                    className="grunge-btn-export w-full"
                  >
                    Export Video
                  </button>
                  {(!musicXMLFile || !audioFile || anchors.size === 0) && (
                    <p className="text-[10px] text-fg-subtle text-center">
                      {!musicXMLFile
                        ? "Upload a score to export"
                        : !audioFile
                          ? "Upload audio to export"
                          : "Add sync anchors to export"}
                    </p>
                  )}
                </>
              )}

              {(exportState.status === "uploading" ||
                exportState.status === "rendering" ||
                exportState.status === "encoding") && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] uppercase tracking-wider font-semibold">
                    <span className="text-fg-subtle">Exporting</span>
                    <span className="text-fg-muted tabular-nums">
                      {Math.round(exportState.percent)}%
                    </span>
                  </div>
                  <div className="h-1 bg-surface-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all duration-300"
                      style={{ width: `${exportState.percent}%` }}
                    />
                  </div>
                </div>
              )}

              {exportState.status === "complete" && (
                <div className="space-y-2">
                  <p className="text-[10px] text-green-500 uppercase tracking-wider font-semibold text-center">
                    Export complete
                  </p>
                  <button
                    onClick={handleDownload}
                    className="grunge-btn-export w-full"
                  >
                    Download MP4
                  </button>
                  <button
                    onClick={resetExport}
                    className="grunge-btn grunge-btn-sm w-full"
                  >
                    New Export
                  </button>
                </div>
              )}

              {exportState.status === "error" && (
                <div className="space-y-2">
                  <p className="text-[10px] text-red-400/80 text-center">
                    {exportState.error || "Export failed"}
                  </p>
                  <button onClick={resetExport} className="grunge-btn w-full">
                    Try Again
                  </button>
                </div>
              )}

              {exportState.status === "cancelled" && (
                <div className="space-y-2">
                  <p className="text-[10px] text-fg-subtle text-center">
                    Export cancelled
                  </p>
                  <button onClick={resetExport} className="grunge-btn w-full">
                    New Export
                  </button>
                </div>
              )}
            </div>
          </aside>

          <section className="flex-1 flex flex-col bg-canvas">
            {/* Main content */}
            {isLoadingProject ? (
              <div className="flex-1 flex flex-col items-center justify-center">
                <TrebleClefSpinner size={64} className="text-fg-muted" />
                <p
                  className="mt-5 text-xs text-fg-subtle uppercase tracking-widest"
                  style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
                >
                  Loading project
                </p>
              </div>
            ) : musicXMLFile ? (
              <>
                {/* Renderer view - always mounted, hidden when not active */}
                <div
                  className="flex flex-col h-full"
                  style={{
                    display: currentView === "renderer" ? "flex" : "none",
                  }}
                >
                  {/* Renderer content */}
                  <div className="flex-1 min-h-0 overflow-auto">
                    <TransformWrapper
                      onTransformed={(_, state) => setZoomScale(state.scale)}
                      minScale={0.25}
                      maxScale={5}
                      panning={{
                        activationKeys: [],
                        disabled: isEditingRegion,
                      }}
                      wheel={{ disabled: !zoomEnabled }}
                      pinch={{ disabled: !zoomEnabled }}
                      doubleClick={{ disabled: !zoomEnabled, mode: "reset" }}
                    >
                      <TransformComponent
                        wrapperStyle={{ width: "100%", height: "100%" }}
                      >
                        {/* Wrapper for RegularRenderer + overlay */}
                        <div className="relative m-auto w-fit">
                          {viewMode === "single-line" ? (
                            <SingleLineRenderer
                              xml={musicXMLFile.xml}
                              bgUrl={showImageBg ? bgUrl! : undefined}
                              bgCrop={showImageBg ? bgCrop ?? undefined : undefined}
                              aspectRatio={projectAspectRatio || undefined}
                              bgColor={bgColor}
                              onScoreHeight={setSingleLineScoreHeight}
                              fps={fps}
                              scoreColor={scoreColor}
                              syncAnchors={
                                anchors.size > 0 ? anchors : undefined
                              }
                              audioUrl={audioFile?.url}
                              scoreRegion={debouncedScoreRegion}
                              scoreBorder={scoreBorder}
                              scoreScale={debouncedScoreScale}
                              musicFont={musicFont}
                              activeNoteheadColor={
                                activeNoteheadColor ?? undefined
                              }
                              activeNoteheadScale={activeNoteheadScale}
                              activeNoteheadAnimationHoldMs={
                                activeNoteheadHoldMs
                              }
                              activeNoteheadAnimationExitMs={
                                activeNoteheadExitMs
                              }
                              activeNoteheadUseNoteDuration={
                                activeNoteheadUseNoteDuration
                              }
                              colorAccidentals={colorAccidentals}
                              colorDots={colorDots}
                              colorArticulations={colorArticulations}
                              hideLabels={hideLabels}
                              hideUnplayedNotes={hideUnplayedNotes}
                              smoothReveal={smoothReveal}
                              unplayedOpacity={unplayedOpacity}
                              activeLinePosition={activeLinePosition}
                              revealLinePosition={revealLinePosition}
                              fadeOutLinePosition={fadeOutLinePosition}
                              transportPortalEl={transportEl}
                            />
                          ) : (
                            <RegularRenderer
                              xml={musicXMLFile.xml}
                              bgUrl={showImageBg ? bgUrl! : undefined}
                              bgCrop={showImageBg ? bgCrop ?? undefined : undefined}
                              aspectRatio={projectAspectRatio || undefined}
                              bgColor={bgColor}
                              fps={fps}
                              scoreColor={scoreColor}
                              syncAnchors={
                                anchors.size > 0 ? anchors : undefined
                              }
                              audioUrl={audioFile?.url}
                              scoreRegion={debouncedScoreRegion}
                              scoreBorder={scoreBorder}
                              scoreScale={debouncedScoreScale}
                              activeLinePosition={activeLinePosition}
                              musicFont={musicFont}
                              // active notehead options
                              activeNoteheadColor={
                                activeNoteheadColor ?? undefined
                              }
                              activeNoteheadScale={activeNoteheadScale}
                              activeNoteheadAnimationHoldMs={
                                activeNoteheadHoldMs
                              }
                              activeNoteheadAnimationExitMs={
                                activeNoteheadExitMs
                              }
                              activeNoteheadUseNoteDuration={
                                activeNoteheadUseNoteDuration
                              }
                              colorAccidentals={colorAccidentals}
                              colorDots={colorDots}
                              colorArticulations={colorArticulations}
                              hideLabels={hideLabels}
                              transportPortalEl={transportEl}
                            />
                          )}
                          {/* Score Region Editor Overlay - positioned relative to RegularRenderer */}
                          {currentView === "renderer" &&
                            isEditingRegion &&
                            regionContainerDims && (
                              <div
                                className="absolute"
                                style={{
                                  top: 0,
                                  left: 0,
                                  width: regionContainerDims.width,
                                  height: regionContainerDims.height,
                                }}
                              >
                                <ScoreRegionEditor
                                  containerWidth={regionContainerDims.width}
                                  containerHeight={regionContainerDims.height}
                                  initialRegion={scoreRegion}
                                  defaultRegion={editorDefaultRegion}
                                  minWidth={200}
                                  minHeight={editorMinHeight}
                                  onRegionChange={(region) =>
                                    setSetting("scoreRegion", region)
                                  }
                                  scale={zoomScale}
                                  lineAxis={isSingleLine ? "x" : "y"}
                                  activeLinePosition={activeLinePosition}
                                  onActiveLineChange={(p) =>
                                    setSetting("activeLinePosition", p)
                                  }
                                  showRevealLine={isSingleLine && hideUnplayedNotes}
                                  revealLinePosition={revealLinePosition}
                                  onRevealLineChange={(p) =>
                                    setSetting("revealLinePosition", p)
                                  }
                                  fadeOutLinePosition={fadeOutLinePosition}
                                  onFadeOutLineChange={(p) =>
                                    setSetting("fadeOutLinePosition", p)
                                  }
                                />
                              </div>
                            )}
                        </div>
                      </TransformComponent>
                    </TransformWrapper>
                  </div>
                  {/* Transport bar portal target - always visible at bottom of preview */}
                  <div
                    ref={setTransportEl}
                    className="flex-shrink-0 bg-canvas border-t border-line px-3 py-2.5"
                  />
                </div>
                {/* Sync Editor view - only mounted when active to save ~100-200MB */}
                {currentView === "sync" && (
                  <SyncEditor
                    xml={musicXMLFile.xml}
                    audioUrl={audioFile?.url}
                  />
                )}
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center p-8">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-surface-muted mb-4">
                    <svg
                      className="w-8 h-8 text-fg-subtle"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M9 18V5l12-2v13" />
                      <circle cx="6" cy="18" r="3" />
                      <circle cx="18" cy="16" r="3" />
                    </svg>
                  </div>
                  <h2 className="text-sm font-medium text-fg-muted mb-1.5">
                    No Score Loaded
                  </h2>
                  <p className="text-xs text-fg-subtle max-w-xs leading-relaxed">
                    Upload a MusicXML file to begin.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
      {/* Export Progress Modal - blocks all interaction */}
      {(exportState.status === "uploading" ||
        exportState.status === "rendering" ||
        exportState.status === "encoding") && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          {/* Blurred backdrop */}
          <div
            className="absolute inset-0 bg-overlay"
            style={{
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            }}
          />
          {/* Modal */}
          <div
            className="relative z-10 w-full max-w-md mx-4 rounded bg-surface border border-line"
            style={{
              padding: "2rem",
            }}
          >
            <h3 className="text-xs font-semibold text-fg-muted mb-6 uppercase tracking-widest text-center">
              Exporting Video
            </h3>

            {/* Progress */}
            <div className="space-y-2 mb-6">
              <div className="flex justify-between text-[11px]">
                <span className="text-fg-subtle uppercase font-semibold tracking-wide">
                  {exportState.stage || exportState.status}
                </span>
                <span className="text-fg-muted tabular-nums">
                  {Math.round(exportState.percent)}%
                </span>
              </div>
              <div
                className="bg-surface-muted"
                style={{
                  width: "100%",
                  height: "4px",
                }}
              >
                <div
                  className="bg-accent"
                  style={{
                    width: `${exportState.percent}%`,
                    height: "4px",
                    transition: "width 300ms",
                  }}
                />
              </div>
            </div>

            {/* Fun fact */}
            <div className="mb-6 border-l border-line-strong pl-3">
              <p className="text-[10px] text-fg-subtle uppercase tracking-widest font-semibold mb-1">
                Did you know?
              </p>
              <p className="text-[11px] text-fg-subtle leading-relaxed">
                Bach loved coffee so much he wrote a comic cantata about it
                &mdash; the &ldquo;Coffee Cantata&rdquo; (BWV 211), featuring a
                father trying to cure his daughter&rsquo;s coffee addiction.
              </p>
              <p className="text-[10px] text-fg-subtle mt-1.5">
                Maybe grab a cup while you wait.
              </p>
            </div>

            {/* Cancel */}
            <button onClick={handleCancelExport} className="grunge-btn w-full">
              Cancel Export
            </button>
          </div>
        </div>
      )}

      {/* Reset Score Region Confirmation Dialog */}
      {showResetConfirm && (
        <div className="fixed inset-0 flex items-center justify-center z-[70]">
          <div
            className="absolute inset-0 bg-overlay"
            onClick={() => setShowResetConfirm(false)}
          />
          <div className="relative bg-surface border border-line rounded p-5 max-w-sm mx-4">
            <h3 className="text-xs font-semibold text-fg mb-2 uppercase tracking-wider">
              Reset Score Region?
            </h3>
            <p className="text-[11px] text-fg-subtle mb-4 leading-relaxed">
              This resets the score to the full background area and recenters the
              active and reveal lines.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="grunge-btn grunge-btn-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setSetting("scoreRegion", null);
                  setSetting("activeLinePosition", DEFAULT_SETTINGS.activeLinePosition);
                  setSetting("revealLinePosition", DEFAULT_SETTINGS.revealLinePosition);
                  setSetting("fadeOutLinePosition", DEFAULT_SETTINGS.fadeOutLinePosition);
                  setIsEditingRegion(false);
                  setShowResetConfirm(false);
                }}
                className="grunge-btn-primary grunge-btn-sm"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastProvider>
  );
}
