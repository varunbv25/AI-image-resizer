'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { VideoUploader } from '@/components/VideoUploader';
import { VideoThumbnail } from '@/components/VideoThumbnail';
import { useVideoUpload } from '@/hooks/useVideoUpload';
import { getVideoProcessor } from '@/lib/videoProcessor';
import { Download, Info, Check, Clock, AlertCircle, ArrowLeft, Edit2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { VideoCompressionSettings, VideoProcessingStatus } from '@/types';
import { VideoCompressionBatch } from './VideoCompressionBatch';

interface VideoCompressionProps {
  onBack: () => void;
  onEditAgain?: (videoData: string, metadata: { filename: string, mimetype: string }) => void;
  preUploadedFiles?: File[];
  onSwitchToBatch?: (files: File[]) => void;
}

export function VideoCompression({ onBack, onEditAgain, preUploadedFiles }: VideoCompressionProps) {
  const [batchFiles, setBatchFiles] = useState<File[] | undefined>(preUploadedFiles);

  // Check if we should use batch mode
  const isBatchMode = batchFiles && batchFiles.length > 1;

  // If batch mode, render batch component
  if (isBatchMode) {
    return <VideoCompressionBatch onBack={onBack} preUploadedFiles={batchFiles} />;
  }

  return (
    <VideoCompressionSingle
      onBack={onBack}
      onEditAgain={onEditAgain}
      preUploadedFiles={batchFiles && batchFiles.length === 1 ? batchFiles : undefined}
      onSwitchToBatch={setBatchFiles}
    />
  );
}

function VideoCompressionSingle({ onBack, onEditAgain, preUploadedFiles, onSwitchToBatch }: VideoCompressionProps) {
  const [targetSizeMB, setTargetSizeMB] = useState<number>(10);
  const [resolution, setResolution] = useState<'240p' | '360p' | '480p' | '720p'>('360p');
  const [outputFormat, setOutputFormat] = useState<'mp4' | 'webm' | 'mov'>('mp4');
  const [processedVideo, setProcessedVideo] = useState<{
    videoData: string;
    size: number;
    compressionRatio: number;
    filename: string;
  } | null>(null);
  const [processingStatus, setProcessingStatus] = useState<VideoProcessingStatus>({
    stage: 'idle',
    progress: 0,
    message: '',
  });
  const [processingError, setProcessingError] = useState<string>('');
  const [isCancelling, setIsCancelling] = useState(false);

  const {
    isUploading,
    uploadedVideo,
    error: uploadError,
    validationError,
    uploadProgress,
    uploadFile,
    reset: resetUpload,
  } = useVideoUpload('VIDEO_COMPRESSION');

  // Auto-load pre-uploaded files
  useEffect(() => {
    if (preUploadedFiles && preUploadedFiles.length > 0) {
      const file = preUploadedFiles[0];
      uploadFile(file);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Calculate minimum acceptable size for phone viewing based on resolution
  const calculateMinimumPhoneQualitySize = (duration: number, res: '240p' | '360p' | '480p' | '720p'): number => {
    // Resolution-specific minimum bitrates for acceptable quality on phone screens
    const minVideoBitrateMap = {
      '240p': 250,   // 250 kbps for 240p (low quality, may be blurry)
      '360p': 400,   // 400 kbps for 360p (optimal for small file sizes)
      '480p': 700,   // 700 kbps for 480p (better quality)
      '720p': 1500   // 1500 kbps for 720p (HD quality)
    };

    const minVideoBitrate = minVideoBitrateMap[res];
    const audioBitrate = 128; // kbps
    const totalBitrate = minVideoBitrate + audioBitrate;

    // Calculate size: (bitrate * duration) / 8 / 1024 = MB
    const minSizeMB = (totalBitrate * duration) / 8 / 1024;

    return Number(minSizeMB.toFixed(3));
  };

  // Update target size when video is uploaded or resolution changes
  useEffect(() => {
    if (uploadedVideo) {
      const minSize = calculateMinimumPhoneQualitySize(uploadedVideo.metadata.duration, resolution);
      // Set default target to 50% of original size, but not below minimum phone quality
      const defaultTargetMB = Math.max(
        minSize,
        (uploadedVideo.size / (1024 * 1024)) * 0.5
      );
      setTargetSizeMB(Number(defaultTargetMB.toFixed(3)));
    }
  }, [uploadedVideo, resolution]);

  const handleVideoUpload = (file: File) => {
    uploadFile(file);
    setProcessedVideo(null);
    setProcessingError('');
  };

  const handleBatchVideoUpload = (files: File[]) => {
    // Switch to batch mode by notifying parent
    if (onSwitchToBatch) {
      onSwitchToBatch(files);
    }
  };

  const handleCompress = async () => {
    if (!uploadedVideo) return;

    setProcessingStatus({
      stage: 'loading',
      progress: 0,
      message: 'Loading FFmpeg...',
    });

    try {
      // Get video processor
      const processor = getVideoProcessor();

      // Set progress callback
      processor.setProgressCallback((progress) => {
        setProcessingStatus({
          stage: 'processing',
          progress,
          message: `Compressing video... ${progress}%`,
        });
      });

      await processor.load();

      setProcessingStatus({
        stage: 'processing',
        progress: 10,
        message: 'Starting compression...',
      });

      // Get original file
      const response = await fetch(uploadedVideo.blobUrl!);
      const blob = await response.blob();
      const file = new File([blob], uploadedVideo.filename, { type: uploadedVideo.mimetype });

      // Compress video
      const settings: VideoCompressionSettings = {
        compressionType: 'filesize',
        targetSize: targetSizeMB,
        format: outputFormat,
        resolution: resolution,
      };

      const result = await processor.compressVideo(file, settings);

      // Get compressed size
      const compressedBlob = await fetch(result.videoData).then(r => r.blob());
      const compressionRatio = ((1 - compressedBlob.size / uploadedVideo.size) * 100);

      setProcessedVideo({
        videoData: result.videoData,
        size: compressedBlob.size,
        compressionRatio,
        filename: result.filename,
      });

      setProcessingStatus({
        stage: 'completed',
        progress: 100,
        message: 'Compression completed!',
      });
    } catch (error) {
      console.error('Compression error:', error);
      setProcessingError(error instanceof Error ? error.message : 'Compression failed');
      setProcessingStatus({
        stage: 'error',
        progress: 0,
        message: 'Compression failed',
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

  const handleCancel = () => {
    setIsCancelling(true);
    if (processedVideo?.videoData) {
      URL.revokeObjectURL(processedVideo.videoData);
    }
    setProcessedVideo(null);
    setProcessingError('');
    setProcessingStatus({ stage: 'idle', progress: 0, message: '' });
    setIsCancelling(false);
    // Don't reset upload - keep the original video loaded
  };

  const handleReset = () => {
    if (processedVideo?.videoData) {
      URL.revokeObjectURL(processedVideo.videoData);
    }
    setProcessedVideo(null);
    setProcessingError('');
    setProcessingStatus({ stage: 'idle', progress: 0, message: '' });
    setIsCancelling(false);
    resetUpload();
  };

  const handleRedo = () => {
    if (processedVideo?.videoData) {
      URL.revokeObjectURL(processedVideo.videoData);
    }
    setProcessedVideo(null);
    setProcessingError('');
    setProcessingStatus({ stage: 'idle', progress: 0, message: '' });
    setIsCancelling(false);
    // Don't reset upload - keep the same file
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

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
            Video Compression
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
              className="grid grid-cols-1 lg:grid-cols-2 gap-4"
            >
              {/* Settings Panel */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Compression Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">

                  {uploadedVideo && (
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-medium text-gray-700">
                          Target Size (MB)
                        </label>
                        <span className="text-sm text-purple-600 font-semibold">
                          {targetSizeMB.toFixed(2)} MB
                        </span>
                      </div>
                      <Slider
                        value={[targetSizeMB]}
                        onValueChange={(value) => setTargetSizeMB(value[0])}
                        min={calculateMinimumPhoneQualitySize(uploadedVideo.metadata.duration, resolution)}
                        max={Number((uploadedVideo.size / (1024 * 1024)).toFixed(3))-0.01}
                        step={0.001}
                        className="py-4"
                        disabled={calculateMinimumPhoneQualitySize(uploadedVideo.metadata.duration, resolution) >= Number((uploadedVideo.size / (1024 * 1024)).toFixed(3)) - 0.01}
                      />
                      <div className="space-y-1 mt-2">
                        <p className="text-xs text-gray-500">
                          Minimum: {formatFileSize(calculateMinimumPhoneQualitySize(uploadedVideo.metadata.duration, resolution) * 1024 * 1024)} |
                          Maximum: {formatFileSize(uploadedVideo.size - 10240)}
                        </p>
                        {(() => {
                          const fileSizeMB = uploadedVideo.size / (1024 * 1024);
                          const min240p = calculateMinimumPhoneQualitySize(uploadedVideo.metadata.duration, '240p');
                          const min360p = calculateMinimumPhoneQualitySize(uploadedVideo.metadata.duration, '360p');
                          const min480p = calculateMinimumPhoneQualitySize(uploadedVideo.metadata.duration, '480p');
                          const currentMin = calculateMinimumPhoneQualitySize(uploadedVideo.metadata.duration, resolution);

                          if (currentMin >= fileSizeMB - 0.01) {
                            // File is too small for current resolution
                            if (resolution === '720p' && min480p < fileSizeMB - 0.01) {
                              return <p className="text-xs text-red-600 font-medium">⚠️ Video file is too small for 720p compression. Try 480p or lower resolution.</p>;
                            } else if (resolution === '480p' && min360p < fileSizeMB - 0.01) {
                              return <p className="text-xs text-red-600 font-medium">⚠️ Video file is too small for 480p compression. Try 360p or 240p.</p>;
                            } else if (resolution === '360p' && min240p < fileSizeMB - 0.01) {
                              return <p className="text-xs text-red-600 font-medium">⚠️ Video file is too small for 360p compression. Try 240p.</p>;
                            } else if (resolution === '240p') {
                              return <p className="text-xs text-red-600 font-medium">⚠️ Video file is too small even for 240p compression. File is already highly compressed.</p>;
                            } else {
                              return <p className="text-xs text-red-600 font-medium">⚠️ Video file is too small for {resolution} compression. File is already highly compressed.</p>;
                            }
                          } else {
                            return <p className="text-xs text-green-600 font-medium">✓ Minimum set to maintain good quality for {resolution} on phone screens</p>;
                          }
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Resolution Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Output Resolution (30 FPS)
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant={resolution === '240p' ? 'default' : 'outline'}
                        onClick={() => setResolution('240p')}
                        className="w-full"
                        size="sm"
                      >
                        240p
                      </Button>
                      <Button
                        variant={resolution === '360p' ? 'default' : 'outline'}
                        onClick={() => setResolution('360p')}
                        className="w-full"
                        size="sm"
                      >
                        360p
                      </Button>
                      <Button
                        variant={resolution === '480p' ? 'default' : 'outline'}
                        onClick={() => setResolution('480p')}
                        className="w-full"
                        size="sm"
                      >
                        480p
                      </Button>
                      <Button
                        variant={resolution === '720p' ? 'default' : 'outline'}
                        onClick={() => setResolution('720p')}
                        className="w-full"
                        size="sm"
                      >
                        720p
                      </Button>
                    </div>
                    {uploadedVideo && (
                      <div className="mt-2 space-y-1">
                        <p className="text-xs text-gray-500">
                          Min size: {formatFileSize(calculateMinimumPhoneQualitySize(uploadedVideo.metadata.duration, resolution) * 1024 * 1024)}
                        </p>
                        {resolution === '240p' && (
                          <p className="text-xs text-amber-600 font-medium">
                            ⚠️ Low resolution, video may turn out to be blurry, small file size
                          </p>
                        )}
                        {resolution === '360p' && (
                          <p className="text-xs text-green-600 font-medium">
                            ✓ Optimal resolution, best file size
                          </p>
                        )}
                        {resolution === '480p' && (
                          <p className="text-xs text-blue-600 font-medium">
                            ℹ️ Better resolution, higher file size
                          </p>
                        )}
                        {resolution === '720p' && (
                          <p className="text-xs text-purple-600 font-medium">
                            ⭐ Best resolution, highest file size
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Output Format */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Output Format (H.264 Codec)
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        variant={outputFormat === 'mp4' ? 'default' : 'outline'}
                        onClick={() => setOutputFormat('mp4')}
                        className="w-full"
                        size="sm"
                      >
                        MP4
                      </Button>
                      <Button
                        variant={outputFormat === 'webm' ? 'default' : 'outline'}
                        onClick={() => setOutputFormat('webm')}
                        className="w-full"
                        size="sm"
                      >
                        WebM
                      </Button>
                      <Button
                        variant={outputFormat === 'mov' ? 'default' : 'outline'}
                        onClick={() => setOutputFormat('mov')}
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
                      <p>Size: {formatFileSize(uploadedVideo.size)}</p>
                      <p>Duration: {uploadedVideo.metadata.duration.toFixed(1)}s</p>
                      <p>Resolution: {uploadedVideo.metadata.width}x{uploadedVideo.metadata.height}</p>
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
              <div className="flex items-center justify-center">
                <VideoThumbnail
                  src={uploadedVideo.blobUrl!}
                  title={uploadedVideo.filename}
                  maxHeight="400px"
                />
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
                    <Clock className="h-16 w-16 text-purple-600 mx-auto animate-pulse" />
                    <h3 className="text-xl font-semibold">{processingStatus.message}</h3>
                    <div className="w-full max-w-md mx-auto">
                      <div className="flex justify-between text-sm text-gray-600 mb-2">
                        <span>Progress</span>
                        <span>{processingStatus.progress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className="bg-gradient-to-r from-purple-600 to-pink-600 h-3 rounded-full transition-all duration-300"
                          style={{ width: `${processingStatus.progress}%` }}
                        />
                      </div>
                    </div>
                    <Button
                      onClick={handleCancel}
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
                      <h3 className="font-semibold text-green-900">Compression Complete!</h3>
                      <p className="text-sm text-green-700">
                        Reduced by {processedVideo.compressionRatio.toFixed(1)}% •
                        {' '}{formatFileSize(uploadedVideo!.size)} → {formatFileSize(processedVideo.size)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Result */}
              <div>
                <h3 className="text-base font-semibold mb-2 text-center">Compressed Video</h3>
                <VideoThumbnail
                  src={processedVideo.videoData}
                  title={`${formatFileSize(processedVideo.size)}`}
                  maxHeight="400px"
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
