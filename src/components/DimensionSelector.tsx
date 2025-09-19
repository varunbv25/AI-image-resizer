'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ASPECT_RATIOS } from '@/lib/constants';
import { ImageDimensions } from '@/types';

interface DimensionSelectorProps {
  originalDimensions: ImageDimensions;
  targetDimensions: ImageDimensions;
  onDimensionsChange: (dimensions: ImageDimensions) => void;
}

export function DimensionSelector({
  originalDimensions,
  targetDimensions,
  onDimensionsChange,
}: DimensionSelectorProps) {
  const [selectedRatio, setSelectedRatio] = useState<string>('');
  const [customWidth, setCustomWidth] = useState(targetDimensions.width.toString());
  const [customHeight, setCustomHeight] = useState(targetDimensions.height.toString());
  const [activeTab, setActiveTab] = useState<string>('presets');

  const handlePresetSelect = (ratioString: string) => {
    setSelectedRatio(ratioString);

    const ratio = ASPECT_RATIOS.find(r => r.ratio === ratioString);
    if (!ratio) return;

    // Calculate dimensions based on the longer side of original image
    const maxDimension = Math.max(originalDimensions.width, originalDimensions.height);
    const scale = maxDimension / Math.max(ratio.width, ratio.height);

    const newWidth = Math.round(ratio.width * scale);
    const newHeight = Math.round(ratio.height * scale);

    setCustomWidth(newWidth.toString());
    setCustomHeight(newHeight.toString());
    onDimensionsChange({ width: newWidth, height: newHeight });
  };

  const handleCustomDimensionChange = () => {
    setSelectedRatio(''); // Clear preset selection when using custom
    const width = parseInt(customWidth) || targetDimensions.width;
    const height = parseInt(customHeight) || targetDimensions.height;
    onDimensionsChange({ width, height });
  };

  // Preset buttons with better names
  const presetButtons = [
    { name: 'Stories', ratio: '9:16', description: 'Instagram Stories/TikTok' },
    { name: 'Portrait', ratio: '2:3', description: 'Portrait Print' },
    { name: 'Landscape', ratio: '16:9', description: 'Widescreen' },
    { name: 'Square', ratio: '1:1', description: 'Square' },
    { name: 'Standard', ratio: '4:3', description: 'Standard' },
    { name: 'Photo', ratio: '3:2', description: 'Landscape Photo' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resize Dimensions</CardTitle>
        <p className="text-sm text-gray-600">
          Original: {originalDimensions.width} × {originalDimensions.height}
        </p>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger
              value="presets"
              className="data-[state=active]:bg-black data-[state=active]:text-white"
            >
              Presets
            </TabsTrigger>
            <TabsTrigger
              value="custom"
              className="data-[state=active]:bg-black data-[state=active]:text-white"
            >
              Custom
            </TabsTrigger>
          </TabsList>

          {/* Presets Tab */}
          <TabsContent value="presets" className="space-y-4">
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Popular Sizes</h4>
              <div className="grid grid-cols-2 gap-2">
                {presetButtons.map((preset) => (
                  <Button
                    key={preset.ratio}
                    variant={selectedRatio === preset.ratio ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handlePresetSelect(preset.ratio)}
                    className={`flex flex-col h-auto py-3 px-2 ${
                      selectedRatio === preset.ratio
                        ? 'bg-black text-white hover:bg-gray-800'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <span className="font-medium">{preset.name}</span>
                    <span className="text-xs opacity-70">{preset.ratio}</span>
                  </Button>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Custom Tab */}
          <TabsContent value="custom" className="space-y-4">
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Custom Dimensions</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Width</label>
                  <Input
                    type="number"
                    value={customWidth}
                    onChange={(e) => setCustomWidth(e.target.value)}
                    onBlur={handleCustomDimensionChange}
                    min="1"
                    max="4000"
                    placeholder="Width"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Height</label>
                  <Input
                    type="number"
                    value={customHeight}
                    onChange={(e) => setCustomHeight(e.target.value)}
                    onBlur={handleCustomDimensionChange}
                    min="1"
                    max="4000"
                    placeholder="Height"
                  />
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Status indicator */}
        <div className="text-xs text-gray-500 p-3 bg-gray-50 rounded-lg border">
          <div className="flex justify-between items-center">
            <span>Target:</span>
            <span className="font-medium">{parseInt(customWidth) || 0} × {parseInt(customHeight) || 0}</span>
          </div>
          {(parseInt(customWidth) > originalDimensions.width ||
            parseInt(customHeight) > originalDimensions.height) && (
            <div className="text-blue-600 text-xs mt-2 flex items-center gap-1">
              ✨ AI will extend the canvas to fit these dimensions
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}