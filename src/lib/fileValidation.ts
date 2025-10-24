/**
 * File validation utilities for image uploads
 */

export const SUPPORTED_FORMATS = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/svg+xml': ['.svg'],
} as const;

// Mode-specific file size limits
export const FILE_SIZE_LIMITS = {
  MANUAL_CROPPING: 10 * 1024 * 1024, // 10MB
  IMAGE_COMPRESSION: 10 * 1024 * 1024, // 10MB
  ROTATE_FLIP: 10 * 1024 * 1024, // 10MB
  GENERATIVE_EXPAND: 3 * 1024 * 1024, // 3MB
  IMAGE_ENHANCEMENT: 3 * 1024 * 1024, // 3MB
  DEFAULT: 10 * 1024 * 1024, // 10MB default
} as const;

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB (kept for backward compatibility)

export type ProcessingMode = keyof typeof FILE_SIZE_LIMITS;

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
  errorType?: 'format' | 'size';
}

/**
 * Validate if a file is a supported image format and within size limits
 * @param file - The file to validate
 * @param maxSizeBytes - Optional custom max size in bytes (overrides mode-specific limits)
 * @param mode - Optional processing mode to use mode-specific size limits
 */
export function validateImageFile(
  file: File,
  maxSizeBytes?: number,
  mode?: ProcessingMode
): FileValidationResult {
  // Determine the size limit to use
  const sizeLimit = maxSizeBytes || (mode ? FILE_SIZE_LIMITS[mode] : MAX_FILE_SIZE);
  const sizeLimitMB = (sizeLimit / 1024 / 1024).toFixed(0);

  // Check file size
  if (file.size > sizeLimit) {
    return {
      isValid: false,
      error: `File size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size of ${sizeLimitMB}MB`,
      errorType: 'size',
    };
  }

  // Check MIME type
  const mimeType = file.type.toLowerCase();
  if (!Object.keys(SUPPORTED_FORMATS).includes(mimeType)) {
    return {
      isValid: false,
      error: `File format "${file.type || 'unknown'}" is not supported. Please upload JPEG, PNG, WebP, or SVG files.`,
      errorType: 'format',
    };
  }

  // Check file extension as additional validation
  const fileName = file.name.toLowerCase();
  const supportedExtensions = Object.values(SUPPORTED_FORMATS).flat();
  const hasValidExtension = supportedExtensions.some(ext => fileName.endsWith(ext));

  if (!hasValidExtension) {
    return {
      isValid: false,
      error: `File extension is not supported. Supported: ${supportedExtensions.join(', ')}`,
      errorType: 'format',
    };
  }

  return { isValid: true };
}

/**
 * Validate multiple files (batch upload)
 * @param files - Array of files to validate
 * @param maxSizeBytes - Optional custom max size in bytes
 * @param mode - Optional processing mode to use mode-specific size limits
 * @returns Object with validation results and any invalid files
 */
export function validateImageFiles(
  files: File[],
  maxSizeBytes?: number,
  mode?: ProcessingMode
): {
  isValid: boolean;
  invalidFiles: Array<{ file: File; error: string; errorType: 'format' | 'size' }>;
  validFiles: File[];
} {
  const invalidFiles: Array<{ file: File; error: string; errorType: 'format' | 'size' }> = [];
  const validFiles: File[] = [];

  for (const file of files) {
    const validation = validateImageFile(file, maxSizeBytes, mode);
    if (!validation.isValid) {
      invalidFiles.push({
        file,
        error: validation.error || 'Invalid file',
        errorType: validation.errorType || 'format',
      });
    } else {
      validFiles.push(file);
    }
  }

  return {
    isValid: invalidFiles.length === 0,
    invalidFiles,
    validFiles,
  };
}

/**
 * Get human-readable file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
