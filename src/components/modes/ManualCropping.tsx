/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ImageUploader } from '@/components/ImageUploader';
import { DimensionSelector } from '@/components/DimensionSelector';
import { useFileUpload } from '@/hooks/useFileUpload';
import { ImageDimensions } from '@/types';
import { Download, RotateCcw, Scissors, ZoomIn, Move, Keyboard, FileArchive, Info, Check, Clock, AlertCircle, X, Edit2 } from 'lucide-react';
import Image from 'next/image';
import { safeJsonParse } from '@/lib/safeJsonParse';
import JSZip from 'jszip';
import { motion, AnimatePresence } from 'framer-motion';
import { FormatDownloadDialog, ImageFormat } from '@/components/FormatDownloadDialog';
import { UnsupportedFormatError } from '@/components/UnsupportedFormatError';
import { CancelDialog } from '@/components/CancelDialog';
import { upload } from '@vercel/blob/client';

interface ManualCroppingProps {
  onBack: () => void;
  onEditAgain?: (imageData: string, metadata: {filename: string, mimetype: string}) => void;
  preUploadedFiles?: File[];
}

interface CropFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ImageDisplay {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

interface BatchCropItem {
  id: string;
  filename: string;
  originalSize: number;
  previewUrl: string;
  imageData: string;
  originalDimensions: { width: number; height: number };
  targetDimensions: ImageDimensions;
  status: 'pending' | 'ready' | 'completed' | 'error';
  croppedData?: string;
  croppedSize?: number;
  error?: string;
}

export function ManualCropping({ onEditAgain, preUploadedFiles }: ManualCroppingProps) {
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
        // For single file, it will be handled by ManualCroppingContent
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render batch mode if enabled
  if (isBatchMode && batchFiles) {
    return <ManualCroppingBatchContent
      initialFiles={batchFiles}
      onBack={() => {
        setIsBatchMode(false);
        setBatchFiles(null);
      }}
    />;
  }

  return <ManualCroppingContent
    setBatchFiles={handleBatchModeActivation}
    preUploadedFile={preUploadedFiles && preUploadedFiles.length === 1 ? preUploadedFiles[0] : undefined}
    onEditAgain={onEditAgain}
  />;
}

interface ManualCroppingBatchContentProps {
  initialFiles: File[];
  onBack: () => void;
}

function ManualCroppingBatchContent({ initialFiles, onBack }: ManualCroppingBatchContentProps) {
  const [batchItems, setBatchItems] = useState<BatchCropItem[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [totalCompleted, setTotalCompleted] = useState(0);

  // Cropping state for selected image
  const [cropFrame, setCropFrame] = useState<CropFrame>({ x: 100, y: 100, width: 300, height: 400 });
  const [imageDisplay, setImageDisplay] = useState<ImageDisplay>({ x: 0, y: 0, width: 0, height: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [initialCropFrame, setInitialCropFrame] = useState<CropFrame | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);

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
    setTotalCompleted(0);
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
    const item = batchItems.find(i => i.id === id);
    if (item) {
      // Calculate image display
      const containerWidth = 600;
      const containerHeight = 400;
      const imageAspect = item.originalDimensions.width / item.originalDimensions.height;
      const containerAspect = containerWidth / containerHeight;

      let displayWidth, displayHeight, scale;
      if (imageAspect > containerAspect) {
        displayWidth = containerWidth;
        displayHeight = containerWidth / imageAspect;
        scale = containerWidth / item.originalDimensions.width;
      } else {
        displayHeight = containerHeight;
        displayWidth = containerHeight * imageAspect;
        scale = containerHeight / item.originalDimensions.height;
      }

      const newImageDisplay = {
        x: (containerWidth - displayWidth) / 2,
        y: (containerHeight - displayHeight) / 2,
        width: displayWidth,
        height: displayHeight,
        scale,
      };
      setImageDisplay(newImageDisplay);

      // Initialize crop frame
      const maxFrameSize = Math.min(displayWidth, displayHeight) * 0.6;
      const frameSize = Math.min(maxFrameSize, 250);
      const frameX = newImageDisplay.x + (displayWidth - frameSize) / 2;
      const frameY = newImageDisplay.y + (displayHeight - frameSize) / 2;

      setCropFrame({
        x: frameX,
        y: frameY,
        width: frameSize,
        height: frameSize,
      });
    }
  };

  const handleCropImage = async () => {
    if (!selectedImageId || !canvasRef.current) return;

    const item = batchItems.find(i => i.id === selectedImageId);
    if (!item) return;

    setIsProcessing(true);
    setBatchItems(prev => prev.map(i =>
      i.id === selectedImageId ? { ...i, status: 'ready' as const } : i
    ));

    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');

      const cropX = (cropFrame.x - imageDisplay.x) / imageDisplay.scale;
      const cropY = (cropFrame.y - imageDisplay.y) / imageDisplay.scale;
      const cropWidth = cropFrame.width / imageDisplay.scale;
      const cropHeight = cropFrame.height / imageDisplay.scale;

      canvas.width = item.targetDimensions.width;
      canvas.height = item.targetDimensions.height;

      // Determine MIME type from base64 data
      const detectMimeType = (base64: string): string => {
        if (base64.startsWith('/9j/')) return 'image/jpeg';
        if (base64.startsWith('iVBOR')) return 'image/png';
        if (base64.startsWith('UklGR')) return 'image/webp';
        if (base64.startsWith('PHN2Zy') || base64.startsWith('PD94bWwg')) return 'image/svg+xml';
        return 'image/jpeg'; // fallback
      };

      const mimeType = detectMimeType(item.imageData);

      const img = new window.Image();

      // Enable CORS for SVG images
      if (mimeType === 'image/svg+xml') {
        img.crossOrigin = 'anonymous';
      }

      await new Promise((resolve, reject) => {
        img.onload = () => {
          // For SVG, wait longer to ensure it's fully rendered
          if (mimeType === 'image/svg+xml') {
            setTimeout(resolve, 200);
          } else {
            resolve(null);
          }
        };
        img.onerror = reject;
        img.src = `data:${mimeType};base64,${item.imageData}`;
      });

      const validCropX = Math.round(Math.max(0, cropX));
      const validCropY = Math.round(Math.max(0, cropY));
      const maxCropWidth = item.originalDimensions.width - validCropX;
      const maxCropHeight = item.originalDimensions.height - validCropY;
      const validCropWidth = Math.round(Math.min(cropWidth, maxCropWidth));
      const validCropHeight = Math.round(Math.min(cropHeight, maxCropHeight));

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Set white background for transparency
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // For SVG, use the natural dimensions from the loaded image
      const sourceWidth = img.naturalWidth || item.originalDimensions.width;
      const sourceHeight = img.naturalHeight || item.originalDimensions.height;

      // Calculate the scale factor between original dimensions and natural dimensions
      const scaleX = sourceWidth / item.originalDimensions.width;
      const scaleY = sourceHeight / item.originalDimensions.height;

      // Adjust crop coordinates for SVG scaling
      const adjustedCropX = validCropX * scaleX;
      const adjustedCropY = validCropY * scaleY;
      const adjustedCropWidth = validCropWidth * scaleX;
      const adjustedCropHeight = validCropHeight * scaleY;

      ctx.drawImage(
        img,
        adjustedCropX,
        adjustedCropY,
        adjustedCropWidth,
        adjustedCropHeight,
        0,
        0,
        item.targetDimensions.width,
        item.targetDimensions.height
      );

      const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.9);
      const croppedSize = Math.round((croppedDataUrl.length * 3) / 4);

      setBatchItems(prev => prev.map(i =>
        i.id === selectedImageId
          ? { ...i, status: 'completed' as const, croppedData: croppedDataUrl, croppedSize }
          : i
      ));
      setTotalCompleted(prev => prev + 1);
    } catch (error) {
      setBatchItems(prev => prev.map(i =>
        i.id === selectedImageId
          ? { ...i, status: 'error' as const, error: error instanceof Error ? error.message : 'Crop failed' }
          : i
      ));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadAll = async () => {
    const completedItems = batchItems.filter(item => item.status === 'completed' && item.croppedData);
    if (completedItems.length === 0) return;

    const zip = new JSZip();
    completedItems.forEach((item) => {
      const base64Data = item.croppedData!.replace(/^data:image\/\w+;base64,/, '');
      zip.file(`cropped-${item.filename}`, base64Data, { base64: true });
    });

    const content = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `cropped-images-${Date.now()}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleReset = () => {
    batchItems.forEach(item => URL.revokeObjectURL(item.previewUrl));
    setBatchItems([]);
    setSelectedImageId(null);
    setTotalCompleted(0);
  };

  const selectedItem = selectedImageId ? batchItems.find(i => i.id === selectedImageId) : null;
  const completedCount = batchItems.filter(i => i.status === 'completed').length;

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
              className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center"
            >
              <FileArchive className="w-5 h-5 text-green-600" />
            </motion.div>
            <h1 className="text-3xl font-bold text-gray-900">Batch Manual Cropping</h1>
          </div>
          <p className="text-lg text-gray-600 mb-4">
            Upload multiple images and crop each one manually with precision control
          </p>
          <div className="max-w-2xl mx-auto bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-left">
                <p className="text-sm text-blue-900 font-medium mb-2">How Batch Cropping Works:</p>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Upload multiple images at once</li>
                  <li>• Click on any image in the list to select it</li>
                  <li>• Manually adjust the crop frame for that specific image</li>
                  <li>• Set custom dimensions for each image individually</li>
                  <li>• Process each image one by one with your custom settings</li>
                  <li>• Download all cropped images as a ZIP file</li>
                </ul>
              </div>
            </div>
          </div>
        </motion.header>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="max-w-2xl mx-auto"
        >
          <ImageUploader
            onImageUpload={(file) => handleBatchImageUpload([file])}
            onBatchImageUpload={handleBatchImageUpload}
            isUploading={false}
            uploadProgress={0}
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
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Batch Manual Cropping</h1>
        <p className="text-sm text-gray-600">
          Select each image below to crop it manually • {completedCount} of {batchItems.length} completed
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
                <strong>How to use:</strong> Click any image below to select it, adjust the crop frame and dimensions, then click &quot;Crop This Image&quot;. Repeat for each image you want to crop.
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
                    className={`w-full p-3 rounded-lg border-2 transition-all ${
                      selectedImageId === item.id
                        ? 'border-blue-500 bg-blue-50'
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
                          {item.originalDimensions.width} × {item.originalDimensions.height}
                        </p>
                        <div className="flex items-center gap-1 mt-1">
                          {item.status === 'pending' && <Clock className="w-3 h-3 text-gray-400" />}
                          {item.status === 'ready' && <Clock className="w-3 h-3 text-blue-500" />}
                          {item.status === 'completed' && <Check className="w-3 h-3 text-green-500" />}
                          {item.status === 'error' && <AlertCircle className="w-3 h-3 text-red-500" />}
                          <span className="text-xs text-gray-600 capitalize">{item.status}</span>
                        </div>
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>

              {completedCount > 0 && (
                <Button
                  onClick={handleDownloadAll}
                  className="w-full mt-4 bg-green-600 hover:bg-green-700"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download All ({completedCount})
                </Button>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Crop Editor */}
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
                  <CardTitle>Crop: {selectedItem.filename}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    className="relative bg-slate-200 rounded-lg overflow-hidden"
                    style={{ width: '600px', height: '400px' }}
                  >
                    <img
                      src={selectedItem.previewUrl}
                      alt={selectedItem.filename}
                      className="absolute select-none"
                      style={{
                        left: imageDisplay.x,
                        top: imageDisplay.y,
                        width: imageDisplay.width,
                        height: imageDisplay.height,
                        objectFit: 'contain',
                      }}
                      draggable={false}
                    />
                    <div className="absolute inset-0 bg-black/40 pointer-events-none" />

                    {/* Crop Frame - simplified for this example */}
                    <div
                      className="absolute border-2 border-white shadow-lg cursor-move"
                      style={{
                        left: cropFrame.x,
                        top: cropFrame.y,
                        width: cropFrame.width,
                        height: cropFrame.height,
                        boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)',
                      }}
                    >
                      <div className="absolute -top-8 left-0 bg-black/70 text-white text-xs px-2 py-1 rounded">
                        {Math.round(cropFrame.width / imageDisplay.scale)} × {Math.round(cropFrame.height / imageDisplay.scale)}
                      </div>
                    </div>
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
                  showAIMessage={false}
                />

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Actions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Button
                      onClick={handleCropImage}
                      disabled={isProcessing || selectedItem.status === 'completed'}
                      className="w-full bg-green-600 hover:bg-green-700"
                    >
                      <Scissors className="h-4 w-4 mr-2" />
                      {selectedItem.status === 'completed' ? 'Cropped ✓' : 'Crop This Image'}
                    </Button>
                  </CardContent>
                </Card>
              </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                <Card>
                  <CardContent className="py-20 text-center">
                    <Scissors className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">Select an image from the list to start cropping</p>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>

      <canvas ref={canvasRef} className="hidden" />
    </motion.div>
  );
}

interface ManualCroppingContentProps {
  setBatchFiles: (files: File[]) => void;
  preUploadedFile?: File;
  onEditAgain?: (imageData: string, metadata: {filename: string, mimetype: string}) => void;
}

function ManualCroppingContent({ setBatchFiles, preUploadedFile, onEditAgain }: ManualCroppingContentProps) {
  const [targetDimensions, setTargetDimensions] = useState<ImageDimensions>({
    width: 1080,
    height: 1920,
  });

  const [cropFrame, setCropFrame] = useState<CropFrame>({
    x: 100,
    y: 100,
    width: 300,
    height: 400,
  });

  const [imageDisplay, setImageDisplay] = useState<ImageDisplay>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    scale: 1,
  });

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [initialCropFrame, setInitialCropFrame] = useState<CropFrame | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [croppedImageUrl, setCroppedImageUrl] = useState<string | null>(null);
  const [isImageHovered, setIsImageHovered] = useState(false);
  const [isDimensionSelected, setIsDimensionSelected] = useState(false);
  const [showFormatDialog, setShowFormatDialog] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [croppedImageData, setCroppedImageData] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [originalFile, setOriginalFile] = useState<File | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const {
    isUploading,
    uploadedImage,
    error: uploadError,
    validationError,
    uploadProgress,
    uploadFile,
    reset: resetUpload,
  } = useFileUpload();

  // Auto-upload pre-uploaded file
  useEffect(() => {
    if (preUploadedFile && !uploadedImage) {
      setOriginalFile(preUploadedFile);
      uploadFile(preUploadedFile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleImageUpload = (file: File) => {
    setOriginalFile(file);
    uploadFile(file);
    setCroppedImageUrl(null);
  };

  const handleBatchImageUpload = (files: File[]) => {
    setBatchFiles(files);
  };

  useEffect(() => {
    if (uploadedImage) {
      // Calculate how to display the image to fit in the container
      const containerWidth = 600;
      const containerHeight = 400;
      const imageAspect = uploadedImage.originalDimensions.width / uploadedImage.originalDimensions.height;
      const containerAspect = containerWidth / containerHeight;

      let displayWidth, displayHeight, scale;
      if (imageAspect > containerAspect) {
        // Image is wider - fit to width
        displayWidth = containerWidth;
        displayHeight = containerWidth / imageAspect;
        scale = containerWidth / uploadedImage.originalDimensions.width;
      } else {
        // Image is taller - fit to height
        displayHeight = containerHeight;
        displayWidth = containerHeight * imageAspect;
        scale = containerHeight / uploadedImage.originalDimensions.height;
      }

      setImageDisplay({
        x: (containerWidth - displayWidth) / 2,
        y: (containerHeight - displayHeight) / 2,
        width: displayWidth,
        height: displayHeight,
        scale,
      });

      // Initialize crop frame as a square in the center
      const maxFrameSize = Math.min(displayWidth, displayHeight) * 0.6;
      const frameSize = Math.min(maxFrameSize, 250);

      // Center the frame within the image area
      const imageX = (containerWidth - displayWidth) / 2;
      const imageY = (containerHeight - displayHeight) / 2;
      const frameX = imageX + (displayWidth - frameSize) / 2;
      const frameY = imageY + (displayHeight - frameSize) / 2;

      setCropFrame({
        x: frameX,
        y: frameY,
        width: frameSize,
        height: frameSize,
      });
    }
  }, [uploadedImage]);

  const updateCropFrameForDimensions = useCallback((dimensions: ImageDimensions, currentImageDisplay: ImageDisplay) => {
    // Only update if we have valid image display data
    if (!currentImageDisplay || currentImageDisplay.width <= 0 || currentImageDisplay.height <= 0) {
      return;
    }

    const targetAspectRatio = dimensions.width / dimensions.height;

    // Calculate new frame size while respecting image bounds
    const maxFrameWidth = currentImageDisplay.width * 0.8;
    const maxFrameHeight = currentImageDisplay.height * 0.8;

    let newFrameWidth, newFrameHeight;

    // Calculate frame size based on target aspect ratio
    if (targetAspectRatio > 1) {
      // Landscape - width is the limiting factor
      newFrameWidth = Math.min(maxFrameWidth, 400);
      newFrameHeight = newFrameWidth / targetAspectRatio;

      // If height exceeds bounds, scale down
      if (newFrameHeight > maxFrameHeight) {
        newFrameHeight = maxFrameHeight;
        newFrameWidth = newFrameHeight * targetAspectRatio;
      }
    } else {
      // Portrait or square - height is the limiting factor
      newFrameHeight = Math.min(maxFrameHeight, 400);
      newFrameWidth = newFrameHeight * targetAspectRatio;

      // If width exceeds bounds, scale down
      if (newFrameWidth > maxFrameWidth) {
        newFrameWidth = maxFrameWidth;
        newFrameHeight = newFrameWidth / targetAspectRatio;
      }
    }

    // Center the frame within the image area
    const frameX = currentImageDisplay.x + (currentImageDisplay.width - newFrameWidth) / 2;
    const frameY = currentImageDisplay.y + (currentImageDisplay.height - newFrameHeight) / 2;

    setCropFrame({
      x: frameX,
      y: frameY,
      width: newFrameWidth,
      height: newFrameHeight,
    });
  }, []);

  // Update crop frame only when dimensions are explicitly selected
  useEffect(() => {
    if (isDimensionSelected && imageDisplay && imageDisplay.width > 0 && imageDisplay.height > 0) {
      updateCropFrameForDimensions(targetDimensions, imageDisplay);
    }
  }, [isDimensionSelected, imageDisplay, targetDimensions, updateCropFrameForDimensions]);

  const handleReset = useCallback(() => {
    resetUpload();
    setCroppedImageUrl(null);
    setIsDimensionSelected(false);
    setCropFrame({
      x: 100,
      y: 100,
      width: 300,
      height: 300,
    });
    setImageDisplay({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      scale: 1,
    });
  }, [resetUpload]);

  const handleCrop = useCallback(async () => {
    if (!uploadedImage || !canvasRef.current || !imageDisplay) {
      console.log('Missing requirements:', { uploadedImage: !!uploadedImage, canvas: !!canvasRef.current, imageDisplay: !!imageDisplay });
      return;
    }

    setIsProcessing(true);

    try {
      // Calculate crop coordinates relative to the original image
      const cropX = (cropFrame.x - imageDisplay.x) / imageDisplay.scale;
      const cropY = (cropFrame.y - imageDisplay.y) / imageDisplay.scale;
      const cropWidth = cropFrame.width / imageDisplay.scale;
      const cropHeight = cropFrame.height / imageDisplay.scale;

      // Set output dimensions - use target dimensions if selected, otherwise use actual crop size
      const outputWidth = isDimensionSelected ? targetDimensions.width : Math.round(cropWidth);
      const outputHeight = isDimensionSelected ? targetDimensions.height : Math.round(cropHeight);

      // Validate crop coordinates
      const validCropX = Math.round(Math.max(0, cropX));
      const validCropY = Math.round(Math.max(0, cropY));
      const maxCropWidth = uploadedImage.originalDimensions.width - validCropX;
      const maxCropHeight = uploadedImage.originalDimensions.height - validCropY;
      const validCropWidth = Math.round(Math.min(cropWidth, maxCropWidth));
      const validCropHeight = Math.round(Math.min(cropHeight, maxCropHeight));

      // Check if we should use blob workflow (file > 3MB)
      const SIZE_THRESHOLD = 3 * 1024 * 1024; // 3MB
      const usesBlobWorkflow = originalFile && originalFile.size > SIZE_THRESHOLD;

      if (usesBlobWorkflow && originalFile) {
        // BLOB WORKFLOW for large files
        console.log('Using blob workflow for large file:', originalFile.size);

        // Step 1: Upload file to Vercel Blob
        const blob = await upload(originalFile.name, originalFile, {
          access: 'public',
          handleUploadUrl: '/api/get-upload-token',
          multipart: true,
        });

        console.log('File uploaded to blob:', blob.url);

        // Step 2: Request processing with blob URL
        const response = await fetch('/api/process-from-blob', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            blobUrl: blob.url,
            operation: 'crop',
            params: {
              cropArea: {
                x: validCropX,
                y: validCropY,
                width: validCropWidth,
                height: validCropHeight,
              },
              targetWidth: outputWidth,
              targetHeight: outputHeight,
            },
          }),
        });

        if (!response.ok) {
          throw new Error('Crop processing failed');
        }

        const result = await response.json();

        if (result.success) {
          // Create blob URL for preview
          const processedBlob = new Blob(
            [Buffer.from(result.data.imageData, 'base64')],
            { type: result.data.mimetype }
          );
          const url = URL.createObjectURL(processedBlob);
          setCroppedImageUrl(url);
          setCroppedImageData(result.data.imageData);
        } else {
          throw new Error(result.error || 'Processing failed');
        }

        setIsProcessing(false);
      } else {
        // TRADITIONAL CANVAS WORKFLOW for small files
        console.log('Using canvas workflow for small file');

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          console.error('Could not get canvas context');
          setIsProcessing(false);
          return;
        }

        canvas.width = outputWidth;
        canvas.height = outputHeight;

        const img = new window.Image();

        // Enable CORS for SVG images to prevent tainted canvas
        if (uploadedImage.mimetype === 'image/svg+xml') {
          img.crossOrigin = 'anonymous';
        }

        img.onload = async () => {
          // For SVG, wait longer to ensure it's fully rendered
          if (uploadedImage.mimetype === 'image/svg+xml') {
            await new Promise(resolve => setTimeout(resolve, 200));
          }

          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // Set white background for transparency
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // For SVG, use the natural dimensions from the loaded image
          const sourceWidth = img.naturalWidth || uploadedImage.originalDimensions.width;
          const sourceHeight = img.naturalHeight || uploadedImage.originalDimensions.height;

          // Calculate the scale factor between original dimensions and natural dimensions
          const scaleX = sourceWidth / uploadedImage.originalDimensions.width;
          const scaleY = sourceHeight / uploadedImage.originalDimensions.height;

          // Adjust crop coordinates for SVG scaling
          const adjustedCropX = validCropX * scaleX;
          const adjustedCropY = validCropY * scaleY;
          const adjustedCropWidth = validCropWidth * scaleX;
          const adjustedCropHeight = validCropHeight * scaleY;

          // Draw the cropped portion to the canvas
          ctx.drawImage(
            img,
            adjustedCropX,
            adjustedCropY,
            adjustedCropWidth,
            adjustedCropHeight,
            0,
            0,
            outputWidth,
            outputHeight
          );

          canvas.toBlob(async (blob) => {
            if (blob) {
              try {
                const formData = new FormData();
                formData.append('image', blob, 'cropped-image.jpg');
                formData.append('quality', '85');
                formData.append('format', 'jpg');

                const response = await fetch('/api/compress', {
                  method: 'POST',
                  body: formData,
                });

                const result = await safeJsonParse(response);

                if (result.success) {
                  const compressedBlob = new Blob(
                    [Buffer.from(result.data.imageData, 'base64')],
                    { type: result.data.mimetype }
                  );
                  const url = URL.createObjectURL(compressedBlob);
                  setCroppedImageUrl(url);
                  setCroppedImageData(result.data.imageData);
                } else {
                  const url = URL.createObjectURL(blob);
                  setCroppedImageUrl(url);
                  // Convert blob to base64 for fallback
                  const reader = new FileReader();
                  reader.onloadend = () => {
                    const base64 = (reader.result as string).split(',')[1];
                    setCroppedImageData(base64);
                  };
                  reader.readAsDataURL(blob);
                }
              } catch (compressionError) {
                console.warn('Compression failed, using original:', compressionError);
                const url = URL.createObjectURL(blob);
                setCroppedImageUrl(url);
                // Convert blob to base64 for fallback
                const reader = new FileReader();
                reader.onloadend = () => {
                  const base64 = (reader.result as string).split(',')[1];
                  setCroppedImageData(base64);
                };
                reader.readAsDataURL(blob);
              }
            }
            setIsProcessing(false);
          }, 'image/jpeg', 0.9);
        };

        img.onerror = (error) => {
          console.error('Image failed to load:', error);
          setIsProcessing(false);
        };

        img.src = `data:${uploadedImage.mimetype};base64,${uploadedImage.imageData}`;
      }
    } catch (error) {
      console.error('Error cropping image:', error);
      setIsProcessing(false);
    }
  }, [uploadedImage, targetDimensions, cropFrame, imageDisplay, isDimensionSelected, originalFile]);

  // Handle crop frame movement
  const handleFrameMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({
      x: e.clientX - cropFrame.x,
      y: e.clientY - cropFrame.y,
    });
  }, [cropFrame]);

  // Handle crop frame resizing
  const handleResizeMouseDown = useCallback((e: React.MouseEvent, handle: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizeHandle(handle);
    setInitialCropFrame({ ...cropFrame });
    setDragStart({
      x: e.clientX,
      y: e.clientY,
    });
  }, [cropFrame]);

  // Global mouse handlers for dragging and resizing
  const handleGlobalMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;

      // Constrain frame to image bounds (not container bounds)
      const maxX = Math.min(600 - cropFrame.width, imageDisplay.x + imageDisplay.width - cropFrame.width);
      const maxY = Math.min(400 - cropFrame.height, imageDisplay.y + imageDisplay.height - cropFrame.height);
      const minX = Math.max(0, imageDisplay.x);
      const minY = Math.max(0, imageDisplay.y);

      setCropFrame(prev => ({
        ...prev,
        x: Math.max(minX, Math.min(maxX, newX)),
        y: Math.max(minY, Math.min(maxY, newY)),
      }));
    } else if (isResizing && resizeHandle && initialCropFrame) {
      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;
      const targetAspectRatio = isDimensionSelected ? targetDimensions.width / targetDimensions.height : 0;

      const newFrame = { ...initialCropFrame };

      // Handle corner and edge resizing
      if (resizeHandle.includes('e') || resizeHandle.includes('w') || resizeHandle.includes('n') || resizeHandle.includes('s')) {
        let newWidth = newFrame.width;
        let newHeight = newFrame.height;

        // Check if it's a corner handle (diagonal resize)
        const isCorner = (resizeHandle.includes('n') || resizeHandle.includes('s')) &&
                         (resizeHandle.includes('e') || resizeHandle.includes('w'));

        if (isCorner) {
          // Diagonal resize - adjust both width and height
          if (resizeHandle.includes('e')) {
            newWidth = initialCropFrame.width + deltaX;
          } else if (resizeHandle.includes('w')) {
            newWidth = initialCropFrame.width - deltaX;
          }

          if (resizeHandle.includes('s')) {
            newHeight = initialCropFrame.height + deltaY;
          } else if (resizeHandle.includes('n')) {
            newHeight = initialCropFrame.height - deltaY;
          }

          // Maintain aspect ratio only if dimension is selected
          if (isDimensionSelected && targetAspectRatio > 0) {
            // Use the larger delta to determine which dimension to prioritize
            if (Math.abs(deltaX) > Math.abs(deltaY)) {
              // Width change is larger, adjust height to match
              newHeight = newWidth / targetAspectRatio;
            } else {
              // Height change is larger, adjust width to match
              newWidth = newHeight * targetAspectRatio;
            }
          }
        } else {
          // Edge resize - only one dimension changes
          if (resizeHandle.includes('e')) {
            newWidth = initialCropFrame.width + deltaX;
          } else if (resizeHandle.includes('w')) {
            newWidth = initialCropFrame.width - deltaX;
          } else if (resizeHandle.includes('s')) {
            newHeight = initialCropFrame.height + deltaY;
          } else if (resizeHandle.includes('n')) {
            newHeight = initialCropFrame.height - deltaY;
          }

          // Maintain aspect ratio only if dimension is selected
          if (isDimensionSelected && targetAspectRatio > 0) {
            if (resizeHandle.includes('e') || resizeHandle.includes('w')) {
              // Width-based resize
              newHeight = newWidth / targetAspectRatio;
            } else {
              // Height-based resize
              newWidth = newHeight * targetAspectRatio;
            }
          }
        }

        // Apply position changes for corners that move the origin
        if (resizeHandle.includes('w')) {
          newFrame.x = initialCropFrame.x + (initialCropFrame.width - newWidth);
        }
        if (resizeHandle.includes('n')) {
          newFrame.y = initialCropFrame.y + (initialCropFrame.height - newHeight);
        }

        newFrame.width = newWidth;
        newFrame.height = newHeight;
      }

      // Enforce minimum size
      const minSize = 40;
      if (newFrame.width < minSize || newFrame.height < minSize) {
        if (isDimensionSelected && targetAspectRatio > 0) {
          // Maintain aspect ratio
          if (targetAspectRatio > 1) {
            // Landscape - set minimum width
            newFrame.width = minSize;
            newFrame.height = minSize / targetAspectRatio;
          } else {
            // Portrait/Square - set minimum height
            newFrame.height = minSize;
            newFrame.width = minSize * targetAspectRatio;
          }
        } else {
          // Free resize - just enforce minimum
          if (newFrame.width < minSize) newFrame.width = minSize;
          if (newFrame.height < minSize) newFrame.height = minSize;
        }

        // Adjust position if needed
        if (resizeHandle.includes('w')) {
          newFrame.x = initialCropFrame.x + initialCropFrame.width - newFrame.width;
        }
        if (resizeHandle.includes('n')) {
          newFrame.y = initialCropFrame.y + initialCropFrame.height - newFrame.height;
        }
      }

      // Constrain to image bounds
      const imageRight = imageDisplay.x + imageDisplay.width;
      const imageBottom = imageDisplay.y + imageDisplay.height;

      // Adjust position to stay within bounds
      newFrame.x = Math.max(imageDisplay.x, Math.min(imageRight - newFrame.width, newFrame.x));
      newFrame.y = Math.max(imageDisplay.y, Math.min(imageBottom - newFrame.height, newFrame.y));

      // Adjust size if frame extends beyond image bounds
      newFrame.width = Math.min(imageRight - newFrame.x, newFrame.width);
      newFrame.height = Math.min(imageBottom - newFrame.y, newFrame.height);

      // Re-adjust to maintain aspect ratio if size was constrained (only if dimension selected)
      if (isDimensionSelected && targetAspectRatio > 0) {
        const constrainedAspectRatio = newFrame.width / newFrame.height;
        if (Math.abs(constrainedAspectRatio - targetAspectRatio) > 0.01) {
          if (constrainedAspectRatio > targetAspectRatio) {
            // Width is too large, reduce it
            newFrame.width = newFrame.height * targetAspectRatio;
          } else {
            // Height is too large, reduce it
            newFrame.height = newFrame.width / targetAspectRatio;
          }
        }
      }

      setCropFrame(newFrame);
    }
  }, [isDragging, isResizing, dragStart, cropFrame, resizeHandle, initialCropFrame, targetDimensions, imageDisplay, isDimensionSelected]);

  const handleGlobalMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(false);
    setResizeHandle(null);
    setInitialCropFrame(null);
  }, []);

  // Cleanup and keyboard shortcuts
  useEffect(() => {
    if (!uploadedImage) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'r':
        case 'R':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleReset();
          }
          break;
        case ' ':
          e.preventDefault();
          if (!isProcessing) {
            handleCrop();
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setCropFrame(prev => ({
            ...prev,
            x: Math.max(imageDisplay.x, prev.x - 10),
          }));
          break;
        case 'ArrowRight':
          e.preventDefault();
          setCropFrame(prev => ({
            ...prev,
            x: Math.min(imageDisplay.x + imageDisplay.width - prev.width, prev.x + 10),
          }));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setCropFrame(prev => ({
            ...prev,
            y: Math.max(imageDisplay.y, prev.y - 10),
          }));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setCropFrame(prev => ({
            ...prev,
            y: Math.min(imageDisplay.y + imageDisplay.height - prev.height, prev.y + 10),
          }));
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [uploadedImage, isProcessing, handleReset, handleCrop, imageDisplay]);

  const handleDimensionsChange = (dimensions: ImageDimensions) => {
    setTargetDimensions(dimensions);
    setIsDimensionSelected(true);
    updateCropFrameForDimensions(dimensions, imageDisplay);
  };

  const handleDownload = () => {
    if (!croppedImageUrl || !croppedImageData) return;
    setShowFormatDialog(true);
  };

  const handleFormatDownload = async (format: ImageFormat, quality: number) => {
    if (!croppedImageData || !uploadedImage) return;

    setIsConverting(true);
    try {
      // Check if format is JPEG (current format)
      if (format === 'jpeg') {
        // Direct download if same format
        const link = document.createElement('a');
        link.href = `data:image/jpeg;base64,${croppedImageData}`;
        link.download = `cropped-${uploadedImage.filename}.${format}`;
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
          imageData: croppedImageData,
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
      link.download = `cropped-${uploadedImage.filename}.${format}`;
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
            className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center"
          >
            <Scissors className="w-5 h-5 text-green-600" />
          </motion.div>
          <h1 className="text-3xl font-bold text-gray-900">
            Manual Cropping
          </h1>
        </div>
        <p className="text-sm text-gray-600">
          Precise manual control with drag-and-zoom functionality for perfect cropping
        </p>
      </motion.header>

      <div className="px-2">
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
                uploadProgress={uploadProgress}
                supportsBatch={true}
              />
            )}
            </motion.div>
          ) : (
            <motion.div
              key="cropping"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.4 }}
              className="space-y-8"
            >
              {/* Main Cropping Interface */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                {/* Crop Preview - Main Focus */}
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.2 }}
                  className="xl:col-span-2 space-y-6"
                >
                <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-xl font-semibold">
                        {croppedImageUrl ? 'Preview' : 'Crop Preview'}
                      </CardTitle>
                      {!croppedImageUrl && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-slate-600">Crop Mode: Active</span>
                          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="relative bg-slate-100 rounded-2xl overflow-hidden flex items-center justify-center" style={{ aspectRatio: '16/10', minHeight: '500px' }}>
                      {isProcessing ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-white/90 backdrop-blur-sm">
                          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
                          <p className="text-slate-700 font-medium">Processing your crop...</p>
                        </div>
                      ) : croppedImageUrl ? (
                        <div className="absolute inset-0 grid grid-cols-2 gap-6 p-6">
                          {/* Original Image - Left Half */}
                          <div className="relative flex flex-col bg-white rounded-lg border border-gray-200 overflow-hidden">
                            <div className="py-3 border-b border-gray-200">
                              <h3 className="text-base font-semibold text-gray-900 text-center">Original Image</h3>
                            </div>
                            <div className="flex-1 relative bg-gray-50 p-4">
                              <Image
                                src={`data:${uploadedImage.mimetype};base64,${uploadedImage.imageData}`}
                                alt="Original image"
                                fill
                                className="object-contain"
                                unoptimized={uploadedImage.mimetype === 'image/svg+xml'}
                              />
                            </div>
                            <div className="py-3 border-t border-gray-200 bg-white">
                              <p className="text-sm text-gray-600 text-center">
                                {uploadedImage.originalDimensions.width} × {uploadedImage.originalDimensions.height}
                              </p>
                            </div>
                          </div>

                          {/* Cropped Image - Right Half */}
                          <div className="relative flex flex-col bg-white rounded-lg border border-gray-200 overflow-hidden">
                            <div className="py-3 border-b border-gray-200">
                              <h3 className="text-base font-semibold text-gray-900 text-center">Processed Result</h3>
                            </div>
                            <div className="flex-1 relative bg-gray-50 p-4">
                              <Image
                                src={croppedImageUrl}
                                alt="Cropped result"
                                fill
                                className="object-contain"
                              />
                            </div>
                            <div className="py-3 border-t border-gray-200 bg-white">
                              <p className="text-sm text-gray-600 text-center">
                                {isDimensionSelected
                                  ? `${targetDimensions.width} × ${targetDimensions.height}`
                                  : `${Math.round(cropFrame.width / imageDisplay.scale)} × ${Math.round(cropFrame.height / imageDisplay.scale)}`
                                }
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="relative w-full h-full bg-slate-200 rounded-lg overflow-hidden"
                             style={{ width: '600px', height: '400px' }}
                             onMouseMove={handleGlobalMouseMove}
                             onMouseUp={handleGlobalMouseUp}>

                          {/* Main Image - Stationary */}
                          {uploadedImage?.imageData && (
                            <img
                              ref={imageRef}
                              src={`data:${uploadedImage.mimetype};base64,${uploadedImage.imageData}`}
                              alt="Original image"
                              className="absolute select-none"
                              style={{
                                left: imageDisplay.x,
                                top: imageDisplay.y,
                                width: imageDisplay.width,
                                height: imageDisplay.height,
                                objectFit: 'contain',
                              }}
                              draggable={false}
                            />
                          )}

                          {/* Semi-transparent overlay */}
                          <div className="absolute inset-0 bg-black/40 pointer-events-none" />

                          {/* Crop Frame */}
                          <div
                            className="absolute border-2 border-white shadow-lg cursor-move bg-transparent"
                            style={{
                              left: cropFrame.x,
                              top: cropFrame.y,
                              width: cropFrame.width,
                              height: cropFrame.height,
                              boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)',
                            }}
                            onMouseDown={handleFrameMouseDown}
                          >
                            {/* Resize handles */}
                            {/* Top-left */}
                            <div
                              className="absolute w-3 h-3 bg-white border border-gray-400 cursor-nw-resize -top-1 -left-1"
                              onMouseDown={(e) => handleResizeMouseDown(e, 'nw')}
                            />
                            {/* Top-right */}
                            <div
                              className="absolute w-3 h-3 bg-white border border-gray-400 cursor-ne-resize -top-1 -right-1"
                              onMouseDown={(e) => handleResizeMouseDown(e, 'ne')}
                            />
                            {/* Bottom-left */}
                            <div
                              className="absolute w-3 h-3 bg-white border border-gray-400 cursor-sw-resize -bottom-1 -left-1"
                              onMouseDown={(e) => handleResizeMouseDown(e, 'sw')}
                            />
                            {/* Bottom-right */}
                            <div
                              className="absolute w-3 h-3 bg-white border border-gray-400 cursor-se-resize -bottom-1 -right-1"
                              onMouseDown={(e) => handleResizeMouseDown(e, 'se')}
                            />

                            {/* Edge handles */}
                            {/* Top */}
                            <div
                              className="absolute w-6 h-2 bg-white border border-gray-400 cursor-n-resize -top-1 left-1/2 transform -translate-x-1/2"
                              onMouseDown={(e) => handleResizeMouseDown(e, 'n')}
                            />
                            {/* Bottom */}
                            <div
                              className="absolute w-6 h-2 bg-white border border-gray-400 cursor-s-resize -bottom-1 left-1/2 transform -translate-x-1/2"
                              onMouseDown={(e) => handleResizeMouseDown(e, 's')}
                            />
                            {/* Left */}
                            <div
                              className="absolute w-2 h-6 bg-white border border-gray-400 cursor-w-resize -left-1 top-1/2 transform -translate-y-1/2"
                              onMouseDown={(e) => handleResizeMouseDown(e, 'w')}
                            />
                            {/* Right */}
                            <div
                              className="absolute w-2 h-6 bg-white border border-gray-400 cursor-e-resize -right-1 top-1/2 transform -translate-y-1/2"
                              onMouseDown={(e) => handleResizeMouseDown(e, 'e')}
                            />

                            {/* Crop info overlay */}
                            <div className="absolute -top-8 left-0 bg-black/70 text-white text-xs px-2 py-1 rounded">
                              {Math.round(cropFrame.width / imageDisplay.scale)} × {Math.round(cropFrame.height / imageDisplay.scale)}
                              <span className="ml-2 opacity-75">
                                ({isDimensionSelected
                                  ? (targetDimensions.width / targetDimensions.height).toFixed(2)
                                  : (cropFrame.width / cropFrame.height).toFixed(2)
                                })
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                  </CardContent>
                </Card>
                </motion.div>

                {/* Controls Sidebar */}
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.3 }}
                  className="space-y-3"
                >
                {/* Image Info */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.4 }}
                >
                  <Card className="border-0 shadow-lg">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">Image Info</CardTitle>
                        <Button variant="outline" size="sm" onClick={handleReset} className="h-8">
                          <RotateCcw className="h-3 w-3 mr-1" />
                          Reset
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <div className="text-sm font-medium text-slate-900 break-all">{uploadedImage.filename}</div>
                        <div className="text-xs text-slate-500">
                          {uploadedImage.originalDimensions.width} × {uploadedImage.originalDimensions.height}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>

                {/* Dimensions */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.5 }}
                >
                  <DimensionSelector
                    originalDimensions={uploadedImage.originalDimensions}
                    targetDimensions={targetDimensions}
                    onDimensionsChange={handleDimensionsChange}
                    showAIMessage={false}
                  />
                </motion.div>

                {/* Keyboard Shortcuts */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.6 }}
                >
                  <Card className="border-0 shadow-lg">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Keyboard className="w-4 h-4" />
                        Keyboard Shortcuts
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="text-xs space-y-1">
                        <div className="flex justify-between">
                          <span className="text-slate-600">Move Frame</span>
                          <kbd className="px-2 py-1 bg-slate-100 rounded text-slate-800">↑↓←→</kbd>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Crop</span>
                          <kbd className="px-2 py-1 bg-slate-100 rounded text-slate-800">Space</kbd>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Reset</span>
                          <kbd className="px-2 py-1 bg-slate-100 rounded text-slate-800">Ctrl+R</kbd>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>

                {/* Action Buttons */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.7 }}
                  className="space-y-3"
                >
                  {isProcessing ? (
                    <Button
                      onClick={() => setShowCancelDialog(true)}
                      variant="outline"
                      className="w-full h-12 border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 font-medium rounded-lg transition-all duration-200"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Cancel Processing
                    </Button>
                  ) : (
                    <Button
                      onClick={handleCrop}
                      disabled={!!croppedImageUrl}
                      className="w-full h-12 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium rounded-lg shadow-lg hover:shadow-xl transition-all duration-200"
                    >
                      {croppedImageUrl ? (
                        <>Cropped ✓</>
                      ) : (
                        <>
                          <Scissors className="h-4 w-4 mr-2" />
                          Crop Image
                        </>
                      )}
                    </Button>
                  )}

                  <AnimatePresence>
                    {croppedImageUrl && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-2"
                      >
                        <Button
                          variant="outline"
                          onClick={handleDownload}
                          className="w-full h-12 border-2 hover:bg-slate-50 font-medium rounded-lg transition-all duration-200"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download Cropped Image
                        </Button>
                        <Button
                          onClick={() => {
                            if (onEditAgain && croppedImageData && uploadedImage) {
                              // Pass the cropped image to edit again with a different mode
                              const mimeType = uploadedImage.mimetype || 'image/jpeg';
                              onEditAgain(croppedImageData, {
                                filename: uploadedImage.filename,
                                mimetype: mimeType
                              });
                            } else {
                              // Fallback to reset
                              setCroppedImageUrl(null);
                              setCroppedImageData(null);
                              resetUpload();
                            }
                          }}
                          variant="outline"
                          className="w-full h-12 border-blue-300 text-blue-600 hover:bg-blue-50 font-medium rounded-lg transition-all duration-200"
                        >
                          <Edit2 className="h-4 w-4 mr-2" />
                          Edit Again
                        </Button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
                </motion.div>
              </div>

            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {uploadError && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="max-w-2xl mx-auto"
            >
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-6">
                <p className="text-red-600 text-sm">{uploadError}</p>
              </CardContent>
            </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {croppedImageData && uploadedImage && (
        <FormatDownloadDialog
          isOpen={showFormatDialog}
          onClose={() => setShowFormatDialog(false)}
          onDownload={handleFormatDownload}
          currentFormat="jpeg"
          imageData={`data:image/jpeg;base64,${croppedImageData}`}
          filename={uploadedImage.filename}
        />
      )}

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
          setIsProcessing(false);
        }}
        title="Cancel Cropping?"
        description="Are you sure you want to cancel the manual crop? Any progress will be lost."
      />
    </motion.div>
  );
}