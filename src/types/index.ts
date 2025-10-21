export interface ImageDimensions {
  width: number;
  height: number;
}

export interface AspectRatio {
  ratio: string;
  width: number;
  height: number;
  label: string;
}

export interface ProcessingStatus {
  stage: 'idle' | 'uploading' | 'analyzing' | 'extending' | 'enhancing' | 'optimizing' | 'completed' | 'error' | 'finalizing';
  progress: number;
  message: string;
}

export interface ImageProcessingOptions {
  targetDimensions: ImageDimensions;
  quality: number;
  format: 'jpeg' | 'png' | 'webp' | 'svg';
}

export interface ExtensionStrategy {
  type: 'ai' | 'edge-extend';
  fallback?: boolean;
}

export interface ProcessedImage {
  buffer: Buffer;
  metadata: {
    width: number;
    height: number;
    format: string;
    size: number;
  };
}

export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface UploadedFile {
  filename: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

export interface RotateFlipSettings {
  operation: 'rotate-90' | 'rotate-180' | 'rotate-270' | 'flip-horizontal' | 'flip-vertical' | 'custom';
  customAngle?: number;
  quality: number;
}

export interface FilterSettings {
  filterType: 'grayscale' | 'sepia' | 'noir' | 'warm' | 'cool' | 'vibrant' | 'dramatic' | 'soft-focus';
  intensity: number; // 0-100
  quality: number;
}

export interface FormatConversionSettings {
  targetFormat: 'jpeg' | 'png' | 'webp' | 'svg';
  quality: number;
  originalFormat?: string;
}