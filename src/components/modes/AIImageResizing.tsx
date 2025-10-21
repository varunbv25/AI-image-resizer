'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ImageUploader } from '@/components/ImageUploader';
import { DimensionSelector } from '@/components/DimensionSelector';
import { ImagePreview } from '@/components/ImagePreview';
import { ProcessingStatus } from '@/components/ProcessingStatus';
import { useFileUpload } from '@/hooks/useFileUpload';
import { useImageProcessing } from '@/hooks/useImageProcessing';
import { ImageDimensions } from '@/types';
import { Download, RotateCcw, Bot, FileArchive, Info, Check, Clock, AlertCircle, X, Edit2 } from 'lucide-react';
import { safeJsonParse } from '@/lib/safeJsonParse';
import JSZip from 'jszip';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { FormatDownloadDialog, ImageFormat } from '@/components/FormatDownloadDialog';
import { UnsupportedFormatError } from '@/components/UnsupportedFormatError';
import { CancelDialog } from '@/components/CancelDialog';

interface AIImageResizingProps {
  onBack: () => void;
  onEditAgain?: (imageData: string, metadata: {filename: string, mimetype: string}) => void;
  preUploadedFiles?: File[];
}

interface BatchResizeItem {
  id: string;
  filename: string;
  originalSize: number;
  previewUrl: string;
  imageData: string;
  originalDimensions: { width: number; height: number };
  targetDimensions: ImageDimensions;
  status: 'pending' | 'processing' | 'completed' | 'error';
  processedData?: string;
  processedSize?: number;
  error?: string;
}

export function AIImageResizing({ onEditAgain, preUploadedFiles }: AIImageResizingProps) {
  const [targetDimensions, setTargetDimensions] = useState<ImageDimensions>({
    width: 1080,
    height: 1920,
  });
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchFiles, setBatchFiles] = useState<File[] | null>(null);

  // Handle batch image upload
  const handleBatchModeActivation = (files: File[]) => {
    setBatchFiles(files);
    setIsBatchMode(true);
  };

  // Auto-detect batch mode from pre-uploaded files
  useEffect(() => {
    if (preUploadedFiles && preUploadedFiles.length > 0) {
      if (preUploadedFiles.length > 1) {
        handleBatchModeActivation(preUploadedFiles);
      } else {
        // For single file, it will be handled by AIImageResizingContent
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render batch mode if enabled
  if (isBatchMode && batchFiles) {
    return <AIImageResizingBatchContent
      initialFiles={batchFiles}
      onBack={() => {
        setIsBatchMode(false);
        setBatchFiles(null);
      }}
    />;
  }

  return <AIImageResizingContent
    targetDimensions={targetDimensions}
    setTargetDimensions={setTargetDimensions}
    setBatchFiles={handleBatchModeActivation}
    preUploadedFile={preUploadedFiles && preUploadedFiles.length === 1 ? preUploadedFiles[0] : undefined}
  />;
}

interface AIImageResizingBatchContentProps {
  initialFiles: File[];
  onBack: () => void;
}

function AIImageResizingBatchContent({ initialFiles }: AIImageResizingBatchContentProps) {
  const [batchItems, setBatchItems] = useState<BatchResizeItem[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [comparisonPosition, setComparisonPosition] = useState(50);
  const [isComparing, setIsComparing] = useState(false);
  const [batchComparisonBounds, setBatchComparisonBounds] = useState<{ left: number; right: number } | null>(null);
  const [showFormatDialog, setShowFormatDialog] = useState(false);
  const [selectedDownloadId, setSelectedDownloadId] = useState<string | null>(null);
  const batchComparisonRef = useRef<HTMLDivElement>(null);

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

  const handleBatchImageUpload = async (files: File[]) => {
    const itemsPromises = files.map(async (file, index) => {
      const dimensions = await getImageDimensions(file);
      const base64 = await fileToBase64(file);
      return {
        id: `${Date.now()}-${index}`,
        filename: file.name,
        originalSize: file.size,
        previewUrl: URL.createObjectURL(file),
        imageData: base64,
        originalDimensions: dimensions,
        targetDimensions: { width: 1080, height: 1920 },
        status: 'pending' as const,
      };
    });

    const items = await Promise.all(itemsPromises);
    setBatchItems(items);
  };

  // Load initial files if provided
  useEffect(() => {
    if (initialFiles && initialFiles.length > 0) {
      handleBatchImageUpload(initialFiles);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFiles]);

  const handleSelectImage = (id: string) => {
    setSelectedImageId(id);
  };

  const constrainBatchPosition = (percentage: number): number => {
    if (!batchComparisonBounds) return percentage;
    return Math.max(batchComparisonBounds.left, Math.min(batchComparisonBounds.right, percentage));
  };

  // Calculate comparison bounds when selected image changes
  useEffect(() => {
    const selectedItem = batchItems.find(item => item.id === selectedImageId);
    if (!selectedItem || !selectedItem.processedData || !batchComparisonRef.current || !selectedItem.originalDimensions) {
      setBatchComparisonBounds(null);
      return;
    }

    const calculateBounds = () => {
      const container = batchComparisonRef.current;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const containerHeight = containerRect.height;

      const imgWidth = selectedItem.targetDimensions.width;
      const imgHeight = selectedItem.targetDimensions.height;

      const containerAspect = containerWidth / containerHeight;
      const imageAspect = imgWidth / imgHeight;

      let leftPercent = 0;
      let rightPercent = 100;

      if (imageAspect > containerAspect) {
        leftPercent = 0;
        rightPercent = 100;
      } else {
        const renderedWidth = containerHeight * imageAspect;
        const emptySpace = (containerWidth - renderedWidth) / 2;
        leftPercent = (emptySpace / containerWidth) * 100;
        rightPercent = ((containerWidth - emptySpace) / containerWidth) * 100;
      }

      const bounds = { left: leftPercent, right: rightPercent };
      setBatchComparisonBounds(bounds);

      const middlePosition = (bounds.left + bounds.right) / 2;
      setComparisonPosition(middlePosition);
    };

    const timeoutId = setTimeout(calculateBounds, 150);
    window.addEventListener('resize', calculateBounds);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', calculateBounds);
    };
  }, [selectedImageId, batchItems]);

  const handleProcessImage = async (id: string) => {
    const item = batchItems.find(i => i.id === id);
    if (!item) return;

    setIsProcessing(true);
    setBatchItems(prev => prev.map(i =>
      i.id === id ? { ...i, status: 'processing' as const } : i
    ));

    try {
      const response = await fetch('/api/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageData: item.imageData,
          targetDimensions: item.targetDimensions,
          quality: 80,
          format: 'jpeg',
          strategy: { type: 'ai' },
        }),
      });

      const result = await safeJsonParse(response);

      if (!result.success) {
        throw new Error(result.error || 'Processing failed');
      }

      const processedMimeType = result.data.metadata.format === 'svg' ? 'image/svg+xml' : `image/${result.data.metadata.format || 'jpeg'}`;

      setBatchItems(prev => prev.map(i =>
        i.id === id
          ? {
              ...i,
              status: 'completed' as const,
              processedData: `data:${processedMimeType};base64,${result.data.imageData}`,
              processedSize: result.data.metadata.size,
            }
          : i
      ));
    } catch (error) {
      setBatchItems(prev => prev.map(i =>
        i.id === id
          ? {
              ...i,
              status: 'error' as const,
              error: error instanceof Error ? error.message : 'Processing failed',
            }
          : i
      ));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleProcessAll = async () => {
    for (const item of batchItems.filter(i => i.status === 'pending')) {
      await handleProcessImage(item.id);
    }
  };

  const handleDownloadAll = async () => {
    const completedItems = batchItems.filter(item => item.status === 'completed' && item.processedData);
    if (completedItems.length === 0) return;

    const zip = new JSZip();
    completedItems.forEach((item) => {
      const base64Data = item.processedData!.replace(/^data:image\/\w+;base64,/, '');
      zip.file(`resized-${item.filename}`, base64Data, { base64: true });
    });

    const content = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `resized-images-${Date.now()}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadSingle = (id: string) => {
    setSelectedDownloadId(id);
    setShowFormatDialog(true);
  };

  const handleFormatDownload = async (format: ImageFormat, quality: number) => {
    const item = batchItems.find(i => i.id === selectedDownloadId);
    if (!item || !item.processedData) return;

    try {
      const base64Data = item.processedData.replace(/^data:image\/\w+;base64,/, '');
      const currentFormat = item.processedData.match(/^data:image\/(\w+);base64,/)?.[1] || 'jpeg';

      // If format matches current format, download directly
      if (format === currentFormat) {
        const link = document.createElement('a');
        link.href = item.processedData;
        link.download = `resized-${item.filename.replace(/\.[^.]+$/, '')}.${format}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      // Convert to different format
      const response = await fetch('/api/convert-format', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageData: base64Data,
          targetFormat: format,
          quality: quality,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Format conversion failed');
      }

      // Download converted image
      const link = document.createElement('a');
      const mimeType = format === 'svg' ? 'image/svg+xml' : `image/${format}`;
      link.href = `data:${mimeType};base64,${result.data.imageData}`;
      link.download = `resized-${item.filename.replace(/\.[^.]+$/, '')}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Download error:', error);
      alert(error instanceof Error ? error.message : 'Download failed');
    } finally {
      setSelectedDownloadId(null);
    }
  };

  const handleReset = () => {
    batchItems.forEach(item => URL.revokeObjectURL(item.previewUrl));
    setBatchItems([]);
    setSelectedImageId(null);
  };

  const selectedItem = selectedImageId ? batchItems.find(i => i.id === selectedImageId) : null;
  const completedCount = batchItems.filter(i => i.status === 'completed').length;
  const pendingCount = batchItems.filter(i => i.status === 'pending').length;

  if (batchItems.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="container mx-auto px-4 py-4"
      >
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-center mb-4"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
              className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center"
            >
              <FileArchive className="w-5 h-5 text-blue-600" />
            </motion.div>
            <h1 className="text-3xl font-bold text-gray-900">Batch Generative Expand</h1>
          </div>
          <p className="text-lg text-gray-600 mb-4">
            Upload multiple images and expand backgrounds using AI generative fill
          </p>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="max-w-2xl mx-auto bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6"
          >
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-left">
                <p className="text-sm text-blue-900 font-medium mb-2">How Batch Generative Expand Works:</p>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Upload multiple images at once</li>
                  <li>• Click on any image in the list to select it</li>
                  <li>• Set custom target dimensions for that specific image</li>
                  <li>• Process each image individually with AI generative background expansion</li>
                  <li>• Or process all images at once with default settings</li>
                  <li>• Download individual images or all as a ZIP file</li>
                </ul>
              </div>
            </div>
          </motion.div>
        </motion.header>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.4 }}
          className="max-w-2xl mx-auto"
        >
          <ImageUploader
            onImageUpload={(file) => handleBatchImageUpload([file])}
            onBatchImageUpload={handleBatchImageUpload}
            isUploading={false}
            supportsBatch={true}
          />
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="container mx-auto px-4 py-4"
    >
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="text-center mb-6"
      >
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Batch Generative Expand</h1>
        <p className="text-sm text-gray-600">
          {selectedImageId
            ? `Customizing individual image • ${completedCount} of ${batchItems.length} completed`
            : `Processing all images • ${completedCount} of ${batchItems.length} completed`
          }
        </p>
      </motion.header>

      {/* Instructions Banner */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="max-w-7xl mx-auto mb-6"
      >
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-900">
                {selectedImageId ? (
                  <>
                    <strong>Individual Processing:</strong> Customize target dimensions for the selected image, then click &quot;Process This Image&quot;. Repeat for each image or click &quot;Process All Images&quot; to use default settings for remaining images.
                  </>
                ) : (
                  <>
                    <strong>Batch Processing:</strong> Click &quot;Process All Images&quot; to use default settings for all images, or click any image to customize its settings individually.
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6"
      >
        {/* Image List */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
          className="lg:col-span-1"
        >
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
                {batchItems.map((item, index) => (
                  <motion.button
                    key={item.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleSelectImage(item.id)}
                    className={`w-full p-3 rounded-lg border-2 transition-all cursor-pointer ${
                      selectedImageId === item.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative w-16 h-16">
                        <Image
                          src={item.previewUrl}
                          alt={item.filename}
                          fill
                          className="object-cover rounded"
                        />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-sm font-medium text-gray-900 break-all">{item.filename}</p>
                        <p className="text-xs text-gray-500">
                          {item.originalDimensions.width} × {item.originalDimensions.height} → {item.targetDimensions.width} × {item.targetDimensions.height}
                        </p>
                        <div className="flex items-center gap-1 mt-1">
                          {item.status === 'pending' && <Clock className="w-3 h-3 text-gray-400" />}
                          {item.status === 'processing' && (
                            <div className="animate-spin rounded-full h-3 w-3 border-2 border-blue-500 border-t-transparent" />
                          )}
                          {item.status === 'completed' && <Check className="w-3 h-3 text-green-500" />}
                          {item.status === 'error' && <AlertCircle className="w-3 h-3 text-red-500" />}
                          <span className="text-xs text-gray-600 capitalize">{item.status}</span>
                        </div>
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>

              <div className="mt-4 space-y-2">
                <AnimatePresence>
                  {pendingCount > 0 && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Button
                        onClick={handleProcessAll}
                        disabled={isProcessing}
                        className="w-full bg-blue-600 hover:bg-blue-700"
                      >
                        <Bot className="h-4 w-4 mr-2" />
                        Process All Images ({pendingCount})
                      </Button>
                    </motion.div>
                  )}
                  {completedCount > 0 && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Button
                        onClick={handleDownloadAll}
                        className="w-full bg-green-600 hover:bg-green-700"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download All ({completedCount})
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Image Editor */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
          className="lg:col-span-2"
        >
          <AnimatePresence mode="wait">
            {selectedItem ? (
              <motion.div
                key={selectedImageId}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3 }}
                className="space-y-2"
              >
                <Card>
                  <CardHeader>
                    <CardTitle>Configure: {selectedItem.filename}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedItem.processedData ? (
                      <div className="space-y-2">
                        <div
                          ref={batchComparisonRef}
                          className="relative aspect-video bg-gray-100 rounded-lg overflow-hidden mb-2 select-none"
                          onMouseDown={(e) => {
                            setIsComparing(true);
                            const rect = e.currentTarget.getBoundingClientRect();
                            const x = e.clientX - rect.left;
                            const percentage = (x / rect.width) * 100;
                            setComparisonPosition(constrainBatchPosition(percentage));
                          }}
                          onMouseMove={(e) => {
                            if (isComparing) {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const x = e.clientX - rect.left;
                              const percentage = (x / rect.width) * 100;
                              setComparisonPosition(constrainBatchPosition(percentage));
                            }
                          }}
                          onMouseUp={() => setIsComparing(false)}
                          onMouseLeave={() => setIsComparing(false)}
                          onTouchStart={(e) => {
                            setIsComparing(true);
                            const rect = e.currentTarget.getBoundingClientRect();
                            const touch = e.touches[0];
                            const x = touch.clientX - rect.left;
                            const percentage = (x / rect.width) * 100;
                            setComparisonPosition(constrainBatchPosition(percentage));
                          }}
                          onTouchMove={(e) => {
                            if (isComparing) {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const touch = e.touches[0];
                              const x = touch.clientX - rect.left;
                              const percentage = (x / rect.width) * 100;
                              setComparisonPosition(constrainBatchPosition(percentage));
                            }
                          }}
                          onTouchEnd={() => setIsComparing(false)}
                        >
                          {/* Processed Image (Background) */}
                          <Image
                            src={selectedItem.processedData}
                            alt="Processed"
                            fill
                            className="object-contain"
                          />

                          {/* Original Image (Clipped) */}
                          <div
                            className="absolute inset-0 overflow-hidden"
                            style={{ clipPath: `inset(0 ${100 - comparisonPosition}% 0 0)` }}
                          >
                            <Image
                              src={selectedItem.previewUrl}
                              alt="Original"
                              fill
                              className="object-contain"
                            />
                          </div>

                          {/* Comparison Slider Line */}
                          <div
                            className="absolute top-0 bottom-0 w-1 bg-white shadow-lg cursor-ew-resize"
                            style={{ left: `${comparisonPosition}%` }}
                          >
                            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center">
                              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-gray-600">
                                <path d="M6 3L2 8L6 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M10 3L14 8L10 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </div>
                          </div>

                          {/* Labels */}
                          <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded pointer-events-none">
                            Original: {selectedItem.originalDimensions.width} × {selectedItem.originalDimensions.height}
                          </div>
                          <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded pointer-events-none">
                            Processed: {selectedItem.targetDimensions.width} × {selectedItem.targetDimensions.height}
                          </div>
                        </div>
                        <p className="text-xs text-center text-gray-500">Drag the slider to compare original and processed images</p>
                      </div>
                    ) : (
                      <div className="relative aspect-video bg-gray-100 rounded-lg overflow-hidden mb-4">
                        <Image
                          src={selectedItem.previewUrl}
                          alt="Original"
                          fill
                          className="object-contain"
                        />
                        <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                          {selectedItem.originalDimensions.width} × {selectedItem.originalDimensions.height}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div className="grid grid-cols-2 gap-4">
                  <DimensionSelector
                    originalDimensions={selectedItem.originalDimensions}
                    targetDimensions={selectedItem.targetDimensions}
                    onDimensionsChange={(dims) => {
                      setBatchItems(prev => prev.map(i =>
                        i.id === selectedImageId ? { ...i, targetDimensions: dims } : i
                      ));
                    }}
                    showAIMessage={true}
                  />

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Actions</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <Button
                        onClick={() => handleProcessImage(selectedItem.id)}
                        disabled={isProcessing || selectedItem.status === 'completed' || selectedItem.status === 'processing'}
                        className="w-full bg-blue-600 hover:bg-blue-700"
                      >
                        <Bot className="h-4 w-4 mr-2" />
                        {selectedItem.status === 'completed' ? 'Processed ✓' : 'Process This Image'}
                      </Button>
                      <AnimatePresence>
                        {selectedItem.status === 'completed' && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.2 }}
                          >
                            <Button
                              onClick={() => handleDownloadSingle(selectedItem.id)}
                              variant="outline"
                              className="w-full"
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Download
                            </Button>
                          </motion.div>
                        )}
                        {selectedItem.status === 'error' && (
                          <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            transition={{ duration: 0.2 }}
                            className="bg-red-50 border border-red-200 rounded p-2"
                          >
                            <p className="text-xs text-red-600">{selectedItem.error}</p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </CardContent>
                  </Card>
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="space-y-2"
              >
                <Card>
                  <CardHeader>
                    <CardTitle>Global Settings for All Images</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col items-center justify-center py-8 mb-4">
                      <Bot className="w-16 h-16 text-blue-400 mb-4" />
                      <p className="text-gray-600 text-center mb-2">
                        Process all {batchItems.length} images with the same dimensions
                      </p>
                      <p className="text-sm text-gray-500 text-center">
                        Or click any image to customize individually
                      </p>
                    </div>
                    <DimensionSelector
                      originalDimensions={{ width: 1080, height: 1920 }}
                      targetDimensions={batchItems[0]?.targetDimensions || { width: 1080, height: 1920 }}
                      onDimensionsChange={(dims) => {
                        setBatchItems(prev => prev.map(i => ({ ...i, targetDimensions: dims })));
                      }}
                      showAIMessage={true}
                    />
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>

      {/* Format Download Dialog */}
      {selectedDownloadId && batchItems.find(i => i.id === selectedDownloadId) && (
        <FormatDownloadDialog
          isOpen={showFormatDialog}
          onClose={() => {
            setShowFormatDialog(false);
            setSelectedDownloadId(null);
          }}
          onDownload={handleFormatDownload}
          currentFormat={
            batchItems.find(i => i.id === selectedDownloadId)?.processedData?.match(/^data:image\/(\w+);base64,/)?.[1] || 'jpeg'
          }
          imageData={batchItems.find(i => i.id === selectedDownloadId)?.processedData || ''}
          filename={batchItems.find(i => i.id === selectedDownloadId)?.filename || 'image'}
        />
      )}
    </motion.div>
  );
}

interface AIImageResizingContentProps {
  targetDimensions: ImageDimensions;
  setTargetDimensions: (dims: ImageDimensions) => void;
  setBatchFiles: (files: File[]) => void;
  preUploadedFile?: File;
}

function AIImageResizingContent({
  targetDimensions,
  setTargetDimensions,
  setBatchFiles,
  preUploadedFile
}: AIImageResizingContentProps) {
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const {
    isUploading,
    uploadedImage,
    error: uploadError,
    validationError,
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

  // Auto-upload pre-uploaded file
  useEffect(() => {
    if (preUploadedFile && !uploadedImage) {
      uploadFile(preUploadedFile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleImageUpload = (file: File) => {
    uploadFile(file);
    resetProcessing();
  };

  const handleBatchImageUpload = (files: File[]) => {
    setBatchFiles(files);
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
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="container mx-auto px-4 py-4"
    >
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="text-center mb-4"
      >
        <div className="flex items-center justify-center gap-3 mb-4">
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
            className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center"
          >
            <Bot className="w-5 h-5 text-blue-600" />
          </motion.div>
          <h1 className="text-3xl font-bold text-gray-900">
            Generative Expand
          </h1>
        </div>
        <p className="text-sm text-gray-600">
          Expand image backgrounds using AI generative fill without cropping
        </p>
      </motion.header>

      <AnimatePresence mode="wait">
        {!uploadedImage ? (
          <motion.div
            key="uploader"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="max-w-2xl mx-auto space-y-4"
          >
          {validationError.type ? (
            <UnsupportedFormatError
              filename={validationError.filename || ''}
              onRetry={resetUpload}
            />
          ) : (
            <ImageUploader
              onImageUpload={handleImageUpload}
              onBatchImageUpload={handleBatchImageUpload}
              isUploading={isUploading}
              supportsBatch={true}
            />
          )}
          </motion.div>
        ) : (
          <motion.div
            key="processing"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.4 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-4"
          >
            {/* Left Half - Controls and Dimensions */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="space-y-3"
            >
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
                <p className="text-sm text-gray-600 break-all">
                  {uploadedImage.filename}
                </p>
                <p className="text-xs text-gray-500">
                  {uploadedImage.originalDimensions.width} × {uploadedImage.originalDimensions.height} •{' '}
                  {Math.round(uploadedImage.size / 1024)} KB
                </p>
              </CardContent>
            </Card>

            <AnimatePresence>
              {uploadError && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card className="border-red-200">
                    <CardContent className="pt-6">
                      <p className="text-red-600 text-sm">{uploadError}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            <DimensionSelector
              originalDimensions={uploadedImage.originalDimensions}
              targetDimensions={targetDimensions}
              onDimensionsChange={handleDimensionsChange}
            />

            {isProcessing ? (
              <Button
                onClick={() => setShowCancelDialog(true)}
                variant="outline"
                className="w-full border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                size="lg"
              >
                <X className="h-4 w-4 mr-2" />
                Cancel Processing
              </Button>
            ) : (
              <Button
                onClick={handleProcess}
                disabled={!!processedImage}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                size="lg"
              >
                {processedImage ? 'Already Processed ✓' : 'Generative Expand'}
              </Button>
            )}

            <AnimatePresence>
              {processedImage && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-2"
                >
                  <Button
                    variant="outline"
                    onClick={() => downloadImage()}
                    className="w-full flex items-center justify-center gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Download Processed Image
                  </Button>
                  <Button
                    onClick={() => {
                      if (onEditAgain && processedImage && uploadedImage) {
                        // Pass the processed image to edit again with a different mode
                        const mimeType = processedImage.metadata.format === 'svg' ? 'image/svg+xml' : `image/${processedImage.metadata.format || 'jpeg'}`;
                        const imageData = `data:${mimeType};base64,${processedImage.imageData}`;
                        onEditAgain(imageData, {
                          filename: uploadedImage.filename,
                          mimetype: mimeType
                        });
                      } else {
                        // Fallback to reset
                        resetProcessing();
                        resetUpload();
                      }
                    }}
                    variant="outline"
                    className="w-full flex items-center justify-center gap-2 border-blue-300 text-blue-600 hover:bg-blue-50"
                  >
                    <Edit2 className="h-4 w-4" />
                    Edit Again
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

        {/* Right Half - Preview */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="space-y-2"
        >
          <ImagePreview
            originalImage={uploadedImage?.imageData}
            processedImage={processedImage?.imageData}
            originalDimensions={uploadedImage?.originalDimensions}
            targetDimensions={targetDimensions}
            isProcessing={isProcessing}
            originalMimeType={uploadedImage?.mimetype}
            processedMimeType={processedImage?.metadata?.format ? `image/${processedImage.metadata.format}` : undefined}
          />

          {/* Progress Bar under preview - separate component */}
          <AnimatePresence>
            {(isProcessing || status.stage !== 'idle') && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                <ProcessingStatus
              status={isProcessing && status.stage === 'idle'
                ? { stage: 'analyzing', progress: 10, message: 'Processing image...' }
                : status
              }
                />
              </motion.div>
            )}
          </AnimatePresence>
          </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {uploadError && !uploadedImage && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="max-w-2xl mx-auto"
          >
          <Card className="border-red-200">
            <CardContent className="pt-6">
              <p className="text-red-600 text-sm">{uploadError}</p>
            </CardContent>
          </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Section - Result Details */}
      <AnimatePresence>
        {processedImage && uploadedImage && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.4 }}
            className="mt-8"
          >
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
                    AI processing unavailable - used edge detection fallback
                  </div>
                )}
              </CardContent>
            </Card>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.6 }}
        className="text-center mt-4 text-gray-500 text-xs"
      >
        <p>No file size limits • Supports JPEG, PNG, WebP and SVG</p>
      </motion.footer>

      {/* Cancel Dialog */}
      <CancelDialog
        isOpen={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        onConfirm={() => {
          setShowCancelDialog(false);
          resetProcessing();
        }}
        title="Cancel Processing?"
        description="Are you sure you want to cancel the AI generative expand? Any progress will be lost."
      />
    </motion.div>
  );
}