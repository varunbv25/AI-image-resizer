/**
 * Batch upload helper with client-side compression and Vercel Blob support
 * Ensures large images are compressed before processing in batch mode
 * Uses Vercel Blob for files >3MB to bypass payload limits
 */

import { compressImage, formatFileSize, calculateCompressionRatio } from './clientImageCompression';
import { uploadToBlob, shouldUseBlobUpload } from './blobUploadHelper';
import { ImageDimensions } from '@/types';

/**
 * Prepare file for batch upload with automatic compression
 * @param file - The file to prepare
 * @param options - Compression options
 * @returns Prepared file (compressed if needed)
 */
export async function prepareFileForBatchUpload(
  file: File,
  options: {
    maxSizeMB?: number;
    maxWidthOrHeight?: number;
    quality?: number;
  } = {}
): Promise<File> {
  const {
    maxSizeMB = 2,
    maxWidthOrHeight = 3072,
    quality = 0.75,
  } = options;

  const originalSize = file.size;

  // If file is larger than threshold, compress it
  if (originalSize > maxSizeMB * 1024 * 1024) {
    console.log(`[Batch] Compressing ${file.name}: ${formatFileSize(originalSize)}`);

    const compressedFile = await compressImage(file, {
      maxSizeMB,
      maxWidthOrHeight,
      quality,
    });

    const compressedSize = compressedFile.size;
    const ratio = calculateCompressionRatio(originalSize, compressedSize);

    console.log(`[Batch] Compressed ${file.name}: ${formatFileSize(compressedSize)} (${ratio}% reduction)`);

    return compressedFile;
  }

  // File is small enough, return as-is
  return file;
}

/**
 * Prepare multiple files for batch upload with automatic compression
 * @param files - The files to prepare
 * @param options - Compression options
 * @returns Array of prepared files (compressed if needed)
 */
export async function prepareFilesForBatchUpload(
  files: File[],
  options: {
    maxSizeMB?: number;
    maxWidthOrHeight?: number;
    quality?: number;
  } = {}
): Promise<File[]> {
  console.log(`[Batch] Preparing ${files.length} files for upload...`);

  const preparedFiles = await Promise.all(
    files.map((file) => prepareFileForBatchUpload(file, options))
  );

  const totalOriginalSize = files.reduce((sum, file) => sum + file.size, 0);
  const totalPreparedSize = preparedFiles.reduce((sum, file) => sum + file.size, 0);
  const totalRatio = calculateCompressionRatio(totalOriginalSize, totalPreparedSize);

  if (totalRatio > 0) {
    console.log(
      `[Batch] Total compression: ${formatFileSize(totalOriginalSize)} → ${formatFileSize(totalPreparedSize)} (${totalRatio}% reduction)`
    );
  } else {
    console.log(`[Batch] No compression needed - all files under ${options.maxSizeMB || 2}MB`);
  }

  return preparedFiles;
}

/**
 * Upload result for batch processing
 */
export interface BatchUploadResult {
  filename: string;
  originalDimensions: ImageDimensions;
  size: number;
  mimetype: string;
  imageData: string;
  uploadMethod: 'blob' | 'traditional';
}

/**
 * Upload a single file in batch mode using the appropriate method
 * Uses blob upload for large files (>3MB) to bypass payload limits
 *
 * @param file - The file to upload
 * @param onProgress - Progress callback for blob uploads
 * @returns Upload result with image data
 */
export async function uploadBatchFile(
  file: File,
  onProgress?: (progress: number) => void
): Promise<BatchUploadResult> {
  console.log(`[Batch] Uploading ${file.name} (${formatFileSize(file.size)})`);

  // Check if we should use blob upload
  if (shouldUseBlobUpload(file.size)) {
    console.log(`[Batch] Attempting blob upload for ${file.name}`);

    try {
      const result = await uploadToBlob(file, {
        onProgress,
        clientPayload: {
          source: 'batch',
          filename: file.name,
        },
      });

      return {
        ...result,
        uploadMethod: 'blob',
      };
    } catch (blobError) {
      console.warn(`[Batch] Blob upload failed for ${file.name}, compressing and using traditional upload:`, blobError);

      // Compress file and fall back to traditional upload
      file = await prepareFileForBatchUpload(file, {
        maxSizeMB: 2,
        maxWidthOrHeight: 4096,
        quality: 0.75,
      });

      console.log(`[Batch] Compressed ${file.name} to ${formatFileSize(file.size)}`);
    }
  }

  // Use traditional upload for smaller files
  console.log(`[Batch] Using traditional upload for ${file.name}`);

  const formData = new FormData();
  formData.append('image', file);

  const response = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Upload failed for ${file.name}: ${response.statusText}`);
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || `Upload failed for ${file.name}`);
  }

  return {
    filename: result.data.filename,
    originalDimensions: result.data.originalDimensions,
    size: result.data.size,
    mimetype: result.data.mimetype,
    imageData: result.data.imageData,
    uploadMethod: 'traditional',
  };
}

/**
 * Upload multiple files in batch mode with progress tracking
 * Automatically uses blob upload for large files
 *
 * @param files - The files to upload
 * @param onProgress - Progress callback (receives index and progress)
 * @param onFileComplete - Callback when each file completes
 * @returns Array of upload results
 */
export async function uploadBatchFiles(
  files: File[],
  options: {
    onProgress?: (fileIndex: number, progress: number) => void;
    onFileComplete?: (fileIndex: number, result: BatchUploadResult) => void;
    onFileError?: (fileIndex: number, error: Error) => void;
    maxConcurrent?: number;
  } = {}
): Promise<BatchUploadResult[]> {
  const {
    onProgress,
    onFileComplete,
    onFileError,
    maxConcurrent = 3, // Upload max 3 files concurrently
  } = options;

  console.log(`[Batch] Starting batch upload of ${files.length} files (max ${maxConcurrent} concurrent)`);

  const results: (BatchUploadResult | null)[] = new Array(files.length).fill(null);
  const errors: (Error | null)[] = new Array(files.length).fill(null);

  // Upload files with concurrency limit
  const uploadPromises: Promise<void>[] = [];
  let currentIndex = 0;

  const uploadNext = async (): Promise<void> => {
    if (currentIndex >= files.length) return;

    const fileIndex = currentIndex++;
    const file = files[fileIndex];

    try {
      const result = await uploadBatchFile(file, (progress) => {
        if (onProgress) {
          onProgress(fileIndex, progress);
        }
      });

      results[fileIndex] = result;

      if (onFileComplete) {
        onFileComplete(fileIndex, result);
      }

      console.log(`[Batch] ✓ Completed ${fileIndex + 1}/${files.length}: ${file.name}`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Upload failed');
      errors[fileIndex] = err;

      if (onFileError) {
        onFileError(fileIndex, err);
      }

      console.error(`[Batch] ✗ Failed ${fileIndex + 1}/${files.length}: ${file.name}`, err);
    }

    // Upload next file
    return uploadNext();
  };

  // Start initial batch of uploads
  for (let i = 0; i < Math.min(maxConcurrent, files.length); i++) {
    uploadPromises.push(uploadNext());
  }

  // Wait for all uploads to complete
  await Promise.all(uploadPromises);

  // Check for errors
  const failedCount = errors.filter(e => e !== null).length;
  if (failedCount > 0) {
    console.warn(`[Batch] ${failedCount} file(s) failed to upload`);
  }

  console.log(`[Batch] Batch upload complete: ${results.filter(r => r !== null).length}/${files.length} successful`);

  // Return only successful results
  return results.filter((r): r is BatchUploadResult => r !== null);
}

/**
 * Convert File to base64 string
 * Used for batch processing when files are already uploaded
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Get image dimensions from File
 * Used for batch processing setup
 */
export function getImageDimensions(file: File): Promise<ImageDimensions> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      resolve({ width: img.width, height: img.height });
      URL.revokeObjectURL(url);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Failed to load image: ${file.name}`));
    };

    img.src = url;
  });
}
