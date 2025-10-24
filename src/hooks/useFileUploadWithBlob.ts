'use client';

import { useState, useCallback } from 'react';
import { ImageDimensions, APIResponse } from '@/types';
import { upload } from '@vercel/blob/client';
import { validateImageFile } from '@/lib/fileValidation';

interface UploadedImageData {
  filename: string;
  originalDimensions: ImageDimensions;
  size: number;
  mimetype: string;
  imageData: string; // Base64 data for preview
  blobUrl?: string; // Vercel Blob URL for processing
}

/**
 * File upload hook that uses Vercel Blob for direct client uploads
 * This bypasses the 4.5MB serverless function limit
 */
export function useFileUploadWithBlob() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedImage, setUploadedImage] = useState<UploadedImageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<{
    type: 'format' | 'size' | null;
    filename: string | null
  }>({ type: null, filename: null });

  const uploadFile = useCallback(async (file: File) => {
    setIsUploading(true);
    setUploadProgress(0);
    setError(null);
    setValidationError({ type: null, filename: null });

    try {
      // Validate file format only (use large size limit for blob uploads)
      const validation = validateImageFile(file, 50 * 1024 * 1024); // 50MB max for blob
      if (!validation.isValid) {
        setValidationError({
          type: validation.errorType || 'format',
          filename: file.name
        });
        setError(validation.error || 'Invalid file');
        setIsUploading(false);
        return;
      }

      console.log(`Uploading file: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);

      // Upload directly to Vercel Blob - bypasses serverless function!
      const blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/blob/upload-token',
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setUploadProgress(percentCompleted);
          console.log(`Upload progress: ${percentCompleted}%`);
        },
      });

      console.log('Blob uploaded successfully:', blob.url);

      // Create a preview by reading the file as base64 (limited to first 5MB for preview)
      const previewData = await createPreview(file);

      // Get image dimensions from the file
      const dimensions = await getImageDimensions(file);

      const uploadedData: UploadedImageData = {
        filename: file.name,
        originalDimensions: dimensions,
        size: file.size,
        mimetype: file.type,
        imageData: previewData, // Base64 for client-side preview
        blobUrl: blob.url, // Blob URL for server-side processing
      };

      setUploadedImage(uploadedData);
      console.log('Upload complete');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed';
      setError(errorMessage);
      console.error('Upload error:', err);
    } finally {
      setIsUploading(false);
      setUploadProgress(100);
    }
  }, []);

  const reset = useCallback(() => {
    setUploadedImage(null);
    setError(null);
    setIsUploading(false);
    setUploadProgress(0);
    setValidationError({ type: null, filename: null });
  }, []);

  return {
    isUploading,
    uploadProgress,
    uploadedImage,
    error,
    validationError,
    uploadFile,
    reset,
  };
}

/**
 * Create a base64 preview of the image for client-side display
 */
async function createPreview(file: File): Promise<string> {
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
 * Get image dimensions from a file
 */
async function getImageDimensions(file: File): Promise<ImageDimensions> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      resolve({
        width: img.width,
        height: img.height
      });
      URL.revokeObjectURL(url);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}