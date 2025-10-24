import { upload } from '@vercel/blob/client';
import { ImageDimensions } from '@/types';

export interface BlobUploadOptions {
  onProgress?: (progress: number) => void;
}

export interface ProcessOptions {
  operation: 'crop' | 'resize' | 'compress' | 'enhance' | 'rotate-flip' | 'convert-format';
  params?: {
    targetDimensions?: ImageDimensions;
    quality?: number;
    format?: 'jpeg' | 'png' | 'webp';
    maxFileSizePercent?: number;
    maxFileSizeKB?: number;
    method?: 'ai' | 'sharp' | 'onnx';
    sharpness?: number;
    rotateOperation?: 'rotate-90' | 'rotate-180' | 'rotate-270' | 'flip-horizontal' | 'flip-vertical' | 'custom';
    customAngle?: number;
    flipHorizontal?: boolean;
    flipVertical?: boolean;
    targetFormat?: 'jpeg' | 'png' | 'webp' | 'svg';
  };
}

/**
 * Complete workflow for uploading and processing large files using Vercel Blob
 *
 * This implements the 3-step workflow:
 * 1. Client requests upload token from /api/get-upload-token
 * 2. Client uploads file directly to Vercel Blob (bypasses 4.5MB limit)
 * 3. Client requests processing from /api/process-from-blob (blob auto-deleted after processing)
 *
 * @param file - The file to upload and process
 * @param processOptions - Processing parameters
 * @param uploadOptions - Upload progress callbacks
 * @returns Processed image data and metadata
 */
export async function uploadAndProcessWithBlob(
  file: File,
  processOptions: ProcessOptions,
  uploadOptions: BlobUploadOptions = {}
): Promise<{
  imageData: string;
  metadata: { width: number; height: number; format: string; size: number };
  filename: string;
}> {
  const { onProgress } = uploadOptions;

  try {
    console.log(`[Workflow] Step 1: Requesting upload token for ${file.name}`);

    // Step 1: Upload file directly to Vercel Blob
    // The /api/get-upload-token endpoint generates a secure upload URL
    const blob = await upload(file.name, file, {
      access: 'public',
      handleUploadUrl: '/api/get-upload-token',
      multipart: true, // Required for large files
      clientPayload: JSON.stringify({
        uploadedAt: Date.now(),
        fileName: file.name,
        fileSize: file.size,
      }),
      onUploadProgress: onProgress
        ? ({ loaded, total }) => {
            const progress = Math.round((loaded / total) * 100);
            onProgress(progress);
          }
        : undefined,
    });

    console.log(`[Workflow] Step 2: File uploaded to blob: ${blob.url}`);

    // Step 3: Request processing from the server
    // The server will:
    // - Download the image from the blob URL
    // - Process it with sharp.js
    // - Delete the blob
    // - Return the processed image
    console.log(`[Workflow] Step 3: Requesting processing (operation: ${processOptions.operation})`);

    const response = await fetch('/api/process-from-blob', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blobUrl: blob.url,
        operation: processOptions.operation,
        params: processOptions.params,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Processing failed: ${errorText}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Processing failed');
    }

    console.log(`[Workflow] Processing complete. Blob was automatically deleted.`);

    return result.data;

  } catch (error) {
    console.error('[Workflow] Error:', error);
    throw new Error(
      `Upload and process workflow failed: ${error instanceof Error ? error.message : 'Unknown error'}`
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
