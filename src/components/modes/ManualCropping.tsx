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
import { Download, RotateCcw, Scissors, ZoomIn, Move, Keyboard} from 'lucide-react';
import Image from 'next/image';

interface ManualCroppingProps {
  onBack: () => void;
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

export function ManualCropping({}: ManualCroppingProps) {
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

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const {
    isUploading,
    uploadedImage,
    error: uploadError,
    uploadFile,
    reset: resetUpload,
  } = useFileUpload();

  const handleImageUpload = (file: File) => {
    uploadFile(file);
    setCroppedImageUrl(null);
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

      // Initialize crop frame in the center, constrained to image bounds
      const maxFrameWidth = displayWidth * 0.8;
      const maxFrameHeight = displayHeight * 0.8;
      const frameWidth = Math.min(maxFrameWidth, 300);
      const frameHeight = Math.min(maxFrameHeight, 400);

      // Center the frame within the image area
      const imageX = (containerWidth - displayWidth) / 2;
      const imageY = (containerHeight - displayHeight) / 2;
      const frameX = imageX + (displayWidth - frameWidth) / 2;
      const frameY = imageY + (displayHeight - frameHeight) / 2;

      setCropFrame({
        x: frameX,
        y: frameY,
        width: frameWidth,
        height: frameHeight,
      });
    }
  }, [uploadedImage, targetDimensions]);

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

  // Update crop frame when imageDisplay or targetDimensions change
  useEffect(() => {
    if (imageDisplay && imageDisplay.width > 0 && imageDisplay.height > 0) {
      updateCropFrameForDimensions(targetDimensions, imageDisplay);
    }
  }, [imageDisplay, targetDimensions, updateCropFrameForDimensions]);

  const handleReset = useCallback(() => {
    resetUpload();
    setCroppedImageUrl(null);
    setCropFrame({
      x: 100,
      y: 100,
      width: 300,
      height: 400,
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
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('Could not get canvas context');
        setIsProcessing(false);
        return;
      }

      // Calculate crop coordinates relative to the original image
      const cropX = (cropFrame.x - imageDisplay.x) / imageDisplay.scale;
      const cropY = (cropFrame.y - imageDisplay.y) / imageDisplay.scale;
      const cropWidth = cropFrame.width / imageDisplay.scale;
      const cropHeight = cropFrame.height / imageDisplay.scale;

      console.log('Crop coordinates:', { cropX, cropY, cropWidth, cropHeight });
      console.log('Image display:', imageDisplay);
      console.log('Crop frame:', cropFrame);

      // Set canvas to target dimensions
      canvas.width = targetDimensions.width;
      canvas.height = targetDimensions.height;

      const img = new window.Image();
      img.onload = async () => {
        console.log('Image loaded successfully');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw the cropped portion scaled to target dimensions
        ctx.drawImage(
          img,
          Math.max(0, cropX),
          Math.max(0, cropY),
          Math.min(cropWidth, uploadedImage.originalDimensions.width - cropX),
          Math.min(cropHeight, uploadedImage.originalDimensions.height - cropY),
          0,
          0,
          targetDimensions.width,
          targetDimensions.height
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

              const result = await response.json();

              if (result.success) {
                const compressedBlob = new Blob(
                  [Buffer.from(result.data.imageData, 'base64')],
                  { type: result.data.mimetype }
                );
                const url = URL.createObjectURL(compressedBlob);
                setCroppedImageUrl(url);
              } else {
                const url = URL.createObjectURL(blob);
                setCroppedImageUrl(url);
              }
            } catch (compressionError) {
              console.warn('Compression failed, using original:', compressionError);
              const url = URL.createObjectURL(blob);
              setCroppedImageUrl(url);
            }
          }
          setIsProcessing(false);
        }, 'image/jpeg', 0.9);
      };

      img.onerror = (error) => {
        console.error('Image failed to load:', error);
        setIsProcessing(false);
      };

      img.src = `data:image/jpeg;base64,${uploadedImage.imageData}`;
    } catch (error) {
      console.error('Error cropping image:', error);
      setIsProcessing(false);
    }
  }, [uploadedImage, targetDimensions, cropFrame, imageDisplay]);

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
      const targetAspectRatio = targetDimensions.width / targetDimensions.height;

      const newFrame = { ...initialCropFrame };

      // Handle corner resizing with aspect ratio constraint
      if (resizeHandle.includes('e') || resizeHandle.includes('w') || resizeHandle.includes('n') || resizeHandle.includes('s')) {
        let newWidth = newFrame.width;
        let newHeight = newFrame.height;

        // Determine primary resize direction
        if (resizeHandle.includes('e')) {
          newWidth = initialCropFrame.width + deltaX;
        } else if (resizeHandle.includes('w')) {
          newWidth = initialCropFrame.width - deltaX;
        } else if (resizeHandle.includes('s')) {
          newHeight = initialCropFrame.height + deltaY;
        } else if (resizeHandle.includes('n')) {
          newHeight = initialCropFrame.height - deltaY;
        }

        // Maintain aspect ratio
        if (resizeHandle.includes('e') || resizeHandle.includes('w')) {
          // Width-based resize
          newHeight = newWidth / targetAspectRatio;
        } else {
          // Height-based resize
          newWidth = newHeight * targetAspectRatio;
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

      // Enforce minimum size while maintaining aspect ratio
      const minSize = 40;
      if (newFrame.width < minSize || newFrame.height < minSize) {
        if (targetAspectRatio > 1) {
          // Landscape - set minimum width
          newFrame.width = minSize;
          newFrame.height = minSize / targetAspectRatio;
        } else {
          // Portrait/Square - set minimum height
          newFrame.height = minSize;
          newFrame.width = minSize * targetAspectRatio;
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

      // Re-adjust to maintain aspect ratio if size was constrained
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

      setCropFrame(newFrame);
    }
  }, [isDragging, isResizing, dragStart, cropFrame, resizeHandle, initialCropFrame, targetDimensions, imageDisplay]);

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
    updateCropFrameForDimensions(dimensions, imageDisplay);
  };

  const handleDownload = () => {
    if (!croppedImageUrl) return;

    const link = document.createElement('a');
    link.download = `cropped-${uploadedImage?.filename || 'image'}.jpg`;
    link.href = croppedImageUrl;
    link.click();
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="border-b border-slate-200 sticky top-0 z-10 backdrop-blur-sm bg-white/95">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
              <Scissors className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Manual Cropping</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        {!uploadedImage ? (
          <div className="max-w-2xl mx-auto">
            <ImageUploader onImageUpload={handleImageUpload} isUploading={isUploading} />
          </div>
        ) : (
          <div className="space-y-8">
            {/* Main Cropping Interface */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
              {/* Crop Preview - Main Focus */}
              <div className="xl:col-span-2 space-y-6">
                <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-xl font-semibold">Crop Preview</CardTitle>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-600">Crop Mode: Active</span>
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      </div>
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
                        <div className="absolute inset-0 flex items-center justify-center p-8">
                          <div className="relative max-w-full max-h-full">
                            <Image
                              src={croppedImageUrl}
                              alt="Cropped result"
                              width={targetDimensions.width}
                              height={targetDimensions.height}
                              className="rounded-lg shadow-lg max-w-full max-h-full object-contain"
                            />
                            <div className="absolute -top-8 left-0 bg-green-500 text-white text-xs px-3 py-1 rounded-full font-medium">
                              Cropped • {targetDimensions.width}×{targetDimensions.height}
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
                              src={`data:image/jpeg;base64,${uploadedImage.imageData}`}
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
                                ({(targetDimensions.width / targetDimensions.height).toFixed(2)})
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Quick Stats */}
                    {uploadedImage && !croppedImageUrl && imageDisplay && (
                      <div className="mt-6 grid grid-cols-2 gap-4">
                        <div className="text-center p-3 bg-slate-50 rounded-lg">
                          <div className="text-sm text-slate-600">Crop Size</div>
                          <div className="font-semibold text-lg">
                            {Math.round(cropFrame.width / imageDisplay.scale)} × {Math.round(cropFrame.height / imageDisplay.scale)}
                          </div>
                        </div>
                        <div className="text-center p-3 bg-slate-50 rounded-lg">
                          <div className="text-sm text-slate-600">Output Size</div>
                          <div className="font-semibold text-lg">{targetDimensions.width}×{targetDimensions.height}</div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Controls Sidebar */}
              <div className="space-y-6">
                {/* Image Info */}
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
                      <div className="text-sm font-medium text-slate-900">{uploadedImage.filename}</div>
                      <div className="text-xs text-slate-500">
                        {uploadedImage.originalDimensions.width} × {uploadedImage.originalDimensions.height}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Dimensions */}
                <DimensionSelector
                  originalDimensions={uploadedImage.originalDimensions}
                  targetDimensions={targetDimensions}
                  onDimensionsChange={handleDimensionsChange}
                />


                {/* Keyboard Shortcuts */}
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

                {/* Action Buttons */}
                <div className="space-y-3">
                  <Button
                    onClick={handleCrop}
                    disabled={isProcessing}
                    className="w-full h-12 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium rounded-lg shadow-lg hover:shadow-xl transition-all duration-200"
                  >
                    {isProcessing ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                        Processing...
                      </>
                    ) : (
                      <>
                        <Scissors className="h-4 w-4 mr-2" />
                        Crop Image
                      </>
                    )}
                  </Button>

                  {croppedImageUrl && (
                    <Button
                      variant="outline"
                      onClick={handleDownload}
                      className="w-full h-12 border-2 hover:bg-slate-50 font-medium rounded-lg transition-all duration-200"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download Cropped Image
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Original Image Reference */}
            {uploadedImage && (
              <Card className="border-0 shadow-lg">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Original Image Reference</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="relative max-w-md mx-auto">
                    <div className="relative aspect-video bg-slate-100 rounded-lg overflow-hidden">
                      <Image
                        src={`data:image/jpeg;base64,${uploadedImage.imageData}`}
                        alt="Original image"
                        fill
                        className="object-contain"
                      />
                    </div>
                    <p className="text-sm text-slate-600 text-center mt-2">
                      Original: {uploadedImage.originalDimensions.width} × {uploadedImage.originalDimensions.height}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {uploadError && (
          <div className="max-w-2xl mx-auto">
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-6">
                <p className="text-red-600 text-sm">{uploadError}</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}