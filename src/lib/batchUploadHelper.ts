/**
 * Batch upload helper with client-side compression
 * Ensures large images are compressed before processing in batch mode
 */

import { compressImage, formatFileSize, calculateCompressionRatio } from './clientImageCompression';

/**
 * Prepare file for batch upload with automatic compression
 * @param file - The file to prepare
 * @param options - Compression options
 * @returns Prepared file (compressed if needed)
 */
export async function prepareFileForBatchUpload(
  file: File,
  options: {
    maxSizeMB?: number;
    maxWidthOrHeight?: number;
    quality?: number;
  } = {}
): Promise<File> {
  const {
    maxSizeMB = 3,
    maxWidthOrHeight = 4096,
    quality = 0.8,
  } = options;

  const originalSize = file.size;

  // If file is larger than threshold, compress it
  if (originalSize > maxSizeMB * 1024 * 1024) {
    console.log(`[Batch] Compressing ${file.name}: ${formatFileSize(originalSize)}`);

    const compressedFile = await compressImage(file, {
      maxSizeMB,
      maxWidthOrHeight,
      quality,
    });

    const compressedSize = compressedFile.size;
    const ratio = calculateCompressionRatio(originalSize, compressedSize);

    console.log(`[Batch] Compressed ${file.name}: ${formatFileSize(compressedSize)} (${ratio}% reduction)`);

    return compressedFile;
  }

  // File is small enough, return as-is
  return file;
}

/**
 * Prepare multiple files for batch upload with automatic compression
 * @param files - The files to prepare
 * @param options - Compression options
 * @returns Array of prepared files (compressed if needed)
 */
export async function prepareFilesForBatchUpload(
  files: File[],
  options: {
    maxSizeMB?: number;
    maxWidthOrHeight?: number;
    quality?: number;
  } = {}
): Promise<File[]> {
  console.log(`[Batch] Preparing ${files.length} files for upload...`);

  const preparedFiles = await Promise.all(
    files.map((file) => prepareFileForBatchUpload(file, options))
  );

  const totalOriginalSize = files.reduce((sum, file) => sum + file.size, 0);
  const totalPreparedSize = preparedFiles.reduce((sum, file) => sum + file.size, 0);
  const totalRatio = calculateCompressionRatio(totalOriginalSize, totalPreparedSize);

  if (totalRatio > 0) {
    console.log(
      `[Batch] Total compression: ${formatFileSize(totalOriginalSize)} → ${formatFileSize(totalPreparedSize)} (${totalRatio}% reduction)`
    );
  } else {
    console.log(`[Batch] No compression needed - all files under ${options.maxSizeMB || 3}MB`);
  }

  return preparedFiles;
}
