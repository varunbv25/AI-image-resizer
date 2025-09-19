'use client';

import { Card, CardContent } from '@/components/ui/card';
import { ProcessingStatus as ProcessingStatusType } from '@/types';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface ProcessingStatusProps {
  status: ProcessingStatusType;
}

export function ProcessingStatus({ status }: ProcessingStatusProps) {
  if (status.stage === 'idle') {
    return null;
  }

  const getIcon = () => {
    switch (status.stage) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      default:
        return <Loader2 className="h-5 w-5 animate-spin text-blue-600" />;
    }
  };


  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3 mb-3">
          {getIcon()}
          <div className="flex-1">
            <h3 className="font-medium capitalize">{status.stage}</h3>
            <p className="text-sm text-gray-600">{status.message}</p>
          </div>
        </div>

        {status.stage !== 'completed' && status.stage !== 'error' && (
          <div className="space-y-3">
            {/* Custom Progress Bar */}
            <div className="relative">
              <div className="w-full bg-gray-200 rounded-full h-6 border-2 border-black">
                <div
                  className="bg-black h-full rounded-full transition-all duration-300 ease-out flex items-center justify-center relative overflow-hidden"
                  style={{ width: `${status.progress || 0}%` }}
                >
                  {/* Vertical lines pattern inside progress bar */}
                  <div className="absolute inset-0 flex items-center">
                    {Array.from({ length: 20 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-full w-px bg-white opacity-60"
                        style={{ marginLeft: '5%' }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-black">{status.progress || 0}%</p>
            </div>
          </div>
        )}

        {status.stage === 'error' && (
          <div className="mt-3 p-3 bg-red-50 rounded-lg">
            <p className="text-sm text-red-700">
              Processing failed. Please try again or use a different image.
            </p>
          </div>
        )}

        {status.stage === 'completed' && (
          <div className="mt-3 p-3 bg-green-50 rounded-lg">
            <p className="text-sm text-green-700">
              Image processed successfully! You can now download the result.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}