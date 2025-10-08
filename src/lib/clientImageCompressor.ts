/**
 * Client-side image compression utility
 * Compresses images in the browser before uploading to stay under Vercel's 4.5MB limit
 * Files >50MB are aggressively compressed to web-optimized sizes
 */

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  maxSizeMB?: number;
  isLargeFile?: boolean;
}

export async function compressImageFile(
  file: File,
  options: CompressionOptions = {}
): Promise<File> {
  const fileSizeMB = file.size / (1024 * 1024);
  const isVeryLarge = fileSizeMB > 50;

  // For files >50MB, apply aggressive web optimization
  const {
    maxWidth = isVeryLarge ? 2048 : 4096,
    maxHeight = isVeryLarge ? 2048 : 4096,
    quality = isVeryLarge ? 0.75 : 0.85,
    maxSizeMB = isVeryLarge ? 2 : 3, // More aggressive target for large files
  } = options;

  console.log(`Compressing ${fileSizeMB.toFixed(2)}MB file${isVeryLarge ? ' (web optimization mode)' : ''}...`);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => {
        // Calculate new dimensions while maintaining aspect ratio
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          const aspectRatio = width / height;

          if (width > height) {
            width = Math.min(width, maxWidth);
            height = width / aspectRatio;
          } else {
            height = Math.min(height, maxHeight);
            width = height * aspectRatio;
          }
        }

        // Create canvas and draw resized image
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Try to compress to target size
        let currentQuality = quality;
        const maxAttempts = 5;
        let attempt = 0;

        const tryCompress = () => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Failed to create blob'));
                return;
              }

              const sizeMB = blob.size / (1024 * 1024);

              // If size is acceptable or we've tried enough times, use it
              if (sizeMB <= maxSizeMB || attempt >= maxAttempts) {
                const compressedFile = new File([blob], file.name, {
                  type: file.type,
                  lastModified: Date.now(),
                });

                const originalSizeMB = file.size / (1024 * 1024);
                const finalSizeMB = blob.size / (1024 * 1024);
                const reduction = ((originalSizeMB - finalSizeMB) / originalSizeMB * 100).toFixed(1);

                console.log(`Compression complete: ${originalSizeMB.toFixed(2)}MB → ${finalSizeMB.toFixed(2)}MB (${reduction}% reduction)`);

                resolve(compressedFile);
              } else {
                // Try again with lower quality
                attempt++;
                currentQuality = Math.max(0.5, currentQuality - 0.1);
                tryCompress();
              }
            },
            file.type,
            currentQuality
          );
        };

        tryCompress();
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
