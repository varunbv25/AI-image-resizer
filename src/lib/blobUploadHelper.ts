import { upload } from '@vercel/blob/client';
import { ImageDimensions } from '@/types';

export interface BlobUploadResult {
  filename: string;
  originalDimensions: ImageDimensions;
  size: number;
  mimetype: string;
  imageData: string;
}

export interface SimpleBlobUploadResult {
  blobUrl: string;
  filename: string;
  size: number;
  mimetype: string;
}

export interface BlobUploadOptions {
  onProgress?: (progress: number) => void;
  clientPayload?: Record<string, unknown>;
}

/**
 * Upload a file directly to Vercel Blob storage using client-side upload.
 * The file is processed and immediately deleted from blob storage on the server.
 * This bypasses the 4.5MB Vercel function payload limit.
 *
 * @param file - The file to upload
 * @param options - Upload options including progress callback
 * @returns Upload result with image data and dimensions
 */
export async function uploadToBlob(
  file: File,
  options: BlobUploadOptions = {}
): Promise<BlobUploadResult> {
  const { onProgress, clientPayload = {} } = options;

  try {
    console.log(`Starting blob upload for: ${file.name} (${formatFileSize(file.size)})`);

    // Check if blob storage is available (for Vercel deployment)
    const hasBlobToken = typeof process !== 'undefined' && process.env?.BLOB_READ_WRITE_TOKEN;

    if (!hasBlobToken) {
      console.warn('BLOB_READ_WRITE_TOKEN not found, blob upload not available');
      throw new Error('Blob storage not configured');
    }

    // Upload the file directly to blob storage
    // This calls /api/blob-upload to get a token, then uploads directly to blob
    const blob = await upload(file.name, file, {
      access: 'public',
      handleUploadUrl: '/api/blob-upload',
      multipart: true, // Required for large files
      clientPayload: JSON.stringify({
        ...clientPayload,
        uploadedAt: Date.now(),
      }),
      onUploadProgress: onProgress
        ? ({ loaded, total }) => {
            const progress = Math.round((loaded / total) * 100);
            onProgress(progress);
          }
        : undefined,
    });

    console.log(`Blob upload completed: ${blob.url}`);

    // Poll the server for the processed result
    // The server's onUploadCompleted callback processes the file and stores the result
    const response = await fetch(`/api/blob-upload?url=${encodeURIComponent(blob.url)}`);

    if (!response.ok) {
      throw new Error(`Failed to get upload result: ${response.statusText}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Upload processing failed');
    }

    console.log(`Upload result retrieved for: ${file.name}`);

    return result.data as BlobUploadResult;

  } catch (error) {
    console.error('Blob upload error:', error);
    throw new Error(
      `Blob upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Format file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Upload a file directly to Vercel Blob storage for processing.
 * This function ONLY uploads the file and returns the blob URL.
 * No processing happens here - the file stays in blob storage for server-side processing.
 *
 * @param file - The file to upload
 * @param options - Upload options including progress callback
 * @returns Blob URL and basic file metadata
 */
export async function uploadToBlobSimple(
  file: File,
  options: BlobUploadOptions = {}
): Promise<SimpleBlobUploadResult> {
  const { onProgress } = options;

  try {
    console.log(`[SimpleBlobUpload] Starting upload: ${file.name} (${formatFileSize(file.size)})`);

    // Upload the file directly to blob storage
    // Uses /api/get-upload-token to get a token, then uploads directly to Vercel Blob
    const blob = await upload(file.name, file, {
      access: 'public',
      handleUploadUrl: '/api/get-upload-token',
      multipart: true, // Required for large files
      onUploadProgress: onProgress
        ? ({ loaded, total }) => {
            const progress = Math.round((loaded / total) * 100);
            onProgress(progress);
          }
        : undefined,
    });

    console.log(`[SimpleBlobUpload] Upload completed: ${blob.url}`);

    return {
      blobUrl: blob.url,
      filename: file.name,
      size: file.size,
      mimetype: file.type,
    };

  } catch (error) {
    console.error('[SimpleBlobUpload] Upload error:', error);
    throw new Error(
      `Blob upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Determine if a file should use blob upload based on its size
 * Files larger than 3MB should use blob upload to avoid function payload limits
 */
export function shouldUseBlobUpload(fileSize: number): boolean {
  const threshold = 3 * 1024 * 1024; // 3MB threshold
  return fileSize > threshold;
}
