'use client';

import { useState, useCallback } from 'react';
import { validateVideoFiles } from '@/lib/fileValidation';
import { getVideoProcessor } from '@/lib/videoProcessor';
import type { UploadedVideoData, VideoProcessingMode } from '@/types';

interface BatchVideoItem extends UploadedVideoData {
  id: string;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
}

interface UseBatchVideoUploadReturn {
  isUploading: boolean;
  uploadedVideos: BatchVideoItem[];
  validationError: { type: 'format' | 'size'; filenames: string[] } | null;
  uploadProgress: number;
  uploadFiles: (files: File[]) => Promise<void>;
  reset: () => void;
}

export function useBatchVideoUpload(mode?: VideoProcessingMode): UseBatchVideoUploadReturn {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedVideos, setUploadedVideos] = useState<BatchVideoItem[]>([]);
  const [validationError, setValidationError] = useState<{ type: 'format' | 'size'; filenames: string[] } | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const uploadFiles = useCallback(async (files: File[]) => {
    setIsUploading(true);
    setValidationError(null);
    setUploadProgress(0);

    try {
      // Validate all files
      const validation = validateVideoFiles(files, undefined, mode);

      if (!validation.isValid) {
        const errorType = validation.invalidFiles[0]?.errorType || 'format';
        const filenames = validation.invalidFiles.map(f => f.file.name);

        setValidationError({
          type: errorType,
          filenames,
        });
        setIsUploading(false);
        return;
      }

      // Get video processor
      const processor = getVideoProcessor();
      await processor.load();

      // Process each file
      const totalFiles = validation.validFiles.length;
      const batchItems: BatchVideoItem[] = [];

      for (let i = 0; i < validation.validFiles.length; i++) {
        const file = validation.validFiles[i];
        const id = `${file.name}_${Date.now()}_${i}`;

        try {
          // Update status to uploading
          const uploadingItem: BatchVideoItem = {
            id,
            filename: file.name,
            metadata: {
              duration: 0,
              width: 0,
              height: 0,
              format: file.type,
              size: file.size,
            },
            size: file.size,
            mimetype: file.type,
            videoData: '',
            status: 'uploading',
          };

          setUploadedVideos(prev => [...prev, uploadingItem]);

          // Extract metadata
          const metadata = await processor.getVideoMetadata(file);

          // Generate thumbnail
          const thumbnailUrl = await processor.generateThumbnail(file);

          // Create blob URL
          const blobUrl = URL.createObjectURL(file);

          // Update with completed data
          const completedItem: BatchVideoItem = {
            id,
            filename: file.name,
            metadata,
            size: file.size,
            mimetype: file.type,
            videoData: blobUrl,
            blobUrl,
            thumbnailUrl,
            status: 'completed',
          };

          setUploadedVideos(prev =>
            prev.map(item => (item.id === id ? completedItem : item))
          );

          batchItems.push(completedItem);

          // Update progress
          setUploadProgress(Math.round(((i + 1) / totalFiles) * 100));
        } catch (err) {
          console.error(`Error uploading ${file.name}:`, err);

          setUploadedVideos(prev =>
            prev.map(item =>
              item.id === id
                ? {
                    ...item,
                    status: 'error',
                    error: err instanceof Error ? err.message : 'Upload failed',
                  }
                : item
            )
          );
        }
      }

      setIsUploading(false);
    } catch (err) {
      console.error('Batch upload error:', err);
      setIsUploading(false);
    }
  }, [mode]);

  const reset = useCallback(() => {
    // Revoke all blob URLs
    uploadedVideos.forEach(video => {
      if (video.blobUrl) {
        URL.revokeObjectURL(video.blobUrl);
      }
      if (video.thumbnailUrl) {
        URL.revokeObjectURL(video.thumbnailUrl);
      }
    });

    setUploadedVideos([]);
    setValidationError(null);
    setUploadProgress(0);
    setIsUploading(false);
  }, [uploadedVideos]);

  return {
    isUploading,
    uploadedVideos,
    validationError,
    uploadProgress,
    uploadFiles,
    reset,
  };
}
