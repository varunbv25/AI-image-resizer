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
  MANUAL_CROPPING: 50 * 1024 * 1024, // 50MB
  IMAGE_COMPRESSION: 50 * 1024 * 1024, // 50MB
  ROTATE_FLIP: 50 * 1024 * 1024, // 50MB
  GENERATIVE_EXPAND: 50 * 1024 * 1024, // 50MB
  IMAGE_ENHANCEMENT: 50 * 1024 * 1024, // 50MB
  DEFAULT: 50 * 1024 * 1024, // 50MB default
} as const;

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB (kept for backward compatibility)

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

// Video validation utilities
export const SUPPORTED_VIDEO_FORMATS = {
  'video/mp4': ['.mp4'],
  'video/webm': ['.webm'],
  'video/quicktime': ['.mov'],
  'video/x-msvideo': ['.avi'],
  'video/x-matroska': ['.mkv'],
} as const;

export const VIDEO_FILE_SIZE_LIMITS = {
  VIDEO_COMPRESSION: 500 * 1024 * 1024, // 500MB
  VIDEO_CROPPING: 500 * 1024 * 1024, // 500MB
  VIDEO_TRIMMING: 500 * 1024 * 1024, // 500MB
  DEFAULT: 500 * 1024 * 1024, // 500MB default
} as const;

export const MAX_VIDEO_FILE_SIZE = 500 * 1024 * 1024; // 500MB

export type VideoProcessingMode = keyof typeof VIDEO_FILE_SIZE_LIMITS;

/**
 * Validate if a file is a supported video format and within size limits
 */
export function validateVideoFile(
  file: File,
  maxSizeBytes?: number,
  mode?: VideoProcessingMode
): FileValidationResult {
  const sizeLimit = maxSizeBytes || (mode ? VIDEO_FILE_SIZE_LIMITS[mode] : MAX_VIDEO_FILE_SIZE);
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
  if (!Object.keys(SUPPORTED_VIDEO_FORMATS).includes(mimeType)) {
    return {
      isValid: false,
      error: `File format "${file.type || 'unknown'}" is not supported. Please upload MP4, WebM, MOV, AVI, or MKV files.`,
      errorType: 'format',
    };
  }

  // Check file extension
  const fileName = file.name.toLowerCase();
  const supportedExtensions = Object.values(SUPPORTED_VIDEO_FORMATS).flat();
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
 * Validate multiple video files (batch upload)
 */
export function validateVideoFiles(
  files: File[],
  maxSizeBytes?: number,
  mode?: VideoProcessingMode
): {
  isValid: boolean;
  invalidFiles: Array<{ file: File; error: string; errorType: 'format' | 'size' }>;
  validFiles: File[];
} {
  const invalidFiles: Array<{ file: File; error: string; errorType: 'format' | 'size' }> = [];
  const validFiles: File[] = [];

  for (const file of files) {
    const validation = validateVideoFile(file, maxSizeBytes, mode);
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
