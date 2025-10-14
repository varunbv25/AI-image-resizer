'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ImageUploader } from '@/components/ImageUploader';
import { DimensionSelector } from '@/components/DimensionSelector';
import { ImagePreview } from '@/components/ImagePreview';
import { ProcessingStatus } from '@/components/ProcessingStatus';
import { useFileUpload } from '@/hooks/useFileUpload';
import { useImageProcessing } from '@/hooks/useImageProcessing';
import { ImageDimensions } from '@/types';
import { Download, RotateCcw, Bot, FileArchive, Info, Check, Clock, AlertCircle } from 'lucide-react';
import { safeJsonParse } from '@/lib/safeJsonParse';
import JSZip from 'jszip';
import Image from 'next/image';

interface AIImageResizingProps {
  onBack: () => void;
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

export function AIImageResizing({}: AIImageResizingProps) {
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
    const item = batchItems.find(i => i.id === id);
    if (!item || !item.processedData) return;

    const link = document.createElement('a');
    link.href = item.processedData;
    link.download = `resized-${item.filename}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <FileArchive className="w-6 h-6 text-blue-600" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900">Batch AI Image Resizing</h1>
          </div>
          <p className="text-lg text-gray-600 mb-4">
            Upload multiple images and resize each one with AI-powered canvas extension
          </p>
          <div className="max-w-2xl mx-auto bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-left">
                <p className="text-sm text-blue-900 font-medium mb-2">How Batch AI Resizing Works:</p>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Upload multiple images at once</li>
                  <li>• Click on any image in the list to select it</li>
                  <li>• Set custom target dimensions for that specific image</li>
                  <li>• Process each image individually with AI-powered extension</li>
                  <li>• Or process all images at once with default settings</li>
                  <li>• Download individual images or all as a ZIP file</li>
                </ul>
              </div>
            </div>
          </div>
        </header>
        <div className="max-w-2xl mx-auto">
          <ImageUploader
            onImageUpload={(file) => handleBatchImageUpload([file])}
            onBatchImageUpload={handleBatchImageUpload}
            isUploading={false}
            supportsBatch={true}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <header className="text-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Batch AI Image Resizing</h1>
        <p className="text-sm text-gray-600">
          Select each image to customize settings • {completedCount} of {batchItems.length} completed
        </p>
      </header>

      {/* Instructions Banner */}
      <div className="max-w-7xl mx-auto mb-6">
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-900">
                <strong>How to use:</strong> Click any image below to customize its target dimensions, then click &quot;Process This Image&quot;. Or click &quot;Process All Images&quot; to use default settings for all pending images.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Image List */}
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
                    onClick={() => handleSelectImage(item.id)}
                    className={`w-full p-3 rounded-lg border-2 transition-all ${
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
                        <p className="text-sm font-medium text-gray-900 truncate">{item.filename}</p>
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
                  </button>
                ))}
              </div>

              <div className="mt-4 space-y-2">
                {pendingCount > 0 && (
                  <Button
                    onClick={handleProcessAll}
                    disabled={isProcessing}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    <Bot className="h-4 w-4 mr-2" />
                    Process All Images ({pendingCount})
                  </Button>
                )}
                {completedCount > 0 && (
                  <Button
                    onClick={handleDownloadAll}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download All ({completedCount})
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Image Editor */}
        <div className="lg:col-span-2">
          {selectedItem ? (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Configure: {selectedItem.filename}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-2">Original</h3>
                      <div className="relative aspect-video bg-gray-100 rounded-lg overflow-hidden">
                        <Image
                          src={selectedItem.previewUrl}
                          alt="Original"
                          fill
                          className="object-contain"
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-2 text-center">
                        {selectedItem.originalDimensions.width} × {selectedItem.originalDimensions.height}
                      </p>
                    </div>
                    {selectedItem.processedData && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-700 mb-2">Processed</h3>
                        <div className="relative aspect-video bg-gray-100 rounded-lg overflow-hidden">
                          <Image
                            src={selectedItem.processedData}
                            alt="Processed"
                            fill
                            className="object-contain"
                          />
                        </div>
                        <p className="text-xs text-gray-500 mt-2 text-center">
                          {selectedItem.targetDimensions.width} × {selectedItem.targetDimensions.height}
                        </p>
                      </div>
                    )}
                  </div>
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
                    {selectedItem.status === 'completed' && (
                      <Button
                        onClick={() => handleDownloadSingle(selectedItem.id)}
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
            </div>
          ) : (
            <Card>
              <CardContent className="py-20 text-center">
                <Bot className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Select an image from the list to configure and process it</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

interface AIImageResizingContentProps {
  targetDimensions: ImageDimensions;
  setTargetDimensions: (dims: ImageDimensions) => void;
  setBatchFiles: (files: File[]) => void;
}

function AIImageResizingContent({
  targetDimensions,
  setTargetDimensions,
  setBatchFiles
}: AIImageResizingContentProps) {
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
    <div className="container mx-auto px-4 py-8">
      <header className="text-center mb-8">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
            <Bot className="w-6 h-6 text-blue-600" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900">
            AI Image Resizing
          </h1>
        </div>
        <p className="text-lg text-gray-600">
          Intelligently resize and extend images with AI-powered canvas extension
        </p>
      </header>

      {!uploadedImage ? (
        <div className="max-w-2xl mx-auto space-y-4">
          <ImageUploader
            onImageUpload={handleImageUpload}
            onBatchImageUpload={handleBatchImageUpload}
            isUploading={isUploading}
            supportsBatch={true}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Half - Controls and Dimensions */}
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

            <DimensionSelector
              originalDimensions={uploadedImage.originalDimensions}
              targetDimensions={targetDimensions}
              onDimensionsChange={handleDimensionsChange}
            />

            <Button
              onClick={handleProcess}
              disabled={isProcessing}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              size="lg"
            >
              {isProcessing ? 'Processing...' : 'AI Image Resizing'}
            </Button>

            {processedImage && (
              <Button
                variant="outline"
                onClick={() => downloadImage()}
                className="w-full flex items-center justify-center gap-2"
              >
                <Download className="h-4 w-4" />
                Download Processed Image
              </Button>
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
            originalMimeType={uploadedImage?.mimetype}
            processedMimeType={processedImage?.metadata?.format ? `image/${processedImage.metadata.format}` : undefined}
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

      {/* Bottom Section - Result Details */}
      {processedImage && uploadedImage && (
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
                    AI processing unavailable - used edge detection fallback
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <footer className="text-center mt-12 text-gray-500 text-sm">
        <p>No file size limits • Supports JPEG, PNG, WebP and SVG</p>
      </footer>
    </div>
  );
}