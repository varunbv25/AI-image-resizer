'use client';

import { useState, useCallback } from 'react';
import { ImageDimensions, APIResponse, ProcessingStatus } from '@/types';

interface UpscaledImageData {
  imageData: string;
  metadata: {
    width: number;
    height: number;
    format: string;
    size: number;
  };
  filename: string;
}


export function useUpscaling() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [upscaledImage, setUpscaledImage] = useState<UpscaledImageData | null>(null);
  const [status, setStatus] = useState<ProcessingStatus>({
    stage: 'idle',
    progress: 0,
    message: '',
  });

  const upscaleImage = useCallback(
    async (
      imageData: string,
      targetDimensions: ImageDimensions,
      options: {
        quality?: number;
        format?: 'jpeg' | 'png' | 'webp';
      } = {}
    ) => {
      setIsProcessing(true);
      setUpscaledImage(null);
      setStatus({
        stage: 'analyzing',
        progress: 20,
        message: 'Upscaling image...',
      });

      try {
        setStatus({
          stage: 'extending',
          progress: 60,
          message: 'Applying high-quality scaling...',
        });

        const response = await fetch('/api/upscale', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            imageData,
            targetDimensions,
            quality: options.quality || 80,
            format: options.format || 'jpeg',
          }),
        });

        const result: APIResponse<UpscaledImageData> = await response.json();

        if (!result.success) {
          throw new Error(result.error || 'Upscaling failed');
        }

        setStatus({
          stage: 'completed',
          progress: 100,
          message: 'Upscaling completed successfully!',
        });

        setUpscaledImage(result.data!);
      } catch (error) {
        console.error('Upscaling error:', error);
        setStatus({
          stage: 'error',
          progress: 0,
          message: error instanceof Error ? error.message : 'Upscaling failed',
        });
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  const downloadImage = useCallback((filename?: string) => {
    if (!upscaledImage) return;

    const link = document.createElement('a');
    link.href = `data:image/${upscaledImage.metadata.format};base64,${upscaledImage.imageData}`;
    link.download = filename || upscaledImage.filename || 'upscaled-image.jpg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [upscaledImage]);

  const reset = useCallback(() => {
    setIsProcessing(false);
    setUpscaledImage(null);
    setStatus({
      stage: 'idle',
      progress: 0,
      message: '',
    });
  }, []);

  return {
    isProcessing,
    upscaledImage,
    status,
    upscaleImage,
    downloadImage,
    reset,
  };
}