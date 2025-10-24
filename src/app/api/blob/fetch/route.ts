import { NextRequest, NextResponse } from 'next/server';
import { APIResponse } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * Fetch blob content from Vercel Blob URL
 * This allows server-side processing of uploaded images
 */
export async function POST(req: NextRequest) {
  try {
    const { blobUrl } = await req.json();

    if (!blobUrl) {
      throw new Error('Blob URL is required');
    }

    // Validate that it's a Vercel Blob URL
    if (!blobUrl.includes('blob.vercel-storage.com') && !blobUrl.includes('public.blob.vercel-storage.com')) {
      throw new Error('Invalid blob URL');
    }

    // Fetch the blob content
    const response = await fetch(blobUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch blob: ${response.statusText}`);
    }

    // Get the blob as buffer
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Get content type
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    // Convert to base64
    const base64Data = buffer.toString('base64');

    const apiResponse: APIResponse = {
      success: true,
      data: {
        imageData: base64Data,
        mimetype: contentType,
        size: buffer.length,
      },
    };

    return NextResponse.json(apiResponse);
  } catch (error) {
    console.error('Blob fetch error:', error);

    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch blob',
    };
    return NextResponse.json(response, { status: 400 });
  }
}