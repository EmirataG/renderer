import type { DragEvent, ChangeEvent } from "react";
import { useState, useRef, useCallback } from "react";
import { useToast } from "../hooks/useToast";
import { validateFile } from "../lib/fileValidation";
import type { FileCategory } from "../lib/fileValidation";
import { validateMusicXML, isLikelyMusicXML } from "../lib/musicxmlValidation";

interface UploadDropZoneProps {
  onMusicXMLUpload: (xml: string, fileName: string, measureCount: number) => void;
  onAudioUpload: (audioUrl: string, fileName: string) => void;
  onImageUpload: (imageUrl: string, fileName: string) => void;
  currentFiles: {
    musicxml?: { name: string; measureCount: number };
    audio?: { name: string };
    image?: { name: string };
  };
}

export function UploadDropZone({
  onMusicXMLUpload,
  onAudioUpload,
  onImageUpload,
  currentFiles,
}: UploadDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { show: showToast } = useToast();

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const processMusicXML = useCallback(
    async (file: File) => {
      setIsValidating(true);
      try {
        const text = await file.text();

        // Quick pre-flight check
        if (!isLikelyMusicXML(text)) {
          showToast(
            "File does not appear to be MusicXML. Expected score-partwise or score-timewise root element.",
            "error"
          );
          return;
        }

        // Full MusicXML validation
        const result = await validateMusicXML(text);
        if (!result.valid) {
          showToast(result.error!, "error");
          return;
        }

        onMusicXMLUpload(text, file.name, result.measureCount ?? 0);
        showToast(`Loaded ${file.name} (${result.measureCount} measures)`, "success");
      } catch {
        showToast("Failed to read MusicXML file", "error");
      } finally {
        setIsValidating(false);
      }
    },
    [showToast, onMusicXMLUpload]
  );

  const processAudio = useCallback(
    (file: File) => {
      const url = URL.createObjectURL(file);
      onAudioUpload(url, file.name);
      showToast(`Loaded audio: ${file.name}`, "success");
    },
    [showToast, onAudioUpload]
  );

  const processImage = useCallback(
    (file: File) => {
      const url = URL.createObjectURL(file);
      onImageUpload(url, file.name);
      showToast(`Loaded background: ${file.name}`, "success");
    },
    [showToast, onImageUpload]
  );

  const processFile = useCallback(
    async (file: File) => {
      // Validate file type and size
      const validation = validateFile(file);
      if (!validation.valid) {
        showToast(validation.error!, "error");
        return;
      }

      const category = validation.category!;

      switch (category) {
        case "musicxml":
          await processMusicXML(file);
          break;
        case "audio":
          processAudio(file);
          break;
        case "image":
          processImage(file);
          break;
      }
    },
    [showToast, processMusicXML, processAudio, processImage]
  );

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      // Process each file (supports multi-file drop)
      for (const file of files) {
        await processFile(file);
      }
    },
    [processFile]
  );

  const handleFileInputChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      for (const file of files) {
        await processFile(file);
      }
      // Reset input so same file can be selected again
      e.target.value = "";
    },
    [processFile]
  );

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleRemove = (category: FileCategory) => {
    switch (category) {
      case "musicxml":
        // Can't really "remove" - user must upload new one
        // This is handled by replacing
        break;
      case "audio":
        onAudioUpload("", "");
        break;
      case "image":
        onImageUpload("", "");
        break;
    }
  };

  // All supported file types for the input accept attribute
  const acceptedTypes =
    ".xml,.musicxml,.mp3,.wav,.ogg,.m4a,.jpg,.jpeg,.png,.webp";

  return (
    <div className="space-y-3">
      {/* Drop Zone */}
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative cursor-pointer border-2 border-dashed p-6
          transition-all duration-200 ease-out
          ${
            isDragOver
              ? "border-white bg-white/5"
              : "border-neutral-600 hover:border-neutral-500 hover:bg-neutral-800/30"
          }
          ${isValidating ? "pointer-events-none opacity-60" : ""}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptedTypes}
          multiple
          onChange={handleFileInputChange}
          className="hidden"
        />

        <div className="text-center">
          {isValidating ? (
            <>
              <LoadingIcon className="mx-auto h-8 w-8 text-blue-400 animate-spin" />
              <p className="mt-2 text-sm text-neutral-300">Validating MusicXML...</p>
            </>
          ) : (
            <>
              <UploadIcon className="mx-auto h-8 w-8 text-neutral-400" />
              <p className="mt-2 text-sm text-neutral-300">
                Drop files here or click to browse
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                MusicXML, Audio, or Image files
              </p>
            </>
          )}
        </div>
      </div>

      {/* Current Files Status */}
      <div className="space-y-2">
        {/* MusicXML Status */}
        <FileStatusCard
          label="Score"
          icon={<MusicIcon className="h-4 w-4" />}
          file={
            currentFiles.musicxml
              ? {
                  name: currentFiles.musicxml.name,
                  detail: `${currentFiles.musicxml.measureCount} measures`,
                }
              : null
          }
          onRemove={() => handleRemove("musicxml")}
          removable={false}
        />

        {/* Audio Status */}
        <FileStatusCard
          label="Audio"
          icon={<AudioIcon className="h-4 w-4" />}
          file={currentFiles.audio ? { name: currentFiles.audio.name } : null}
          onRemove={() => handleRemove("audio")}
          removable={!!currentFiles.audio}
        />

        {/* Image Status */}
        <FileStatusCard
          label="Background"
          icon={<ImageIcon className="h-4 w-4" />}
          file={currentFiles.image ? { name: currentFiles.image.name } : null}
          onRemove={() => handleRemove("image")}
          removable={!!currentFiles.image}
        />
      </div>
    </div>
  );
}

interface FileStatusCardProps {
  label: string;
  icon: React.ReactNode;
  file: { name: string; detail?: string } | null;
  onRemove: () => void;
  removable: boolean;
}

function FileStatusCard({
  label,
  icon,
  file,
  onRemove,
  removable,
}: FileStatusCardProps) {
  return (
    <div className="flex items-center gap-2 rounded bg-neutral-800/50 px-3 py-2 text-xs">
      <span className="text-neutral-400">{icon}</span>
      <span className="text-neutral-400 w-20">{label}:</span>
      {file ? (
        <>
          <span className="flex-1 truncate text-neutral-200">{file.name}</span>
          {file.detail && (
            <span className="text-neutral-500">{file.detail}</span>
          )}
          {removable && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="p-0.5 hover:bg-neutral-700 rounded transition-colors"
              aria-label={`Remove ${label}`}
            >
              <CloseIcon className="h-3 w-3 text-neutral-400 hover:text-neutral-200" />
            </button>
          )}
        </>
      ) : (
        <span className="flex-1 text-neutral-500 italic">Not uploaded</span>
      )}
    </div>
  );
}

// Icons
function UploadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17,8 12,3 7,8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function LoadingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" opacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}

function MusicIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

function AudioIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polygon points="11,5 6,9 2,9 2,15 6,15 11,19 11,5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

function ImageIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21,15 16,10 5,21" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
