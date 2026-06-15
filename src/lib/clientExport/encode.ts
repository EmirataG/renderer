/**
 * WebCodecs video/audio encoding + MP4 muxing.
 *
 * Uses the browser's hardware-accelerated H.264 encoder via WebCodecs API
 * and mp4-muxer for container packaging. Runs entirely client-side.
 */

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

interface EncoderOptions {
  width: number;
  height: number;
  fps: number;
}

export class VideoExporter {
  private static readonly MAX_QUEUE = 5;
  private muxer: Muxer<ArrayBufferTarget>;
  private videoEncoder!: VideoEncoder;
  private frameIndex = 0;
  private fps: number;
  private options: EncoderOptions;
  // WebCodecs error callbacks fire asynchronously; a `throw` inside them is
  // swallowed by the browser rather than rejecting our awaited calls. Capture
  // the first error here and re-surface it from addFrame/finalize so a failed
  // encode produces a real message instead of a cryptic muxer crash (the muxer
  // throws "reading 'colorSpace' of null" when it's finalized with no chunks).
  private encoderError: Error | null = null;

  constructor(options: EncoderOptions) {
    this.fps = options.fps;
    this.options = options;
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
  }

  /**
   * Configure the video encoder, selecting an H.264 config the current
   * browser/hardware actually supports. Must be awaited before addFrame.
   *
   * Without this, `configure()` with an unsupported codec/level (e.g. High
   * 5.1 on a machine whose hardware encoder rejects it) fails via the async
   * error callback — every frame then silently drops and the export dies in
   * the muxer. We probe a fallback chain with isConfigSupported first.
   */
  async init(): Promise<void> {
    this.videoEncoder = new VideoEncoder({
      output: (chunk, meta) => this.muxer.addVideoChunk(chunk, meta),
      error: (e) => {
        this.encoderError ??= new Error(`VideoEncoder error: ${e.message}`);
      },
    });

    const { width, height, fps } = this.options;
    // Scale bitrate with resolution: 50Mbps for 4K, 20Mbps for 1080p
    const bitrate = width * height > 1920 * 1080 ? 50_000_000 : 20_000_000;
    const base: VideoEncoderConfig = {
      codec: 'avc1.640033', // H.264 High Profile Level 5.1 (4K-capable)
      width,
      height,
      bitrate,
      framerate: fps,
    };

    // Ordered from most-preferred to most-compatible. Some hardware encoders
    // reject High@5.1, 'realtime' latency, or hardware at 4K — fall through to
    // Main/Baseline and software as needed.
    const candidates: VideoEncoderConfig[] = [
      { ...base, hardwareAcceleration: 'prefer-hardware', latencyMode: 'realtime' },
      { ...base, hardwareAcceleration: 'prefer-hardware' },
      { ...base },
      { ...base, codec: 'avc1.4D0033' }, // Main Profile Level 5.1
      { ...base, codec: 'avc1.42E033' }, // Constrained Baseline Level 5.1
      { ...base, hardwareAcceleration: 'prefer-software' },
    ];

    let chosen: VideoEncoderConfig | null = null;
    for (const candidate of candidates) {
      try {
        const support = await VideoEncoder.isConfigSupported(candidate);
        if (support.supported) {
          chosen = (support.config as VideoEncoderConfig) ?? candidate;
          break;
        }
      } catch {
        // isConfigSupported can throw on malformed configs — skip this one.
      }
    }

    if (!chosen) {
      throw new Error(
        `No supported H.264 encoder configuration for ${width}x${height}. ` +
        'Your browser may not support WebCodecs H.264 encoding at this resolution.',
      );
    }

    this.videoEncoder.configure(chosen);
  }

  /**
   * Encode a single frame from a canvas element.
   * Respects encoder backpressure — waits if the queue is too deep.
   */
  async addFrame(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<void> {
    if (this.encoderError) throw this.encoderError;

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
    let audioError: Error | null = null;
    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => this.muxer.addAudioChunk(chunk, meta),
      error: (e) => { audioError ??= new Error(`AudioEncoder error: ${e.message}`); },
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
    if (audioError) throw audioError;
  }

  /**
   * Flush encoders, finalize the MP4, and return as ArrayBuffer.
   */
  async finalize(): Promise<ArrayBuffer> {
    // A failed encoder rejects flush() with a generic message; prefer the
    // specific error captured from the error callback.
    try {
      await this.videoEncoder.flush();
    } catch (e) {
      throw this.encoderError ?? e;
    }
    this.videoEncoder.close();

    // Surface a real cause before the muxer crashes on an empty video track
    // (mp4-muxer reads decoderConfig.colorSpace, which is null when no chunk
    // was ever written).
    if (this.encoderError) throw this.encoderError;
    if (this.frameIndex === 0) {
      throw new Error('Export produced no video frames — nothing to encode.');
    }

    this.muxer.finalize();
    return (this.muxer.target as ArrayBufferTarget).buffer;
  }
}
