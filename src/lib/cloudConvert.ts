/* eslint-disable @typescript-eslint/no-unused-vars */
interface CloudConvertConfig {
  apiKey: string;
  baseUrl: string;
}

interface CompressionOptions {
  quality?: number;
  format?: 'jpg' | 'png' | 'webp';
  optimize?: boolean;
}

interface CloudConvertJob {
  data: {
    id: string;
    status: 'waiting' | 'processing' | 'finished' | 'error';
    tasks: CloudConvertTask[];
  };
}

interface CloudConvertTask {
  id: string;
  name: string;
  status: 'waiting' | 'processing' | 'finished' | 'error';
  result?: {
    files: CloudConvertFile[];
  };
}

interface CloudConvertFile {
  filename: string;
  url: string;
  size: number;
}

export class CloudConvertService {
  private config: CloudConvertConfig;

  constructor(apiKey: string) {
    this.config = {
      apiKey,
      baseUrl: 'https://sync.api.cloudconvert.com/v2',
    };
  }

  async compressImage(
    imageBuffer: Buffer,
    filename: string,
    options: CompressionOptions = {}
  ): Promise<Buffer> {
    const {
      quality = 85,
      format = 'jpg',
      optimize = true,
    } = options;

    try {
      const jobPayload = {
        tasks: {
          'import-file': {
            operation: 'import/base64',
            file: imageBuffer.toString('base64'),
            filename,
          },
          'compress-image': {
            operation: 'optimize',
            input: 'import-file',
            quality,
            ...(format !== 'png' && { format }),
            ...(optimize && { optimize: true }),
          },
          'export-file': {
            operation: 'export/url',
            input: 'compress-image',
          },
        },
      };

      const response = await fetch(`${this.config.baseUrl}/jobs`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(jobPayload),
      });

      if (!response.ok) {
        throw new Error(`CloudConvert API error: ${response.status} ${response.statusText}`);
      }

      const job: CloudConvertJob = await response.json();

      if (job.data.status === 'error') {
        throw new Error('CloudConvert job failed');
      }

      const exportTask = job.data.tasks.find(task => task.name === 'export-file');
      if (!exportTask?.result?.files?.[0]?.url) {
        throw new Error('No download URL found in CloudConvert response');
      }

      const compressedFileResponse = await fetch(exportTask.result.files[0].url);
      if (!compressedFileResponse.ok) {
        throw new Error('Failed to download compressed file');
      }

      const compressedBuffer = Buffer.from(await compressedFileResponse.arrayBuffer());
      return compressedBuffer;

    } catch (error) {
      console.error('CloudConvert compression error:', error);
      throw error;
    }
  }

  async getOptimalWebSettings(originalSize: number, format: string): Promise<CompressionOptions> {
    if (originalSize < 100 * 1024) {
      return { quality: 95, optimize: true };
    } else if (originalSize < 500 * 1024) {
      return { quality: 85, optimize: true };
    } else if (originalSize < 2 * 1024 * 1024) {
      return { quality: 75, optimize: true };
    } else {
      return { quality: 65, optimize: true };
    }
  }
}

export const createCloudConvertService = (apiKey?: string) => {
  if (!apiKey) {
    throw new Error('CloudConvert API key is required');
  }
  return new CloudConvertService(apiKey);
};