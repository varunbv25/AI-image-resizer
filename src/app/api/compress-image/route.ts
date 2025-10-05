import { NextRequest, NextResponse } from 'next/server';
import { APIResponse } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageData, quality, maxFileSizePercent, originalSize } = body;

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

    let sharpInstance = sharp(buffer);
    let compressedBuffer: Buffer;
    let currentQuality = quality;

    // Target size in bytes
    const targetSize = (originalSize * maxFileSizePercent) / 100;

    // Initial compression attempt
    switch (format) {
      case 'jpeg':
      case 'jpg':
        sharpInstance = sharpInstance.jpeg({ quality: currentQuality, mozjpeg: true });
        break;
      case 'png':
        sharpInstance = sharpInstance.png({
          quality: currentQuality,
          compressionLevel: 9,
          effort: 10
        });
        break;
      case 'webp':
        sharpInstance = sharpInstance.webp({ quality: currentQuality });
        break;
      default:
        sharpInstance = sharpInstance.jpeg({ quality: currentQuality, mozjpeg: true });
    }

    compressedBuffer = await sharpInstance.toBuffer();

    // If compressed size is still larger than target, reduce quality iteratively
    let attempts = 0;
    const maxAttempts = 10;

    while (compressedBuffer.length > targetSize && currentQuality > 10 && attempts < maxAttempts) {
      currentQuality = Math.max(10, currentQuality - 10);

      let retryInstance = sharp(buffer);

      switch (format) {
        case 'jpeg':
        case 'jpg':
          retryInstance = retryInstance.jpeg({ quality: currentQuality, mozjpeg: true });
          break;
        case 'png':
          retryInstance = retryInstance.png({
            quality: currentQuality,
            compressionLevel: 9,
            effort: 10
          });
          break;
        case 'webp':
          retryInstance = retryInstance.webp({ quality: currentQuality });
          break;
        default:
          retryInstance = retryInstance.jpeg({ quality: currentQuality, mozjpeg: true });
      }

      compressedBuffer = await retryInstance.toBuffer();
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
