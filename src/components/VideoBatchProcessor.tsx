/* eslint-disable @next/next/no-img-element */
'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Clock, Download, FileArchive, Video } from 'lucide-react';

// Generic settings type that can hold any video processing settings
export type VideoBatchItemSettings = {
  [key: string]: unknown;
  targetSize?: number;
  format?: 'mp4' | 'webm' | 'mov';
  resolution?: '360p' | '480p' | '720p';
  startTime?: number;
  endTime?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

export interface VideoBatchItem {
  id: string;
  filename: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  originalSize: number;
  processedSize?: number;
  error?: string;
  processedData?: string; // blob URL for processed video
  thumbnailUrl?: string; // video thumbnail
  blobUrl?: string; // original video blob URL
  settings?: VideoBatchItemSettings;
  metadata?: {
    duration: number;
    width: number;
    height: number;
    format: string;
  };
}

interface VideoBatchProcessorProps {
  items: VideoBatchItem[];
  onDownloadAll: () => void;
  onDownloadSingle: (id: string) => void;
  onProcessSingle?: (id: string) => void;
  onProcessAll?: () => void;
  onReset?: () => void;
  totalProcessed: number;
  totalItems?: number;
  processingStarted?: boolean;
  batchProcessingStarted?: boolean;
  selectedId?: string | null;
  selectedVideoId?: string | null;
  onSelectVideo?: (id: string) => void;
  renderSettings?: (item: VideoBatchItem) => React.ReactNode;
  defaultSettingsPanel?: React.ReactNode;
}

export function VideoBatchProcessor({
  items,
  onDownloadAll,
  onDownloadSingle,
  onProcessSingle,
  onProcessAll,
  onReset,
  totalProcessed,
  totalItems,
  processingStarted = false,
  batchProcessingStarted = false,
  selectedId = null,
  selectedVideoId = null,
  onSelectVideo,
  renderSettings,
  defaultSettingsPanel,
}: VideoBatchProcessorProps) {
  const completedItems = items.filter(item => item.status === 'completed');
  const hasCompleted = completedItems.length > 0;
  const actualTotalItems = totalItems || items.length;
  const actualProcessingStarted = processingStarted || batchProcessingStarted;
  const actualSelectedId = selectedId || selectedVideoId;

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(2)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="space-y-4">
      {/* Default Settings Panel */}
      {defaultSettingsPanel}

      {/* Main Batch Processor Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileArchive className="w-5 h-5" />
              Batch Video Processing ({totalProcessed}/{actualTotalItems})
            </CardTitle>
            <div className="flex gap-2">
              {onProcessAll && !actualProcessingStarted && (
                <Button
                  onClick={onProcessAll}
                  className="bg-purple-600 hover:bg-purple-700"
                  size="sm"
                >
                  Process All Videos
                </Button>
              )}
              {hasCompleted && (
                <Button
                  onClick={onDownloadAll}
                  className="bg-green-600 hover:bg-green-700"
                  size="sm"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download All ({completedItems.length})
                </Button>
              )}
              {onReset && (
                <Button
                  onClick={onReset}
                  variant="outline"
                  size="sm"
                >
                  Reset
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {items.map((item) => (
              <div key={item.id} className="space-y-2">
                <div
                  onClick={() => onSelectVideo?.(item.id)}
                  className={`
                    flex items-center gap-3 p-3 rounded-lg border-2 transition-all cursor-pointer
                    ${item.status === 'completed' ? 'border-green-200 bg-green-50' : ''}
                    ${item.status === 'processing' ? 'border-blue-200 bg-blue-50' : ''}
                    ${item.status === 'error' ? 'border-red-200 bg-red-50' : ''}
                    ${item.status === 'pending' ? 'border-gray-200 bg-gray-50 hover:border-gray-300' : ''}
                    ${actualSelectedId === item.id ? 'ring-2 ring-purple-500 ring-offset-2' : ''}
                  `}
                >
                  {/* Video Thumbnail */}
                  {item.thumbnailUrl ? (
                    <div className="flex-shrink-0 w-20 h-16 rounded-md overflow-hidden bg-gray-200">
                      <img
                        src={item.thumbnailUrl}
                        alt={item.filename}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="flex-shrink-0 w-20 h-16 rounded-md bg-gray-200 flex items-center justify-center">
                      <Video className="w-8 h-8 text-gray-400" />
                    </div>
                  )}

                  {/* Status Icon */}
                  <div className="flex-shrink-0">
                    {item.status === 'completed' && (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    )}
                    {item.status === 'processing' && (
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent" />
                    )}
                    {item.status === 'error' && (
                      <XCircle className="w-5 h-5 text-red-600" />
                    )}
                    {item.status === 'pending' && (
                      <Clock className="w-5 h-5 text-gray-400" />
                    )}
                  </div>

                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {item.filename}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                      <span>{formatFileSize(item.originalSize)}</span>
                      {item.metadata && (
                        <>
                          <span>•</span>
                          <span>{formatDuration(item.metadata.duration)}</span>
                          <span>•</span>
                          <span>{item.metadata.width}×{item.metadata.height}</span>
                        </>
                      )}
                      {item.processedSize && item.status === 'completed' && (
                        <>
                          <span>→</span>
                          <span className="text-green-600 font-medium">
                            {formatFileSize(item.processedSize)}
                          </span>
                        </>
                      )}
                      {item.error && (
                        <span className="text-red-600">{item.error}</span>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex-shrink-0 flex gap-2">
                    {item.status === 'pending' && onProcessSingle && !actualProcessingStarted && (
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          onProcessSingle(item.id);
                        }}
                        variant="default"
                        size="sm"
                        className="bg-purple-600 hover:bg-purple-700"
                      >
                        Process
                      </Button>
                    )}
                    {item.status === 'completed' && (
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDownloadSingle(item.id);
                        }}
                        variant="outline"
                        size="sm"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Settings Panel */}
                {renderSettings && actualSelectedId === item.id && (
                  <div className="p-3 bg-purple-50 rounded-lg border-2 border-purple-200">
                    {renderSettings(item)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
