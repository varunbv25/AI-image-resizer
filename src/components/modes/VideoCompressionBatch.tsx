'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { VideoUploader } from '@/components/VideoUploader';
import { VideoThumbnail } from '@/components/VideoThumbnail';
import { getVideoProcessor } from '@/lib/videoProcessor';
import { uploadBatchVideoFiles, downloadVideosAsZip } from '@/lib/batchVideoHelper';
import { Download, Info, Check, Clock, AlertCircle, ArrowLeft, Edit2, CheckCircle, Video as VideoIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type {
  VideoCompressionSettings,
  VideoProcessingStatus,
  VideoMetadata
} from '@/types';

interface VideoCompressionBatchProps {
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
  // Processing state
  targetSizeMB: number;
  sizeUnit: 'KB' | 'MB';
  resolution: '240p' | '360p' | '480p' | '720p';
  outputFormat: 'mp4' | 'webm' | 'mov';
  processedVideo: {
    videoData: string;
    size: number;
    compressionRatio: number;
    filename: string;
  } | null;
  processingStatus: VideoProcessingStatus;
  processingError: string;
}

export function VideoCompressionBatch({ onBack, preUploadedFiles }: VideoCompressionBatchProps) {
  const [videos, setVideos] = useState<BatchVideoItem[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string>('');

  const selectedVideo = videos.find(v => v.id === selectedVideoId);

  // Debug: Log when selectedVideo changes
  useEffect(() => {
    if (selectedVideo) {
      console.log('[Selected Video]', {
        id: selectedVideo.id,
        filename: selectedVideo.filename,
        targetSizeMB: selectedVideo.targetSizeMB,
        resolution: selectedVideo.resolution,
        duration: selectedVideo.metadata.duration,
        size: selectedVideo.size
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVideoId]);

  // Auto-load pre-uploaded files
  useEffect(() => {
    if (preUploadedFiles && preUploadedFiles.length > 0) {
      handleBatchVideoUpload(preUploadedFiles);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Calculate minimum acceptable size for phone viewing based on resolution
  const calculateMinimumPhoneQualitySize = (duration: number, res: '240p' | '360p' | '480p' | '720p'): number => {
    const minVideoBitrateMap = {
      '240p': 250,   // 250 kbps for 240p (low quality, may be blurry)
      '360p': 400,   // 400 kbps for 360p (optimal for small file sizes)
      '480p': 700,   // 700 kbps for 480p (better quality)
      '720p': 1500   // 1500 kbps for 720p (HD quality)
    };

    const minVideoBitrate = minVideoBitrateMap[res];
    const audioBitrate = 128;
    const totalBitrate = minVideoBitrate + audioBitrate;
    const minSizeMB = (totalBitrate * duration) / 8 / 1024;

    return Number(minSizeMB.toFixed(3));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
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

      const items: BatchVideoItem[] = results.map((result, index) => {
        const defaultResolution: '360p' | '480p' | '720p' = '360p';
        const defaultFormat: 'mp4' | 'webm' | 'mov' = 'mp4';

        // Calculate minimum size for this specific video
        const duration = result.metadata.duration;
        const originalSizeMB = result.size / (1024 * 1024);
        const originalSizeKB = result.size / 1024;

        const minSizeForResolution = calculateMinimumPhoneQualitySize(
          duration,
          defaultResolution
        );

        // Default target is 50% of original or minimum, whichever is larger
        // But ensure it doesn't exceed the original file size
        const halfOriginalSize = originalSizeMB * 0.5;
        const maxPossibleSize = originalSizeMB - 0.01; // Must be less than original

        // If minimum required size is larger than the original file, use original size as target
        const defaultTargetMB = minSizeForResolution > maxPossibleSize
          ? maxPossibleSize
          : Math.max(minSizeForResolution, halfOriginalSize);

        // Auto-select unit based on file size: use KB for files < 1MB, MB otherwise
        const defaultUnit: 'KB' | 'MB' = originalSizeMB < 1 ? 'KB' : 'MB';

        console.log(`[Init Video ${index}] ${result.filename}:`, {
          id: result.id,
          duration,
          originalSizeMB: originalSizeMB.toFixed(2),
          originalSizeKB: originalSizeKB.toFixed(2),
          minSize: minSizeForResolution.toFixed(3),
          maxPossible: maxPossibleSize.toFixed(3),
          halfOriginal: halfOriginalSize.toFixed(3),
          targetSize: defaultTargetMB.toFixed(3),
          unit: defaultUnit,
          WARNING: minSizeForResolution > maxPossibleSize ? 'MIN > MAX - File too small for this duration!' : null
        });

        return {
          id: result.id,
          filename: result.filename,
          size: result.size,
          blobUrl: result.blobUrl,
          thumbnailUrl: result.thumbnailUrl,
          metadata: result.metadata,
          mimetype: 'video/mp4',
          targetSizeMB: Number(defaultTargetMB.toFixed(3)),
          sizeUnit: defaultUnit,
          resolution: defaultResolution,
          outputFormat: defaultFormat,
          processedVideo: null,
          processingStatus: {
            stage: 'idle',
            progress: 0,
            message: '',
          },
          processingError: '',
        };
      });

      console.log('[Videos Array Created]', items.length, 'videos');
      console.log('[All Videos]', items.map(v => ({
        id: v.id,
        filename: v.filename,
        targetSizeMB: v.targetSizeMB,
        duration: v.metadata.duration
      })));

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

  const updateVideo = (id: string, updates: Partial<BatchVideoItem>) => {
    setVideos(prev => prev.map(v => {
      if (v.id === id) {
        const updated = { ...v, ...updates };

        // If resolution changed, recalculate targetSizeMB to ensure it's above new minimum
        if (updates.resolution && updates.resolution !== v.resolution) {
          const newMinSize = calculateMinimumPhoneQualitySize(v.metadata.duration, updates.resolution);
          if (updated.targetSizeMB < newMinSize) {
            updated.targetSizeMB = newMinSize;
          }
        }

        return updated;
      }
      return v;
    }));
  };

  const handleCompress = async () => {
    if (!selectedVideo) return;

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
            message: `Compressing video... ${progress}%`,
          },
        });
      });

      await processor.load();

      updateVideo(selectedVideo.id, {
        processingStatus: {
          stage: 'processing',
          progress: 10,
          message: 'Starting compression...',
        },
      });

      const response = await fetch(selectedVideo.blobUrl);
      const blob = await response.blob();
      const file = new File([blob], selectedVideo.filename, { type: selectedVideo.mimetype });

      const settings: VideoCompressionSettings = {
        compressionType: 'filesize',
        targetSize: selectedVideo.targetSizeMB,
        format: selectedVideo.outputFormat,
        resolution: selectedVideo.resolution,
      };

      const result = await processor.compressVideo(file, settings);

      const compressedBlob = await fetch(result.videoData).then(r => r.blob());
      const compressionRatio = ((1 - compressedBlob.size / selectedVideo.size) * 100);

      updateVideo(selectedVideo.id, {
        processedVideo: {
          videoData: result.videoData,
          size: compressedBlob.size,
          compressionRatio,
          filename: result.filename,
        },
        processingStatus: {
          stage: 'completed',
          progress: 100,
          message: 'Compression completed!',
        },
      });
    } catch (error) {
      console.error('Compression error:', error);
      updateVideo(selectedVideo.id, {
        processingError: error instanceof Error ? error.message : 'Compression failed',
        processingStatus: {
          stage: 'error',
          progress: 0,
          message: 'Compression failed',
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

    await downloadVideosAsZip(videosToZip, `compressed-videos-${Date.now()}.zip`);
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

  const completedCount = videos.filter(v => v.processedVideo).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50 py-4 px-4">
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
          <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent">
            Video Compression - Batch Mode
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            {videos.length} videos • {completedCount} processed
          </p>
        </motion.div>

        {/* Upload Error */}
        {uploadError && (
          <Card className="border-red-200 bg-red-50 mb-4">
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
        )}

        {videos.length === 0 && !isUploading && !preUploadedFiles ? (
          <VideoUploader
            onVideoUpload={(file) => handleBatchVideoUpload([file])}
            onBatchVideoUpload={handleBatchVideoUpload}
            isUploading={isUploading}
            uploadProgress={uploadProgress}
            supportsBatch={true}
          />
        ) : (
          <div className="grid grid-cols-12 gap-4">
            {/* Video Selector Sidebar */}
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
                        className={`
                          relative p-2 rounded-lg border-2 cursor-pointer transition-all
                          ${selectedVideoId === video.id ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-gray-300'}
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
            <div className="col-span-9">
              {selectedVideo && (
                <AnimatePresence mode="wait">
                  {selectedVideo.processingStatus.stage === 'idle' && (
                    <motion.div
                      key="settings"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="grid grid-cols-1 lg:grid-cols-2 gap-4"
                    >
                      {/* Settings Panel */}
                      <Card key={selectedVideo.id}>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-lg">Compression Settings</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {/* Target Size */}
                          <div>
                            <div className="flex justify-between items-center mb-2">
                              <label className="text-sm font-medium text-gray-700">
                                Target Size
                              </label>
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-purple-600 font-semibold">
                                  {selectedVideo.sizeUnit === 'MB'
                                    ? `${selectedVideo.targetSizeMB.toFixed(2)} MB`
                                    : `${(selectedVideo.targetSizeMB * 1024).toFixed(0)} KB`
                                  }
                                </span>
                                <div className="flex border border-gray-300 rounded-md overflow-hidden">
                                  <button
                                    type="button"
                                    onClick={() => updateVideo(selectedVideo.id, { sizeUnit: 'KB' })}
                                    className={`px-2 py-0.5 text-xs font-medium transition-colors ${
                                      selectedVideo.sizeUnit === 'KB'
                                        ? 'bg-purple-600 text-white'
                                        : 'bg-white text-gray-700 hover:bg-gray-100'
                                    }`}
                                  >
                                    KB
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => updateVideo(selectedVideo.id, { sizeUnit: 'MB' })}
                                    className={`px-2 py-0.5 text-xs font-medium transition-colors ${
                                      selectedVideo.sizeUnit === 'MB'
                                        ? 'bg-purple-600 text-white'
                                        : 'bg-white text-gray-700 hover:bg-gray-100'
                                    }`}
                                  >
                                    MB
                                  </button>
                                </div>
                              </div>
                            </div>
                            <Slider
                              key={`${selectedVideo.id}-${selectedVideo.resolution}-${selectedVideo.sizeUnit}`}
                              value={[selectedVideo.sizeUnit === 'MB' ? selectedVideo.targetSizeMB : selectedVideo.targetSizeMB * 1024]}
                              onValueChange={(value) => {
                                const newTargetMB = selectedVideo.sizeUnit === 'MB' ? value[0] : value[0] / 1024;
                                updateVideo(selectedVideo.id, { targetSizeMB: newTargetMB });
                              }}
                              min={selectedVideo.sizeUnit === 'MB'
                                ? Math.min(
                                    calculateMinimumPhoneQualitySize(selectedVideo.metadata.duration, selectedVideo.resolution),
                                    Number((selectedVideo.size / (1024 * 1024)).toFixed(3)) - 0.01
                                  )
                                : Math.min(
                                    calculateMinimumPhoneQualitySize(selectedVideo.metadata.duration, selectedVideo.resolution) * 1024,
                                    Number((selectedVideo.size / 1024).toFixed(0)) - 1
                                  )
                              }
                              max={selectedVideo.sizeUnit === 'MB'
                                ? Number((selectedVideo.size / (1024 * 1024)).toFixed(3)) - 0.01
                                : Number((selectedVideo.size / 1024).toFixed(0)) - 1
                              }
                              step={selectedVideo.sizeUnit === 'MB' ? 0.001 : 1}
                              className="py-4"
                              disabled={calculateMinimumPhoneQualitySize(selectedVideo.metadata.duration, selectedVideo.resolution) >= Number((selectedVideo.size / (1024 * 1024)).toFixed(3)) - 0.01}
                            />
                            <div className="space-y-1 mt-2">
                              <p className="text-xs text-gray-500">
                                Minimum: {formatFileSize(calculateMinimumPhoneQualitySize(selectedVideo.metadata.duration, selectedVideo.resolution) * 1024 * 1024)} |
                                Maximum: {formatFileSize(selectedVideo.size - (selectedVideo.sizeUnit === 'MB' ? 10240 : 1024))}
                              </p>
                              {(() => {
                                const fileSizeMB = selectedVideo.size / (1024 * 1024);
                                const min240p = calculateMinimumPhoneQualitySize(selectedVideo.metadata.duration, '240p');
                                const min360p = calculateMinimumPhoneQualitySize(selectedVideo.metadata.duration, '360p');
                                const min480p = calculateMinimumPhoneQualitySize(selectedVideo.metadata.duration, '480p');
                                const currentMin = calculateMinimumPhoneQualitySize(selectedVideo.metadata.duration, selectedVideo.resolution);

                                if (currentMin >= fileSizeMB - 0.01) {
                                  // File is too small for current resolution
                                  if (selectedVideo.resolution === '720p' && min480p < fileSizeMB - 0.01) {
                                    return <p className="text-xs text-red-600 font-medium">⚠️ Video file is too small for 720p compression. Try 480p or lower resolution.</p>;
                                  } else if (selectedVideo.resolution === '480p' && min360p < fileSizeMB - 0.01) {
                                    return <p className="text-xs text-red-600 font-medium">⚠️ Video file is too small for 480p compression. Try 360p or 240p.</p>;
                                  } else if (selectedVideo.resolution === '360p' && min240p < fileSizeMB - 0.01) {
                                    return <p className="text-xs text-red-600 font-medium">⚠️ Video file is too small for 360p compression. Try 240p.</p>;
                                  } else if (selectedVideo.resolution === '240p') {
                                    return <p className="text-xs text-red-600 font-medium">⚠️ Video file is too small even for 240p compression. File is already highly compressed.</p>;
                                  } else {
                                    return <p className="text-xs text-red-600 font-medium">⚠️ Video file is too small for {selectedVideo.resolution} compression. File is already highly compressed.</p>;
                                  }
                                } else {
                                  return <p className="text-xs text-green-600 font-medium">✓ Minimum set to maintain good quality for {selectedVideo.resolution} on phone screens</p>;
                                }
                              })()}
                            </div>
                          </div>

                          {/* Resolution Selection */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Output Resolution (30 FPS)
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                              <Button
                                variant={selectedVideo.resolution === '240p' ? 'default' : 'outline'}
                                onClick={() => updateVideo(selectedVideo.id, { resolution: '240p' })}
                                className="w-full"
                                size="sm"
                              >
                                240p
                              </Button>
                              <Button
                                variant={selectedVideo.resolution === '360p' ? 'default' : 'outline'}
                                onClick={() => updateVideo(selectedVideo.id, { resolution: '360p' })}
                                className="w-full"
                                size="sm"
                              >
                                360p
                              </Button>
                              <Button
                                variant={selectedVideo.resolution === '480p' ? 'default' : 'outline'}
                                onClick={() => updateVideo(selectedVideo.id, { resolution: '480p' })}
                                className="w-full"
                                size="sm"
                              >
                                480p
                              </Button>
                              <Button
                                variant={selectedVideo.resolution === '720p' ? 'default' : 'outline'}
                                onClick={() => updateVideo(selectedVideo.id, { resolution: '720p' })}
                                className="w-full"
                                size="sm"
                              >
                                720p
                              </Button>
                            </div>
                            <div className="mt-2 space-y-1">
                              <p className="text-xs text-gray-500">
                                Min size: {formatFileSize(calculateMinimumPhoneQualitySize(selectedVideo.metadata.duration, selectedVideo.resolution) * 1024 * 1024)}
                              </p>
                              {selectedVideo.resolution === '240p' && (
                                <p className="text-xs text-amber-600 font-medium">
                                  ⚠️ Low resolution, video may turn out to be blurry, small file size
                                </p>
                              )}
                              {selectedVideo.resolution === '360p' && (
                                <p className="text-xs text-green-600 font-medium">
                                  ✓ Optimal resolution, best file size
                                </p>
                              )}
                              {selectedVideo.resolution === '480p' && (
                                <p className="text-xs text-blue-600 font-medium">
                                  ℹ️ Better resolution, higher file size
                                </p>
                              )}
                              {selectedVideo.resolution === '720p' && (
                                <p className="text-xs text-purple-600 font-medium">
                                  ⭐ Best resolution, highest file size
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Output Format */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Output Format (H.264 Codec)
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                              <Button
                                variant={selectedVideo.outputFormat === 'mp4' ? 'default' : 'outline'}
                                onClick={() => updateVideo(selectedVideo.id, { outputFormat: 'mp4' })}
                                className="w-full"
                                size="sm"
                              >
                                MP4
                              </Button>
                              <Button
                                variant={selectedVideo.outputFormat === 'webm' ? 'default' : 'outline'}
                                onClick={() => updateVideo(selectedVideo.id, { outputFormat: 'webm' })}
                                className="w-full"
                                size="sm"
                              >
                                WebM
                              </Button>
                              <Button
                                variant={selectedVideo.outputFormat === 'mov' ? 'default' : 'outline'}
                                onClick={() => updateVideo(selectedVideo.id, { outputFormat: 'mov' })}
                                className="w-full"
                                size="sm"
                              >
                                MOV
                              </Button>
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                              All formats use H.264 video codec with AAC audio
                            </p>
                          </div>

                          {/* Video Info */}
                          <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                            <div className="flex items-center gap-2 text-xs">
                              <Info className="h-3 w-3 text-gray-500" />
                              <span className="font-medium">Video Info</span>
                            </div>
                            <div className="text-xs text-gray-600 space-y-0.5">
                              <p>Size: {formatFileSize(selectedVideo.size)}</p>
                              <p>Duration: {selectedVideo.metadata.duration.toFixed(1)}s</p>
                              <p>Resolution: {selectedVideo.metadata.width}x{selectedVideo.metadata.height}</p>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex gap-2">
                            <Button onClick={handleCompress} className="flex-1">
                              Compress Video
                            </Button>
                            <Button onClick={handleReset} variant="outline">
                              Reset
                            </Button>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Preview Panel */}
                      <div className="flex items-center justify-center" key={`preview-${selectedVideo.id}`}>
                        <VideoThumbnail
                          key={selectedVideo.id}
                          src={selectedVideo.blobUrl}
                          title={selectedVideo.filename}
                          maxHeight="400px"
                        />
                      </div>
                    </motion.div>
                  )}

                  {selectedVideo.processingStatus.stage !== 'idle' && selectedVideo.processingStatus.stage !== 'completed' && (
                    <motion.div
                      key="processing"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <Card>
                        <CardContent className="py-12">
                          <div className="text-center space-y-4">
                            <Clock className="h-16 w-16 text-purple-600 mx-auto animate-pulse" />
                            <h3 className="text-xl font-semibold">{selectedVideo.processingStatus.message}</h3>
                            <div className="w-full max-w-md mx-auto">
                              <div className="flex justify-between text-sm text-gray-600 mb-2">
                                <span>Progress</span>
                                <span>{selectedVideo.processingStatus.progress}%</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-3">
                                <div
                                  className="bg-gradient-to-r from-purple-600 to-pink-600 h-3 rounded-full transition-all duration-300"
                                  style={{ width: `${selectedVideo.processingStatus.progress}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  )}

                  {selectedVideo.processedVideo && selectedVideo.processingStatus.stage === 'completed' && (
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
                              <h3 className="font-semibold text-green-900">Compression Complete!</h3>
                              <p className="text-sm text-green-700">
                                Reduced by {selectedVideo.processedVideo.compressionRatio.toFixed(1)}% •
                                {' '}{formatFileSize(selectedVideo.size)} → {formatFileSize(selectedVideo.processedVideo.size)}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Result */}
                      <div>
                        <h3 className="text-base font-semibold mb-2 text-center">Compressed Video</h3>
                        <VideoThumbnail
                          src={selectedVideo.processedVideo.videoData}
                          title={`${formatFileSize(selectedVideo.processedVideo.size)}`}
                          maxHeight="400px"
                        />
                      </div>

                      {/* Actions */}
                      <div className="flex justify-center gap-4 flex-wrap">
                        <Button onClick={handleDownload} size="lg" className="min-w-[180px]">
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </Button>
                        <Button onClick={handleRedo} variant="outline" size="lg" className="min-w-[180px]">
                          Redo
                        </Button>
                      </div>
                    </motion.div>
                  )}

                  {selectedVideo.processingError && (
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
                              <p className="text-red-700 text-sm mt-1">{selectedVideo.processingError}</p>
                              <Button onClick={handleRedo} variant="outline" className="mt-4">
                                Try Again
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
