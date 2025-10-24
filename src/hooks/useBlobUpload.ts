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
 *
 * This implements the first 2 steps of the workflow:
 * Step 1: Client requests secure upload token from /api/get-upload-token
 * Step 2: Client uploads file directly to Vercel Blob (bypasses 4.5MB serverless limit)
 *
 * Step 3 (processing) is handled separately by calling /api/process-from-blob with the returned URL
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
      console.log(`[useBlobUpload] Step 1 & 2: Uploading ${file.name} to Vercel Blob`);

      // Upload directly to Vercel Blob using client upload
      // This bypasses the serverless function payload limit
      const blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/get-upload-token', // Updated to use new endpoint
        multipart: true, // Enable multipart upload for large files
        clientPayload: JSON.stringify({
          uploadedAt: Date.now(),
          fileName: file.name,
          fileSize: file.size,
        }),
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setUploadProgress(percentCompleted);
          console.log(`[useBlobUpload] Upload progress: ${percentCompleted}%`);
        },
      });

      console.log(`[useBlobUpload] Upload complete: ${blob.url}`);
      console.log(`[useBlobUpload] Note: Blob will be auto-deleted after processing`);

      return {
        url: blob.url,
        pathname: blob.pathname,
        contentType: blob.contentType || file.type,
        size: file.size,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed';
      setError(errorMessage);
      console.error('[useBlobUpload] Error:', err);
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