'use client';

import { useState, useCallback } from 'react';
import { ImageDimensions, APIResponse } from '@/types';
import { safeJsonParse } from '@/lib/safeJsonParse';
import { validateImageFile } from '@/lib/fileValidation';
import { upload } from '@vercel/blob/client';

/**
 * Size threshold for determining upload method
 * Files <= 3MB use traditional upload
 * Files > 3MB use Vercel Blob workflow
 */
const SIZE_THRESHOLD = 3 * 1024 * 1024; // 3MB

interface UploadedImageData {
  filename: string;
  originalDimensions: ImageDimensions;
  size: number;
  mimetype: string;
  imageData: string; // base64 for small files
  blobUrl?: string; // blob URL for large files
  isLargeFile?: boolean; // flag to indicate which workflow was used
}

/**
 * Smart file upload hook that automatically chooses the best upload method:
 * - Small files (≤3MB): Traditional FormData upload (like commit fbad279)
 * - Large files (>3MB): Vercel Blob direct upload workflow
 */
export function useSmartFileUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<UploadedImageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<{
    type: 'format' | 'size' | null;
    filename: string | null;
  }>({ type: null, filename: null });
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  const uploadFile = useCallback(async (file: File) => {
    setIsUploading(true);
    setError(null);
    setValidationError({ type: null, filename: null });
    setUploadProgress(0);

    try {
      // Validate file format and size
      const validation = validateImageFile(file);
      if (!validation.isValid) {
        setValidationError({
          type: validation.errorType || 'format',
          filename: file.name,
        });
        setError(validation.error || 'Invalid file');
        setIsUploading(false);
        return;
      }

      const fileSize = file.size;
      console.log(`[SmartUpload] File size: ${(fileSize / 1024 / 1024).toFixed(2)}MB`);

      // Determine which upload method to use based on file size
      if (fileSize <= SIZE_THRESHOLD) {
        // SMALL FILE: Use traditional FormData upload (commit fbad279 workflow)
        console.log('[SmartUpload] Using traditional upload for small file');

        const formData = new FormData();
        formData.append('image', file);

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        const result: APIResponse<UploadedImageData> = await safeJsonParse(response);

        if (!result.success) {
          throw new Error(result.error || 'Upload failed');
        }

        setUploadedImage({
          ...result.data!,
          isLargeFile: false,
        });
      } else {
        // LARGE FILE: Use Vercel Blob direct upload workflow
        console.log('[SmartUpload] Using Vercel Blob upload for large file');

        // Step 1 & 2: Upload directly to Vercel Blob
        const blob = await upload(file.name, file, {
          access: 'public',
          handleUploadUrl: '/api/get-upload-token',
          multipart: true,
          clientPayload: JSON.stringify({
            uploadedAt: Date.now(),
            fileName: file.name,
            fileSize: file.size,
          }),
          onUploadProgress: ({ loaded, total }) => {
            const progress = Math.round((loaded / total) * 100);
            setUploadProgress(progress);
            console.log(`[SmartUpload] Upload progress: ${progress}%`);
          },
        });

        console.log(`[SmartUpload] Uploaded to blob: ${blob.url}`);

        // Get image dimensions from the blob
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);
        const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
          img.onload = () => {
            resolve({ width: img.width, height: img.height });
            URL.revokeObjectURL(objectUrl);
          };
          img.onerror = reject;
          img.src = objectUrl;
        });

        // For large files, we don't store base64 - we use blob URL
        setUploadedImage({
          filename: file.name,
          originalDimensions: dimensions,
          size: file.size,
          mimetype: file.type,
          imageData: '', // Empty for large files
          blobUrl: blob.url,
          isLargeFile: true,
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed';
      setError(errorMessage);
      console.error('[SmartUpload] Error:', err);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, []);

  const reset = useCallback(() => {
    setUploadedImage(null);
    setError(null);
    setIsUploading(false);
    setValidationError({ type: null, filename: null });
    setUploadProgress(0);
  }, []);

  return {
    isUploading,
    uploadedImage,
    error,
    validationError,
    uploadProgress,
    uploadFile,
    reset,
  };
}
