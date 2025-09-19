'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ImageUploader } from '@/components/ImageUploader';
import { DimensionSelector } from '@/components/DimensionSelector';
import { ImagePreview } from '@/components/ImagePreview';
import { ProcessingStatus } from '@/components/ProcessingStatus';
import { useFileUpload } from '@/hooks/useFileUpload';
import { useImageProcessing } from '@/hooks/useImageProcessing';
import { ImageDimensions } from '@/types';
import { Download, RotateCcw } from 'lucide-react';

export default function Home() {
  const [targetDimensions, setTargetDimensions] = useState<ImageDimensions>({
    width: 1080,
    height: 1920,
  });

  const {
    isUploading,
    uploadedImage,
    error: uploadError,
    uploadFile,
    reset: resetUpload,
  } = useFileUpload();

  const {
    isProcessing,
    processedImage,
    status,
    processImage,
    downloadImage,
    reset: resetProcessing,
  } = useImageProcessing();

  const handleImageUpload = (file: File) => {
    uploadFile(file);
    resetProcessing();
  };

  const handleProcess = () => {
    if (!uploadedImage) return;

    processImage(uploadedImage.imageData, targetDimensions);
  };

  const handleReset = () => {
    resetUpload();
    resetProcessing();
  };

  const handleDimensionsChange = (dimensions: ImageDimensions) => {
    setTargetDimensions(dimensions);
    resetProcessing();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            AI-Powered Image Resizer
          </h1>
          <p className="text-lg text-gray-600">
            Intelligently resize and extend images with AI-powered canvas extension
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Half - Controls and Dimensions */}
          <div className="space-y-6">
            {!uploadedImage ? (
              <ImageUploader onImageUpload={handleImageUpload} isUploading={isUploading} />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    Image Uploaded
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleReset}
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Reset
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600">
                    {uploadedImage.filename}
                  </p>
                  <p className="text-xs text-gray-500">
                    {uploadedImage.originalDimensions.width} × {uploadedImage.originalDimensions.height} •{' '}
                    {Math.round(uploadedImage.size / 1024)} KB
                  </p>
                </CardContent>
              </Card>
            )}

            {uploadError && (
              <Card className="border-red-200">
                <CardContent className="pt-6">
                  <p className="text-red-600 text-sm">{uploadError}</p>
                </CardContent>
              </Card>
            )}

            {uploadedImage && (
              <DimensionSelector
                originalDimensions={uploadedImage.originalDimensions}
                targetDimensions={targetDimensions}
                onDimensionsChange={handleDimensionsChange}
              />
            )}

            {uploadedImage && (
              <>
                <Button
                  onClick={handleProcess}
                  disabled={isProcessing}
                  className="w-full bg-black hover:bg-gray-800 text-white"
                  size="lg"
                >
                  {isProcessing ? 'Processing...' : 'Resize Image'}
                </Button>

                {processedImage && (
                  <Button
                    variant="outline"
                    onClick={() => downloadImage()}
                    className="w-full flex items-center justify-center gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </Button>
                )}
              </>
            )}
          </div>

          {/* Right Half - Preview */}
          <div className="space-y-4">
            <ImagePreview
              originalImage={uploadedImage?.imageData}
              processedImage={processedImage?.imageData}
              originalDimensions={uploadedImage?.originalDimensions}
              targetDimensions={targetDimensions}
              isProcessing={isProcessing}
            />

            {/* Progress Bar under preview - separate component */}
            {(isProcessing || status.stage !== 'idle') && (
              <ProcessingStatus
                status={isProcessing && status.stage === 'idle'
                  ? { stage: 'analyzing', progress: 10, message: 'Processing image...' }
                  : status
                }
              />
            )}
          </div>
        </div>

        {/* Bottom Section - Result Details */}
        {processedImage && (
          <div className="mt-8">
            <div className="max-w-md mx-auto">
              <Card>
                <CardHeader>
                  <CardTitle>Result Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Dimensions:</span>
                    <span>{processedImage.metadata.width} × {processedImage.metadata.height}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Format:</span>
                    <span className="uppercase">{processedImage.metadata.format}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>File Size:</span>
                    <span>{Math.round(processedImage.metadata.size / 1024)} KB</span>
                  </div>
                  {processedImage.fallbackUsed && (
                    <div className="mt-3 p-2 bg-amber-50 rounded text-xs text-amber-700">
                      AI processing unavailable - used fallback method
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        <footer className="text-center mt-12 text-gray-500 text-sm">
          <p>Upload images up to 10MB in JPEG, PNG, or WebP format</p>
        </footer>
      </div>
    </div>
  );
}
