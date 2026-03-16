import { spawn, execSync } from 'node:child_process';
import { once } from 'node:events';

// ---------------------------------------------------------------------------
// Hardware encoder detection (runs once at import time, cached)
// ---------------------------------------------------------------------------

interface EncoderProfile {
  codec: string;
  /** Extra flags specific to this encoder (replaces -preset/-crf for HW encoders) */
  flags: string[];
}

const SW_PROFILE: EncoderProfile = {
  codec: 'libx264',
  flags: ['-preset', 'veryfast', '-crf', '23'],
};

/** Ordered preference: VideoToolbox (macOS) > NVENC (NVIDIA) > QSV (Intel) > software */
const HW_CANDIDATES: EncoderProfile[] = [
  { codec: 'h264_videotoolbox', flags: ['-q:v', '65'] },
  { codec: 'h264_nvenc',        flags: ['-preset', 'p4', '-cq', '23'] },
  { codec: 'h264_qsv',          flags: ['-preset', 'veryfast', '-global_quality', '23'] },
];

function detectEncoder(): EncoderProfile {
  let available: Set<string>;
  try {
    const output = execSync('ffmpeg -encoders 2>/dev/null', { encoding: 'utf-8', timeout: 5000 });
    available = new Set(
      output.split('\n')
        .map((line) => line.trim().split(/\s+/)[1])
        .filter(Boolean),
    );
  } catch {
    return SW_PROFILE;
  }

  for (const candidate of HW_CANDIDATES) {
    if (available.has(candidate.codec)) {
      console.log(`[encodeVideo] Using hardware encoder: ${candidate.codec}`);
      return candidate;
    }
  }

  console.log('[encodeVideo] No hardware encoder found, using libx264');
  return SW_PROFILE;
}

const encoder = detectEncoder();

// ---------------------------------------------------------------------------
// Video encode
// ---------------------------------------------------------------------------

/**
 * Start an FFmpeg process that reads JPEG frames from stdin and encodes
 * to a silent H.264 MP4 file. Returns drain-aware write/finish helpers.
 *
 * The caller pipes each captured frame via writeFrame(), then calls finish()
 * to signal EOF and wait for FFmpeg to complete encoding.
 *
 * Automatically uses the best available H.264 encoder (hardware or software).
 */
export function startVideoEncode(
  outputPath: string,
  fps: number,
  width: number,
  height: number,
): { writeFrame: (buffer: Uint8Array) => Promise<void>; finish: () => Promise<void>; kill: () => void } {
  const proc = spawn('ffmpeg', [
    '-y',
    '-f', 'image2pipe',
    '-c:v', 'mjpeg',
    '-framerate', String(fps),
    '-i', 'pipe:0',
    '-c:v', encoder.codec,
    '-pix_fmt', 'yuv420p',
    ...encoder.flags,
    '-movflags', '+faststart',
    '-an',
    outputPath,
  ], {
    stdio: ['pipe', 'ignore', 'pipe'],
  });

  // Collect stderr for error diagnostics (ring-buffer: keep last 2KB)
  let stderr = '';
  proc.stderr!.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
    if (stderr.length > 2048) stderr = stderr.slice(-2048);
  });

  /**
   * Write a single JPEG frame buffer to FFmpeg stdin.
   * Respects backpressure: if the internal buffer is full,
   * waits for the 'drain' event before returning.
   */
  const writeFrame = async (buffer: Uint8Array): Promise<void> => {
    const canContinue = proc.stdin!.write(buffer);
    if (!canContinue) {
      await once(proc.stdin!, 'drain');
    }
  };

  /**
   * Signal end of frames and wait for FFmpeg to finish encoding.
   * CRITICAL: Listeners are attached BEFORE stdin.end() to avoid
   * missing the close event on fast encodes.
   */
  const finish = (): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg encode failed (code ${code}): ${stderr.slice(-500)}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`FFmpeg failed to start: ${err.message}`));
      });

      // End stdin AFTER listeners are attached
      proc.stdin!.end();
    });
  };

  /**
   * Kill the FFmpeg process immediately. Used on cancellation to avoid
   * waiting for stdin EOF and encoding to complete.
   */
  const kill = (): void => {
    try { proc.stdin!.end(); } catch { /* ignore */ }
    try { proc.kill('SIGTERM'); } catch { /* ignore */ }
  };

  return { writeFrame, finish, kill };
}

/**
 * Start an FFmpeg process that reads numbered JPEG frames from a directory
 * and encodes to a silent H.264 MP4 file. Returns a finish/kill interface.
 *
 * Uses FFmpeg's `image2` demuxer with a glob pattern (`frame-%06d.jpg`)
 * to read frames in sequential order. No backpressure management needed
 * since FFmpeg reads files from disk at its own pace.
 *
 * Used by the parallel capture pipeline where frames are written to disk
 * out of order by multiple tabs, then encoded sequentially afterward.
 */
export function startVideoEncodeFromFiles(
  framesDir: string,
  outputPath: string,
  fps: number,
): { finish: () => Promise<void>; kill: () => void } {
  const inputPattern = `${framesDir}/frame-%06d.jpg`;

  const proc = spawn('ffmpeg', [
    '-y',
    '-framerate', String(fps),
    '-i', inputPattern,
    '-c:v', encoder.codec,
    '-pix_fmt', 'yuv420p',
    ...encoder.flags,
    '-movflags', '+faststart',
    '-an',
    outputPath,
  ], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  // Ring-buffer: keep last 2KB of stderr for error diagnostics
  let stderr = '';
  proc.stderr!.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
    if (stderr.length > 2048) stderr = stderr.slice(-2048);
  });

  const finish = (): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg encode failed (code ${code}): ${stderr.slice(-500)}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`FFmpeg failed to start: ${err.message}`));
      });
    });
  };

  const kill = (): void => {
    try { proc.kill('SIGTERM'); } catch { /* ignore */ }
  };

  return { finish, kill };
}
