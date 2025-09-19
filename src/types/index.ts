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
  stage: 'idle' | 'uploading' | 'analyzing' | 'extending' | 'optimizing' | 'completed' | 'error';
  progress: number;
  message: string;
}

export interface ImageProcessingOptions {
  targetDimensions: ImageDimensions;
  quality: number;
  format: 'jpeg' | 'png' | 'webp';
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