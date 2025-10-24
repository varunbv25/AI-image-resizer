/**
 * File validation utilities for image uploads
 */

export const SUPPORTED_FORMATS = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/svg+xml': ['.svg'],
} as const;

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
  errorType?: 'format' | 'size';
}

/**
 * Validate if a file is a supported image format and within size limits
 * @param file - The file to validate
 * @param skipSizeCheck - If true, skips file size validation (for blob uploads)
 */
export function validateImageFile(file: File, skipSizeCheck = false): FileValidationResult {
  // Check file size (skip if using blob upload)
  if (!skipSizeCheck && file.size > MAX_FILE_SIZE) {
    return {
      isValid: false,
      error: `File size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size of 10MB`,
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
 * Get human-readable file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
