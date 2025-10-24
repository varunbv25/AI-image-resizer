'use client';

import { useState } from 'react';
import { safeJsonParse } from '@/lib/safeJsonParse';

export interface ProcessingOptions {
  // For crop/resize operations
  imageData?: string; // base64 for small files
  blobUrl?: string; // blob URL for large files
  targetDimensions?: { width: number; height: number };
  cropArea?: { x: number; y: number; width: number; height: number }; // For manual cropping
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';

  // For compression
  maxFileSizePercent?: number;
  maxFileSizeKB?: number;
  originalSize?: number;

  // For enhancement
  method?: 'ai' | 'sharp' | 'onnx';
  sharpness?: number;

  // For rotate/flip
  rotateOperation?: 'rotate-90' | 'rotate-180' | 'rotate-270' | 'flip-horizontal' | 'flip-vertical' | 'custom';
  customAngle?: number;
  flipHorizontal?: boolean;
  flipVertical?: boolean;

  // For convert-format
  targetFormat?: 'jpeg' | 'png' | 'webp' | 'svg';
}

export interface ProcessingResult {
  imageData: string;
  metadata: {
    width: number;
    height: number;
    format: string;
    size: number;
  };
  filename: string;
  blobUrl?: string; // For large file results
}

/**
 * Smart processing hook that automatically chooses the correct API endpoint:
 * - Small files: Uses traditional API routes (/api/compress, /api/process, etc.)
 * - Large files: Uses blob workflow (/api/process-from-blob)
 */
export function useSmartProcessing() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);

  const processImage = async (
    operation: 'crop' | 'resize' | 'compress' | 'enhance' | 'rotate-flip' | 'convert-format',
    options: ProcessingOptions
  ): Promise<ProcessingResult> => {
    setIsProcessing(true);
    setError(null);
    setProgress(0);

    try {
      const isLargeFile = !!options.blobUrl;

      if (isLargeFile) {
        // LARGE FILE: Use Vercel Blob workflow
        console.log(`[SmartProcessing] Processing large file via blob workflow: ${operation}`);

        const response = await fetch('/api/process-from-blob', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            blobUrl: options.blobUrl,
            operation,
            params: options,
          }),
        });

        const result = await safeJsonParse(response);

        if (!result.success) {
          throw new Error(result.error || 'Processing failed');
        }

        return result.data;
      } else {
        // SMALL FILE: Use traditional API routes
        console.log(`[SmartProcessing] Processing small file via traditional route: ${operation}`);

        let endpoint: string;
        let requestBody: FormData | string;

        switch (operation) {
          case 'crop':
          case 'resize':
            endpoint = '/api/compress';
            requestBody = new FormData();
            // Convert base64 back to blob for FormData
            const base64Data = options.imageData?.startsWith('data:')
              ? options.imageData.split(',')[1]
              : options.imageData;
            if (!base64Data) throw new Error('No image data provided');

            const byteString = atob(base64Data);
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) {
              ia[i] = byteString.charCodeAt(i);
            }
            const blob = new Blob([ab], { type: 'image/jpeg' });
            requestBody.append('image', blob, 'image.jpg');
            requestBody.append('quality', (options.quality || 80).toString());
            requestBody.append('format', options.format || 'jpeg');
            break;

          case 'compress':
            endpoint = '/api/compress-image';
            requestBody = JSON.stringify({
              imageData: options.imageData,
              maxFileSizePercent: options.maxFileSizePercent,
              maxFileSizeKB: options.maxFileSizeKB,
              quality: options.quality,
              originalSize: options.originalSize,
            });
            break;

          case 'enhance':
            endpoint = '/api/enhance';
            requestBody = JSON.stringify({
              imageData: options.imageData,
              method: options.method,
              sharpness: options.sharpness,
              format: options.format,
            });
            break;

          case 'rotate-flip':
            endpoint = '/api/rotate-flip';
            requestBody = JSON.stringify({
              imageData: options.imageData,
              operation: options.rotateOperation,
              customAngle: options.customAngle,
              flipHorizontal: options.flipHorizontal,
              flipVertical: options.flipVertical,
              quality: options.quality,
              format: options.format,
            });
            break;

          case 'convert-format':
            endpoint = '/api/convert-format';
            requestBody = JSON.stringify({
              imageData: options.imageData,
              targetFormat: options.targetFormat,
              quality: options.quality,
            });
            break;

          default:
            throw new Error(`Unsupported operation: ${operation}`);
        }

        const response = await fetch(endpoint, {
          method: 'POST',
          ...(typeof requestBody === 'string' && {
            headers: { 'Content-Type': 'application/json' },
          }),
          body: requestBody,
        });

        const result = await safeJsonParse(response);

        if (!result.success) {
          throw new Error(result.error || 'Processing failed');
        }

        return result.data;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Processing failed';
      setError(errorMessage);
      console.error('[SmartProcessing] Error:', err);
      throw err;
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  return {
    isProcessing,
    error,
    progress,
    processImage,
  };
}
