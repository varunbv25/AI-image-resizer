import { NextRequest, NextResponse } from 'next/server';
import { ImageProcessor } from '@/lib/imageProcessor';
import { FileHandler } from '@/lib/fileHandler';
import { createCloudConvertService } from '@/lib/cloudConvert';
import { parseJsonBody, isPayloadTooLargeError } from '@/lib/requestHelper';
import { APIResponse, ImageDimensions, ImageProcessingOptions, ExtensionStrategy } from '@/types';

// Configure route to handle large payloads and prevent timeout
export const runtime = 'nodejs';
export const maxDuration = 60; // 60 seconds timeout
export const dynamic = 'force-dynamic';
// Note: Body size limit configured in next.config.js (100MB)

interface ProcessRequestBody {
  imageData?: string; // Base64 data (legacy)
  blobUrl?: string; // Vercel Blob URL (new)
  targetDimensions: ImageDimensions;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
  strategy?: ExtensionStrategy;
}

export async function POST(req: NextRequest) {
  try {
    // Get API key from environment
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (geminiApiKey) {
      console.log('✅ Gemini API key loaded from environment');
    } else {
      console.warn('⚠️ Gemini API key not found - AI features will be disabled');
    }

    // Use custom JSON parser to support large payloads (up to 100MB)
    const body = await parseJsonBody<ProcessRequestBody>(req);
    const {
      imageData,
      blobUrl,
      targetDimensions,
      quality = 80,
      format = 'jpeg',
      strategy = { type: 'ai' },
    } = body;

    if (!targetDimensions) {
      throw new Error('Missing target dimensions');
    }

    let imageBuffer: Buffer;

    // Support both blob URL and legacy base64 data
    if (blobUrl) {
      // Fetch image from Vercel Blob
      console.log('Fetching image from blob:', blobUrl);
      const blobResponse = await fetch(blobUrl);
      if (!blobResponse.ok) {
        throw new Error('Failed to fetch image from blob storage');
      }
      const arrayBuffer = await blobResponse.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
    } else if (imageData) {
      // Legacy: Convert base64 to buffer
      imageBuffer = Buffer.from(imageData, 'base64');
    } else {
      throw new Error('No image data or blob URL provided');
    }

    // Get original dimensions
    const processor = new ImageProcessor(geminiApiKey);
    const originalDimensions = await processor.getImageDimensions(imageBuffer);

    // Process the image
    const options: ImageProcessingOptions = {
      targetDimensions,
      quality,
      format,
    };

    const processedImage = await processor.processImage(
      imageBuffer,
      originalDimensions,
      targetDimensions,
      options,
      strategy
    );

    // Auto-upscale if image is < 100KB to reach 150-200KB range
    const upscaledResult = await processor.autoUpscaleIfNeeded(processedImage);
    const finalImage = upscaledResult;
    const wasUpscaled = upscaledResult.wasUpscaled || false;

    // Compress the processed image for optimal web use
    let finalImageBuffer = finalImage.buffer;
    let fallbackUsed = false;

    try {
      if (process.env.CLOUDCONVERT_API_KEY) {
        const cloudConvert = createCloudConvertService(process.env.CLOUDCONVERT_API_KEY);
        const optimalSettings = await cloudConvert.getOptimalWebSettings(
          processedImage.buffer.length,
          processedImage.metadata.format || 'jpeg'
        );

        finalImageBuffer = await cloudConvert.compressImage(
          processedImage.buffer,
          'processed-image.jpg',
          {
            quality: optimalSettings.quality,
            format: 'jpg',
            optimize: true,
          }
        );
      }
    } catch (compressionError) {
      console.warn('CloudConvert compression failed, using original:', compressionError);
      fallbackUsed = true;
    }

    // Clean up blob if it was used
    if (blobUrl) {
      try {
        const { del } = await import('@vercel/blob');
        await del(blobUrl);
        console.log('Cleaned up blob:', blobUrl);
      } catch (cleanupError) {
        console.warn('Failed to cleanup blob:', cleanupError);
        // Don't fail the request if cleanup fails
      }
    }

    // Return processed image
    const response: APIResponse = {
      success: true,
      data: {
        imageData: finalImageBuffer.toString('base64'),
        metadata: {
          ...finalImage.metadata,
          size: finalImageBuffer.length,
          wasUpscaled,
        },
        filename: FileHandler.generateFileName('image', wasUpscaled ? 'expanded-upscaled' : 'expanded'),
        ...(fallbackUsed && { fallbackUsed }),
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Processing error:', error);

    // Handle payload size errors with helpful message
    if (isPayloadTooLargeError(error)) {
      const response: APIResponse = {
        success: false,
        error: 'Image file is too large. Please use an image smaller than 10MB or reduce the image quality before upload.',
      };
      return NextResponse.json(response, { status: 413 });
    }

    // Try fallback strategy if AI processing failed
    if (error instanceof Error && error.message.includes('AI')) {
      try {
        const body = await parseJsonBody<ProcessRequestBody>(req);
        const { imageData, targetDimensions, quality = 80, format = 'jpeg' } = body;

        const imageBuffer = Buffer.from(imageData, 'base64');
        const processor = new ImageProcessor(); // No API key for fallback - uses crop only
        const originalDimensions = await processor.getImageDimensions(imageBuffer);

        const options: ImageProcessingOptions = {
          targetDimensions,
          quality,
          format,
        };

        const processedImage = await processor.processImage(
          imageBuffer,
          originalDimensions,
          targetDimensions,
          options,
          { type: 'edge-extend' } // Fallback strategy
        );

        const response: APIResponse = {
          success: true,
          data: {
            imageData: processedImage.buffer.toString('base64'),
            metadata: processedImage.metadata,
            filename: FileHandler.generateFileName('image', 'resized'),
            fallbackUsed: true,
          },
        };

        return NextResponse.json(response);
      } catch (fallbackError) {
        console.error('Fallback processing error:', fallbackError);
      }
    }

    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Processing failed',
    };
    return NextResponse.json(response, { status: 500 });
  }
}