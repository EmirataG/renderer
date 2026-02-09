import { spawn } from 'node:child_process';
import { once } from 'node:events';

/**
 * Start an FFmpeg process that reads PNG frames from stdin and encodes
 * to a silent H.264 MP4 file. Returns drain-aware write/finish helpers.
 *
 * The caller pipes each captured frame via writeFrame(), then calls finish()
 * to signal EOF and wait for FFmpeg to complete encoding.
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
    '-c:v', 'png',
    '-framerate', String(fps),
    '-i', 'pipe:0',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'medium',
    '-crf', '18',
    '-movflags', '+faststart',
    '-an',
    outputPath,
  ], {
    stdio: ['pipe', 'ignore', 'pipe'],
  });

  // Collect stderr for error diagnostics (keep last 500 chars on failure)
  let stderr = '';
  proc.stderr!.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  /**
   * Write a single PNG frame buffer to FFmpeg stdin.
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
