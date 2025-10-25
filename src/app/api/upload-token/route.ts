// app/api/upload-token/route.ts
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

export async function POST(request: Request): Promise<NextResponse> {
  // 1. Get the upload body (small metadata, no file)
  const body = (await request.json()) as HandleUploadBody;

  try {
    // 2. Authorize the client for a direct upload to Vercel Blob
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeUpload: async (pathname) => {
        // Optional: Perform any validation on the file name/type here
        // The pathname is just the file name, not the file content
        console.log(`Preparing to authorize upload for: ${pathname}`);
        return {
          // This tokenPayload is optional but can be used for logging/tracking
          tokenPayload: JSON.stringify({ fileName: pathname }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // This is an OPTIONAL server-side callback after the upload finishes.
        // For processing, we will rely on a separate client-triggered request.
        console.log(`Blob upload finished for URL: ${blob.url}`);
      },
    });

    // 3. Return the token and required data to the client
    return NextResponse.json(jsonResponse);
  } catch (error) {
    // 4. Handle errors (e.g., if the user doesn't have Vercel Blob configured)
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
