import { NextRequest, NextResponse } from 'next/server';
import { ImageProcessor } from '@/lib/imageProcessor';
import { APIResponse } from '@/types';
import { SUPPORTED_FORMATS } from '@/lib/constants';

export async function POST(req: NextRequest) {
  try {
    console.log('Upload API called');

    const formData = await req.formData();
    const file = formData.get('image') as File;

    if (!file) {
      throw new Error('No image file provided');
    }

    console.log('File received:', file.name, file.type, file.size);

    // Validate file type
    if (!SUPPORTED_FORMATS.includes(file.type)) {
      throw new Error(`Unsupported file format: ${file.type}`);
    }

    // No file size limit - support large files

    // Convert file to buffer
    console.log('Converting file to buffer...');
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    console.log('Buffer created, size:', buffer.length);

    // Get image dimensions with error handling
    console.log('Creating ImageProcessor...');
    const processor = new ImageProcessor(process.env.GEMINI_API_KEY);

    console.log('Getting image dimensions...');
    const originalDimensions = await processor.getImageDimensions(buffer);
    console.log('Dimensions obtained:', originalDimensions);

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

    console.log('Upload successful, returning response');
    return NextResponse.json(response);
  } catch (error) {
    console.error('Upload error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');

    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    };
    return NextResponse.json(response, { status: 400 });
  }
}