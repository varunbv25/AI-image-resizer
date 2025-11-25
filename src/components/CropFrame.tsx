'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

interface CropFrameProps {
  // Frame position and size
  x: number;
  y: number;
  width: number;
  height: number;

  // Container bounds
  containerWidth: number;
  containerHeight: number;

  // Image display info (for constraining to image bounds)
  imageDisplay: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  // Callbacks
  onFrameChange: (frame: { x: number; y: number; width: number; height: number }) => void;

  // Aspect ratio control
  aspectRatio?: number; // width / height, or null for free resize
  lockAspectRatio?: boolean;

  // Preset aspect ratios for quick selection
  presetAspectRatios?: Array<{
    label: string;
    ratio: number; // width / height
    width: number;
    height: number;
  }>;

  // Display options
  showDimensions?: boolean;
  showAspectRatioHint?: boolean;
  showPresetButtons?: boolean;
  minSize?: number;

  // Styling
  borderColor?: string;
  overlayOpacity?: number;
}

const COMMON_ASPECT_RATIOS = [
  { ratio: 16/9, label: '16:9' },
  { ratio: 4/3, label: '4:3' },
  { ratio: 3/2, label: '3:2' },
  { ratio: 1/1, label: '1:1' },
  { ratio: 2/3, label: '2:3' },
  { ratio: 9/16, label: '9:16' },
];

function getAspectRatioLabel(ratio: number): string | null {
  const tolerance = 0.02;
  for (const ar of COMMON_ASPECT_RATIOS) {
    if (Math.abs(ratio - ar.ratio) < tolerance) {
      return ar.label;
    }
  }
  return null;
}

export function CropFrame({
  x,
  y,
  width,
  height,
  containerWidth,
  containerHeight,
  imageDisplay,
  onFrameChange,
  aspectRatio,
  lockAspectRatio = false,
  presetAspectRatios,
  showDimensions = true,
  showAspectRatioHint = true,
  showPresetButtons = false,
  minSize = 40,
  borderColor = 'white',
  overlayOpacity = 0.4,
}: CropFrameProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [initialFrame, setInitialFrame] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [currentAspectRatio, setCurrentAspectRatio] = useState<number>(width / height);
  const [showAspectHint, setShowAspectHint] = useState(false);
  const hintTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Update current aspect ratio when frame changes
  useEffect(() => {
    const newRatio = width / height;
    setCurrentAspectRatio(newRatio);

    // Show aspect ratio hint when resizing
    if (showAspectRatioHint && isResizing) {
      setShowAspectHint(true);

      // Clear existing timeout
      if (hintTimeoutRef.current) {
        clearTimeout(hintTimeoutRef.current);
      }

      // Hide hint after 1.5 seconds of no changes
      hintTimeoutRef.current = setTimeout(() => {
        setShowAspectHint(false);
      }, 1500);
    }
  }, [width, height, isResizing, showAspectRatioHint]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hintTimeoutRef.current) {
        clearTimeout(hintTimeoutRef.current);
      }
    };
  }, []);

  const handleFrameMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setDragStart({
      x: e.clientX - x,
      y: e.clientY - y,
    });
  }, [x, y]);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent, handle: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizeHandle(handle);
    setInitialFrame({ x, y, width, height });
    setDragStart({
      x: e.clientX,
      y: e.clientY,
    });
  }, [x, y, width, height]);

  const handleGlobalMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;

      // Constrain frame to image bounds
      const maxX = Math.min(containerWidth - width, imageDisplay.x + imageDisplay.width - width);
      const maxY = Math.min(containerHeight - height, imageDisplay.y + imageDisplay.height - height);
      const minX = Math.max(0, imageDisplay.x);
      const minY = Math.max(0, imageDisplay.y);

      onFrameChange({
        x: Math.max(minX, Math.min(maxX, newX)),
        y: Math.max(minY, Math.min(maxY, newY)),
        width,
        height,
      });
    } else if (isResizing && resizeHandle) {
      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;
      const targetAspectRatio = lockAspectRatio && aspectRatio ? aspectRatio : 0;

      const newFrame = { ...initialFrame };

      // Determine if it's a corner handle
      const isCorner = (resizeHandle.includes('n') || resizeHandle.includes('s')) &&
                       (resizeHandle.includes('e') || resizeHandle.includes('w'));

      let newWidth = newFrame.width;
      let newHeight = newFrame.height;

      if (isCorner) {
        // Diagonal resize
        if (resizeHandle.includes('e')) {
          newWidth = initialFrame.width + deltaX;
        } else if (resizeHandle.includes('w')) {
          newWidth = initialFrame.width - deltaX;
        }

        if (resizeHandle.includes('s')) {
          newHeight = initialFrame.height + deltaY;
        } else if (resizeHandle.includes('n')) {
          newHeight = initialFrame.height - deltaY;
        }

        // Maintain aspect ratio if locked
        if (targetAspectRatio > 0) {
          if (Math.abs(deltaX) > Math.abs(deltaY)) {
            newHeight = newWidth / targetAspectRatio;
          } else {
            newWidth = newHeight * targetAspectRatio;
          }
        }
      } else {
        // Edge resize
        if (resizeHandle.includes('e')) {
          newWidth = initialFrame.width + deltaX;
        } else if (resizeHandle.includes('w')) {
          newWidth = initialFrame.width - deltaX;
        } else if (resizeHandle.includes('s')) {
          newHeight = initialFrame.height + deltaY;
        } else if (resizeHandle.includes('n')) {
          newHeight = initialFrame.height - deltaY;
        }

        // Maintain aspect ratio if locked
        if (targetAspectRatio > 0) {
          if (resizeHandle.includes('e') || resizeHandle.includes('w')) {
            newHeight = newWidth / targetAspectRatio;
          } else {
            newWidth = newHeight * targetAspectRatio;
          }
        }
      }

      // Apply position changes for handles that move the origin
      if (resizeHandle.includes('w')) {
        newFrame.x = initialFrame.x + (initialFrame.width - newWidth);
      }
      if (resizeHandle.includes('n')) {
        newFrame.y = initialFrame.y + (initialFrame.height - newHeight);
      }

      newFrame.width = newWidth;
      newFrame.height = newHeight;

      // Enforce minimum size
      if (newFrame.width < minSize || newFrame.height < minSize) {
        if (targetAspectRatio > 0) {
          if (targetAspectRatio > 1) {
            newFrame.width = minSize;
            newFrame.height = minSize / targetAspectRatio;
          } else {
            newFrame.height = minSize;
            newFrame.width = minSize * targetAspectRatio;
          }
        } else {
          if (newFrame.width < minSize) newFrame.width = minSize;
          if (newFrame.height < minSize) newFrame.height = minSize;
        }

        if (resizeHandle.includes('w')) {
          newFrame.x = initialFrame.x + initialFrame.width - newFrame.width;
        }
        if (resizeHandle.includes('n')) {
          newFrame.y = initialFrame.y + initialFrame.height - newFrame.height;
        }
      }

      // Constrain to image bounds
      const imageRight = imageDisplay.x + imageDisplay.width;
      const imageBottom = imageDisplay.y + imageDisplay.height;

      newFrame.x = Math.max(imageDisplay.x, Math.min(imageRight - newFrame.width, newFrame.x));
      newFrame.y = Math.max(imageDisplay.y, Math.min(imageBottom - newFrame.height, newFrame.y));

      newFrame.width = Math.min(imageRight - newFrame.x, newFrame.width);
      newFrame.height = Math.min(imageBottom - newFrame.y, newFrame.height);

      // Re-adjust to maintain aspect ratio if size was constrained
      if (targetAspectRatio > 0) {
        const constrainedAspectRatio = newFrame.width / newFrame.height;
        if (Math.abs(constrainedAspectRatio - targetAspectRatio) > 0.01) {
          if (constrainedAspectRatio > targetAspectRatio) {
            newFrame.width = newFrame.height * targetAspectRatio;
          } else {
            newFrame.height = newFrame.width / targetAspectRatio;
          }
        }
      }

      onFrameChange(newFrame);
    }
  }, [isDragging, isResizing, dragStart, width, height, resizeHandle, initialFrame, aspectRatio, lockAspectRatio, imageDisplay, containerWidth, containerHeight, minSize, onFrameChange]);

  const handleGlobalMouseUp = useCallback(() => {
    setIsDragging(false);
    if (isResizing) {
      setShowAspectHint(true);
      if (hintTimeoutRef.current) {
        clearTimeout(hintTimeoutRef.current);
      }
      hintTimeoutRef.current = setTimeout(() => {
        setShowAspectHint(false);
      }, 2000);
    }
    setIsResizing(false);
    setResizeHandle(null);
  }, [isResizing]);

  // Global event listeners
  useEffect(() => {
    if (isDragging || isResizing) {
      const handleMouseMove = (e: MouseEvent) => handleGlobalMouseMove(e);
      const handleMouseUp = () => handleGlobalMouseUp();

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isResizing, handleGlobalMouseMove, handleGlobalMouseUp]);

  const handlePresetSelect = (preset: { ratio: number; width: number; height: number }) => {
    // Calculate new frame size based on preset
    const maxFrameWidth = imageDisplay.width * 0.8;
    const maxFrameHeight = imageDisplay.height * 0.8;

    let newWidth, newHeight;
    if (preset.ratio > 1) {
      newWidth = Math.min(maxFrameWidth, 400);
      newHeight = newWidth / preset.ratio;
      if (newHeight > maxFrameHeight) {
        newHeight = maxFrameHeight;
        newWidth = newHeight * preset.ratio;
      }
    } else {
      newHeight = Math.min(maxFrameHeight, 400);
      newWidth = newHeight * preset.ratio;
      if (newWidth > maxFrameWidth) {
        newWidth = maxFrameWidth;
        newHeight = newWidth / preset.ratio;
      }
    }

    // Center the frame
    const frameX = imageDisplay.x + (imageDisplay.width - newWidth) / 2;
    const frameY = imageDisplay.y + (imageDisplay.height - newHeight) / 2;

    onFrameChange({
      x: frameX,
      y: frameY,
      width: newWidth,
      height: newHeight,
    });
  };

  const aspectRatioLabel = getAspectRatioLabel(currentAspectRatio);

  return (
    <>
      {/* Semi-transparent overlay outside crop area */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `rgba(0, 0, 0, ${overlayOpacity})`,
          clipPath: `polygon(0% 0%, 0% 100%, 100% 100%, 100% 0%, 0% 0%, ${x}px ${y}px, ${x}px ${y + height}px, ${x + width}px ${y + height}px, ${x + width}px ${y}px, ${x}px ${y}px)`,
        }}
      />

      {/* Crop Frame */}
      <div
        className="absolute cursor-move bg-transparent"
        style={{
          left: x,
          top: y,
          width,
          height,
          border: `2px solid ${borderColor}`,
          boxShadow: '0 0 0 1px rgba(0,0,0,0.3)',
        }}
        onMouseDown={handleFrameMouseDown}
      >
        {/* Resize handles - Corners */}
        <div
          className="absolute w-3 h-3 bg-white border border-gray-400 cursor-nw-resize -top-1 -left-1 z-10"
          onMouseDown={(e) => handleResizeMouseDown(e, 'nw')}
        />
        <div
          className="absolute w-3 h-3 bg-white border border-gray-400 cursor-ne-resize -top-1 -right-1 z-10"
          onMouseDown={(e) => handleResizeMouseDown(e, 'ne')}
        />
        <div
          className="absolute w-3 h-3 bg-white border border-gray-400 cursor-sw-resize -bottom-1 -left-1 z-10"
          onMouseDown={(e) => handleResizeMouseDown(e, 'sw')}
        />
        <div
          className="absolute w-3 h-3 bg-white border border-gray-400 cursor-se-resize -bottom-1 -right-1 z-10"
          onMouseDown={(e) => handleResizeMouseDown(e, 'se')}
        />

        {/* Resize handles - Edges */}
        <div
          className="absolute w-6 h-2 bg-white border border-gray-400 cursor-n-resize -top-1 left-1/2 transform -translate-x-1/2 z-10"
          onMouseDown={(e) => handleResizeMouseDown(e, 'n')}
        />
        <div
          className="absolute w-6 h-2 bg-white border border-gray-400 cursor-s-resize -bottom-1 left-1/2 transform -translate-x-1/2 z-10"
          onMouseDown={(e) => handleResizeMouseDown(e, 's')}
        />
        <div
          className="absolute w-2 h-6 bg-white border border-gray-400 cursor-w-resize -left-1 top-1/2 transform -translate-y-1/2 z-10"
          onMouseDown={(e) => handleResizeMouseDown(e, 'w')}
        />
        <div
          className="absolute w-2 h-6 bg-white border border-gray-400 cursor-e-resize -right-1 top-1/2 transform -translate-y-1/2 z-10"
          onMouseDown={(e) => handleResizeMouseDown(e, 'e')}
        />

        {/* Dimension and aspect ratio display */}
        {showDimensions && (
          <div className="absolute -top-8 left-0 bg-black/70 text-white text-xs px-2 py-1 rounded whitespace-nowrap pointer-events-none">
            {Math.round(width)} × {Math.round(height)}
            {showAspectRatioHint && (
              <span className="ml-2 opacity-75">
                ({currentAspectRatio.toFixed(2)})
              </span>
            )}
          </div>
        )}

        {/* Aspect ratio hint overlay */}
        {showAspectRatioHint && showAspectHint && aspectRatioLabel && (
          <div
            className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2
                       bg-blue-600 text-white text-2xl font-bold px-6 py-3 rounded-lg
                       shadow-2xl pointer-events-none animate-in fade-in zoom-in duration-200"
            style={{
              animation: 'fadeIn 0.2s ease-in-out',
            }}
          >
            {aspectRatioLabel}
          </div>
        )}
      </div>

      {/* Preset buttons */}
      {showPresetButtons && presetAspectRatios && presetAspectRatios.length > 0 && (
        <div className="absolute top-4 right-4 flex flex-col gap-2 pointer-events-auto z-20">
          {presetAspectRatios.map((preset, index) => (
            <button
              key={index}
              onClick={() => handlePresetSelect(preset)}
              className="bg-white/90 hover:bg-white text-gray-800 text-xs font-medium px-3 py-1.5 rounded shadow-md transition-all hover:shadow-lg"
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
