'use client';

import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, Image as ImageIcon } from 'lucide-react';
import { MAX_FILE_SIZE } from '@/lib/constants';

interface ImageUploaderProps {
  onImageUpload: (file: File) => void;
  isUploading: boolean;
}

export function ImageUploader({ onImageUpload, isUploading }: ImageUploaderProps) {

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        onImageUpload(acceptedFiles[0]);
      }
    },
    [onImageUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
    },
    maxSize: MAX_FILE_SIZE,
    multiple: false,
    disabled: isUploading,
  });

  return (
    <Card className="p-8">
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-16 text-center cursor-pointer transition-colors min-h-[400px] flex flex-col items-center justify-center
          ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
          ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-6">
          {isUploading ? (
            <div className="animate-spin">
              <Upload className="h-16 w-16 text-gray-400" />
            </div>
          ) : (
            <ImageIcon className="h-16 w-16 text-gray-400" />
          )}

          <div className="space-y-3 text-center">
            <h3 className="text-xl font-medium text-gray-700">
              {isUploading ? 'Uploading...' : 'Drag and drop an image or browse'}
            </h3>
            <p className="text-sm text-gray-500">
              File must be JPEG, PNG, or WebP and up to {MAX_FILE_SIZE / 1024 / 1024}MB
            </p>
          </div>

          {!isUploading && (
            <Button variant="outline" type="button" className="mt-4">
              Choose File
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}