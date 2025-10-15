import { NextRequest, NextResponse } from 'next/server';
import { parseJsonBody, isPayloadTooLargeError } from '@/lib/requestHelper';
import { APIResponse } from '@/types';

// Configure route to handle large payloads and prevent timeout
export const runtime = 'nodejs';
export const maxDuration = 60; // 60 seconds timeout
export const dynamic = 'force-dynamic';
// Note: Body size limit configured in next.config.js (100MB)

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
    const body = await parseJsonBody(req);
    const { imageData, maxFileSizePercent, maxFileSizeKB, quality: userQuality, originalSize } = body;

    if (!imageData) {
      throw new Error('No image data provided');
    }

    // Convert base64 to buffer
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

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

    // Calculate compression ratio
    const compressionRatio = Math.round(
      ((originalSize - compressedBuffer.length) / originalSize) * 100
    );

    // Convert buffer to base64
    const base64Image = compressedBuffer.toString('base64');
    const mimeType = `image/${format === 'jpg' ? 'jpeg' : format}`;
    const compressedImageData = `data:${mimeType};base64,${base64Image}`;

    const response: APIResponse = {
      success: true,
      data: {
        imageData: compressedImageData,
        size: compressedBuffer.length,
        compressionRatio: compressionRatio,
        quality: currentQuality,
        format: format,
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
