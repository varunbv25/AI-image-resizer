import { NextRequest, NextResponse } from 'next/server';
import { parseJsonBody, isPayloadTooLargeError } from '@/lib/requestHelper';
import { APIResponse, ImageDimensions } from '@/types';

// Configure route to handle large payloads and prevent timeout
export const runtime = 'nodejs';
export const maxDuration = 60; // 60 seconds timeout
export const dynamic = 'force-dynamic';
// Note: Body size limit configured in next.config.js (100MB)

async function getSharp() {
  try {
    const sharpModule = await import('sharp');
    const sharp = sharpModule.default || sharpModule;

    if (typeof sharp !== 'function') {
      throw new Error('Sharp is not a function');
    }

    // Increase pixel limit to handle large images (1 gigapixel)
    sharp.cache(false);
    sharp.concurrency(1);

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

  // Check if SVG and convert to raster first
  const header = imageBuffer.slice(0, 100).toString('utf-8');
  const isSVG = header.includes('<svg') || header.includes('<?xml');

  let workingBuffer: Buffer = imageBuffer;
  if (isSVG) {
    console.log('Converting SVG to raster format for upscaling...');
    const svgConverted = await sharp(imageBuffer, {
      density: 300,
      limitInputPixels: 1000000000
    })
    .png()
    .toBuffer();
    workingBuffer = Buffer.from(svgConverted);
  }

  // Get original dimensions with increased pixel limit
  const originalMetadata = await sharp(workingBuffer, {
    limitInputPixels: 1000000000 // 1 gigapixel limit
  }).metadata();
  const originalWidth = originalMetadata.width || 0;
  const originalHeight = originalMetadata.height || 0;

  if (originalWidth === 0 || originalHeight === 0) {
    throw new Error('Could not determine original image dimensions');
  }

  // Validate that we're actually upscaling
  if (targetDimensions.width < originalWidth || targetDimensions.height < originalHeight) {
    throw new Error('Target dimensions must be larger than or equal to original dimensions for upscaling');
  }

  // Use Lanczos3 for high-quality upscaling
  const processedBuffer = await sharp(workingBuffer, {
    limitInputPixels: 1000000000 // 1 gigapixel limit
  })
    .resize(targetDimensions.width, targetDimensions.height, {
      kernel: 'lanczos3',
      fit: 'fill'
    })
    .jpeg({ quality, progressive: true })
    .toBuffer();

  // Apply output format
  const sharpInstance = sharp(processedBuffer, {
    limitInputPixels: 1000000000
  });
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
  const finalMetadata = await sharp(finalBuffer, {
    limitInputPixels: 1000000000
  }).metadata();

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
    // Use custom JSON parser to support large payloads (up to 100MB)
    const body = await parseJsonBody(req);
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
      error: error instanceof Error ? error.message : 'Upscaling failed',
    };
    return NextResponse.json(response, { status: 500 });
  }
}