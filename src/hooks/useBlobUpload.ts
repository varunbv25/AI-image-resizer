import { useState } from 'react';
import { upload } from '@vercel/blob/client';

interface BlobUploadResult {
  url: string;
  pathname: string;
  contentType: string;
  size: number;
}

interface UseBlobUploadReturn {
  uploadToBlob: (file: File) => Promise<BlobUploadResult>;
  isUploading: boolean;
  uploadProgress: number;
  error: string | null;
}

/**
 * Hook for uploading files directly to Vercel Blob
 * Bypasses serverless function size limits by uploading directly from client
 */
export function useBlobUpload(): UseBlobUploadReturn {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const uploadToBlob = async (file: File): Promise<BlobUploadResult> => {
    setIsUploading(true);
    setUploadProgress(0);
    setError(null);

    try {
      // Upload directly to Vercel Blob using client upload
      const blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/blob/upload-token',
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setUploadProgress(percentCompleted);
        },
      });

      return {
        url: blob.url,
        pathname: blob.pathname,
        contentType: blob.contentType || file.type,
        size: file.size,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  return {
    uploadToBlob,
    isUploading,
    uploadProgress,
    error,
  };
}