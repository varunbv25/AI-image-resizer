/**
 * Full client-side image compression
 * Processes images entirely in the browser without any server communication
 * Supports files of unlimited size!
 */

export interface ClientCompressionOptions {
  maxFileSizeKB?: number;      // Target file size in KB
  maxFileSizePercent?: number; // Target as percentage of original
  quality?: number;            // Initial quality (0-1)
  format?: 'jpeg' | 'png' | 'webp';
}

export interface ClientCompressionResult {
  blob: Blob;
  dataUrl: string;
  size: number;
  compressionRatio: number;
  quality: number;
  format: string;
}

/**
 * Compress image entirely on client-side
 * NO server communication - works with files of any size!
 */
export async function compressImageClientSide(
  file: File,
  options: ClientCompressionOptions = {}
): Promise<ClientCompressionResult> {
  const {
    maxFileSizeKB,
    maxFileSizePercent,
    quality: initialQuality = 0.8,
    format = 'jpeg',
  } = options;

  // Calculate target size
  let targetSizeBytes: number | undefined;
  if (maxFileSizeKB) {
    targetSizeBytes = maxFileSizeKB * 1024;
  } else if (maxFileSizePercent) {
    targetSizeBytes = (file.size * maxFileSizePercent) / 100;
  }

  // Load image
  const img = await loadImage(file);

  // Start with original dimensions
  let width = img.naturalWidth;
  let height = img.naturalHeight;
  let currentQuality = initialQuality;
  let attempt = 0;
  const maxAttempts = 20;

  while (attempt < maxAttempts) {
    attempt++;

    // Create canvas with current dimensions
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    // High-quality rendering
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);

    // Convert to blob
    const mimeType = format === 'png' ? 'image/png' :
                     format === 'webp' ? 'image/webp' : 'image/jpeg';

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b);
          else reject(new Error('Failed to create blob'));
        },
        mimeType,
        currentQuality
      );
    });

    console.log(`Compression attempt ${attempt}: ${(blob.size / 1024).toFixed(2)}KB at quality ${(currentQuality * 100).toFixed(0)}%, dimensions ${width}x${height}`);

    // Check if we hit the target
    if (!targetSizeBytes || blob.size <= targetSizeBytes) {
      // Success!
      const dataUrl = await blobToDataUrl(blob);
      const compressionRatio = Math.round(((file.size - blob.size) / file.size) * 100);

      return {
        blob,
        dataUrl,
        size: blob.size,
        compressionRatio,
        quality: currentQuality,
        format: mimeType,
      };
    }

    // Need to compress more - try reducing quality first
    if (currentQuality > 0.3) {
      currentQuality -= 0.1;
      continue;
    }

    // Quality is already low, reduce dimensions
    const ratio = Math.sqrt(targetSizeBytes / blob.size);
    width = Math.floor(width * ratio * 0.9); // 0.9 for safety margin
    height = Math.floor(height * ratio * 0.9);

    // Minimum dimensions
    if (width < 100 || height < 100) {
      // Can't compress further, return current result
      const dataUrl = await blobToDataUrl(blob);
      const compressionRatio = Math.round(((file.size - blob.size) / file.size) * 100);

      console.warn('Cannot compress further without going below minimum dimensions');

      return {
        blob,
        dataUrl,
        size: blob.size,
        compressionRatio,
        quality: currentQuality,
        format: mimeType,
      };
    }

    // Reset quality for new dimensions
    currentQuality = 0.7;
  }

  throw new Error('Failed to compress image to target size after maximum attempts');
}

/**
 * Load image from File
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image'));

      img.src = e.target?.result as string;
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Convert Blob to data URL
 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read blob'));

    reader.readAsDataURL(blob);
  });
}

/**
 * Download blob as file
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}