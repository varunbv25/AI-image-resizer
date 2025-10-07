'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Scissors, Bot, Maximize, ArrowLeft, FileArchive } from 'lucide-react';
import { AIImageResizing } from '@/components/modes/AIImageResizing';
import { ManualCropping } from '@/components/modes/ManualCropping';
import { Upscaling } from '@/components/modes/Upscaling';
import { ImageCompression } from '@/components/modes/ImageCompression';

type Mode = 'home' | 'ai-crop' | 'manual-crop' | 'upscaling' | 'compression';

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentMode, setCurrentMode] = useState<Mode>('home');

  // Sync mode with URL on mount and when searchParams change
  useEffect(() => {
    const mode = searchParams.get('mode') as Mode;
    if (mode && ['ai-crop', 'manual-crop', 'upscaling', 'compression'].includes(mode)) {
      setCurrentMode(mode);
    } else {
      setCurrentMode('home');
    }
  }, [searchParams]);

  const handleModeChange = (mode: Mode) => {
    if (mode === 'home') {
      router.push('/');
    } else {
      router.push(`/?mode=${mode}`);
    }
  };

  const handleBack = () => {
    router.back();
  };

  const renderModeContent = () => {
    switch (currentMode) {
      case 'ai-crop':
        return <AIImageResizing onBack={handleBack} />;
      case 'manual-crop':
        return <ManualCropping onBack={handleBack} />;
      case 'upscaling':
        return <Upscaling onBack={handleBack} />;
      case 'compression':
        return <ImageCompression onBack={handleBack} />;
      default:
        return renderHomePage();
    }
  };

  const renderHomePage = () => (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            Image Processing Suite
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Choose from AI-powered smart resizing, manual precision cropping, advanced upscaling or image compression
          </p>
        </header>

        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* AI Smart Crop */}
            <Card className="group hover:shadow-xl transition-all duration-300 cursor-pointer border-2 hover:border-blue-300 h-full flex flex-col"
                  onClick={() => handleModeChange('ai-crop')}>
              <CardHeader className="text-center pb-4">
                <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-full flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                  <Bot className="w-8 h-8 text-blue-600" />
                </div>
                <CardTitle className="text-xl font-bold text-gray-900">
                  AI Image Resizing
                </CardTitle>
              </CardHeader>
              <CardContent className="text-center flex flex-col flex-grow">
                <p className="text-gray-600 mb-4">
                  Intelligently resize and extend images using AI-powered algorithms with edge detection fallback
                </p>
                <ul className="text-sm text-gray-500 space-y-1 mb-6 flex-grow">
                  <li>• AI-powered content-aware resizing</li>
                  <li>• Automatic canvas extension</li>
                  <li>• Edge detection fallback</li>
                  <li>• Optimal compression</li>
                </ul>
                <Button className="w-full bg-blue-600 hover:bg-blue-700 mt-auto">
                  Start AI Image Resizing
                </Button>
              </CardContent>
            </Card>

            {/* Manual Cropping */}
            <Card className="group hover:shadow-xl transition-all duration-300 cursor-pointer border-2 hover:border-green-300 h-full flex flex-col"
                  onClick={() => handleModeChange('manual-crop')}>
              <CardHeader className="text-center pb-4">
                <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center group-hover:bg-green-200 transition-colors">
                  <Scissors className="w-8 h-8 text-green-600" />
                </div>
                <CardTitle className="text-xl font-bold text-gray-900">
                  Manual Cropping
                </CardTitle>
              </CardHeader>
              <CardContent className="text-center flex flex-col flex-grow">
                <p className="text-gray-600 mb-4">
                  Precise manual control with drag-and-zoom functionality for perfect cropping
                </p>
                <ul className="text-sm text-gray-500 space-y-1 mb-6 flex-grow">
                  <li>• Drag and resize image within frame</li>
                  <li>• Zoom controls for precision</li>
                  <li>• Real-time preview</li>
                  <li>• Optimal compression</li>
                </ul>
                <Button className="w-full bg-green-600 hover:bg-green-700 mt-auto">
                  Start Manual Cropping
                </Button>
              </CardContent>
            </Card>

            {/* Upscaling */}
            <Card className="group hover:shadow-xl transition-all duration-300 cursor-pointer border-2 hover:border-purple-300 h-full flex flex-col"
                  onClick={() => handleModeChange('upscaling')}>
              <CardHeader className="text-center pb-4">
                <div className="w-16 h-16 mx-auto mb-4 bg-purple-100 rounded-full flex items-center justify-center group-hover:bg-purple-200 transition-colors">
                  <Maximize className="w-8 h-8 text-purple-600" />
                </div>
                <CardTitle className="text-xl font-bold text-gray-900">
                  Upscaling
                </CardTitle>
              </CardHeader>
              <CardContent className="text-center flex flex-col flex-grow">
                <p className="text-gray-600 mb-4">
                  Enhance and upscale images to higher resolutions with quality preservation
                </p>
                <ul className="text-sm text-gray-500 space-y-1 mb-6 flex-grow">
                  <li>• Scale factor or target resolution</li>
                  <li>• Quality preservation</li>
                  <li>• Batch processing support</li>
                  <li>• Optimal compression</li>
                </ul>
                <Button className="w-full bg-purple-600 hover:bg-purple-700 mt-auto">
                  Start Upscaling
                </Button>
              </CardContent>
            </Card>

            {/* Image Compression */}
            <Card className="group hover:shadow-xl transition-all duration-300 cursor-pointer border-2 hover:border-orange-300 h-full flex flex-col"
                  onClick={() => handleModeChange('compression')}>
              <CardHeader className="text-center pb-4">
                <div className="w-16 h-16 mx-auto mb-4 bg-orange-100 rounded-full flex items-center justify-center group-hover:bg-orange-200 transition-colors">
                  <FileArchive className="w-8 h-8 text-orange-600" />
                </div>
                <CardTitle className="text-xl font-bold text-gray-900">
                  Image Compression
                </CardTitle>
              </CardHeader>
              <CardContent className="text-center flex flex-col flex-grow">
                <p className="text-gray-600 mb-4">
                  Reduce file size while maintaining image quality with smart compression
                </p>
                <ul className="text-sm text-gray-500 space-y-1 mb-6 flex-grow">
                  <li>• Adjustable quality settings</li>
                  <li>• Target file size control</li>
                  <li>• Real-time compression preview</li>
                  <li>• Multiple format support</li>
                </ul>
                <Button className="w-full bg-orange-600 hover:bg-orange-700 mt-auto">
                  Start Compression
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );

  if (currentMode === 'home') {
    return renderHomePage();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <Button
            variant="ghost"
            onClick={handleBack}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
        </div>
      </div>
      {renderModeContent()}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}
