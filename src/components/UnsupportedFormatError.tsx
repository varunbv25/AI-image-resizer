'use client';

import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, FileImage, Upload } from 'lucide-react';

interface UnsupportedFormatErrorProps {
  filename: string;
  onRetry: () => void;
}

export function UnsupportedFormatError({ filename, onRetry }: UnsupportedFormatErrorProps) {
  const supportedFormats = [
    { name: 'JPEG', ext: '.jpg, .jpeg', icon: '🖼️' },
    { name: 'PNG', ext: '.png', icon: '🖼️' },
    { name: 'WebP', ext: '.webp', icon: '🖼️' },
    { name: 'SVG', ext: '.svg', icon: '🎨' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="flex items-center justify-center min-h-[400px]"
    >
      <Card className="max-w-md w-full border-red-200 bg-red-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700">
            <AlertCircle className="w-5 h-5" />
            Unsupported Format
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-white p-4 rounded-lg border border-red-200">
            <p className="text-sm text-gray-700 mb-2">
              <strong>File:</strong> {filename}
            </p>
            <p className="text-sm text-red-600">
              This file format is not supported. Please upload a valid image file.
            </p>
          </div>

          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <h4 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <FileImage className="w-4 h-4" />
              Supported Formats
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {supportedFormats.map((format) => (
                <div
                  key={format.name}
                  className="flex items-center gap-2 p-2 bg-gray-50 rounded border border-gray-200"
                >
                  <span className="text-lg">{format.icon}</span>
                  <div>
                    <p className="text-xs font-medium text-gray-800">{format.name}</p>
                    <p className="text-xs text-gray-500">{format.ext}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Button
              onClick={onRetry}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload Another File
            </Button>
            <p className="text-xs text-center text-gray-500">
              Maximum file size: 10MB
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
