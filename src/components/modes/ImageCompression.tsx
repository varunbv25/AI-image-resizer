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
import { Download, FileArchive, Info, Check, Clock, AlertCircle, Edit2, X } from 'lucide-react';
import JSZip from 'jszip';
import { safeJsonParse } from '@/lib/safeJsonParse';
import { prepareFilesForBatchUpload } from '@/lib/batchUploadHelper';
import { compressImageClientSide } from '@/lib/clientSideCompression';
import { motion, AnimatePresence } from 'framer-motion';
import { FormatDownloadDialog, ImageFormat } from '@/components/FormatDownloadDialog';
import { UnsupportedFormatError } from '@/components/UnsupportedFormatError';
import { CancelDialog } from '@/components/CancelDialog';
import { upload } from '@vercel/blob/client';

// Helper function to extract format from mimetype
const getFormatFromMimetype = (mimetype: string): 'jpeg' | 'png' | 'webp' | 'svg' => {
  const formatMap: Record<string, 'jpeg' | 'png' | 'webp' | 'svg'> = {
    'image/jpeg': 'jpeg',
    'image/jpg': 'jpeg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
  };
  return formatMap[mimetype.toLowerCase()] || 'jpeg';
};

interface ImageCompressionProps {
  onBack: () => void;
  onEditAgain?: (imageData: string, metadata: {filename: string, mimetype: string}) => void;
  preUploadedFiles?: File[];
}

interface CompressionSettings {
  compressionMode: 'quality' | 'filesize';
  quality: number;
  maxFileSize: number;
  maxFileSizeKB: number;
}

export function ImageCompression({ onEditAgain, preUploadedFiles }: ImageCompressionProps) {
  const [compressionMode, setCompressionMode] = useState<'quality' | 'filesize'>('quality');
  const [quality, setQuality] = useState<number>(80); // quality percentage (0-100)
  const [maxFileSize] = useState<number>(40); // percentage of original (fixed value, not user-configurable)
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
  const [batchComparisonBounds, setBatchComparisonBounds] = useState<{ left: number; right: number } | null>(null);

  // Batch processing state
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [batchProcessingStarted, setBatchProcessingStarted] = useState(false);

  // Format selection state
  const [showFormatDialog, setShowFormatDialog] = useState(false);
  const [selectedDownloadId, setSelectedDownloadId] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const sliderRef = useRef<HTMLDivElement>(null);
  const comparisonRef = useRef<HTMLDivElement>(null);
  const originalImageRef = useRef<HTMLImageElement>(null);
  const batchComparisonRef = useRef<HTMLDivElement>(null);
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
        originalFileRef.current = preUploadedFiles[0]; // Store original file for client-side processing
        uploadFile(preUploadedFiles[0]);
        setCompressedImage(null);
        setCompressionError('');
        setIsBatchMode(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleImageUpload = (file: File) => {
    originalFileRef.current = file; // Store original file for client-side processing
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

    // Compress files before storing (prevents payload size errors)
    // 2MB threshold accounts for 33% Base64 overhead (2MB → ~2.66MB)
    const preparedFiles = await prepareFilesForBatchUpload(files, {
      maxSizeMB: 2,
      maxWidthOrHeight: 3072,
      quality: 0.75,
    });

    // Store prepared (compressed if needed) files
    setUploadedFiles(preparedFiles);

    // Create initial batch items with preview URLs and get dimensions
    const itemsPromises = preparedFiles.map(async (file, index) => {
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
        let requestBody: {
          imageData?: string;
          blobUrl?: string;
          maxFileSizePercent?: number;
          maxFileSizeKB?: number;
          quality?: number;
          originalSize: number;
        };

        // Check if file is large enough to warrant blob upload (>3MB)
        const shouldUseBlob = file.size > 3 * 1024 * 1024;

        if (shouldUseBlob) {
          // Upload to blob storage first
          const { upload } = await import('@vercel/blob/client');
          const blob = await upload(file.name, file, {
            access: 'public',
            handleUploadUrl: '/api/blob-upload',
          });

          requestBody = {
            blobUrl: blob.url,
            maxFileSizePercent: settings.compressionMode === 'quality' ? settings.maxFileSize : undefined,
            maxFileSizeKB: settings.compressionMode === 'filesize' ? settings.maxFileSizeKB : undefined,
            quality: settings.compressionMode === 'quality' ? settings.quality : undefined,
            originalSize: file.size,
          };
        } else {
          // Read file as base64 for smaller files
          const base64 = await fileToBase64(file);

          requestBody = {
            imageData: base64,
            maxFileSizePercent: settings.compressionMode === 'quality' ? settings.maxFileSize : undefined,
            maxFileSizeKB: settings.compressionMode === 'filesize' ? settings.maxFileSizeKB : undefined,
            quality: settings.compressionMode === 'quality' ? settings.quality : undefined,
            originalSize: file.size,
          };
        }

        // Compress image
        const response = await fetch('/api/compress-image', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
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
      let requestBody: {
        imageData?: string;
        blobUrl?: string;
        maxFileSizePercent?: number;
        maxFileSizeKB?: number;
        quality?: number;
        originalSize: number;
      };

      // Check if file is large enough to warrant blob upload (>3MB)
      const shouldUseBlob = file.size > 3 * 1024 * 1024;

      if (shouldUseBlob) {
        // Upload to blob storage first
        const { upload } = await import('@vercel/blob/client');
        const blob = await upload(file.name, file, {
          access: 'public',
          handleUploadUrl: '/api/blob-upload',
        });

        requestBody = {
          blobUrl: blob.url,
          maxFileSizePercent: settings.compressionMode === 'quality' ? settings.maxFileSize : undefined,
          maxFileSizeKB: settings.compressionMode === 'filesize' ? settings.maxFileSizeKB : undefined,
          quality: settings.compressionMode === 'quality' ? settings.quality : undefined,
          originalSize: file.size,
        };
      } else {
        // Read file as base64 for smaller files
        const base64 = await fileToBase64(file);

        requestBody = {
          imageData: base64,
          maxFileSizePercent: settings.compressionMode === 'quality' ? settings.maxFileSize : undefined,
          maxFileSizeKB: settings.compressionMode === 'filesize' ? settings.maxFileSizeKB : undefined,
          quality: settings.compressionMode === 'quality' ? settings.quality : undefined,
          originalSize: file.size,
        };
      }

      // Compress image
      const response = await fetch('/api/compress-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
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

  // Helper function to constrain position within batch comparison bounds
  const constrainBatchPosition = (percentage: number): number => {
    if (!batchComparisonBounds) return percentage;
    return Math.max(batchComparisonBounds.left, Math.min(batchComparisonBounds.right, percentage));
  };

  // Calculate batch comparison image bounds when selected item changes
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

      // Get image dimensions
      const imgWidth = selectedItem.originalDimensions?.width || 0;
      const imgHeight = selectedItem.originalDimensions?.height || 0;

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

      setBatchComparisonBounds(bounds);

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
  }, [selectedImageId, batchItems]);

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
    if (!uploadedImage || !originalFileRef.current) return;

    // Clear previous compressed image to allow retry
    setCompressedImage(null);
    setIsCompressing(true);
    setCompressionError('');

    try {
      const originalFile = originalFileRef.current;
      console.log('Original size:', (originalFile.size / 1024 / 1024).toFixed(2), 'MB');

      // Check if we should use blob workflow (file > 3MB OR blob URL already exists)
      const SIZE_THRESHOLD = 3 * 1024 * 1024; // 3MB
      const hasExistingBlobUrl = uploadedImage && uploadedImage.blobUrl;
      const usesBlobWorkflow = hasExistingBlobUrl || originalFile.size > SIZE_THRESHOLD;

      if (usesBlobWorkflow) {
        // BLOB WORKFLOW for large files
        console.log('🚀 Using blob workflow with server-side sharp.js');

        let blobUrl: string;

        if (hasExistingBlobUrl && uploadedImage.blobUrl) {
          // Use existing blob URL (file already uploaded during initial upload)
          console.log('✅ Using existing blob URL:', uploadedImage.blobUrl);
          blobUrl = uploadedImage.blobUrl;
        } else {
          // Upload file to Vercel Blob (fallback for older workflow)
          console.log('⬆️  Uploading file to blob...', originalFile.size);
          const blob = await upload(originalFile.name, originalFile, {
            access: 'public',
            handleUploadUrl: '/api/get-upload-token',
            multipart: true,
          });
          blobUrl = blob.url;
          console.log('File uploaded to blob:', blobUrl);
        }

        // Request processing with blob URL (no file upload needed!)
        const targetSizeKB = compressionMode === 'filesize'
          ? maxFileSizeKB
          : Math.round((originalFile.size / 1024) * (maxFileSize / 100));

        const response = await fetch('/api/process-from-blob', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            blobUrl: blobUrl,
            operation: 'compress',
            params: {
              maxFileSizeKB: targetSizeKB,
              quality: compressionMode === 'quality' ? quality : undefined,
              originalSize: originalFile.size,
              format: getFormatFromMimetype(uploadedImage.mimetype),
            },
          }),
        });

        if (!response.ok) {
          throw new Error('Compression processing failed');
        }

        const result = await response.json();

        if (result.success) {
          const compressedSize = Buffer.from(result.data.imageData, 'base64').length;
          const compressionRatio = (compressedSize / originalFile.size) * 100;

          console.log('✅ Compressed size:', (compressedSize / 1024 / 1024).toFixed(2), 'MB');
          console.log('✅ Compression ratio:', compressionRatio.toFixed(1), '%');

          setCompressedImage({
            imageData: `data:${result.data.mimetype};base64,${result.data.imageData}`,
            size: compressedSize,
            compressionRatio: parseFloat(compressionRatio.toFixed(1)),
          });
        } else {
          throw new Error(result.error || 'Processing failed');
        }
      } else {
        // CLIENT-SIDE COMPRESSION for small files
        console.log('🚀 Using client-side compression for small file');

        const result = await compressImageClientSide(originalFile, {
          maxFileSizePercent: compressionMode === 'quality' ? maxFileSize : undefined,
          maxFileSizeKB: compressionMode === 'filesize' ? maxFileSizeKB : undefined,
          quality: compressionMode === 'quality' ? quality / 100 : undefined,
          format: 'jpeg',
        });

        console.log('✅ Compressed size:', (result.size / 1024 / 1024).toFixed(2), 'MB');
        console.log('✅ Compression ratio:', result.compressionRatio, '%');

        setCompressedImage({
          imageData: result.dataUrl,
          size: result.size,
          compressionRatio: result.compressionRatio,
        });
      }
    } catch (error) {
      console.error('❌ Compression error:', error);
      setCompressionError(
        error instanceof Error ? error.message : 'Compression failed'
      );
    } finally {
      setIsCompressing(false);
    }
  };

  const handleDownload = () => {
    if (!compressedImage) return;
    setShowFormatDialog(true);
  };

  const handleFormatDownload = async (format: ImageFormat, quality: number) => {
    if (!compressedImage || !uploadedImage) return;

    try {
      // Extract base64 data from data URL
      const base64Data = compressedImage.imageData.split(',')[1];

      // Get original format from uploaded image
      const currentFormat = getFormatFromMimetype(uploadedImage.mimetype);

      // Check if format matches current format
      if (format === currentFormat) {
        // Direct download if same format
        const link = document.createElement('a');
        link.href = compressedImage.imageData;
        link.download = `compressed-${uploadedImage.filename}.${format}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
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
      link.download = `compressed-${uploadedImage.filename}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Download error:', error);
      alert(error instanceof Error ? error.message : 'Download failed');
    }
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
    setSelectedDownloadId(id);
    setShowFormatDialog(true);
  };

  const handleBatchFormatDownload = async (format: ImageFormat, quality: number) => {
    if (!selectedDownloadId) return;

    const item = batchItems.find(item => item.id === selectedDownloadId);
    if (!item || !item.processedData) return;

    try {
      // Extract base64 data from data URL
      const base64Data = item.processedData.split(',')[1];

      // Get original format from uploaded file
      const itemIndex = batchItems.findIndex(i => i.id === selectedDownloadId);
      const originalFile = itemIndex !== -1 ? uploadedFiles[itemIndex] : null;
      const currentFormat = originalFile ? getFormatFromMimetype(originalFile.type) : 'jpeg';

      // Check if format matches current format
      if (format === currentFormat) {
        // Direct download if same format
        const link = document.createElement('a');
        link.href = item.processedData;
        link.download = `compressed-${item.filename}.${format}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
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
      link.download = `compressed-${item.filename}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Download error:', error);
      alert(error instanceof Error ? error.message : 'Download failed');
    }
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
            className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center"
          >
            <FileArchive className="w-5 h-5 text-orange-600" />
          </motion.div>
          <h1 className="text-3xl font-bold text-gray-900">
            Compression
          </h1>
        </div>
        <p className="text-sm text-gray-600">
          Reduce file size while maintaining image quality
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
          key="batch"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.4 }}
          className="max-w-7xl mx-auto space-y-6"
        >
          {/* Default Compression Settings - Show when no image is selected */}
          <AnimatePresence>
            {!batchProcessingStarted && !selectedImageId && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.3 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle>
                      Default Compression Settings (applies to all images)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
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
                      max={maxFileSizeKB}
                      step={50}
                      className="w-full"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Instructions Banner */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-900">
                  {selectedImageId ? (
                    <>
                      <strong>Individual Processing:</strong> Customize compression settings for the selected image, then click &quot;Compress This Image&quot;. Repeat for each image or click &quot;Compress All Images&quot; to use default settings for remaining images.
                    </>
                  ) : (
                    <>
                      <strong>Batch Processing:</strong> Click &quot;Compress All Images&quot; to use default settings for all images, or click any image to customize its settings individually. All processed images will be available for download as a single ZIP file.
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          </motion.div>

          {/* Grid Layout: Sidebar and Main Content */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            {/* Sidebar - Image List */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.4 }}
              className="lg:col-span-1"
            >
              <Card>
                <CardHeader>
                  <CardTitle>
                    <span>Images ({batchItems.length})</span>
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
                        onClick={() => setSelectedImageId(item.id)}
                        className={`w-full p-3 rounded-lg border-2 transition-all cursor-pointer ${
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
                            <p className="text-sm font-medium text-gray-900 break-all">{item.filename}</p>
                            <p className="text-xs text-gray-500">
                              {item.originalDimensions?.width} × {item.originalDimensions?.height}
                            </p>
                            {item.status === 'completed' && item.processedSize ? (
                              <p className="text-xs text-gray-600">
                                {Math.round(item.originalSize / 1024)} KB → {Math.round(item.processedSize / 1024)} KB
                                <span className="text-green-600 ml-1">
                                  (-{Math.round((1 - item.processedSize / item.originalSize) * 100)}%)
                                </span>
                              </p>
                            ) : (
                              <p className="text-xs text-gray-500">
                                {Math.round(item.originalSize / 1024)} KB
                              </p>
                            )}
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
                      </motion.button>
                    ))}
                  </div>

                  <div className="mt-4 space-y-2">
                    <AnimatePresence>
                      {!batchProcessingStarted && batchItems.some(i => i.status === 'pending') && (
                        <motion.div
                          key="compress-all-button"
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.2 }}
                        >
                          <Button
                            onClick={processAllImages}
                            className="w-full bg-orange-600 hover:bg-orange-700"
                          >
                            <FileArchive className="h-4 w-4 mr-2" />
                            Compress All Images ({batchItems.filter(i => i.status === 'pending').length})
                          </Button>
                        </motion.div>
                      )}
                      {batchItems.some(i => i.status === 'completed') && (
                        <motion.div
                          key="download-all-button"
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
                            Download All ({batchItems.filter(i => i.status === 'completed').length})
                          </Button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Main Content - Selected Image Settings (only in individual mode) */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.5 }}
              className="lg:col-span-2"
            >
              <AnimatePresence mode="wait">
                {selectedImageId && (() => {
                  const selectedItem = batchItems.find(item => item.id === selectedImageId);
                  if (!selectedItem || !selectedItem.settings) return null;

                  const itemSettings = selectedItem.settings as unknown as CompressionSettings;

                return (
                  <motion.div
                    key={selectedImageId}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-2"
                  >
                  {/* Image Preview Card */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span className="break-all">{selectedItem.filename}</span>
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
                      {selectedItem.status === 'completed' && selectedItem.processedData ? (
                        <>
                          {/* Comparison View */}
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
                              if (!isComparing) return;
                              const rect = e.currentTarget.getBoundingClientRect();
                              const x = e.clientX - rect.left;
                              const percentage = (x / rect.width) * 100;
                              setComparisonPosition(constrainBatchPosition(percentage));
                            }}
                            onMouseUp={() => setIsComparing(false)}
                            onMouseLeave={() => setIsComparing(false)}
                            onTouchStart={(e) => {
                              setIsComparing(true);
                              const rect = e.currentTarget.getBoundingClientRect();
                              const x = e.touches[0].clientX - rect.left;
                              const percentage = (x / rect.width) * 100;
                              setComparisonPosition(constrainBatchPosition(percentage));
                            }}
                            onTouchMove={(e) => {
                              if (!isComparing) return;
                              const rect = e.currentTarget.getBoundingClientRect();
                              const x = e.touches[0].clientX - rect.left;
                              const percentage = (x / rect.width) * 100;
                              setComparisonPosition(constrainBatchPosition(percentage));
                            }}
                            onTouchEnd={() => setIsComparing(false)}
                          >
                            {/* Compressed Image (base layer) */}
                            <img
                              src={selectedItem.processedData}
                              alt="Compressed"
                              className="absolute inset-0 w-full h-full object-contain"
                            />

                            {/* Original Image (clipped layer) */}
                            <div
                              className="absolute inset-0"
                              style={{
                                clipPath: `inset(0 ${100 - comparisonPosition}% 0 0)`
                              }}
                            >
                              <img
                                src={selectedItem.previewUrl}
                                alt="Original"
                                className="w-full h-full object-contain"
                              />
                            </div>

                            {/* Comparison Slider */}
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
                                Original: {Math.round(selectedItem.originalSize / 1024)} KB
                              </div>
                              <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                                Compressed: {Math.round((selectedItem.processedSize || 0) / 1024)} KB (-{Math.round((1 - (selectedItem.processedSize || 0) / selectedItem.originalSize) * 100)}%)
                              </div>
                            </>
                          </div>

                          {/* File Size Stats */}
                          <div className="bg-gray-50 p-3 rounded-lg space-y-2">
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-gray-600">Original:</span>
                              <span className="font-semibold">
                                {Math.round(selectedItem.originalSize / 1024)} KB
                              </span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-gray-600">Compressed:</span>
                              <span className="font-semibold text-orange-600">
                                {Math.round((selectedItem.processedSize || 0) / 1024)} KB (-{Math.round((1 - (selectedItem.processedSize || 0) / selectedItem.originalSize) * 100)}%)
                              </span>
                            </div>
                            <div className="pt-2 border-t border-gray-200">
                              <p className="text-sm font-semibold text-center text-green-600">
                                {Math.round((1 - (selectedItem.processedSize || 0) / selectedItem.originalSize) * 100)}% size reduction
                              </p>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          {/* Original Image Preview */}
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
                        </>
                      )}
                    </CardContent>
                  </Card>

                  {/* Individual Settings Card */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Individual Compression Settings</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
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
                      <AnimatePresence>
                        {selectedItem.status === 'pending' && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.2 }}
                          >
                            <Button
                              onClick={() => processSingleImage(selectedImageId)}
                              className="w-full bg-orange-600 hover:bg-orange-700"
                            >
                              Compress This Image
                            </Button>
                          </motion.div>
                        )}
                        {selectedItem.status === 'completed' && selectedItem.processedData && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.2 }}
                          >
                            <Button
                              onClick={() => handleDownloadSingle(selectedImageId)}
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
                </motion.div>
              );
                })() || (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Card>
                      <CardContent className="py-20 text-center">
                        <FileArchive className="w-16 h-16 text-orange-400 mx-auto mb-4" />
                        <p className="text-gray-600 mb-2">
                          Compress all {batchItems.length} images with default settings
                        </p>
                        <p className="text-sm text-gray-500">
                          Or click any image to customize individually
                        </p>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        </motion.div>
      ) : (
        <motion.div
          key="single"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.4 }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-4"
        >
          {/* Left Half - Controls */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="space-y-3"
          >
            <Card>
                <CardHeader>
                  <CardTitle>
                    Image Uploaded
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600 break-all">{uploadedImage?.filename}</p>
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
                <CardContent className="space-y-3">
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

            {isCompressing ? (
              <div className="flex gap-2">
                <Button
                  disabled
                  className="flex-1 bg-orange-600 text-white"
                  size="lg"
                >
                  Compressing...
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowCancelDialog(true)}
                  className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 flex items-center justify-center gap-2"
                  size="lg"
                >
                  <X className="h-4 w-4" />
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                onClick={handleCompress}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white"
                size="lg"
              >
                {compressedImage ? 'Retry Compression' : 'Apply Compression'}
              </Button>
            )}

            <AnimatePresence>
              {compressedImage && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-2"
                >
                  <Button
                    onClick={handleDownload}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2"
                    size="lg"
                  >
                    <Download className="h-5 w-5" />
                    Download Image
                  </Button>
                  <Button
                    onClick={() => {
                      if (onEditAgain && compressedImage && uploadedImage) {
                        // Pass the compressed image to edit again with a different mode
                        const mimeType = uploadedImage.mimetype || 'image/jpeg';
                        // compressedImage.imageData is already a complete data URL
                        const imageData = compressedImage.imageData;
                        onEditAgain(imageData, {
                          filename: uploadedImage.filename,
                          mimetype: mimeType
                        });
                      } else {
                        // Fallback to reset
                        setCompressedImage(null);
                        setCompressionError('');
                        resetUpload();
                      }
                    }}
                    variant="outline"
                    className="w-full border-blue-300 text-blue-600 hover:bg-blue-50 flex items-center justify-center gap-2"
                    size="lg"
                  >
                    <Edit2 className="h-5 w-5" />
                    Edit Again
                  </Button>
                </motion.div>
              )}

              {(uploadError || compressionError) && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card className="border-red-200">
                    <CardContent className="pt-6">
                      <p className="text-red-600 text-sm">{uploadError || compressionError}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Right Half - Preview and Stats */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="space-y-3"
          >
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

            <AnimatePresence>
              {isCompressing && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.3 }}
                >
                  <ProcessingStatus
                    status={{
                      stage: 'optimizing',
                      progress: 50,
                      message: 'Compressing image...',
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(uploadError || compressionError) && !uploadedImage && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="max-w-2xl mx-auto"
          >
            <Card className="border-red-200">
              <CardContent className="pt-6">
                <p className="text-red-600 text-sm">{uploadError || compressionError}</p>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Format Dialog for Single File Mode */}
      {compressedImage && uploadedImage && !isBatchMode && (
        <FormatDownloadDialog
          isOpen={showFormatDialog && !selectedDownloadId}
          onClose={() => setShowFormatDialog(false)}
          onDownload={handleFormatDownload}
          currentFormat={getFormatFromMimetype(uploadedImage.mimetype) as ImageFormat}
          imageData={compressedImage.imageData}
          filename={uploadedImage.filename}
        />
      )}

      {/* Format Dialog for Batch Mode */}
      {selectedDownloadId && batchItems.find(i => i.id === selectedDownloadId) && (() => {
        const itemIndex = batchItems.findIndex(i => i.id === selectedDownloadId);
        const originalFile = itemIndex !== -1 ? uploadedFiles[itemIndex] : null;
        const originalFormat = originalFile ? getFormatFromMimetype(originalFile.type) : 'jpeg';
        const item = batchItems.find(i => i.id === selectedDownloadId);

        return (
          <FormatDownloadDialog
            isOpen={showFormatDialog && !!selectedDownloadId}
            onClose={() => {
              setShowFormatDialog(false);
              setSelectedDownloadId(null);
            }}
            onDownload={handleBatchFormatDownload}
            currentFormat={originalFormat as ImageFormat}
            imageData={item?.processedData || ''}
            filename={item?.filename || 'image'}
          />
        );
      })()}

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
          setIsCompressing(false);
          setCompressionError('');
        }}
        title="Cancel Compression?"
        description="Are you sure you want to cancel the compression? Any progress will be lost."
      />
    </motion.div>
  );
}
