import { NextRequest, NextResponse } from 'next/server';
import { APIResponse, ImageDimensions } from '@/types';

async function getSharp() {
  try {
    const sharpModule = await import('sharp');
    const sharp = sharpModule.default || sharpModule;

    if (typeof sharp !== 'function') {
      throw new Error('Sharp is not a function');
    }

    return sharp;
  } catch (error) {
    console.error('Failed to load Sharp:', error);
    throw new Error('Sharp module could not be loaded. Image processing is not available.');
  }
}

async function upscaleImage(
  imageBuffer: Buffer,
  targetDimensions: ImageDimensions,
  quality: number = 80,
  format: 'jpeg' | 'png' | 'webp' = 'jpeg'
): Promise<{
  buffer: Buffer;
  metadata: {
    width: number;
    height: number;
    format: string;
    size: number;
  };
}> {
  const sharp = await getSharp();

  // Get original dimensions
  const originalMetadata = await sharp(imageBuffer).metadata();
  const originalWidth = originalMetadata.width || 0;
  const originalHeight = originalMetadata.height || 0;

  if (originalWidth === 0 || originalHeight === 0) {
    throw new Error('Could not determine original image dimensions');
  }

  // Use high-quality resizing algorithms
  let processedBuffer: Buffer;

  if (targetDimensions.width > originalWidth || targetDimensions.height > originalHeight) {
    // Upscaling - use Lanczos3 for best quality
    processedBuffer = await sharp(imageBuffer)
      .resize(targetDimensions.width, targetDimensions.height, {
        kernel: 'lanczos3',
        fit: 'fill'
      })
      .jpeg({ quality, progressive: true })
      .toBuffer();
  } else {
    // Downscaling or same size - use Mitchell for good quality
    processedBuffer = await sharp(imageBuffer)
      .resize(targetDimensions.width, targetDimensions.height, {
        kernel: 'mitchell',
        fit: 'fill'
      })
      .jpeg({ quality, progressive: true })
      .toBuffer();
  }

  // Apply output format
  const sharpInstance = sharp(processedBuffer);
  let finalBuffer: Buffer;

  switch (format) {
    case 'png':
      finalBuffer = await sharpInstance.png({ quality }).toBuffer();
      break;
    case 'webp':
      finalBuffer = await sharpInstance.webp({ quality }).toBuffer();
      break;
    default:
      finalBuffer = await sharpInstance.jpeg({ quality, progressive: true }).toBuffer();
  }

  // Get final metadata
  const finalMetadata = await sharp(finalBuffer).metadata();

  return {
    buffer: finalBuffer,
    metadata: {
      width: finalMetadata.width || targetDimensions.width,
      height: finalMetadata.height || targetDimensions.height,
      format: finalMetadata.format || format,
      size: finalBuffer.length,
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      imageData,
      targetDimensions,
      quality = 80,
      format = 'jpeg',
    }: {
      imageData: string;
      targetDimensions: ImageDimensions;
      quality?: number;
      format?: 'jpeg' | 'png' | 'webp';
    } = body;

    if (!imageData || !targetDimensions) {
      throw new Error('Missing required parameters: imageData and targetDimensions');
    }

    if (!targetDimensions.width || !targetDimensions.height ||
        targetDimensions.width <= 0 || targetDimensions.height <= 0) {
      throw new Error('Invalid target dimensions');
    }

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(imageData, 'base64');

    // Process the image using Sharp.js only
    const result = await upscaleImage(imageBuffer, targetDimensions, quality, format);

    const response: APIResponse = {
      success: true,
      data: {
        imageData: result.buffer.toString('base64'),
        metadata: result.metadata,
        filename: `upscaled-${targetDimensions.width}x${targetDimensions.height}.${format}`,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Upscale error:', error);

    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Upscaling failed',
    };
    return NextResponse.json(response, { status: 500 });
  }
}