import { del } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';
import { APIResponse } from '@/types';
import { ImageProcessor } from '@/lib/imageProcessor';
import { parseJsonBody, isPayloadTooLargeError } from '@/lib/requestHelper';

// Configure route to handle large payloads and prevent timeout
export const runtime = 'nodejs';
export const maxDuration = 60; // 60 seconds timeout
export const dynamic = 'force-dynamic';

interface ProcessImageRequestBody {
  blobUrl?: string; // Vercel Blob URL (new)
  imageData?: string; // Base64 data (legacy)
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  quality: number;
  format: string;
  originalSize: number;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let blobUrl: string | undefined;

  try {
    console.log('Process-image API called (manual cropping with blob support)');

    // Use custom JSON parser to support large payloads
    const body = await parseJsonBody<ProcessImageRequestBody>(req);
    const { blobUrl: providedBlobUrl, imageData, cropX, cropY, cropWidth, cropHeight, quality, format, originalSize } = body;

    blobUrl = providedBlobUrl;

    let buffer: Buffer;

    // Support both blob URL and legacy base64 data
    if (blobUrl) {
      // Fetch image from Vercel Blob
      console.log('Fetching image from blob:', blobUrl);
      const blobResponse = await fetch(blobUrl);
      if (!blobResponse.ok) {
        throw new Error('Failed to fetch image from blob storage');
      }
      const arrayBuffer = await blobResponse.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } else if (imageData) {
      // Legacy: Convert base64 to buffer
      const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
      buffer = Buffer.from(base64Data, 'base64');
    } else {
      throw new Error('No image data or blob URL provided');
    }

    console.log('Processing manual crop with parameters:', { cropX, cropY, cropWidth, cropHeight, quality, format });

    const sharp = (await import('sharp')).default;

    // Check if SVG and convert to raster first
    const header = buffer.slice(0, 100).toString('utf-8');
    const isSVG = header.includes('<svg') || header.includes('<?xml');

    let workingBuffer: Buffer = buffer;
    if (isSVG) {
      console.log('Converting SVG to raster format for cropping...');
      const svgConverted = await sharp(buffer, {
        density: 300,
        limitInputPixels: 1000000000
      })
      .png()
      .toBuffer();
      workingBuffer = Buffer.from(svgConverted);
    }

    // Perform the crop operation
    let sharpInstance = sharp(workingBuffer, { limitInputPixels: 1000000000 });

    // Extract the crop area
    sharpInstance = sharpInstance.extract({
      left: Math.round(cropX),
      top: Math.round(cropY),
      width: Math.round(cropWidth),
      height: Math.round(cropHeight),
    });

    // Apply the format and quality
    const qualityValue = quality ? parseInt(quality.toString()) : 80;

    switch (format || 'jpeg') {
      case 'jpg':
      case 'jpeg':
        sharpInstance = sharpInstance.jpeg({ quality: qualityValue, mozjpeg: true });
        break;
      case 'png':
        sharpInstance = sharpInstance.png({ quality: qualityValue, compressionLevel: 9 });
        break;
      case 'webp':
        sharpInstance = sharpInstance.webp({ quality: qualityValue });
        break;
      default:
        sharpInstance = sharpInstance.jpeg({ quality: qualityValue, mozjpeg: true });
    }

    const croppedBuffer = await sharpInstance.toBuffer();

    // Auto-upscale if < 100KB
    const processor = new ImageProcessor();
    const metadata = await sharp(croppedBuffer, { limitInputPixels: 1000000000 }).metadata();

    const upscaledResult = await processor.autoUpscaleIfNeeded({
      buffer: croppedBuffer,
      metadata: {
        width: metadata.width || 0,
        height: metadata.height || 0,
        format: (metadata.format as string) || format || 'jpeg',
        size: croppedBuffer.length,
      },
    });

    const finalBuffer = upscaledResult.buffer;
    const wasUpscaled = upscaledResult.wasUpscaled || false;

    // Clean up blob if it was used
    if (blobUrl) {
      try {
        await del(blobUrl);
        console.log('Successfully deleted temporary blob:', blobUrl);
      } catch (cleanupError) {
        console.warn('Failed to clean up blob after processing:', cleanupError);
        // Don't fail the request if cleanup fails
      }
    }

    // Convert buffer to base64
    const base64Image = finalBuffer.toString('base64');
    const mimeType = `image/${format === 'jpg' ? 'jpeg' : format}`;
    const imageDataResult = `data:${mimeType};base64,${base64Image}`;

    const response: APIResponse = {
      success: true,
      data: {
        imageData: imageDataResult,
        filename: `cropped.${format || 'jpg'}`,
        originalSize: originalSize,
        processedSize: finalBuffer.length,
        compressionRatio: ((originalSize - finalBuffer.length) / originalSize * 100).toFixed(1),
        wasUpscaled,
      },
    };

    console.log('Manual cropping successful, original:', originalSize, 'processed:', finalBuffer.length);
    return NextResponse.json(response);

  } catch (error) {
    console.error('Process-image error:', error);

    // Attempt to clean up blob on error
    if (blobUrl) {
      try {
        await del(blobUrl);
        console.log('Cleaned up blob after error');
      } catch (cleanupError) {
        console.warn('Failed to cleanup blob after processing error:', cleanupError);
      }
    }

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
      error: error instanceof Error ? error.message : 'Image processing failed',
    };
    return NextResponse.json(response, { status: 400 });
  }
}
