/**
 * Request helper utilities for handling large payloads
 */

/**
 * Parse JSON request body with custom size limit
 * This is necessary because Next.js req.json() has a default ~1MB limit
 *
 * @param request - NextRequest object
 * @param maxSize - Maximum size in bytes (default 100MB)
 * @returns Parsed JSON object
 */
export async function parseJsonBody<T = unknown>(
  request: Request,
  maxSize: number = 100 * 1024 * 1024 // 100MB default
): Promise<T> {
  try {
    // Read the body as text
    const text = await request.text();

    // Check size before parsing
    const sizeInBytes = new TextEncoder().encode(text).length;
    if (sizeInBytes > maxSize) {
      throw new Error(
        `Request body too large: ${(sizeInBytes / 1024 / 1024).toFixed(2)}MB exceeds limit of ${(maxSize / 1024 / 1024).toFixed(2)}MB`
      );
    }

    // Parse JSON
    return JSON.parse(text) as T;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Invalid JSON in request body');
    }
    throw error;
  }
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Check if error is a payload size error
 */
export function isPayloadTooLargeError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes('too large') ||
      error.message.includes('FUNCTION_PAYLOAD_TOO_LARGE') ||
      error.message.includes('Request Entity Too Large')
    );
  }
  return false;
}
