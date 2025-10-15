/**
 * Client-side image compression utility
 * Compresses images before upload to prevent payload size errors
 */

export interface CompressionOptions {
  maxSizeMB?: number;
  maxWidthOrHeight?: number;
  quality?: number;
  useWebWorker?: boolean;
}

/**
 * Compress an image file on the client side
 * @param file - The image file to compress
 * @param options - Compression options
 * @returns Compressed image as File object
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<File> {
  const {
    maxSizeMB = 3, // Default max 3MB (safe for most platforms)
    maxWidthOrHeight = 4096, // Max dimension
    quality = 0.8, // 80% quality
  } = options;

  // If file is already small enough, return as-is
  if (file.size <= maxSizeMB * 1024 * 1024) {
    return file;
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => {
        try {
          // Calculate new dimensions while maintaining aspect ratio
          let { width, height } = img;

          if (width > maxWidthOrHeight || height > maxWidthOrHeight) {
            if (width > height) {
              height = (height / width) * maxWidthOrHeight;
              width = maxWidthOrHeight;
            } else {
              width = (width / height) * maxWidthOrHeight;
              height = maxWidthOrHeight;
            }
          }

          // Create canvas and draw resized image
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }

          // Use high-quality image smoothing
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          // Draw image
          ctx.drawImage(img, 0, 0, width, height);

          // Convert to blob with specified quality
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Failed to compress image'));
                return;
              }

              // Create new File from blob
              const compressedFile = new File(
                [blob],
                file.name,
                {
                  type: file.type || 'image/jpeg',
                  lastModified: Date.now(),
                }
              );

              // If still too large, try with lower quality
              if (compressedFile.size > maxSizeMB * 1024 * 1024 && quality > 0.5) {
                compressImage(file, {
                  ...options,
                  quality: quality - 0.1,
                }).then(resolve).catch(reject);
                return;
              }

              resolve(compressedFile);
            },
            file.type || 'image/jpeg',
            quality
          );
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };

      img.src = e.target?.result as string;
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Convert File to base64 string
 * @param file - The file to convert
 * @returns Base64 string with data URI
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(reader.result as string);
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Get image dimensions from File
 * @param file - The image file
 * @returns Object with width and height
 */
export async function getImageDimensions(
  file: File
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => {
        resolve({
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      };

      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };

      img.src = e.target?.result as string;
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Format bytes to human-readable size
 * @param bytes - Number of bytes
 * @returns Formatted string (e.g., "2.5 MB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Calculate compression ratio
 * @param originalSize - Original file size in bytes
 * @param compressedSize - Compressed file size in bytes
 * @returns Compression ratio as percentage
 */
export function calculateCompressionRatio(
  originalSize: number,
  compressedSize: number
): number {
  if (originalSize === 0) return 0;

  return Math.round(((originalSize - compressedSize) / originalSize) * 100);
}
