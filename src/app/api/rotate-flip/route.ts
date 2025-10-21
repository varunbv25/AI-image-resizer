import { NextRequest, NextResponse } from 'next/server';
import { parseJsonBody, isPayloadTooLargeError } from '@/lib/requestHelper';
import { APIResponse } from '@/types';
import { ImageProcessor } from '@/lib/imageProcessor';

// Configure route to handle large payloads and prevent timeout
export const runtime = 'nodejs';
export const maxDuration = 60; // 60 seconds timeout
export const dynamic = 'force-dynamic';
// Note: Body size limit configured in next.config.js (100MB)

interface RotateFlipRequestBody {
  imageData: string;
  operation: 'rotate-90' | 'rotate-180' | 'rotate-270' | 'flip-horizontal' | 'flip-vertical' | 'custom';
  customAngle?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
  flipHorizontal?: boolean;
  flipVertical?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    // Use custom JSON parser to support large payloads (up to 100MB)
    const body = await parseJsonBody<RotateFlipRequestBody>(req);
    const {
      imageData,
      operation,
      customAngle = 0,
      quality = 90,
      format = 'jpeg',
      flipHorizontal = false,
      flipVertical = false,
    } = body;

    if (!imageData || !operation) {
      throw new Error('Missing required parameters: imageData and operation');
    }

    // Validate operation
    const validOperations = ['rotate-90', 'rotate-180', 'rotate-270', 'flip-horizontal', 'flip-vertical', 'custom'];
    if (!validOperations.includes(operation)) {
      throw new Error('Invalid operation type');
    }

    // Validate custom angle if provided
    if (operation === 'custom' && (customAngle < -180 || customAngle > 180)) {
      throw new Error('Custom angle must be between -180 and 180 degrees');
    }

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(imageData, 'base64');

    // Process the image using ImageProcessor
    const processor = new ImageProcessor(process.env.GOOGLE_AI_API_KEY);
    let result = await processor.rotateFlipImage(
      imageBuffer,
      operation,
      customAngle,
      format,
      quality
    );

    // Apply flip transformations if needed
    if (flipHorizontal || flipVertical) {
      const sharp = (await import('sharp')).default;
      let sharpInstance = sharp(result.buffer);

      if (flipHorizontal) {
        sharpInstance = sharpInstance.flop();
      }
      if (flipVertical) {
        sharpInstance = sharpInstance.flip();
      }

      const flippedBuffer = await sharpInstance.toBuffer();
      const flippedMetadata = await sharp(flippedBuffer).metadata();

      result = {
        buffer: flippedBuffer,
        metadata: {
          width: flippedMetadata.width || result.metadata.width,
          height: flippedMetadata.height || result.metadata.height,
          format: flippedMetadata.format || result.metadata.format,
          size: flippedBuffer.length,
        },
      };
    }

    // Auto-upscale if < 100KB
    const upscaledResult = await processor.autoUpscaleIfNeeded(result);
    const wasUpscaled = upscaledResult.wasUpscaled || false;

    const response: APIResponse = {
      success: true,
      data: {
        imageData: upscaledResult.buffer.toString('base64'),
        metadata: {
          ...upscaledResult.metadata,
          wasUpscaled,
        },
        filename: `transformed${wasUpscaled ? '-upscaled' : ''}.${format}`,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Rotate/Flip error:', error);

    // Handle payload size errors with helpful message
    if (isPayloadTooLargeError(error)) {
      const response: APIResponse = {
        success: false,
        error: 'Image file is too large. Please use an image smaller than 10MB or reduce the image quality before upload.',
      };
      return NextResponse.json(response, { status: 413 });
    }

    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Rotate/flip processing failed',
    };
    return NextResponse.json(response, { status: 500 });
  }
}
