/* eslint-disable @next/next/no-img-element */
'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { ImageUploader } from '@/components/ImageUploader';
import { ProcessingStatus } from '@/components/ProcessingStatus';
import { useFileUpload } from '@/hooks/useFileUpload';
import { Download, RotateCcw, FileArchive } from 'lucide-react';

interface ImageCompressionProps {
  onBack: () => void;
}

export function ImageCompression({}: ImageCompressionProps) {
  const [compressionMode, setCompressionMode] = useState<'quality' | 'filesize'>('quality');
  const [quality, setQuality] = useState<number>(80); // quality percentage (0-100)
  const [maxFileSize, setMaxFileSize] = useState<number>(40); // percentage of original
  const [maxFileSizeKB, setMaxFileSizeKB] = useState<number>(500); // KB
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressedImage, setCompressedImage] = useState<{
    imageData: string;
    size: number;
    compressionRatio: number;
  } | null>(null);
  const [compressionError, setCompressionError] = useState<string>('');
  const [isSliderHovered, setIsSliderHovered] = useState(false);
  const [comparisonPosition, setComparisonPosition] = useState<number>(50);
  const [isComparing, setIsComparing] = useState(false);
  const [imageBounds, setImageBounds] = useState<{ left: number; right: number } | null>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const comparisonRef = useRef<HTMLDivElement>(null);
  const originalImageRef = useRef<HTMLImageElement>(null);

  const {
    isUploading,
    uploadedImage,
    error: uploadError,
    uploadFile,
    reset: resetUpload,
  } = useFileUpload();

  const handleImageUpload = (file: File) => {
    uploadFile(file);
    setCompressedImage(null);
    setCompressionError('');
  };

  // Update maxFileSizeKB when image is uploaded
  useEffect(() => {
    if (uploadedImage) {
      const imageSizeKB = Math.round(uploadedImage.size / 1024);
      // Set default to 80% of original size
      setMaxFileSizeKB(Math.round(imageSizeKB * 0.8));
    }
  }, [uploadedImage]);

  // Calculate image bounds when compressed image changes
  useEffect(() => {
    if (!compressedImage || !comparisonRef.current || !uploadedImage) {
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
  }, [compressedImage, uploadedImage]);

  // Helper function to constrain position within image bounds
  const constrainPosition = (percentage: number): number => {
    if (!imageBounds) return percentage;
    return Math.max(imageBounds.left, Math.min(imageBounds.right, percentage));
  };

  const handleCompress = async () => {
    if (!uploadedImage) return;

    setIsCompressing(true);
    setCompressionError('');

    try {
      const response = await fetch('/api/compress-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageData: uploadedImage.imageData,
          maxFileSizePercent: compressionMode === 'quality' ? maxFileSize : undefined,
          maxFileSizeKB: compressionMode === 'filesize' ? maxFileSizeKB : undefined,
          quality: compressionMode === 'quality' ? quality : undefined,
          originalSize: uploadedImage.size,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Compression failed');
      }

      setCompressedImage({
        imageData: result.data.imageData,
        size: result.data.size,
        compressionRatio: result.data.compressionRatio,
      });
    } catch (error) {
      setCompressionError(
        error instanceof Error ? error.message : 'Compression failed'
      );
    } finally {
      setIsCompressing(false);
    }
  };

  const handleDownload = () => {
    if (!compressedImage) return;

    const link = document.createElement('a');
    link.href = compressedImage.imageData;
    link.download = `compressed-${uploadedImage?.filename || 'image.jpg'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleReset = () => {
    resetUpload();
    setCompressedImage(null);
    setCompressionError('');
    setMaxFileSize(40);
    setQuality(80);
    setMaxFileSizeKB(500);
    setCompressionMode('quality');
    setComparisonPosition(50);
  };

  const targetSize = uploadedImage
    ? Math.round((uploadedImage.size * maxFileSize) / 100)
    : 0;

  useEffect(() => {
    const sliderElement = sliderRef.current;
    if (!sliderElement) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const delta = e.deltaY > 0 ? -5 : 5; // Scroll down = decrease, scroll up = increase

      if (compressionMode === 'quality') {
        const newValue = Math.max(1, Math.min(100, quality + delta));
        setQuality(newValue);
      } else {
        const maxSize = uploadedImage ? Math.round(uploadedImage.size / 1024) : 5000;
        const newValue = Math.max(50, Math.min(maxSize, maxFileSizeKB + delta * 10));
        setMaxFileSizeKB(newValue);
      }
    };

    if (isSliderHovered) {
      sliderElement.addEventListener('wheel', handleWheel, { passive: false });
    }

    return () => {
      sliderElement.removeEventListener('wheel', handleWheel);
    };
  }, [isSliderHovered, quality, maxFileSizeKB, compressionMode, uploadedImage]);

  return (
    <div className="container mx-auto px-4 py-8">
      <header className="text-center mb-8">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
            <FileArchive className="w-6 h-6 text-orange-600" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900">
            Compression
          </h1>
        </div>
        <p className="text-lg text-gray-600">
          Reduce file size while maintaining image quality
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
                    <Button variant="outline" size="sm" onClick={handleReset}>
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Reset
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600">{uploadedImage.filename}</p>
                  <p className="text-xs text-gray-500">
                    {uploadedImage.originalDimensions.width} × {uploadedImage.originalDimensions.height} •{' '}
                    {(uploadedImage.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </CardContent>
              </Card>

            <Card>
                <CardHeader>
                  <CardTitle>Compression Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Mode Toggle */}
                  <div className="space-y-3">
                    <label className="text-sm font-medium text-gray-700">
                      Compression Mode
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant={compressionMode === 'quality' ? 'default' : 'outline'}
                        onClick={() => setCompressionMode('quality')}
                        className="w-full"
                      >
                        Quality
                      </Button>
                      <Button
                        type="button"
                        variant={compressionMode === 'filesize' ? 'default' : 'outline'}
                        onClick={() => setCompressionMode('filesize')}
                        className="w-full"
                      >
                        Max File Size
                      </Button>
                    </div>
                  </div>

                  {/* Quality Slider (when quality mode is selected) */}
                  {compressionMode === 'quality' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-gray-700">
                          Quality
                        </label>
                        <span className="text-sm font-semibold bg-gray-100 px-3 py-1 rounded">
                          {quality}%
                        </span>
                      </div>
                      <div
                        ref={sliderRef}
                        onMouseEnter={() => setIsSliderHovered(true)}
                        onMouseLeave={() => setIsSliderHovered(false)}
                      >
                        <Slider
                          value={[quality]}
                          onValueChange={(value) => setQuality(value[0])}
                          min={1}
                          max={100}
                          step={1}
                          className="w-full"
                        />
                      </div>
                      <p className="text-xs text-gray-500 text-center">
                        {100 - quality}% compression
                      </p>
                    </div>
                  )}

                  {/* Max File Size Slider (when filesize mode is selected) */}
                  {compressionMode === 'filesize' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-gray-700">
                          Max Target Size (KB)
                        </label>
                        <span className="text-sm font-semibold bg-gray-100 px-3 py-1 rounded">
                          {maxFileSizeKB} KB
                        </span>
                      </div>
                      <div
                        ref={sliderRef}
                        onMouseEnter={() => setIsSliderHovered(true)}
                        onMouseLeave={() => setIsSliderHovered(false)}
                      >
                        <Slider
                          value={[maxFileSizeKB]}
                          onValueChange={(value) => setMaxFileSizeKB(value[0])}
                          min={50}
                          max={uploadedImage ? Math.round(uploadedImage.size / 1024) : 5000}
                          step={50}
                          className="w-full"
                        />
                      </div>
                      <p className="text-xs text-gray-500 text-center">
                        {uploadedImage && maxFileSizeKB < (uploadedImage.size / 1024)
                          ? `${Math.round((1 - (maxFileSizeKB / (uploadedImage.size / 1024))) * 100)}% compression`
                          : 'No compression needed'}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

            <Button
              onClick={handleCompress}
              disabled={isCompressing}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white"
              size="lg"
            >
              {isCompressing ? 'Compressing...' : 'Apply Compression'}
            </Button>

            {compressedImage && (
              <Button
                onClick={handleDownload}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2"
                size="lg"
              >
                <Download className="h-5 w-5" />
                Download Image
              </Button>
            )}

            {(uploadError || compressionError) && (
              <Card className="border-red-200">
                <CardContent className="pt-6">
                  <p className="text-red-600 text-sm">{uploadError || compressionError}</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Half - Preview and Stats */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {compressedImage ? 'Comparison View' : 'Original Image'}
                  {compressedImage && (
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
                    if (!compressedImage) return;
                    setIsComparing(true);
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const percentage = (x / rect.width) * 100;
                    setComparisonPosition(constrainPosition(percentage));
                  }}
                  onMouseMove={(e) => {
                    if (!isComparing || !compressedImage) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const percentage = (x / rect.width) * 100;
                    setComparisonPosition(constrainPosition(percentage));
                  }}
                  onMouseUp={() => setIsComparing(false)}
                  onMouseLeave={() => setIsComparing(false)}
                  onTouchStart={(e) => {
                    if (!compressedImage) return;
                    setIsComparing(true);
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.touches[0].clientX - rect.left;
                    const percentage = (x / rect.width) * 100;
                    setComparisonPosition(constrainPosition(percentage));
                  }}
                  onTouchMove={(e) => {
                    if (!isComparing || !compressedImage) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.touches[0].clientX - rect.left;
                    const percentage = (x / rect.width) * 100;
                    setComparisonPosition(constrainPosition(percentage));
                  }}
                  onTouchEnd={() => setIsComparing(false)}
                >
                  {/* Compressed Image (base layer) */}
                  {compressedImage && (
                    <img
                      src={compressedImage.imageData}
                      alt="Compressed"
                      className="absolute inset-0 w-full h-full object-contain"
                    />
                  )}

                  {/* Original Image (clipped layer) */}
                  <div
                    className="absolute inset-0"
                    style={{
                      clipPath: compressedImage
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
                  {compressedImage && (
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
                        Original: {(uploadedImage.size / 1024).toFixed(2)} KB
                      </div>
                      <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                        Compressed: {(compressedImage.size / 1024).toFixed(2)} KB (-{Math.round((1 - compressedImage.size / uploadedImage.size) * 100)}%)
                      </div>
                    </>
                  )}
                </div>

                {compressedImage && (
                  <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">Original:</span>
                      <span className="font-semibold">
                        {(uploadedImage.size / 1024).toFixed(2)} KB
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">Compressed:</span>
                      <span className="font-semibold text-orange-600">
                        {(compressedImage.size / 1024).toFixed(2)} KB (-{Math.round((1 - compressedImage.size / uploadedImage.size) * 100)}%)
                      </span>
                    </div>
                    <div className="pt-2 border-t border-gray-200">
                      <p className="text-sm font-semibold text-center text-green-600">
                        {Math.round((1 - compressedImage.size / uploadedImage.size) * 100)}% size reduction
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {isCompressing && (
              <ProcessingStatus
                status={{
                  stage: 'optimizing',
                  progress: 50,
                  message: 'Compressing image...',
                }}
              />
            )}
          </div>
        </div>
      )}

      {(uploadError || compressionError) && !uploadedImage && (
        <div className="max-w-2xl mx-auto">
          <Card className="border-red-200">
            <CardContent className="pt-6">
              <p className="text-red-600 text-sm">{uploadError || compressionError}</p>
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
