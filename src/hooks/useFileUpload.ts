'use client';

import { useState, useCallback } from 'react';
import { ImageDimensions, APIResponse } from '@/types';
import { safeJsonParse } from '@/lib/safeJsonParse';
import { compressImage, formatFileSize, calculateCompressionRatio } from '@/lib/clientImageCompression';

interface UploadedImageData {
  filename: string;
  originalDimensions: ImageDimensions;
  size: number;
  mimetype: string;
  imageData: string;
}

export function useFileUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<UploadedImageData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const uploadFile = useCallback(async (file: File) => {
    setIsUploading(true);
    setError(null);

    try {
      const originalSize = file.size;
      console.log(`Original file size: ${formatFileSize(originalSize)}`);

      // Compress image before upload to prevent payload size errors
      // Max 3MB to ensure compatibility with most platforms (Vercel 4.5MB limit)
      // Base64 encoding adds ~33% overhead, so 3MB file → ~4MB base64
      let fileToUpload = file;

      if (originalSize > 3 * 1024 * 1024) { // If larger than 3MB
        console.log('Compressing image before upload...');
        fileToUpload = await compressImage(file, {
          maxSizeMB: 3,
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
    }
  }, []);

  const reset = useCallback(() => {
    setUploadedImage(null);
    setError(null);
    setIsUploading(false);
  }, []);

  return {
    isUploading,
    uploadedImage,
    error,
    uploadFile,
    reset,
  };
}