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

// Video Types
export type VideoProcessingMode = 'VIDEO_COMPRESSION' | 'VIDEO_CROPPING' | 'VIDEO_TRIMMING';

export interface VideoDimensions {
  width: number;
  height: number;
}

export interface VideoMetadata {
  duration: number; // in seconds
  width: number;
  height: number;
  format: string;
  size: number;
  codec?: string;
  bitrate?: number;
  fps?: number;
}

export interface VideoProcessingStatus {
  stage: 'idle' | 'uploading' | 'loading' | 'processing' | 'encoding' | 'completed' | 'error';
  progress: number;
  message: string;
}

export interface VideoCompressionSettings {
  compressionType: 'filesize';
  targetSize: number; // in MB for filesize mode
  format: 'mp4' | 'webm' | 'mov';
  resolution: '240p' | '360p' | '480p' | '720p';
}

export interface VideoCropSettings {
  x: number;
  y: number;
  width: number;
  height: number;
  presetType?: 'manual' | 'preset';
  aspectRatio?: string;
}

export interface VideoTrimSettings {
  startTime: number; // in seconds
  endTime: number; // in seconds
  trimType: 'manual' | 'slider';
}

export interface UploadedVideoData {
  filename: string;
  metadata: VideoMetadata;
  size: number;
  mimetype: string;
  videoData: string; // base64 or blob URL
  blobUrl?: string;
  thumbnailUrl?: string;
}

export interface ProcessedVideoData {
  videoData: string;
  metadata: VideoMetadata;
  filename: string;
  blobUrl?: string;
}

export interface VideoAPIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  progress?: number;
}

// Batch Video Processing Types
export interface VideoBatchItem {
  id: string;
  filename: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  originalSize: number;
  processedSize?: number;
  error?: string;
  processedData?: string; // blob URL for processed video
  thumbnailUrl?: string;
  blobUrl?: string;
  settings?: VideoBatchItemSettings;
  metadata?: VideoMetadata;
}

export type VideoBatchItemSettings = VideoBatchCompressionSettings | VideoBatchCropSettings | VideoBatchTrimSettings;

export interface VideoBatchCompressionSettings {
  compressionType?: 'filesize';
  targetSize: number;
  format: 'mp4' | 'webm' | 'mov';
  resolution: '240p' | '360p' | '480p' | '720p';
}

export interface VideoBatchCropSettings {
  x: number;
  y: number;
  width: number;
  height: number;
  presetType?: 'manual' | 'preset';
  aspectRatio?: string;
}

export interface VideoBatchTrimSettings {
  startTime: number;
  endTime: number;
  trimType?: 'manual' | 'slider';
}