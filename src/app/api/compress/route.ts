import { NextRequest, NextResponse } from 'next/server';
import { createCloudConvertService } from '@/lib/cloudConvert';
import { APIResponse } from '@/types';

// Configure route to handle large payloads
export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

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

    try {
      const cloudConvert = createCloudConvertService(process.env.CLOUDCONVERT_API_KEY);

      const optimalSettings = await cloudConvert.getOptimalWebSettings(file.size, file.type);
      const compressionOptions = {
        quality: quality ? parseInt(quality) : optimalSettings.quality,
        format: (format as 'jpg' | 'png' | 'webp') || 'jpg',
        optimize: true,
      };

      console.log('Compressing with options:', compressionOptions);

      const compressedBuffer = await cloudConvert.compressImage(
        buffer,
        file.name,
        compressionOptions
      );

      const response: APIResponse = {
        success: true,
        data: {
          filename: file.name.replace(/\.[^/.]+$/, '') + `.${compressionOptions.format}`,
          originalSize: file.size,
          compressedSize: compressedBuffer.length,
          compressionRatio: ((file.size - compressedBuffer.length) / file.size * 100).toFixed(1),
          imageData: compressedBuffer.toString('base64'),
          mimetype: `image/${compressionOptions.format}`,
        },
      };

      console.log('Compression successful, original:', file.size, 'compressed:', compressedBuffer.length);
      return NextResponse.json(response);

    } catch (cloudConvertError) {
      console.warn('CloudConvert failed, using fallback compression:', cloudConvertError);

      const sharp = (await import('sharp')).default;

      let sharpInstance = sharp(buffer, { limitInputPixels: 1000000000 });

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

      const response: APIResponse = {
        success: true,
        data: {
          filename: file.name.replace(/\.[^/.]+$/, '') + `.${format || 'jpg'}`,
          originalSize: file.size,
          compressedSize: compressedBuffer.length,
          compressionRatio: ((file.size - compressedBuffer.length) / file.size * 100).toFixed(1),
          imageData: compressedBuffer.toString('base64'),
          mimetype: `image/${format || 'jpeg'}`,
          fallbackUsed: true,
        },
      };

      console.log('Fallback compression successful, original:', file.size, 'compressed:', compressedBuffer.length);
      return NextResponse.json(response);
    }

  } catch (error) {
    console.error('Compress error:', error);

    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Compression failed',
    };
    return NextResponse.json(response, { status: 400 });
  }
}