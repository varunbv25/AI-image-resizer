import { NextRequest, NextResponse } from 'next/server';
import { ImageProcessor } from '@/lib/imageProcessor';
import { APIResponse } from '@/types';
import { SUPPORTED_FORMATS, MAX_FILE_SIZE } from '@/lib/constants';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('image') as File;

    if (!file) {
      throw new Error('No image file provided');
    }

    // Validate file type
    if (!SUPPORTED_FORMATS.includes(file.type)) {
      throw new Error(`Unsupported file format: ${file.type}`);
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File size too large: ${Math.round(file.size / 1024 / 1024)}MB (max: ${MAX_FILE_SIZE / 1024 / 1024}MB)`);
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Get image dimensions
    const processor = new ImageProcessor(process.env.GEMINI_API_KEY);
    const originalDimensions = await processor.getImageDimensions(buffer);

    // Return image info for preview
    const response: APIResponse = {
      success: true,
      data: {
        filename: file.name,
        originalDimensions,
        size: file.size,
        mimetype: file.type,
        // Store image as base64 for preview (in production, use cloud storage)
        imageData: buffer.toString('base64'),
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Upload error:', error);
    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    };
    return NextResponse.json(response, { status: 400 });
  }
}