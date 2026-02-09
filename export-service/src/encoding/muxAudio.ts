import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Find the audio file in the temp directory.
 * The upload route stores the audio with fieldname "audio" plus its
 * MIME-derived extension (e.g., audio.mp3, audio.wav, audio.ogg, audio.m4a).
 */
export async function findAudioFile(tempDir: string): Promise<string> {
  const files = await readdir(tempDir);
  const audioFile = files.find((f) => f.startsWith('audio.'));
  if (!audioFile) {
    throw new Error('Audio file not found in temp directory');
  }
  return join(tempDir, audioFile);
}

/**
 * Mux an audio file into a silent video file, producing the final output MP4.
 * Uses stream copy for video (no re-encode) and transcodes audio to AAC.
 *
 * The -shortest flag trims to the shorter stream duration, handling the
 * potential 1-frame difference between video (Math.ceil(duration * fps))
 * and audio duration.
 */
export function muxAudio(
  silentVideoPath: string,
  audioPath: string,
  outputPath: string,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-y',
      '-i', silentVideoPath,
      '-i', audioPath,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-shortest',
      '-movflags', '+faststart',
      outputPath,
    ], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';
    proc.stderr!.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err) => {
      reject(new Error(`FFmpeg mux failed to start: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg mux failed (code ${code}): ${stderr.slice(-500)}`));
      }
    });
  });
}
