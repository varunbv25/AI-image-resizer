'use client';

import { useState, useCallback } from 'react';
import { ImageDimensions, APIResponse } from '@/types';
import { compressImageFile } from '@/lib/clientImageCompressor';

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
      // Compress image on client side before uploading to stay under Vercel's 4.5MB limit
      const compressedFile = await compressImageFile(file, {
        maxWidth: 4096,
        maxHeight: 4096,
        quality: 0.85,
        maxSizeMB: 3, // Target 3MB (leaves room for base64 encoding ~4MB)
      });

      const formData = new FormData();
      formData.append('image', compressedFile);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const result: APIResponse<UploadedImageData> = await response.json();

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