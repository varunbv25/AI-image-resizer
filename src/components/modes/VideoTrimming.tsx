'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { VideoUploader } from '@/components/VideoUploader';
import { VideoPlayer } from '@/components/VideoPlayer';
import { VideoThumbnail } from '@/components/VideoThumbnail';
import { useVideoUpload } from '@/hooks/useVideoUpload';
import { getVideoProcessor } from '@/lib/videoProcessor';
import { Download, Check, Clock, AlertCircle, ArrowLeft, Scissors, Edit2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { VideoTrimSettings, VideoProcessingStatus } from '@/types';
import { VideoTrimmingBatch } from './VideoTrimmingBatch';

interface VideoTrimmingProps {
  onBack: () => void;
  onEditAgain?: (videoData: string, metadata: { filename: string, mimetype: string }) => void;
  preUploadedFiles?: File[];
  onSwitchToBatch?: (files: File[]) => void;
}

export function VideoTrimming({ onBack, onEditAgain, preUploadedFiles }: VideoTrimmingProps) {
  const [batchFiles, setBatchFiles] = useState<File[] | undefined>(preUploadedFiles);

  // Check if we should use batch mode
  const isBatchMode = batchFiles && batchFiles.length > 1;

  // If batch mode, render batch component
  if (isBatchMode) {
    return <VideoTrimmingBatch onBack={onBack} preUploadedFiles={batchFiles} />;
  }

  return (
    <VideoTrimmingSingle
      onBack={onBack}
      onEditAgain={onEditAgain}
      preUploadedFiles={batchFiles && batchFiles.length === 1 ? batchFiles : undefined}
      onSwitchToBatch={setBatchFiles}
    />
  );
}

function VideoTrimmingSingle({ onBack, onEditAgain, preUploadedFiles, onSwitchToBatch }: VideoTrimmingProps) {
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoFrames, setVideoFrames] = useState<string[]>([]);
  const [isGeneratingFrames, setIsGeneratingFrames] = useState(false);
  const longPressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const longPressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [processedVideo, setProcessedVideo] = useState<{
    videoData: string;
    filename: string;
    size: number;
    duration: number;
  } | null>(null);
  const [processingStatus, setProcessingStatus] = useState<VideoProcessingStatus>({
    stage: 'idle',
    progress: 0,
    message: '',
  });
  const [processingError, setProcessingError] = useState<string>('');

  const frameScrollRef = useRef<HTMLDivElement>(null);

  const {
    isUploading,
    uploadedVideo,
    error: uploadError,
    validationError,
    uploadProgress,
    uploadFile,
    reset: resetUpload,
  } = useVideoUpload('VIDEO_TRIMMING');

  // Handle video time updates
  const handleTimeUpdate = (time: number) => {
    // Constrain currentTime to be within start and end time bounds
    if (time > endTime) {
      const videoElement = document.querySelector('video') as HTMLVideoElement;
      if (videoElement) {
        videoElement.pause();
        videoElement.currentTime = endTime;
        setCurrentTime(endTime);
      }
    } else if (time < startTime) {
      const videoElement = document.querySelector('video') as HTMLVideoElement;
      if (videoElement) {
        videoElement.currentTime = startTime;
        setCurrentTime(startTime);
      }
    } else {
      setCurrentTime(time);
    }
  };

  // Initialize end time when video is loaded
  useEffect(() => {
    if (uploadedVideo) {
      const duration = uploadedVideo.metadata.duration;
      setEndTime(duration);
      setStartTime(0);
      setCurrentTime(0);
    }
  }, [uploadedVideo]);

  // Generate video frames for timeline
  useEffect(() => {
    if (uploadedVideo && uploadedVideo.blobUrl) {
      generateVideoFrames();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadedVideo]);

  // Generate frames at 1-second intervals
  const generateVideoFrames = async () => {
    if (!uploadedVideo) return;

    setIsGeneratingFrames(true);
    const frames: string[] = [];
    const video = document.createElement('video');
    video.src = uploadedVideo.blobUrl!;
    video.preload = 'metadata';

    await new Promise((resolve) => {
      video.onloadedmetadata = resolve;
    });

    const duration = video.duration;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      setIsGeneratingFrames(false);
      return;
    }

    canvas.width = 120;
    canvas.height = 68;

    // Generate frames at 1-second intervals
    for (let time = 0; time < duration; time += 0.5) {
      video.currentTime = time;
      await new Promise((resolve) => {
        video.onseeked = resolve;
      });

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frameUrl = canvas.toDataURL('image/jpeg', 0.7);
      frames.push(frameUrl);
    }

    setVideoFrames(frames);
    setIsGeneratingFrames(false);
  };

  // Auto-load pre-uploaded files
  useEffect(() => {
    if (preUploadedFiles && preUploadedFiles.length > 0) {
      uploadFile(preUploadedFiles[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleVideoUpload = (file: File) => {
    uploadFile(file);
    setProcessedVideo(null);
    setProcessingError('');
  };

  const handleBatchVideoUpload = (files: File[]) => {
    if (onSwitchToBatch) {
      onSwitchToBatch(files);
    }
  };


  const handleTrim = async () => {
    if (!uploadedVideo) return;

    // Validation
    if (startTime >= endTime) {
      setProcessingError('Start time must be less than end time');
      return;
    }

    if (endTime > uploadedVideo.metadata.duration) {
      setProcessingError('End time cannot exceed video duration');
      return;
    }

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
          message: `Trimming video... ${progress}%`,
        });
      });

      await processor.load();

      setProcessingStatus({
        stage: 'processing',
        progress: 10,
        message: 'Starting trim...',
      });

      // Get original file
      const response = await fetch(uploadedVideo.blobUrl!);
      const blob = await response.blob();
      const file = new File([blob], uploadedVideo.filename, { type: uploadedVideo.mimetype });

      // Trim video
      const settings: VideoTrimSettings = {
        startTime,
        endTime,
        trimType: 'slider',
      };

      const result = await processor.trimVideo(file, settings);

      const trimmedBlob = await fetch(result.videoData).then(r => r.blob());

      setProcessedVideo({
        videoData: result.videoData,
        filename: result.filename,
        size: trimmedBlob.size,
        duration: result.metadata.duration,
      });

      setProcessingStatus({
        stage: 'completed',
        progress: 100,
        message: 'Trim completed!',
      });
    } catch (error) {
      console.error('Trim error:', error);
      setProcessingError(error instanceof Error ? error.message : 'Trim failed');
      setProcessingStatus({
        stage: 'error',
        progress: 0,
        message: 'Trim failed',
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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const cs = Math.floor((seconds % 1) * 100); // centiseconds (hundredths)
    return `${mins}:${secs.toString().padStart(2, '0')}:${cs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
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

  const handleButtonPress = (updateFunction: (prevValue: number) => number, setter: React.Dispatch<React.SetStateAction<number>>) => {
    // Clear any existing timers
    clearLongPress();

    // Execute once immediately on press using functional update to get current value
    setter((prev) => updateFunction(prev));

    // Start continuous movement after 1 seconds (1000ms)
    longPressTimeoutRef.current = setTimeout(() => {
      // Repeat every 100ms while held
      longPressIntervalRef.current = setInterval(() => {
        setter((prev) => updateFunction(prev));
      }, 100);
    }, 1000);
  };

  const duration = uploadedVideo?.metadata.duration || 0;

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
            Video Trimming
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
                onBatchVideoUpload={handleBatchVideoUpload}
                isUploading={isUploading}
                uploadProgress={uploadProgress}
                supportsBatch={true}
              />
            </motion.div>
          )}

          {uploadedVideo && processingStatus.stage === 'idle' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              {/* Video Preview */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-center bg-gray-100 rounded-lg p-4">
                    <div className="w-full max-w-4xl mx-auto">
                      <div className="relative w-full" style={{ height: '500px', maxHeight: '500px' }}>
                        <VideoPlayer
                          src={uploadedVideo.blobUrl!}
                          title={uploadedVideo.filename}
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
                  {isGeneratingFrames ? (
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
                        aria-valuenow={currentTime}
                        tabIndex={0}
                        className="relative bg-gradient-to-r from-blue-600 to-blue-500 rounded-lg overflow-hidden cursor-pointer"
                        onClick={(e) => {
                          // Allow clicking on timeline to seek
                          const rect = e.currentTarget.getBoundingClientRect();
                          const x = e.clientX - rect.left;
                          const percent = x / rect.width;
                          // Constrain newTime within start and end markers
                          const newTime = Math.max(startTime, Math.min(endTime, percent * duration));
                          setCurrentTime(newTime);

                          // Update video player time
                          const videoElement = document.querySelector('video') as HTMLVideoElement;
                          if (videoElement) {
                            const wasPlaying = !videoElement.paused;
                            videoElement.pause();
                            videoElement.currentTime = newTime;
                            if (wasPlaying) {
                              videoElement.play().catch(() => {
                                // Ignore play interruption errors
                              });
                            }
                          }
                        }}
                        onKeyDown={(e) => {
                          // Allow keyboard navigation
                          if (e.key === 'ArrowLeft') {
                            // Constrain to stay within start marker
                            const newTime = Math.max(startTime, currentTime - 1);
                            setCurrentTime(newTime);
                            const videoElement = document.querySelector('video') as HTMLVideoElement;
                            if (videoElement) {
                              const wasPlaying = !videoElement.paused;
                              videoElement.pause();
                              videoElement.currentTime = newTime;
                              if (wasPlaying) {
                                videoElement.play().catch(() => {
                                  // Ignore play interruption errors
                                });
                              }
                            }
                          } else if (e.key === 'ArrowRight') {
                            // Constrain to stay within end marker
                            const newTime = Math.min(endTime, currentTime + 1);
                            setCurrentTime(newTime);
                            const videoElement = document.querySelector('video') as HTMLVideoElement;
                            if (videoElement) {
                              const wasPlaying = !videoElement.paused;
                              videoElement.pause();
                              videoElement.currentTime = newTime;
                              if (wasPlaying) {
                                videoElement.play().catch(() => {
                                  // Ignore play interruption errors
                                });
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
                              left: `${(startTime / duration) * 100}%`,
                              width: '16px',
                              transform: 'translateX(-8px)',
                            }}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              const startX = e.clientX;
                              const startValue = startTime;

                              const handleMouseMove = (moveEvent: MouseEvent) => {
                                const deltaX = moveEvent.clientX - startX;
                                const container = frameScrollRef.current;
                                if (container) {
                                  const percentChange = (deltaX / container.clientWidth);
                                  const newTime = Math.max(0, Math.min(endTime - 0.1, startValue + (percentChange * duration)));
                                  setStartTime(Number(newTime.toFixed(1)));
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
                            {/* Black center line */}
                            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 bg-gray-900"></div>
                            {/* Time label */}
                            <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-white text-gray-900 text-xs px-2.5 py-1.5 rounded-md whitespace-nowrap font-bold shadow-lg border-2 border-gray-900">
                              START: {formatTime(startTime)}
                            </div>
                          </div>

                          {/* Right handle */}
                          <div
                            className="absolute top-0 bottom-0 bg-white cursor-ew-resize z-30 hover:bg-gray-100 transition-all shadow-lg group border-2 border-gray-900"
                            style={{
                              left: `${(endTime / duration) * 100}%`,
                              width: '16px',
                              transform: 'translateX(-8px)',
                            }}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              const startX = e.clientX;
                              const startValue = endTime;

                              const handleMouseMove = (moveEvent: MouseEvent) => {
                                const deltaX = moveEvent.clientX - startX;
                                const container = frameScrollRef.current;
                                if (container) {
                                  const percentChange = (deltaX / container.clientWidth);
                                  const newTime = Math.max(startTime + 0.1, Math.min(duration, startValue + (percentChange * duration)));
                                  setEndTime(Number(newTime.toFixed(1)));
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
                            {/* Black center line */}
                            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 bg-gray-900"></div>
                            {/* Time label */}
                            <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-white text-gray-900 text-xs px-2.5 py-1.5 rounded-md whitespace-nowrap font-bold shadow-lg border-2 border-gray-900">
                              END: {formatTime(endTime)}
                            </div>
                          </div>

                          {/* Overlay for non-selected regions */}
                          <div
                            className="absolute top-0 bottom-0 left-0 bg-black/60 pointer-events-none"
                            style={{
                              width: `${(startTime / duration) * 100}%`,
                            }}
                          />
                          <div
                            className="absolute top-0 bottom-0 right-0 bg-black/60 pointer-events-none"
                            style={{
                              width: `${((duration - endTime) / duration) * 100}%`,
                            }}
                          />

                          {/* Playback indicator - thin white line */}
                          <div
                            role="button"
                            aria-label="Playback position indicator"
                            tabIndex={0}
                            className="absolute top-0 bottom-0 bg-white cursor-ew-resize z-20 hover:bg-blue-200 transition-colors group"
                            style={{
                              left: `${(currentTime / duration) * 100}%`,
                              width: '4px',
                              boxShadow: '0 0 4px rgba(0,0,0,0.5)',
                            }}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const startX = e.clientX;
                              const startValue = currentTime;

                              const handleMouseMove = (moveEvent: MouseEvent) => {
                                const deltaX = moveEvent.clientX - startX;
                                const container = frameScrollRef.current;
                                if (container) {
                                  const percentChange = (deltaX / container.clientWidth);
                                  // Constrain playback indicator within start and end markers
                                  const newTime = Math.max(startTime, Math.min(endTime, startValue + (percentChange * duration)));
                                  setCurrentTime(newTime);

                                  // Update video player time
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
                                // Constrain to start marker
                                const newTime = Math.max(startTime, currentTime - 0.5);
                                setCurrentTime(newTime);
                                const videoElement = document.querySelector('video') as HTMLVideoElement;
                                if (videoElement) {
                                  const wasPlaying = !videoElement.paused;
                                  videoElement.pause();
                                  videoElement.currentTime = newTime;
                                  if (wasPlaying) {
                                    videoElement.play().catch(() => {
                                      // Ignore play interruption errors
                                    });
                                  }
                                }
                              } else if (e.key === 'ArrowRight') {
                                // Constrain to end marker
                                const newTime = Math.min(endTime, currentTime + 0.5);
                                setCurrentTime(newTime);
                                const videoElement = document.querySelector('video') as HTMLVideoElement;
                                if (videoElement) {
                                  const wasPlaying = !videoElement.paused;
                                  videoElement.pause();
                                  videoElement.currentTime = newTime;
                                  if (wasPlaying) {
                                    videoElement.play().catch(() => {
                                      // Ignore play interruption errors
                                    });
                                  }
                                }
                              }
                            }}
                          >
                            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs px-2 py-1 rounded whitespace-nowrap font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                              {formatTime(currentTime)}
                            </div>
                          </div>

                          {/* Frame thumbnails */}
                          {videoFrames.map((frame, index) => (
                            <div
                              key={index}
                              className="relative flex-shrink-0 border-r border-gray-700"
                              style={{ width: '120px', height: '68px' }}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
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
                                onMouseDown={() => handleButtonPress((prev) => Math.min(prev + 0.1, endTime - 0.1), setStartTime)}
                                onMouseUp={clearLongPress}
                                onMouseLeave={clearLongPress}
                                onTouchStart={() => handleButtonPress((prev) => Math.min(prev + 0.1, endTime - 0.1), setStartTime)}
                                onTouchEnd={clearLongPress}
                                className="w-4 h-3 flex items-center justify-center hover:bg-gray-200 rounded transition-colors"
                                title="Forward"
                              >
                                <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[6px] border-b-gray-600"></div>
                              </button>
                              <button
                                type="button"
                                onMouseDown={() => handleButtonPress((prev) => Math.max(0, prev - 0.1), setStartTime)}
                                onMouseUp={clearLongPress}
                                onMouseLeave={clearLongPress}
                                onTouchStart={() => handleButtonPress((prev) => Math.max(0, prev - 0.1), setStartTime)}
                                onTouchEnd={clearLongPress}
                                className="w-4 h-3 flex items-center justify-center hover:bg-gray-200 rounded transition-colors"
                                title="Backward"
                              >
                                <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[6px] border-t-gray-600"></div>
                              </button>
                            </div>
                            <span className="font-mono font-semibold text-gray-900">
                              {formatTime(startTime)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-700">End:</span>
                          <div className="flex items-center gap-1">
                            <div className="flex flex-col gap-0.5">
                              <button
                                type="button"
                                onMouseDown={() => handleButtonPress((prev) => Math.min(duration, prev + 0.1), setEndTime)}
                                onMouseUp={clearLongPress}
                                onMouseLeave={clearLongPress}
                                onTouchStart={() => handleButtonPress((prev) => Math.min(duration, prev + 0.1), setEndTime)}
                                onTouchEnd={clearLongPress}
                                className="w-4 h-3 flex items-center justify-center hover:bg-gray-200 rounded transition-colors"
                                title="Forward"
                              >
                                <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[6px] border-b-gray-600"></div>
                              </button>
                              <button
                                type="button"
                                onMouseDown={() => handleButtonPress((prev) => Math.max(startTime + 0.1, prev - 0.1), setEndTime)}
                                onMouseUp={clearLongPress}
                                onMouseLeave={clearLongPress}
                                onTouchStart={() => handleButtonPress((prev) => Math.max(startTime + 0.1, prev - 0.1), setEndTime)}
                                onTouchEnd={clearLongPress}
                                className="w-4 h-3 flex items-center justify-center hover:bg-gray-200 rounded transition-colors"
                                title="Backward"
                              >
                                <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[6px] border-t-gray-600"></div>
                              </button>
                            </div>
                            <span className="font-mono font-semibold text-gray-900">
                              {formatTime(endTime)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Action Card */}
              <Card>
                <CardContent className="pt-6 space-y-6">
                  {/* Processing Error */}
                  {processingError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-sm text-red-700">{processingError}</p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <Button onClick={handleTrim} className="flex-1" size="lg">
                      <Scissors className="h-4 w-4 mr-2" />
                      Trim Video
                    </Button>
                    <Button onClick={handleReset} variant="outline" size="lg">
                      Reset
                    </Button>
                  </div>
                </CardContent>
              </Card>
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
                    <Clock className="h-16 w-16 text-teal-600 mx-auto animate-pulse" />
                    <h3 className="text-xl font-semibold">{processingStatus.message}</h3>
                    <div className="w-full max-w-md mx-auto">
                      <div className="flex justify-between text-sm text-gray-600 mb-2">
                        <span>Progress</span>
                        <span>{processingStatus.progress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className="bg-gradient-to-r from-teal-600 to-cyan-600 h-3 rounded-full transition-all duration-300"
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
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Check className="h-6 w-6 text-green-600" />
                      <div>
                        <h3 className="font-semibold text-green-900">Trim Complete!</h3>
                        <p className="text-sm text-green-700">
                          Your video has been trimmed successfully
                        </p>
                      </div>
                    </div>

                    {/* Trim Information */}
                    <div className="ml-9 space-y-2 text-sm text-green-800">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className="font-medium">Original Duration:</span>
                          <span className="ml-2">{formatTime(duration)}</span>
                        </div>
                        <div>
                          <span className="font-medium">Original Size:</span>
                          <span className="ml-2">{formatFileSize(uploadedVideo?.size || 0)}</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className="font-medium">Trimmed Duration:</span>
                          <span className="ml-2">{formatTime(processedVideo.duration)}</span>
                        </div>
                        <div>
                          <span className="font-medium">Trimmed Size:</span>
                          <span className="ml-2">{formatFileSize(processedVideo.size)}</span>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-green-300">
                        <span className="font-medium">Time Saved:</span>
                        <span className="ml-2">{formatTime(duration - processedVideo.duration)}</span>
                      </div>
                      <div className="pt-1 text-xs text-green-600">
                        ✓ Original video preserved • Smart trimming applied
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Result */}
              <div className="flex items-center justify-center">
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

          {processingError && processingStatus.stage === 'error' && (
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
