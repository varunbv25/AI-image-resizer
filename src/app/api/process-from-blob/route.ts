import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { APIResponse, ImageDimensions } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

interface ProcessFromBlobRequest {
  blobUrl: string;
  operation: 'crop' | 'resize' | 'compress' | 'enhance' | 'rotate-flip' | 'convert-format';
  params?: {
    // For resize/crop
    targetDimensions?: ImageDimensions;
    quality?: number;
    format?: 'jpeg' | 'png' | 'webp';

    // For compression
    maxFileSizePercent?: number;
    maxFileSizeKB?: number;

    // For enhancement
    method?: 'ai' | 'sharp' | 'onnx';
    sharpness?: number;

    // For rotate-flip
    rotateOperation?: 'rotate-90' | 'rotate-180' | 'rotate-270' | 'flip-horizontal' | 'flip-vertical' | 'custom';
    customAngle?: number;
    flipHorizontal?: boolean;
    flipVertical?: boolean;

    // For convert-format
    targetFormat?: 'jpeg' | 'png' | 'webp' | 'svg';
  };
}

/**
 * Step 3: Process image from Vercel Blob URL
 * This endpoint:
 * 1. Downloads the image from Vercel Blob (using the URL from step 2)
 * 2. Processes it with sharp.js
 * 3. Returns the processed image as base64 (or uploads to blob and returns URL)
 * 4. Deletes the original blob to avoid storage costs
 */
export async function POST(req: NextRequest) {
  let blobUrlToDelete: string | null = null;

  try {
    const body = await req.json() as ProcessFromBlobRequest;
    const { blobUrl, operation, params = {} } = body;

    if (!blobUrl) {
      throw new Error('Missing blobUrl parameter');
    }

    blobUrlToDelete = blobUrl;

    // Step 1: Download image from Vercel Blob
    console.log(`[Process] Downloading image from blob: ${blobUrl}`);
    const blobResponse = await fetch(blobUrl);
    if (!blobResponse.ok) {
      throw new Error(`Failed to fetch image from blob storage: ${blobResponse.statusText}`);
    }

    const arrayBuffer = await blobResponse.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);
    console.log(`[Process] Downloaded ${imageBuffer.length} bytes from blob`);

    // Step 2: Process based on operation type
    let processedBuffer: Buffer;
    let metadata: { width: number; height: number; format: string; size: number };

    switch (operation) {
      case 'crop':
      case 'resize': {
        // Import sharp and process
        const sharp = (await import('sharp')).default;
        const { targetDimensions, quality = 80, format = 'jpeg' } = params;

        if (!targetDimensions) {
          throw new Error('Missing targetDimensions for resize/crop operation');
        }

        let sharpInstance = sharp(imageBuffer, { limitInputPixels: 1000000000 })
          .resize(targetDimensions.width, targetDimensions.height, {
            fit: 'cover',
            position: 'center',
          });

        // Apply format
        switch (format) {
          case 'jpeg':
            sharpInstance = sharpInstance.jpeg({ quality, mozjpeg: true });
            break;
          case 'png':
            sharpInstance = sharpInstance.png({ quality, compressionLevel: 9 });
            break;
          case 'webp':
            sharpInstance = sharpInstance.webp({ quality });
            break;
        }

        processedBuffer = await sharpInstance.toBuffer();
        const processedMetadata = await sharp(processedBuffer).metadata();

        metadata = {
          width: processedMetadata.width || targetDimensions.width,
          height: processedMetadata.height || targetDimensions.height,
          format: format,
          size: processedBuffer.length,
        };
        break;
      }

      case 'compress': {
        const sharp = (await import('sharp')).default;
        const { ImageProcessor } = await import('@/lib/imageProcessor');

        const processor = new ImageProcessor();
        const { maxFileSizePercent, maxFileSizeKB, quality = 80, format = 'jpeg' } = params;

        // Similar to compress-image route logic
        const header = imageBuffer.slice(0, 100).toString('utf-8');
        const isSVG = header.includes('<svg') || header.includes('<?xml');

        let workingBuffer: Buffer = imageBuffer;
        if (isSVG) {
          console.log('Converting SVG to raster format for compression...');
          const svgConverted = await sharp(imageBuffer, {
            density: 300,
            limitInputPixels: 1000000000
          }).png().toBuffer();
          workingBuffer = Buffer.from(svgConverted);
        }

        // Basic compression
        let sharpInstance = sharp(workingBuffer, { limitInputPixels: 1000000000 });

        switch (format) {
          case 'jpeg':
            sharpInstance = sharpInstance.jpeg({ quality, mozjpeg: true, progressive: true });
            break;
          case 'png':
            sharpInstance = sharpInstance.png({ compressionLevel: 9, palette: true });
            break;
          case 'webp':
            sharpInstance = sharpInstance.webp({ quality });
            break;
        }

        processedBuffer = await sharpInstance.toBuffer();
        const compressedMetadata = await sharp(processedBuffer).metadata();

        metadata = {
          width: compressedMetadata.width || 0,
          height: compressedMetadata.height || 0,
          format: format,
          size: processedBuffer.length,
        };
        break;
      }

      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }

    // Step 3: Delete the blob immediately after processing
    console.log(`[Process] Deleting blob: ${blobUrl}`);
    await del(blobUrl);
    console.log(`[Process] Blob deleted successfully`);
    blobUrlToDelete = null; // Clear so we don't try to delete again in catch

    // Step 4: Return processed image as base64
    const response: APIResponse = {
      success: true,
      data: {
        imageData: processedBuffer.toString('base64'),
        metadata,
        filename: `processed-image.${metadata.format}`,
      },
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('[Process] Error:', error);

    // Attempt to clean up blob even if processing failed
    if (blobUrlToDelete) {
      try {
        console.log(`[Process] Cleaning up blob after error: ${blobUrlToDelete}`);
        await del(blobUrlToDelete);
        console.log(`[Process] Blob cleaned up successfully`);
      } catch (delError) {
        console.error('[Process] Failed to delete blob after error:', delError);
      }
    }

    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Processing failed',
    };
    return NextResponse.json(response, { status: 500 });
  }
}
