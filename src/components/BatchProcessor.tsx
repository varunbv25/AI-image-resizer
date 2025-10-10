/* eslint-disable @next/next/no-img-element */
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Clock, Download, FileArchive } from 'lucide-react';

// Generic settings type that can hold any processing settings
export type BatchItemSettings = Record<string, unknown>;

export interface BatchItem {
  id: string;
  filename: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  originalSize: number;
  processedSize?: number;
  error?: string;
  processedData?: string;
  previewUrl?: string;
  settings?: BatchItemSettings;
  originalDimensions?: {
    width: number;
    height: number;
  };
}

interface BatchProcessorProps {
  items: BatchItem[];
  onDownloadAll: () => void;
  onDownloadSingle: (id: string) => void;
  onProcessSingle?: (id: string) => void;
  totalProcessed: number;
  totalItems: number;
  processingStarted?: boolean;
  selectedId?: string | null;
  onSelectImage?: (id: string) => void;
}

export function BatchProcessor({
  items,
  onDownloadAll,
  onDownloadSingle,
  onProcessSingle,
  totalProcessed,
  totalItems,
  processingStarted = false,
  selectedId = null,
  onSelectImage,
}: BatchProcessorProps) {
  const completedItems = items.filter(item => item.status === 'completed');
  const hasCompleted = completedItems.length > 0;
  const hasPending = items.some(item => item.status === 'pending');

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileArchive className="w-5 h-5" />
            Batch Processing ({totalProcessed}/{totalItems})
          </CardTitle>
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
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 max-h-[500px] overflow-y-auto">
          {items.map((item) => (
            <div
              key={item.id}
              onClick={() => onSelectImage?.(item.id)}
              className={`
                flex items-center gap-3 p-3 rounded-lg border-2 transition-all cursor-pointer
                ${item.status === 'completed' ? 'border-green-200 bg-green-50' : ''}
                ${item.status === 'processing' ? 'border-blue-200 bg-blue-50' : ''}
                ${item.status === 'error' ? 'border-red-200 bg-red-50' : ''}
                ${item.status === 'pending' ? 'border-gray-200 bg-gray-50 hover:border-gray-300' : ''}
                ${selectedId === item.id ? 'ring-2 ring-purple-500 ring-offset-2' : ''}
              `}
            >
              {/* Image Preview */}
              {item.previewUrl && (
                <div className="flex-shrink-0 w-16 h-16 rounded-md overflow-hidden bg-gray-200">
                  <img
                    src={item.previewUrl}
                    alt={item.filename}
                    className="w-full h-full object-cover"
                  />
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
                  <span>{(item.originalSize / 1024).toFixed(2)} KB</span>
                  {item.processedSize && item.status === 'completed' && (
                    <>
                      <span>→</span>
                      <span className="text-green-600 font-medium">
                        {(item.processedSize / 1024).toFixed(2)} KB
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
                {item.status === 'pending' && onProcessSingle && !processingStarted && (
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
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
