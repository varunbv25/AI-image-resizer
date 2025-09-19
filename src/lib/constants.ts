import { AspectRatio } from '@/types';

export const ASPECT_RATIOS: AspectRatio[] = [
  { ratio: '9:16', width: 9, height: 16, label: 'Instagram Stories/TikTok' },
  { ratio: '2:3', width: 2, height: 3, label: 'Portrait Print' },
  { ratio: '16:9', width: 16, height: 9, label: 'Widescreen' },
  { ratio: '1:1', width: 1, height: 1, label: 'Square' },
  { ratio: '4:3', width: 4, height: 3, label: 'Standard' },
  { ratio: '3:2', width: 3, height: 2, label: 'Landscape' },
];

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const SUPPORTED_FORMATS = ['image/jpeg', 'image/png', 'image/webp'];

export const PROCESSING_TIMEOUT = 30000; // 30 seconds