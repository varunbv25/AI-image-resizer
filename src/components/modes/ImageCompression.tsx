/* eslint-disable @next/next/no-img-element */
'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { ImageUploader } from '@/components/ImageUploader';
import { ProcessingStatus } from '@/components/ProcessingStatus';
import { BatchItem } from '@/components/BatchProcessor';
import { useFileUpload } from '@/hooks/useFileUpload';
import { Download, RotateCcw, FileArchive, Info, Check, Clock, AlertCircle } from 'lucide-react';
import JSZip from 'jszip';
import { safeJsonParse } from '@/lib/safeJsonParse';

interface ImageCompressionProps {
  onBack: () => void;
}

interface CompressionSettings {
  compressionMode: 'quality' | 'filesize';
  quality: number;
  maxFileSize: number;
  maxFileSizeKB: number;
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

  // Batch processing state
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [batchProcessingStarted, setBatchProcessingStarted] = useState(false);

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
    setIsBatchMode(false);
  };

  const getImageDimensions = (file: File): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
        URL.revokeObjectURL(url);
      };
      img.onerror = reject;
      img.src = url;
    });
  };

  const handleBatchImageUpload = async (files: File[]) => {
    setIsBatchMode(true);
    setBatchProcessingStarted(false);

    // Store uploaded files
    setUploadedFiles(files);

    // Create initial batch items with preview URLs and get dimensions
    const itemsPromises = files.map(async (file, index) => {
      const dimensions = await getImageDimensions(file);
      const settings: CompressionSettings = {
        compressionMode: compressionMode,
        quality: quality,
        maxFileSize: maxFileSize,
        maxFileSizeKB: Math.round((file.size / 1024) * 0.8), // Default to 80% of original
      };
      return {
        id: `${Date.now()}-${index}`,
        filename: file.name,
        status: 'pending' as const,
        originalSize: file.size,
        previewUrl: URL.createObjectURL(file),
        originalDimensions: dimensions,
        settings: settings as unknown as Record<string, unknown>,
      };
    });

    const items = await Promise.all(itemsPromises);
    setBatchItems(items);
  };

  const processAllImages = async () => {
    setBatchProcessingStarted(true);

    // Process each file sequentially
    for (let i = 0; i < uploadedFiles.length; i++) {
      const file = uploadedFiles[i];
      const item = batchItems[i];
      const itemId = item.id;

      // Get settings with defaults
      const defaultSettings: CompressionSettings = {
        compressionMode,
        quality,
        maxFileSize,
        maxFileSizeKB
      };
      const settings = (item.settings as unknown as CompressionSettings) || defaultSettings;

      // Update status to processing
      setBatchItems(prev => prev.map(item =>
        item.id === itemId ? { ...item, status: 'processing' as const } : item
      ));

      try {
        // Read file as base64
        const base64 = await fileToBase64(file);

        // Compress image
        const response = await fetch('/api/compress-image', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            imageData: base64,
            maxFileSizePercent: settings.compressionMode === 'quality' ? settings.maxFileSize : undefined,
            maxFileSizeKB: settings.compressionMode === 'filesize' ? settings.maxFileSizeKB : undefined,
            quality: settings.compressionMode === 'quality' ? settings.quality : undefined,
            originalSize: file.size,
          }),
        });

        const result = await safeJsonParse(response);

        if (!result.success) {
          throw new Error(result.error || 'Compression failed');
        }

        // Update item with success
        setBatchItems(prev => prev.map(item =>
          item.id === itemId
            ? {
                ...item,
                status: 'completed' as const,
                processedSize: result.data.size,
                processedData: result.data.imageData,
              }
            : item
        ));
      } catch (error) {
        // Update item with error
        setBatchItems(prev => prev.map(item =>
          item.id === itemId
            ? {
                ...item,
                status: 'error' as const,
                error: error instanceof Error ? error.message : 'Compression failed',
              }
            : item
        ));
      }
    }
  };

  const processSingleImage = async (id: string) => {
    const itemIndex = batchItems.findIndex(item => item.id === id);
    if (itemIndex === -1) return;

    const file = uploadedFiles[itemIndex];
    const item = batchItems[itemIndex];

    // Get settings with defaults
    const defaultSettings: CompressionSettings = {
      compressionMode,
      quality,
      maxFileSize,
      maxFileSizeKB
    };
    const settings = (item.settings as unknown as CompressionSettings) || defaultSettings;

    // Update status to processing
    setBatchItems(prev => prev.map(item =>
      item.id === id ? { ...item, status: 'processing' as const } : item
    ));

    try {
      // Read file as base64
      const base64 = await fileToBase64(file);

      // Compress image
      const response = await fetch('/api/compress-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageData: base64,
          maxFileSizePercent: settings.compressionMode === 'quality' ? settings.maxFileSize : undefined,
          maxFileSizeKB: settings.compressionMode === 'filesize' ? settings.maxFileSizeKB : undefined,
          quality: settings.compressionMode === 'quality' ? settings.quality : undefined,
          originalSize: file.size,
        }),
      });

      const result = await safeJsonParse(response);

      if (!result.success) {
        throw new Error(result.error || 'Compression failed');
      }

      // Update item with success
      setBatchItems(prev => prev.map(item =>
        item.id === id
          ? {
              ...item,
              status: 'completed' as const,
              processedSize: result.data.size,
              processedData: result.data.imageData,
            }
          : item
      ));
    } catch (error) {
      // Update item with error
      setBatchItems(prev => prev.map(item =>
        item.id === id
          ? {
              ...item,
              status: 'error' as const,
              error: error instanceof Error ? error.message : 'Compression failed',
            }
          : item
      ));
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
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

  const updateImageSettings = (id: string, newSettings: Partial<CompressionSettings>) => {
    setBatchItems(prev => prev.map(item => {
      if (item.id === id) {
        const currentSettings = (item.settings as unknown as CompressionSettings) || {
          compressionMode,
          quality,
          maxFileSize,
          maxFileSizeKB
        };
        return {
          ...item,
          settings: {
            ...currentSettings,
            ...newSettings,
          } as unknown as Record<string, unknown>,
        };
      }
      return item;
    }));
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

      const result = await safeJsonParse(response);

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
    setIsBatchMode(false);
    setBatchItems([]);
    setUploadedFiles([]);
    setSelectedImageId(null);
    setBatchProcessingStarted(false);
  };

  const handleDownloadAll = async () => {
    const completedItems = batchItems.filter(item => item.status === 'completed' && item.processedData);

    if (completedItems.length === 0) return;

    const zip = new JSZip();

    completedItems.forEach((item) => {
      const base64Data = item.processedData!.replace(/^data:image\/\w+;base64,/, '');
      zip.file(item.filename, base64Data, { base64: true });
    });

    const content = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `compressed-images-${Date.now()}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadSingle = (id: string) => {
    const item = batchItems.find(item => item.id === id);
    if (!item || !item.processedData) return;

    const link = document.createElement('a');
    link.href = item.processedData;
    link.download = `compressed-${item.filename}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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

      {!uploadedImage && !isBatchMode ? (
        <div className="max-w-2xl mx-auto">
          <ImageUploader
            onImageUpload={handleImageUpload}
            onBatchImageUpload={handleBatchImageUpload}
            isUploading={isUploading}
            supportsBatch={true}
          />
        </div>
      ) : isBatchMode ? (
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Default Compression Settings - Show when no image is selected */}
          {!batchProcessingStarted && !selectedImageId && (
            <Card>
              <CardHeader>
                <CardTitle>Default Compression Settings (applies to all images)</CardTitle>
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

                {/* Quality Slider */}
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
                    <Slider
                      value={[quality]}
                      onValueChange={(value) => setQuality(value[0])}
                      min={1}
                      max={100}
                      step={1}
                      className="w-full"
                    />
                    <p className="text-xs text-gray-500 text-center">
                      {100 - quality}% compression
                    </p>
                  </div>
                )}

                {/* Max File Size Slider */}
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
                    <Slider
                      value={[maxFileSizeKB]}
                      onValueChange={(value) => setMaxFileSizeKB(value[0])}
                      min={50}
                      max={5000}
                      step={50}
                      className="w-full"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Instructions Banner */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-900">
                  <strong>How to use:</strong> Click any image below to customize its compression settings, then click &quot;Compress This Image&quot;. Or click &quot;Compress All Images&quot; to use default settings for all pending images.
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Grid Layout: Sidebar and Main Content */}
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Sidebar - Image List */}
            <div className="lg:col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Images ({batchItems.length})</span>
                    <Button variant="outline" size="sm" onClick={handleReset}>
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Reset
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-[600px] overflow-y-auto">
                    {batchItems.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setSelectedImageId(item.id)}
                        className={`w-full p-3 rounded-lg border-2 transition-all ${
                          selectedImageId === item.id
                            ? 'border-orange-500 bg-orange-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <img
                            src={item.previewUrl}
                            alt={item.filename}
                            className="w-16 h-16 object-cover rounded"
                          />
                          <div className="flex-1 text-left">
                            <p className="text-sm font-medium text-gray-900 truncate">{item.filename}</p>
                            <p className="text-xs text-gray-500">
                              {item.originalDimensions?.width} × {item.originalDimensions?.height} • {Math.round(item.originalSize / 1024)} KB
                            </p>
                            <div className="flex items-center gap-1 mt-1">
                              {item.status === 'pending' && <Clock className="w-3 h-3 text-gray-400" />}
                              {item.status === 'processing' && (
                                <div className="animate-spin rounded-full h-3 w-3 border-2 border-orange-500 border-t-transparent" />
                              )}
                              {item.status === 'completed' && <Check className="w-3 h-3 text-green-500" />}
                              {item.status === 'error' && <AlertCircle className="w-3 h-3 text-red-500" />}
                              <span className="text-xs text-gray-600 capitalize">{item.status}</span>
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="mt-4 space-y-2">
                    {!batchProcessingStarted && batchItems.some(i => i.status === 'pending') && (
                      <Button
                        onClick={processAllImages}
                        className="w-full bg-orange-600 hover:bg-orange-700"
                      >
                        <FileArchive className="h-4 w-4 mr-2" />
                        Compress All Images ({batchItems.filter(i => i.status === 'pending').length})
                      </Button>
                    )}
                    {batchItems.some(i => i.status === 'completed') && (
                      <Button
                        onClick={handleDownloadAll}
                        className="w-full bg-green-600 hover:bg-green-700"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download All ({batchItems.filter(i => i.status === 'completed').length})
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Main Content - Selected Image Settings */}
            <div className="lg:col-span-2">
              {selectedImageId && (() => {
                const selectedItem = batchItems.find(item => item.id === selectedImageId);
                if (!selectedItem || !selectedItem.settings) return null;

                const itemSettings = selectedItem.settings as unknown as CompressionSettings;

              return (
                <div className="space-y-4">
                  {/* Image Preview Card */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span className="truncate">{selectedItem.filename}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedImageId(null)}
                        >
                          ✕
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden mb-2">
                        <img
                          src={selectedItem.previewUrl}
                          alt={selectedItem.filename}
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <p className="text-xs text-gray-500">
                        {selectedItem.originalDimensions?.width} × {selectedItem.originalDimensions?.height} •{' '}
                        {Math.round(selectedItem.originalSize / 1024)} KB
                      </p>
                    </CardContent>
                  </Card>

                  {/* Individual Settings Card */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Individual Compression Settings</CardTitle>
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
                            variant={itemSettings.compressionMode === 'quality' ? 'default' : 'outline'}
                            onClick={() => updateImageSettings(selectedImageId, { compressionMode: 'quality' })}
                            className="w-full"
                          >
                            Quality
                          </Button>
                          <Button
                            type="button"
                            variant={itemSettings.compressionMode === 'filesize' ? 'default' : 'outline'}
                            onClick={() => updateImageSettings(selectedImageId, { compressionMode: 'filesize' })}
                            className="w-full"
                          >
                            Max File Size
                          </Button>
                        </div>
                      </div>

                      {/* Quality Slider */}
                      {itemSettings.compressionMode === 'quality' && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-gray-700">
                              Quality
                            </label>
                            <span className="text-sm font-semibold bg-gray-100 px-3 py-1 rounded">
                              {itemSettings.quality}%
                            </span>
                          </div>
                          <Slider
                            value={[itemSettings.quality]}
                            onValueChange={(value) => updateImageSettings(selectedImageId, { quality: value[0] })}
                            min={1}
                            max={100}
                            step={1}
                            className="w-full"
                          />
                          <p className="text-xs text-gray-500 text-center">
                            {100 - itemSettings.quality}% compression
                          </p>
                        </div>
                      )}

                      {/* Max File Size Slider */}
                      {itemSettings.compressionMode === 'filesize' && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-gray-700">
                              Max Target Size (KB)
                            </label>
                            <span className="text-sm font-semibold bg-gray-100 px-3 py-1 rounded">
                              {itemSettings.maxFileSizeKB} KB
                            </span>
                          </div>
                          <Slider
                            value={[itemSettings.maxFileSizeKB]}
                            onValueChange={(value) => updateImageSettings(selectedImageId, { maxFileSizeKB: value[0] })}
                            min={50}
                            max={Math.round(selectedItem.originalSize / 1024)}
                            step={50}
                            className="w-full"
                          />
                          <p className="text-xs text-gray-500 text-center">
                            {itemSettings.maxFileSizeKB < (selectedItem.originalSize / 1024)
                              ? `${Math.round((1 - (itemSettings.maxFileSizeKB / (selectedItem.originalSize / 1024))) * 100)}% compression`
                              : 'No compression needed'}
                          </p>
                        </div>
                      )}

                      {/* Process This Image Button */}
                      {selectedItem.status === 'pending' && (
                        <Button
                          onClick={() => processSingleImage(selectedImageId)}
                          className="w-full bg-orange-600 hover:bg-orange-700"
                        >
                          Compress This Image
                        </Button>
                      )}
                      {selectedItem.status === 'completed' && selectedItem.processedData && (
                        <Button
                          onClick={() => handleDownloadSingle(selectedImageId)}
                          variant="outline"
                          className="w-full"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </Button>
                      )}
                      {selectedItem.status === 'error' && (
                        <div className="bg-red-50 border border-red-200 rounded p-2">
                          <p className="text-xs text-red-600">{selectedItem.error}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              );
              })() || (
                <Card>
                  <CardContent className="py-20 text-center">
                    <FileArchive className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">Select an image from the list to configure and compress it</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
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
                  <p className="text-sm text-gray-600">{uploadedImage?.filename}</p>
                  <p className="text-xs text-gray-500">
                    {uploadedImage?.originalDimensions.width} × {uploadedImage?.originalDimensions.height} •{' '}
                    {((uploadedImage?.size || 0) / (1024 * 1024)).toFixed(2)} MB
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
                    {uploadedImage && (
                      <img
                        ref={originalImageRef}
                        src={`data:${uploadedImage.mimetype};base64,${uploadedImage.imageData}`}
                        alt="Original"
                        className="w-full h-full object-contain"
                      />
                    )}
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
                      {uploadedImage && (
                        <>
                          <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                            Original: {(uploadedImage.size / 1024).toFixed(2)} KB
                          </div>
                          <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                            Compressed: {(compressedImage.size / 1024).toFixed(2)} KB (-{Math.round((1 - compressedImage.size / uploadedImage.size) * 100)}%)
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>

                {compressedImage && uploadedImage && (
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
        <p>No file size limits • Supports JPEG, PNG, WebP and SVG</p>
      </footer>
    </div>
  );
}
