import { getVideoProcessor } from './videoProcessor';
import type { VideoMetadata } from '@/types';

export interface BatchVideoUploadResult {
  id: string;
  filename: string;
  metadata: VideoMetadata;
  size: number;
  mimetype: string;
  videoData: string; // blob URL
  blobUrl: string;
  thumbnailUrl?: string;
}

export interface BatchVideoUploadOptions {
  maxConcurrent?: number;
  onProgress?: (fileIndex: number, progress: number) => void;
  onFileComplete?: (fileIndex: number, result: BatchVideoUploadResult) => void;
  onFileError?: (fileIndex: number, error: Error) => void;
}

/**
 * Upload multiple video files with metadata extraction
 * Similar to image batch upload but for videos
 */
export async function uploadBatchVideoFiles(
  files: File[],
  options: BatchVideoUploadOptions = {}
): Promise<BatchVideoUploadResult[]> {
  const {
    maxConcurrent = 2, // Lower than images due to video processing overhead
    onProgress,
    onFileComplete,
    onFileError,
  } = options;

  const results: BatchVideoUploadResult[] = [];
  const processor = getVideoProcessor();

  // Load FFmpeg once for all videos
  await processor.load();

  let activeUploads = 0;
  let currentIndex = 0;

  return new Promise((resolve, reject) => {
    const processNext = async () => {
      if (currentIndex >= files.length) {
        // All files queued
        if (activeUploads === 0) {
          resolve(results);
        }
        return;
      }

      const fileIndex = currentIndex++;
      const file = files[fileIndex];
      activeUploads++;

      try {
        // Report start of upload
        onProgress?.(fileIndex, 0);

        // Extract metadata
        const metadata = await processor.getVideoMetadata(file);

        // Generate thumbnail
        const thumbnailUrl = await processor.generateThumbnail(file);

        // Create blob URL for video playback
        const blobUrl = URL.createObjectURL(file);

        // Generate unique ID
        const id = `${file.name}_${Date.now()}_${fileIndex}`;

        const result: BatchVideoUploadResult = {
          id,
          filename: file.name,
          metadata,
          size: file.size,
          mimetype: file.type,
          videoData: blobUrl,
          blobUrl,
          thumbnailUrl,
        };

        results[fileIndex] = result;
        onProgress?.(fileIndex, 100);
        onFileComplete?.(fileIndex, result);
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Unknown error');
        onFileError?.(fileIndex, err);
        results[fileIndex] = {
          id: `error_${fileIndex}`,
          filename: file.name,
          metadata: {
            duration: 0,
            width: 0,
            height: 0,
            format: '',
            size: file.size,
          },
          size: file.size,
          mimetype: file.type,
          videoData: '',
          blobUrl: '',
        };
      } finally {
        activeUploads--;
        processNext();
      }
    };

    // Start initial batch of concurrent uploads
    const initialBatch = Math.min(maxConcurrent, files.length);
    for (let i = 0; i < initialBatch; i++) {
      processNext();
    }
  });
}

/**
 * Process a single video file and extract metadata
 */
export async function uploadSingleVideoFile(
  file: File,
  onProgress?: (progress: number) => void
): Promise<BatchVideoUploadResult> {
  const processor = getVideoProcessor();
  await processor.load();

  onProgress?.(0);

  try {
    const metadata = await processor.getVideoMetadata(file);
    const thumbnailUrl = await processor.generateThumbnail(file);
    const blobUrl = URL.createObjectURL(file);

    onProgress?.(100);

    return {
      id: `${file.name}_${Date.now()}`,
      filename: file.name,
      metadata,
      size: file.size,
      mimetype: file.type,
      videoData: blobUrl,
      blobUrl,
      thumbnailUrl,
    };
  } catch (error) {
    throw new Error(`Failed to process video: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Download processed videos as a ZIP file
 */
export async function downloadVideosAsZip(
  videos: Array<{
    filename: string;
    blobUrl: string;
  }>,
  zipFilename: string = `processed-videos-${Date.now()}.zip`
): Promise<void> {
  // Dynamically import JSZip to avoid bundling if not used
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  // Fetch each video blob and add to zip
  for (const video of videos) {
    try {
      const response = await fetch(video.blobUrl);
      const blob = await response.blob();
      zip.file(video.filename, blob);
    } catch (error) {
      console.error(`Failed to add ${video.filename} to zip:`, error);
    }
  }

  // Generate and download zip
  const content = await zip.generateAsync({ type: 'blob' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(content);
  link.download = zipFilename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

/**
 * Validate video files for batch upload
 */
export function validateVideoFiles(
  files: File[],
  options: {
    maxSize?: number; // in bytes
    allowedFormats?: string[];
  } = {}
): { valid: boolean; errors: string[] } {
  const {
    maxSize = 100 * 1024 * 1024, // 100MB default
    allowedFormats = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska'],
  } = options;

  const errors: string[] = [];

  for (const file of files) {
    if (file.size > maxSize) {
      errors.push(`${file.name} exceeds maximum size of ${maxSize / (1024 * 1024)}MB`);
    }

    if (!allowedFormats.includes(file.type)) {
      errors.push(`${file.name} has unsupported format: ${file.type}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Cleanup blob URLs to prevent memory leaks
 */
export function cleanupVideoBlobUrls(blobUrls: string[]): void {
  for (const url of blobUrls) {
    if (url && url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  }
}
