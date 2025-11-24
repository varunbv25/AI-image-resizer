'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { VideoUploader } from '@/components/VideoUploader';
import { VideoPlayer } from '@/components/VideoPlayer';
import { VideoThumbnail } from '@/components/VideoThumbnail';
import { getVideoProcessor } from '@/lib/videoProcessor';
import { uploadBatchVideoFiles, downloadVideosAsZip } from '@/lib/batchVideoHelper';
import { Download, Check, Clock, AlertCircle, ArrowLeft, CheckCircle, Video as VideoIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type {
  VideoTrimSettings,
  VideoProcessingStatus,
  VideoMetadata
} from '@/types';

interface VideoTrimmingBatchProps {
  onBack: () => void;
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
  // Trimming state
  startTime: number;
  endTime: number;
  currentTime: number;
  videoFrames: string[];
  isGeneratingFrames: boolean;
  processedVideo: {
    videoData: string;
    filename: string;
    size: number;
    duration: number;
  } | null;
  processingStatus: VideoProcessingStatus;
  processingError: string;
}

export function VideoTrimmingBatch({ onBack, preUploadedFiles }: VideoTrimmingBatchProps) {
  const [videos, setVideos] = useState<BatchVideoItem[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string>('');

  const longPressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const longPressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const frameScrollRef = useRef<HTMLDivElement>(null);

  const selectedVideo = videos.find(v => v.id === selectedVideoId);

  // Auto-load pre-uploaded files
  useEffect(() => {
    if (preUploadedFiles && preUploadedFiles.length > 0) {
      handleBatchVideoUpload(preUploadedFiles);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Generate video frames for timeline when selected video changes
  useEffect(() => {
    if (selectedVideo && selectedVideo.blobUrl && selectedVideo.videoFrames.length === 0 && !selectedVideo.isGeneratingFrames) {
      generateVideoFrames(selectedVideo.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVideoId]);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const cs = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}:${cs.toString().padStart(2, '0')}`;
  };

  const handleBatchVideoUpload = async (files: File[]) => {
    setIsUploading(true);
    setUploadError('');
    setUploadProgress(0);

    try {
      const results = await uploadBatchVideoFiles(files, {
        maxConcurrent: 2,
        onProgress: (fileIndex, progress) => {
          const overallProgress = ((fileIndex + progress / 100) / files.length) * 100;
          setUploadProgress(Math.round(overallProgress));
        },
      });

      const items: BatchVideoItem[] = results.map((result) => {
        return {
          id: result.id,
          filename: result.filename,
          size: result.size,
          blobUrl: result.blobUrl,
          thumbnailUrl: result.thumbnailUrl,
          metadata: result.metadata,
          mimetype: 'video/mp4',
          startTime: 0,
          endTime: result.metadata.duration,
          currentTime: 0,
          videoFrames: [],
          isGeneratingFrames: false,
          processedVideo: null,
          processingStatus: {
            stage: 'idle',
            progress: 0,
            message: '',
          },
          processingError: '',
        };
      });

      setVideos(items);
      setSelectedVideoId(items[0]?.id || null);
      setUploadProgress(100);
    } catch (error) {
      console.error('Batch upload error:', error);
      setUploadError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const generateVideoFrames = async (videoId: string) => {
    const video = videos.find(v => v.id === videoId);
    if (!video) return;

    updateVideo(videoId, { isGeneratingFrames: true });

    const frames: string[] = [];
    const videoElement = document.createElement('video');
    videoElement.src = video.blobUrl;
    videoElement.preload = 'metadata';

    await new Promise((resolve) => {
      videoElement.onloadedmetadata = resolve;
    });

    const duration = videoElement.duration;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      updateVideo(videoId, { isGeneratingFrames: false });
      return;
    }

    canvas.width = 120;
    canvas.height = 68;

    // Generate frames at 0.5-second intervals
    for (let time = 0; time < duration; time += 0.5) {
      videoElement.currentTime = time;
      await new Promise((resolve) => {
        videoElement.onseeked = resolve;
      });

      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      const frameUrl = canvas.toDataURL('image/jpeg', 0.7);
      frames.push(frameUrl);
    }

    updateVideo(videoId, { videoFrames: frames, isGeneratingFrames: false });
  };

  const updateVideo = (id: string, updates: Partial<BatchVideoItem>) => {
    setVideos(prev => prev.map(v => v.id === id ? { ...v, ...updates } : v));
  };

  const handleTimeUpdate = (time: number) => {
    if (!selectedVideo) return;

    if (time > selectedVideo.endTime) {
      const videoElement = document.querySelector('video') as HTMLVideoElement;
      if (videoElement) {
        videoElement.pause();
        videoElement.currentTime = selectedVideo.endTime;
        updateVideo(selectedVideo.id, { currentTime: selectedVideo.endTime });
      }
    } else if (time < selectedVideo.startTime) {
      const videoElement = document.querySelector('video') as HTMLVideoElement;
      if (videoElement) {
        videoElement.currentTime = selectedVideo.startTime;
        updateVideo(selectedVideo.id, { currentTime: selectedVideo.startTime });
      }
    } else {
      updateVideo(selectedVideo.id, { currentTime: time });
    }
  };

  const handleTrim = async () => {
    if (!selectedVideo) return;

    if (selectedVideo.startTime >= selectedVideo.endTime) {
      updateVideo(selectedVideo.id, { processingError: 'Start time must be less than end time' });
      return;
    }

    if (selectedVideo.endTime > selectedVideo.metadata.duration) {
      updateVideo(selectedVideo.id, { processingError: 'End time cannot exceed video duration' });
      return;
    }

    updateVideo(selectedVideo.id, {
      processingStatus: {
        stage: 'loading',
        progress: 0,
        message: 'Loading FFmpeg...',
      },
      processingError: '',
    });

    try {
      const processor = getVideoProcessor();

      processor.setProgressCallback((progress) => {
        updateVideo(selectedVideo.id, {
          processingStatus: {
            stage: 'processing',
            progress,
            message: `Trimming video... ${progress}%`,
          },
        });
      });

      await processor.load();

      updateVideo(selectedVideo.id, {
        processingStatus: {
          stage: 'processing',
          progress: 10,
          message: 'Starting trim...',
        },
      });

      const response = await fetch(selectedVideo.blobUrl);
      const blob = await response.blob();
      const file = new File([blob], selectedVideo.filename, { type: selectedVideo.mimetype });

      const settings: VideoTrimSettings = {
        startTime: selectedVideo.startTime,
        endTime: selectedVideo.endTime,
        trimType: 'slider',
      };

      const result = await processor.trimVideo(file, settings);
      const trimmedBlob = await fetch(result.videoData).then(r => r.blob());

      updateVideo(selectedVideo.id, {
        processedVideo: {
          videoData: result.videoData,
          filename: result.filename,
          size: trimmedBlob.size,
          duration: result.metadata.duration,
        },
        processingStatus: {
          stage: 'completed',
          progress: 100,
          message: 'Trim completed!',
        },
      });
    } catch (error) {
      console.error('Trim error:', error);
      updateVideo(selectedVideo.id, {
        processingError: error instanceof Error ? error.message : 'Trim failed',
        processingStatus: {
          stage: 'error',
          progress: 0,
          message: 'Trim failed',
        },
      });
    }
  };

  const handleDownload = async () => {
    if (!selectedVideo?.processedVideo) return;

    try {
      const response = await fetch(selectedVideo.processedVideo.videoData);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = selectedVideo.processedVideo.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download error:', error);
    }
  };

  const handleDownloadAll = async () => {
    const processedVideos = videos.filter(v => v.processedVideo);
    if (processedVideos.length === 0) return;

    const videosToZip = processedVideos.map(v => ({
      filename: v.processedVideo!.filename,
      blobUrl: v.processedVideo!.videoData,
    }));

    await downloadVideosAsZip(videosToZip, `trimmed-videos-${Date.now()}.zip`);
  };

  const handleRedo = () => {
    if (!selectedVideo) return;

    if (selectedVideo.processedVideo?.videoData) {
      URL.revokeObjectURL(selectedVideo.processedVideo.videoData);
    }

    updateVideo(selectedVideo.id, {
      processedVideo: null,
      processingError: '',
      processingStatus: { stage: 'idle', progress: 0, message: '' },
    });
  };

  const handleReset = () => {
    videos.forEach(v => {
      if (v.blobUrl) URL.revokeObjectURL(v.blobUrl);
      if (v.processedVideo?.videoData) URL.revokeObjectURL(v.processedVideo.videoData);
    });
    setVideos([]);
    setSelectedVideoId(null);
  };

  const clearLongPress = () => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
    if (longPressIntervalRef.current) {
      clearInterval(longPressIntervalRef.current);
      longPressIntervalRef.current = null;
    }
  };

  const handleButtonPress = (updateFunction: (prevValue: number) => number, setter: (id: string, field: 'startTime' | 'endTime', value: number) => void) => {
    if (!selectedVideo) return;

    clearLongPress();

    // Execute once immediately
    const field: 'startTime' | 'endTime' = setter === setStartTimeForVideo ? 'startTime' : 'endTime';
    const currentValue = field === 'startTime' ? selectedVideo.startTime : selectedVideo.endTime;
    const newValue = updateFunction(currentValue);
    setter(selectedVideo.id, field, newValue);

    // Start continuous movement after 1 second
    longPressTimeoutRef.current = setTimeout(() => {
      longPressIntervalRef.current = setInterval(() => {
        setVideos(prev => prev.map(v => {
          if (v.id === selectedVideo.id) {
            const val = field === 'startTime' ? v.startTime : v.endTime;
            const updated = updateFunction(val);
            return { ...v, [field]: updated };
          }
          return v;
        }));
      }, 100);
    }, 1000);
  };

  const setStartTimeForVideo = (id: string, _field: 'startTime' | 'endTime', value: number) => {
    updateVideo(id, { startTime: value });
  };

  const setEndTimeForVideo = (id: string, _field: 'startTime' | 'endTime', value: number) => {
    updateVideo(id, { endTime: value });
  };

  const completedCount = videos.filter(v => v.processedVideo).length;
  const duration = selectedVideo?.metadata.duration || 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-cyan-50 to-blue-50 py-12 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <Button
            variant="ghost"
            onClick={onBack}
            className="absolute left-4 top-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-teal-600 to-cyan-600 bg-clip-text text-transparent">
            Video Trimming - Batch Mode
          </h1>
        </motion.div>

        {/* Upload Error */}
        {uploadError && (
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
          {videos.length === 0 && !isUploading && !preUploadedFiles && (
            <motion.div
              key="uploader"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <VideoUploader
                onVideoUpload={(file) => handleBatchVideoUpload([file])}
                onBatchVideoUpload={handleBatchVideoUpload}
                isUploading={isUploading}
                uploadProgress={uploadProgress}
                supportsBatch={true}
              />
            </motion.div>
          )}

          {selectedVideo && selectedVideo.processingStatus.stage === 'idle' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-12 gap-6"
            >
              {/* Video Selector Sidebar */}
              <div className="col-span-3">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Videos ({videos.length})</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="space-y-2 max-h-[500px] overflow-y-auto mb-3">
                      {videos.map((video) => (
                        <div
                          key={video.id}
                          onClick={() => setSelectedVideoId(video.id)}
                          className={`
                            relative p-2 rounded-lg border-2 cursor-pointer transition-all
                            ${selectedVideoId === video.id ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-gray-300'}
                          `}
                        >
                          <div className="flex items-center gap-2">
                            {video.thumbnailUrl ? (
                              <img
                                src={video.thumbnailUrl}
                                alt={video.filename}
                                className="w-12 h-12 rounded object-cover"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded bg-gray-200 flex items-center justify-center">
                                <VideoIcon className="w-6 h-6 text-gray-400" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{video.filename}</p>
                              <p className="text-xs text-gray-500">{formatFileSize(video.size)}</p>
                            </div>
                            {video.processedVideo && (
                              <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                            )}
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

              {/* Main Processing Area */}
              <div className="col-span-9 space-y-6">
                {/* Video Preview */}
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-center bg-gray-100 rounded-lg p-4">
                      <div className="w-full max-w-4xl mx-auto">
                        <div className="relative w-full" style={{ height: '500px', maxHeight: '500px' }}>
                          <VideoPlayer
                            src={selectedVideo.blobUrl}
                            title={selectedVideo.filename}
                            showControls={true}
                            onTimeUpdate={handleTimeUpdate}
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Frame Timeline */}
                <Card>
                  <CardContent className="pt-6">
                    {selectedVideo.isGeneratingFrames ? (
                      <div className="text-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 mx-auto mb-2"></div>
                        <p className="text-sm text-gray-600">Generating timeline...</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Frame Strip */}
                        <div
                          ref={frameScrollRef}
                          role="slider"
                          aria-label="Video timeline"
                          aria-valuemin={0}
                          aria-valuemax={duration}
                          aria-valuenow={selectedVideo.currentTime}
                          tabIndex={0}
                          className="relative bg-gradient-to-r from-blue-600 to-blue-500 rounded-lg overflow-hidden cursor-pointer"
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const x = e.clientX - rect.left;
                            const percent = x / rect.width;
                            const newTime = Math.max(selectedVideo.startTime, Math.min(selectedVideo.endTime, percent * duration));
                            updateVideo(selectedVideo.id, { currentTime: newTime });

                            const videoElement = document.querySelector('video') as HTMLVideoElement;
                            if (videoElement) {
                              const wasPlaying = !videoElement.paused;
                              videoElement.pause();
                              videoElement.currentTime = newTime;
                              if (wasPlaying) {
                                videoElement.play().catch(() => {});
                              }
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'ArrowLeft') {
                              const newTime = Math.max(selectedVideo.startTime, selectedVideo.currentTime - 1);
                              updateVideo(selectedVideo.id, { currentTime: newTime });
                              const videoElement = document.querySelector('video') as HTMLVideoElement;
                              if (videoElement) {
                                const wasPlaying = !videoElement.paused;
                                videoElement.pause();
                                videoElement.currentTime = newTime;
                                if (wasPlaying) {
                                  videoElement.play().catch(() => {});
                                }
                              }
                            } else if (e.key === 'ArrowRight') {
                              const newTime = Math.min(selectedVideo.endTime, selectedVideo.currentTime + 1);
                              updateVideo(selectedVideo.id, { currentTime: newTime });
                              const videoElement = document.querySelector('video') as HTMLVideoElement;
                              if (videoElement) {
                                const wasPlaying = !videoElement.paused;
                                videoElement.pause();
                                videoElement.currentTime = newTime;
                                if (wasPlaying) {
                                  videoElement.play().catch(() => {});
                                }
                              }
                            }
                          }}
                        >
                          <div className="flex items-center w-full p-4 gap-0.5">
                            {/* Left handle */}
                            <div
                              className="absolute top-0 bottom-0 bg-white cursor-ew-resize z-30 hover:bg-gray-100 transition-all shadow-lg group border-2 border-gray-900"
                              style={{
                                left: `${(selectedVideo.startTime / duration) * 100}%`,
                                width: '16px',
                                transform: 'translateX(-8px)',
                              }}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                const startX = e.clientX;
                                const startValue = selectedVideo.startTime;

                                const handleMouseMove = (moveEvent: MouseEvent) => {
                                  const deltaX = moveEvent.clientX - startX;
                                  const container = frameScrollRef.current;
                                  if (container) {
                                    const percentChange = (deltaX / container.clientWidth);
                                    const newTime = Math.max(0, Math.min(selectedVideo.endTime - 0.1, startValue + (percentChange * duration)));
                                    updateVideo(selectedVideo.id, { startTime: Number(newTime.toFixed(1)) });
                                  }
                                };

                                const handleMouseUp = () => {
                                  document.removeEventListener('mousemove', handleMouseMove);
                                  document.removeEventListener('mouseup', handleMouseUp);
                                };

                                document.addEventListener('mousemove', handleMouseMove);
                                document.addEventListener('mouseup', handleMouseUp);
                              }}
                            >
                              <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 bg-gray-900"></div>
                              <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-white text-gray-900 text-xs px-2.5 py-1.5 rounded-md whitespace-nowrap font-bold shadow-lg border-2 border-gray-900">
                                START: {formatTime(selectedVideo.startTime)}
                              </div>
                            </div>

                            {/* Right handle */}
                            <div
                              className="absolute top-0 bottom-0 bg-white cursor-ew-resize z-30 hover:bg-gray-100 transition-all shadow-lg group border-2 border-gray-900"
                              style={{
                                left: `${(selectedVideo.endTime / duration) * 100}%`,
                                width: '16px',
                                transform: 'translateX(-8px)',
                              }}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                const startX = e.clientX;
                                const startValue = selectedVideo.endTime;

                                const handleMouseMove = (moveEvent: MouseEvent) => {
                                  const deltaX = moveEvent.clientX - startX;
                                  const container = frameScrollRef.current;
                                  if (container) {
                                    const percentChange = (deltaX / container.clientWidth);
                                    const newTime = Math.max(selectedVideo.startTime + 0.1, Math.min(duration, startValue + (percentChange * duration)));
                                    updateVideo(selectedVideo.id, { endTime: Number(newTime.toFixed(1)) });
                                  }
                                };

                                const handleMouseUp = () => {
                                  document.removeEventListener('mousemove', handleMouseMove);
                                  document.removeEventListener('mouseup', handleMouseUp);
                                };

                                document.addEventListener('mousemove', handleMouseMove);
                                document.addEventListener('mouseup', handleMouseUp);
                              }}
                            >
                              <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 bg-gray-900"></div>
                              <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-white text-gray-900 text-xs px-2.5 py-1.5 rounded-md whitespace-nowrap font-bold shadow-lg border-2 border-gray-900">
                                END: {formatTime(selectedVideo.endTime)}
                              </div>
                            </div>

                            {/* Overlay for non-selected regions */}
                            <div
                              className="absolute top-0 bottom-0 left-0 bg-black/60 pointer-events-none"
                              style={{
                                width: `${(selectedVideo.startTime / duration) * 100}%`,
                              }}
                            />
                            <div
                              className="absolute top-0 bottom-0 right-0 bg-black/60 pointer-events-none"
                              style={{
                                width: `${((duration - selectedVideo.endTime) / duration) * 100}%`,
                              }}
                            />

                            {/* Playback indicator */}
                            <div
                              role="button"
                              aria-label="Playback position indicator"
                              tabIndex={0}
                              className="absolute top-0 bottom-0 bg-white cursor-ew-resize z-20 hover:bg-blue-200 transition-colors group"
                              style={{
                                left: `${(selectedVideo.currentTime / duration) * 100}%`,
                                width: '4px',
                                boxShadow: '0 0 4px rgba(0,0,0,0.5)',
                              }}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const startX = e.clientX;
                                const startValue = selectedVideo.currentTime;

                                const handleMouseMove = (moveEvent: MouseEvent) => {
                                  const deltaX = moveEvent.clientX - startX;
                                  const container = frameScrollRef.current;
                                  if (container) {
                                    const percentChange = (deltaX / container.clientWidth);
                                    const newTime = Math.max(selectedVideo.startTime, Math.min(selectedVideo.endTime, startValue + (percentChange * duration)));
                                    updateVideo(selectedVideo.id, { currentTime: newTime });

                                    const videoElement = document.querySelector('video') as HTMLVideoElement;
                                    if (videoElement) {
                                      videoElement.currentTime = newTime;
                                    }
                                  }
                                };

                                const handleMouseUp = () => {
                                  document.removeEventListener('mousemove', handleMouseMove);
                                  document.removeEventListener('mouseup', handleMouseUp);
                                };

                                document.addEventListener('mousemove', handleMouseMove);
                                document.addEventListener('mouseup', handleMouseUp);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'ArrowLeft') {
                                  const newTime = Math.max(selectedVideo.startTime, selectedVideo.currentTime - 0.5);
                                  updateVideo(selectedVideo.id, { currentTime: newTime });
                                  const videoElement = document.querySelector('video') as HTMLVideoElement;
                                  if (videoElement) {
                                    const wasPlaying = !videoElement.paused;
                                    videoElement.pause();
                                    videoElement.currentTime = newTime;
                                    if (wasPlaying) {
                                      videoElement.play().catch(() => {});
                                    }
                                  }
                                } else if (e.key === 'ArrowRight') {
                                  const newTime = Math.min(selectedVideo.endTime, selectedVideo.currentTime + 0.5);
                                  updateVideo(selectedVideo.id, { currentTime: newTime });
                                  const videoElement = document.querySelector('video') as HTMLVideoElement;
                                  if (videoElement) {
                                    const wasPlaying = !videoElement.paused;
                                    videoElement.pause();
                                    videoElement.currentTime = newTime;
                                    if (wasPlaying) {
                                      videoElement.play().catch(() => {});
                                    }
                                  }
                                }
                              }}
                            >
                              <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs px-2 py-1 rounded whitespace-nowrap font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                                {formatTime(selectedVideo.currentTime)}
                              </div>
                            </div>

                            {/* Frame thumbnails */}
                            {selectedVideo.videoFrames.map((frame, index) => (
                              <div
                                key={index}
                                className="relative flex-shrink-0 border-r border-gray-700"
                                style={{ width: '120px', height: '68px' }}
                              >
                                <img
                                  src={frame}
                                  alt={`Frame ${index}`}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Timeline Info */}
                        <div className="flex items-center justify-between text-sm px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-700">Start:</span>
                            <div className="flex items-center gap-1">
                              <div className="flex flex-col gap-0.5">
                                <button
                                  type="button"
                                  onMouseDown={() => handleButtonPress((prev) => Math.min(prev + 0.1, selectedVideo.endTime - 0.1), setStartTimeForVideo)}
                                  onMouseUp={clearLongPress}
                                  onMouseLeave={clearLongPress}
                                  onTouchStart={() => handleButtonPress((prev) => Math.min(prev + 0.1, selectedVideo.endTime - 0.1), setStartTimeForVideo)}
                                  onTouchEnd={clearLongPress}
                                  className="bg-teal-600 text-white rounded px-2 text-xs hover:bg-teal-700 active:bg-teal-800 select-none"
                                >
                                  +
                                </button>
                                <button
                                  type="button"
                                  onMouseDown={() => handleButtonPress((prev) => Math.max(0, prev - 0.1), setStartTimeForVideo)}
                                  onMouseUp={clearLongPress}
                                  onMouseLeave={clearLongPress}
                                  onTouchStart={() => handleButtonPress((prev) => Math.max(0, prev - 0.1), setStartTimeForVideo)}
                                  onTouchEnd={clearLongPress}
                                  className="bg-teal-600 text-white rounded px-2 text-xs hover:bg-teal-700 active:bg-teal-800 select-none"
                                >
                                  -
                                </button>
                              </div>
                              <span className="font-mono font-semibold text-teal-600 bg-teal-50 px-2 py-1 rounded">
                                {formatTime(selectedVideo.startTime)}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-700">End:</span>
                            <div className="flex items-center gap-1">
                              <span className="font-mono font-semibold text-teal-600 bg-teal-50 px-2 py-1 rounded">
                                {formatTime(selectedVideo.endTime)}
                              </span>
                              <div className="flex flex-col gap-0.5">
                                <button
                                  type="button"
                                  onMouseDown={() => handleButtonPress((prev) => Math.min(duration, prev + 0.1), setEndTimeForVideo)}
                                  onMouseUp={clearLongPress}
                                  onMouseLeave={clearLongPress}
                                  onTouchStart={() => handleButtonPress((prev) => Math.min(duration, prev + 0.1), setEndTimeForVideo)}
                                  onTouchEnd={clearLongPress}
                                  className="bg-teal-600 text-white rounded px-2 text-xs hover:bg-teal-700 active:bg-teal-800 select-none"
                                >
                                  +
                                </button>
                                <button
                                  type="button"
                                  onMouseDown={() => handleButtonPress((prev) => Math.max(selectedVideo.startTime + 0.1, prev - 0.1), setEndTimeForVideo)}
                                  onMouseUp={clearLongPress}
                                  onMouseLeave={clearLongPress}
                                  onTouchStart={() => handleButtonPress((prev) => Math.max(selectedVideo.startTime + 0.1, prev - 0.1), setEndTimeForVideo)}
                                  onTouchEnd={clearLongPress}
                                  className="bg-teal-600 text-white rounded px-2 text-xs hover:bg-teal-700 active:bg-teal-800 select-none"
                                >
                                  -
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-700">Trim Duration:</span>
                            <span className="font-mono font-semibold text-teal-600 bg-teal-50 px-2 py-1 rounded">
                              {formatTime(selectedVideo.endTime - selectedVideo.startTime)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Processing Error */}
                {selectedVideo.processingError && (
                  <Card className="border-red-200 bg-red-50">
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                        <div>
                          <h3 className="font-semibold text-red-900">Error</h3>
                          <p className="text-red-700 text-sm mt-1">{selectedVideo.processingError}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Action Buttons */}
                <div className="flex justify-center gap-4">
                  <Button
                    onClick={handleTrim}
                    size="lg"
                    className="bg-teal-600 hover:bg-teal-700 min-w-[200px]"
                  >
                    Trim Video
                  </Button>
                  <Button
                    onClick={handleReset}
                    variant="outline"
                    size="lg"
                  >
                    Reset All
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {selectedVideo && selectedVideo.processingStatus.stage !== 'idle' && selectedVideo.processingStatus.stage !== 'completed' && (
            <motion.div
              key="processing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Card className="max-w-2xl mx-auto">
                <CardContent className="py-16">
                  <div className="text-center space-y-6">
                    <Clock className="h-20 w-20 text-teal-600 mx-auto animate-pulse" />
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900 mb-2">
                        {selectedVideo.processingStatus.message}
                      </h2>
                      <p className="text-gray-600">This may take a few moments...</p>
                    </div>
                    <div className="w-full max-w-md mx-auto">
                      <div className="flex justify-between text-sm text-gray-600 mb-2">
                        <span>Progress</span>
                        <span className="font-semibold">{selectedVideo.processingStatus.progress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-4">
                        <div
                          className="bg-gradient-to-r from-teal-600 to-cyan-600 h-4 rounded-full transition-all duration-300"
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
            <motion.div
              key="result"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-12 gap-6"
            >
              {/* Video Selector Sidebar */}
              <div className="col-span-3">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Videos ({videos.length})</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="space-y-2 max-h-[500px] overflow-y-auto mb-3">
                      {videos.map((video) => (
                        <div
                          key={video.id}
                          onClick={() => setSelectedVideoId(video.id)}
                          className={`
                            relative p-2 rounded-lg border-2 cursor-pointer transition-all
                            ${selectedVideoId === video.id ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-gray-300'}
                          `}
                        >
                          <div className="flex items-center gap-2">
                            {video.thumbnailUrl ? (
                              <img
                                src={video.thumbnailUrl}
                                alt={video.filename}
                                className="w-12 h-12 rounded object-cover"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded bg-gray-200 flex items-center justify-center">
                                <VideoIcon className="w-6 h-6 text-gray-400" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{video.filename}</p>
                              <p className="text-xs text-gray-500">{formatFileSize(video.size)}</p>
                            </div>
                            {video.processedVideo && (
                              <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                            )}
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

              {/* Result Area */}
              <div className="col-span-9 space-y-6">
                {/* Success Message */}
                <Card className="border-green-200 bg-green-50">
                  <CardContent className="py-6">
                    <div className="flex items-center justify-center gap-3">
                      <Check className="h-8 w-8 text-green-600" />
                      <div className="text-center">
                        <h3 className="text-xl font-bold text-green-900">Trimming Complete!</h3>
                        <p className="text-green-700 mt-1">
                          Duration: {formatTime(selectedVideo.processedVideo.duration)} •
                          Size: {formatFileSize(selectedVideo.processedVideo.size)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Result Preview */}
                <div>
                  <h3 className="text-lg font-semibold text-center mb-4">Trimmed Video</h3>
                  <VideoThumbnail
                    src={selectedVideo.processedVideo.videoData}
                    title={selectedVideo.processedVideo.filename}
                    maxHeight="500px"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex justify-center gap-4 flex-wrap">
                  <Button
                    onClick={handleDownload}
                    size="lg"
                    className="bg-teal-600 hover:bg-teal-700 min-w-[200px]"
                  >
                    <Download className="h-5 w-5 mr-2" />
                    Download Video
                  </Button>
                  <Button
                    onClick={handleRedo}
                    variant="outline"
                    size="lg"
                    className="min-w-[200px]"
                  >
                    Reset
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
