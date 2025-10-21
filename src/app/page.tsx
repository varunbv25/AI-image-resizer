'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Scissors, Bot, ArrowLeft, FileArchive, Sparkles, X, Wand2, RotateCw } from 'lucide-react';
import { AIImageResizing } from '@/components/modes/AIImageResizing';
import { ManualCropping } from '@/components/modes/ManualCropping';
import { ImageCompression } from '@/components/modes/ImageCompression';
import { ImageEnhancement } from '@/components/modes/ImageEnhancement';
import { RotateFlip } from '@/components/modes/RotateFlip';
import { useDropzone } from 'react-dropzone';

type Mode = 'ai-crop' | 'manual-crop' | 'compression' | 'enhancement' | 'rotate-flip' | null;
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
  }
};

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [currentStep, setCurrentStep] = useState<Step>('upload');
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [selectedMode, setSelectedMode] = useState<Mode>(null);
  const [processedImageData, setProcessedImageData] = useState<string | null>(null); // Base64 data of processed image
  const [processedImageMeta, setProcessedImageMeta] = useState<{filename: string, mimetype: string} | null>(null);

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

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setUploadedFiles(acceptedFiles);
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
      setProcessedImageData(null);
      setProcessedImageMeta(null);
      router.push('/');
    }
  };

  const handleEditAgain = (imageData: string, metadata: {filename: string, mimetype: string}) => {
    // Convert processed image to File object for reuse
    const base64Data = imageData.startsWith('data:') ? imageData.split(',')[1] : imageData;
    const byteString = atob(base64Data);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ab], { type: metadata.mimetype });
    const file = new File([blob], metadata.filename, { type: metadata.mimetype });

    // Store processed image data and metadata
    setProcessedImageData(imageData);
    setProcessedImageMeta(metadata);
    setUploadedFiles([file]);
    setCurrentStep('mode-selection');
    setSelectedMode(null);
    router.push('/?step=mode-selection');
  };

  const handleReset = () => {
    setCurrentStep('upload');
    setUploadedFiles([]);
    setSelectedMode(null);
    setProcessedImageData(null);
    setProcessedImageMeta(null);
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
            Transform your images with resizing and enhancement powered by AI
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
              `}
            >
              <input {...getInputProps()} />
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
                    {isDragActive ? 'Drop your images here' : 'Upload Your Images'}
                  </h3>
                  <p className="text-sm text-gray-500">
                    Drag and drop images or click to browse
                  </p>
                  <p className="text-xs text-gray-400">
                    Supports JPEG, PNG, WebP and SVG • Multiple files supported
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
            </div>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );

  // Render mode selection step
  const renderModeSelection = () => {
    // Define batch-capable modes (only these support multiple images)
    const batchCapableModes: Mode[] = ['compression', 'enhancement', 'rotate-flip'];
    const isBatchUpload = uploadedFiles.length > 1;

    // Filter modes based on batch capability
    const availableModes = isBatchUpload
      ? Object.entries(modeConfig).filter(([key]) => batchCapableModes.includes(key as Mode))
      : Object.entries(modeConfig);

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
            {uploadedFiles.length} image{uploadedFiles.length > 1 ? 's' : ''} uploaded • {isBatchUpload ? 'Batch processing modes' : 'Select what you want to do'}
          </p>
          {isBatchUpload && (
            <motion.p
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xs text-blue-600 mt-1"
            >
              Generative Expand and Manual Cropping are only available for single images
            </motion.p>
          )}
        </motion.div>

        {/* Uploaded Images Preview */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="max-w-4xl mx-auto mb-6"
        >
          <div className="flex flex-wrap gap-4 justify-center">
            {uploadedFiles.slice(0, 5).map((file, index) => (
              <motion.div
                key={index}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: index * 0.1 }}
                className="relative group"
              >
                <div className="w-20 h-20 rounded-lg overflow-hidden border-2 border-gray-200 bg-white">
                  {
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={URL.createObjectURL(file)}
                    alt={file.name}
                    className="w-full h-full object-cover"
                  />
                  }
                </div>
                <button
                  onClick={() => removeFile(index)}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            ))}
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
              return (
                <motion.div
                  key={key}
                  variants={cardVariants}
                  whileHover="hover"
                  whileTap={{ scale: 0.95 }}
                  custom={index}
                >
                  <Card
                    className={`cursor-pointer border-2 hover:border-${config.color}-300 h-full flex flex-col transition-all duration-300 shadow-lg hover:shadow-2xl`}
                    onClick={() => handleModeSelect(key as Mode)}
                  >
                    <CardHeader className="text-center pb-3 pt-4">
                      <motion.div
                        whileHover={{ rotate: 360 }}
                        transition={{ duration: 0.5 }}
                        className={`w-12 h-12 mx-auto mb-3 bg-${config.color}-100 rounded-full flex items-center justify-center`}
                      >
                        <Icon className={`w-6 h-6 text-${config.color}-600`} />
                      </motion.div>
                      <CardTitle className="text-base font-bold text-gray-900 leading-tight">
                        {config.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-center flex flex-col flex-grow pt-0">
                      <p className="text-gray-600 mb-3 text-xs leading-snug">
                        {config.description}
                      </p>
                      <ul className="text-xs text-gray-500 space-y-0.5 mb-4 flex-grow text-left">
                        {config.features.map((feature, i) => (
                          <li key={i} className="leading-tight">• {feature}</li>
                        ))}
                      </ul>
                      <Button className={`w-full bg-${config.color}-600 hover:bg-${config.color}-700 mt-auto text-sm py-1.5`}>
                        Select
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
      'rotate-flip': RotateFlip
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
