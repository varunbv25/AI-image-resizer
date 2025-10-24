/**
 * Helper utilities for working with Vercel Blob storage
 */

/**
 * Fetch image buffer from either blob URL or base64 data
 * @param blobUrl - Vercel Blob URL (if provided)
 * @param imageData - Base64 image data (legacy fallback)
 * @returns Buffer containing the image data
 */
export async function getImageBuffer(
  blobUrl?: string,
  imageData?: string
): Promise<Buffer> {
  if (blobUrl) {
    // Fetch from Vercel Blob
    console.log('Fetching image from blob:', blobUrl);
    const blobResponse = await fetch(blobUrl);
    if (!blobResponse.ok) {
      throw new Error(`Failed to fetch image from blob storage: ${blobResponse.statusText}`);
    }
    const arrayBuffer = await blobResponse.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } else if (imageData) {
    // Legacy: Convert base64 to buffer
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
    return Buffer.from(base64Data, 'base64');
  } else {
    throw new Error('No image data or blob URL provided');
  }
}

/**
 * Clean up blob storage by deleting the uploaded file
 * @param blobUrl - Vercel Blob URL to delete
 */
export async function cleanupBlob(blobUrl: string): Promise<void> {
  try {
    await fetch('/api/blob/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blobUrl }),
    });
    console.log('Blob cleaned up:', blobUrl);
  } catch (error) {
    console.error('Failed to cleanup blob:', error);
    // Don't throw - cleanup is non-critical
  }
}

/**
 * Validate that a URL is a valid Vercel Blob URL
 */
export function isValidBlobUrl(url: string): boolean {
  return url.includes('blob.vercel-storage.com') ||
         url.includes('public.blob.vercel-storage.com');
}