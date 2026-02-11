import { useState, useRef, useEffect } from "react";
import RegularRenderer from "./renderers/RegularRenderer";
import SingleLineRenderer from "./renderers/SingleLineRenderer";
import { SyncEditor } from "./components/SyncEditor";
import { ToastProvider } from "./components/Toast";
import { UploadDropZone } from "./components/UploadDropZone";
import { ScoreRegionEditor } from "./components/ScoreRegionEditor";
import { BorderPicker } from "./components/BorderPicker";
import { BorderStyle } from "./borders";
import { useSyncStore } from "./stores/syncStore";
import type { ScoreRegion } from "./types/score";
import { requestExport } from "./lib/exportClient";
import type { ExportSettings } from "./lib/exportClient";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

interface AppProps {
  projectId?: string;
}

export default function App({ projectId }: AppProps) {
  // Get sync anchors from store
  const { anchors } = useSyncStore();

  // Check for renderer mode via URL query param
  const useSingleLineRenderer = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('renderer') === 'single-line';

  // File upload state
  const [musicXMLFile, setMusicXMLFile] = useState<{
    xml: string;
    name: string;
    measureCount: number;
  } | null>(null);
  const [audioFile, setAudioFile] = useState<{
    url: string;
    name: string;
    file: File;
  } | null>(null);
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [bgFileName, setBgFileName] = useState<string | null>(null);
  const [bgFile, setBgFile] = useState<File | null>(null);

  // Playback settings
  const [fps, setFps] = useState(30);
  const [scoreColor, setScoreColor] = useState("#000000");
  const [scoreShadowDistance, setScoreShadowDistance] = useState(0);
  const [hideUnplayedNotes, setHideUnplayedNotes] = useState(true);
  const [smoothReveal, setSmoothReveal] = useState(true);

  // View toggle state
  const [currentView, setCurrentView] = useState<'renderer' | 'sync'>('renderer');

  // Audio ref for preview
  const audioRef = useRef<HTMLAudioElement>(null);

  // Transport bar portal target (play/pause/reset rendered here from RegularRenderer)
  const [transportEl, setTransportEl] = useState<HTMLDivElement | null>(null);

  // Score region customization
  const [scoreRegion, setScoreRegion] = useState<ScoreRegion | null>(null);
  const [isEditingRegion, setIsEditingRegion] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [regionContainerDims, setRegionContainerDims] = useState<{ width: number; height: number } | null>(null);

  // Score border style
  const [scoreBorder, setScoreBorder] = useState<BorderStyle>('none');

  // Score scale (size)
  const [scoreScale, setScoreScale] = useState(1.0);
  const [debouncedScoreScale, setDebouncedScoreScale] = useState(1.0);
  const [debouncedScoreRegion, setDebouncedScoreRegion] = useState<ScoreRegion | null>(null);

  // Music font
  const [musicFont, setMusicFont] = useState<string>('Bravura');

  // Hide instrument labels
  const [hideLabels, setHideLabels] = useState(false);

  // Debounce scoreScale to avoid Verovio re-render on every slider tick
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedScoreScale(scoreScale);
    }, 300);
    return () => clearTimeout(timer);
  }, [scoreScale]);

  // Debounce scoreRegion to avoid Verovio re-render on every drag tick
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedScoreRegion(scoreRegion);
    }, 300);
    return () => clearTimeout(timer);
  }, [scoreRegion]);

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

  // Notehead animation controls
  const [activeNoteheadColor, setActiveNoteheadColor] = useState<string | null>(
    "#000000"
  );
  const [activeNoteheadScale, setActiveNoteheadScale] = useState(1.2);
  const [activeNoteheadEntryMs, setActiveNoteheadEntryMs] = useState(50);
  const [activeNoteheadHoldMs, setActiveNoteheadHoldMs] = useState(200);
  const [activeNoteheadExitMs, setActiveNoteheadExitMs] = useState(500);
  const [colorFullNote, setColorFullNote] = useState(false);

  // Export state
  const [exportState, setExportState] = useState<{
    status: 'idle' | 'uploading' | 'rendering' | 'encoding' | 'complete' | 'error' | 'cancelled';
    jobId: string | null;
    percent: number;
    stage: string | null;
    error: string | null;
    downloadUrl: string | null;
  }>({ status: 'idle', jobId: null, percent: 0, stage: null, error: null, downloadUrl: null });
  const wsRef = useRef<WebSocket | null>(null);

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => { wsRef.current?.close(); };
  }, []);

  // Upload handlers
  const handleMusicXMLUpload = (
    xml: string,
    fileName: string,
    measureCount: number
  ) => {
    setMusicXMLFile({ xml, name: fileName, measureCount });
  };

  const handleAudioUpload = (audioUrl: string, fileName: string, file?: File) => {
    // Handle removal
    if (!audioUrl && audioFile?.url) {
      URL.revokeObjectURL(audioFile.url);
    }
    setAudioFile(audioUrl && file ? { url: audioUrl, name: fileName, file } : null);
  };

  const handleImageUpload = (imageUrl: string, fileName: string, file?: File) => {
    // Handle removal
    if (!imageUrl && bgUrl) {
      URL.revokeObjectURL(bgUrl);
    }
    setBgUrl(imageUrl || null);
    setBgFileName(fileName || null);
    setBgFile(file || null);
  };

  // Export handlers
  const handleExport = async () => {
    if (!musicXMLFile || !audioFile) return;

    setExportState({ status: 'uploading', jobId: null, percent: 0, stage: 'Uploading...', error: null, downloadUrl: null });

    try {
      const settings: ExportSettings = {
        fps, scoreColor, scoreShadowDistance, hideUnplayedNotes, smoothReveal,
        scoreRegion, scoreBorder, scoreScale,
        musicFont: musicFont as ExportSettings['musicFont'],
        activeNoteheadColor, activeNoteheadScale,
        activeNoteheadEntryMs, activeNoteheadHoldMs, activeNoteheadExitMs,
        colorFullNote, hideLabels,
        audioDuration: audioRef.current?.duration,
      };

      const backendUrl = process.env.NODE_ENV !== 'production' ? 'http://localhost:3001' : '';
      const response = await requestExport({
        settings,
        syncAnchors: anchors,
        musicXmlContent: musicXMLFile.xml,
        musicXmlFilename: musicXMLFile.name,
        audioFile: audioFile.file,
        bgImageFile: bgFile || undefined,
      }, backendUrl);

      setExportState(prev => ({ ...prev, status: 'rendering', jobId: response.jobId }));

      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsBase = process.env.NODE_ENV !== 'production' ? 'ws://localhost:3001' : `${wsProtocol}//${window.location.host}`;
      const ws = new WebSocket(`${wsBase}/api/export/${response.jobId}/ws`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setExportState(prev => {
          const next = { ...prev };
          // Handle all backend event types
          if (data.type === 'sync') {
            next.percent = data.percent ?? prev.percent;
            next.stage = data.stage ?? prev.stage;
            next.error = data.error ?? prev.error;
            next.downloadUrl = data.downloadUrl ?? prev.downloadUrl;
            if (data.status === 'complete') next.status = 'complete';
            else if (data.status === 'error' || data.status === 'failed') next.status = 'error';
            else if (data.status === 'cancelled') next.status = 'cancelled';
            else if (data.status === 'encoding') next.status = 'encoding';
            else if (data.status === 'rendering') next.status = 'rendering';
          } else if (data.type === 'progress') {
            next.percent = data.percent ?? prev.percent;
            next.stage = 'capturing';
          } else if (data.type === 'stage') {
            next.stage = data.stage ?? prev.stage;
            if (data.stage === 'encoding') next.status = 'encoding';
          } else if (data.type === 'complete') {
            next.status = 'complete';
            next.percent = 100;
            next.downloadUrl = data.downloadUrl ?? prev.downloadUrl;
          } else if (data.type === 'error') {
            next.status = 'error';
            next.error = data.error ?? 'Export failed';
          } else if (data.type === 'cancelled') {
            next.status = 'cancelled';
          }
          return next;
        });
      };

      ws.onerror = () => {
        setExportState(prev => ({ ...prev, status: 'error', error: 'Connection lost' }));
      };

      ws.onclose = () => { wsRef.current = null; };
    } catch (err) {
      setExportState(prev => ({ ...prev, status: 'error', error: (err as Error).message }));
    }
  };

  const handleCancelExport = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'cancel' }));
    }
  };

  const handleDownload = () => {
    if (exportState.downloadUrl) {
      const base = process.env.NODE_ENV !== 'production' ? 'http://localhost:3001' : '';
      window.open(`${base}${exportState.downloadUrl}`, '_blank');
    }
  };

  const resetExport = () => {
    wsRef.current?.close();
    wsRef.current = null;
    setExportState({ status: 'idle', jobId: null, percent: 0, stage: null, error: null, downloadUrl: null });
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
      <main className="h-screen flex bg-black text-neutral-100">
        <aside className="w-80 bg-black border-r border-neutral-800 flex flex-col overflow-hidden" style={{ display: currentView === 'sync' ? 'none' : undefined }}>
          {/* Header */}
          <div className="px-5 py-4 border-b border-neutral-800">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-lg font-bold tracking-wider uppercase" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>Inspector</h1>
                <p className="text-xs text-neutral-500 mt-0.5 uppercase tracking-wider">
                  Score Controls
                </p>
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-auto grunge-scrollbar px-4 py-4 space-y-1">
            {/* UPLOAD SECTION */}
            <section className="mb-5">
              <h2 className="grunge-section-title">
                Project Files
              </h2>
              <div className="p-3">
                <UploadDropZone
                  onMusicXMLUpload={handleMusicXMLUpload}
                  onAudioUpload={handleAudioUpload}
                  onImageUpload={handleImageUpload}
                  currentFiles={currentFiles}
                />
              </div>
            </section>

            {/* Hidden audio element for duration detection (used by export) */}
            {audioFile && (
              <audio
                ref={audioRef}
                src={audioFile.url}
                className="hidden"
              />
            )}

            {/* PLAYBACK SECTION */}
            <section className="mb-5">
              <h2 className="grunge-section-title">
                Playback
              </h2>
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
                    onChange={(e) => setFps(Number(e.target.value))}
                    className="grunge-range"
                  />
                </div>
              </div>
            </section>

            {/* SCORE APPEARANCE SECTION */}
            <section className="mb-5">
              <h2 className="grunge-section-title">
                Score Appearance
              </h2>
              <div className="p-3 space-y-4">
                <div className="space-y-2">
                  <label className="block text-xs text-neutral-300 font-medium">
                    Color
                  </label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={scoreColor}
                      onChange={(e) => setScoreColor(e.target.value)}
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
                    onChange={(e) => setScoreScale(Number(e.target.value))}
                    className="grunge-range"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs text-neutral-300 font-medium">
                    Music Font
                  </label>
                  <select
                    value={musicFont}
                    onChange={(e) => setMusicFont(e.target.value)}
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
                      onChange={(e) => setHideLabels(e.target.checked)}
                      className="grunge-checkbox"
                    />
                    <span className="font-medium text-neutral-300 group-hover:text-neutral-100 transition-colors">
                      Hide Instrument Labels
                    </span>
                  </label>
                </div>

                {/* Border Picker */}
                <BorderPicker value={scoreBorder} onChange={setScoreBorder} color={scoreColor} />

                {/* Score Region Editor Button */}
                <div className="pt-2 border-t border-neutral-700">
                  <button
                    onClick={() => setIsEditingRegion(true)}
                    disabled={!bgUrl}
                    className="grunge-btn grunge-btn-sm w-full"
                  >
                    Edit Score Region
                  </button>
                  {scoreRegion && (
                    <p className="text-xs text-neutral-500 mt-2">
                      Custom region: {Math.round(scoreRegion.width)}x{Math.round(scoreRegion.height)}
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* NOTE ANIMATION SECTION */}
            <section className="mb-5">
              <h2 className="grunge-section-title">
                Note Animation
              </h2>
              <div className="p-3 space-y-4">
                <div className="pt-1 pb-2">
                  <label className="flex items-center gap-2.5 text-xs cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={activeNoteheadColor !== null}
                      onChange={(e) =>
                        setActiveNoteheadColor(
                          e.target.checked ? scoreColor : null
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
                          onChange={(e) => setActiveNoteheadColor(e.target.value)}
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
                          onChange={(e) => setColorFullNote(e.target.checked)}
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
                      setActiveNoteheadScale(Number(e.target.value))
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
                      setActiveNoteheadEntryMs(Number(e.target.value))
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
                      setActiveNoteheadHoldMs(Number(e.target.value))
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
                      setActiveNoteheadExitMs(Number(e.target.value))
                    }
                    className="grunge-range"
                  />
                </div>
              </div>
            </section>

          </div>

          {/* EXPORT BAR - always visible at bottom of sidebar */}
          <div className="flex-shrink-0 border-t border-neutral-800 px-4 py-3 space-y-3">
            {exportState.status === 'idle' && (
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
                    {!musicXMLFile ? 'Upload a score first' : !audioFile ? 'Upload audio first' : 'Add sync anchors first'}
                  </p>
                )}
              </>
            )}

            {(exportState.status === 'uploading' || exportState.status === 'rendering' || exportState.status === 'encoding') && (
              <>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-neutral-300 capitalize">{exportState.stage || exportState.status}</span>
                    <span className="text-white font-mono tabular-nums">{Math.round(exportState.percent)}%</span>
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

            {exportState.status === 'complete' && (
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

            {exportState.status === 'error' && (
              <>
                <p className="text-xs text-red-400">{exportState.error || 'Export failed'}</p>
                <button
                  onClick={resetExport}
                  className="grunge-btn w-full"
                >
                  Try Again
                </button>
              </>
            )}

            {exportState.status === 'cancelled' && (
              <>
                <p className="text-xs text-neutral-400">Export cancelled</p>
                <button
                  onClick={resetExport}
                  className="grunge-btn w-full"
                >
                  New Export
                </button>
              </>
            )}
          </div>
        </aside>

        <section className="flex-1 flex flex-col bg-black">
          {/* Main content */}
          {musicXMLFile ? (
            <>
              {/* Renderer view - always mounted, hidden when not active */}
              <div className="flex flex-col h-full" style={{ display: currentView === 'renderer' ? 'flex' : 'none' }}>
                {/* View toggle header */}
                <div className="flex-shrink-0 bg-black border-b border-neutral-800 px-4 py-3 flex items-center gap-4">
                  <div className="flex gap-0">
                    <button
                      onClick={() => setCurrentView('renderer')}
                      className={currentView === 'renderer' ? 'grunge-tab-active' : 'grunge-tab'}
                    >
                      Preview
                    </button>
                    <button
                      onClick={() => setCurrentView('sync')}
                      className="grunge-tab"
                    >
                      Sync Editor
                    </button>
                  </div>
                  <div className="text-xs text-neutral-500 uppercase tracking-wider">
                    {useSingleLineRenderer ? 'Single-Line Mode' : 'Preview Mode'}
                  </div>
                  {/* Spacer */}
                  <div className="flex-1" />
                </div>
                {/* Renderer content */}
                <div className="flex-1 min-h-0 overflow-auto">
                <TransformWrapper onTransformed={(_, state) => setZoomScale(state.scale)} minScale={0.25} maxScale={5} panning={{ activationKeys: ["Alt"] }} doubleClick={{ mode: "reset" }}>
                  <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
                  {/* Wrapper for RegularRenderer + overlay */}
                  <div className="relative m-auto w-fit">
                    {useSingleLineRenderer ? (
                      <SingleLineRenderer
                        xml={musicXMLFile.xml}
                        bgUrl={bgUrl || undefined}
                        fps={fps}
                        scoreColor={scoreColor}
                        syncAnchors={anchors.size > 0 ? anchors : undefined}
                        audioUrl={audioFile?.url}
                        scoreRegion={debouncedScoreRegion}
                        scoreBorder={scoreBorder}
                        scoreScale={debouncedScoreScale}
                        musicFont={musicFont}
                        activeNoteheadColor={activeNoteheadColor ?? undefined}
                        activeNoteheadScale={activeNoteheadScale}
                        activeNoteheadAnimationEntryMs={activeNoteheadEntryMs}
                        activeNoteheadAnimationHoldMs={activeNoteheadHoldMs}
                        activeNoteheadAnimationExitMs={activeNoteheadExitMs}
                        colorFullNote={colorFullNote}
                        hideLabels={hideLabels}
                      />
                    ) : (
                      <RegularRenderer
                        xml={musicXMLFile.xml}
                        bgUrl={bgUrl || undefined}
                        fps={fps}
                        scoreColor={scoreColor}
                        syncAnchors={anchors.size > 0 ? anchors : undefined}
                        audioUrl={audioFile?.url}
                        scoreRegion={debouncedScoreRegion}
                        scoreBorder={scoreBorder}
                        scoreScale={debouncedScoreScale}
                        musicFont={musicFont}
                        // active notehead options
                        activeNoteheadColor={activeNoteheadColor ?? undefined}
                        activeNoteheadScale={activeNoteheadScale}
                        activeNoteheadAnimationEntryMs={activeNoteheadEntryMs}
                        activeNoteheadAnimationHoldMs={activeNoteheadHoldMs}
                        activeNoteheadAnimationExitMs={activeNoteheadExitMs}
                        colorFullNote={colorFullNote}
                        hideLabels={hideLabels}
                        transportPortalEl={transportEl}
                      />
                    )}
                    {/* Score Region Editor Overlay - positioned relative to RegularRenderer */}
                    {currentView === 'renderer' && isEditingRegion && regionContainerDims && (
                      <div className="absolute" style={{
                        top: 0,
                        left: 0,
                        width: regionContainerDims.width,
                        height: regionContainerDims.height,
                      }}>
                        <ScoreRegionEditor
                          containerWidth={regionContainerDims.width}
                          containerHeight={regionContainerDims.height}
                          initialRegion={scoreRegion}
                          onRegionChange={setScoreRegion}
                          onClose={() => setIsEditingRegion(false)}
                          scale={zoomScale}
                        />
                      </div>
                    )}
                  </div>
                  </TransformComponent>
                </TransformWrapper>
                </div>
                {/* Transport bar portal target - always visible at bottom of preview */}
                <div ref={setTransportEl} className="flex-shrink-0 bg-black border-t border-neutral-800 px-4 py-3" />
              </div>
              {/* Sync Editor view - always mounted, hidden when not active */}
              {/* Use visibility instead of display to preserve Verovio layout calculations */}
              <div style={{
                visibility: currentView === 'sync' ? 'visible' : 'hidden',
                position: currentView === 'sync' ? 'relative' : 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                zIndex: currentView === 'sync' ? 1 : -1,
              }}>
                <SyncEditor
                  xml={musicXMLFile.xml}
                  audioUrl={audioFile?.url}
                  currentView={currentView}
                  onViewChange={setCurrentView}
                />
              </div>
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
      </main>
    </ToastProvider>
  );
}
