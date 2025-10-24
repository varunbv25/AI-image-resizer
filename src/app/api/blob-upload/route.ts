import { handleUpload, type HandleUploadBody, del } from '@vercel/blob/client';
import { NextRequest, NextResponse } from 'next/server';
import { ImageProcessor } from '@/lib/imageProcessor';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// In-memory store for upload results (use Redis or database in production)
const uploadResults = new Map<string, {
  filename: string;
  originalDimensions: { width: number; height: number };
  size: number;
  mimetype: string;
  imageData: string;
  timestamp: number;
}>();

// Clean up old results every 5 minutes
setInterval(() => {
  const now = Date.now();
  const maxAge = 5 * 60 * 1000; // 5 minutes

  for (const [key, value] of uploadResults.entries()) {
    if (now - value.timestamp > maxAge) {
      uploadResults.delete(key);
    }
  }
}, 5 * 60 * 1000);

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname /*, clientPayload */) => {
        // Authentication/Authorization
        // In production, verify user session here
        // For now, we'll allow uploads with proper file type restrictions

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
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log('Upload completed to blob:', blob.url);

        try {
          // Parse token payload
          const { uploadedAt, originalPath } = JSON.parse(tokenPayload);
          console.log(`Processing file from ${uploadedAt}, path: ${originalPath}`);

          // Fetch the file from blob storage
          const response = await fetch(blob.url);
          if (!response.ok) {
            throw new Error(`Failed to fetch blob: ${response.statusText}`);
          }

          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          console.log(`File fetched from blob, size: ${buffer.length} bytes`);

          // Process the image to get dimensions
          const processor = new ImageProcessor(process.env.GEMINI_API_KEY);
          const originalDimensions = await processor.getImageDimensions(buffer);

          console.log('Image dimensions:', originalDimensions);

          // Convert to base64 for storage in response
          const imageData = buffer.toString('base64');

          // Store the upload result in memory with the blob URL as key
          uploadResults.set(blob.url, {
            filename: blob.pathname,
            originalDimensions,
            size: blob.size,
            mimetype: blob.contentType || 'image/jpeg',
            imageData,
            timestamp: Date.now(),
          });

          console.log(`Upload result stored for: ${blob.url}`);

          // Immediately delete the blob
          await del(blob.url);
          console.log(`File successfully deleted from blob: ${blob.url}`);

        } catch (error) {
          console.error('Error processing blob upload:', error);

          // Try to delete the blob even if processing failed
          try {
            await del(blob.url);
            console.log('Blob deleted after processing error');
          } catch (delError) {
            console.error('Failed to delete blob after error:', delError);
          }

          // Re-throw to trigger Vercel's retry mechanism
          throw new Error(`Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error('Blob upload error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}

// GET endpoint to retrieve upload results
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const blobUrl = searchParams.get('url');

    if (!blobUrl) {
      return NextResponse.json(
        { success: false, error: 'Missing blob URL' },
        { status: 400 }
      );
    }

    // Poll for the result (it may not be ready immediately)
    const maxAttempts = 30; // 30 attempts
    const delayMs = 1000; // 1 second between attempts

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const result = uploadResults.get(blobUrl);

      if (result) {
        // Remove from store after retrieval
        uploadResults.delete(blobUrl);

        return NextResponse.json({
          success: true,
          data: {
            filename: result.filename,
            originalDimensions: result.originalDimensions,
            size: result.size,
            mimetype: result.mimetype,
            imageData: result.imageData,
          },
        });
      }

      // Wait before next attempt
      if (attempt < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    // Result not found after all attempts
    return NextResponse.json(
      { success: false, error: 'Upload result not found or processing timed out' },
      { status: 404 }
    );

  } catch (error) {
    console.error('Error retrieving upload result:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
