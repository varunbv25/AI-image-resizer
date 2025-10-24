'use client';

import { useState, useCallback } from 'react';
import { uploadBatchFiles, BatchUploadResult } from '@/lib/batchUploadHelper';

interface UploadProgress {
  [fileIndex: number]: number;
}

interface UploadStatus {
  total: number;
  completed: number;
  failed: number;
  inProgress: boolean;
}

export function useBatchUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({});
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>({
    total: 0,
    completed: 0,
    failed: 0,
    inProgress: false,
  });
  const [uploadResults, setUploadResults] = useState<BatchUploadResult[]>([]);
  const [errors, setErrors] = useState<{ [fileIndex: number]: Error }>({});

  const uploadFiles = useCallback(async (files: File[], maxConcurrent = 3) => {
    if (files.length === 0) return;

    setIsUploading(true);
    setUploadProgress({});
    setUploadResults([]);
    setErrors({});
    setUploadStatus({
      total: files.length,
      completed: 0,
      failed: 0,
      inProgress: true,
    });

    try {
      const results = await uploadBatchFiles(files, {
        maxConcurrent,
        onProgress: (fileIndex, progress) => {
          setUploadProgress(prev => ({
            ...prev,
            [fileIndex]: progress,
          }));
        },
        onFileComplete: (fileIndex, result) => {
          setUploadStatus(prev => ({
            ...prev,
            completed: prev.completed + 1,
          }));

          setUploadResults(prev => {
            const updated = [...prev];
            updated[fileIndex] = result;
            return updated;
          });
        },
        onFileError: (fileIndex, error) => {
          setUploadStatus(prev => ({
            ...prev,
            failed: prev.failed + 1,
          }));

          setErrors(prev => ({
            ...prev,
            [fileIndex]: error,
          }));
        },
      });

      setUploadResults(results);
    } catch (error) {
      console.error('Batch upload error:', error);
    } finally {
      setIsUploading(false);
      setUploadStatus(prev => ({
        ...prev,
        inProgress: false,
      }));
    }
  }, []);

  const reset = useCallback(() => {
    setIsUploading(false);
    setUploadProgress({});
    setUploadStatus({
      total: 0,
      completed: 0,
      failed: 0,
      inProgress: false,
    });
    setUploadResults([]);
    setErrors({});
  }, []);

  const getFileProgress = useCallback((fileIndex: number): number => {
    return uploadProgress[fileIndex] || 0;
  }, [uploadProgress]);

  const getOverallProgress = useCallback((): number => {
    if (uploadStatus.total === 0) return 0;
    return Math.round(((uploadStatus.completed + uploadStatus.failed) / uploadStatus.total) * 100);
  }, [uploadStatus]);

  return {
    isUploading,
    uploadProgress,
    uploadStatus,
    uploadResults,
    errors,
    uploadFiles,
    reset,
    getFileProgress,
    getOverallProgress,
  };
}