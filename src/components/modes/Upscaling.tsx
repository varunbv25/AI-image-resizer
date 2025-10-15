/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @next/next/no-img-element */
'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { ImageUploader } from '@/components/ImageUploader';
import { ProcessingStatus } from '@/components/ProcessingStatus';
import { BatchProcessor, BatchItem } from '@/components/BatchProcessor';
import { useFileUpload } from '@/hooks/useFileUpload';
import { useUpscaling } from '@/hooks/useUpscaling';
import { ImageDimensions } from '@/types';
import { Download, RotateCcw, Maximize, Settings, Info, Check, Clock, AlertCircle } from 'lucide-react';
import JSZip from 'jszip';
interface UpscalingProps {
  onBack: () => void;
}

export interface UpscaleSettings {
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

  // Batch processing state
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [totalProcessed, setTotalProcessed] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [batchProcessingStarted, setBatchProcessingStarted] = useState(false);

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
    setIsBatchMode(false);
  };

  const handleBatchImageUpload = async (files: File[]) => {
    setIsBatchMode(true);
    setTotalProcessed(0);
    setBatchProcessingStarted(false);

    // Store uploaded files
    setUploadedFiles(files);

    // Create initial batch items with preview URLs and get dimensions
    const itemsPromises = files.map(async (file, index) => {
      const dimensions = await getImageDimensions(file);
      const settings: UpscaleSettings = {
        method: upscaleSettings.method,
        scaleFactor: upscaleSettings.scaleFactor,
        targetWidth: Math.max(upscaleSettings.targetWidth, dimensions.width),
        targetHeight: Math.max(upscaleSettings.targetHeight, dimensions.height),
        quality: upscaleSettings.quality,
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
    setTotalProcessed(0);

    // Process each file sequentially
    for (let i = 0; i < uploadedFiles.length; i++) {
      const file = uploadedFiles[i];
      const item = batchItems[i];
      const itemId = item.id;

      // Get settings with defaults
      const defaultSettings: UpscaleSettings = {
        method: upscaleSettings.method,
        scaleFactor: upscaleSettings.scaleFactor,
        targetWidth: upscaleSettings.targetWidth,
        targetHeight: upscaleSettings.targetHeight,
        quality: upscaleSettings.quality,
      };
      const settings = (item.settings as unknown as UpscaleSettings) || defaultSettings;

      // Update status to processing
      setBatchItems(prev => prev.map(item =>
        item.id === itemId ? { ...item, status: 'processing' as const } : item
      ));

      try {
        // Read file as base64
        const base64 = await fileToBase64(file);

        // Get image dimensions
        const dimensions = item.originalDimensions || await getImageDimensions(file);

        // Calculate target dimensions using item settings
        let targetWidth: number;
        let targetHeight: number;

        if (settings.method === 'scale') {
          targetWidth = Math.round(dimensions.width * settings.scaleFactor);
          targetHeight = Math.round(dimensions.height * settings.scaleFactor);
        } else {
          targetWidth = Math.max(settings.targetWidth, dimensions.width);
          targetHeight = Math.max(settings.targetHeight, dimensions.height);
        }

        // Upscale image
        const response = await fetch('/api/upscale', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            imageData: base64,
            targetDimensions: { width: targetWidth, height: targetHeight },
            quality: Math.round(settings.quality * 100),
            format: 'jpeg',
          }),
        });

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || 'Upscaling failed');
        }

        // Create data URL with proper MIME type for SVG
        const mimeType = result.data.metadata.format === 'svg' ? 'image/svg+xml' : `image/${result.data.metadata.format}`;
        const dataUrl = `data:${mimeType};base64,${result.data.imageData}`;

        // Update item with success
        setBatchItems(prev => prev.map(item =>
          item.id === itemId
            ? {
                ...item,
                status: 'completed' as const,
                processedSize: result.data.metadata.size,
                processedData: dataUrl,
              }
            : item
        ));

        setTotalProcessed(prev => prev + 1);
      } catch (error) {
        // Update item with error
        setBatchItems(prev => prev.map(item =>
          item.id === itemId
            ? {
                ...item,
                status: 'error' as const,
                error: error instanceof Error ? error.message : 'Upscaling failed',
              }
            : item
        ));

        setTotalProcessed(prev => prev + 1);
      }
    }
  };

  const processSingleImage = async (id: string) => {
    const itemIndex = batchItems.findIndex(item => item.id === id);
    if (itemIndex === -1) return;

    const file = uploadedFiles[itemIndex];
    const item = batchItems[itemIndex];

    // Get settings with defaults
    const defaultSettings: UpscaleSettings = {
      method: upscaleSettings.method,
      scaleFactor: upscaleSettings.scaleFactor,
      targetWidth: upscaleSettings.targetWidth,
      targetHeight: upscaleSettings.targetHeight,
      quality: upscaleSettings.quality,
    };
    const settings = (item.settings as unknown as UpscaleSettings) || defaultSettings;

    // Update status to processing
    setBatchItems(prev => prev.map(item =>
      item.id === id ? { ...item, status: 'processing' as const } : item
    ));

    try {
      // Read file as base64
      const base64 = await fileToBase64(file);

      // Get image dimensions
      const dimensions = item.originalDimensions || await getImageDimensions(file);

      // Calculate target dimensions using per-image settings
      let targetWidth: number;
      let targetHeight: number;

      if (settings.method === 'scale') {
        targetWidth = Math.round(dimensions.width * settings.scaleFactor);
        targetHeight = Math.round(dimensions.height * settings.scaleFactor);
      } else {
        targetWidth = Math.max(settings.targetWidth, dimensions.width);
        targetHeight = Math.max(settings.targetHeight, dimensions.height);
      }

      // Upscale image
      const response = await fetch('/api/upscale', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageData: base64,
          targetDimensions: { width: targetWidth, height: targetHeight },
          quality: Math.round(settings.quality * 100),
          format: 'jpeg',
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Upscaling failed');
      }

      // Create data URL with proper MIME type for SVG
      const mimeType = result.data.metadata.format === 'svg' ? 'image/svg+xml' : `image/${result.data.metadata.format}`;
      const dataUrl = `data:${mimeType};base64,${result.data.imageData}`;

      // Update item with success
      setBatchItems(prev => prev.map(item =>
        item.id === id
          ? {
              ...item,
              status: 'completed' as const,
              processedSize: result.data.metadata.size,
              processedData: dataUrl,
            }
          : item
      ));

      setTotalProcessed(prev => prev + 1);
    } catch (error) {
      // Update item with error
      setBatchItems(prev => prev.map(item =>
        item.id === id
          ? {
              ...item,
              status: 'error' as const,
              error: error instanceof Error ? error.message : 'Upscaling failed',
            }
          : item
      ));

      setTotalProcessed(prev => prev + 1);
    }
  };

  const updateImageSettings = (id: string, newSettings: Partial<UpscaleSettings>) => {
    setBatchItems(prev => prev.map(item => {
      if (item.id === id) {
        const currentSettings = (item.settings as unknown as UpscaleSettings) || {
          method: upscaleSettings.method,
          scaleFactor: upscaleSettings.scaleFactor,
          targetWidth: upscaleSettings.targetWidth,
          targetHeight: upscaleSettings.targetHeight,
          quality: upscaleSettings.quality,
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
    link.download = `upscaled-images-${Date.now()}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadSingle = (id: string) => {
    const item = batchItems.find(item => item.id === id);
    if (!item || !item.processedData) return;

    const link = document.createElement('a');
    link.href = item.processedData;
    link.download = `upscaled-${item.filename}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleReset = () => {
    resetUpload();
    resetUpscaling();
    setIsBatchMode(false);
    setBatchItems([]);
    setTotalProcessed(0);
    setUploadedFiles([]);
    setSelectedImageId(null);
    setBatchProcessingStarted(false);
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

  // Helper function to estimate upscaled file size
  const estimateUpscaledSize = (
    originalWidth: number,
    originalHeight: number,
    originalSize: number,
    targetWidth: number,
    targetHeight: number,
    quality: number
  ): number => {
    // Calculate pixels ratio
    const originalPixels = originalWidth * originalHeight;
    const targetPixels = targetWidth * targetHeight;
    const pixelRatio = targetPixels / originalPixels;

    // Base estimation: scale by pixel ratio
    // JPEG compression typically gives diminishing returns with more pixels
    // Use a logarithmic scale factor to account for this
    const compressionFactor = Math.sqrt(pixelRatio);

    // Quality factor: lower quality = smaller file
    const qualityFactor = quality / 0.9; // Normalize to 90% quality as baseline

    // Estimated size
    const estimatedSize = originalSize * compressionFactor * qualityFactor;

    return Math.round(estimatedSize);
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
          {/* Upscaling Settings Card - Show before processing starts when no image is selected */}
          {!batchProcessingStarted && !selectedImageId && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  Default Upscaling Settings (applies to all images)
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
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Width</label>
                      <input
                        type="number"
                        value={upscaleSettings.targetWidth}
                        onChange={(e) => {
                          const value = parseInt(e.target.value) || 0;
                          setUpscaleSettings(prev => ({
                            ...prev,
                            targetWidth: Math.max(value, 100)
                          }));
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Height</label>
                      <input
                        type="number"
                        value={upscaleSettings.targetHeight}
                        onChange={(e) => {
                          const value = parseInt(e.target.value) || 0;
                          setUpscaleSettings(prev => ({
                            ...prev,
                            targetHeight: Math.max(value, 100)
                          }));
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      />
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
                      step={0.01}
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
          )}

          {/* Instructions Banner */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-900">
                  <strong>How to use:</strong> Click any image below to customize its upscaling settings, then click &quot;Process This Image&quot;. Or click &quot;Process All Images&quot; to use default settings for all pending images.
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
                            ? 'border-purple-500 bg-purple-50'
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
                              {item.originalDimensions?.width} × {item.originalDimensions?.height}
                            </p>
                            <div className="flex items-center gap-1 mt-1">
                              {item.status === 'pending' && <Clock className="w-3 h-3 text-gray-400" />}
                              {item.status === 'processing' && (
                                <div className="animate-spin rounded-full h-3 w-3 border-2 border-purple-500 border-t-transparent" />
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
                        className="w-full bg-purple-600 hover:bg-purple-700"
                      >
                        <Maximize className="h-4 w-4 mr-2" />
                        Process All Images ({batchItems.filter(i => i.status === 'pending').length})
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

                const itemSettings = selectedItem.settings as unknown as UpscaleSettings;

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
                      <CardTitle className="flex items-center gap-2">
                        <Settings className="w-4 h-4" />
                        Individual Settings
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Method</label>
                        <div className="flex gap-2">
                          <Button
                            variant={itemSettings.method === 'scale' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => updateImageSettings(selectedImageId, { method: 'scale' })}
                            className="flex-1"
                          >
                            Scale Factor
                          </Button>
                          <Button
                            variant={itemSettings.method === 'resolution' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => updateImageSettings(selectedImageId, { method: 'resolution' })}
                            className="flex-1"
                          >
                            Target Resolution
                          </Button>
                        </div>
                      </div>

                      {itemSettings.method === 'scale' ? (
                        <div>
                          <label className="block text-sm font-medium mb-2">
                            Scale Factor: {itemSettings.scaleFactor}x
                          </label>
                          <Slider
                            value={[itemSettings.scaleFactor]}
                            onValueChange={(value) =>
                              updateImageSettings(selectedImageId, { scaleFactor: value[0] })
                            }
                            min={1.1}
                            max={4}
                            step={0.1}
                            className="w-full"
                          />
                          <div className="flex justify-between text-xs text-gray-500 mt-1">
                            <span>1.1x</span>
                            <span>4x</span>
                          </div>
                          {selectedItem.originalDimensions && (() => {
                            const outputWidth = Math.round(selectedItem.originalDimensions.width * itemSettings.scaleFactor);
                            const outputHeight = Math.round(selectedItem.originalDimensions.height * itemSettings.scaleFactor);
                            const estimatedSize = estimateUpscaledSize(
                              selectedItem.originalDimensions.width,
                              selectedItem.originalDimensions.height,
                              selectedItem.originalSize,
                              outputWidth,
                              outputHeight,
                              itemSettings.quality
                            );
                            return (
                              <p className="text-sm text-gray-600 mt-2">
                                Output: {outputWidth} × {outputHeight} • ~{Math.round(estimatedSize / 1024)} KB
                              </p>
                            );
                          })()}
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium mb-1">Width</label>
                            <input
                              type="number"
                              value={itemSettings.targetWidth}
                              min={selectedItem.originalDimensions?.width || 0}
                              onChange={(e) => {
                                const value = parseInt(e.target.value) || 0;
                                const minWidth = selectedItem.originalDimensions?.width || 0;
                                updateImageSettings(selectedImageId, {
                                  targetWidth: Math.max(value, minWidth)
                                });
                              }}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md"
                            />
                            {selectedItem.originalDimensions && (
                              <p className="text-xs text-gray-500 mt-1">
                                Min: {selectedItem.originalDimensions.width}px
                              </p>
                            )}
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1">Height</label>
                            <input
                              type="number"
                              value={itemSettings.targetHeight}
                              min={selectedItem.originalDimensions?.height || 0}
                              onChange={(e) => {
                                const value = parseInt(e.target.value) || 0;
                                const minHeight = selectedItem.originalDimensions?.height || 0;
                                updateImageSettings(selectedImageId, {
                                  targetHeight: Math.max(value, minHeight)
                                });
                              }}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md"
                            />
                            {selectedItem.originalDimensions && (
                              <p className="text-xs text-gray-500 mt-1">
                                Min: {selectedItem.originalDimensions.height}px
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Quality: {Math.round(itemSettings.quality * 100)}%
                        </label>
                        <Slider
                          value={[itemSettings.quality]}
                          onValueChange={(value) =>
                            updateImageSettings(selectedImageId, { quality: value[0] })
                          }
                          min={0.5}
                          max={1}
                          step={0.01}
                          className="w-full"
                        />
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                          <span>50%</span>
                          <span>100%</span>
                        </div>
                      </div>

                      {/* Process This Image Button */}
                      {selectedItem.status === 'pending' && (
                        <Button
                          onClick={() => processSingleImage(selectedImageId)}
                          className="w-full bg-purple-600 hover:bg-purple-700"
                        >
                          Process This Image
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
                    <Maximize className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">Select an image from the list to configure and process it</p>
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
                  {uploadedImage?.filename}
                </p>
                <p className="text-xs text-gray-500">
                  {uploadedImage?.originalDimensions.width} × {uploadedImage?.originalDimensions.height} •{' '}
                  {Math.round((uploadedImage?.size || 0) / 1024)} KB
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
                      {uploadedImage && (() => {
                        const outputWidth = Math.round((uploadedImage?.originalDimensions.width || 0) * upscaleSettings.scaleFactor);
                        const outputHeight = Math.round((uploadedImage?.originalDimensions.height || 0) * upscaleSettings.scaleFactor);
                        const estimatedSize = estimateUpscaledSize(
                          uploadedImage.originalDimensions.width,
                          uploadedImage.originalDimensions.height,
                          uploadedImage.size,
                          outputWidth,
                          outputHeight,
                          upscaleSettings.quality
                        );
                        return (
                          <p className="text-sm text-gray-600 mt-2">
                            Output: {outputWidth} × {outputHeight}
                          </p>
                        );
                      })()}
                    </div>
                  ) : (
                    <>
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
                              Min: {uploadedImage?.originalDimensions.width}px
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
                              Min: {uploadedImage?.originalDimensions.height}px
                            </p>
                          )}
                        </div>
                      </div>
                      {uploadedImage && (() => {
                        const estimatedSize = estimateUpscaledSize(
                          uploadedImage.originalDimensions.width,
                          uploadedImage.originalDimensions.height,
                          uploadedImage.size,
                          upscaleSettings.targetWidth,
                          upscaleSettings.targetHeight,
                          upscaleSettings.quality
                        );
                        return (
                          <p className="text-sm text-gray-600 mt-2">
                            Output: {upscaleSettings.targetWidth} × {upscaleSettings.targetHeight} • ~{Math.round(estimatedSize / 1024)} KB
                          </p>
                        );
                      })()}
                    </>
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
                {upscaledImage && (() => {
                  const mimeType = upscaledImage.metadata.format === 'svg' ? 'image/svg+xml' : `image/${upscaledImage.metadata.format}`;
                  return (
                    <img
                      src={`data:${mimeType};base64,${upscaledImage.imageData}`}
                      alt="Upscaled"
                      className="absolute inset-0 w-full h-full object-contain"
                    />
                  );
                })()}

                {/* Original Image (clipped layer) */}
                <div
                  className="absolute inset-0"
                  style={{
                    clipPath: upscaledImage
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
                    {uploadedImage && (
                      <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                        Original: {uploadedImage.originalDimensions.width} × {uploadedImage.originalDimensions.height}
                      </div>
                    )}
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
                    {uploadedImage && uploadedImage.originalDimensions.width ?
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
        <p>No file size limits • Supports JPEG, PNG, WebP and SVG</p>
      </footer>
    </div>
  );
}