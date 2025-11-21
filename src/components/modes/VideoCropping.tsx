'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { VideoUploader } from '@/components/VideoUploader';
import { VideoThumbnail } from '@/components/VideoThumbnail';
import { useVideoUpload } from '@/hooks/useVideoUpload';
import { getVideoProcessor } from '@/lib/videoProcessor';
import { Download, Info, Check, Clock, AlertCircle, ArrowLeft, Crop, Edit2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { VideoCropSettings, VideoProcessingStatus } from '@/types';

interface VideoCroppingProps {
  onBack: () => void;
  onEditAgain?: (videoData: string, metadata: { filename: string, mimetype: string }) => void;
  preUploadedFiles?: File[];
}

const PRESET_SIZES = [
  { label: '16:9 (1280x720)', width: 1280, height: 720, ratio: '16:9' },
  { label: '4:3 (1024x768)', width: 1024, height: 768, ratio: '4:3' },
  { label: '1:1 (1080x1080)', width: 1080, height: 1080, ratio: '1:1' },
  { label: '9:16 (1080x1920)', width: 1080, height: 1920, ratio: '9:16' },
  { label: 'Custom', width: 0, height: 0, ratio: 'custom' },
];

export function VideoCropping({ onBack, onEditAgain, preUploadedFiles }: VideoCroppingProps) {
  const [cropMode, setCropMode] = useState<'preset' | 'manual'>('preset');
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [customWidth, setCustomWidth] = useState(1280);
  const [customHeight, setCustomHeight] = useState(720);
  const [processedVideo, setProcessedVideo] = useState<{
    videoData: string;
    filename: string;
    size: number;
    width: number;
    height: number;
  } | null>(null);
  const [processingStatus, setProcessingStatus] = useState<VideoProcessingStatus>({
    stage: 'idle',
    progress: 0,
    message: '',
  });
  const [processingError, setProcessingError] = useState<string>('');
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [cropRect, setCropRect] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const {
    isUploading,
    uploadedVideo,
    error: uploadError,
    validationError,
    uploadProgress,
    uploadFile,
    reset: resetUpload,
  } = useVideoUpload('VIDEO_CROPPING');

  // Auto-load pre-uploaded files
  useEffect(() => {
    if (preUploadedFiles && preUploadedFiles.length > 0) {
      uploadFile(preUploadedFiles[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialize crop rectangle when video is loaded
  useEffect(() => {
    if (uploadedVideo && cropMode === 'manual') {
      const preset = PRESET_SIZES[selectedPreset];
      const videoWidth = uploadedVideo.metadata.width;
      const videoHeight = uploadedVideo.metadata.height;

      let cropWidth, cropHeight;

      if (preset.ratio === 'custom') {
        cropWidth = Math.min(customWidth, videoWidth);
        cropHeight = Math.min(customHeight, videoHeight);
      } else {
        cropWidth = Math.min(preset.width, videoWidth);
        cropHeight = Math.min(preset.height, videoHeight);
      }

      setCropRect({
        x: Math.floor((videoWidth - cropWidth) / 2),
        y: Math.floor((videoHeight - cropHeight) / 2),
        width: cropWidth,
        height: cropHeight,
      });
    }
  }, [uploadedVideo, selectedPreset, customWidth, customHeight, cropMode]);

  // Draw crop overlay on canvas
  useEffect(() => {
    if (!canvasRef.current || !videoRef.current || cropMode !== 'manual') return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    setCanvasSize({ width: video.videoWidth, height: video.videoHeight });

    // Draw video frame
    ctx.drawImage(video, 0, 0);

    // Draw dark overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Clear crop area
    ctx.clearRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
    ctx.drawImage(video, cropRect.x, cropRect.y, cropRect.width, cropRect.height, cropRect.x, cropRect.y, cropRect.width, cropRect.height);

    // Draw crop border
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 3;
    ctx.strokeRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
  }, [cropRect, cropMode]);

  const handleVideoUpload = (file: File) => {
    uploadFile(file);
    setProcessedVideo(null);
    setProcessingError('');
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasSize.width / rect.width;
    const scaleY = canvasSize.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Check if click is inside crop rect
    if (
      x >= cropRect.x &&
      x <= cropRect.x + cropRect.width &&
      y >= cropRect.y &&
      y <= cropRect.y + cropRect.height
    ) {
      setIsDragging(true);
      setDragStart({ x: x - cropRect.x, y: y - cropRect.y });
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasSize.width / rect.width;
    const scaleY = canvasSize.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const newX = Math.max(0, Math.min(x - dragStart.x, canvasSize.width - cropRect.width));
    const newY = Math.max(0, Math.min(y - dragStart.y, canvasSize.height - cropRect.height));

    setCropRect(prev => ({ ...prev, x: newX, y: newY }));
  };

  const handleCanvasMouseUp = () => {
    setIsDragging(false);
  };

  const handleCrop = async () => {
    if (!uploadedVideo) return;

    setProcessingStatus({
      stage: 'loading',
      progress: 0,
      message: 'Loading FFmpeg...',
    });

    try {
      const processor = getVideoProcessor();

      processor.setProgressCallback((progress) => {
        setProcessingStatus({
          stage: 'processing',
          progress,
          message: `Cropping video... ${progress}%`,
        });
      });

      await processor.load();

      setProcessingStatus({
        stage: 'processing',
        progress: 10,
        message: 'Starting crop...',
      });

      // Get original file
      const response = await fetch(uploadedVideo.blobUrl!);
      const blob = await response.blob();
      const file = new File([blob], uploadedVideo.filename, { type: uploadedVideo.mimetype });

      // Determine crop settings
      let cropSettings: VideoCropSettings;

      if (cropMode === 'preset') {
        const preset = PRESET_SIZES[selectedPreset];
        const videoWidth = uploadedVideo.metadata.width;
        const videoHeight = uploadedVideo.metadata.height;

        let width, height;
        if (preset.ratio === 'custom') {
          width = Math.min(customWidth, videoWidth);
          height = Math.min(customHeight, videoHeight);
        } else {
          width = Math.min(preset.width, videoWidth);
          height = Math.min(preset.height, videoHeight);
        }

        cropSettings = {
          x: Math.floor((videoWidth - width) / 2),
          y: Math.floor((videoHeight - height) / 2),
          width,
          height,
          presetType: 'preset',
          aspectRatio: preset.ratio,
        };
      } else {
        cropSettings = {
          x: Math.round(cropRect.x),
          y: Math.round(cropRect.y),
          width: Math.round(cropRect.width),
          height: Math.round(cropRect.height),
          presetType: 'manual',
        };
      }

      const result = await processor.cropVideo(file, cropSettings);

      const croppedBlob = await fetch(result.videoData).then(r => r.blob());

      setProcessedVideo({
        videoData: result.videoData,
        filename: result.filename,
        size: croppedBlob.size,
        width: result.metadata.width,
        height: result.metadata.height,
      });

      setProcessingStatus({
        stage: 'completed',
        progress: 100,
        message: 'Crop completed!',
      });
    } catch (error) {
      console.error('Crop error:', error);
      setProcessingError(error instanceof Error ? error.message : 'Crop failed');
      setProcessingStatus({
        stage: 'error',
        progress: 0,
        message: 'Crop failed',
      });
    }
  };

  const handleDownload = async () => {
    if (!processedVideo) return;

    try {
      const response = await fetch(processedVideo.videoData);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = processedVideo.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download error:', error);
    }
  };

  const handleReset = () => {
    if (processedVideo?.videoData) {
      URL.revokeObjectURL(processedVideo.videoData);
    }
    setProcessedVideo(null);
    setProcessingError('');
    setProcessingStatus({ stage: 'idle', progress: 0, message: '' });
    resetUpload();
  };

  const handleRedo = () => {
    if (processedVideo?.videoData) {
      URL.revokeObjectURL(processedVideo.videoData);
    }
    setProcessedVideo(null);
    setProcessingError('');
    setProcessingStatus({ stage: 'idle', progress: 0, message: '' });
    // Don't reset upload - keep the same file
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const currentPreset = PRESET_SIZES[selectedPreset];
  const cropWidth = currentPreset.ratio === 'custom' ? customWidth : currentPreset.width;
  const cropHeight = currentPreset.ratio === 'custom' ? customHeight : currentPreset.height;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 py-4 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-4"
        >
          <Button
            variant="ghost"
            onClick={onBack}
            className="absolute left-4 top-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
            Video Cropping
          </h1>
        </motion.div>

        {/* Validation Error */}
        {validationError && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-6"
          >
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-red-900">Upload Error</h3>
                    <p className="text-red-700 text-sm mt-1">{uploadError}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {!uploadedVideo && !isUploading && !preUploadedFiles && (
            <motion.div
              key="uploader"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <VideoUploader
                onVideoUpload={handleVideoUpload}
                isUploading={isUploading}
                uploadProgress={uploadProgress}
                supportsBatch={false}
              />
            </motion.div>
          )}

          {uploadedVideo && processingStatus.stage === 'idle' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-4"
            >
              {/* Settings Panel */}
              <Card className="lg:col-span-1">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Crop Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Crop Mode */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Crop Mode
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant={cropMode === 'preset' ? 'default' : 'outline'}
                        onClick={() => setCropMode('preset')}
                        className="w-full"
                        size="sm"
                      >
                        Preset
                      </Button>
                      <Button
                        variant={cropMode === 'manual' ? 'default' : 'outline'}
                        onClick={() => setCropMode('manual')}
                        className="w-full"
                        size="sm"
                      >
                        Manual
                      </Button>
                    </div>
                  </div>

                  {/* Preset Sizes */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {cropMode === 'preset' ? 'Select Size' : 'Base Size'}
                    </label>
                    <div className="space-y-1.5">
                      {PRESET_SIZES.map((preset, index) => (
                        <Button
                          key={index}
                          variant={selectedPreset === index ? 'default' : 'outline'}
                          onClick={() => setSelectedPreset(index)}
                          className="w-full justify-start text-xs h-8"
                          size="sm"
                        >
                          {preset.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Custom Dimensions */}
                  {currentPreset.ratio === 'custom' && (
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Width (px)
                        </label>
                        <input
                          type="number"
                          value={customWidth}
                          onChange={(e) => setCustomWidth(Number(e.target.value))}
                          className="w-full px-2 py-1 text-sm border rounded-md"
                          min={100}
                          max={uploadedVideo.metadata.width}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Height (px)
                        </label>
                        <input
                          type="number"
                          value={customHeight}
                          onChange={(e) => setCustomHeight(Number(e.target.value))}
                          className="w-full px-2 py-1 text-sm border rounded-md"
                          min={100}
                          max={uploadedVideo.metadata.height}
                        />
                      </div>
                    </div>
                  )}

                  {/* Video Info */}
                  <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <Info className="h-3 w-3 text-gray-500" />
                      <span className="font-medium">Video Info</span>
                    </div>
                    <div className="text-xs text-gray-600 space-y-0.5">
                      <p>Original: {uploadedVideo.metadata.width}x{uploadedVideo.metadata.height}</p>
                      <p>Crop to: {cropWidth}x{cropHeight}</p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <Button onClick={handleCrop} className="flex-1">
                      <Crop className="h-4 w-4 mr-2" />
                      Crop
                    </Button>
                    <Button onClick={handleReset} variant="outline">
                      Reset
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Preview Panel */}
              <div className="lg:col-span-2">
                <h3 className="text-base font-semibold mb-2">Preview</h3>
                {cropMode === 'preset' ? (
                  <VideoThumbnail
                    src={uploadedVideo.blobUrl!}
                    title={uploadedVideo.filename}
                    maxHeight="350px"
                  />
                ) : (
                  <Card className="overflow-hidden">
                    <CardContent className="p-0 relative">
                      <video
                        ref={videoRef}
                        src={uploadedVideo.blobUrl!}
                        className="hidden"
                        onLoadedMetadata={() => {
                          // Trigger canvas redraw
                          if (videoRef.current) {
                            videoRef.current.currentTime = 1;
                          }
                        }}
                      />
                      <div className="flex justify-center bg-gray-50">
                        <canvas
                          ref={canvasRef}
                          onMouseDown={handleCanvasMouseDown}
                          onMouseMove={handleCanvasMouseMove}
                          onMouseUp={handleCanvasMouseUp}
                          onMouseLeave={handleCanvasMouseUp}
                          className="max-h-[350px] object-contain cursor-move"
                        />
                      </div>
                      <p className="text-xs text-gray-500 p-2 text-center">
                        Drag the highlighted area to adjust crop position
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </motion.div>
          )}

          {processingStatus.stage !== 'idle' && processingStatus.stage !== 'completed' && (
            <motion.div
              key="processing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Card>
                <CardContent className="py-12">
                  <div className="text-center space-y-4">
                    <Clock className="h-16 w-16 text-blue-600 mx-auto animate-pulse" />
                    <h3 className="text-xl font-semibold">{processingStatus.message}</h3>
                    <div className="w-full max-w-md mx-auto">
                      <div className="flex justify-between text-sm text-gray-600 mb-2">
                        <span>Progress</span>
                        <span>{processingStatus.progress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className="bg-gradient-to-r from-blue-600 to-indigo-600 h-3 rounded-full transition-all duration-300"
                          style={{ width: `${processingStatus.progress}%` }}
                        />
                      </div>
                    </div>
                    <Button
                      onClick={() => {
                        if (processedVideo?.videoData) {
                          URL.revokeObjectURL(processedVideo.videoData);
                        }
                        setProcessedVideo(null);
                        setProcessingError('');
                        setProcessingStatus({ stage: 'idle', progress: 0, message: '' });
                      }}
                      variant="outline"
                      className="mt-4 border-red-300 text-red-600 hover:bg-red-50"
                    >
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {processedVideo && processingStatus.stage === 'completed' && (
            <motion.div
              key="result"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              {/* Success Banner */}
              <Card className="border-green-200 bg-green-50">
                <CardContent className="py-6">
                  <div className="flex items-center gap-3">
                    <Check className="h-6 w-6 text-green-600" />
                    <div>
                      <h3 className="font-semibold text-green-900">Crop Complete!</h3>
                      <p className="text-sm text-green-700">
                        New size: {processedVideo.width}x{processedVideo.height} • {formatFileSize(processedVideo.size)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Result */}
              <div>
                <h3 className="text-base font-semibold mb-2">Cropped Video</h3>
                <VideoThumbnail
                  src={processedVideo.videoData}
                  title={processedVideo.filename}
                  maxHeight="350px"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-center gap-4 flex-wrap">
                <Button onClick={handleDownload} size="lg" className="min-w-[180px]">
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
                <Button
                  onClick={() => {
                    if (onEditAgain && processedVideo && uploadedVideo) {
                      // Pass the processed video to edit again with a different mode
                      const mimeType = uploadedVideo.mimetype || 'video/mp4';
                      onEditAgain(processedVideo.videoData, {
                        filename: processedVideo.filename,
                        mimetype: mimeType
                      });
                    }
                  }}
                  variant="outline"
                  size="lg"
                  className="min-w-[180px] border-blue-300 text-blue-600 hover:bg-blue-50"
                >
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit Again
                </Button>
                <Button onClick={handleRedo} variant="outline" size="lg" className="min-w-[180px]">
                  Redo
                </Button>
              </div>
            </motion.div>
          )}

          {processingError && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Card className="border-red-200 bg-red-50">
                <CardContent className="py-6">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-6 w-6 text-red-600 mt-0.5" />
                    <div>
                      <h3 className="font-semibold text-red-900">Processing Error</h3>
                      <p className="text-red-700 text-sm mt-1">{processingError}</p>
                      <Button onClick={handleReset} variant="outline" className="mt-4">
                        Try Again
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
