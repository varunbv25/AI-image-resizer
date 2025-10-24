import { NextRequest, NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';

export const runtime = 'edge';

/**
 * Generate a secure upload URL for direct client-side uploads to Vercel Blob
 * This bypasses the 4.5MB serverless function limit
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Check if body exists
    if (!request.body) {
      return NextResponse.json(
        { error: 'Request body is required' },
        { status: 400 }
      );
    }

    // Generate a client upload token
    // Note: handleUpload reads the request body internally
    const jsonResponse = await handleUpload({
      body: request.body as unknown as HandleUploadBody,
      request,
      onBeforeGenerateToken: async (pathname: string) => {
        // Validate file type from pathname
        const validExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.svg'];
        const hasValidExtension = validExtensions.some(ext =>
          pathname.toLowerCase().endsWith(ext)
        );

        if (!hasValidExtension) {
          throw new Error('Invalid file type. Only JPG, PNG, WebP, and SVG are supported.');
        }

        return {
          allowedContentTypes: [
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/webp',
            'image/svg+xml'
          ],
          tokenPayload: JSON.stringify({
            uploadedAt: new Date().toISOString(),
          }),
        };
      },
      onUploadCompleted: async ({ blob }) => {
        // Optional: Log successful uploads
        console.log('Blob upload completed:', blob.url);
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error('Upload token generation error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to generate upload token'
      },
      { status: 400 }
    );
  }
}