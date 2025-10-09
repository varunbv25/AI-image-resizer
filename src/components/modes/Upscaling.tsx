/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @next/next/no-img-element */
'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { ImageUploader } from '@/components/ImageUploader';
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
  const [isScaleSliderHovered, setIsScaleSliderHovered] = useState(false);
  const [isQualitySliderHovered, setIsQualitySliderHovered] = useState(false);
  const [comparisonPosition, setComparisonPosition] = useState<number>(50);
  const [isComparing, setIsComparing] = useState(false);
  const [imageBounds, setImageBounds] = useState<{ left: number; right: number } | null>(null);
  const scaleSliderRef = useRef<HTMLDivElement>(null);
  const qualitySliderRef = useRef<HTMLDivElement>(null);
  const comparisonRef = useRef<HTMLDivElement>(null);
  const originalImageRef = useRef<HTMLImageElement>(null);

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
      // Ensure target dimensions are at least as large as original
      targetWidth = Math.max(upscaleSettings.targetWidth, uploadedImage.originalDimensions.width);
      targetHeight = Math.max(upscaleSettings.targetHeight, uploadedImage.originalDimensions.height);
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

  useEffect(() => {
    const scaleElement = scaleSliderRef.current;
    if (!scaleElement) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const delta = e.deltaY > 0 ? -0.1 : 0.1; // Scroll down = decrease, scroll up = increase
      const newValue = Math.max(1.1, Math.min(4, upscaleSettings.scaleFactor + delta));
      setUpscaleSettings(prev => ({ ...prev, scaleFactor: Math.round(newValue * 10) / 10 }));
    };

    if (isScaleSliderHovered) {
      scaleElement.addEventListener('wheel', handleWheel, { passive: false });
    }

    return () => {
      scaleElement.removeEventListener('wheel', handleWheel);
    };
  }, [isScaleSliderHovered, upscaleSettings.scaleFactor]);

  useEffect(() => {
    const qualityElement = qualitySliderRef.current;
    if (!qualityElement) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const delta = e.deltaY > 0 ? -0.05 : 0.05; // Scroll down = decrease, scroll up = increase
      const newValue = Math.max(0.5, Math.min(1, upscaleSettings.quality + delta));
      setUpscaleSettings(prev => ({ ...prev, quality: Math.round(newValue * 100) / 100 }));
    };

    if (isQualitySliderHovered) {
      qualityElement.addEventListener('wheel', handleWheel, { passive: false });
    }

    return () => {
      qualityElement.removeEventListener('wheel', handleWheel);
    };
  }, [isQualitySliderHovered, upscaleSettings.quality]);

  // Calculate image bounds when upscaled image changes
  useEffect(() => {
    if (!upscaledImage || !comparisonRef.current || !uploadedImage) {
      setImageBounds(null);
      return;
    }

    const calculateBounds = () => {
      const container = comparisonRef.current;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const containerHeight = containerRect.height;

      // Get image dimensions
      const imgWidth = uploadedImage.originalDimensions.width;
      const imgHeight = uploadedImage.originalDimensions.height;

      // Calculate aspect ratios
      const containerAspect = containerWidth / containerHeight;
      const imageAspect = imgWidth / imgHeight;

      let leftPercent = 0;
      let rightPercent = 100;

      // Image is wider than container (letterboxing on sides)
      if (imageAspect > containerAspect) {
        // Image fills width, has empty space on top/bottom
        leftPercent = 0;
        rightPercent = 100;
      } else {
        // Image fills height, has empty space on left/right
        const renderedWidth = containerHeight * imageAspect;
        const emptySpace = (containerWidth - renderedWidth) / 2;
        leftPercent = (emptySpace / containerWidth) * 100;
        rightPercent = ((containerWidth - emptySpace) / containerWidth) * 100;
      }

      const bounds = {
        left: leftPercent,
        right: rightPercent
      };

      setImageBounds(bounds);

      // Set initial comparison position to middle of image bounds
      const middlePosition = (bounds.left + bounds.right) / 2;
      setComparisonPosition(middlePosition);
    };

    // Use timeout to ensure images are rendered
    const timeoutId = setTimeout(calculateBounds, 150);

    // Recalculate on window resize
    window.addEventListener('resize', calculateBounds);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', calculateBounds);
    };
  }, [upscaledImage, uploadedImage]);

  // Helper function to constrain position within image bounds
  const constrainPosition = (percentage: number): number => {
    if (!imageBounds) return percentage;
    return Math.max(imageBounds.left, Math.min(imageBounds.right, percentage));
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

      {!uploadedImage ? (
        <div className="max-w-2xl mx-auto">
          <ImageUploader onImageUpload={handleImageUpload} isUploading={isUploading} />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Half - Controls */}
          <div className="space-y-6">
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

            {uploadError && (
              <Card className="border-red-200">
                <CardContent className="pt-6">
                  <p className="text-red-600 text-sm">{uploadError}</p>
                </CardContent>
              </Card>
            )}

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
                      <div
                        ref={scaleSliderRef}
                        onMouseEnter={() => setIsScaleSliderHovered(true)}
                        onMouseLeave={() => setIsScaleSliderHovered(false)}
                      >
                        <Slider
                          value={[upscaleSettings.scaleFactor]}
                          onValueChange={(value) =>
                            setUpscaleSettings(prev => ({ ...prev, scaleFactor: value[0] }))
                          }
                          min={1.1}
                          max={4}
                          step={0.1}
                          className="w-full"
                        />
                      </div>
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>1.1x</span>
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
                          min={uploadedImage?.originalDimensions.width || 0}
                          onChange={(e) => {
                            const value = parseInt(e.target.value) || 0;
                            const minWidth = uploadedImage?.originalDimensions.width || 0;
                            setUpscaleSettings(prev => ({
                              ...prev,
                              targetWidth: Math.max(value, minWidth)
                            }));
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        />
                        {uploadedImage && (
                          <p className="text-xs text-gray-500 mt-1">
                            Min: {uploadedImage.originalDimensions.width}px
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Height</label>
                        <input
                          type="number"
                          value={upscaleSettings.targetHeight}
                          min={uploadedImage?.originalDimensions.height || 0}
                          onChange={(e) => {
                            const value = parseInt(e.target.value) || 0;
                            const minHeight = uploadedImage?.originalDimensions.height || 0;
                            setUpscaleSettings(prev => ({
                              ...prev,
                              targetHeight: Math.max(value, minHeight)
                            }));
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        />
                        {uploadedImage && (
                          <p className="text-xs text-gray-500 mt-1">
                            Min: {uploadedImage.originalDimensions.height}px
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Quality: {Math.round(upscaleSettings.quality * 100)}%
                    </label>
                    <div
                      ref={qualitySliderRef}
                      onMouseEnter={() => setIsQualitySliderHovered(true)}
                      onMouseLeave={() => setIsQualitySliderHovered(false)}
                    >
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
                    </div>
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
          </div>

        {/* Right Half - Preview */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                {upscaledImage ? 'Comparison View' : 'Original Image'}
                {upscaledImage && (
                  <span className="text-xs text-gray-500 font-normal">
                    Drag slider to compare
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                ref={comparisonRef}
                className="relative aspect-video bg-gray-100 rounded-lg overflow-hidden mb-4 select-none"
                onMouseDown={(e) => {
                  if (!upscaledImage) return;
                  setIsComparing(true);
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const percentage = (x / rect.width) * 100;
                  setComparisonPosition(constrainPosition(percentage));
                }}
                onMouseMove={(e) => {
                  if (!isComparing || !upscaledImage) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const percentage = (x / rect.width) * 100;
                  setComparisonPosition(constrainPosition(percentage));
                }}
                onMouseUp={() => setIsComparing(false)}
                onMouseLeave={() => setIsComparing(false)}
                onTouchStart={(e) => {
                  if (!upscaledImage) return;
                  setIsComparing(true);
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.touches[0].clientX - rect.left;
                  const percentage = (x / rect.width) * 100;
                  setComparisonPosition(constrainPosition(percentage));
                }}
                onTouchMove={(e) => {
                  if (!isComparing || !upscaledImage) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.touches[0].clientX - rect.left;
                  const percentage = (x / rect.width) * 100;
                  setComparisonPosition(constrainPosition(percentage));
                }}
                onTouchEnd={() => setIsComparing(false)}
              >
                {/* Upscaled Image (base layer) */}
                {upscaledImage && (
                  <img
                    src={`data:image/${upscaledImage.metadata.format};base64,${upscaledImage.imageData}`}
                    alt="Upscaled"
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                )}

                {/* Original Image (clipped layer) */}
                <div
                  className="absolute inset-0"
                  style={{
                    clipPath: upscaledImage
                      ? `inset(0 ${100 - comparisonPosition}% 0 0)`
                      : 'none'
                  }}
                >
                  <img
                    ref={originalImageRef}
                    src={`data:${uploadedImage.mimetype};base64,${uploadedImage.imageData}`}
                    alt="Original"
                    className="w-full h-full object-contain"
                  />
                </div>

                {/* Comparison Slider */}
                {upscaledImage && (
                  <>
                    {/* Slider Line */}
                    <div
                      className="absolute top-0 bottom-0 w-1 bg-white shadow-lg cursor-ew-resize z-10"
                      style={{ left: `${comparisonPosition}%` }}
                    >
                      {/* Slider Handle */}
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center border-2 border-gray-300">
                        <div className="flex gap-0.5">
                          <div className="w-0.5 h-4 bg-gray-400"></div>
                          <div className="w-0.5 h-4 bg-gray-400"></div>
                        </div>
                      </div>
                    </div>

                    {/* Labels */}
                    <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                      Original: {uploadedImage.originalDimensions.width} × {uploadedImage.originalDimensions.height}
                    </div>
                    <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                      Upscaled: {upscaledImage.metadata.width} × {upscaledImage.metadata.height}
                    </div>
                  </>
                )}

                {/* Processing Overlay */}
                {isProcessing && (
                  <div className="absolute inset-0 bg-white/90 flex flex-col items-center justify-center gap-3">
                    <div className="animate-spin rounded-full h-10 w-10 border-4 border-purple-600 border-t-transparent"></div>
                    <p className="text-gray-600 text-sm text-center">Processing...</p>
                  </div>
                )}

                {/* No upscaled image yet
                {!upscaledImage && !isProcessing && (
                  // <div className="absolute inset-0 flex items-center justify-center p-4">
                  //   <p className="text-gray-500 text-center">Click &quot;Upscale Image&quot; to process</p>
                  // </div>
                )} */}
              </div>
            </CardContent>
          </Card>

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
      )}

      {uploadError && !uploadedImage && (
        <div className="max-w-2xl mx-auto">
          <Card className="border-red-200">
            <CardContent className="pt-6">
              <p className="text-red-600 text-sm">{uploadError}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <footer className="text-center mt-12 text-gray-500 text-sm">
        <p>No file size limits • Supports JPEG, PNG and WebP</p>
      </footer>
    </div>
  );
}