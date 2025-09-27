/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { ImageUploader } from '@/components/ImageUploader';
import { ImagePreview } from '@/components/ImagePreview';
import { ProcessingStatus } from '@/components/ProcessingStatus';
import { useFileUpload } from '@/hooks/useFileUpload';
import { useUpscaling } from '@/hooks/useUpscaling';
import { ImageDimensions } from '@/types';
import { Download, RotateCcw, Maximize, Settings } from 'lucide-react';
interface UpscalingProps {
  onBack: () => void;
}

interface UpscaleSettings {
  method: 'scale' | 'resolution';
  scaleFactor: number;
  targetWidth: number;
  targetHeight: number;
  quality: number;
}

export function Upscaling({ onBack }: UpscalingProps) {
  const [upscaleSettings, setUpscaleSettings] = useState<UpscaleSettings>({
    method: 'scale',
    scaleFactor: 2,
    targetWidth: 1920,
    targetHeight: 1080,
    quality: 0.9,
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
    upscaledImage,
    status,
    upscaleImage,
    downloadImage,
    reset: resetUpscaling,
  } = useUpscaling();

  const handleImageUpload = (file: File) => {
    uploadFile(file);
    resetUpscaling();
  };

  const handleReset = () => {
    resetUpload();
    resetUpscaling();
  };

  const handleUpscale = async () => {
    if (!uploadedImage) return;

    let targetWidth: number;
    let targetHeight: number;

    if (upscaleSettings.method === 'scale') {
      targetWidth = Math.round(uploadedImage.originalDimensions.width * upscaleSettings.scaleFactor);
      targetHeight = Math.round(uploadedImage.originalDimensions.height * upscaleSettings.scaleFactor);
    } else {
      targetWidth = upscaleSettings.targetWidth;
      targetHeight = upscaleSettings.targetHeight;
    }

    const targetDimensions: ImageDimensions = {
      width: targetWidth,
      height: targetHeight,
    };

    await upscaleImage(uploadedImage.imageData, targetDimensions, {
      quality: Math.round(upscaleSettings.quality * 100),
      format: 'jpeg',
    });
  };

  const handleDownload = () => {
    if (!upscaledImage) return;
    downloadImage(`upscaled-${uploadedImage?.filename || 'image'}.jpg`);
  };


  return (
    <div className="container mx-auto px-4 py-8">
      <header className="text-center mb-8">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
            <Maximize className="w-6 h-6 text-purple-600" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900">
            Image Upscaling
          </h1>
        </div>
        <p className="text-lg text-gray-600">
          Enhance and upscale images to higher resolutions
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Half - Controls */}
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
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="w-4 h-4" />
                    Upscaling Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Method</label>
                    <div className="flex gap-2">
                      <Button
                        variant={upscaleSettings.method === 'scale' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setUpscaleSettings(prev => ({ ...prev, method: 'scale' }))}
                        className="flex-1"
                      >
                        Scale Factor
                      </Button>
                      <Button
                        variant={upscaleSettings.method === 'resolution' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setUpscaleSettings(prev => ({ ...prev, method: 'resolution' }))}
                        className="flex-1"
                      >
                        Target Resolution
                      </Button>
                    </div>
                  </div>

                  {upscaleSettings.method === 'scale' ? (
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Scale Factor: {upscaleSettings.scaleFactor}x
                      </label>
                      <Slider
                        value={[upscaleSettings.scaleFactor]}
                        onValueChange={(value) =>
                          setUpscaleSettings(prev => ({ ...prev, scaleFactor: value[0] }))
                        }
                        min={1}
                        max={4}
                        step={0.1}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>1x</span>
                        <span>4x</span>
                      </div>
                      {uploadedImage && (
                        <p className="text-sm text-gray-600 mt-2">
                          Output: {Math.round(uploadedImage.originalDimensions.width * upscaleSettings.scaleFactor)} × {Math.round(uploadedImage.originalDimensions.height * upscaleSettings.scaleFactor)}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Width</label>
                        <input
                          type="number"
                          value={upscaleSettings.targetWidth}
                          onChange={(e) =>
                            setUpscaleSettings(prev => ({
                              ...prev,
                              targetWidth: parseInt(e.target.value) || 0
                            }))
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Height</label>
                        <input
                          type="number"
                          value={upscaleSettings.targetHeight}
                          onChange={(e) =>
                            setUpscaleSettings(prev => ({
                              ...prev,
                              targetHeight: parseInt(e.target.value) || 0
                            }))
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Quality: {Math.round(upscaleSettings.quality * 100)}%
                    </label>
                    <Slider
                      value={[upscaleSettings.quality]}
                      onValueChange={(value) =>
                        setUpscaleSettings(prev => ({ ...prev, quality: value[0] }))
                      }
                      min={0.5}
                      max={1}
                      step={0.05}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>50%</span>
                      <span>100%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-2">
                <Button
                  onClick={handleUpscale}
                  disabled={isProcessing}
                  className="flex-1 bg-purple-600 hover:bg-purple-700"
                >
                  {isProcessing ? 'Upscaling...' : 'Upscale Image'}
                </Button>

                {upscaledImage && (
                  <Button
                    variant="outline"
                    onClick={handleDownload}
                    className="flex items-center gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </Button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Right Half - Preview */}
        <div className="space-y-4">
          <ImagePreview
            originalImage={uploadedImage?.imageData}
            processedImage={upscaledImage?.imageData}
            originalDimensions={uploadedImage?.originalDimensions}
            targetDimensions={{
              width: upscaleSettings.method === 'scale'
                ? Math.round((uploadedImage?.originalDimensions.width || 0) * upscaleSettings.scaleFactor)
                : upscaleSettings.targetWidth,
              height: upscaleSettings.method === 'scale'
                ? Math.round((uploadedImage?.originalDimensions.height || 0) * upscaleSettings.scaleFactor)
                : upscaleSettings.targetHeight,
            }}
            isProcessing={isProcessing}
          />

          {/* Progress Bar under preview */}
          {(isProcessing || status.stage !== 'idle') && (
            <ProcessingStatus
              status={isProcessing && status.stage === 'idle'
                ? { stage: 'analyzing', progress: 10, message: 'Processing image...' }
                : status
              }
            />
          )}

          {/* Result Details */}
          {upscaledImage && (
            <Card>
              <CardHeader>
                <CardTitle>Result Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Dimensions:</span>
                  <span>{upscaledImage.metadata.width} × {upscaledImage.metadata.height}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Scale Factor:</span>
                  <span>
                    {uploadedImage ?
                      (upscaledImage.metadata.width / uploadedImage.originalDimensions.width).toFixed(1) + 'x'
                      : 'N/A'
                    }
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Format:</span>
                  <span className="uppercase">{upscaledImage.metadata.format}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>File Size:</span>
                  <span>{Math.round(upscaledImage.metadata.size / 1024)} KB</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <footer className="text-center mt-12 text-gray-500 text-sm">
        <p>No file size limits • High-quality upscaling</p>
      </footer>
    </div>
  );
}