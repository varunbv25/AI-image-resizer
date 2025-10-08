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
  const [maxFileSize, setMaxFileSize] = useState<number>(40); // percentage of original
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressedImage, setCompressedImage] = useState<{
    imageData: string;
    size: number;
    compressionRatio: number;
  } | null>(null);
  const [compressionError, setCompressionError] = useState<string>('');
  const [isSliderHovered, setIsSliderHovered] = useState(false);
  const sliderRef = useRef<HTMLDivElement>(null);

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
          maxFileSizePercent: maxFileSize,
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
      const newValue = Math.max(10, Math.min(100, maxFileSize + delta));
      setMaxFileSize(newValue);
    };

    if (isSliderHovered) {
      sliderElement.addEventListener('wheel', handleWheel, { passive: false });
    }

    return () => {
      sliderElement.removeEventListener('wheel', handleWheel);
    };
  }, [isSliderHovered, maxFileSize]);

  return (
    <div className="container mx-auto px-4 py-8">
      <header className="text-center mb-8">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
            <FileArchive className="w-6 h-6 text-orange-600" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900">
            Image Compression
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
                  {/* Max File Size Slider */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700">
                        Target File Size
                      </label>
                      <span className="text-sm font-semibold bg-gray-100 px-3 py-1 rounded">
                        {maxFileSize}%
                      </span>
                    </div>
                    <div
                      ref={sliderRef}
                      onMouseEnter={() => setIsSliderHovered(true)}
                      onMouseLeave={() => setIsSliderHovered(false)}
                    >
                      <Slider
                        value={[maxFileSize]}
                        onValueChange={(value) => setMaxFileSize(value[0])}
                        min={10}
                        max={100}
                        step={5}
                        className="w-full"
                      />
                    </div>
                    <p className="text-xs text-gray-500">
                      Target: {(targetSize / 1024).toFixed(2)} KB
                    </p>
                  </div>
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
                <CardTitle>
                  {compressedImage ? 'Compressed Result' : 'Original Image'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative aspect-video bg-gray-100 rounded-lg overflow-hidden mb-4">
                  <img
                    src={
                      compressedImage?.imageData ||
                      `data:${uploadedImage.mimetype};base64,${uploadedImage.imageData}`
                    }
                    alt="Preview"
                    className="w-full h-full object-contain"
                  />
                </div>

                {compressedImage && (
                  <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">Original:</span>
                      <span className="font-semibold">
                        {(uploadedImage.size / (1024 * 1024)).toFixed(2)} MB
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">Compressed:</span>
                      <span className="font-semibold text-orange-600">
                        {(compressedImage.size / 1024).toFixed(2)} KB
                      </span>
                    </div>
                    {/* <div className="pt-2 border-t border-gray-200">
                      <p className="text-xs text-gray-500 text-center">
                        Target: {(targetSize / 1024).toFixed(2)} KB
                      </p>
                    </div> */}
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
