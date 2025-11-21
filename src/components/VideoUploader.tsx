'use client';

import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, Video as VideoIcon } from 'lucide-react';

interface VideoUploaderProps {
  onVideoUpload: (file: File) => void;
  onBatchVideoUpload?: (files: File[]) => void;
  isUploading: boolean;
  supportsBatch?: boolean;
  uploadProgress?: number;
}

export function VideoUploader({
  onVideoUpload,
  onBatchVideoUpload,
  isUploading,
  supportsBatch = false,
  uploadProgress = 0
}: VideoUploaderProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        if (supportsBatch && acceptedFiles.length > 1 && onBatchVideoUpload) {
          onBatchVideoUpload(acceptedFiles);
        } else {
          onVideoUpload(acceptedFiles[0]);
        }
      }
    },
    [onVideoUpload, onBatchVideoUpload, supportsBatch]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'video/mp4': ['.mp4'],
      'video/webm': ['.webm'],
      'video/quicktime': ['.mov'],
      'video/x-msvideo': ['.avi'],
      'video/x-matroska': ['.mkv'],
    },
    multiple: supportsBatch,
    disabled: isUploading,
  });

  return (
    <Card className="p-8">
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-16 text-center cursor-pointer transition-colors min-h-[400px] flex flex-col items-center justify-center
          ${isDragActive ? 'border-purple-500 bg-purple-50' : 'border-gray-300 hover:border-gray-400'}
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
            <VideoIcon className="h-16 w-16 text-gray-400" />
          )}

          <div className="space-y-3 text-center">
            <h3 className="text-xl font-medium text-gray-700">
              {isUploading ? 'Uploading...' : supportsBatch ? 'Drag and drop videos or browse' : 'Drag and drop a video or browse'}
            </h3>
            <p className="text-sm text-gray-500">
              Supports MP4, WebM, MOV, AVI and MKV{supportsBatch && ' • Multiple files supported'}
            </p>
            {isUploading && uploadProgress > 0 && (
              <div className="mt-4 w-full max-w-xs mx-auto">
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                  <span>Upload Progress</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
            {!isUploading && (
              <p className="text-xs text-gray-400 mt-2">
                Maximum file size: 500MB
              </p>
            )}
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
