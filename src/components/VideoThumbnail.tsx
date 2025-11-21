'use client';

import { useRef, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';

interface VideoThumbnailProps {
  src: string;
  className?: string;
  title?: string;
  maxHeight?: string;
}

export function VideoThumbnail({
  src,
  className = '',
  title,
  maxHeight = '400px',
}: VideoThumbnailProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gifFrames, setGifFrames] = useState<string[]>([]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    generateGifFrames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // Cycle through frames to create GIF effect
  useEffect(() => {
    if (gifFrames.length === 0) return;

    const interval = setInterval(() => {
      setCurrentFrameIndex((prev) => (prev + 1) % gifFrames.length);
    }, 100); // 10 FPS for smooth playback

    return () => clearInterval(interval);
  }, [gifFrames]);

  const generateGifFrames = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    setIsGenerating(true);
    const frames: string[] = [];

    await new Promise((resolve) => {
      video.onloadedmetadata = resolve;
    });

    const duration = Math.min(video.duration, 5); // Max 5 seconds
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size based on video aspect ratio
    const aspectRatio = video.videoWidth / video.videoHeight;
    canvas.width = 320; // Reduced width for faster loading
    canvas.height = 320 / aspectRatio;

    // Generate frames at ~8 FPS for 5 seconds = ~40 frames
    const frameCount = Math.min(40, Math.ceil(duration * 8));
    const frameInterval = duration / frameCount;

    for (let i = 0; i < frameCount; i++) {
      const time = i * frameInterval;
      video.currentTime = time;

      await new Promise((resolve) => {
        video.onseeked = resolve;
      });

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL('image/jpeg', 0.5));
    }

    setGifFrames(frames);
    setIsGenerating(false);
  };

  return (
    <Card className={`overflow-hidden ${className}`}>
      {title && (
        <div className="px-4 py-2 bg-gray-100 border-b">
          <h3 className="text-sm font-medium text-gray-700">{title}</h3>
        </div>
      )}
      <div className="relative bg-black" style={{ maxHeight }}>
        {/* Hidden video for frame extraction */}
        <video
          ref={videoRef}
          src={src}
          className="hidden"
          preload="metadata"
        />

        {/* Hidden canvas for frame drawing */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Display current GIF frame */}
        {isGenerating ? (
          <div className="flex items-center justify-center w-full h-64 bg-gray-900">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-2"></div>
              <p className="text-white text-sm">Generating preview...</p>
            </div>
          </div>
        ) : gifFrames.length > 0 ? (
          <img
            src={gifFrames[currentFrameIndex]}
            alt="Video preview"
            className="w-full h-auto object-contain"
            style={{ maxHeight }}
          />
        ) : null}
      </div>
    </Card>
  );
}
