/**
 * WebCodecs video/audio encoding + MP4 muxing.
 *
 * Uses the browser's hardware-accelerated H.264 encoder via WebCodecs API
 * and mp4-muxer for container packaging. Runs entirely client-side.
 */

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

export interface EncoderOptions {
  width: number;
  height: number;
  fps: number;
}

export class VideoExporter {
  private static readonly MAX_QUEUE = 5;
  private muxer: Muxer<ArrayBufferTarget>;
  private videoEncoder: VideoEncoder;
  private frameIndex = 0;
  private fps: number;

  constructor(options: EncoderOptions) {
    this.fps = options.fps;
    this.muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: {
        codec: 'avc',
        width: options.width,
        height: options.height,
        frameRate: options.fps,
      },
      audio: {
        codec: 'aac',
        numberOfChannels: 2,
        sampleRate: 44100,
      },
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset',
    });

    this.videoEncoder = new VideoEncoder({
      output: (chunk, meta) => this.muxer.addVideoChunk(chunk, meta),
      error: (e) => { throw new Error(`VideoEncoder error: ${e.message}`); },
    });

    // Scale bitrate with resolution: 50Mbps for 4K, 20Mbps for 1080p
    const pixels = options.width * options.height;
    const bitrate = pixels > 1920 * 1080 ? 50_000_000 : 20_000_000;

    this.videoEncoder.configure({
      codec: 'avc1.640033', // H.264 High Profile Level 5.1 (supports 4K@30fps)
      width: options.width,
      height: options.height,
      bitrate,
      framerate: options.fps,
    });
  }

  /**
   * Encode a single frame from a canvas element.
   * Respects encoder backpressure — waits if the queue is too deep.
   */
  async addFrame(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<void> {
    // Backpressure: wait for encoder to drain before queuing more frames.
    // Prevents unbounded memory growth, especially at 4K.
    while (this.videoEncoder.encodeQueueSize > VideoExporter.MAX_QUEUE) {
      await new Promise<void>((resolve) => {
        this.videoEncoder.addEventListener('dequeue', () => resolve(), { once: true });
      });
    }

    const timestampUs = (this.frameIndex / this.fps) * 1_000_000;
    const frame = new VideoFrame(canvas, { timestamp: timestampUs });
    this.videoEncoder.encode(frame, { keyFrame: this.frameIndex % 60 === 0 });
    frame.close();
    this.frameIndex++;
  }

  /**
   * Encode audio from an AudioBuffer (decoded from the user's audio file).
   * Splits into 1-second chunks for the AudioEncoder.
   */
  async addAudio(audioBuffer: AudioBuffer): Promise<void> {
    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => this.muxer.addAudioChunk(chunk, meta),
      error: (e) => { throw new Error(`AudioEncoder error: ${e.message}`); },
    });

    audioEncoder.configure({
      codec: 'mp4a.40.2', // AAC-LC
      numberOfChannels: audioBuffer.numberOfChannels,
      sampleRate: audioBuffer.sampleRate,
      bitrate: 192_000,
    });

    const sampleRate = audioBuffer.sampleRate;
    const channels = audioBuffer.numberOfChannels;
    const totalSamples = audioBuffer.length;
    const chunkSize = sampleRate; // 1 second per chunk

    for (let offset = 0; offset < totalSamples; offset += chunkSize) {
      const numFrames = Math.min(chunkSize, totalSamples - offset);

      // Build planar Float32 data: [ch0_all_samples, ch1_all_samples, ...]
      const planarData = new Float32Array(numFrames * channels);
      for (let ch = 0; ch < channels; ch++) {
        const channelData = audioBuffer.getChannelData(ch);
        planarData.set(channelData.subarray(offset, offset + numFrames), ch * numFrames);
      }

      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate,
        numberOfFrames: numFrames,
        numberOfChannels: channels,
        timestamp: (offset / sampleRate) * 1_000_000,
        data: planarData,
      });

      audioEncoder.encode(audioData);
      audioData.close();
    }

    await audioEncoder.flush();
    audioEncoder.close();
  }

  /**
   * Flush encoders, finalize the MP4, and return as ArrayBuffer.
   */
  async finalize(): Promise<ArrayBuffer> {
    await this.videoEncoder.flush();
    this.videoEncoder.close();
    this.muxer.finalize();
    return (this.muxer.target as ArrayBufferTarget).buffer;
  }
}
