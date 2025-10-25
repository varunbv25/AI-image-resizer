/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @next/next/no-img-element */
'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { ImageUploader } from '@/components/ImageUploader';
import { BatchProcessor, BatchItem } from '@/components/BatchProcessor';
import { useFileUpload } from '@/hooks/useFileUpload';
import { RotateCw, RotateCcw, FlipHorizontal2, FlipVertical2, Download, RotateCcw as ResetIcon, Info, Edit2, X } from 'lucide-react';
import JSZip from 'jszip';
import { prepareFilesForBatchUpload } from '@/lib/batchUploadHelper';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateFlipSettings } from '@/types';
import { FormatDownloadDialog, ImageFormat } from '@/components/FormatDownloadDialog';
import { UnsupportedFormatError } from '@/components/UnsupportedFormatError';
import { CancelDialog } from '@/components/CancelDialog';
import { upload } from '@vercel/blob/client';

interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  size: number;
}

interface RotateFlipProps {
  onBack: () => void;
  onEditAgain?: (imageData: string, metadata: {filename: string, mimetype: string}) => void;
  preUploadedFiles?: File[];
}

export function RotateFlip({ onBack, onEditAgain, preUploadedFiles }: RotateFlipProps) {
  const [transformSettings, setTransformSettings] = useState<RotateFlipSettings>({
    customAngle: 0,
    quality: 0.9,
    operation: 'rotate-90'
  });
  const [customAngle, setCustomAngle] = useState<number>(0);
  // State for 90-degree rotation cycles (0, 90, 180, 270)
  const [fixedRotation, setFixedRotation] = useState<number>(0);
  // State for flip transforms
  const [flipHorizontal, setFlipHorizontal] = useState<boolean>(false);
  const [flipVertical, setFlipVertical] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [processedMetadata, setProcessedMetadata] = useState<ImageMetadata | null>(null);
  const [originalAspectRatio, setOriginalAspectRatio] = useState<number>(16 / 9); // width / height

  // Batch processing state
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [totalProcessed, setTotalProcessed] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [batchProcessingStarted, setBatchProcessingStarted] = useState(false);

  // Format selection state
  const [showFormatDialog, setShowFormatDialog] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [selectedDownloadId, setSelectedDownloadId] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const originalFileRef = useRef<File | null>(null);

  const {
    isUploading,
    uploadedImage,
    error: uploadError,
    validationError,
    uploadProgress,
    uploadFile,
    reset: resetUpload,
  } = useFileUpload();

  // Auto-load pre-uploaded files
  useEffect(() => {
    if (preUploadedFiles && preUploadedFiles.length > 0) {
      if (preUploadedFiles.length > 1) {
        handleBatchImageUpload(preUploadedFiles);
      } else {
        originalFileRef.current = preUploadedFiles[0];
        uploadFile(preUploadedFiles[0]);
        setIsBatchMode(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Calculate aspect ratio when image is uploaded
  useEffect(() => {
    if (uploadedImage?.originalDimensions) {
      const aspectRatio = uploadedImage.originalDimensions.width / uploadedImage.originalDimensions.height;
      setOriginalAspectRatio(aspectRatio);
    }
  }, [uploadedImage]);

  const handleImageUpload = (file: File) => {
    originalFileRef.current = file;
    uploadFile(file);
    setProcessedImage(null);
    setIsBatchMode(false);
    // Reset transform states
    setCustomAngle(0);
    setFixedRotation(0);
    setFlipHorizontal(false);
    setFlipVertical(false);
  };

  const handleBatchImageUpload = async (files: File[]) => {
    setIsBatchMode(true);
    setTotalProcessed(0);
    setBatchProcessingStarted(false);

    // Compress files before storing
    const preparedFiles = await prepareFilesForBatchUpload(files, {
      maxSizeMB: 2,
      maxWidthOrHeight: 3072,
      quality: 0.75,
    });

    setUploadedFiles(preparedFiles);

    // Create initial batch items with preview URLs
    const items: BatchItem[] = preparedFiles.map((file, index) => ({
      id: `${Date.now()}-${index}`,
      filename: file.name,
      status: 'pending' as const,
      originalSize: file.size,
      previewUrl: URL.createObjectURL(file),
      settings: {
        operation: transformSettings.operation,
        customAngle: transformSettings.customAngle,
        quality: transformSettings.quality,
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
      await processSingleBatchImage(item.id, file, item.settings as unknown as RotateFlipSettings);
    }
  };

  const processSingleImage = async (id: string) => {
    const itemIndex = batchItems.findIndex(item => item.id === id);
    if (itemIndex === -1) return;

    const file = uploadedFiles[itemIndex];
    const item = batchItems[itemIndex];
    const settings = (item.settings as unknown as RotateFlipSettings) || transformSettings;

    await processSingleBatchImage(id, file, settings);
  };

  const processSingleBatchImage = async (id: string, file: File, settings: RotateFlipSettings) => {
    setBatchItems(prev => prev.map(item =>
      item.id === id ? { ...item, status: 'processing' as const } : item
    ));

    try {
      const base64 = await fileToBase64(file);

      const response = await fetch('/api/rotate-flip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageData: base64,
          operation: settings.operation,
          customAngle: settings.customAngle || 0,
          quality: Math.round(settings.quality * 100),
          format: 'jpeg',
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Processing failed');
      }

      const dataUrl = `data:image/jpeg;base64,${result.data.imageData}`;

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
              error: error instanceof Error ? error.message : 'Processing failed',
            }
          : item
      ));

      setTotalProcessed(prev => prev + 1);
    }
  };

  const updateImageSettings = (id: string, newSettings: Partial<RotateFlipSettings>) => {
    setBatchItems(prev => prev.map(item => {
      if (item.id === id) {
        const currentSettings = (item.settings as unknown as RotateFlipSettings) || transformSettings;
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
      const base64Data = item.processedData!.replace(/^data:image\/\w+;base64,/, '');
      zip.file(item.filename, base64Data, { base64: true });
    });

    const content = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `transformed-images-${Date.now()}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadSingle = (id: string) => {
    setSelectedDownloadId(id);
    setShowFormatDialog(true);
  };

  const handleBatchFormatDownload = async (format: ImageFormat, quality: number) => {
    if (!selectedDownloadId) return;

    const item = batchItems.find(item => item.id === selectedDownloadId);
    if (!item || !item.processedData) return;

    setIsConverting(true);
    try {
      // Extract base64 data from data URL
      const base64Data = item.processedData.split(',')[1];

      // Check if format is JPEG (current format from transformation)
      if (format === 'jpeg') {
        // Direct download if same format
        const link = document.createElement('a');
        link.href = item.processedData;
        link.download = `transformed-${item.filename}.${format}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setIsConverting(false);
        return;
      }

      // Convert to different format via API
      const response = await fetch('/api/convert-format', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageData: base64Data,
          targetFormat: format,
          quality: quality,
        }),
      });

      if (!response.ok) {
        throw new Error('Format conversion failed');
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Format conversion failed');
      }

      // Download converted image
      const link = document.createElement('a');
      const mimeType = format === 'svg' ? 'image/svg+xml' : `image/${format}`;
      link.href = `data:${mimeType};base64,${result.data.imageData}`;
      link.download = `transformed-${item.filename}.${format}`;
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

  const handleReset = () => {
    resetUpload();
    setProcessedImage(null);
    setIsBatchMode(false);
    setBatchItems([]);
    setTotalProcessed(0);
    setUploadedFiles([]);
    setSelectedImageId(null);
    setBatchProcessingStarted(false);
    // Reset transform states
    setCustomAngle(0);
    setFixedRotation(0);
    setFlipHorizontal(false);
    setFlipVertical(false);
  };

  // Handler for 90-degree rotation button (cycles through 0, 90, 180, 270)
  const handleFixedRotate = () => {
    setFixedRotation(prev => (prev + 90) % 360);
  };

  // Handler for flip horizontal
  const handleFlipHorizontal = () => {
    setFlipHorizontal(prev => !prev);
  };

  // Handler for flip vertical
  const handleFlipVertical = () => {
    setFlipVertical(prev => !prev);
  };

  // Calculate current aspect ratio based on rotation
  const getCurrentAspectRatio = () => {
    // If rotated 90 or 270 degrees, swap the aspect ratio
    if (fixedRotation === 90 || fixedRotation === 270) {
      return 1 / originalAspectRatio;
    }
    return originalAspectRatio;
  };

  // Calculate total transform for preview
  const getTotalTransform = () => {
    const totalRotation = fixedRotation + customAngle;
    const scaleX = flipHorizontal ? -1 : 1;
    const scaleY = flipVertical ? -1 : 1;
    return `rotate(${totalRotation}deg) scaleX(${scaleX}) scaleY(${scaleY})`;
  };

  const handleDownload = async () => {
    if (!uploadedImage) return;

    // First, process the image with current transformations
    setIsProcessing(true);

    try {
      // Calculate the operation and angle based on current state
      let operation: 'rotate-90' | 'rotate-180' | 'rotate-270' | 'flip-horizontal' | 'flip-vertical' | 'custom' = 'custom';
      let totalAngle = fixedRotation + customAngle;

      // Determine the operation type
      if (flipHorizontal && !flipVertical && totalAngle === 0) {
        operation = 'flip-horizontal';
        totalAngle = 0;
      } else if (flipVertical && !flipHorizontal && totalAngle === 0) {
        operation = 'flip-vertical';
        totalAngle = 0;
      } else if (totalAngle === 90 && !flipHorizontal && !flipVertical) {
        operation = 'rotate-90';
        totalAngle = 0;
      } else if (totalAngle === 180 && !flipHorizontal && !flipVertical) {
        operation = 'rotate-180';
        totalAngle = 0;
      } else if (totalAngle === 270 && !flipHorizontal && !flipVertical) {
        operation = 'rotate-270';
        totalAngle = 0;
      } else {
        operation = 'custom';
      }

      // Check if we should use blob workflow (file > 3MB OR blob URL already exists)
      const SIZE_THRESHOLD = 3 * 1024 * 1024; // 3MB
      const originalFile = originalFileRef.current;
      const hasExistingBlobUrl = uploadedImage && uploadedImage.blobUrl;
      const usesBlobWorkflow = hasExistingBlobUrl || (originalFile && originalFile.size > SIZE_THRESHOLD);

      let result;

      if (usesBlobWorkflow) {
        // BLOB WORKFLOW for large files
        console.log('🚀 Using blob workflow with server-side sharp.js');

        let blobUrl: string;

        if (hasExistingBlobUrl && uploadedImage.blobUrl) {
          // Use existing blob URL (file already uploaded during initial upload)
          console.log('✅ Using existing blob URL:', uploadedImage.blobUrl);
          blobUrl = uploadedImage.blobUrl;
        } else if (originalFile) {
          // Upload file to Vercel Blob (fallback for older workflow)
          console.log('⬆️  Uploading file to blob...', originalFile.size);
          const blob = await upload(originalFile.name, originalFile, {
            access: 'public',
            handleUploadUrl: '/api/get-upload-token',
            multipart: true,
          });
          blobUrl = blob.url;
          console.log('File uploaded to blob:', blobUrl);
        } else {
          throw new Error('No blob URL or file available for processing');
        }

        // Request processing with blob URL (no file upload needed!)
        const response = await fetch('/api/process-from-blob', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            blobUrl: blobUrl,
            operation: 'rotate-flip',
            params: {
              operation,
              customAngle: totalAngle,
              quality: Math.round(transformSettings.quality * 100),
              flipHorizontal,
              flipVertical,
            },
          }),
        });

        if (!response.ok) {
          throw new Error('Processing failed');
        }

        result = await response.json();
      } else {
        // TRADITIONAL API WORKFLOW for small files
        console.log('Using traditional API workflow for small file');

        const response = await fetch('/api/rotate-flip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageData: uploadedImage.imageData,
            operation: operation,
            customAngle: totalAngle,
            quality: Math.round(transformSettings.quality * 100),
            format: 'jpeg',
            flipHorizontal: flipHorizontal,
            flipVertical: flipVertical,
          }),
        });

        result = await response.json();
      }

      if (!result.success) {
        throw new Error(result.error || 'Processing failed');
      }

      setProcessedImage(result.data.imageData);
      setProcessedMetadata(result.data.metadata);
      setIsProcessing(false);

      // Now show format dialog
      setShowFormatDialog(true);
    } catch (error) {
      console.error('Transform error:', error);
      alert(error instanceof Error ? error.message : 'Processing failed');
      setIsProcessing(false);
    }
  };

  const handleFormatDownload = async (format: ImageFormat, quality: number) => {
    if (!processedImage || !uploadedImage) return;

    setIsConverting(true);
    try {
      // Check if format is JPEG (current format from transformation)
      if (format === 'jpeg') {
        // Direct download if same format
        const link = document.createElement('a');
        link.href = `data:image/jpeg;base64,${processedImage}`;
        link.download = `transformed-${uploadedImage.filename}.${format}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setIsConverting(false);
        return;
      }

      // Convert to different format via API
      const response = await fetch('/api/convert-format', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageData: processedImage,
          targetFormat: format,
          quality: quality,
        }),
      });

      if (!response.ok) {
        throw new Error('Format conversion failed');
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Format conversion failed');
      }

      // Download converted image
      const link = document.createElement('a');
      const mimeType = format === 'svg' ? 'image/svg+xml' : `image/${format}`;
      link.href = `data:${mimeType};base64,${result.data.imageData}`;
      link.download = `transformed-${uploadedImage.filename}.${format}`;
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
            className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center"
          >
            <RotateCw className="w-5 h-5 text-teal-600" />
          </motion.div>
          <h1 className="text-3xl font-bold text-gray-900">
            Rotate & Flip
          </h1>
        </div>
        <p className="text-sm text-gray-600">
          Transform images with instant rotations and flips
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
                uploadProgress={uploadProgress}
                supportsBatch={true}
              />
            )}
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
              onReset={handleReset}
              onSelectImage={setSelectedImageId}
              selectedImageId={selectedImageId}
              totalProcessed={totalProcessed}
              batchProcessingStarted={batchProcessingStarted}
              renderSettings={(item: BatchItem) => {
                const settings = (item.settings || {}) as unknown as RotateFlipSettings;
                return (
                  <div className="space-y-2">
                    <div>
                      <label className="block text-sm font-medium mb-2">Transform</label>
                      <div className="grid grid-cols-3 gap-2">
                        <Button
                          variant={settings.operation === 'rotate-90' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => updateImageSettings(item.id, { operation: 'rotate-90' })}
                          className="flex items-center gap-1"
                        >
                          <RotateCw className="w-3 h-3" />
                          90°
                        </Button>
                        <Button
                          variant={settings.operation === 'rotate-180' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => updateImageSettings(item.id, { operation: 'rotate-180' })}
                          className="flex items-center gap-1"
                        >
                          <RotateCw className="w-3 h-3" />
                          180°
                        </Button>
                        <Button
                          variant={settings.operation === 'rotate-270' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => updateImageSettings(item.id, { operation: 'rotate-270' })}
                          className="flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          270°
                        </Button>
                        <Button
                          variant={settings.operation === 'flip-horizontal' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => updateImageSettings(item.id, { operation: 'flip-horizontal' })}
                          className="flex items-center gap-1"
                        >
                          <FlipHorizontal2 className="w-3 h-3" />
                          H-Flip
                        </Button>
                        <Button
                          variant={settings.operation === 'flip-vertical' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => updateImageSettings(item.id, { operation: 'flip-vertical' })}
                          className="flex items-center gap-1"
                        >
                          <FlipVertical2 className="w-3 h-3" />
                          V-Flip
                        </Button>
                        <Button
                          variant={settings.operation === 'custom' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => updateImageSettings(item.id, { operation: 'custom' })}
                        >
                          Custom
                        </Button>
                      </div>
                    </div>
                    {settings.operation === 'custom' && (
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Angle: {settings.customAngle || 0}°
                        </label>
                        <Slider
                          value={[settings.customAngle || 0]}
                          onValueChange={(value) => updateImageSettings(item.id, { customAngle: value[0] })}
                          min={-45}
                          max={45}
                          step={1}
                          className="w-full"
                        />
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                          <span>-45°</span>
                          <span>0°</span>
                          <span>45°</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }}
              defaultSettingsPanel={
                !batchProcessingStarted && !selectedImageId && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Info className="w-4 h-4" />
                        Default Transform Settings
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div>
                        <label className="block text-sm font-medium mb-2">Transform</label>
                        <div className="grid grid-cols-3 gap-2">
                          <Button
                            variant={transformSettings.operation === 'rotate-90' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setTransformSettings(prev => ({ ...prev, operation: 'rotate-90' }))}
                            className="flex items-center gap-1"
                          >
                            <RotateCw className="w-3 h-3" />
                            90°
                          </Button>
                          <Button
                            variant={transformSettings.operation === 'rotate-180' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setTransformSettings(prev => ({ ...prev, operation: 'rotate-180' }))}
                            className="flex items-center gap-1"
                          >
                            <RotateCw className="w-3 h-3" />
                            180°
                          </Button>
                          <Button
                            variant={transformSettings.operation === 'rotate-270' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setTransformSettings(prev => ({ ...prev, operation: 'rotate-270' }))}
                            className="flex items-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" />
                            270°
                          </Button>
                          <Button
                            variant={transformSettings.operation === 'flip-horizontal' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setTransformSettings(prev => ({ ...prev, operation: 'flip-horizontal' }))}
                            className="flex items-center gap-1"
                          >
                            <FlipHorizontal2 className="w-3 h-3" />
                            H-Flip
                          </Button>
                          <Button
                            variant={transformSettings.operation === 'flip-vertical' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setTransformSettings(prev => ({ ...prev, operation: 'flip-vertical' }))}
                            className="flex items-center gap-1"
                          >
                            <FlipVertical2 className="w-3 h-3" />
                            V-Flip
                          </Button>
                          <Button
                            variant={transformSettings.operation === 'custom' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setTransformSettings(prev => ({ ...prev, operation: 'custom' }))}
                          >
                            Custom
                          </Button>
                        </div>
                      </div>
                      {transformSettings.operation === 'custom' && (
                        <div>
                          <label className="block text-sm font-medium mb-2">
                            Angle: {customAngle}°
                          </label>
                          <Slider
                            value={[customAngle]}
                            onValueChange={(value) => {
                              setCustomAngle(value[0]);
                              setTransformSettings(prev => ({ ...prev, customAngle: value[0] }));
                            }}
                            min={-45}
                            max={45}
                            step={1}
                            className="w-full"
                          />
                          <div className="flex justify-between text-xs text-gray-500 mt-1">
                            <span>-45°</span>
                            <span>0°</span>
                            <span>45°</span>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              }
            />
          </motion.div>
        ) : (
          <motion.div
            key="single-mode"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.4 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-4"
          >
            {/* Left Half - Controls */}
            <motion.div className="space-y-3">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    Image Uploaded
                    <Button variant="outline" size="sm" onClick={handleReset}>
                      <ResetIcon className="h-4 w-4 mr-2" />
                      Reset
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600 break-all">{uploadedImage?.filename}</p>
                  <p className="text-xs text-gray-500">
                    {uploadedImage?.originalDimensions.width} × {uploadedImage?.originalDimensions.height} •{' '}
                    {Math.round((uploadedImage?.size || 0) / 1024)} KB
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Rotate</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Fixed 90-degree rotation button */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Fixed Rotation</label>
                    <Button
                      variant="outline"
                      onClick={handleFixedRotate}
                      className="w-full flex items-center justify-center gap-2"
                    >
                      <RotateCw className="w-4 h-4" />
                      Rotate 90° ({fixedRotation}°)
                    </Button>
                  </div>

                  {/* Custom angle slider */}
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Custom Angle: {customAngle}°
                    </label>
                    <Slider
                      value={[customAngle]}
                      onValueChange={(value) => setCustomAngle(value[0])}
                      min={-45}
                      max={45}
                      step={1}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>-45°</span>
                      <span>0°</span>
                      <span>45°</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Flip</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button
                    variant={flipHorizontal ? 'default' : 'outline'}
                    onClick={handleFlipHorizontal}
                    className="w-full flex items-center justify-center gap-2"
                  >
                    <FlipHorizontal2 className="w-4 h-4" />
                    Mirror Horizontal
                  </Button>
                  <Button
                    variant={flipVertical ? 'default' : 'outline'}
                    onClick={handleFlipVertical}
                    className="w-full flex items-center justify-center gap-2"
                  >
                    <FlipVertical2 className="w-4 h-4" />
                    Mirror Vertical
                  </Button>
                </CardContent>
              </Card>

              <div className="space-y-2">
                {isProcessing ? (
                  <div className="flex gap-2">
                    <Button
                      disabled
                      className="flex-1 bg-teal-600"
                    >
                      Processing...
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowCancelDialog(true)}
                      className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Cancel
                    </Button>
                  </div>
                ) : processedMetadata ? (
                  <div className="space-y-2">
                    <Button
                      onClick={handleDownload}
                      className="w-full bg-teal-600 hover:bg-teal-700 flex items-center justify-center gap-2"
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </Button>
                    <Button
                      onClick={() => {
                        if (onEditAgain && processedImage && uploadedImage) {
                          // Pass the processed image to edit again with a different mode
                          const mimeType = 'image/jpeg'; // RotateFlip always outputs JPEG
                          const imageData = `data:${mimeType};base64,${processedImage}`;
                          onEditAgain(imageData, {
                            filename: uploadedImage.filename,
                            mimetype: mimeType
                          });
                        } else {
                          // Fallback to reset
                          setProcessedImage(null);
                          setProcessedMetadata(null);
                          resetUpload();
                        }
                      }}
                      variant="outline"
                      className="w-full border-blue-300 text-blue-600 hover:bg-blue-50 flex items-center justify-center gap-2"
                    >
                      <Edit2 className="h-4 w-4" />
                      Edit Again
                    </Button>
                  </div>
                ) : (
                  <Button
                    onClick={handleDownload}
                    className="w-full bg-teal-600 hover:bg-teal-700 flex items-center justify-center gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </Button>
                )}
              </div>
            </motion.div>

            {/* Right Half - Preview */}
            <motion.div className="space-y-2">
              <Card>
                <CardHeader>
                  <CardTitle>Live Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    className="relative bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center mx-auto"
                    style={{
                      aspectRatio: `${getCurrentAspectRatio()}`,
                      maxWidth: '100%',
                      maxHeight: '70vh',
                    }}
                  >
                    {uploadedImage && (
                      <img
                        src={`data:${uploadedImage.mimetype};base64,${uploadedImage.imageData}`}
                        alt="Preview"
                        className="max-w-full max-h-full object-contain transition-transform duration-200 ease-out"
                        style={{
                          transform: getTotalTransform(),
                        }}
                      />
                    )}

                    {isProcessing && (
                      <div className="absolute inset-0 bg-white/90 flex flex-col items-center justify-center gap-3">
                        <div className="animate-spin rounded-full h-10 w-10 border-4 border-teal-600 border-t-transparent"></div>
                        <p className="text-gray-600 text-sm text-center">Processing for download...</p>
                      </div>
                    )}
                  </div>

                  {/* Transform info */}
                  <div className="mt-2 text-xs text-gray-500 text-center">
                    {fixedRotation !== 0 && <span>Rotation: {fixedRotation}° </span>}
                    {customAngle !== 0 && <span>+ {customAngle}° </span>}
                    {flipHorizontal && <span>• Flipped H </span>}
                    {flipVertical && <span>• Flipped V</span>}
                    {fixedRotation === 0 && customAngle === 0 && !flipHorizontal && !flipVertical && (
                      <span>No transformations applied</span>
                    )}
                  </div>
                </CardContent>
              </Card>

              {processedMetadata && (
                <Card>
                  <CardHeader>
                    <CardTitle>Result Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Dimensions:</span>
                      <span>{processedMetadata.width} × {processedMetadata.height}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Format:</span>
                      <span className="uppercase">{processedMetadata.format}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>File Size:</span>
                      <span>{Math.round(processedMetadata.size / 1024)} KB</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Format Dialog for Single File Mode */}
      {processedImage && uploadedImage && !isBatchMode && (
        <FormatDownloadDialog
          isOpen={showFormatDialog && !selectedDownloadId}
          onClose={() => setShowFormatDialog(false)}
          onDownload={handleFormatDownload}
          currentFormat="jpeg"
          imageData={`data:image/jpeg;base64,${processedImage}`}
          filename={uploadedImage.filename}
        />
      )}

      {/* Format Dialog for Batch Mode */}
      {selectedDownloadId && batchItems.find(i => i.id === selectedDownloadId) && (
        <FormatDownloadDialog
          isOpen={showFormatDialog && !!selectedDownloadId}
          onClose={() => {
            setShowFormatDialog(false);
            setSelectedDownloadId(null);
          }}
          onDownload={handleBatchFormatDownload}
          currentFormat="jpeg"
          imageData={batchItems.find(i => i.id === selectedDownloadId)?.processedData || ''}
          filename={batchItems.find(i => i.id === selectedDownloadId)?.filename || 'image'}
        />
      )}

      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.6 }}
        className="text-center mt-4 text-gray-500 text-xs"
      >
        <p>Instant transformations • Supports JPEG, PNG, WebP and SVG</p>
      </motion.footer>

      {/* Cancel Dialog */}
      <CancelDialog
        isOpen={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        onConfirm={() => {
          setShowCancelDialog(false);
          setIsProcessing(false);
        }}
        title="Cancel Transformation?"
        description="Are you sure you want to cancel the transformation? Any progress will be lost."
      />
    </motion.div>
  );
}
