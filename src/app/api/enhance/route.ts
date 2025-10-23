import { NextRequest, NextResponse } from 'next/server';
import { ImageProcessor } from '@/lib/imageProcessor';
import { FileHandler } from '@/lib/fileHandler';
import { parseJsonBody, isPayloadTooLargeError } from '@/lib/requestHelper';
import { APIResponse } from '@/types';

// Configure route to handle large payloads and prevent timeout
export const runtime = 'nodejs';
export const maxDuration = 60; // 60 seconds timeout
export const dynamic = 'force-dynamic';
// Note: Body size limit configured in next.config.js (100MB)

interface EnhanceRequestBody {
  imageData: string;
  format?: 'jpeg' | 'png' | 'webp';
  method?: 'ai' | 'sharp' | 'onnx'; // Enhancement method selection
  sharpness?: number; // For Sharp.js method (1-10)
}

export async function POST(req: NextRequest) {
  try {
    // Use custom JSON parser to support large payloads (up to 100MB)
    const body = await parseJsonBody<EnhanceRequestBody>(req);
    const {
      imageData,
      format = 'jpeg',
      method = 'ai',
      sharpness = 5,
    } = body;

    if (!imageData) {
      throw new Error('Missing required parameter: imageData');
    }

    // Convert base64 back to buffer
    const imageBuffer = Buffer.from(imageData, 'base64');

    const processor = new ImageProcessor(process.env.GEMINI_API_KEY);
    let enhancedImage;

    // Choose enhancement method
    switch (method) {
      case 'sharp':
        // Use Sharp.js sharpening (fast, offline, no AI)
        enhancedImage = await processor.sharpenImage(imageBuffer, format, sharpness);
        break;

      case 'onnx':
        // Use ONNX NAFNet model (client-side ML, future implementation)
        // For now, fall back to Sharp.js
        console.log('ONNX method not yet implemented, falling back to Sharp.js');
        enhancedImage = await processor.sharpenImage(imageBuffer, format, sharpness);
        break;

      case 'ai':
      default:
        // Use Gemini AI for enhancement (requires API key)
        try {
          console.log('Using Gemini AI for image enhancement...');
          enhancedImage = await processor.enhanceImageWithAI(imageBuffer, format);
        } catch (aiError) {
          // Fallback to Sharp.js if AI fails
          console.log('AI enhancement failed, falling back to Sharp.js:', aiError);
          enhancedImage = await processor.sharpenImage(imageBuffer, format, sharpness);
        }
        break;
    }

    // Check if enhanced image is < 100 KB and upscale if needed
    const TARGET_MIN_SIZE = 100 * 1024; // 100 KB
    const TARGET_SIZE_RANGE = { min: 190 * 1024, max: 200 * 1024 }; // 190-200 KB

    let finalImage = enhancedImage;
    let wasUpscaled = false;

    if (enhancedImage.buffer.length < TARGET_MIN_SIZE) {
      console.log(`Image size ${(enhancedImage.buffer.length / 1024).toFixed(2)} KB is below 100 KB threshold, upscaling...`);

      // Calculate scale factor to reach target size
      // File size roughly scales with pixel count for same quality
      const currentSize = enhancedImage.buffer.length;
      const targetSize = (TARGET_SIZE_RANGE.min + TARGET_SIZE_RANGE.max) / 2;
      const sizeRatio = targetSize / currentSize;

      // Scale factor is square root of size ratio (since size ~ width * height)
      const scaleFactor = Math.sqrt(sizeRatio);
      const clampedScaleFactor = Math.min(scaleFactor, 4.0); // Cap at 4x

      const newWidth = Math.round(enhancedImage.metadata.width * clampedScaleFactor);
      const newHeight = Math.round(enhancedImage.metadata.height * clampedScaleFactor);

      console.log(`Upscaling from ${enhancedImage.metadata.width}x${enhancedImage.metadata.height} to ${newWidth}x${newHeight} (${clampedScaleFactor.toFixed(2)}x)`);

      // Use Lanczos3 for high-quality upscaling
      const sharp = await import('sharp');
      const sharpFunc = sharp.default || sharp;

      const upscaledBuffer = await sharpFunc(enhancedImage.buffer, {
        limitInputPixels: 1000000000
      })
        .resize(newWidth, newHeight, {
          kernel: 'lanczos3',
          fit: 'fill'
        })
        .jpeg({ quality: 90, progressive: true })
        .toBuffer();

      const upscaledMetadata = await sharpFunc(upscaledBuffer, {
        limitInputPixels: 1000000000
      }).metadata();

      finalImage = {
        buffer: upscaledBuffer,
        metadata: {
          width: upscaledMetadata.width || newWidth,
          height: upscaledMetadata.height || newHeight,
          format: upscaledMetadata.format || format,
          size: upscaledBuffer.length,
        },
      };

      wasUpscaled = true;
      console.log(`Upscaled image size: ${(upscaledBuffer.length / 1024).toFixed(2)} KB`);
    }

    // Return enhanced (and possibly upscaled) image
    const response: APIResponse = {
      success: true,
      data: {
        imageData: finalImage.buffer.toString('base64'),
        metadata: {
          ...finalImage.metadata,
          enhancementMethod: method,
          wasUpscaled: wasUpscaled,
        },
        filename: FileHandler.generateFileName('image', wasUpscaled ? 'enhanced-upscaled' : 'enhanced'),
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Enhancement error:', error);

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
      error: error instanceof Error ? error.message : 'Enhancement failed',
    };
    return NextResponse.json(response, { status: 500 });
  }
}
