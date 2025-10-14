import { GoogleGenAI } from '@google/genai';
import * as fs from 'node:fs';
import * as path from 'path';
import * as os from 'node:os';
import { ImageDimensions, ImageProcessingOptions, ProcessedImage, ExtensionStrategy } from '@/types';

export class ImageProcessor {
  private apiKey?: string;

  constructor(geminiApiKey?: string) {
    this.apiKey = geminiApiKey;
  }

  private async getSharp() {
    try {
      const sharpModule = await import('sharp');
      const sharp = sharpModule.default || sharpModule;

      // Verify Sharp is actually callable
      if (typeof sharp !== 'function') {
        throw new Error('Sharp is not a function');
      }

      // Increase pixel limit to handle large images (1 gigapixel)
      sharp.cache(false);
      sharp.concurrency(1);

      return sharp;
    } catch (error) {
      console.error('Failed to load Sharp:', error);
      throw new Error('Sharp module could not be loaded. Image processing is not available.');
    }
  }


  async processImage(
    imageBuffer: Buffer,
    originalDimensions: ImageDimensions,
    targetDimensions: ImageDimensions,
    options: ImageProcessingOptions,
    strategy: ExtensionStrategy = { type: 'ai' }
  ): Promise<ProcessedImage> {
    try {
      const sharp = await this.getSharp();
      const isSVGInput = await this.isSVG(imageBuffer);

      // Track original format for potential preservation
      const originalFormat = isSVGInput ? 'svg' : options.format;

      // For SVG files, convert to raster first for consistent processing
      let workingBuffer: Buffer = imageBuffer;
      if (isSVGInput) {
        console.log('Converting SVG to raster format for processing...');
        const svgConverted = await sharp(imageBuffer, {
          density: 300,
          limitInputPixels: 1000000000
        })
        .png()
        .toBuffer();
        workingBuffer = Buffer.from(svgConverted);
      }

      let processedBuffer: Buffer;

      if (strategy.type === 'ai' && this.apiKey) {
        try {
          processedBuffer = await this.processWithNanoBanana(
            workingBuffer,
            targetDimensions
          );

          // Check if AI processed image is different from original
          const isImageDifferent = await this.areImagesDifferent(workingBuffer, processedBuffer);

          if (!isImageDifferent) {
            // If AI didn't change the image, use edge detection fallback
            console.warn('AI processing returned unchanged image, using edge color extension fallback');
            processedBuffer = await this.extendWithEdgeColorDetection(
              workingBuffer,
              originalDimensions,
              targetDimensions
            );
          } else {
            // Check if AI processed image meets target dimensions, crop if needed
            const resultMetadata = await sharp(processedBuffer, { limitInputPixels: 1000000000 }).metadata();
            const resultWidth = resultMetadata.width || 0;
            const resultHeight = resultMetadata.height || 0;

            if (resultWidth !== targetDimensions.width || resultHeight !== targetDimensions.height) {
              // Crop AI processed image to exact target dimensions
              processedBuffer = await this.cropToExactDimensions(
                processedBuffer,
                targetDimensions
              );
            }
          }
        } catch (error) {
          console.warn('AI processing failed, using edge color extension fallback:', error);
          processedBuffer = await this.extendWithEdgeColorDetection(
            workingBuffer,
            originalDimensions,
            targetDimensions
          );
        }
      } else {
        // Fallback: extend background using edge color detection
        processedBuffer = await this.extendWithEdgeColorDetection(
          workingBuffer,
          originalDimensions,
          targetDimensions
        );
      }

      // Optimize for web
      const optimizedBuffer = await this.optimizeForWeb(processedBuffer, options);

      // Get metadata
      let finalFormat = options.format;

      // For SVG output, we don't need sharp metadata as it's already in SVG format
      if (options.format === 'svg') {
        return {
          buffer: optimizedBuffer,
          metadata: {
            width: targetDimensions.width,
            height: targetDimensions.height,
            format: 'svg',
            size: optimizedBuffer.length,
          },
        };
      }

      const metadata = await sharp(optimizedBuffer, { limitInputPixels: 1000000000, density: 300 }).metadata();

      return {
        buffer: optimizedBuffer,
        metadata: {
          width: metadata.width || targetDimensions.width,
          height: metadata.height || targetDimensions.height,
          format: metadata.format || options.format,
          size: optimizedBuffer.length,
        },
      };
    } catch (error) {
      console.error('Image processing error:', error);
      throw new Error(`Image processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async processWithNanoBanana(
    imageBuffer: Buffer,
    targetDimensions: ImageDimensions,
  ): Promise<Buffer> {
    if (!this.apiKey) {
      throw new Error('Google AI API key not configured');
    }

    const sharp = await this.getSharp();

    // Defensive SVG handling: convert to raster if SVG is passed
    let workingBuffer = imageBuffer;
    const isSVGInput = await this.isSVG(imageBuffer);
    if (isSVGInput) {
      console.log('Converting SVG to raster in processWithNanoBanana...');
      workingBuffer = await sharp(imageBuffer, {
        density: 300,
        limitInputPixels: 1000000000
      })
      .png()
      .toBuffer();
    }

    // Create temporary file for input image
    const tempDir = os.tmpdir();
    const tempInputPath = path.join(tempDir, `input_${Date.now()}.jpg`);
    const tempOutputPath = path.join(tempDir, `output_${Date.now()}.jpg`);

    try {
      // Save input image to temp file
      fs.writeFileSync(tempInputPath, workingBuffer);

      // Initialize Google GenAI
      const ai = new GoogleGenAI({ apiKey: this.apiKey });

      // Read and encode image
      const imageData = fs.readFileSync(tempInputPath);
      const base64Image = imageData.toString('base64');

      // Detect image format
      const metadata = await sharp(workingBuffer, { limitInputPixels: 1000000000, density: 300 }).metadata();
      const imageFormat = metadata.format || 'jpeg';

      // Create prompt for nano banana model
      const prompt = [
        {
          text: `Extend this image to ${targetDimensions.width}x${targetDimensions.height} pixels so that the background continues seamlessly. Ensure the new areas match the original style, colors, lighting, and textures, without any visible separation or border between the original image and the extended background and do not crop the image to these dimensions.`
        },
        {
          inlineData: {
            mimeType: `image/${imageFormat}`,
            data: base64Image,
          },
        },
      ];

      // Call nano banana model
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: prompt,
      });

      // Process response
      if (!response.candidates || response.candidates.length === 0) {
        throw new Error('No candidates returned from nano banana model');
      }

      const candidate = response.candidates[0];
      if (!candidate.content || !candidate.content.parts) {
        throw new Error('No content parts returned from nano banana model');
      }

      for (const part of candidate.content.parts) {
        if (part.inlineData && part.inlineData.data) {
          const processedImageData = part.inlineData.data;
          const processedBuffer = Buffer.from(processedImageData, 'base64');
          fs.writeFileSync(tempOutputPath, processedBuffer);

          // Clean up temp input file
          if (fs.existsSync(tempInputPath)) {
            fs.unlinkSync(tempInputPath);
          }

          return processedBuffer;
        }
      }

      throw new Error('No image data returned from nano banana model');
    } catch (error) {
      // Clean up temp files
      try {
        if (fs.existsSync(tempInputPath)) {
          fs.unlinkSync(tempInputPath);
        }
        if (fs.existsSync(tempOutputPath)) {
          fs.unlinkSync(tempOutputPath);
        }
      } catch (cleanupError) {
        console.warn('Failed to clean up temp files:', cleanupError);
      }
      throw error;
    }
  }

  private async extendWithEdgeColorDetection(
    imageBuffer: Buffer,
    originalDimensions: ImageDimensions,
    targetDimensions: ImageDimensions
  ): Promise<Buffer> {
    const sharp = await this.getSharp();

    // Defensive SVG handling: convert to raster if SVG is passed
    let workingBuffer = imageBuffer;
    const isSVGInput = await this.isSVG(imageBuffer);
    if (isSVGInput) {
      console.log('Converting SVG to raster in extendWithEdgeColorDetection...');
      workingBuffer = await sharp(imageBuffer, {
        density: 300,
        limitInputPixels: 1000000000
      })
      .png()
      .toBuffer();
    }

    // If target dimensions are smaller than original, crop instead of extend
    if (targetDimensions.width <= originalDimensions.width &&
        targetDimensions.height <= originalDimensions.height) {
      return await this.cropToExactDimensions(workingBuffer, targetDimensions);
    }

    // Detect edge color from the original image
    const edgeColor = await this.detectDominantEdgeColor(workingBuffer);

    // Get actual dimensions from the image buffer to ensure consistency
    const actualMetadata = await sharp(workingBuffer, { limitInputPixels: 1000000000, density: 300 }).metadata();
    const actualWidth = actualMetadata.width || originalDimensions.width;
    const actualHeight = actualMetadata.height || originalDimensions.height;

    // Ensure target dimensions are larger than actual dimensions
    const finalTargetWidth = Math.max(targetDimensions.width, actualWidth);
    const finalTargetHeight = Math.max(targetDimensions.height, actualHeight);

    // Create canvas with detected edge color extending to target dimensions
    const canvas = sharp({
      create: {
        width: finalTargetWidth,
        height: finalTargetHeight,
        channels: 3,
        background: edgeColor,
      },
    });

    // Calculate positioning to center the original image
    const left = Math.max(0, Math.floor((finalTargetWidth - actualWidth) / 2));
    const top = Math.max(0, Math.floor((finalTargetHeight - actualHeight) / 2));

    // Resize the composite to exact target dimensions if needed
    let result = await canvas
      .composite([{ input: workingBuffer, left, top }])
      .jpeg({ quality: 90 })
      .toBuffer();

    // If we had to make the canvas larger than requested, resize to exact target
    if (finalTargetWidth !== targetDimensions.width || finalTargetHeight !== targetDimensions.height) {
      result = await sharp(result, { limitInputPixels: 1000000000, density: 300 })
        .resize(targetDimensions.width, targetDimensions.height, { fit: 'fill' })
        .jpeg({ quality: 90 })
        .toBuffer();
    }

    return result;
  }

  private async detectDominantEdgeColor(imageBuffer: Buffer): Promise<{ r: number; g: number; b: number }> {
    try {
      const sharp = await this.getSharp();

      // Defensive SVG handling: convert to raster if SVG is passed
      let workingBuffer = imageBuffer;
      const isSVGInput = await this.isSVG(imageBuffer);
      if (isSVGInput) {
        console.log('Converting SVG to raster in detectDominantEdgeColor...');
        workingBuffer = await sharp(imageBuffer, {
          density: 300,
          limitInputPixels: 1000000000
        })
        .png()
        .toBuffer();
      }

      const image = sharp(workingBuffer, { limitInputPixels: 1000000000, density: 300 });
      const metadata = await image.metadata();
      const width = metadata.width || 0;
      const height = metadata.height || 0;

      if (width === 0 || height === 0) {
        return { r: 255, g: 255, b: 255 }; // fallback to white
      }

      // Sample pixels from all edges with more comprehensive coverage
      const edgeThickness = Math.max(3, Math.min(15, Math.floor(Math.min(width, height) * 0.03))); // 3% of smallest dimension, min 3px, max 15px
      const samples: Array<{ r: number; g: number; b: number }> = [];

      // Top edge - full width
      if (height > edgeThickness) {
        const topSample = await image
          .extract({ left: 0, top: 0, width, height: edgeThickness })
          .stats();
        samples.push({
          r: topSample.channels[0].mean,
          g: topSample.channels[1].mean,
          b: topSample.channels[2].mean,
        });
      }

      // Bottom edge - full width
      if (height > edgeThickness) {
        const bottomSample = await image
          .extract({ left: 0, top: height - edgeThickness, width, height: edgeThickness })
          .stats();
        samples.push({
          r: bottomSample.channels[0].mean,
          g: bottomSample.channels[1].mean,
          b: bottomSample.channels[2].mean,
        });
      }

      // Left edge - full height (excluding corners already sampled)
      if (width > edgeThickness && height > 2 * edgeThickness) {
        const leftSample = await image
          .extract({
            left: 0,
            top: edgeThickness,
            width: edgeThickness,
            height: height - 2 * edgeThickness
          })
          .stats();
        samples.push({
          r: leftSample.channels[0].mean,
          g: leftSample.channels[1].mean,
          b: leftSample.channels[2].mean,
        });
      }

      // Right edge - full height (excluding corners already sampled)
      if (width > edgeThickness && height > 2 * edgeThickness) {
        const rightSample = await image
          .extract({
            left: width - edgeThickness,
            top: edgeThickness,
            width: edgeThickness,
            height: height - 2 * edgeThickness
          })
          .stats();
        samples.push({
          r: rightSample.channels[0].mean,
          g: rightSample.channels[1].mean,
          b: rightSample.channels[2].mean,
        });
      }

      if (samples.length === 0) {
        // Fallback: sample entire image edges
        const imageSample = await image.stats();
        return {
          r: Math.round(imageSample.channels[0].mean),
          g: Math.round(imageSample.channels[1].mean),
          b: Math.round(imageSample.channels[2].mean),
        };
      }

      // Calculate weighted average - give more weight to larger edge areas
      let totalWeight = 0;
      let weightedR = 0;
      let weightedG = 0;
      let weightedB = 0;

      samples.forEach((sample, index) => {
        // Top and bottom edges get higher weight as they're typically more representative
        const weight = (index < 2) ? 1.5 : 1.0;
        totalWeight += weight;
        weightedR += sample.r * weight;
        weightedG += sample.g * weight;
        weightedB += sample.b * weight;
      });

      return {
        r: Math.round(weightedR / totalWeight),
        g: Math.round(weightedG / totalWeight),
        b: Math.round(weightedB / totalWeight),
      };
    } catch (error) {
      console.warn('Edge color detection failed, using white:', error);
      return { r: 255, g: 255, b: 255 }; // fallback to white
    }
  }

  private async cropToExactDimensions(
    imageBuffer: Buffer,
    targetDimensions: ImageDimensions
  ): Promise<Buffer> {
    const sharp = await this.getSharp();

    // Defensive SVG handling: convert to raster if SVG is passed
    let workingBuffer = imageBuffer;
    const isSVGInput = await this.isSVG(imageBuffer);
    if (isSVGInput) {
      console.log('Converting SVG to raster in cropToExactDimensions...');
      workingBuffer = await sharp(imageBuffer, {
        density: 300,
        limitInputPixels: 1000000000
      })
      .png()
      .toBuffer();
    }

    const metadata = await sharp(workingBuffer, { limitInputPixels: 1000000000, density: 300 }).metadata();
    const originalWidth = metadata.width || 0;
    const originalHeight = metadata.height || 0;

    // Calculate scale to ensure the image covers the entire target area
    const scaleX = targetDimensions.width / originalWidth;
    const scaleY = targetDimensions.height / originalHeight;
    const scale = Math.max(scaleX, scaleY); // Use max to cover entire area

    // Calculate new dimensions after scaling
    const scaledWidth = Math.round(originalWidth * scale);
    const scaledHeight = Math.round(originalHeight * scale);

    // Resize and center crop to exact dimensions
    return await sharp(workingBuffer, { limitInputPixels: 1000000000, density: 300 })
      .resize(scaledWidth, scaledHeight)
      .extract({
        left: Math.max(0, Math.floor((scaledWidth - targetDimensions.width) / 2)),
        top: Math.max(0, Math.floor((scaledHeight - targetDimensions.height) / 2)),
        width: targetDimensions.width,
        height: targetDimensions.height
      })
      .jpeg({ quality: 90 })
      .toBuffer();
  }

  private needsExtension(original: ImageDimensions, target: ImageDimensions): boolean {
    return target.width > original.width || target.height > original.height;
  }

  private async areImagesDifferent(originalBuffer: Buffer, processedBuffer: Buffer): Promise<boolean> {
    try {
      const sharp = await this.getSharp();

      // Defensive SVG handling: convert to raster if SVG is passed
      let workingOriginalBuffer = originalBuffer;
      let workingProcessedBuffer = processedBuffer;

      const isSVGOriginal = await this.isSVG(originalBuffer);
      if (isSVGOriginal) {
        console.log('Converting original SVG to raster in areImagesDifferent...');
        workingOriginalBuffer = await sharp(originalBuffer, {
          density: 300,
          limitInputPixels: 1000000000
        })
        .png()
        .toBuffer();
      }

      const isSVGProcessed = await this.isSVG(processedBuffer);
      if (isSVGProcessed) {
        console.log('Converting processed SVG to raster in areImagesDifferent...');
        workingProcessedBuffer = await sharp(processedBuffer, {
          density: 300,
          limitInputPixels: 1000000000
        })
        .png()
        .toBuffer();
      }

      // Quick size check first
      if (workingOriginalBuffer.length !== workingProcessedBuffer.length) {
        return true;
      }

      // Get metadata for both images
      const originalMeta = await sharp(workingOriginalBuffer, { limitInputPixels: 1000000000, density: 300 }).metadata();
      const processedMeta = await sharp(workingProcessedBuffer, { limitInputPixels: 1000000000, density: 300 }).metadata();

      // If dimensions are different, images are different
      if (originalMeta.width !== processedMeta.width ||
          originalMeta.height !== processedMeta.height) {
        return true;
      }

      // Compare image statistics for a quick content comparison
      const originalStats = await sharp(workingOriginalBuffer, { limitInputPixels: 1000000000, density: 300 }).stats();
      const processedStats = await sharp(workingProcessedBuffer, { limitInputPixels: 1000000000, density: 300 }).stats();

      // Compare mean values across channels with a tolerance
      const tolerance = 5; // Allow small differences due to compression/processing
      for (let i = 0; i < Math.min(originalStats.channels.length, processedStats.channels.length); i++) {
        const originalMean = originalStats.channels[i].mean;
        const processedMean = processedStats.channels[i].mean;

        if (Math.abs(originalMean - processedMean) > tolerance) {
          return true;
        }
      }

      // If we reach here, images are likely very similar or identical
      return false;
    } catch (error) {
      console.warn('Error comparing images, assuming they are different:', error);
      return true; // Assume different if comparison fails
    }
  }

  private async optimizeForWeb(
    imageBuffer: Buffer,
    options: ImageProcessingOptions
  ): Promise<Buffer> {
    const sharp = await this.getSharp();

    // Defensive SVG handling: if input is SVG and output is not SVG, convert to raster first
    let workingBuffer = imageBuffer;
    const isSVGInput = await this.isSVG(imageBuffer);
    if (isSVGInput && options.format !== 'svg') {
      console.log('Converting SVG to raster in optimizeForWeb...');
      workingBuffer = await sharp(imageBuffer, {
        density: 300,
        limitInputPixels: 1000000000
      })
      .png()
      .toBuffer();
    }

    const sharpInstance = sharp(workingBuffer, { limitInputPixels: 1000000000, density: 300 });

    switch (options.format) {
      case 'jpeg':
        return await sharpInstance.jpeg({ quality: options.quality }).toBuffer();
      case 'png':
        return await sharpInstance.png({ quality: options.quality }).toBuffer();
      case 'webp':
        return await sharpInstance.webp({ quality: options.quality }).toBuffer();
      case 'svg':
        // Convert raster to SVG by embedding it as a data URI
        return await this.convertToSVG(workingBuffer, options);
      default:
        return await sharpInstance.jpeg({ quality: options.quality }).toBuffer();
    }
  }

  private async convertToSVG(
    imageBuffer: Buffer,
    options: ImageProcessingOptions
  ): Promise<Buffer> {
    const sharp = await this.getSharp();

    // Defensive SVG handling: if input is already SVG, convert to raster first
    let workingBuffer = imageBuffer;
    const isSVGInput = await this.isSVG(imageBuffer);
    if (isSVGInput) {
      console.log('Converting SVG to raster in convertToSVG before re-embedding...');
      workingBuffer = await sharp(imageBuffer, {
        density: 300,
        limitInputPixels: 1000000000
      })
      .png()
      .toBuffer();
    }

    // Convert to PNG first for better quality in SVG embedding
    const pngBuffer = await sharp(workingBuffer, { limitInputPixels: 1000000000, density: 300 })
      .png({ quality: options.quality })
      .toBuffer();

    // Get image dimensions
    const metadata = await sharp(pngBuffer, { limitInputPixels: 1000000000, density: 300 }).metadata();
    const width = metadata.width || options.targetDimensions.width;
    const height = metadata.height || options.targetDimensions.height;

    // Convert PNG to base64
    const base64Image = pngBuffer.toString('base64');

    // Create SVG with embedded PNG
    const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <image width="${width}" height="${height}" xlink:href="data:image/png;base64,${base64Image}"/>
</svg>`;

    return Buffer.from(svgContent, 'utf-8');
  }

  async getImageDimensions(imageBuffer: Buffer): Promise<ImageDimensions> {
    const sharp = await this.getSharp();
    // For SVG files, set density to ensure proper dimension calculation
    const metadata = await sharp(imageBuffer, {
      density: 300 // High DPI for quality SVG rasterization
    }).metadata();
    return {
      width: metadata.width || 0,
      height: metadata.height || 0,
    };
  }

  private async isSVG(imageBuffer: Buffer): Promise<boolean> {
    // Check if buffer starts with SVG signature
    const header = imageBuffer.slice(0, 100).toString('utf-8');
    return header.includes('<svg') || header.includes('<?xml');
  }
}