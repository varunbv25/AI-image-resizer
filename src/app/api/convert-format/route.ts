import { NextRequest, NextResponse } from 'next/server';
import { ImageProcessor } from '@/lib/imageProcessor';
import { FileHandler } from '@/lib/fileHandler';
import { parseJsonBody, isPayloadTooLargeError } from '@/lib/requestHelper';
import { APIResponse } from '@/types';

// Configure route to handle large payloads
export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

interface ConvertFormatRequestBody {
  imageData: string;
  targetFormat: 'jpeg' | 'png' | 'webp' | 'svg';
  quality?: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = await parseJsonBody<ConvertFormatRequestBody>(req);
    const { imageData, targetFormat, quality = 90 } = body;

    if (!imageData) {
      throw new Error('Missing required parameter: imageData');
    }

    if (!targetFormat) {
      throw new Error('Missing required parameter: targetFormat');
    }

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(imageData, 'base64');

    const processor = new ImageProcessor();
    const convertedImage = await processor.convertFormat(imageBuffer, targetFormat, quality);

    const response: APIResponse = {
      success: true,
      data: {
        imageData: convertedImage.buffer.toString('base64'),
        metadata: convertedImage.metadata,
        filename: FileHandler.generateFileName('image', `converted-${targetFormat}`),
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Format conversion error:', error);

    if (isPayloadTooLargeError(error)) {
      const response: APIResponse = {
        success: false,
        error: 'Image file is too large. Please use an image smaller than 10MB.',
      };
      return NextResponse.json(response, { status: 413 });
    }

    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Format conversion failed',
    };
    return NextResponse.json(response, { status: 500 });
  }
}
