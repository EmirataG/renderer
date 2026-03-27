import { useState, useRef, useEffect, useCallback } from "react";
import RegularRenderer from "./renderers/RegularRenderer";
import SingleLineRenderer from "./renderers/SingleLineRenderer";
import { SyncEditor } from "./components/SyncEditor";
import { ToastProvider } from "./components/Toast";
import { UploadDropZone } from "./components/UploadDropZone";
import { ScoreRegionEditor } from "./components/ScoreRegionEditor";
import { BorderPicker } from "./components/BorderPicker";
import { BorderStyle } from "./borders";
import { useSyncStore } from "./stores/syncStore";
import { useProjectStore, DEFAULT_SETTINGS } from "./stores/projectStore";
import { useEventStore } from "./stores/eventStore";
import { SaveIndicator } from "./components/SaveIndicator";
import { initAutoSave } from "./lib/autoSave";
import type { ScoreRegion } from "./types/score";
import { TrebleClefSpinner } from "./components/TrebleClefSpinner";
import type { ExportSettings } from "./lib/exportClient";
import { clientExport } from "./lib/clientExport";
import { auth } from "./lib/firebase-client";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

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
  const scoreRegion = useProjectStore((s) => s.scoreRegion);
  const scoreBorder = useProjectStore((s) => s.scoreBorder);
  const scoreScale = useProjectStore((s) => s.scoreScale);
  const musicFont = useProjectStore((s) => s.musicFont);
  const hideLabels = useProjectStore((s) => s.hideLabels);
  const activeNoteheadColor = useProjectStore((s) => s.activeNoteheadColor);
  const activeNoteheadScale = useProjectStore((s) => s.activeNoteheadScale);
  const activeNoteheadEntryMs = useProjectStore((s) => s.activeNoteheadEntryMs);
  const activeNoteheadHoldMs = useProjectStore((s) => s.activeNoteheadHoldMs);
  const activeNoteheadExitMs = useProjectStore((s) => s.activeNoteheadExitMs);
  const colorFullNote = useProjectStore((s) => s.colorFullNote);
  const setSetting = useProjectStore((s) => s.setSetting);
  const projectName = useProjectStore((s) => s.projectName);
  const setProjectName = useProjectStore((s) => s.setProjectName);

  // Check for renderer mode via URL query param
  const useSingleLineRenderer =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("renderer") ===
      "single-line";

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
  const [bgFile, setBgFile] = useState<File | null>(null);

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

        // Load score XML via server proxy (avoids CORS with Storage URLs)
        if (project.scoreUrl) {
          const scoreRes = await fetch(`/api/projects/${projectId}/score`);
          if (cancelled) return;
          if (scoreRes.ok) {
            const xml = await scoreRes.text();
            setMusicXMLFile({
              xml,
              name: project.scoreFileName || "score.xml",
              measureCount: 0, // Verovio will calculate on render
            });
          }
        }

        if (cancelled) return;

        // Set audio via server proxy (avoids CORS, supports range requests for seeking)
        if (project.audioUrl) {
          setAudioFile({
            url: `/api/projects/${projectId}/audio`,
            name: project.audioFileName || "audio.mp3",
            file: null,
          });
        }

        // Set background image via server proxy (avoids CORS for export fetch)
        if (project.backgroundUrl) {
          setBgUrl(`/api/projects/${projectId}/background`);
          setBgFileName(project.backgroundFileName || null);
        }

        // Load settings from API response into projectStore
        const { loadSettings, setProjectId, setProjectName } =
          useProjectStore.getState();
        setProjectId(projectId!);
        if (project.name) setProjectName(project.name);
        loadSettings({
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
          activeNoteheadEntryMs:
            project.activeNoteheadEntryMs ??
            DEFAULT_SETTINGS.activeNoteheadEntryMs,
          activeNoteheadHoldMs:
            project.activeNoteheadHoldMs ??
            DEFAULT_SETTINGS.activeNoteheadHoldMs,
          activeNoteheadExitMs:
            project.activeNoteheadExitMs ??
            DEFAULT_SETTINGS.activeNoteheadExitMs,
          colorFullNote:
            project.colorFullNote ?? DEFAULT_SETTINGS.colorFullNote,
          fps: project.fps ?? DEFAULT_SETTINGS.fps,
          scoreShadowDistance:
            project.scoreShadowDistance ?? DEFAULT_SETTINGS.scoreShadowDistance,
          hideUnplayedNotes:
            project.hideUnplayedNotes ?? DEFAULT_SETTINGS.hideUnplayedNotes,
          smoothReveal: project.smoothReveal ?? DEFAULT_SETTINGS.smoothReveal,
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

  // Calculate container dimensions for score region editing
  const WIDTH = 980; // Same as RegularRenderer WIDTH constant
  useEffect(() => {
    if (!bgUrl) {
      // Default 16:9 dimensions when no background
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
  }, [bgUrl]);

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
    jobId: string | null;
    percent: number;
    stage: string | null;
    error: string | null;
    downloadUrl: string | null;
  }>({
    status: "idle",
    jobId: null,
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
    // Handle removal
    if (!audioUrl && audioFile?.url) {
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
    // Handle removal
    if (!imageUrl && bgUrl) {
      URL.revokeObjectURL(bgUrl);
    }
    setBgUrl(imageUrl || null);
    setBgFileName(fileName || null);
    setBgFile(file || null);

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
      jobId: null,
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
        scoreRegion,
        scoreBorder,
        scoreScale,
        musicFont: musicFont as ExportSettings["musicFont"],
        activeNoteheadColor,
        activeNoteheadScale,
        activeNoteheadEntryMs,
        activeNoteheadHoldMs,
        activeNoteheadExitMs,
        colorFullNote,
        hideLabels,
        audioDuration: audioRef.current?.duration,
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

      // Client-side export: render + encode entirely in the browser
      const mp4Blob = await clientExport({
        musicXml: musicXMLFile.xml,
        syncAnchors: anchors,
        settings,
        audioFile: audioFileForExport!,
        bgImageUrl: bgUrl || undefined,
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
      jobId: null,
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
      <main className="h-screen flex flex-col bg-black text-neutral-100">
        {/* Top header bar — spans full width over inspector + content */}
        <div className="flex-shrink-0 bg-black border-b border-neutral-800 px-4 py-2.5 flex items-center gap-4">
          {onNavigateDashboard && (
            <button
              onClick={onNavigateDashboard}
              className="flex items-center gap-1.5 text-neutral-500 hover:text-neutral-100 transition-colors mr-2 cursor-pointer"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </button>
          )}
          <div className="w-px h-5 bg-neutral-800" />
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            spellCheck={false}
            className="text-sm font-semibold bg-transparent border-none outline-none text-neutral-200 placeholder-neutral-600 focus:text-white min-w-0 max-w-[200px]"
            style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
            placeholder="Untitled Project"
          />
          <div className="w-px h-5 bg-neutral-800" />
          {musicXMLFile && (
            <div className="flex gap-0">
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
          )}
          <div className="flex-1" />
          {currentView === "renderer" && musicXMLFile && (
            <button
              onClick={() => setZoomEnabled((prev) => !prev)}
              className={
                zoomEnabled ? "grunge-tab-active" : "grunge-tab"
              }
            >
              {zoomEnabled ? "Disable Zoom" : "Enable Zoom"}
            </button>
          )}
          {projectId && <SaveIndicator />}
        </div>

        <div className="flex-1 flex min-h-0">
          <aside
            className="w-80 bg-black border-r border-neutral-800 flex flex-col overflow-hidden"
            style={{ display: currentView === "sync" ? "none" : undefined }}
          >
            <div className="flex-1 min-h-0 overflow-auto grunge-scrollbar px-4 py-4 space-y-1">
              {/* UPLOAD SECTION */}
              <section className="mb-5">
                <h2 className="grunge-section-title">Project Files</h2>
                <div className="p-3">
                  <UploadDropZone
                    projectId={projectId}
                    onMusicXMLUpload={handleMusicXMLUpload}
                    onAudioUpload={handleAudioUpload}
                    onImageUpload={handleImageUpload}
                    currentFiles={currentFiles}
                  />
                </div>
              </section>

              {/* Hidden audio element for duration detection (used by export) */}
              {audioFile && (
                <audio ref={audioRef} src={audioFile.url} className="hidden" />
              )}

              {/* PLAYBACK SECTION */}
              <section className="mb-5">
                <h2 className="grunge-section-title">Playback</h2>
                <div className="p-3 space-y-4">
                  <div className="space-y-2">
                    <label className="flex justify-between text-xs font-medium">
                      <span className="text-neutral-300">Frame Rate (FPS)</span>
                      <span className="text-white font-mono tabular-nums">
                        {fps}
                      </span>
                    </label>
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
              <section className="mb-5">
                <h2 className="grunge-section-title">Score Appearance</h2>
                <div className="p-3 space-y-4">
                  <div className="space-y-2">
                    <label className="block text-xs text-neutral-300 font-medium">
                      Color
                    </label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="color"
                        value={scoreColor}
                        onChange={(e) =>
                          setSetting("scoreColor", e.target.value)
                        }
                        className="grunge-color-picker"
                      />
                      <span className="text-xs text-neutral-400 font-mono">
                        {scoreColor}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="flex justify-between text-xs font-medium">
                      <span className="text-neutral-300">Size</span>
                      <span className="text-white font-mono">
                        {Math.round(scoreScale * 100)}%
                      </span>
                    </label>
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

                  <div className="space-y-2">
                    <label className="block text-xs text-neutral-300 font-medium">
                      Music Font
                    </label>
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

                  <div className="pt-1 pb-2">
                    <label className="flex items-center gap-2.5 text-xs cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={hideLabels}
                        onChange={(e) =>
                          setSetting("hideLabels", e.target.checked)
                        }
                        className="grunge-checkbox"
                      />
                      <span className="font-medium text-neutral-300 group-hover:text-neutral-100 transition-colors">
                        Hide Instrument Labels
                      </span>
                    </label>
                  </div>

                  {/* Border Picker */}
                  <BorderPicker
                    value={scoreBorder}
                    onChange={(style) => setSetting("scoreBorder", style)}
                    color={scoreColor}
                  />

                  {/* Score Region Editor Button */}
                  <div className="pt-2 border-t border-neutral-700">
                    {isEditingRegion ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowResetConfirm(true)}
                          className="grunge-btn grunge-btn-sm flex-1"
                        >
                          Use Full Background
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
                      <>
                        <button
                          onClick={() => setIsEditingRegion(true)}
                          disabled={!bgUrl}
                          className="grunge-btn grunge-btn-sm w-full"
                        >
                          Edit Score Region
                        </button>
                        {scoreRegion && (
                          <p className="text-xs text-neutral-500 mt-2">
                            Custom region: {Math.round(scoreRegion.width)}x
                            {Math.round(scoreRegion.height)}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </section>

              {/* NOTE ANIMATION SECTION */}
              <section className="mb-5">
                <h2 className="grunge-section-title">Note Animation</h2>
                <div className="p-3 space-y-4">
                  <div className="pt-1 pb-2">
                    <label className="flex items-center gap-2.5 text-xs cursor-pointer group">
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
                      <span className="font-medium text-neutral-300 group-hover:text-neutral-100 transition-colors">
                        Highlight Active Notes
                      </span>
                    </label>
                  </div>

                  {activeNoteheadColor !== null && (
                    <>
                      <div className="space-y-2">
                        <label className="block text-xs text-neutral-300 font-medium">
                          Highlight Color
                        </label>
                        <div className="flex gap-2 items-center">
                          <input
                            type="color"
                            value={activeNoteheadColor}
                            onChange={(e) =>
                              setSetting("activeNoteheadColor", e.target.value)
                            }
                            className="grunge-color-picker"
                          />
                          <span className="text-xs text-neutral-400 font-mono">
                            {activeNoteheadColor}
                          </span>
                        </div>
                      </div>

                      <div className="pt-1">
                        <label className="flex items-center gap-2.5 text-xs cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={colorFullNote}
                            onChange={(e) =>
                              setSetting("colorFullNote", e.target.checked)
                            }
                            className="grunge-checkbox"
                          />
                          <span className="font-medium text-neutral-300 group-hover:text-neutral-100 transition-colors">
                            Color Stems & Accidentals
                          </span>
                        </label>
                      </div>
                    </>
                  )}

                  <div className="space-y-2">
                    <label className="flex justify-between text-xs font-medium">
                      <span className="text-neutral-300">Scale</span>
                      <span className="text-white font-mono tabular-nums">
                        {activeNoteheadScale.toFixed(2)}x
                      </span>
                    </label>
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

                  <div className="space-y-2">
                    <label className="flex justify-between text-xs font-medium">
                      <span className="text-neutral-300">Entry Duration</span>
                      <span className="text-white font-mono tabular-nums">
                        {activeNoteheadEntryMs}ms
                      </span>
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={300}
                      step={10}
                      value={activeNoteheadEntryMs}
                      onChange={(e) =>
                        setSetting(
                          "activeNoteheadEntryMs",
                          Number(e.target.value),
                        )
                      }
                      className="grunge-range"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="flex justify-between text-xs font-medium">
                      <span className="text-neutral-300">Hold Duration</span>
                      <span className="text-white font-mono tabular-nums">
                        {activeNoteheadHoldMs}ms
                      </span>
                    </label>
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
                  </div>

                  <div className="space-y-2">
                    <label className="flex justify-between text-xs font-medium">
                      <span className="text-neutral-300">Exit Duration</span>
                      <span className="text-white font-mono tabular-nums">
                        {activeNoteheadExitMs}ms
                      </span>
                    </label>
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
                </div>
              </section>
            </div>

            {/* EXPORT BAR - always visible at bottom of sidebar */}
            <div className="flex-shrink-0 border-t border-neutral-800 px-4 py-3 space-y-3">
              {exportState.status === "idle" && (
                <>
                  <button
                    onClick={handleExport}
                    disabled={!musicXMLFile || !audioFile || anchors.size === 0}
                    className="grunge-btn w-full"
                  >
                    Export Video
                  </button>
                  {(!musicXMLFile || !audioFile || anchors.size === 0) && (
                    <p className="text-xs text-neutral-500">
                      {!musicXMLFile
                        ? "Upload a score first"
                        : !audioFile
                          ? "Upload audio first"
                          : "Add sync anchors first"}
                    </p>
                  )}
                </>
              )}

              {(exportState.status === "uploading" ||
                exportState.status === "rendering" ||
                exportState.status === "encoding") && (
                <>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-neutral-300 capitalize">
                        {exportState.stage || exportState.status}
                      </span>
                      <span className="text-white font-mono tabular-nums">
                        {Math.round(exportState.percent)}%
                      </span>
                    </div>
                    <div className="w-full bg-neutral-700 h-1.5">
                      <div
                        className="bg-white h-1.5 transition-all duration-300"
                        style={{ width: `${exportState.percent}%` }}
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleCancelExport}
                    className="grunge-btn grunge-btn-sm w-full"
                  >
                    Cancel
                  </button>
                </>
              )}

              {exportState.status === "complete" && (
                <>
                  <p className="text-xs text-green-400">Export complete</p>
                  <button
                    onClick={handleDownload}
                    className="grunge-btn w-full"
                  >
                    Download MP4
                  </button>
                  <button
                    onClick={resetExport}
                    className="grunge-btn grunge-btn-sm w-full text-neutral-400"
                  >
                    New Export
                  </button>
                </>
              )}

              {exportState.status === "error" && (
                <>
                  <p className="text-xs text-red-400">
                    {exportState.error || "Export failed"}
                  </p>
                  <button onClick={resetExport} className="grunge-btn w-full">
                    Try Again
                  </button>
                </>
              )}

              {exportState.status === "cancelled" && (
                <>
                  <p className="text-xs text-neutral-400">Export cancelled</p>
                  <button onClick={resetExport} className="grunge-btn w-full">
                    New Export
                  </button>
                </>
              )}
            </div>
          </aside>

          <section className="flex-1 flex flex-col bg-black">
            {/* Main content */}
            {isLoadingProject ? (
              <div className="flex-1 flex flex-col items-center justify-center">
                <TrebleClefSpinner size={64} className="text-neutral-400" />
                <p
                  className="mt-5 text-xs text-neutral-500 uppercase tracking-widest"
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
                      panning={{ activationKeys: [], disabled: isEditingRegion }}
                      wheel={{ disabled: !zoomEnabled }}
                      pinch={{ disabled: !zoomEnabled }}
                      doubleClick={{ disabled: !zoomEnabled, mode: "reset" }}
                    >
                      <TransformComponent
                        wrapperStyle={{ width: "100%", height: "100%" }}
                      >
                        {/* Wrapper for RegularRenderer + overlay */}
                        <div className="relative m-auto w-fit">
                          {useSingleLineRenderer ? (
                            <SingleLineRenderer
                              xml={musicXMLFile.xml}
                              bgUrl={bgUrl || undefined}
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
                              activeNoteheadAnimationEntryMs={
                                activeNoteheadEntryMs
                              }
                              activeNoteheadAnimationHoldMs={
                                activeNoteheadHoldMs
                              }
                              activeNoteheadAnimationExitMs={
                                activeNoteheadExitMs
                              }
                              colorFullNote={colorFullNote}
                              hideLabels={hideLabels}
                            />
                          ) : (
                            <RegularRenderer
                              xml={musicXMLFile.xml}
                              bgUrl={bgUrl || undefined}
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
                              // active notehead options
                              activeNoteheadColor={
                                activeNoteheadColor ?? undefined
                              }
                              activeNoteheadScale={activeNoteheadScale}
                              activeNoteheadAnimationEntryMs={
                                activeNoteheadEntryMs
                              }
                              activeNoteheadAnimationHoldMs={
                                activeNoteheadHoldMs
                              }
                              activeNoteheadAnimationExitMs={
                                activeNoteheadExitMs
                              }
                              colorFullNote={colorFullNote}
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
                                  onRegionChange={(region) =>
                                    setSetting("scoreRegion", region)
                                  }
                                  scale={zoomScale}
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
                    className="flex-shrink-0 bg-black border-t border-neutral-800 px-4 py-3"
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
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-neutral-800/50 mb-4">
                    <svg
                      className="w-8 h-8 text-neutral-500"
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
                  <h2 className="text-lg font-medium text-neutral-300 mb-2">
                    No Score Loaded
                  </h2>
                  <p className="text-sm text-neutral-500 max-w-xs">
                    Upload a MusicXML file using the drop zone in the sidebar to
                    begin visualizing your score.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
      {/* Reset Score Region Confirmation Dialog */}
      {showResetConfirm && (
        <div className="fixed inset-0 flex items-center justify-center z-[70]">
          <div className="bg-black border border-neutral-700 p-6 max-w-sm mx-4">
            <h3
              className="text-sm font-bold text-white mb-2 uppercase tracking-wider"
              style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
            >
              Reset Score Region?
            </h3>
            <p className="text-xs text-neutral-400 mb-4">
              This will reset the score to use the full background area.
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
