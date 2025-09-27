'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Scissors, Bot, Maximize, ArrowLeft } from 'lucide-react';
import { AIImageResizing } from '@/components/modes/AIImageResizing';
import { ManualCropping } from '@/components/modes/ManualCropping';
import { Upscaling } from '@/components/modes/Upscaling';

type Mode = 'home' | 'ai-crop' | 'manual-crop' | 'upscaling';

export default function Home() {
  const [currentMode, setCurrentMode] = useState<Mode>('home');

  const renderModeContent = () => {
    switch (currentMode) {
      case 'ai-crop':
        return <AIImageResizing onBack={() => setCurrentMode('home')} />;
      case 'manual-crop':
        return <ManualCropping onBack={() => setCurrentMode('home')} />;
      case 'upscaling':
        return <Upscaling onBack={() => setCurrentMode('home')} />;
      default:
        return renderHomePage();
    }
  };

  const renderHomePage = () => (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            AI Image Processing Suite
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Choose from AI-powered smart cropping, manual precision cropping, or advanced upscaling
          </p>
        </header>

        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* AI Smart Crop */}
            <Card className="group hover:shadow-xl transition-all duration-300 cursor-pointer border-2 hover:border-blue-300"
                  onClick={() => setCurrentMode('ai-crop')}>
              <CardHeader className="text-center pb-4">
                <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-full flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                  <Bot className="w-8 h-8 text-blue-600" />
                </div>
                <CardTitle className="text-xl font-bold text-gray-900">
                  AI Image Resizing
                </CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                <p className="text-gray-600 mb-4">
                  Intelligently resize and extend images using AI-powered algorithms with edge detection fallback
                </p>
                <ul className="text-sm text-gray-500 space-y-1 mb-6">
                  <li>• AI-powered content-aware resizing</li>
                  <li>• Automatic canvas extension</li>
                  <li>• Edge detection fallback</li>
                  <li>• Optimal compression</li>
                </ul>
                <Button className="w-full bg-blue-600 hover:bg-blue-700">
                  Start AI Image Resizing
                </Button>
              </CardContent>
            </Card>

            {/* Manual Cropping */}
            <Card className="group hover:shadow-xl transition-all duration-300 cursor-pointer border-2 hover:border-green-300"
                  onClick={() => setCurrentMode('manual-crop')}>
              <CardHeader className="text-center pb-4">
                <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center group-hover:bg-green-200 transition-colors">
                  <Scissors className="w-8 h-8 text-green-600" />
                </div>
                <CardTitle className="text-xl font-bold text-gray-900">
                  Manual Cropping
                </CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                <p className="text-gray-600 mb-4">
                  Precise manual control with drag-and-zoom functionality for perfect cropping
                </p>
                <ul className="text-sm text-gray-500 space-y-1 mb-6">
                  <li>• Drag and resize image within frame</li>
                  <li>• Zoom controls for precision</li>
                  <li>• Real-time preview</li>
                  <li>• Optimal compression</li>
                </ul>
                <Button className="w-full bg-green-600 hover:bg-green-700">
                  Start Manual Cropping
                </Button>
              </CardContent>
            </Card>

            {/* Upscaling */}
            <Card className="group hover:shadow-xl transition-all duration-300 cursor-pointer border-2 hover:border-purple-300"
                  onClick={() => setCurrentMode('upscaling')}>
              <CardHeader className="text-center pb-4">
                <div className="w-16 h-16 mx-auto mb-4 bg-purple-100 rounded-full flex items-center justify-center group-hover:bg-purple-200 transition-colors">
                  <Maximize className="w-8 h-8 text-purple-600" />
                </div>
                <CardTitle className="text-xl font-bold text-gray-900">
                  Upscaling
                </CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                <p className="text-gray-600 mb-4">
                  Enhance and upscale images to higher resolutions with quality preservation
                </p>
                <ul className="text-sm text-gray-500 space-y-1 mb-6">
                  <li>• Scale factor or target resolution</li>
                  <li>• Quality preservation</li>
                  <li>• Batch processing support</li>
                  <li>• Optimal compression</li>
                </ul>
                <Button className="w-full bg-purple-600 hover:bg-purple-700">
                  Start Upscaling
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        <footer className="text-center mt-16 text-gray-500 text-sm">
          <p>No file upload limits • Support for JPEG, PNG, WebP, and more</p>
        </footer>
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
            onClick={() => setCurrentMode('home')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Button>
        </div>
      </div>
      {renderModeContent()}
    </div>
  );
}
