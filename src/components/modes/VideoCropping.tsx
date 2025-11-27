'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { VideoUploader } from '@/components/VideoUploader';
import { VideoThumbnail } from '@/components/VideoThumbnail';
import { CropFrame } from '@/components/CropFrame';
import { useVideoUpload } from '@/hooks/useVideoUpload';
import { getVideoProcessor } from '@/lib/videoProcessor';
import { uploadBatchVideoFiles, downloadVideosAsZip } from '@/lib/batchVideoHelper';
import { Download, Info, Check, Clock, AlertCircle, ArrowLeft, Crop, Edit2, CheckCircle, Video as VideoIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { VideoCropSettings, VideoProcessingStatus, VideoMetadata } from '@/types';

interface VideoCroppingProps {
  onBack: () => void;
  onEditAgain?: (videoData: string, metadata: { filename: string, mimetype: string }) => void;
  preUploadedFiles?: File[];
}

interface BatchVideoItem {
  id: string;
  filename: string;
  size: number;
  blobUrl: string;
  thumbnailUrl?: string;
  metadata: VideoMetadata;
  mimetype: string;
  selectedPreset: number;
  customWidth: number;
  customHeight: number;
  cropRect: { x: number; y: number; width: number; height: number };
  videoDisplay: { x: number; y: number; width: number; height: number };
  lockAspectRatio: boolean;
  videoLoaded: boolean;
  processedVideo: {
    videoData: string;
    filename: string;
    size: number;
    width: number;
    height: number;
  } | null;
  processingStatus: VideoProcessingStatus;
  processingError: string;
}

const PRESET_SIZES = [
  { label: '16:9 (1280x720)', width: 1280, height: 720, ratio: '16:9' },
  { label: '4:3 (1024x768)', width: 1024, height: 768, ratio: '4:3' },
  { label: '1:1 (1080x1080)', width: 1080, height: 1080, ratio: '1:1' },
  { label: '9:16 (1080x1920)', width: 1080, height: 1920, ratio: '9:16' },
  { label: 'Custom', width: 0, height: 0, ratio: 'custom' },
];

export function VideoCropping({ onBack, onEditAgain, preUploadedFiles }: VideoCroppingProps) {
  const isBatchMode = preUploadedFiles && preUploadedFiles.length > 1;

  // Batch mode state
  const [videos, setVideos] = useState<BatchVideoItem[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [batchUploadProgress, setBatchUploadProgress] = useState(0);
  const [batchUploadError, setBatchUploadError] = useState<string>('');
  const [isBatchUploading, setIsBatchUploading] = useState(false);

  // Single mode state
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
    isUploading: isSingleUploading,
    uploadedVideo,
    error: uploadError,
    validationError,
    uploadProgress,
    uploadFile,
    reset: resetUpload,
  } = useVideoUpload('VIDEO_CROPPING');

  const selectedVideo = videos.find(v => v.id === selectedVideoId);

  // Auto-load pre-uploaded files
  useEffect(() => {
    if (preUploadedFiles && preUploadedFiles.length > 0) {
      if (isBatchMode) {
        handleBatchVideoUpload(preUploadedFiles);
      } else {
        uploadFile(preUploadedFiles[0]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialize video display and crop rectangle for single mode
  useEffect(() => {
    if (!isBatchMode && uploadedVideo && videoLoaded && containerRef.current) {
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;
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
  }, [uploadedVideo, selectedPreset, customWidth, customHeight, videoLoaded, isBatchMode]);

  // Initialize video display and crop rectangle for batch mode
  useEffect(() => {
    if (isBatchMode && selectedVideo && selectedVideo.videoLoaded && containerRef.current) {
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;
      const videoWidth = selectedVideo.metadata.width;
      const videoHeight = selectedVideo.metadata.height;
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

      const preset = PRESET_SIZES[selectedVideo.selectedPreset];
      let cropWidth: number, cropHeight: number;

      if (preset.ratio === 'custom') {
        cropWidth = Math.min(selectedVideo.customWidth, displayWidth * 0.8);
        cropHeight = Math.min(selectedVideo.customHeight, displayHeight * 0.8);
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

      updateVideo(selectedVideo.id, {
        videoDisplay: newVideoDisplay,
        cropRect: {
          x: newVideoDisplay.x + (displayWidth - cropWidth) / 2,
          y: newVideoDisplay.y + (displayHeight - cropHeight) / 2,
          width: cropWidth,
          height: cropHeight,
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVideoId, selectedVideo?.videoLoaded, selectedVideo?.selectedPreset, selectedVideo?.customWidth, selectedVideo?.customHeight, isBatchMode]);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  // Batch mode functions
  const handleBatchVideoUpload = async (files: File[]) => {
    setIsBatchUploading(true);
    setBatchUploadError('');
    setBatchUploadProgress(0);

    try {
      const results = await uploadBatchVideoFiles(files, {
        maxConcurrent: 2,
        onProgress: (fileIndex, progress) => {
          const overallProgress = ((fileIndex + progress / 100) / files.length) * 100;
          setBatchUploadProgress(Math.round(overallProgress));
        },
      });

      const items: BatchVideoItem[] = results.map((result) => ({
        id: result.id,
        filename: result.filename,
        size: result.size,
        blobUrl: result.blobUrl,
        thumbnailUrl: result.thumbnailUrl,
        metadata: result.metadata,
        mimetype: 'video/mp4',
        selectedPreset: 0,
        customWidth: 1280,
        customHeight: 720,
        cropRect: { x: 0, y: 0, width: 0, height: 0 },
        videoDisplay: { x: 0, y: 0, width: 0, height: 0 },
        lockAspectRatio: false,
        videoLoaded: false,
        processedVideo: null,
        processingStatus: { stage: 'idle', progress: 0, message: '' },
        processingError: '',
      }));

      setVideos(items);
      setSelectedVideoId(items[0]?.id || null);
      setBatchUploadProgress(100);
    } catch (error) {
      console.error('Batch upload error:', error);
      setBatchUploadError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsBatchUploading(false);
    }
  };

  const updateVideo = (id: string, updates: Partial<BatchVideoItem>) => {
    setVideos(prev => prev.map(v => v.id === id ? { ...v, ...updates } : v));
  };

  const handleDownloadAll = async () => {
    const processedVideos = videos.filter(v => v.processedVideo);
    if (processedVideos.length === 0) return;

    const videosToZip = processedVideos.map(v => ({
      filename: v.processedVideo!.filename,
      blobUrl: v.processedVideo!.videoData,
    }));

    await downloadVideosAsZip(videosToZip, `cropped-videos-${Date.now()}.zip`);
  };

  // Single mode functions
  const handleVideoUpload = (file: File) => {
    uploadFile(file);
    setProcessedVideo(null);
    setProcessingError('');
    setVideoLoaded(false);
  };

  const handleCropFrameChange = (frame: { x: number; y: number; width: number; height: number }) => {
    if (isBatchMode && selectedVideo) {
      updateVideo(selectedVideo.id, { cropRect: frame });
    } else {
      setCropRect(frame);
    }
  };

  const handleCrop = async () => {
    if (isBatchMode && !selectedVideo) return;
    if (!isBatchMode && !uploadedVideo) return;

    if (isBatchMode && selectedVideo) {
      updateVideo(selectedVideo.id, {
        processingStatus: { stage: 'loading', progress: 0, message: 'Loading FFmpeg...' },
        processingError: '',
      });
    } else {
      setProcessingStatus({ stage: 'loading', progress: 0, message: 'Loading FFmpeg...' });
      setProcessingError('');
    }

    try {
      const processor = getVideoProcessor();

      processor.setProgressCallback((progress) => {
        if (isBatchMode && selectedVideo) {
          updateVideo(selectedVideo.id, {
            processingStatus: { stage: 'processing', progress, message: `Cropping video... ${progress}%` },
          });
        } else {
          setProcessingStatus({ stage: 'processing', progress, message: `Cropping video... ${progress}%` });
        }
      });

      await processor.load();

      if (isBatchMode && selectedVideo) {
        updateVideo(selectedVideo.id, {
          processingStatus: { stage: 'processing', progress: 10, message: 'Starting crop...' },
        });
      } else {
        setProcessingStatus({ stage: 'processing', progress: 10, message: 'Starting crop...' });
      }

      const response = await fetch(isBatchMode && selectedVideo ? selectedVideo.blobUrl : uploadedVideo!.blobUrl!);
      const blob = await response.blob();
      const filename = isBatchMode && selectedVideo ? selectedVideo.filename : uploadedVideo!.filename;
      const mimetype = isBatchMode && selectedVideo ? selectedVideo.mimetype : uploadedVideo!.mimetype;
      const file = new File([blob], filename, { type: mimetype });

      const currentCropRect = isBatchMode && selectedVideo ? selectedVideo.cropRect : cropRect;
      const currentVideoDisplay = isBatchMode && selectedVideo ? selectedVideo.videoDisplay : videoDisplay;
      const currentMetadata = isBatchMode && selectedVideo ? selectedVideo.metadata : uploadedVideo!.metadata;

      const scale = currentMetadata.width / currentVideoDisplay.width;
      const videoX = (currentCropRect.x - currentVideoDisplay.x) * scale;
      const videoY = (currentCropRect.y - currentVideoDisplay.y) * scale;
      const videoWidth = currentCropRect.width * scale;
      const videoHeight = currentCropRect.height * scale;

      const settings: VideoCropSettings = {
        x: Math.round(Math.max(0, videoX)),
        y: Math.round(Math.max(0, videoY)),
        width: Math.round(Math.min(videoWidth, currentMetadata.width)),
        height: Math.round(Math.min(videoHeight, currentMetadata.height)),
        presetType: 'manual',
      };

      const result = await processor.cropVideo(file, settings);
      const croppedBlob = await fetch(result.videoData).then(r => r.blob());

      if (isBatchMode && selectedVideo) {
        updateVideo(selectedVideo.id, {
          processedVideo: {
            videoData: result.videoData,
            filename: result.filename,
            size: croppedBlob.size,
            width: result.metadata.width,
            height: result.metadata.height,
          },
          processingStatus: { stage: 'completed', progress: 100, message: 'Crop completed!' },
        });
      } else {
        setProcessedVideo({
          videoData: result.videoData,
          filename: result.filename,
          size: croppedBlob.size,
          width: result.metadata.width,
          height: result.metadata.height,
        });
        setProcessingStatus({ stage: 'completed', progress: 100, message: 'Crop completed!' });
      }
    } catch (error) {
      console.error('Crop error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Crop failed';

      if (isBatchMode && selectedVideo) {
        updateVideo(selectedVideo.id, {
          processingError: errorMessage,
          processingStatus: { stage: 'error', progress: 0, message: 'Crop failed' },
        });
      } else {
        setProcessingError(errorMessage);
        setProcessingStatus({ stage: 'error', progress: 0, message: 'Crop failed' });
      }
    }
  };

  const handleDownload = async () => {
    const videoToDownload = isBatchMode && selectedVideo ? selectedVideo.processedVideo : processedVideo;
    if (!videoToDownload) return;

    try {
      const response = await fetch(videoToDownload.videoData);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = videoToDownload.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download error:', error);
    }
  };

  const handleReset = () => {
    if (isBatchMode) {
      videos.forEach(v => {
        if (v.blobUrl) URL.revokeObjectURL(v.blobUrl);
        if (v.processedVideo?.videoData) URL.revokeObjectURL(v.processedVideo.videoData);
      });
      setVideos([]);
      setSelectedVideoId(null);
    } else {
      if (processedVideo?.videoData) {
        URL.revokeObjectURL(processedVideo.videoData);
      }
      setProcessedVideo(null);
      setProcessingError('');
      setProcessingStatus({ stage: 'idle', progress: 0, message: '' });
      resetUpload();
    }
  };

  const handleRedo = () => {
    if (isBatchMode && selectedVideo) {
      if (selectedVideo.processedVideo?.videoData) {
        URL.revokeObjectURL(selectedVideo.processedVideo.videoData);
      }
      updateVideo(selectedVideo.id, {
        processedVideo: null,
        processingError: '',
        processingStatus: { stage: 'idle', progress: 0, message: '' },
      });
    } else {
      if (processedVideo?.videoData) {
        URL.revokeObjectURL(processedVideo.videoData);
      }
      setProcessedVideo(null);
      setProcessingError('');
      setProcessingStatus({ stage: 'idle', progress: 0, message: '' });
    }
  };

  const completedCount = isBatchMode ? videos.filter(v => v.processedVideo).length : 0;
  const currentPreset = isBatchMode && selectedVideo
    ? PRESET_SIZES[selectedVideo.selectedPreset]
    : PRESET_SIZES[selectedPreset];
  const cropWidth = currentPreset.ratio === 'custom'
    ? (isBatchMode && selectedVideo ? selectedVideo.customWidth : customWidth)
    : currentPreset.width;
  const cropHeight = currentPreset.ratio === 'custom'
    ? (isBatchMode && selectedVideo ? selectedVideo.customHeight : customHeight)
    : currentPreset.height;

  const currentUploadError = isBatchMode ? batchUploadError : uploadError;
  const currentValidationError = isBatchMode ? '' : validationError;

  // Render batch mode UI
  if (isBatchMode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 py-4 px-4">
        <div className="max-w-7xl mx-auto">
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-4">
            <Button variant="ghost" onClick={onBack} className="absolute left-4 top-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
              Video Cropping - Batch Mode
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              {videos.length} videos • {completedCount} processed
            </p>
          </motion.div>

          {currentUploadError && (
            <Card className="border-red-200 bg-red-50 mb-4">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-red-900">Upload Error</h3>
                    <p className="text-red-700 text-sm mt-1">{currentUploadError}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <AnimatePresence mode="wait">
            {videos.length === 0 && !isBatchUploading && (
              <motion.div key="uploader" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <VideoUploader
                  onVideoUpload={(file) => handleBatchVideoUpload([file])}
                  onBatchVideoUpload={handleBatchVideoUpload}
                  isUploading={isBatchUploading}
                  uploadProgress={batchUploadProgress}
                  supportsBatch={true}
                />
              </motion.div>
            )}

            {selectedVideo && selectedVideo.processingStatus.stage === 'idle' && (
              <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-12 gap-4">
                <div className="col-span-3">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Videos</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="space-y-2 max-h-[500px] overflow-y-auto mb-3">
                        {videos.map((video) => (
                          <div
                            key={video.id}
                            onClick={() => setSelectedVideoId(video.id)}
                            className={`relative p-2 rounded-lg border-2 cursor-pointer transition-all ${
                              selectedVideoId === video.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {video.thumbnailUrl ? (
                                <img src={video.thumbnailUrl} alt={video.filename} className="w-12 h-12 rounded object-cover" />
                              ) : (
                                <div className="w-12 h-12 rounded bg-gray-200 flex items-center justify-center">
                                  <VideoIcon className="w-6 h-6 text-gray-400" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">{video.filename}</p>
                                <p className="text-xs text-gray-500">{formatFileSize(video.size)}</p>
                              </div>
                              {video.processedVideo && <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />}
                            </div>
                          </div>
                        ))}
                      </div>
                      {completedCount > 0 && (
                        <Button onClick={handleDownloadAll} className="w-full bg-green-600 hover:bg-green-700">
                          <Download className="w-4 h-4 mr-2" />
                          Download All ({completedCount})
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="col-span-9">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <Card className="lg:col-span-1">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg">Crop Settings</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedVideo.lockAspectRatio}
                              onChange={(e) => updateVideo(selectedVideo.id, { lockAspectRatio: e.target.checked })}
                              className="w-4 h-4 text-blue-600 rounded"
                            />
                            Lock Aspect Ratio
                          </label>
                          <p className="text-xs text-gray-500 mt-1 ml-6">Maintain current aspect ratio when resizing</p>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Base Size</label>
                          <div className="space-y-1.5">
                            {PRESET_SIZES.map((preset, index) => (
                              <Button
                                key={index}
                                variant={selectedVideo.selectedPreset === index ? 'default' : 'outline'}
                                onClick={() => updateVideo(selectedVideo.id, { selectedPreset: index })}
                                className="w-full justify-start text-xs h-8"
                                size="sm"
                              >
                                {preset.label}
                              </Button>
                            ))}
                          </div>
                        </div>

                        {currentPreset.ratio === 'custom' && (
                          <div className="space-y-2">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Width (px)</label>
                              <input
                                type="number"
                                value={selectedVideo.customWidth}
                                onChange={(e) => updateVideo(selectedVideo.id, { customWidth: Number(e.target.value) })}
                                className="w-full px-2 py-1 text-sm border rounded-md"
                                min={100}
                                max={selectedVideo.metadata.width}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Height (px)</label>
                              <input
                                type="number"
                                value={selectedVideo.customHeight}
                                onChange={(e) => updateVideo(selectedVideo.id, { customHeight: Number(e.target.value) })}
                                className="w-full px-2 py-1 text-sm border rounded-md"
                                min={100}
                                max={selectedVideo.metadata.height}
                              />
                            </div>
                          </div>
                        )}

                        <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                          <div className="flex items-center gap-2 text-xs">
                            <Info className="h-3 w-3 text-gray-500" />
                            <span className="font-medium">Video Info</span>
                          </div>
                          <div className="text-xs text-gray-600 space-y-0.5">
                            <p>Original: {selectedVideo.metadata.width}x{selectedVideo.metadata.height}</p>
                            <p>Crop to: {cropWidth}x{cropHeight}</p>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Button onClick={handleCrop} className="flex-1">
                            <Crop className="h-4 w-4 mr-2" />
                            Crop
                          </Button>
                          <Button onClick={handleReset} variant="outline">Reset</Button>
                        </div>
                      </CardContent>
                    </Card>

                    <div className="lg:col-span-2">
                      <h3 className="text-base font-semibold mb-2">Preview</h3>
                      <Card className="overflow-hidden">
                        <CardContent className="p-4 relative">
                          <div ref={containerRef} className="relative bg-slate-200 rounded-lg overflow-hidden w-full" style={{ height: '500px', maxHeight: '70vh' }}>
                            <video
                              ref={videoRef}
                              src={selectedVideo.blobUrl}
                              className="absolute select-none"
                              style={{
                                left: selectedVideo.videoDisplay.x,
                                top: selectedVideo.videoDisplay.y,
                                width: selectedVideo.videoDisplay.width,
                                height: selectedVideo.videoDisplay.height,
                                objectFit: 'contain',
                              }}
                              onLoadedMetadata={() => {
                                if (videoRef.current) {
                                  videoRef.current.currentTime = 1;
                                  updateVideo(selectedVideo.id, { videoLoaded: true });
                                }
                              }}
                            >
                              <track kind="captions" />
                            </video>

                            {selectedVideo.videoLoaded && selectedVideo.videoDisplay.width > 0 && containerRef.current && (
                              <CropFrame
                                x={selectedVideo.cropRect.x}
                                y={selectedVideo.cropRect.y}
                                width={selectedVideo.cropRect.width}
                                height={selectedVideo.cropRect.height}
                                containerWidth={containerRef.current.clientWidth}
                                containerHeight={containerRef.current.clientHeight}
                                imageDisplay={selectedVideo.videoDisplay}
                                onFrameChange={handleCropFrameChange}
                                aspectRatio={selectedVideo.lockAspectRatio ? selectedVideo.cropRect.width / selectedVideo.cropRect.height : undefined}
                                lockAspectRatio={selectedVideo.lockAspectRatio}
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
                  </div>
                </div>
              </motion.div>
            )}

            {selectedVideo && selectedVideo.processingStatus.stage !== 'idle' && selectedVideo.processingStatus.stage !== 'completed' && (
              <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Card className="max-w-2xl mx-auto">
                  <CardContent className="py-16">
                    <div className="text-center space-y-6">
                      <Clock className="h-20 w-20 text-blue-600 mx-auto animate-pulse" />
                      <div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">{selectedVideo.processingStatus.message}</h2>
                        <p className="text-gray-600">This may take a few moments...</p>
                      </div>
                      <div className="w-full max-w-md mx-auto">
                        <div className="flex justify-between text-sm text-gray-600 mb-2">
                          <span>Progress</span>
                          <span className="font-semibold">{selectedVideo.processingStatus.progress}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-blue-600 to-indigo-600 h-4 rounded-full transition-all duration-300"
                            style={{ width: `${selectedVideo.processingStatus.progress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {selectedVideo && selectedVideo.processedVideo && selectedVideo.processingStatus.stage === 'completed' && (
              <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-12 gap-4">
                <div className="col-span-3">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Videos</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="space-y-2 max-h-[500px] overflow-y-auto mb-3">
                        {videos.map((video) => (
                          <div
                            key={video.id}
                            onClick={() => setSelectedVideoId(video.id)}
                            className={`relative p-2 rounded-lg border-2 cursor-pointer transition-all ${
                              selectedVideoId === video.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {video.thumbnailUrl ? (
                                <img src={video.thumbnailUrl} alt={video.filename} className="w-12 h-12 rounded object-cover" />
                              ) : (
                                <div className="w-12 h-12 rounded bg-gray-200 flex items-center justify-center">
                                  <VideoIcon className="w-6 h-6 text-gray-400" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">{video.filename}</p>
                                <p className="text-xs text-gray-500">{formatFileSize(video.size)}</p>
                              </div>
                              {video.processedVideo && <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />}
                            </div>
                          </div>
                        ))}
                      </div>
                      {completedCount > 0 && (
                        <Button onClick={handleDownloadAll} className="w-full bg-green-600 hover:bg-green-700">
                          <Download className="w-4 h-4 mr-2" />
                          Download All ({completedCount})
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="col-span-9 space-y-6">
                  <Card className="border-green-200 bg-green-50">
                    <CardContent className="py-6">
                      <div className="flex items-center justify-center gap-3">
                        <Check className="h-8 w-8 text-green-600" />
                        <div className="text-center">
                          <h3 className="text-xl font-bold text-green-900">Cropping Complete!</h3>
                          <p className="text-green-700 mt-1">
                            New size: {selectedVideo.processedVideo.width}x{selectedVideo.processedVideo.height} • {formatFileSize(selectedVideo.processedVideo.size)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <div>
                    <h3 className="text-lg font-semibold text-center mb-4">Cropped Video</h3>
                    <VideoThumbnail src={selectedVideo.processedVideo.videoData} title={selectedVideo.processedVideo.filename} maxHeight="400px" />
                  </div>

                  <div className="flex justify-center gap-4 flex-wrap">
                    <Button onClick={handleDownload} size="lg" className="bg-blue-600 hover:bg-blue-700 min-w-[200px]">
                      <Download className="h-5 w-5 mr-2" />
                      Download Video
                    </Button>
                    <Button onClick={handleRedo} variant="outline" size="lg" className="min-w-[200px]">Redo</Button>
                  </div>
                </div>
              </motion.div>
            )}

            {selectedVideo && selectedVideo.processingError && (
              <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Card className="border-red-200 bg-red-50">
                  <CardContent className="py-6">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-6 w-6 text-red-600 mt-0.5" />
                      <div>
                        <h3 className="font-semibold text-red-900">Processing Error</h3>
                        <p className="text-red-700 text-sm mt-1">{selectedVideo.processingError}</p>
                        <Button onClick={handleRedo} variant="outline" className="mt-4">Try Again</Button>
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

  // Render single mode UI
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 py-4 px-4">
      <div className="max-w-7xl mx-auto">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-4">
          <Button variant="ghost" onClick={onBack} className="absolute left-4 top-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
            Video Cropping
          </h1>
        </motion.div>

        {currentValidationError && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="mb-6">
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-red-900">Upload Error</h3>
                    <p className="text-red-700 text-sm mt-1">{currentUploadError}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {!uploadedVideo && !isSingleUploading && (
            <motion.div key="uploader" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <VideoUploader onVideoUpload={handleVideoUpload} isUploading={isSingleUploading} uploadProgress={uploadProgress} supportsBatch={false} />
            </motion.div>
          )}

          {uploadedVideo && processingStatus.stage === 'idle' && (
            <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="lg:col-span-1">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Crop Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                      <input type="checkbox" checked={lockAspectRatio} onChange={(e) => setLockAspectRatio(e.target.checked)} className="w-4 h-4 text-blue-600 rounded" />
                      Lock Aspect Ratio
                    </label>
                    <p className="text-xs text-gray-500 mt-1 ml-6">Maintain current aspect ratio when resizing</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Base Size</label>
                    <div className="space-y-1.5">
                      {PRESET_SIZES.map((preset, index) => (
                        <Button key={index} variant={selectedPreset === index ? 'default' : 'outline'} onClick={() => setSelectedPreset(index)} className="w-full justify-start text-xs h-8" size="sm">
                          {preset.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {currentPreset.ratio === 'custom' && (
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Width (px)</label>
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
                        <label className="block text-xs font-medium text-gray-700 mb-1">Height (px)</label>
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

                  <div className="flex gap-2">
                    <Button onClick={handleCrop} className="flex-1">
                      <Crop className="h-4 w-4 mr-2" />
                      Crop
                    </Button>
                    <Button onClick={handleReset} variant="outline">Reset</Button>
                  </div>
                </CardContent>
              </Card>

              <div className="lg:col-span-2">
                <h3 className="text-base font-semibold mb-2">Preview</h3>
                <Card className="overflow-hidden">
                  <CardContent className="p-4 relative">
                    <div ref={containerRef} className="relative bg-slate-200 rounded-lg overflow-hidden w-full" style={{ height: '500px', maxHeight: '70vh' }}>
                      <video
                        ref={videoRef}
                        src={uploadedVideo.blobUrl!}
                        className="absolute select-none"
                        style={{ left: videoDisplay.x, top: videoDisplay.y, width: videoDisplay.width, height: videoDisplay.height, objectFit: 'contain' }}
                        onLoadedMetadata={() => {
                          if (videoRef.current) {
                            videoRef.current.currentTime = 1;
                            setVideoLoaded(true);
                          }
                        }}
                      >
                        <track kind="captions" />
                      </video>

                      {videoLoaded && videoDisplay.width > 0 && containerRef.current && (
                        <CropFrame
                          x={cropRect.x}
                          y={cropRect.y}
                          width={cropRect.width}
                          height={cropRect.height}
                          containerWidth={containerRef.current.clientWidth}
                          containerHeight={containerRef.current.clientHeight}
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
            <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
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
                      <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 h-3 rounded-full transition-all duration-300" style={{ width: `${processingStatus.progress}%` }} />
                      </div>
                    </div>
                    <Button onClick={() => { if (processedVideo?.videoData) URL.revokeObjectURL(processedVideo.videoData); setProcessedVideo(null); setProcessingError(''); setProcessingStatus({ stage: 'idle', progress: 0, message: '' }); }} variant="outline" className="mt-4 border-red-300 text-red-600 hover:bg-red-50">
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {processedVideo && processingStatus.stage === 'completed' && (
            <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
              <Card className="border-green-200 bg-green-50">
                <CardContent className="py-6">
                  <div className="flex items-center gap-3">
                    <Check className="h-6 w-6 text-green-600" />
                    <div>
                      <h3 className="font-semibold text-green-900">Crop Complete!</h3>
                      <p className="text-sm text-green-700">New size: {processedVideo.width}x{processedVideo.height} • {formatFileSize(processedVideo.size)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div>
                <h3 className="text-base font-semibold mb-2">Cropped Video</h3>
                <VideoThumbnail src={processedVideo.videoData} title={processedVideo.filename} maxHeight="350px" />
              </div>

              <div className="flex justify-center gap-4 flex-wrap">
                <Button onClick={handleDownload} size="lg" className="min-w-[180px]">
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
                <Button
                  onClick={() => {
                    if (onEditAgain && processedVideo && uploadedVideo) {
                      const mimeType = uploadedVideo.mimetype || 'video/mp4';
                      onEditAgain(processedVideo.videoData, { filename: processedVideo.filename, mimetype: mimeType });
                    }
                  }}
                  variant="outline"
                  size="lg"
                  className="min-w-[180px] border-blue-300 text-blue-600 hover:bg-blue-50"
                >
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit Again
                </Button>
                <Button onClick={handleRedo} variant="outline" size="lg" className="min-w-[180px]">Redo</Button>
              </div>
            </motion.div>
          )}

          {processingError && (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Card className="border-red-200 bg-red-50">
                <CardContent className="py-6">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-6 w-6 text-red-600 mt-0.5" />
                    <div>
                      <h3 className="font-semibold text-red-900">Processing Error</h3>
                      <p className="text-red-700 text-sm mt-1">{processingError}</p>
                      <Button onClick={handleReset} variant="outline" className="mt-4">Try Again</Button>
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
