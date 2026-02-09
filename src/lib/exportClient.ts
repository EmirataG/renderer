import type { ScoreRegion } from '../types/score';
import type { BorderStyle } from '../borders';

/**
 * Settings for a video export job.
 * Mirrors the ExportSettingsSchema from the export-service.
 */
export interface ExportSettings {
  fps: number;
  scoreColor: string;
  scoreShadowDistance: number;
  hideUnplayedNotes: boolean;
  smoothReveal: boolean;
  scoreRegion: ScoreRegion | null;
  scoreBorder: BorderStyle;
  scoreScale: number;
  musicFont: 'Bravura' | 'Petaluma' | 'Leland' | 'Gootville' | 'Leipzig';
  activeNoteheadColor: string | null;
  activeNoteheadScale: number;
  activeNoteheadEntryMs: number;
  activeNoteheadHoldMs: number;
  activeNoteheadExitMs: number;
  colorFullNote: boolean;
  audioDuration?: number;
}

/**
 * Request payload for submitting a video export job.
 * syncAnchors is the raw Map from syncStore -- serialized with Object.fromEntries().
 */
export interface ExportRequest {
  settings: ExportSettings;
  syncAnchors: Map<string, number>;
  musicXmlContent: string;
  musicXmlFilename: string;
  audioFile: File;
  bgImageFile?: File;
}

/**
 * Response from a successful export submission.
 */
export interface ExportResponse {
  jobId: string;
  status: string;
}

/**
 * Construct a multipart FormData request and send it to the export backend.
 *
 * CRITICAL: Text fields are appended BEFORE file fields because busboy
 * processes parts sequentially -- fields must be available before file
 * handlers reference them.
 *
 * syncAnchors (Map) is serialized via Object.fromEntries() to avoid the
 * JSON.stringify pitfall where Map serializes to "{}".
 *
 * MusicXML is sent as a file (not a text field) to avoid the 1MB field
 * size limit on large scores.
 */
export async function requestExport(
  request: ExportRequest,
  backendUrl = 'http://localhost:3001',
): Promise<ExportResponse> {
  const formData = new FormData();

  // 1. Text fields FIRST (busboy sequential processing requirement)
  formData.append('settings', JSON.stringify(request.settings));
  formData.append(
    'syncAnchors',
    JSON.stringify(Object.fromEntries(request.syncAnchors)),
  );

  // 2. File fields SECOND
  formData.append(
    'musicXml',
    new Blob([request.musicXmlContent], { type: 'application/xml' }),
    request.musicXmlFilename,
  );
  formData.append('audio', request.audioFile);

  if (request.bgImageFile) {
    formData.append('bgImage', request.bgImageFile);
  }

  // Do NOT set Content-Type header -- browser auto-sets multipart boundary
  const response = await fetch(`${backendUrl}/api/export`, {
    method: 'POST',
    body: formData,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      (data as { error?: string }).error || `Export failed: ${response.status}`,
    );
  }

  return data as ExportResponse;
}
