'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { VideoUploader } from '@/components/VideoUploader';
import { VideoThumbnail } from '@/components/VideoThumbnail';
import { CropFrame } from '@/components/CropFrame';
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
  const [cropRect, setCropRect] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [videoDisplay, setVideoDisplay] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [lockAspectRatio, setLockAspectRatio] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
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

  // Initialize video display and crop rectangle when video is loaded
  useEffect(() => {
    if (uploadedVideo && videoLoaded) {
      const containerWidth = 600;
      const containerHeight = 400;
      const videoWidth = uploadedVideo.metadata.width;
      const videoHeight = uploadedVideo.metadata.height;
      const videoAspect = videoWidth / videoHeight;
      const containerAspect = containerWidth / containerHeight;

      let displayWidth, displayHeight;
      if (videoAspect > containerAspect) {
        displayWidth = containerWidth;
        displayHeight = containerWidth / videoAspect;
      } else {
        displayHeight = containerHeight;
        displayWidth = containerHeight * videoAspect;
      }

      const newVideoDisplay = {
        x: (containerWidth - displayWidth) / 2,
        y: (containerHeight - displayHeight) / 2,
        width: displayWidth,
        height: displayHeight,
      };
      setVideoDisplay(newVideoDisplay);

      // Initialize crop rectangle
      const preset = PRESET_SIZES[selectedPreset];
      let cropWidth: number, cropHeight: number;

      if (preset.ratio === 'custom') {
        cropWidth = Math.min(customWidth, displayWidth * 0.8);
        cropHeight = Math.min(customHeight, displayHeight * 0.8);
      } else {
        const targetRatio = preset.width / preset.height;
        if (targetRatio > 1) {
          cropWidth = Math.min(displayWidth * 0.6, 400);
          cropHeight = cropWidth / targetRatio;
        } else {
          cropHeight = Math.min(displayHeight * 0.6, 400);
          cropWidth = cropHeight * targetRatio;
        }
      }

      setCropRect({
        x: newVideoDisplay.x + (displayWidth - cropWidth) / 2,
        y: newVideoDisplay.y + (displayHeight - cropHeight) / 2,
        width: cropWidth,
        height: cropHeight,
      });
    }
  }, [uploadedVideo, selectedPreset, customWidth, customHeight, videoLoaded]);

  const handleVideoUpload = (file: File) => {
    uploadFile(file);
    setProcessedVideo(null);
    setProcessingError('');
    setVideoLoaded(false);
  };

  const handleCropFrameChange = (frame: { x: number; y: number; width: number; height: number }) => {
    setCropRect(frame);
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

      // Determine crop settings - convert display coordinates to video coordinates
      // Convert display coordinates to actual video coordinates
      const scale = uploadedVideo.metadata.width / videoDisplay.width;
      const videoX = (cropRect.x - videoDisplay.x) * scale;
      const videoY = (cropRect.y - videoDisplay.y) * scale;
      const videoWidth = cropRect.width * scale;
      const videoHeight = cropRect.height * scale;

      const cropSettings: VideoCropSettings = {
        x: Math.round(Math.max(0, videoX)),
        y: Math.round(Math.max(0, videoY)),
        width: Math.round(Math.min(videoWidth, uploadedVideo.metadata.width)),
        height: Math.round(Math.min(videoHeight, uploadedVideo.metadata.height)),
        presetType: 'manual',
      };

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
                  {/* Aspect Ratio Lock */}
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={lockAspectRatio}
                        onChange={(e) => setLockAspectRatio(e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                      Lock Aspect Ratio
                    </label>
                    <p className="text-xs text-gray-500 mt-1 ml-6">
                      Maintain current aspect ratio when resizing
                    </p>
                  </div>

                  {/* Base Size (for quick preset selection) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Base Size
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
                <Card className="overflow-hidden">
                  <CardContent className="p-0 relative">
                    <div
                      ref={containerRef}
                      className="relative bg-slate-200 rounded-lg overflow-hidden"
                      style={{ width: '600px', height: '400px' }}
                    >
                      {/* Video preview */}
                      <video
                        ref={videoRef}
                        src={uploadedVideo.blobUrl!}
                        className="absolute select-none"
                        style={{
                          left: videoDisplay.x,
                          top: videoDisplay.y,
                          width: videoDisplay.width,
                          height: videoDisplay.height,
                          objectFit: 'contain',
                        }}
                        onLoadedMetadata={() => {
                          if (videoRef.current) {
                            videoRef.current.currentTime = 1;
                            setVideoLoaded(true);
                          }
                        }}
                      >
                        <track kind="captions" />
                      </video>

                      {/* Crop Frame */}
                      {videoLoaded && videoDisplay.width > 0 && (
                        <CropFrame
                          x={cropRect.x}
                          y={cropRect.y}
                          width={cropRect.width}
                          height={cropRect.height}
                          containerWidth={600}
                          containerHeight={400}
                          imageDisplay={videoDisplay}
                          onFrameChange={handleCropFrameChange}
                          aspectRatio={lockAspectRatio ? cropRect.width / cropRect.height : undefined}
                          lockAspectRatio={lockAspectRatio}
                          showDimensions={true}
                          showAspectRatioHint={true}
                          showPresetButtons={false}
                          presetAspectRatios={[
                            { label: '16:9', ratio: 16/9, width: 16, height: 9 },
                            { label: '4:3', ratio: 4/3, width: 4, height: 3 },
                            { label: '1:1', ratio: 1, width: 1, height: 1 },
                            { label: '9:16', ratio: 9/16, width: 9, height: 16 },
                          ]}
                        />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 p-2 text-center">
                      Drag to move • Drag handles to resize • Aspect ratio hints appear when resizing
                    </p>
                  </CardContent>
                </Card>
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
