'use client';

import { useState, useCallback } from 'react';
import { ImageDimensions, APIResponse } from '@/types';
import { safeJsonParse } from '@/lib/safeJsonParse';
import { compressImage, formatFileSize, calculateCompressionRatio } from '@/lib/clientImageCompression';
import { validateImageFile } from '@/lib/fileValidation';
import { uploadToBlobSimple, shouldUseBlobUpload } from '@/lib/blobUploadHelper';

interface UploadedImageData {
  filename: string;
  originalDimensions: ImageDimensions;
  size: number;
  mimetype: string;
  imageData: string;
  blobUrl?: string; // Blob URL for large files (>3MB) - only metadata sent to server
}

export function useFileUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<UploadedImageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<{ type: 'format' | 'size' | null; filename: string | null }>({ type: null, filename: null });
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
        setValidationError({ type: validation.errorType || 'format', filename: file.name });
        setError(validation.error || 'Invalid file');
        setIsUploading(false);
        return;
      }
      const originalSize = file.size;
      console.log(`Original file size: ${formatFileSize(originalSize)}`);

      // Check if file should use blob upload (bypassing the 4.5MB Vercel limit)
      if (shouldUseBlobUpload(originalSize)) {
        console.log('🚀 Using blob upload for large file (>3MB)...');

        try {
          // Upload file to blob storage (client-side upload, no server processing)
          const blobResult = await uploadToBlobSimple(file, {
            onProgress: (progress) => {
              setUploadProgress(progress);
            },
          });

          // Get image dimensions client-side
          const dimensions = await getImageDimensions(file);

          // Create a small preview thumbnail for display (max 200KB)
          const previewUrl = await createThumbnail(file, 400, 400);

          console.log(`✅ Blob uploaded: ${blobResult.blobUrl}`);
          console.log(`📐 Dimensions: ${dimensions.width}x${dimensions.height}`);

          setUploadedImage({
            filename: blobResult.filename,
            originalDimensions: dimensions,
            size: blobResult.size,
            mimetype: blobResult.mimetype,
            imageData: previewUrl, // Small preview for UI display only
            blobUrl: blobResult.blobUrl, // Blob URL for server-side processing
          });

          return;
        } catch (blobError) {
          // If blob upload fails (e.g., not configured), fall back to compression + traditional upload
          console.warn('Blob upload failed, falling back to compression:', blobError);
          console.log('Compressing large file for traditional upload...');

          // Compress the file to fit within limits
          file = await compressImage(file, {
            maxSizeMB: 2,
            maxWidthOrHeight: 4096,
            quality: 0.75,
          });

          console.log(`Compressed to: ${formatFileSize(file.size)}`);
          // Continue to traditional upload below
        }
      }

      // For smaller files, use the traditional upload method
      // Compress image before upload to prevent payload size errors
      // Max 2MB to ensure compatibility with most platforms (Vercel 4.5MB limit)
      // Base64 encoding adds ~33% overhead, so 2MB file → ~2.7MB base64
      // This leaves headroom for JSON overhead and processing
      let fileToUpload = file;

      if (originalSize > 2 * 1024 * 1024) { // If larger than 2MB (but smaller than 3MB)
        console.log('Compressing image before upload...');
        fileToUpload = await compressImage(file, {
          maxSizeMB: 2,
          maxWidthOrHeight: 4096,
          quality: 0.8,
        });

        const compressedSize = fileToUpload.size;
        const ratio = calculateCompressionRatio(originalSize, compressedSize);
        console.log(`Compressed to: ${formatFileSize(compressedSize)} (${ratio}% reduction)`);
      }

      const formData = new FormData();
      formData.append('image', fileToUpload);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const result: APIResponse<UploadedImageData> = await safeJsonParse(response);

      if (!result.success) {
        throw new Error(result.error || 'Upload failed');
      }

      setUploadedImage(result.data!);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed';
      setError(errorMessage);
      console.error('Upload error:', err);
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

/**
 * Get image dimensions from a file (client-side)
 */
async function getImageDimensions(file: File): Promise<ImageDimensions> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      resolve({
        width: img.width,
        height: img.height,
      });
      URL.revokeObjectURL(url);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image dimensions'));
    };

    img.src = url;
  });
}

/**
 * Create a small thumbnail preview for UI display
 */
async function createThumbnail(file: File, maxWidth: number, maxHeight: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      // Calculate thumbnail dimensions
      let width = img.width;
      let height = img.height;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      // Create canvas for thumbnail
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Could not get canvas context'));
        return;
      }

      // Draw resized image
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to base64 (JPEG with quality 0.7 for small size)
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to create thumbnail blob'));
            return;
          }

          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            const base64 = result.split(',')[1];
            URL.revokeObjectURL(url);
            resolve(base64);
          };
          reader.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to read thumbnail'));
          };
          reader.readAsDataURL(blob);
        },
        'image/jpeg',
        0.7
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for thumbnail'));
    };

    img.src = url;
  });
}