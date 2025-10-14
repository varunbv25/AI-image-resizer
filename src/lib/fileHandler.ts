import { IncomingForm } from 'formidable';
import { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import { IncomingMessage } from 'http';
import { SUPPORTED_FORMATS, MAX_FILE_SIZE } from './constants';
import { UploadedFile } from '@/types';

export class FileHandler {
  static async parseFormData(req: NextRequest): Promise<UploadedFile> {
    return new Promise((resolve, reject) => {
      const form = new IncomingForm({
        maxFileSize: MAX_FILE_SIZE,
        keepExtensions: true,
        multiples: false,
      });

      // Convert NextRequest to Node.js IncomingMessage-like format
      const nodeReq = {
        headers: Object.fromEntries(req.headers.entries()),
        method: req.method,
        url: req.url,
        // Add other required properties as needed
      };

      form.parse(nodeReq as unknown as IncomingMessage, async (err, fields, files) => {
        if (err) {
          reject(new Error(`File upload error: ${err.message}`));
          return;
        }

        const file = Array.isArray(files.image) ? files.image[0] : files.image;
        if (!file) {
          reject(new Error('No image file provided'));
          return;
        }

        try {
          // Validate file type
          if (!SUPPORTED_FORMATS.includes(file.mimetype || '')) {
            reject(new Error(`Unsupported file format: ${file.mimetype}`));
            return;
          }

          // Read file buffer
          const buffer = await fs.readFile(file.filepath);

          resolve({
            filename: file.originalFilename || 'image',
            mimetype: file.mimetype || 'image/jpeg',
            buffer,
            size: file.size || 0,
          });
        } catch (error) {
          reject(new Error(`Failed to read uploaded file: ${error instanceof Error ? error.message : 'Unknown error'}`));
        }
      });
    });
  }

  static validateImage(file: UploadedFile): void {
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File size too large: ${Math.round(file.size / 1024 / 1024)}MB (max: ${MAX_FILE_SIZE / 1024 / 1024}MB)`);
    }

    if (!SUPPORTED_FORMATS.includes(file.mimetype)) {
      throw new Error(`Unsupported file format: ${file.mimetype}`);
    }
  }

  static getFileExtension(mimetype: string): string {
    switch (mimetype) {
      case 'image/jpeg':
        return 'jpg';
      case 'image/png':
        return 'png';
      case 'image/webp':
        return 'webp';
      case 'image/svg+xml':
        return 'svg';
      default:
        return 'jpg';
    }
  }

  static generateFileName(originalName: string, suffix: string = 'resized'): string {
    const timestamp = Date.now();
    const nameWithoutExt = originalName.replace(/\.[^/.]+$/, '');
    return `${nameWithoutExt}_${suffix}_${timestamp}`;
  }
}