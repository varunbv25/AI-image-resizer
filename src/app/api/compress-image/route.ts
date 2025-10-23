import { NextRequest, NextResponse } from 'next/server';
import { parseJsonBody, isPayloadTooLargeError } from '@/lib/requestHelper';
import { APIResponse } from '@/types';
import { ImageProcessor } from '@/lib/imageProcessor';

// Configure route to handle large payloads and prevent timeout
export const runtime = 'nodejs';
export const maxDuration = 60; // 60 seconds timeout
export const dynamic = 'force-dynamic';
// Note: Body size limit configured in next.config.js (100MB)

interface CompressImageRequestBody {
  imageData?: string; // Base64 data (legacy)
  blobUrl?: string; // Vercel Blob URL (new)
  maxFileSizePercent?: number;
  maxFileSizeKB?: number;
  quality?: number;
  originalSize: number;
}

async function compressImage(
  buffer: Buffer,
  format: string,
  quality?: number
): Promise<Buffer> {
  const sharp = (await import('sharp')).default;

  // Check if SVG and convert to raster first
  const header = buffer.slice(0, 100).toString('utf-8');
  const isSVG = header.includes('<svg') || header.includes('<?xml');

  let workingBuffer: Buffer = buffer;
  if (isSVG) {
    console.log('Converting SVG to raster format for compression...');
    const svgConverted = await sharp(buffer, {
      density: 300,
      limitInputPixels: 1000000000
    })
    .png()
    .toBuffer();
    workingBuffer = Buffer.from(svgConverted);
  }

  // Increase pixel limit to handle large images
  const image = sharp(workingBuffer, {
    limitInputPixels: 1000000000 // 1 gigapixel limit
  });

  switch (format) {
    case 'jpeg':
    case 'jpg':
      return image.jpeg({
        quality: quality || 80,
        mozjpeg: true,
        progressive: true
      }).toBuffer();

    case 'png':
      return image.png({
        compressionLevel: 9,
        palette: true
      }).toBuffer();

    case 'webp':
      return image.webp({
        quality: quality || 80
      }).toBuffer();

    default:
      return image.jpeg({
        quality: quality || 80,
        mozjpeg: true,
        progressive: true
      }).toBuffer();
  }
}

export async function POST(req: NextRequest) {
  try {
    // Use custom JSON parser to support large payloads (up to 100MB)
    const body = await parseJsonBody<CompressImageRequestBody>(req);
    const { imageData, blobUrl, maxFileSizePercent, maxFileSizeKB, quality: userQuality, originalSize } = body;

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

    const sharp = (await import('sharp')).default;

    // Get image metadata with increased pixel limit
    const metadata = await sharp(buffer, {
      limitInputPixels: 1000000000
    }).metadata();
    const format = metadata.format || 'jpeg';

    let compressedBuffer: Buffer;
    let currentQuality: number;

    // Mode 1: User specified quality
    if (userQuality !== undefined && userQuality !== null) {
      currentQuality = userQuality;
      compressedBuffer = await compressImage(buffer, format, currentQuality);
    }
    // Mode 2: Target file size in KB
    else if (maxFileSizeKB !== undefined && maxFileSizeKB !== null) {
      const targetSize = maxFileSizeKB * 1024; // Convert KB to bytes

      // Initial compression attempt
      currentQuality = 80;
      compressedBuffer = await compressImage(buffer, format, currentQuality);

      // Iteratively reduce quality to reach target size
      let attempts = 0;
      const maxAttempts = 10;

      while (compressedBuffer.length > targetSize && currentQuality > 10 && attempts < maxAttempts) {
        currentQuality = Math.max(10, currentQuality - 10);
        compressedBuffer = await compressImage(buffer, format, currentQuality);
        attempts++;
      }
    }
    // Mode 3: Target size as percentage (legacy support)
    else if (maxFileSizePercent !== undefined && maxFileSizePercent !== null) {
      const targetSize = (originalSize * maxFileSizePercent) / 100;

      currentQuality = 80;
      compressedBuffer = await compressImage(buffer, format, currentQuality);

      let attempts = 0;
      const maxAttempts = 10;

      while (compressedBuffer.length > targetSize && currentQuality > 10 && attempts < maxAttempts) {
        currentQuality = Math.max(10, currentQuality - 10);
        compressedBuffer = await compressImage(buffer, format, currentQuality);
        attempts++;
      }
    }
    // Fallback
    else {
      currentQuality = 80;
      compressedBuffer = await compressImage(buffer, format, currentQuality);
    }

    // Auto-upscale if < 100KB
    const processor = new ImageProcessor();
    const finalMetadata = await sharp(compressedBuffer, { limitInputPixels: 1000000000 }).metadata();

    const upscaledResult = await processor.autoUpscaleIfNeeded({
      buffer: compressedBuffer,
      metadata: {
        width: finalMetadata.width || 0,
        height: finalMetadata.height || 0,
        format: finalMetadata.format || format,
        size: compressedBuffer.length,
      },
    });

    const finalBuffer = upscaledResult.buffer;
    const wasUpscaled = upscaledResult.wasUpscaled || false;

    // Calculate compression ratio
    const compressionRatio = Math.round(
      ((originalSize - finalBuffer.length) / originalSize) * 100
    );

    // Convert buffer to base64
    const base64Image = finalBuffer.toString('base64');
    const mimeType = `image/${format === 'jpg' ? 'jpeg' : format}`;
    const compressedImageData = `data:${mimeType};base64,${base64Image}`;

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

    const response: APIResponse = {
      success: true,
      data: {
        imageData: compressedImageData,
        size: finalBuffer.length,
        compressionRatio: compressionRatio,
        quality: currentQuality,
        format: format,
        wasUpscaled,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Compression error:', error);

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
      error: error instanceof Error ? error.message : 'Compression failed',
    };
    return NextResponse.json(response, { status: 400 });
  }
}
