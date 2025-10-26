'use client';

import { useState, useCallback } from 'react';
import { ImageDimensions, ProcessingStatus, APIResponse } from '@/types';
import { safeJsonParse } from '@/lib/safeJsonParse';

interface ProcessedImageData {
  imageData: string;
  metadata: {
    width: number;
    height: number;
    format: string;
    size: number;
  };
  filename: string;
  fallbackUsed?: boolean;
}

export function useImageProcessing() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedImage, setProcessedImage] = useState<ProcessedImageData | null>(null);
  const [status, setStatus] = useState<ProcessingStatus>({
    stage: 'idle',
    progress: 0,
    message: '',
  });

  const processImage = useCallback(
    async (
      imageDataOrBlobUrl: string,
      targetDimensions: ImageDimensions,
      options: {
        quality?: number;
        format?: 'jpeg' | 'png' | 'webp' | 'svg';
        blobUrl?: string; // Pass blob URL for large files
      } = {}
    ) => {
      setIsProcessing(true);
      setProcessedImage(null);
      setStatus({
        stage: 'analyzing',
        progress: 10,
        message: 'Analyzing image requirements...',
      });

      try {
        setStatus({
          stage: 'extending',
          progress: 30,
          message: 'Processing image...',
        });

        // Prepare request body - use blobUrl if provided, otherwise use imageData
        const requestBody: {
          imageData?: string;
          blobUrl?: string;
          targetDimensions: ImageDimensions;
          quality: number;
          format: string;
          strategy: { type: 'ai' };
        } = {
          targetDimensions,
          quality: options.quality || 80,
          format: options.format || 'jpeg',
          strategy: { type: 'ai' },
        };

        if (options.blobUrl) {
          console.log('🚀 Using blob URL for processing (large file)');
          requestBody.blobUrl = options.blobUrl;
        } else {
          requestBody.imageData = imageDataOrBlobUrl;
        }

        const response = await fetch('/api/process', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        const result: APIResponse<ProcessedImageData> = await safeJsonParse(response);

        if (!result.success) {
          throw new Error(result.error || 'Processing failed');
        }

        setStatus({
          stage: 'optimizing',
          progress: 80,
          message: 'Optimizing for web...',
        });

        // Simulate optimization delay
        await new Promise(resolve => setTimeout(resolve, 500));

        setStatus({
          stage: 'completed',
          progress: 100,
          message: 'Processing completed successfully!',
        });

        setProcessedImage(result.data!);
      } catch (error) {
        console.error('Processing error:', error);
        setStatus({
          stage: 'error',
          progress: 0,
          message: error instanceof Error ? error.message : 'Processing failed',
        });
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  const downloadImage = useCallback((filename?: string) => {
    if (!processedImage) return;

    const link = document.createElement('a');
    link.href = `data:image/${processedImage.metadata.format};base64,${processedImage.imageData}`;
    link.download = filename || processedImage.filename || 'resized-image.jpg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [processedImage]);

  const reset = useCallback(() => {
    setIsProcessing(false);
    setProcessedImage(null);
    setStatus({
      stage: 'idle',
      progress: 0,
      message: '',
    });
  }, []);

  return {
    isProcessing,
    processedImage,
    status,
    processImage,
    downloadImage,
    reset,
  };
}