'use client';

import { useState, useCallback } from 'react';
import { validateVideoFile } from '@/lib/fileValidation';
import { getVideoProcessor } from '@/lib/videoProcessor';
import type { UploadedVideoData, VideoProcessingMode } from '@/types';

interface UseVideoUploadReturn {
  isUploading: boolean;
  uploadedVideo: UploadedVideoData | null;
  error: string | null;
  validationError: { type: 'format' | 'size'; filename: string | null } | null;
  uploadProgress: number;
  uploadFile: (file: File) => Promise<void>;
  reset: () => void;
}

export function useVideoUpload(mode?: VideoProcessingMode): UseVideoUploadReturn {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedVideo, setUploadedVideo] = useState<UploadedVideoData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<{ type: 'format' | 'size'; filename: string | null } | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const uploadFile = useCallback(async (file: File) => {
    setIsUploading(true);
    setError(null);
    setValidationError(null);
    setUploadProgress(0);

    try {
      // Validate file
      const validation = validateVideoFile(file, undefined, mode);
      if (!validation.isValid) {
        setValidationError({
          type: validation.errorType || 'format',
          filename: file.name,
        });
        setError(validation.error || 'Invalid video file');
        setIsUploading(false);
        return;
      }

      setUploadProgress(20);

      // Get video processor
      const processor = getVideoProcessor();

      // Load FFmpeg if not already loaded
      setUploadProgress(40);
      await processor.load();

      setUploadProgress(60);

      // Extract metadata
      const metadata = await processor.getVideoMetadata(file);

      setUploadProgress(80);

      // Generate thumbnail
      const thumbnailUrl = await processor.generateThumbnail(file);

      setUploadProgress(90);

      // Create blob URL for video
      const blobUrl = URL.createObjectURL(file);

      setUploadProgress(100);

      // Set uploaded video data
      setUploadedVideo({
        filename: file.name,
        metadata,
        size: file.size,
        mimetype: file.type,
        videoData: blobUrl,
        blobUrl,
        thumbnailUrl,
      });

      setIsUploading(false);
    } catch (err) {
      console.error('Video upload error:', err);
      setError(err instanceof Error ? err.message : 'Failed to upload video');
      setIsUploading(false);
    }
  }, [mode]);

  const reset = useCallback(() => {
    // Revoke blob URLs to free memory
    if (uploadedVideo?.blobUrl) {
      URL.revokeObjectURL(uploadedVideo.blobUrl);
    }
    if (uploadedVideo?.thumbnailUrl) {
      URL.revokeObjectURL(uploadedVideo.thumbnailUrl);
    }

    setUploadedVideo(null);
    setError(null);
    setValidationError(null);
    setUploadProgress(0);
    setIsUploading(false);
  }, [uploadedVideo]);

  return {
    isUploading,
    uploadedVideo,
    error,
    validationError,
    uploadProgress,
    uploadFile,
    reset,
  };
}
