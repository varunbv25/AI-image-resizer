import { NextRequest, NextResponse } from 'next/server';
import { isPayloadTooLargeError } from '@/lib/requestHelper';
import { APIResponse } from '@/types';
import { ImageProcessor } from '@/lib/imageProcessor';

// Configure route to handle large payloads and prevent timeout
export const runtime = 'nodejs';
export const maxDuration = 60; // 60 seconds timeout
export const dynamic = 'force-dynamic';
// Note: Body size limit configured in next.config.js (100MB)

export async function POST(req: NextRequest) {
  try {
    console.log('Compress API called');

    const formData = await req.formData();
    const file = formData.get('image') as File;
    const quality = formData.get('quality') as string;
    const format = formData.get('format') as string;

    if (!file) {
      throw new Error('No image file provided');
    }

    console.log('File received for compression:', file.name, file.type, file.size);

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

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

    let sharpInstance = sharp(workingBuffer, { limitInputPixels: 1000000000 });

    const qualityValue = quality ? parseInt(quality) : 80;

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

    const compressedBuffer = await sharpInstance.toBuffer();

    // Auto-upscale if < 100KB
    const processor = new ImageProcessor();
    const metadata = await sharp(compressedBuffer, { limitInputPixels: 1000000000 }).metadata();

    const upscaledResult = await processor.autoUpscaleIfNeeded({
      buffer: compressedBuffer,
      metadata: {
        width: metadata.width || 0,
        height: metadata.height || 0,
        format: (metadata.format as string) || format || 'jpeg',
        size: compressedBuffer.length,
      },
    });

    const finalBuffer = upscaledResult.buffer;
    const wasUpscaled = upscaledResult.wasUpscaled || false;

    const response: APIResponse = {
      success: true,
      data: {
        filename: file.name.replace(/\.[^/.]+$/, '') + `.${format || 'jpg'}`,
        originalSize: file.size,
        compressedSize: finalBuffer.length,
        compressionRatio: ((file.size - finalBuffer.length) / file.size * 100).toFixed(1),
        imageData: finalBuffer.toString('base64'),
        mimetype: `image/${format || 'jpeg'}`,
        wasUpscaled,
      },
    };

    console.log('Compression successful, original:', file.size, 'compressed:', compressedBuffer.length);
    return NextResponse.json(response);

  } catch (error) {
    console.error('Compress error:', error);

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