/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @next/next/no-img-element */
'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { ImageUploader } from '@/components/ImageUploader';
import { BatchProcessor, BatchItem } from '@/components/BatchProcessor';
import { ProcessingStatus } from '@/components/ProcessingStatus';
import { useFileUpload } from '@/hooks/useFileUpload';
import { Download, Sparkles, Info, X, Edit2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ONNXImageEnhancer } from '@/lib/onnxInference';
import JSZip from 'jszip';
import { prepareFilesForBatchUpload } from '@/lib/batchUploadHelper';
import { FormatDownloadDialog, ImageFormat } from '@/components/FormatDownloadDialog';
import { UnsupportedFormatError } from '@/components/UnsupportedFormatError';
import { CancelDialog } from '@/components/CancelDialog';

interface ImageEnhancementProps {
  onBack: () => void;
  onEditAgain?: (imageData: string, metadata: {filename: string, mimetype: string}) => void;
  preUploadedFiles?: File[];
}

interface EnhancedImage {
  imageData: string;
  metadata: {
    width: number;
    height: number;
    format: string;
    size: number;
    wasUpscaled?: boolean;
  };
}

type EnhancementMethod = 'ai' | 'non-ai';

interface EnhancementSettings {
  method: EnhancementMethod;
  sharpness: number;
}

export function ImageEnhancement({ onBack, onEditAgain, preUploadedFiles }: ImageEnhancementProps) {
  const [enhancedImage, setEnhancedImage] = useState<EnhancedImage | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState({
    stage: 'idle' as 'idle' | 'analyzing' | 'enhancing' | 'finalizing',
    progress: 0,
    message: ''
  });
  const [comparisonPosition, setComparisonPosition] = useState<number>(50);
  const [isComparing, setIsComparing] = useState(false);
  const [imageBounds, setImageBounds] = useState<{ left: number; right: number } | null>(null);
  const [enhancementMethod, setEnhancementMethod] = useState<EnhancementMethod>('non-ai');
  const [sharpness, setSharpness] = useState<number>(5);
  const [onnxEnhancer, setOnnxEnhancer] = useState<ONNXImageEnhancer | null>(null);
  const [onnxModelLoaded, setOnnxModelLoaded] = useState(false);
  const [showFormatDialog, setShowFormatDialog] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  // Batch processing state
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [totalProcessed, setTotalProcessed] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [batchProcessingStarted, setBatchProcessingStarted] = useState(false);

  const comparisonRef = useRef<HTMLDivElement>(null);
  const originalImageRef = useRef<HTMLImageElement>(null);

  const {
    isUploading,
    uploadedImage,
    error: uploadError,
    validationError,
    uploadFile,
    reset: resetUpload,
  } = useFileUpload();

  // Auto-load pre-uploaded files
  useEffect(() => {
    if (preUploadedFiles && preUploadedFiles.length > 0) {
      if (preUploadedFiles.length > 1) {
        handleBatchImageUpload(preUploadedFiles);
      } else {
        uploadFile(preUploadedFiles[0]);
        setIsBatchMode(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialize ONNX model on mount
  useEffect(() => {
    const initONNX = async () => {
      try {
        const enhancer = new ONNXImageEnhancer();
        await enhancer.loadModel();
        setOnnxEnhancer(enhancer);
        setOnnxModelLoaded(true);
      } catch {
        setOnnxModelLoaded(false);
      }
    };

    initONNX();
  }, []);

  const handleImageUpload = (file: File) => {
    uploadFile(file);
    setEnhancedImage(null);
    setIsBatchMode(false);
  };

  const handleBatchImageUpload = async (files: File[]) => {
    setIsBatchMode(true);
    setTotalProcessed(0);
    setBatchProcessingStarted(false);

    const preparedFiles = await prepareFilesForBatchUpload(files, {
      maxSizeMB: 2,
      maxWidthOrHeight: 3072,
      quality: 0.75,
    });

    setUploadedFiles(preparedFiles);

    const items: BatchItem[] = preparedFiles.map((file, index) => ({
      id: `${Date.now()}-${index}`,
      filename: file.name,
      status: 'pending' as const,
      originalSize: file.size,
      previewUrl: URL.createObjectURL(file),
      settings: {
        method: enhancementMethod, // Use current selected method
        sharpness: 5,
      } as unknown as Record<string, unknown>,
    }));

    setBatchItems(items);
  };

  const processAllImages = async () => {
    setBatchProcessingStarted(true);
    setTotalProcessed(0);

    for (let i = 0; i < uploadedFiles.length; i++) {
      const file = uploadedFiles[i];
      const item = batchItems[i];
      await processSingleBatchImage(item.id, file, item.settings as unknown as EnhancementSettings);
    }
  };

  const processSingleImage = async (id: string) => {
    const itemIndex = batchItems.findIndex(item => item.id === id);
    if (itemIndex === -1) return;

    const file = uploadedFiles[itemIndex];
    const item = batchItems[itemIndex];
    const settings = (item.settings as unknown as EnhancementSettings) || { method: enhancementMethod, sharpness };

    await processSingleBatchImage(id, file, settings);
  };

  const processSingleBatchImage = async (id: string, file: File, settings: EnhancementSettings) => {
    setBatchItems(prev => prev.map(item =>
      item.id === id ? { ...item, status: 'processing' as const } : item
    ));

    try {
      const base64 = await fileToBase64(file);

      const response = await fetch('/api/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageData: base64,
          format: 'jpeg',
          method: settings.method === 'ai' ? 'ai' : 'sharp',
          sharpness: settings.sharpness,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Enhancement failed');
      }

      const mimeType = result.data.metadata.format === 'svg' ? 'image/svg+xml' : `image/${result.data.metadata.format}`;
      const dataUrl = `data:${mimeType};base64,${result.data.imageData}`;

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
      setBatchItems(prev => prev.map(item =>
        item.id === id
          ? {
              ...item,
              status: 'error' as const,
              error: error instanceof Error ? error.message : 'Enhancement failed',
            }
          : item
      ));

      setTotalProcessed(prev => prev + 1);
    }
  };

  const updateImageSettings = (id: string, newSettings: Partial<EnhancementSettings>) => {
    setBatchItems(prev => prev.map(item => {
      if (item.id === id) {
        const currentSettings = (item.settings as unknown as EnhancementSettings) || { method: enhancementMethod, sharpness };
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

  const handleDownloadAll = async () => {
    const completedItems = batchItems.filter(item => item.status === 'completed' && item.processedData);

    if (completedItems.length === 0) return;

    const zip = new JSZip();

    completedItems.forEach((item) => {
      const base64Data = item.processedData!.replace(/^data:image\/[^;]+;base64,/, '');
      const baseName = item.filename.replace(/\.[^.]+$/, '');
      zip.file(`${baseName}-enhanced.jpg`, base64Data, { base64: true });
    });

    const content = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `enhanced-images-${Date.now()}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadSingle = (id: string) => {
    const item = batchItems.find(item => item.id === id);
    if (!item || !item.processedData) return;

    const baseName = item.filename.replace(/\.[^.]+$/, '');
    const link = document.createElement('a');
    link.href = item.processedData;
    link.download = `${baseName}-enhanced.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleEnhance = async () => {
    if (!uploadedImage) return;

    setIsProcessing(true);

    const message = enhancementMethod === 'ai'
      ? 'Processing with Gemini AI...'
      : (onnxModelLoaded ? 'Processing with NAFNet ML model...' : 'Applying sharpening filters...');

    setProcessingStatus({
      stage: 'analyzing',
      progress: 10,
      message: message
    });

    try {
      // Use client-side ONNX if available and non-AI method is selected
      if (enhancementMethod === 'non-ai' && onnxEnhancer && onnxModelLoaded) {
        setProcessingStatus({
          stage: 'enhancing',
          progress: 30,
          message: 'Running NAFNet model...'
        });

        const img = new Image();
        img.src = `data:${uploadedImage.mimetype};base64,${uploadedImage.imageData}`;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });

        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Failed to get canvas context');

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, img.width, img.height);

        setProcessingStatus({
          stage: 'enhancing',
          progress: 60,
          message: 'Enhancing image with NAFNet...'
        });

        const enhancedImageData = await onnxEnhancer.enhanceImage(imageData);

        setProcessingStatus({
          stage: 'finalizing',
          progress: 90,
          message: 'Finalizing...'
        });

        ctx.putImageData(enhancedImageData, 0, 0);
        const enhancedBase64 = canvas.toDataURL('image/jpeg', 0.95);
        const base64Data = enhancedBase64.split(',')[1];

        setEnhancedImage({
          imageData: base64Data,
          metadata: {
            width: img.width,
            height: img.height,
            format: 'jpeg',
            size: base64Data.length,
          },
        });

        setProcessingStatus({
          stage: 'idle',
          progress: 100,
          message: 'Enhancement complete!'
        });

        setIsProcessing(false);
        return;
      }

      const response = await fetch('/api/enhance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageData: uploadedImage.imageData,
          format: 'jpeg',
          method: enhancementMethod === 'ai' ? 'ai' : 'sharp',
          sharpness: sharpness,
        }),
      });

      // Check for HTTP errors (like 413 Payload Too Large)
      if (!response.ok) {
        const statusText = response.statusText || 'Request failed';
        if (response.status === 413) {
          throw new Error('Request Entity Too Large - Image is too large to process');
        }
        throw new Error(`HTTP ${response.status}: ${statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Enhancement failed');
      }

      setProcessingStatus({
        stage: 'finalizing',
        progress: 90,
        message: 'Finalizing...'
      });

      setEnhancedImage({
        imageData: result.data.imageData,
        metadata: result.data.metadata,
      });

      setProcessingStatus({
        stage: 'idle',
        progress: 100,
        message: 'Enhancement complete!'
      });
    } catch (error) {
      console.error('Enhancement error:', error);
      setProcessingStatus({
        stage: 'idle',
        progress: 0,
        message: ''
      });

      // Check for payload size errors
      let errorMessage = error instanceof Error ? error.message : 'Enhancement failed';
      if (errorMessage.includes('FUNCTION_PAYLOAD_TOO_LARGE') ||
          errorMessage.includes('Request Entity Too Large') ||
          errorMessage.includes('too large')) {
        errorMessage = 'Image file is too large to process. Please:\n\n' +
                      '1. Use a smaller image (under 2MB recommended)\n' +
                      '2. Reduce image dimensions before uploading\n' +
                      '3. Try compressing the image first using the Image Compression mode\n\n' +
                      'The image has been automatically compressed during upload, but it may still be too large for processing.';
      }

      alert(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    setShowFormatDialog(true);
  };

  const handleFormatDownload = async (format: ImageFormat, quality: number) => {
    if (!enhancedImage) return;

    setIsConverting(true);
    try {
      // If format matches current format, download directly
      if (format === enhancedImage.metadata.format) {
        const link = document.createElement('a');
        link.href = `data:image/${format};base64,${enhancedImage.imageData}`;
        link.download = `enhanced-${uploadedImage?.filename || 'image'}.${format}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setIsConverting(false);
        return;
      }

      // Convert to different format
      const response = await fetch('/api/convert-format', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageData: enhancedImage.imageData,
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
      link.download = `enhanced-${uploadedImage?.filename || 'image'}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Download error:', error);
      alert(error instanceof Error ? error.message : 'Download failed');
    } finally {
      setIsConverting(false);
    }
  };

  // Calculate image bounds when enhanced image changes
  useEffect(() => {
    if (!enhancedImage || !comparisonRef.current || !uploadedImage) {
      setImageBounds(null);
      return;
    }

    const calculateBounds = () => {
      const container = comparisonRef.current;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const containerHeight = containerRect.height;

      const imgWidth = uploadedImage.originalDimensions.width;
      const imgHeight = uploadedImage.originalDimensions.height;

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

      const bounds = {
        left: leftPercent,
        right: rightPercent
      };

      setImageBounds(bounds);

      const middlePosition = (bounds.left + bounds.right) / 2;
      setComparisonPosition(middlePosition);
    };

    const timeoutId = setTimeout(calculateBounds, 150);

    window.addEventListener('resize', calculateBounds);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', calculateBounds);
    };
  }, [enhancedImage, uploadedImage]);

  const constrainPosition = (percentage: number): number => {
    if (!imageBounds) return percentage;
    return Math.max(imageBounds.left, Math.min(imageBounds.right, percentage));
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
        <div className="flex items-center justify-center gap-2 mb-2">
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
            className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center"
          >
            <Sparkles className="w-5 h-5 text-indigo-600" />
          </motion.div>
          <h1 className="text-3xl font-bold text-gray-900">
            Image Enhancement
          </h1>
        </div>
        <p className="text-sm text-gray-600">
          Sharpen and enhance images with advanced processing. Images under 100 KB are automatically upscaled to 190-200 KB.
        </p>
      </motion.header>

      <AnimatePresence mode="wait">
        {!uploadedImage && !isBatchMode ? (
          <motion.div
            key="uploader"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="max-w-2xl mx-auto"
          >
            <ImageUploader
              onImageUpload={handleImageUpload}
              onBatchImageUpload={handleBatchImageUpload}
              isUploading={isUploading}
              supportsBatch={true}
            />
          </motion.div>
        ) : isBatchMode ? (
          <motion.div
            key="batch-mode"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.4 }}
            className="max-w-7xl mx-auto space-y-6"
          >
            <BatchProcessor
              items={batchItems}
              onProcessAll={processAllImages}
              onProcessSingle={processSingleImage}
              onDownloadAll={handleDownloadAll}
              onDownloadSingle={handleDownloadSingle}
              onSelectImage={setSelectedImageId}
              selectedImageId={selectedImageId}
              totalProcessed={totalProcessed}
              batchProcessingStarted={batchProcessingStarted}
              renderSettings={(item: BatchItem) => {
                const settings = (item.settings || {}) as unknown as EnhancementSettings;
                return (
                  <div className="space-y-3">
                    {!onnxModelLoaded && (
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Sharpness: {settings.sharpness}/10
                        </label>
                        <Slider
                          value={[settings.sharpness]}
                          onValueChange={(value) => updateImageSettings(item.id, { sharpness: value[0] })}
                          min={1}
                          max={10}
                          step={1}
                          className="w-full"
                        />
                      </div>
                    )}
                  </div>
                );
              }}
              defaultSettingsPanel={
                !batchProcessingStarted && !selectedImageId && (
                  <Card className="bg-blue-50 border-blue-200">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Info className="w-4 h-4 text-blue-600" />
                        Batch Processing Settings
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="bg-white p-3 rounded-lg border border-blue-200">
                        <p className="text-sm text-gray-700 mb-2">
                          <strong className="text-blue-700">Batch Mode:</strong> All images use <strong>Sharp.js enhancement</strong> for fast processing and consistent results.
                        </p>
                        <p className="text-xs text-gray-600">
                          💡 Click on each image below to customize sharpness settings before processing.
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Default Sharpness Level</label>
                        <div className="flex items-center gap-3">
                          <Slider
                            value={[5]}
                            disabled
                            min={1}
                            max={10}
                            step={1}
                            className="w-full opacity-70"
                          />
                          <span className="text-sm font-medium text-gray-600">5/10</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          Customize sharpness for each image individually
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )
              }
            />
          </motion.div>
        ) : (
          <motion.div
            key="processing"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.4 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-8"
          >
            {/* Left Half - Controls */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="space-y-3"
            >
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.3 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle>
                      Image Uploaded
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-600 break-all">
                      {uploadedImage?.filename}
                    </p>
                    <p className="text-xs text-gray-500">
                      {uploadedImage?.originalDimensions.width} × {uploadedImage?.originalDimensions.height} •{' '}
                      {Math.round((uploadedImage?.size || 0) / 1024)} KB
                    </p>
                  </CardContent>
                </Card>
              </motion.div>

              <AnimatePresence>
                {uploadError && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Card className="border-red-200">
                      <CardContent className="pt-6">
                        <p className="text-red-600 text-sm">{uploadError}</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.4 }}
              >
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Sparkles className="w-4 h-4" />
                      Enhancement Settings
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    {/* Enhancement Method Toggle */}
                    <div className="space-y-3">
                      <label className="text-sm font-medium text-gray-700">
                        Enhancement Method
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          variant={enhancementMethod === 'ai' ? 'default' : 'outline'}
                          onClick={() => setEnhancementMethod('ai')}
                          className="w-full"
                        >
                          AI Unblur
                        </Button>
                        <Button
                          type="button"
                          variant={enhancementMethod === 'non-ai' ? 'default' : 'outline'}
                          onClick={() => setEnhancementMethod('non-ai')}
                          className="w-full"
                        >
                          {onnxModelLoaded ? 'NAFNet ML' : 'Sharp.js'}
                        </Button>
                      </div>
                    </div>

                    {/* Sharpness slider only for non-AI method without ONNX */}
                      {enhancementMethod === 'non-ai' && !onnxModelLoaded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-2"
                      >
                        <label className="text-sm font-medium text-gray-700 flex items-center justify-between">
                          <span>Sharpness Level</span>
                          <span className="text-gray-500">{sharpness}/10</span>
                        </label>
                        <Slider
                          value={[sharpness]}
                          onValueChange={(value) => setSharpness(value[0])}
                          min={1}
                          max={10}
                          step={1}
                          className="w-full"
                        />
                        <p className="text-xs text-gray-500">
                          Higher values = more sharpening (may amplify noise)
                        </p>
                      </motion.div>
                    )}

                    <div className="rounded-lg p-2 border bg-purple-50 border-purple-200">
                      <h3 className="font-semibold text-purple-900 text-xs">
                        {enhancementMethod === 'ai' ? 'Gemini AI Enhancement' : (onnxModelLoaded ? 'NAFNet ML Enhancement' : 'Sharp.js Enhancement')}
                      </h3>
                      <p className="text-xs text-purple-700 mt-1">
                        {enhancementMethod === 'ai'
                          ? 'Uses Google Gemini AI to intelligently reduce blur and enhance image clarity'
                          : (onnxModelLoaded
                              ? 'Uses client-side NAFNet model for local ML-powered enhancement'
                              : 'Uses Sharp.js for fast, traditional sharpening filters')}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.5 }}
                className="flex gap-2"
              >
                {isProcessing ? (
                  <div className="flex gap-2">
                    <Button
                      disabled
                      className="flex-1 bg-indigo-600 text-sm py-2"
                    >
                      Enhancing...
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowCancelDialog(true)}
                      className="border-red-500 text-red-600 hover:bg-red-50"
                    >
                      <X className="h-4 w-4 mr-1" />
                      Cancel
                    </Button>
                  </div>
                ) : enhancedImage ? (
                  <div className="flex gap-2">
                    <Button
                      onClick={handleDownload}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                    <Button
                      onClick={() => {
                        if (onEditAgain && enhancedImage && uploadedImage) {
                          // Pass the enhanced image to edit again with a different mode
                          const mimeType = enhancedImage.metadata.format === 'svg' ? 'image/svg+xml' : `image/${enhancedImage.metadata.format}`;
                          const imageData = `data:${mimeType};base64,${enhancedImage.imageData}`;
                          onEditAgain(imageData, {
                            filename: uploadedImage.filename,
                            mimetype: mimeType
                          });
                        } else {
                          // Fallback to reset
                          setEnhancedImage(null);
                        }
                      }}
                      variant="outline"
                      className="flex-1"
                    >
                      <Edit2 className="h-4 w-4 mr-2" />
                      Edit Again
                    </Button>
                  </div>
                ) : (
                  <Button
                    onClick={handleEnhance}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-sm py-2"
                  >
                    Enhance Image
                  </Button>
                )}
              </motion.div>
            </motion.div>

            {/* Right Half - Preview */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.3 }}
              className="space-y-4"
            >
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.4 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      {enhancedImage ? 'Comparison View' : 'Original Image'}
                      {enhancedImage && (
                        <span className="text-xs text-gray-500 font-normal">
                          Drag slider to compare
                        </span>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div
                      ref={comparisonRef}
                      className="relative aspect-video bg-gray-100 rounded-lg overflow-hidden mb-2 select-none"
                      onMouseDown={(e) => {
                        if (!enhancedImage) return;
                        setIsComparing(true);
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const percentage = (x / rect.width) * 100;
                        setComparisonPosition(constrainPosition(percentage));
                      }}
                      onMouseMove={(e) => {
                        if (!isComparing || !enhancedImage) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const percentage = (x / rect.width) * 100;
                        setComparisonPosition(constrainPosition(percentage));
                      }}
                      onMouseUp={() => setIsComparing(false)}
                      onMouseLeave={() => setIsComparing(false)}
                      onTouchStart={(e) => {
                        if (!enhancedImage) return;
                        setIsComparing(true);
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.touches[0].clientX - rect.left;
                        const percentage = (x / rect.width) * 100;
                        setComparisonPosition(constrainPosition(percentage));
                      }}
                      onTouchMove={(e) => {
                        if (!isComparing || !enhancedImage) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.touches[0].clientX - rect.left;
                        const percentage = (x / rect.width) * 100;
                        setComparisonPosition(constrainPosition(percentage));
                      }}
                      onTouchEnd={() => setIsComparing(false)}
                    >
                      {enhancedImage && (() => {
                        const mimeType = enhancedImage.metadata.format === 'svg' ? 'image/svg+xml' : `image/${enhancedImage.metadata.format}`;
                        return (
                          <img
                            src={`data:${mimeType};base64,${enhancedImage.imageData}`}
                            alt="Enhanced"
                            className="absolute inset-0 w-full h-full object-contain"
                          />
                        );
                      })()}

                      <div
                        className="absolute inset-0"
                        style={{
                          clipPath: enhancedImage
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

                      {enhancedImage && (
                        <>
                          <div className="absolute top-4 left-4 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full font-medium">
                            Before
                          </div>
                          <div className="absolute top-4 right-4 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full font-medium">
                            After
                          </div>

                          <div
                            className="absolute top-0 bottom-0 w-1 bg-white shadow-lg cursor-ew-resize z-10"
                            style={{ left: `${comparisonPosition}%` }}
                          >
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center border-2 border-gray-300">
                              <div className="flex gap-1">
                                <div className="w-0.5 h-4 bg-gray-400"></div>
                                <div className="w-0.5 h-4 bg-gray-400"></div>
                              </div>
                            </div>
                          </div>
                        </>
                      )}

                      {isProcessing && (
                        <div className="absolute inset-0 bg-white/90 flex flex-col items-center justify-center gap-3">
                          <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-600 border-t-transparent"></div>
                          <p className="text-gray-600 text-sm text-center">{processingStatus.message}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <AnimatePresence>
                {(isProcessing || processingStatus.stage !== 'idle') && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                  >
                    <ProcessingStatus status={processingStatus} />
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {enhancedImage && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    transition={{ duration: 0.4 }}
                  >
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Result Details</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-1 pt-0">
                        <div className="flex justify-between text-xs">
                          <span>Dimensions:</span>
                          <span>{enhancedImage.metadata.width} × {enhancedImage.metadata.height}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span>Format:</span>
                          <span className="uppercase">{enhancedImage.metadata.format}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span>File Size:</span>
                          <span>{Math.round(enhancedImage.metadata.size / 1024)} KB</span>
                        </div>
                        <div className="mt-2 p-2 bg-green-50 rounded text-xs text-green-700 border border-green-200">
                          ✓ Enhanced with {onnxModelLoaded ? 'ML-powered' : 'Sharp.js'} clarity
                          {enhancedImage.metadata.wasUpscaled && (
                            <span className="block mt-1">⚡ Automatically upscaled for better quality</span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {validationError.type === 'format' && (
          <UnsupportedFormatError
            filename={validationError.filename || ''}
            onRetry={resetUpload}
          />
        )}

        {uploadError && !uploadedImage && validationError.type !== 'format' && (
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

      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.6 }}
        className="text-center mt-4 text-gray-500 text-xs"
      >
        <p>Gemini AI / NAFNet ML / Sharp.js Enhancement • Supports JPEG, PNG, WebP and SVG</p>
      </motion.footer>

      {/* Format Download Dialog */}
      {enhancedImage && uploadedImage && (
        <FormatDownloadDialog
          isOpen={showFormatDialog}
          onClose={() => setShowFormatDialog(false)}
          onDownload={handleFormatDownload}
          currentFormat={enhancedImage.metadata.format}
          imageData={`data:image/${enhancedImage.metadata.format};base64,${enhancedImage.imageData}`}
          filename={uploadedImage.filename}
        />
      )}

      {/* Cancel Confirmation Dialog */}
      <CancelDialog
        isOpen={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        onConfirm={() => {
          setIsProcessing(false);
          setShowCancelDialog(false);
          setProcessingStatus({
            stage: 'idle',
            progress: 0,
            message: ''
          });
        }}
        title="Cancel Enhancement?"
        description="Are you sure you want to cancel the enhancement process? Your progress will be lost."
      />
    </motion.div>
  );
}
