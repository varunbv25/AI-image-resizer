'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Scissors, Bot, ArrowLeft, FileArchive, Sparkles, X, Wand2, RotateCw, Video, Crop } from 'lucide-react';
import { AIImageResizing } from '@/components/modes/AIImageResizing';
import { ManualCropping } from '@/components/modes/ManualCropping';
import { ImageCompression } from '@/components/modes/ImageCompression';
import { ImageEnhancement } from '@/components/modes/ImageEnhancement';
import { RotateFlip } from '@/components/modes/RotateFlip';
import { VideoCompression } from '@/components/modes/VideoCompression';
import { VideoCropping } from '@/components/modes/VideoCropping';
import { VideoTrimming } from '@/components/modes/VideoTrimming';
import { useDropzone } from 'react-dropzone';
import { FILE_SIZE_LIMITS, validateImageFiles, validateVideoFiles, VIDEO_FILE_SIZE_LIMITS } from '@/lib/fileValidation';

type Mode = 'ai-crop' | 'manual-crop' | 'compression' | 'enhancement' | 'rotate-flip' | 'video-compression' | 'video-cropping' | 'video-trimming' | null;
type FileType = 'image' | 'video' | 'mixed';
type Step = 'upload' | 'mode-selection' | 'processing';

const modeConfig = {
  'ai-crop': {
    title: 'Generative Expand',
    description: 'Expand image backgrounds using AI generative fill without cropping',
    icon: Bot,
    color: 'blue',
    features: ['AI-powered generative background expansion', 'Analyzes and extends existing background', 'No cropping - only adds content', 'Seamless edge blending']
  },
  'manual-crop': {
    title: 'Manual Cropping',
    description: 'Precise manual control with drag-and-zoom functionality',
    icon: Scissors,
    color: 'green',
    features: ['Drag and resize image within frame', 'Zoom controls for precision', 'Real-time preview', 'Optimal compression']
  },
  'compression': {
    title: 'Compression',
    description: 'Reduce file size while maintaining image quality',
    icon: FileArchive,
    color: 'orange',
    features: ['Adjustable quality settings', 'Target file size control', 'Real-time compression preview', 'Multiple format support']
  },
  'enhancement': {
    title: 'Enhancement',
    description: 'Unblur and sharpen images with AI-powered clarity enhancement',
    icon: Wand2,
    color: 'indigo',
    features: ['Deblurring', 'Advanced sharpening', 'Auto-upscale < 100KB to 190-200KB', 'Edge enhancement']
  },
  'rotate-flip': {
    title: 'Rotate & Flip',
    description: 'Transform images with instant rotations and flips',
    icon: RotateCw,
    color: 'teal',
    features: ['Quick 90°/180°/270° rotations', 'Horizontal & vertical flips', 'Custom angle rotation', 'Batch processing support']
  },
  'video-compression': {
    title: 'Video Compression',
    description: 'Reduce video file size with quality or size-based compression',
    icon: Video,
    color: 'purple',
    features: ['Target file size control', 'MP4, MOV & WebM support', 'Client-side processing']
  },
  'video-cropping': {
    title: 'Video Cropping',
    description: 'Crop videos with preset or manual dimensions',
    icon: Crop,
    color: 'blue',
    features: ['Preset aspect ratios', 'Manual crop controls', 'Drag to reposition', 'Real-time preview']
  },
  'video-trimming': {
    title: 'Video Trimming',
    description: 'Trim videos with slider or manual time controls',
    icon: Scissors,
    color: 'gray',
    features: ['Slider-based trimming', 'Manual time input', 'Real-time preview', 'Precise frame control']
  }
};

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [currentStep, setCurrentStep] = useState<Step>('upload');
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [selectedMode, setSelectedMode] = useState<Mode>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fileType, setFileType] = useState<FileType>('image');
  const [videoThumbnails, setVideoThumbnails] = useState<Map<number, string>>(new Map());
  const [playingVideo, setPlayingVideo] = useState<number | null>(null);

  // Sync state with URL on mount and when URL changes
  useEffect(() => {
    const step = searchParams.get('step') as Step | null;
    const mode = searchParams.get('mode') as Mode | null;

    if (step === 'mode-selection' && uploadedFiles.length > 0) {
      setCurrentStep('mode-selection');
    } else if (step === 'processing' && mode && uploadedFiles.length > 0) {
      setCurrentStep('processing');
      setSelectedMode(mode);
    } else {
      // Default to upload if no valid state
      setCurrentStep('upload');
      setSelectedMode(null);
    }
  }, [searchParams, uploadedFiles.length]);

  // Generate video thumbnails
  useEffect(() => {
    if (fileType === 'video' && uploadedFiles.length > 0) {
      const generateThumbnails = async () => {
        const newThumbnails = new Map<number, string>();

        for (let i = 0; i < uploadedFiles.length; i++) {
          const file = uploadedFiles[i];
          if (file.type.startsWith('video/')) {
            try {
              const thumbnail = await generateVideoThumbnail(file);
              newThumbnails.set(i, thumbnail);
            } catch (error) {
              console.error('Error generating thumbnail:', error);
            }
          }
        }

        setVideoThumbnails(newThumbnails);
      };

      generateThumbnails();
    }
  }, [uploadedFiles, fileType]);

  // Helper function to generate video thumbnail
  const generateVideoThumbnail = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';

      video.onloadeddata = () => {
        // Seek to 25% of video duration for a representative frame
        video.currentTime = video.duration * 0.25;
      };

      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.8);
          URL.revokeObjectURL(video.src);
          resolve(thumbnailUrl);
        } else {
          reject(new Error('Failed to get canvas context'));
        }
      };

      video.onerror = () => {
        URL.revokeObjectURL(video.src);
        reject(new Error('Failed to load video'));
      };

      video.src = URL.createObjectURL(file);
    });
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setIsUploading(true);
      setUploadProgress(0);

      // Determine file type
      const hasImages = acceptedFiles.some(f => f.type.startsWith('image/'));
      const hasVideos = acceptedFiles.some(f => f.type.startsWith('video/'));

      let currentFileType: FileType = 'image';
      if (hasImages && hasVideos) {
        currentFileType = 'mixed';
      } else if (hasVideos) {
        currentFileType = 'video';
      }

      // Cannot mix images and videos
      if (currentFileType === 'mixed') {
        alert('Please upload either images or videos, not both at the same time.');
        setIsUploading(false);
        return;
      }

      setFileType(currentFileType);

      // Validate files based on type
      let validation: { isValid: boolean; invalidFiles: Array<{ file: File; error: string }>; validFiles: File[] };

      if (currentFileType === 'video') {
        validation = validateVideoFiles(acceptedFiles, 500 * 1024 * 1024);
      } else {
        validation = validateImageFiles(acceptedFiles, 50 * 1024 * 1024);
      }

      if (!validation.isValid) {
        // Show validation errors
        const errorMessages = validation.invalidFiles.map(
          ({ file, error }) => `${file.name}: ${error}`
        ).join('\n');
        alert(`Some files are invalid:\n\n${errorMessages}`);
        setIsUploading(false);

        // Use only valid files if any
        if (validation.validFiles.length > 0) {
          setUploadedFiles(validation.validFiles);
          setCurrentStep('mode-selection');
          router.push('/?step=mode-selection');
        }
        return;
      }

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 95) {
            clearInterval(progressInterval);
            return 95;
          }
          return prev + 5;
        });
      }, 100);

      // Small delay to show progress
      await new Promise(resolve => setTimeout(resolve, 500));

      clearInterval(progressInterval);
      setUploadProgress(100);

      // Wait a moment to show 100%
      await new Promise(resolve => setTimeout(resolve, 300));

      setUploadedFiles(acceptedFiles);
      setIsUploading(false);
      setUploadProgress(0);
      setCurrentStep('mode-selection');
      // Update URL with new step
      router.push('/?step=mode-selection');
    }
  }, [router]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
      'image/svg+xml': ['.svg'],
      'video/mp4': ['.mp4'],
      'video/webm': ['.webm'],
      'video/quicktime': ['.mov'],
      'video/x-msvideo': ['.avi'],
      'video/x-matroska': ['.mkv'],
    },
    multiple: true,
  });

  const handleModeSelect = (mode: Mode) => {
    setSelectedMode(mode);
    setCurrentStep('processing');
    // Update URL with mode
    router.push(`/?step=processing&mode=${mode}`);
  };

  const handleBack = () => {
    if (currentStep === 'processing') {
      setCurrentStep('mode-selection');
      setSelectedMode(null);
      router.push('/?step=mode-selection');
    } else if (currentStep === 'mode-selection') {
      setCurrentStep('upload');
      setUploadedFiles([]);
      router.push('/');
    }
  };

  const handleEditAgain = async (mediaData: string, metadata: {filename: string, mimetype: string}) => {
    // For videos, mediaData is a blob URL, not base64
    if (metadata.mimetype.startsWith('video/')) {
      // Fetch blob URL and convert to File
      const response = await fetch(mediaData);
      const blob = await response.blob();
      const file = new File([blob], metadata.filename, { type: metadata.mimetype });

      // Set the converted file as uploaded file
      setUploadedFiles([file]);
      setCurrentStep('mode-selection');
      setSelectedMode(null);
      router.push('/?step=mode-selection');
    } else {
      // Convert processed image to File object for reuse (original logic)
      const base64Data = mediaData.startsWith('data:') ? mediaData.split(',')[1] : mediaData;
      const byteString = atob(base64Data);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([ab], { type: metadata.mimetype });
      const file = new File([blob], metadata.filename, { type: metadata.mimetype });

      // Set the converted file as uploaded file
      setUploadedFiles([file]);
      setCurrentStep('mode-selection');
      setSelectedMode(null);
      router.push('/?step=mode-selection');
    }
  };

  const handleReset = () => {
    setCurrentStep('upload');
    setUploadedFiles([]);
    setSelectedMode(null);
    router.push('/');
  };

  const removeFile = (index: number) => {
    const newFiles = uploadedFiles.filter((_, i) => i !== index);
    setUploadedFiles(newFiles);
    if (newFiles.length === 0) {
      setCurrentStep('upload');
      router.push('/');
    }
  };

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: 'spring' as const,
        stiffness: 100
      }
    }
  };

  const cardVariants = {
    hidden: { scale: 0.8, opacity: 0 },
    visible: {
      scale: 1,
      opacity: 1,
      transition: {
        type: 'spring' as const,
        stiffness: 100
      }
    },
    hover: {
      scale: 1.05,
      y: -10,
      transition: {
        type: 'spring' as const,
        stiffness: 400,
        damping: 10
      }
    }
  };

  // Render upload step
  const renderUploadStep = () => (
    <motion.div
      key="upload"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50"
    >
      <div className="container mx-auto px-4 py-8">
        <motion.header variants={itemVariants} className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring' as const, stiffness: 200, delay: 0.2 }}
            className="inline-block mb-4"
          >
            <div className="relative">
              <Sparkles className="w-16 h-16 text-blue-600 mx-auto" />
              <motion.div
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.5, 0.8, 0.5]
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="absolute inset-0 bg-blue-400 rounded-full blur-xl"
              />
            </div>
          </motion.div>
          <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-3 pb-2 leading-tight">
            Imagify
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Transform your images and videos with AI-powered processing
          </p>
        </motion.header>

        <motion.div variants={itemVariants} className="max-w-3xl mx-auto">
          <Card className="p-6 shadow-2xl border-0 bg-white/80 backdrop-blur-sm">
            <div
              {...getRootProps()}
              className={`
                border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-300 min-h-[280px] flex flex-col items-center justify-center
                ${isDragActive
                  ? 'border-blue-500 bg-blue-50 scale-105'
                  : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
                }
                ${isUploading ? 'pointer-events-none opacity-75' : ''}
              `}
            >
              <input {...getInputProps()} disabled={isUploading} />

              {isUploading ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center gap-6 w-full max-w-md"
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center"
                  >
                    <Sparkles className="h-10 w-10 text-white" />
                  </motion.div>

                  <div className="space-y-3 text-center w-full">
                    <h3 className="text-xl font-semibold text-gray-800">
                      Uploading...
                    </h3>
                    <p className="text-sm text-gray-500">
                      Images: JPEG, PNG, WebP, SVG • Videos: MP4, MOV, WebM
                    </p>

                    <div className="space-y-2 mt-4">
                      <div className="flex justify-between text-xs text-gray-600">
                        <span>Upload Progress</span>
                        <span>{uploadProgress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <motion.div
                          className="bg-gradient-to-r from-blue-500 to-purple-600 h-2.5 rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${uploadProgress}%` }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  animate={isDragActive ? { scale: 1.1 } : { scale: 1 }}
                  className="flex flex-col items-center gap-6"
                >
                  <motion.div
                    animate={{
                      y: [0, -10, 0],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                    className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center"
                  >
                    <Sparkles className="h-10 w-10 text-white" />
                  </motion.div>

                  <div className="space-y-2 text-center">
                    <h3 className="text-xl font-semibold text-gray-800">
                      {isDragActive ? 'Drop your files here' : 'Upload Image or Video'}
                    </h3>
                    <p className="text-sm text-gray-500">
                      Drag and drop or click to browse
                    </p>
                    <p className="text-xs text-gray-400">
                      Images: JPEG, PNG, WebP, SVG • Videos: MP4, WebM, MOV, AVI, MKV
                    </p>
                  </div>

                  <Button
                    variant="outline"
                    type="button"
                    className="mt-3 border-2 hover:border-blue-500 hover:text-blue-600 transition-all"
                  >
                    Choose Files
                  </Button>
                </motion.div>
              )}
            </div>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );

  // Render mode selection step
  const renderModeSelection = () => {
    // Define batch-capable modes (only these support multiple images/videos)
    const batchCapableModes: Mode[] = ['compression', 'enhancement', 'rotate-flip', 'video-compression', 'video-cropping', 'video-trimming'];
    const isBatchUpload = uploadedFiles.length > 1;

    // Define mode types
    const imageModes: Mode[] = ['ai-crop', 'manual-crop', 'compression', 'enhancement', 'rotate-flip'];
    const videoModes: Mode[] = ['video-compression', 'video-cropping', 'video-trimming'];

    // Filter modes based on file type and batch capability
    const modesPool = fileType === 'video' ? videoModes : imageModes;

    const availableModes = isBatchUpload
      ? Object.entries(modeConfig).filter(([key]) =>
          modesPool.includes(key as Mode) && batchCapableModes.includes(key as Mode)
        )
      : Object.entries(modeConfig).filter(([key]) => modesPool.includes(key as Mode));

    // Check file size compatibility for each mode
    const getModeCompatibility = (modeKey: Mode) => {
      let maxSize: number;

      switch (modeKey) {
        case 'ai-crop':
          maxSize = FILE_SIZE_LIMITS.GENERATIVE_EXPAND;
          break;
        case 'enhancement':
          maxSize = FILE_SIZE_LIMITS.IMAGE_ENHANCEMENT;
          break;
        case 'manual-crop':
          maxSize = FILE_SIZE_LIMITS.MANUAL_CROPPING;
          break;
        case 'compression':
          maxSize = FILE_SIZE_LIMITS.IMAGE_COMPRESSION;
          break;
        case 'rotate-flip':
          maxSize = FILE_SIZE_LIMITS.ROTATE_FLIP;
          break;
        case 'video-compression':
          maxSize = VIDEO_FILE_SIZE_LIMITS.VIDEO_COMPRESSION;
          break;
        case 'video-cropping':
          maxSize = VIDEO_FILE_SIZE_LIMITS.VIDEO_CROPPING;
          break;
        case 'video-trimming':
          maxSize = VIDEO_FILE_SIZE_LIMITS.VIDEO_TRIMMING;
          break;
        default:
          maxSize = fileType === 'video' ? VIDEO_FILE_SIZE_LIMITS.DEFAULT : FILE_SIZE_LIMITS.DEFAULT;
      }

      const oversizedFiles = uploadedFiles.filter(file => file.size > maxSize);
      const isCompatible = oversizedFiles.length === 0;

      return {
        isCompatible,
        maxSize,
        oversizedFiles,
        maxSizeMB: (maxSize / 1024 / 1024).toFixed(0)
      };
    };

    return (
    <motion.div
      key="mode-selection"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50"
    >
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={handleBack}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <button
            onClick={handleReset}
            className="text-2xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent hover:opacity-80 transition-opacity"
          >
            Imagify
          </button>
          <div className="w-20" /> {/* Spacer for centering */}
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-center mb-6"
        >
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            Choose Your Operation
          </h2>
          <p className="text-gray-600 text-sm">
            {uploadedFiles.length} {fileType === 'video' ? 'video' : 'image'}{uploadedFiles.length > 1 ? 's' : ''} uploaded • {isBatchUpload ? 'Batch processing modes' : 'Select what you want to do'}
          </p>
        </motion.div>

        {/* Uploaded Files Preview */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="max-w-4xl mx-auto mb-6"
        >
          <div className="flex flex-wrap gap-4 justify-center">
            {uploadedFiles.slice(0, 5).map((file, index) => {
              const isVideo = file.type.startsWith('video/');
              const thumbnail = videoThumbnails.get(index);
              const isPlaying = playingVideo === index;

              return (
                <motion.div
                  key={index}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: index * 0.1 }}
                  className="relative group"
                >
                  <div className="w-20 h-20 rounded-lg overflow-hidden border-2 border-gray-200 bg-white">
                    {isVideo ? (
                      isPlaying ? (
                        <video
                          src={URL.createObjectURL(file)}
                          autoPlay
                          muted
                          loop
                          playsInline
                          className="w-full h-full object-cover cursor-pointer"
                          onClick={() => setPlayingVideo(null)}
                        />
                      ) : (
                        <div
                          className="relative w-full h-full cursor-pointer"
                          onClick={() => setPlayingVideo(index)}
                        >
                          {thumbnail ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={thumbnail}
                              alt={file.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                              <span className="text-gray-400 text-xs">Loading...</span>
                            </div>
                          )}
                          {/* Play icon overlay */}
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/50 transition-colors">
                            <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">
                              <div className="w-0 h-0 border-l-[10px] border-l-gray-800 border-y-[6px] border-y-transparent ml-1" />
                            </div>
                          </div>
                        </div>
                      )
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={URL.createObjectURL(file)}
                        alt={file.name}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <button
                    onClick={() => removeFile(index)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              );
            })}
            {uploadedFiles.length > 5 && (
              <div className="w-20 h-20 rounded-lg bg-gray-200 flex items-center justify-center">
                <span className="text-gray-600 text-sm font-semibold">+{uploadedFiles.length - 5}</span>
              </div>
            )}
          </div>
        </motion.div>

        {/* Mode Cards */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="max-w-6xl mx-auto"
        >
          <div className={`grid grid-cols-1 md:grid-cols-2 ${isBatchUpload ? 'lg:grid-cols-3' : 'lg:grid-cols-5'} gap-4`}>
            {availableModes.map(([key, config], index) => {
              const Icon = config.icon;
              const compatibility = getModeCompatibility(key as Mode);
              const isCompatible = compatibility.isCompatible;

              return (
                <motion.div
                  key={key}
                  variants={cardVariants}
                  whileHover={isCompatible ? "hover" : undefined}
                  whileTap={isCompatible ? { scale: 0.95 } : undefined}
                  custom={index}
                >
                  <Card
                    className={`cursor-pointer border-2 h-full flex flex-col transition-all duration-300 shadow-lg ${
                      !isCompatible
                        ? 'opacity-50 cursor-not-allowed border-gray-300'
                        : `hover:border-${config.color}-300 hover:shadow-2xl`
                    }`}
                    onClick={() => isCompatible && handleModeSelect(key as Mode)}
                  >
                    <CardHeader className="text-center pb-3 pt-4">
                      <motion.div
                        whileHover={isCompatible ? { rotate: 360 } : undefined}
                        transition={{ duration: 0.5 }}
                        className={`w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center ${
                          key === 'video-trimming'
                            ? 'bg-gray-200'
                            : key === 'video-compression'
                            ? 'bg-purple-100'
                            : `bg-${config.color}-100`
                        }`}
                      >
                        <Icon className={`w-6 h-6 ${
                          key === 'video-trimming'
                            ? 'text-black'
                            : key === 'video-compression'
                            ? 'text-purple-600'
                            : `text-${config.color}-600`
                        }`} />
                      </motion.div>
                      <CardTitle className="text-base font-bold text-gray-900 leading-tight">
                        {config.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-center flex flex-col flex-grow pt-0">
                      <p className="text-gray-600 mb-3 text-xs leading-snug">
                        {config.description}
                      </p>
                      {!isCompatible && (
                        <div className="mb-3 px-2 py-1.5 bg-red-50 border border-red-200 rounded text-xs text-red-600">
                          ⚠️ File too large (max {compatibility.maxSizeMB}MB)
                        </div>
                      )}
                      <ul className="text-xs text-gray-500 space-y-0.5 mb-4 flex-grow text-left">
                        {config.features.map((feature, i) => (
                          <li key={i} className="leading-tight">• {feature}</li>
                        ))}
                      </ul>
                      <Button
                        disabled={!isCompatible}
                        className={`w-full mt-auto text-sm py-1.5 ${
                          !isCompatible
                            ? 'bg-gray-400 cursor-not-allowed'
                            : `bg-${config.color}-600 hover:bg-${config.color}-700`
                        }`}
                      >
                        {!isCompatible ? 'Unavailable' : 'Select'}
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </motion.div>
    );
  };

  // Render processing step
  const renderProcessingStep = () => {
    if (!selectedMode) return null;

    const ModeComponent = {
      'ai-crop': AIImageResizing,
      'manual-crop': ManualCropping,
      'compression': ImageCompression,
      'enhancement': ImageEnhancement,
      'rotate-flip': RotateFlip,
      'video-compression': VideoCompression,
      'video-cropping': VideoCropping,
      'video-trimming': VideoTrimming,
    }[selectedMode];

    return (
      <motion.div
        key="processing"
        initial={{ opacity: 0, x: 100 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -100 }}
        className="min-h-screen bg-gray-50"
      >
        <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={handleBack}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Modes
            </Button>
            <button
              onClick={handleReset}
              className="text-2xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent hover:opacity-80 transition-opacity"
            >
              Imagify
            </button>
            <Button
              variant="outline"
              onClick={handleReset}
              className="text-gray-600 hover:text-gray-900"
            >
              Start Over
            </Button>
          </div>
        </div>
        <ModeComponent onBack={handleBack} onEditAgain={handleEditAgain} preUploadedFiles={uploadedFiles} />
      </motion.div>
    );
  };

  return (
    <AnimatePresence mode="wait">
      {currentStep === 'upload' && renderUploadStep()}
      {currentStep === 'mode-selection' && renderModeSelection()}
      {currentStep === 'processing' && renderProcessingStep()}
    </AnimatePresence>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}
