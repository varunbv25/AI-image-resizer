import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { APIResponse } from '@/types';

export const runtime = 'edge';

/**
 * Delete a blob from Vercel Blob storage
 * Called after processing is complete to clean up temporary files
 */
export async function POST(req: NextRequest) {
  try {
    const { blobUrl } = await req.json();

    if (!blobUrl) {
      throw new Error('Blob URL is required');
    }

    // Delete the blob
    await del(blobUrl);

    const response: APIResponse = {
      success: true,
      data: {
        message: 'Blob deleted successfully',
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Blob deletion error:', error);

    const response: APIResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete blob',
    };
    return NextResponse.json(response, { status: 400 });
  }
}