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

    // For manual cropping (canvas-based)
    cropArea?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };

    // For compression
    maxFileSizePercent?: number;
    maxFileSizeKB?: number;
    originalSize?: number;

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
    let processedBuffer: Buffer | undefined;
    let metadata: { width: number; height: number; format: string; size: number };

    switch (operation) {
      case 'crop':
      case 'resize': {
        // Import sharp and process
        const sharp = (await import('sharp')).default;
        const { targetDimensions, cropArea, quality = 80, format = 'jpeg' } = params;

        let sharpInstance = sharp(imageBuffer, { limitInputPixels: 1000000000 });

        // If cropArea is provided (manual cropping), extract that region first
        if (cropArea) {
          console.log(`[Process] Extracting crop area: x=${cropArea.x}, y=${cropArea.y}, w=${cropArea.width}, h=${cropArea.height}`);
          sharpInstance = sharpInstance.extract({
            left: Math.round(cropArea.x),
            top: Math.round(cropArea.y),
            width: Math.round(cropArea.width),
            height: Math.round(cropArea.height),
          });
        } else if (targetDimensions) {
          // Otherwise, resize to target dimensions
          sharpInstance = sharpInstance.resize(targetDimensions.width, targetDimensions.height, {
            fit: 'cover',
            position: 'center',
          });
        } else {
          throw new Error('Missing targetDimensions or cropArea for crop/resize operation');
        }

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
          width: processedMetadata.width || cropArea?.width || targetDimensions?.width || 0,
          height: processedMetadata.height || cropArea?.height || targetDimensions?.height || 0,
          format: format,
          size: processedBuffer.length,
        };
        break;
      }

      case 'compress': {
        const sharp = (await import('sharp')).default;

        const { quality, format = 'jpeg', maxFileSizeKB, maxFileSizePercent, originalSize } = params;

        // Convert SVG to raster if needed
        const header = imageBuffer.slice(0, 100).toString('utf-8');
        const isSVG = header.includes('<svg') || header.includes('<?xml');

        let workingBuffer: Buffer = imageBuffer;
        if (isSVG) {
          console.log('[Process] Converting SVG to raster format for compression...');
          const svgConverted = await sharp(imageBuffer, {
            density: 300,
            limitInputPixels: 1000000000
          }).png().toBuffer();
          workingBuffer = Buffer.from(svgConverted);
        }

        // Iterative compression to target size
        let currentQuality = quality || 80;
        let attempts = 0;
        const maxAttempts = 10;

        if (maxFileSizeKB) {
          // Target specific file size in KB (actual KB, not percentage)
          const targetSizeKB = maxFileSizeKB;
          const targetWithTolerance = targetSizeKB * 1.05; // Allow up to 5% over target

          console.log(`[Process] Target: ${targetSizeKB} KB; Original: ${originalSize ? (originalSize / 1024).toFixed(2) : 'unknown'} KB`);

          // Start with high quality
          currentQuality = 90;

          // Initial compression
          let testInstance = sharp(workingBuffer, { limitInputPixels: 1000000000 });
          switch (format) {
            case 'jpeg':
              testInstance = testInstance.jpeg({ quality: currentQuality, mozjpeg: true, progressive: true, chromaSubsampling: '4:2:0' });
              break;
            case 'png':
              testInstance = testInstance.png({ compressionLevel: 9, palette: true });
              break;
            case 'webp':
              testInstance = testInstance.webp({ quality: currentQuality, effort: 6 });
              break;
          }

          processedBuffer = await testInstance.toBuffer();
          let currentSizeKB = processedBuffer.length / 1024;

          console.log(`[Process] Initial: Quality ${currentQuality}, Size ${currentSizeKB.toFixed(2)} KB (${((currentSizeKB / targetSizeKB) * 100).toFixed(1)}% of target)`);

          // Iteratively reduce quality if needed
          while (currentSizeKB > targetWithTolerance && currentQuality > 10 && attempts < maxAttempts) {
            currentQuality -= 5;
            currentQuality = Math.max(10, currentQuality);

            testInstance = sharp(workingBuffer, { limitInputPixels: 1000000000 });
            switch (format) {
              case 'jpeg':
                testInstance = testInstance.jpeg({ quality: currentQuality, mozjpeg: true, progressive: true, chromaSubsampling: '4:2:0' });
                break;
              case 'png':
                testInstance = testInstance.png({ compressionLevel: 9, palette: true });
                break;
              case 'webp':
                testInstance = testInstance.webp({ quality: currentQuality, effort: 6 });
                break;
            }

            processedBuffer = await testInstance.toBuffer();
            currentSizeKB = processedBuffer.length / 1024;
            attempts++;

            console.log(`[Process] Attempt ${attempts}: Quality ${currentQuality}, Size ${currentSizeKB.toFixed(2)} KB (${((currentSizeKB / targetSizeKB) * 100).toFixed(1)}% of target)`);
          }

          console.log(`[Process] Final: ${currentSizeKB.toFixed(2)} KB at quality ${currentQuality}`);
        } else if (maxFileSizePercent && originalSize) {
          // Target percentage of original size
          const targetSize = (originalSize * maxFileSizePercent) / 100;
          console.log(`[Process] Compressing to ${maxFileSizePercent}% of original (${targetSize} bytes)`);

          while (attempts < maxAttempts) {
            let testInstance = sharp(workingBuffer, { limitInputPixels: 1000000000 });

            switch (format) {
              case 'jpeg':
                testInstance = testInstance.jpeg({ quality: currentQuality, mozjpeg: true, progressive: true });
                break;
              case 'png':
                testInstance = testInstance.png({ compressionLevel: 9, palette: true });
                break;
              case 'webp':
                testInstance = testInstance.webp({ quality: currentQuality });
                break;
            }

            processedBuffer = await testInstance.toBuffer();

            if (processedBuffer.length <= targetSize || currentQuality <= 10) {
              break;
            }

            currentQuality = Math.max(10, currentQuality - 10);
            attempts++;
          }
        } else {
          // Simple quality-based compression
          let sharpInstance = sharp(workingBuffer, { limitInputPixels: 1000000000 });

          switch (format) {
            case 'jpeg':
              sharpInstance = sharpInstance.jpeg({ quality: currentQuality, mozjpeg: true, progressive: true });
              break;
            case 'png':
              sharpInstance = sharpInstance.png({ compressionLevel: 9, palette: true });
              break;
            case 'webp':
              sharpInstance = sharpInstance.webp({ quality: currentQuality });
              break;
          }

          processedBuffer = await sharpInstance.toBuffer();
        }

        if (!processedBuffer) {
          throw new Error('Compression failed: no buffer generated');
        }

        const compressedMetadata = await sharp(processedBuffer).metadata();

        metadata = {
          width: compressedMetadata.width || 0,
          height: compressedMetadata.height || 0,
          format: format,
          size: processedBuffer.length,
        };

        console.log(`[Process] Compression complete: ${processedBuffer.length} bytes (quality: ${currentQuality}, attempts: ${attempts})`);
        break;
      }

      case 'enhance': {
        const { ImageProcessor } = await import('@/lib/imageProcessor');
        const { method = 'sharp', sharpness = 5, format = 'jpeg' } = params;

        const processor = new ImageProcessor(process.env.GEMINI_API_KEY);
        const enhancedImage = method === 'ai'
          ? await processor.enhanceImageWithAI(imageBuffer, format)
          : await processor.sharpenImage(imageBuffer, format, sharpness);

        const upscaledResult = await processor.autoUpscaleIfNeeded(enhancedImage);
        processedBuffer = upscaledResult.buffer;

        metadata = {
          width: upscaledResult.metadata.width,
          height: upscaledResult.metadata.height,
          format: upscaledResult.metadata.format,
          size: processedBuffer.length,
        };
        break;
      }

      case 'rotate-flip': {
        const { ImageProcessor } = await import('@/lib/imageProcessor');
        const {
          rotateOperation = 'rotate-90',
          customAngle = 0,
          flipHorizontal = false,
          flipVertical = false,
          format = 'jpeg',
          quality = 90,
        } = params;

        const processor = new ImageProcessor();
        const result = await processor.rotateFlipImage(
          imageBuffer,
          rotateOperation,
          customAngle,
          format,
          quality
        );

        // Apply flip transformations if needed
        if (flipHorizontal || flipVertical) {
          const sharp = (await import('sharp')).default;
          let sharpInstance = sharp(result.buffer);

          if (flipHorizontal) sharpInstance = sharpInstance.flop();
          if (flipVertical) sharpInstance = sharpInstance.flip();

          processedBuffer = await sharpInstance.toBuffer();
        } else {
          processedBuffer = result.buffer;
        }

        metadata = {
          width: result.metadata.width,
          height: result.metadata.height,
          format: result.metadata.format,
          size: processedBuffer.length,
        };
        break;
      }

      case 'convert-format': {
        const { ImageProcessor } = await import('@/lib/imageProcessor');
        const { targetFormat = 'jpeg', quality = 90 } = params;

        if (!targetFormat) {
          throw new Error('targetFormat is required for convert-format operation');
        }

        const processor = new ImageProcessor();
        const convertedImage = await processor.convertFormat(imageBuffer, targetFormat, quality);

        processedBuffer = convertedImage.buffer;
        metadata = {
          width: convertedImage.metadata.width,
          height: convertedImage.metadata.height,
          format: convertedImage.metadata.format,
          size: processedBuffer.length,
        };
        break;
      }

      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }

    // Ensure processedBuffer was assigned
    if (!processedBuffer) {
      throw new Error('Processing failed: no buffer generated');
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
