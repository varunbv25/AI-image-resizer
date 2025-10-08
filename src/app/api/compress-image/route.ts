import { NextRequest, NextResponse } from 'next/server';
import { APIResponse } from '@/types';

async function compressImage(
  buffer: Buffer,
  format: string,
  quality?: number
): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  const image = sharp(buffer);

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
    const body = await req.json();
    const { imageData, maxFileSizePercent, originalSize } = body;

    if (!imageData) {
      throw new Error('No image data provided');
    }

    // Convert base64 to buffer
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const sharp = (await import('sharp')).default;

    // Get image metadata
    const metadata = await sharp(buffer).metadata();
    const format = metadata.format || 'jpeg';

    // Target size in bytes
    const targetSize = (originalSize * maxFileSizePercent) / 100;

    // Initial compression attempt with optimal quality settings
    let currentQuality = 80; // Start with 80 for JPEG/WebP
    let compressedBuffer = await compressImage(buffer, format, currentQuality);

    // If compressed size is still larger than target, reduce quality iteratively
    let attempts = 0;
    const maxAttempts = 10;

    while (compressedBuffer.length > targetSize && currentQuality > 10 && attempts < maxAttempts) {
      currentQuality = Math.max(10, currentQuality - 10);
      compressedBuffer = await compressImage(buffer, format, currentQuality);
      attempts++;
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

    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Compression failed',
    };
    return NextResponse.json(response, { status: 400 });
  }
}
