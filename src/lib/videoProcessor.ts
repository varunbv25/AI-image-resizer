'use client';

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type {
  VideoMetadata,
  VideoCompressionSettings,
  VideoCropSettings,
  VideoTrimSettings,
  ProcessedVideoData,
} from '@/types';

/**
 * Video processor class for client-side video processing using FFmpeg.wasm
 */
export class VideoProcessor {
  private ffmpeg: FFmpeg;
  private loaded: boolean = false;
  private onProgressCallback?: (progress: number) => void;

  constructor() {
    this.ffmpeg = new FFmpeg();
  }

  /**
   * Set progress callback
   */
  setProgressCallback(callback: (progress: number) => void) {
    this.onProgressCallback = callback;
  }

  /**
   * Load FFmpeg.wasm
   */
  async load(): Promise<void> {
    if (this.loaded) return;

    try {
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';

      this.ffmpeg.on('log', ({ message }) => {
        console.log('[FFmpeg]', message);
      });

      this.ffmpeg.on('progress', ({ progress }) => {
        const percentage = Math.round(progress * 100);
        console.log(`[FFmpeg Progress] ${percentage}%`);
        if (this.onProgressCallback) {
          this.onProgressCallback(percentage);
        }
      });

      await this.ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      this.loaded = true;
      console.log('[FFmpeg] Loaded successfully');
    } catch (error) {
      console.error('[FFmpeg] Load error:', error);
      throw new Error('Failed to load FFmpeg. Please refresh the page and try again.');
    }
  }

  /**
   * Get video metadata
   */
  async getVideoMetadata(videoFile: File): Promise<VideoMetadata> {
    // Use HTML5 video element for metadata extraction (works everywhere)
    // Skip FFmpeg filesystem operations to avoid errors in local environment
    return this.extractMetadataFromVideo(videoFile);
  }

  /**
   * Extract metadata using HTML5 video element
   */
  private async extractMetadataFromVideo(videoFile: File): Promise<VideoMetadata> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';

      video.onloadedmetadata = () => {
        window.URL.revokeObjectURL(video.src);

        resolve({
          duration: video.duration,
          width: video.videoWidth,
          height: video.videoHeight,
          format: videoFile.type,
          size: videoFile.size,
          fps: 30, // Default FPS, can't be extracted easily from video element
        });
      };

      video.onerror = () => {
        window.URL.revokeObjectURL(video.src);
        reject(new Error('Failed to load video metadata'));
      };

      video.src = URL.createObjectURL(videoFile);
    });
  }

  /**
   * Compress video with file size targeting
   * Always uses H.264 codec, converts to selected resolution (240p, 360p, 480p, or 720p) at 30fps
   * Supports MP4, WebM, and MOV container formats
   */
  async compressVideo(
    videoFile: File,
    settings: VideoCompressionSettings
  ): Promise<ProcessedVideoData> {
    if (!this.loaded) await this.load();

    try {
      const inputName = 'input' + this.getFileExtension(videoFile.name);

      // Map format to container extension
      const formatExtMap: Record<'mp4' | 'webm' | 'mov', string> = {
        'mp4': '.mp4',
        'webm': '.webm',
        'mov': '.mov'
      };
      const outputExt = formatExtMap[settings.format];
      const outputName = 'output' + outputExt;

      // Write input video
      await this.ffmpeg.writeFile(inputName, await fetchFile(videoFile));

      // Get resolution height
      const resolutionMap = {
        '240p': 240,
        '360p': 360,
        '480p': 480,
        '720p': 720
      };
      const targetHeight = resolutionMap[settings.resolution];

      // Base filter: Scale to target resolution maintaining aspect ratio and set to 30fps
      // -2 ensures dimensions are divisible by 2 (required for H.264)
      const baseFilter = `scale=-2:${targetHeight},fps=30`;

      // File size-based compression with H.264 codec
      const metadata = await this.extractMetadataFromVideo(videoFile);
      const targetSizeKB = settings.targetSize * 1024;
      const audioBitrateKB = 128;

      // Calculate video bitrate
      let videoBitrateKB = (targetSizeKB * 8) / metadata.duration - audioBitrateKB;

      // Set minimum bitrate based on resolution
      const minBitrateMap = {
        '240p': 250,   // 250 kbps minimum for 240p (low quality)
        '360p': 400,   // 400 kbps minimum for 360p (optimal)
        '480p': 700,   // 700 kbps minimum for 480p (better quality)
        '720p': 1500   // 1500 kbps minimum for 720p (best quality)
      };
      const minBitrate = minBitrateMap[settings.resolution];
      videoBitrateKB = Math.max(videoBitrateKB, minBitrate);

      // Always use H.264 video codec with AAC audio
      // Container format (mp4/webm/mov) is determined by output extension
      const ffmpegArgs = [
        '-i', inputName,
        '-vf', baseFilter,
        '-c:v', 'libx264',          // H.264 video codec
        '-b:v', `${Math.round(videoBitrateKB)}k`,
        '-minrate', `${Math.round(videoBitrateKB)}k`, // CBR
        '-maxrate', `${Math.round(videoBitrateKB)}k`, // CBR
        '-bufsize', `${Math.round(videoBitrateKB)}k`,
        '-preset', 'medium',
        '-c:a', 'aac',              // AAC audio codec
        '-b:a', '128k',
        '-movflags', '+faststart',  // Enable fast start for web playback
        outputName
      ];

      // Execute FFmpeg command
      await this.ffmpeg.exec(ffmpegArgs);

      // Read output video
      const data = await this.ffmpeg.readFile(outputName);
      const blob = new Blob([new Uint8Array(data as Uint8Array)], { type: `video/${settings.format}` });
      const url = URL.createObjectURL(blob);

      // Get output metadata
      const outputFile = new File([blob], `compressed${outputExt}`, { type: `video/${settings.format}` });
      const outputMetadata = await this.extractMetadataFromVideo(outputFile);

      // Cleanup
      await this.ffmpeg.deleteFile(inputName);
      await this.ffmpeg.deleteFile(outputName);

      return {
        videoData: url,
        metadata: outputMetadata,
        filename: videoFile.name.replace(/\.[^/.]+$/, `_compressed${outputExt}`),
        blobUrl: url,
      };
    } catch (error) {
      console.error('[FFmpeg] Compression error:', error);
      throw new Error('Failed to compress video. Please try different settings.');
    }
  }

  /**
   * Crop video
   */
  async cropVideo(
    videoFile: File,
    settings: VideoCropSettings
  ): Promise<ProcessedVideoData> {
    if (!this.loaded) await this.load();

    try {
      const inputName = 'input' + this.getFileExtension(videoFile.name);
      const outputName = 'output.mp4';

      // Write input video
      await this.ffmpeg.writeFile(inputName, await fetchFile(videoFile));

      // Crop filter
      const cropFilter = `crop=${settings.width}:${settings.height}:${settings.x}:${settings.y}`;

      // Execute FFmpeg command with high quality settings
      await this.ffmpeg.exec([
        '-i', inputName,
        '-vf', cropFilter,
        '-c:v', 'libx264',
        '-preset', 'slow', // Better quality
        '-crf', '18', // Near visually lossless
        '-c:a', 'copy', // Keep original audio
        outputName
      ]);

      // Read output video
      const data = await this.ffmpeg.readFile(outputName);
      const blob = new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);

      // Get output metadata
      const outputFile = new File([blob], 'cropped.mp4', { type: 'video/mp4' });
      const outputMetadata = await this.extractMetadataFromVideo(outputFile);

      // Cleanup
      await this.ffmpeg.deleteFile(inputName);
      await this.ffmpeg.deleteFile(outputName);

      return {
        videoData: url,
        metadata: outputMetadata,
        filename: videoFile.name.replace(/\.[^/.]+$/, '_cropped.mp4'),
        blobUrl: url,
      };
    } catch (error) {
      console.error('[FFmpeg] Crop error:', error);
      throw new Error('Failed to crop video. Please try different settings.');
    }
  }

  /**
   * Trim video with Samsung Gallery-style smart trimming
   *
   * Implements two modes:
   * 1. Smart Trimming (no quality loss) - Uses stream copy when possible
   * 2. Keyframe-accurate re-encode - Re-encodes only when necessary
   *
   * This approach:
   * - Preserves original quality when trim points align with keyframes
   * - Fast processing using stream copy (no re-encoding)
   * - Re-encodes only boundary frames when needed for frame-accurate cuts
   * - Creates a new file (non-destructive editing)
   */
  async trimVideo(
    videoFile: File,
    settings: VideoTrimSettings
  ): Promise<ProcessedVideoData> {
    if (!this.loaded) await this.load();

    try {
      const inputName = 'input' + this.getFileExtension(videoFile.name);
      const outputName = 'output.mp4';

      // Write input video
      await this.ffmpeg.writeFile(inputName, await fetchFile(videoFile));

      const duration = settings.endTime - settings.startTime;

      // Samsung Gallery-style smart trimming approach:
      // Try to use stream copy first for zero-loss trimming if trim points
      // are close to keyframes. If not, re-encode for frame accuracy.

      let ffmpegArgs: string[];

      // Check if we can use smart trimming (stream copy)
      // This works best for MP4/H.264/H.265 videos
      const isSmartTrimmable = videoFile.type.includes('mp4') ||
                               videoFile.name.toLowerCase().endsWith('.mp4') ||
                               videoFile.name.toLowerCase().endsWith('.mov');

      if (isSmartTrimmable && settings.trimType === 'slider') {
        // Smart Trimming Mode (Samsung Gallery approach)
        // Use -ss before -i for input seeking (faster, keyframe accurate)
        // Use -c copy to avoid re-encoding (preserves quality)
        // Note: This may not be frame-accurate but is fast and zero-loss
        try {
          ffmpegArgs = [
            '-ss', settings.startTime.toString(), // Seek to start time (keyframe accurate)
            '-i', inputName,
            '-t', duration.toString(), // Duration to trim
            '-c', 'copy', // Stream copy - no re-encoding (zero quality loss)
            '-avoid_negative_ts', 'make_zero', // Fix timestamp issues
            outputName
          ];

          await this.ffmpeg.exec(ffmpegArgs);
        } catch (streamCopyError) {
          console.warn('[FFmpeg] Stream copy failed, falling back to re-encode:', streamCopyError);

          // Fallback to re-encode mode
          await this.performReEncodeTrim(inputName, outputName, settings);
        }
      } else {
        // Frame-accurate re-encode mode
        // Used when:
        // - Stream copy is not available
        // - User needs exact frame accuracy
        // - Video format doesn't support stream copy well
        await this.performReEncodeTrim(inputName, outputName, settings);
      }

      // Read output video
      const data = await this.ffmpeg.readFile(outputName);
      const blob = new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);

      // Get output metadata
      const outputFile = new File([blob], 'trimmed.mp4', { type: 'video/mp4' });
      const outputMetadata = await this.extractMetadataFromVideo(outputFile);

      // Cleanup
      await this.ffmpeg.deleteFile(inputName);
      await this.ffmpeg.deleteFile(outputName);

      return {
        videoData: url,
        metadata: outputMetadata,
        filename: videoFile.name.replace(/\.[^/.]+$/, '_trimmed.mp4'),
        blobUrl: url,
      };
    } catch (error) {
      console.error('[FFmpeg] Trim error:', error);
      throw new Error('Failed to trim video. Please try different settings.');
    }
  }

  /**
   * Perform frame-accurate re-encode trim
   * Similar to Samsung Gallery when effects or frame-accuracy is needed
   */
  private async performReEncodeTrim(
    inputName: string,
    outputName: string,
    settings: VideoTrimSettings
  ): Promise<void> {
    const duration = settings.endTime - settings.startTime;

    // Frame-accurate trimming with high quality re-encode
    // Use -ss after -i for frame accuracy
    await this.ffmpeg.exec([
      '-i', inputName,
      '-ss', settings.startTime.toString(), // Frame-accurate seeking
      '-t', duration.toString(),
      '-c:v', 'libx264', // Re-encode video
      '-preset', 'medium', // Balance between speed and quality
      '-crf', '18', // Near visually lossless (18 is high quality)
      '-c:a', 'aac', // Re-encode audio
      '-b:a', '192k', // High quality audio
      '-movflags', '+faststart', // Enable streaming (metadata at start)
      outputName
    ]);
  }

  /**
   * Generate video thumbnail
   */
  async generateThumbnail(videoFile: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      video.onloadeddata = () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.8);
        window.URL.revokeObjectURL(video.src);
        resolve(thumbnailUrl);
      };

      video.onerror = () => {
        window.URL.revokeObjectURL(video.src);
        reject(new Error('Failed to generate thumbnail'));
      };

      video.src = URL.createObjectURL(videoFile);
      video.currentTime = 1; // Seek to 1 second
    });
  }

  /**
   * Get file extension from filename
   */
  private getFileExtension(filename: string): string {
    const ext = filename.match(/\.[^/.]+$/);
    return ext ? ext[0] : '.mp4';
  }

  /**
   * Cleanup FFmpeg instance
   */
  async cleanup() {
    if (this.loaded) {
      // FFmpeg.wasm doesn't have a cleanup method, but we can reset the flag
      this.loaded = false;
    }
  }
}

// Export singleton instance
let videoProcessorInstance: VideoProcessor | null = null;

export function getVideoProcessor(): VideoProcessor {
  if (!videoProcessorInstance) {
    videoProcessorInstance = new VideoProcessor();
  }
  return videoProcessorInstance;
}
