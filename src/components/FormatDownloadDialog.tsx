/* eslint-disable @next/next/no-img-element */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, X, FileImage } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'svg';

interface FormatDownloadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onDownload: (format: ImageFormat, quality: number) => void;
  currentFormat?: string;
  imageData: string;
  filename: string;
  hideQualitySlider?: boolean;
}

export function FormatDownloadDialog({
  isOpen,
  onClose,
  onDownload,
  currentFormat = 'jpeg',
  imageData,
  hideQualitySlider = false,
}: FormatDownloadDialogProps) {
  const [selectedFormat, setSelectedFormat] = useState<ImageFormat>(currentFormat as ImageFormat);
  const [quality, setQuality] = useState<number>(90);

  const formats: { value: ImageFormat; label: string; description: string }[] = [
    { value: 'jpeg', label: 'JPEG', description: 'Best for photos, smaller file size' },
    { value: 'png', label: 'PNG', description: 'Lossless, supports transparency' },
    { value: 'webp', label: 'WebP', description: 'Modern format, great compression' },
    { value: 'svg', label: 'SVG', description: 'Vector format (raster embedded)' },
  ];

  const handleDownload = () => {
    onDownload(selectedFormat, quality);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md"
        >
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <FileImage className="w-5 h-5" />
                  Choose Download Format
                </CardTitle>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Format Selection */}
              <div>
                <label className="block text-sm font-medium mb-2">Output Format</label>
                <Select value={selectedFormat} onValueChange={(value) => setSelectedFormat(value as ImageFormat)}>
                  <SelectTrigger className="w-full bg-white border-black text-black hover:bg-gray-100">
                    <SelectValue placeholder="Select file format" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-black">
                    {formats.map((format) => (
                      <SelectItem
                        key={format.value}
                        value={format.value}
                        className="text-black hover:bg-gray-100 focus:bg-gray-200 focus:text-black data-[state=checked]:bg-blue-600"
                      >
                        <div className="flex flex-col items-start">
                          <span className="font-medium text-black">{format.label}</span>
                          <span className="text-xs text-gray-900">{format.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Quality Slider (hidden for SVG and when hideQualitySlider is true) */}
              {!hideQualitySlider && selectedFormat !== 'svg' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <label className="block text-sm font-medium mb-2">
                    Quality: {quality}%
                  </label>
                  <Slider
                    value={[quality]}
                    onValueChange={(value) => setQuality(value[0])}
                    min={1}
                    max={100}
                    step={1}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Higher quality = larger file size
                  </p>
                </motion.div>
              )}

              {/* Preview */}
              <div className="bg-gray-100 rounded-lg p-3">
                <div className="text-xs text-gray-600 mb-2">Preview</div>
                <div className="aspect-video bg-white rounded overflow-hidden flex items-center justify-center">
                  <img
                    src={imageData}
                    alt="Preview"
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleDownload}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download {selectedFormat.toUpperCase()}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
