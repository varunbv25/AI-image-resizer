'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ImageDimensions } from '@/types';
import Image from 'next/image';

interface ImagePreviewProps {
  originalImage?: string;
  processedImage?: string;
  originalDimensions?: ImageDimensions;
  targetDimensions?: ImageDimensions;
  isProcessing?: boolean;
}

export function ImagePreview({
  originalImage,
  processedImage,
  originalDimensions,
  targetDimensions,
  isProcessing,
}: ImagePreviewProps) {
  if (!originalImage) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="aspect-[3/2] bg-gray-100 rounded-lg flex items-center justify-center min-h-[300px]">
            <p className="text-gray-500 text-lg">Upload an image to see preview</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-75%">
      <CardHeader>
        <CardTitle>Preview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Side by side images */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Original Image */}
          <div className="space-y-2">
            <h4 className="font-medium text-base text-center">Original Image</h4>
            <div className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden min-h-[250px]">
              <Image
                src={`data:image/jpeg;base64,${originalImage}`}
                alt="Original image"
                fill
                style={{ objectFit: 'contain' }}
              />
            </div>
            {originalDimensions && (
              <p className="text-sm text-gray-600 text-center">
                {originalDimensions.width} × {originalDimensions.height}
              </p>
            )}
          </div>

          {/* Processed Image */}
          <div className="space-y-2">
            <h4 className="font-medium text-base text-center">
              {isProcessing ? 'Processing...' : 'Processed Result'}
            </h4>
            <div className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden min-h-[250px]">
              {isProcessing ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent"></div>
                  <p className="text-gray-600 text-sm text-center">Processing...</p>
                </div>
              ) : processedImage ? (
                <Image
                  src={`data:image/jpeg;base64,${processedImage}`}
                  alt="Processed image"
                  fill
                  style={{ objectFit: 'contain' }}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center p-4">
                  <p className="text-gray-500 text-center">Click &quot;Resize Image&quot; to process</p>
                </div>
              )}
            </div>
            {targetDimensions && (
              <p className="text-sm text-gray-600 text-center">
                {targetDimensions.width} × {targetDimensions.height}
              </p>
            )}
          </div>
        </div>

      </CardContent>
    </Card>
  );
}