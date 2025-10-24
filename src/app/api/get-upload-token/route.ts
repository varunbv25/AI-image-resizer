import { NextRequest, NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';

export const runtime = 'nodejs';
export const maxDuration = 10;
export const dynamic = 'force-dynamic';

/**
 * Step 1: Client requests a secure upload token
 * This endpoint generates a pre-signed upload URL for direct client-to-blob uploads
 * This bypasses the 4.5MB Vercel serverless function payload limit
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as HandleUploadBody;

    // Generate the upload token and URL
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname /*, clientPayload */) => {
        // Optional: Add authentication here
        // For now, we'll allow all uploads with file type restrictions

        return {
          allowedContentTypes: [
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/svg+xml',
          ],
          maximumSizeInBytes: 50 * 1024 * 1024, // 50MB max
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({
            uploadedAt: Date.now(),
            originalPath: pathname,
          }),
        };
      },
      onUploadCompleted: async () => {
        // Do nothing here - we'll process the image in a separate endpoint
        // This keeps the upload fast and separate from processing
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error('Upload token generation error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}
