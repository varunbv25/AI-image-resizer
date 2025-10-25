// app/api/upload-token/route.ts
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 10;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. Get the upload body (small metadata, no file)
    const body = (await request.json()) as HandleUploadBody;

    // 2. Authorize the client for a direct upload to Vercel Blob
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname /*, clientPayload */) => {
        // Optional: Perform any validation on the file name/type here
        // The pathname is just the file name, not the file content
        console.log(`Preparing to authorize upload for: ${pathname}`);
        return {
          allowedContentTypes: [
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/svg+xml',
          ],
          maximumSizeInBytes: 10 * 1024 * 1024, // 10MB max
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({
            uploadedAt: Date.now(),
            fileName: pathname,
          }),
        };
      },
      onUploadCompleted: async () => {
        // This is an OPTIONAL server-side callback after the upload finishes.
        // For processing, we will rely on a separate client-triggered request.
        // Keep this empty for fast uploads
      },
    });

    // 3. Return the token and required data to the client
    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error('Upload token generation error:', error);
    // 4. Handle errors (e.g., if the user doesn't have Vercel Blob configured)
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
