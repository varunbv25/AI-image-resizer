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
  imageData: string;
  targetDimensions: ImageDimensions;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
  strategy?: ExtensionStrategy;
}

export async function POST(req: NextRequest) {
  try {
    // Use custom JSON parser to support large payloads (up to 100MB)
    const body = await parseJsonBody<ProcessRequestBody>(req);
    const {
      imageData,
      targetDimensions,
      quality = 80,
      format = 'jpeg',
      strategy = { type: 'ai' },
    } = body;

    if (!imageData || !targetDimensions) {
      throw new Error('Missing required parameters');
    }

    // Convert base64 back to buffer
    const imageBuffer = Buffer.from(imageData, 'base64');

    // Get original dimensions
    const processor = new ImageProcessor(process.env.GOOGLE_AI_API_KEY || 'AIzaSyCRTkZUzzC3tBlb9lNmZTmgKz2l_HZRbpw');
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

    // Compress the processed image for optimal web use
    let finalImageBuffer = processedImage.buffer;
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

    // Return processed image
    const response: APIResponse = {
      success: true,
      data: {
        imageData: finalImageBuffer.toString('base64'),
        metadata: {
          ...processedImage.metadata,
          size: finalImageBuffer.length,
        },
        filename: FileHandler.generateFileName('image', 'resized'),
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