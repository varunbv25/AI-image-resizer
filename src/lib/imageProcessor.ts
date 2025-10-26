/* eslint-disable @typescript-eslint/no-unused-vars */
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
    targetAspectRatio: ImageDimensions, // Renamed for clarity in the logic
    options: ImageProcessingOptions,
    strategy: ExtensionStrategy = { type: 'ai' }
  ): Promise<ProcessedImage> {
    try {
      const sharp = await this.getSharp();
      const isSVGInput = await this.isSVG(imageBuffer);

      // --- 1. Handle SVG-to-SVG natively (vector preservation) ---
      if (isSVGInput && options.format === 'svg') {
        console.log('Processing SVG natively to preserve vector format...');
        // Note: For native SVG, expansion/cropping logic would need SVG-specific ViewBox manipulation.
        // For simplicity, we'll keep the current SVG-to-SVG logic.
        return await this.processSVGNatively(
          imageBuffer,
          originalDimensions,
          originalDimensions, // Pass original dimensions to avoid complex SVG aspect ratio logic
          options,
          strategy
        );
      }

      let workingBuffer: Buffer = imageBuffer;
      // --- 2. Convert SVG to Raster if output is not SVG or for AI/Sharp processing ---
      if (isSVGInput) {
        console.log('Converting SVG to raster format for processing...');
        workingBuffer = await sharp(imageBuffer, { density: 300, limitInputPixels: 1000000000 })
          .png()
          .toBuffer();
      }

      // --- 3. Determine Expansion Target Dimensions ---
      // For expansion, we need a target size significantly larger than the original image
      // to give the AI (or edge-color fill) enough room, while maintaining the *original* aspect ratio.
      // E.g., expand width/height by 50%
      const expansionTarget: ImageDimensions = {
          width: Math.round(originalDimensions.width * 1.5),
          height: Math.round(originalDimensions.height * 1.5)
      };

      let expandedBuffer: Buffer;

      if (strategy.type === 'ai' && this.apiKey) {
        try {
          // Use AI generative fill to expand to the larger canvas
          expandedBuffer = await this.processWithNanoBanana(
            workingBuffer,
            expansionTarget
          );

          // Validate that AI returned a result
          const isImageDifferent = await this.areImagesDifferent(workingBuffer, expandedBuffer);

          if (!isImageDifferent) {
            // If AI didn't change the image, use edge detection fallback
            console.warn('AI processing returned unchanged image after 3 attempts, using edge color extension fallback');
            expandedBuffer = await this.extendWithEdgeColorDetection(
              workingBuffer,
              originalDimensions,
              expansionTarget // Expand to the large target size
            );
          }
        } catch (error) {
          console.warn('AI generative fill failed after 3 attempts, using edge color extension fallback:', error);
          expandedBuffer = await this.extendWithEdgeColorDetection(
            workingBuffer,
            originalDimensions,
            expansionTarget // Expand to the large target size
          );
        }
      } else {
        // Fallback: extend background using edge color detection
        expandedBuffer = await this.extendWithEdgeColorDetection(
          workingBuffer,
          originalDimensions,
          expansionTarget // Expand to the large target size
        );
      }

      // --- 4. Crop the Expanded Image to the Target Aspect Ratio ---
      const processedBuffer = await this.cropToAspectRatio(
          expandedBuffer,
          targetAspectRatio, // Use the UI's selected aspect ratio (e.g., 16:9)
          options.format === 'svg' ? 'jpeg' : options.format,
          options.quality
      );

      // --- 5. Optimize for web and return result ---
      const optimizedBuffer = await this.optimizeForWeb(processedBuffer, options);

      const metadata = await sharp(optimizedBuffer, { limitInputPixels: 1000000000, density: 300 }).metadata();

      // Final dimensions are the crop dimensions, not the initial expansion target
      const finalDimensions = await sharp(processedBuffer).metadata();

      return {
        buffer: optimizedBuffer,
        metadata: {
          width: finalDimensions.width || 0, // Use the cropped width
          height: finalDimensions.height || 0, // Use the cropped height
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

    // Retry logic: Try AI generation up to 3 times before giving up
    const MAX_RETRIES = 3;
    let lastError: Error | null = null;

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

      // Get original image dimensions
      const originalWidth = metadata.width || 0;
      const originalHeight = metadata.height || 0;

      // console.log(`=== AI GENERATIVE FILL STARTING ===`);
      // console.log(`Original image: ${originalWidth} × ${originalHeight} pixels`);
      // console.log(`Target output: ${targetDimensions.width} × ${targetDimensions.height} pixels`);
      // console.log(`Expansion needed: +${targetDimensions.width - originalWidth}px width, +${targetDimensions.height - originalHeight}px height`);
      // console.log(`CRITICAL: Must EXPAND by adding pixels, NEVER crop`);

      // Create prompt for nano banana model - Generative Expand
      const prompt = [
        {
          text: `The original image is ${originalWidth} × ${originalHeight} pixels.
                The target output MUST be ${targetDimensions.width} × ${targetDimensions.height} pixels.

                ZOOM OUT THE IMAGE and SHOW MORE OF THE BACKGROUND.

                Keep the subject in the MIDDLE OF THE FRAME and ZOOM OUT THE IMAGE TO MAKE THE SUBJECT SMALLER AND IN THE MIDDLE.

                THE EXPANDED BACKGROUND MUST BE GENERATED USING AI to seamlessly continue the existing scene.

                STRICT RULES:
                1. NEVER CROP - THE ORIGINAL IMAGE MUST BE FULLY PRESERVED IN THE FINAL OUTPUT
                2. NEVER RESIZE/SCALE - Keep the original image at its native resolution
                3. NEVER STRETCH/DISTORT - Maintain the original quality and DO NOT STRETCH OR CROP any part of the image
                4. ALWAYS EXPAND - Only ADD NEW CONTENT USING GENERATIVE AI around the original image to reach target size
                5. CENTRALIZE SUBJECT - Keep the original image centered in the new expanded canvas

                QUALITY REQUIREMENTS for the NEW generated areas only:
                1. Analyze the original image background: colors, patterns, textures, lighting, shadows
                2. Generate seamless background content that continues the existing scene
                3. Perfect edge blending - no visible seams between original and generated areas
                4. Match the exact style, grain, and quality of the original photograph
                5. Maintain consistent perspective and lighting`
        },
        {
          inlineData: {
            mimeType: `image/${imageFormat}`,
            data: base64Image,
          },
        },
      ];

      // Try up to MAX_RETRIES times
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          console.log(`AI generative fill attempt ${attempt}/${MAX_RETRIES}...`);

          // Call nano banana model
          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
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

              // Validate output dimensions
              const resultMetadata = await sharp(processedBuffer, { limitInputPixels: 1000000000 }).metadata();
              const resultWidth = resultMetadata.width || 0;
              const resultHeight = resultMetadata.height || 0;

              console.log(`AI output dimensions: ${resultWidth} × ${resultHeight} (expected: ${targetDimensions.width} × ${targetDimensions.height})`);
              console.log(`Original dimensions: ${originalWidth} × ${originalHeight}`);

              // Check if AI properly expanded (not cropped)
              // if (resultWidth < originalWidth || resultHeight < originalHeight) {
              //   throw new Error(`AI CROPPED the image! Output ${resultWidth}×${resultHeight} is smaller than original ${originalWidth}×${originalHeight}. Retrying...`);
              // }

              // Warn if dimensions don't match target (but don't fail if it expanded)
              // if (resultWidth !== targetDimensions.width || resultHeight !== targetDimensions.height) {
              //   console.warn(`AI dimensions ${resultWidth}×${resultHeight} don't exactly match target ${targetDimensions.width}×${targetDimensions.height}, but image was expanded (not cropped)`);
              // }

              // Clean up temp input file
              if (fs.existsSync(tempInputPath)) {
                fs.unlinkSync(tempInputPath);
              }

              console.log(`AI generative fill succeeded on attempt ${attempt}/${MAX_RETRIES}`);
              return processedBuffer;
            }
          }

          throw new Error('No image data returned from nano banana model');
        } catch (attemptError) {
          lastError = attemptError instanceof Error ? attemptError : new Error(String(attemptError));
          console.warn(`AI generative fill attempt ${attempt}/${MAX_RETRIES} failed:`, lastError.message);

          // If this isn't the last attempt, wait a bit before retrying
          if (attempt < MAX_RETRIES) {
            const delayMs = attempt * 1000; // Incremental backoff: 1s, 2s
            console.log(`Waiting ${delayMs}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
        }
      }

      // If we get here, all retries failed
      throw new Error(`AI generative fill failed after ${MAX_RETRIES} attempts. Last error: ${lastError?.message}`)
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

  private async cropToAspectRatio(
    imageBuffer: ProcessedImage['buffer'],
    targetAspectRatio: ImageDimensions,
    format: 'jpeg' | 'png' | 'webp' = 'jpeg',
    quality: number = 90
  ): Promise<Buffer> { // Change return type to Buffer for internal use
    const sharp = await this.getSharp();

    // Defensive SVG handling: convert to raster if SVG is passed
    let workingBuffer = imageBuffer;
    const isSVGInput = await this.isSVG(imageBuffer);
    if (isSVGInput) {
      console.log('Converting SVG to raster in cropToAspectRatio...');
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

    if (originalWidth === 0 || originalHeight === 0) {
      throw new Error('Could not determine image dimensions for aspect ratio cropping.');
    }

    const targetRatio = targetAspectRatio.width / targetAspectRatio.height;
    const originalRatio = originalWidth / originalHeight;

    let cropWidth: number;
    let cropHeight: number;

    // Determine the largest area that matches the target aspect ratio
    if (originalRatio > targetRatio) {
      // Original is wider than target ratio (e.g., 4:3 image to 1:1 ratio)
      // Crop height is constrained by original height, width is calculated.
      cropHeight = originalHeight;
      cropWidth = Math.round(originalHeight * targetRatio);
    } else {
      // Original is taller or equal to target ratio (e.g., 9:16 image to 16:9 ratio)
      // Crop width is constrained by original width, height is calculated.
      cropWidth = originalWidth;
      cropHeight = Math.round(originalWidth / targetRatio);
    }

    // Calculate centering offset
    const left = Math.max(0, Math.floor((originalWidth - cropWidth) / 2));
    const top = Math.max(0, Math.floor((originalHeight - cropHeight) / 2));

    console.log(`Cropping to aspect ratio ${targetAspectRatio.width}:${targetAspectRatio.height}. Crop area: ${cropWidth}x${cropHeight} at L:${left}, T:${top}`);

    // Perform the center-crop
    const croppedBuffer = await sharp(workingBuffer, { limitInputPixels: 1000000000, density: 300 })
      .extract({
        left: left,
        top: top,
        width: cropWidth,
        height: cropHeight
      })
      .toBuffer(); // Do not format yet, let optimizeForWeb handle final format

    return croppedBuffer;
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

  /**
   * Process SVG natively to preserve vector format
   */
  private async processSVGNatively(
    imageBuffer: Buffer,
    originalDimensions: ImageDimensions,
    targetDimensions: ImageDimensions,
    options: ImageProcessingOptions,
    strategy: ExtensionStrategy
  ): Promise<ProcessedImage> {
    // AI processing requires rasterization - warn user and fall back to edge extension
    if (strategy.type === 'ai' && this.apiKey) {
      console.warn('⚠️  AI processing on SVG requires rasterization. Using vector-based edge extension instead to preserve SVG format.');
    }

    const svgString = imageBuffer.toString('utf-8');
    let processedSVG: string;

    // Check if we need to extend or just resize
    const needsExtension = targetDimensions.width > originalDimensions.width ||
                          targetDimensions.height > originalDimensions.height;

    if (needsExtension) {
      // Extend SVG canvas with background
      processedSVG = await this.extendSVGCanvas(
        svgString,
        originalDimensions,
        targetDimensions
      );
    } else {
      // Just resize the viewBox
      processedSVG = this.resizeSVGViewBox(
        svgString,
        targetDimensions
      );
    }

    // Optimize SVG
    const optimizedSVG = await this.optimizeSVG(processedSVG);
    const resultBuffer = Buffer.from(optimizedSVG, 'utf-8');

    return {
      buffer: resultBuffer,
      metadata: {
        width: targetDimensions.width,
        height: targetDimensions.height,
        format: 'svg',
        size: resultBuffer.length,
      },
    };
  }

  /**
   * Resize SVG by modifying its viewBox and dimensions
   */
  private resizeSVGViewBox(
    svgString: string,
    targetDimensions: ImageDimensions
  ): string {
    // Parse SVG to extract viewBox or create one from width/height
    const svgTagMatch = svgString.match(/<svg[^>]*>/);
    if (!svgTagMatch) {
      throw new Error('Invalid SVG: No <svg> tag found');
    }

    const svgTag = svgTagMatch[0];
    const viewBoxMatch = svgTag.match(/viewBox=["']([^"']+)["']/);

    let viewBox: string;
    if (viewBoxMatch) {
      viewBox = viewBoxMatch[1];
    } else {
      // Create viewBox from existing width/height or use target dimensions
      const widthMatch = svgTag.match(/width=["']([^"']+)["']/);
      const heightMatch = svgTag.match(/height=["']([^"']+)["']/);
      const width = widthMatch ? parseFloat(widthMatch[1]) : targetDimensions.width;
      const height = heightMatch ? parseFloat(heightMatch[1]) : targetDimensions.height;
      viewBox = `0 0 ${width} ${height}`;
    }

    // Update or add width, height, and viewBox
    let newSvgTag = svgTag;

    // Update or add viewBox
    if (viewBoxMatch) {
      newSvgTag = newSvgTag.replace(/viewBox=["'][^"']+["']/, `viewBox="${viewBox}"`);
    } else {
      newSvgTag = newSvgTag.replace('<svg', `<svg viewBox="${viewBox}"`);
    }

    // Update or add width
    if (svgTag.match(/width=["'][^"']+["']/)) {
      newSvgTag = newSvgTag.replace(/width=["'][^"']+["']/, `width="${targetDimensions.width}"`);
    } else {
      newSvgTag = newSvgTag.replace('<svg', `<svg width="${targetDimensions.width}"`);
    }

    // Update or add height
    if (svgTag.match(/height=["'][^"']+["']/)) {
      newSvgTag = newSvgTag.replace(/height=["'][^"']+["']/, `height="${targetDimensions.height}"`);
    } else {
      newSvgTag = newSvgTag.replace('<svg', `<svg height="${targetDimensions.height}"`);
    }

    return svgString.replace(svgTagMatch[0], newSvgTag);
  }

  /**
   * Extend SVG canvas by wrapping in a larger SVG with background
   */
  private async extendSVGCanvas(
    svgString: string,
    originalDimensions: ImageDimensions,
    targetDimensions: ImageDimensions
  ): Promise<string> {
    // Detect background color from SVG (look for fill attributes or use white)
    const backgroundColor = this.detectSVGBackgroundColor(svgString);

    // Calculate centering offset
    const offsetX = Math.max(0, (targetDimensions.width - originalDimensions.width) / 2);
    const offsetY = Math.max(0, (targetDimensions.height - originalDimensions.height) / 2);

    // Wrap original SVG in a new SVG with background
    const wrappedSVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${targetDimensions.width}"
     height="${targetDimensions.height}"
     viewBox="0 0 ${targetDimensions.width} ${targetDimensions.height}">
  <rect width="${targetDimensions.width}" height="${targetDimensions.height}" fill="${backgroundColor}"/>
  <g transform="translate(${offsetX}, ${offsetY})">
    ${this.extractSVGContent(svgString)}
  </g>
</svg>`;

    return wrappedSVG;
  }

  /**
   * Detect background color from SVG content
   */
  private detectSVGBackgroundColor(svgString: string): string {
    // Look for background rect or common fill colors
    const bgRectMatch = svgString.match(/<rect[^>]*fill=["']([^"']+)["'][^>]*>/);
    if (bgRectMatch) {
      return bgRectMatch[1];
    }

    // Look for most common fill color in the SVG
    const fillMatches = svgString.matchAll(/fill=["']([^"']+)["']/g);
    const fillColors = Array.from(fillMatches).map(m => m[1]);

    if (fillColors.length > 0) {
      // Return most common color or first color found
      return fillColors[0];
    }

    // Default to white
    return '#ffffff';
  }

  /**
   * Extract inner content from SVG (everything inside <svg> tags)
   */
  private extractSVGContent(svgString: string): string {
    // Remove XML declaration if present
    const content = svgString.replace(/<\?xml[^>]*\?>/g, '');

    // Extract content between <svg> and </svg>
    const svgContentMatch = content.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
    if (svgContentMatch) {
      return svgContentMatch[1].trim();
    }

    // If no match, return original (might be SVG fragment)
    return content;
  }

  /**
   * Optimize SVG using SVGO
   */
  private async optimizeSVG(svgString: string): Promise<string> {
    try {
      const { optimize } = await import('svgo');

      const result = optimize(svgString, {
        multipass: true,
        plugins: [
          {
            name: 'preset-default',
            params: {
              overrides: {
                // Don't remove viewBox - we need it for scaling
                removeViewBox: false,
                // Don't remove IDs that might be used
                cleanupIds: false,
              },
            },
          },
        ],
      });

      return result.data;
    } catch (error) {
      console.warn('SVG optimization failed, returning unoptimized SVG:', error);
      return svgString;
    }
  }

  /**
   * Sharpen image using Sharp.js (fast, offline, no AI)
   * @param imageBuffer - Input image buffer
   * @param format - Output format
   * @param sharpness - Sharpness level (1-10), default 5
   */
  async sharpenImage(
    imageBuffer: Buffer,
    format: 'jpeg' | 'png' | 'webp' = 'jpeg',
    sharpness: number = 5
  ): Promise<ProcessedImage> {
    try {
      const sharp = await this.getSharp();

      // Defensive SVG handling: convert to raster if SVG is passed
      let workingBuffer = imageBuffer;
      const isSVGInput = await this.isSVG(imageBuffer);
      if (isSVGInput) {
        console.log('Converting SVG to raster for sharpening...');
        workingBuffer = await sharp(imageBuffer, {
          density: 300,
          limitInputPixels: 1000000000
        })
        .png()
        .toBuffer();
      }

      // Get original metadata
      const metadata = await sharp(workingBuffer, { limitInputPixels: 1000000000, density: 300 }).metadata();

      // Convert sharpness level (1-10) to Sharp.js parameters
      // sigma: standard deviation of Gaussian mask (0.3-3.0)
      // flat: level of sharpening for flat areas (0.5-2.0)
      // jagged: level of sharpening for jagged areas (0.5-3.0)
      const sigma = 0.5 + (sharpness / 10) * 2.5;  // 0.5 to 3.0
      const flat = 0.5 + (sharpness / 10) * 1.5;   // 0.5 to 2.0
      const jagged = 1.0 + (sharpness / 10) * 2.0; // 1.0 to 3.0

      // Apply sharpening
      const sharpenedBuffer = await sharp(workingBuffer, {
        limitInputPixels: 1000000000,
        density: 300
      })
        .sharpen({
          sigma: sigma,
          m1: flat,     // flat area sharpness
          m2: jagged,   // jagged area sharpness
          x1: 2,        // threshold for flat areas
          y2: 10,       // threshold for jagged areas
          y3: 20        // maximum threshold
        })
        .toBuffer();

      // Optimize for web with the specified format
      const optimizedBuffer = await this.optimizeForWeb(sharpenedBuffer, {
        quality: 90,
        format: format,
        targetDimensions: { width: metadata.width || 0, height: metadata.height || 0 }
      });

      const finalMetadata = await sharp(optimizedBuffer, { limitInputPixels: 1000000000, density: 300 }).metadata();

      return {
        buffer: optimizedBuffer,
        metadata: {
          width: finalMetadata.width || metadata.width || 0,
          height: finalMetadata.height || metadata.height || 0,
          format: finalMetadata.format || format,
          size: optimizedBuffer.length,
        },
      };
    } catch (error) {
      console.error('Image sharpening error:', error);
      throw new Error(`Image sharpening failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * AI-powered image enhancement/unblurring using Gemini AI
   * @param imageBuffer - Input image buffer
   * @param format - Output format
   */
  async enhanceImageWithAI(
    imageBuffer: Buffer,
    format: 'jpeg' | 'png' | 'webp' = 'jpeg'
  ): Promise<ProcessedImage> {
    try {
      if (!this.apiKey) {
        throw new Error('Gemini API key is required for AI enhancement');
      }

      const sharp = await this.getSharp();

      // Defensive SVG handling
      let workingBuffer = imageBuffer;
      const isSVGInput = await this.isSVG(imageBuffer);
      if (isSVGInput) {
        console.log('Converting SVG to raster for AI enhancement...');
        workingBuffer = await sharp(imageBuffer, {
          density: 300,
          limitInputPixels: 1000000000
        })
        .png()
        .toBuffer();
      }

      // Get metadata
      const metadata = await sharp(workingBuffer, { limitInputPixels: 1000000000 }).metadata();

      // Convert to JPEG for AI processing
      const jpegBuffer = await sharp(workingBuffer, { limitInputPixels: 1000000000 })
        .jpeg({ quality: 95 })
        .toBuffer();

      const base64Image = jpegBuffer.toString('base64');

      // Initialize Gemini AI
      const ai = new GoogleGenAI({ apiKey: this.apiKey });

      // Create prompt for image enhancement
      const prompt = [
        {
          text: `You are an expert image enhancement AI. Your task is to enhance this image by:
1. Reducing blur and increasing sharpness
2. Improving clarity and detail
3. Enhancing overall image quality
4. Preserving natural colors and tones
5. Not changing the content, composition, or dimensions

Return the enhanced version of this image with improved sharpness and clarity. Do not add any text, watermarks, or modifications to the image content.`
        },
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: base64Image,
          },
        },
      ];

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: prompt,
      });

      // Check if response contains an image
      if (!response || !response.candidates || response.candidates.length === 0) {
        throw new Error('AI enhancement failed: No response from Gemini AI');
      }

      const candidate = response.candidates[0];
      if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
        throw new Error('AI enhancement failed: No image data in response');
      }

      // Extract image data from response
      const part = candidate.content.parts[0];
      if (!part.inlineData || !part.inlineData.data) {
        throw new Error('AI enhancement failed: No inline data in response');
      }

      const enhancedImageData = part.inlineData.data;
      const enhancedBuffer = Buffer.from(enhancedImageData, 'base64');

      // Optimize for web with specified format
      const optimizedBuffer = await this.optimizeForWeb(enhancedBuffer, {
        quality: 90,
        format: format,
        targetDimensions: { width: metadata.width || 0, height: metadata.height || 0 }
      });

      const finalMetadata = await sharp(optimizedBuffer, { limitInputPixels: 1000000000 }).metadata();

      return {
        buffer: optimizedBuffer,
        metadata: {
          width: finalMetadata.width || metadata.width || 0,
          height: finalMetadata.height || metadata.height || 0,
          format: finalMetadata.format || format,
          size: optimizedBuffer.length,
        },
      };
    } catch (error) {
      console.error('AI enhancement error:', error);
      throw new Error(`AI enhancement failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Rotate or flip image
   * @param imageBuffer - Input image buffer
   * @param operation - Transform operation
   * @param customAngle - Custom rotation angle (for 'custom' operation)
   * @param format - Output format
   * @param quality - Output quality (0-100)
   */
  async rotateFlipImage(
    imageBuffer: Buffer,
    operation: 'rotate-90' | 'rotate-180' | 'rotate-270' | 'flip-horizontal' | 'flip-vertical' | 'custom',
    customAngle: number = 0,
    format: 'jpeg' | 'png' | 'webp' = 'jpeg',
    quality: number = 90
  ): Promise<ProcessedImage> {
    try {
      const sharp = await this.getSharp();

      // Defensive SVG handling: convert to raster if SVG is passed
      let workingBuffer = imageBuffer;
      const isSVGInput = await this.isSVG(imageBuffer);
      if (isSVGInput) {
        console.log('Converting SVG to raster for rotation/flip...');
        workingBuffer = await sharp(imageBuffer, {
          density: 300,
          limitInputPixels: 1000000000
        })
        .png()
        .toBuffer();
      }

      let pipeline = sharp(workingBuffer, { limitInputPixels: 1000000000, density: 300 });

      // Apply transformation based on operation
      switch (operation) {
        case 'rotate-90':
          pipeline = pipeline.rotate(90);
          break;
        case 'rotate-180':
          pipeline = pipeline.rotate(180);
          break;
        case 'rotate-270':
          pipeline = pipeline.rotate(270);
          break;
        case 'flip-horizontal':
          pipeline = pipeline.flop();
          break;
        case 'flip-vertical':
          pipeline = pipeline.flip();
          break;
        case 'custom':
          pipeline = pipeline.rotate(customAngle, { background: { r: 255, g: 255, b: 255, alpha: 1 } });
          break;
      }

      // Apply format-specific processing
      switch (format) {
        case 'jpeg':
          pipeline = pipeline.jpeg({ quality });
          break;
        case 'png':
          pipeline = pipeline.png({ quality });
          break;
        case 'webp':
          pipeline = pipeline.webp({ quality });
          break;
      }

      const transformedBuffer = await pipeline.toBuffer();
      const metadata = await sharp(transformedBuffer, { limitInputPixels: 1000000000, density: 300 }).metadata();

      return {
        buffer: transformedBuffer,
        metadata: {
          width: metadata.width || 0,
          height: metadata.height || 0,
          format: metadata.format || format,
          size: transformedBuffer.length,
        },
      };
    } catch (error) {
      console.error('Image rotation/flip error:', error);
      throw new Error(`Image rotation/flip failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Apply filter to image
   * @param imageBuffer - Input image buffer
   * @param filterType - Filter type
   * @param intensity - Filter intensity (0-100)
   * @param format - Output format
   * @param quality - Output quality (0-100)
   */
  async applyFilter(
    imageBuffer: Buffer,
    filterType: 'grayscale' | 'sepia' | 'noir' | 'warm' | 'cool' | 'vibrant' | 'dramatic' | 'soft-focus',
    intensity: number = 100,
    format: 'jpeg' | 'png' | 'webp' = 'jpeg',
    quality: number = 90
  ): Promise<ProcessedImage> {
    try {
      const sharp = await this.getSharp();

      // Defensive SVG handling: convert to raster if SVG is passed
      let workingBuffer = imageBuffer;
      const isSVGInput = await this.isSVG(imageBuffer);
      if (isSVGInput) {
        console.log('Converting SVG to raster for filter application...');
        workingBuffer = await sharp(imageBuffer, {
          density: 300,
          limitInputPixels: 1000000000
        })
        .png()
        .toBuffer();
      }

      let pipeline = sharp(workingBuffer, { limitInputPixels: 1000000000, density: 300 });
      const normalizedIntensity = intensity / 100; // 0-1 range

      // Apply filter based on type
      switch (filterType) {
        case 'grayscale':
          pipeline = pipeline.grayscale();
          break;

        case 'sepia':
          // Sepia tone effect (warm brownish)
          pipeline = pipeline
            .recomb([
              [0.393, 0.769, 0.189],
              [0.349, 0.686, 0.168],
              [0.272, 0.534, 0.131]
            ]);
          break;

        case 'noir':
          // High contrast black and white
          pipeline = pipeline
            .grayscale()
            .normalise()
            .linear(1.5, -(128 * 0.5));
          break;

        case 'warm':
          // Warm tones (increase red/yellow)
          pipeline = pipeline
            .modulate({
              brightness: 1.0,
              saturation: 1.1
            })
            .tint({ r: 255, g: 220, b: 180 });
          break;

        case 'cool':
          // Cool tones (increase blue)
          pipeline = pipeline
            .modulate({
              brightness: 1.0,
              saturation: 1.1
            })
            .tint({ r: 180, g: 220, b: 255 });
          break;

        case 'vibrant':
          // Increase saturation and contrast
          pipeline = pipeline
            .modulate({
              brightness: 1.05,
              saturation: 1.5
            })
            .linear(1.2, -(128 * 0.2));
          break;

        case 'dramatic':
          // High contrast with deep shadows
          pipeline = pipeline
            .modulate({
              brightness: 1.0,
              saturation: 1.2
            })
            .linear(1.3, -(128 * 0.3));
          break;

        case 'soft-focus':
          // Soft focus with slight blur
          pipeline = pipeline
            .blur(2)
            .modulate({
              brightness: 1.05,
              saturation: 0.9
            });
          break;
      }

      // Apply format-specific processing
      switch (format) {
        case 'jpeg':
          pipeline = pipeline.jpeg({ quality });
          break;
        case 'png':
          pipeline = pipeline.png({ quality });
          break;
        case 'webp':
          pipeline = pipeline.webp({ quality });
          break;
      }

      const filteredBuffer = await pipeline.toBuffer();

      // If intensity is less than 100%, blend with original
      let finalBuffer: Buffer;
      if (intensity < 100 && intensity > 0) {
        // Composite filtered image with original based on intensity
        finalBuffer = await sharp(workingBuffer, { limitInputPixels: 1000000000, density: 300 })
          .composite([{
            input: await sharp(filteredBuffer, { limitInputPixels: 1000000000, density: 300 })
              .ensureAlpha()
              .linear(1, normalizedIntensity * 255 - 255)
              .toBuffer(),
            blend: 'over'
          }])
          .toFormat(format as keyof import('sharp').FormatEnum, { quality })
          .toBuffer();
      } else {
        finalBuffer = filteredBuffer;
      }

      const metadata = await sharp(finalBuffer, { limitInputPixels: 1000000000, density: 300 }).metadata();

      return {
        buffer: finalBuffer,
        metadata: {
          width: metadata.width || 0,
          height: metadata.height || 0,
          format: metadata.format || format,
          size: finalBuffer.length,
        },
      };
    } catch (error) {
      console.error('Image filter error:', error);
      throw new Error(`Image filter application failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert image format
   * @param imageBuffer - Input image buffer
   * @param targetFormat - Target format
   * @param quality - Output quality (0-100)
   */
  async convertFormat(
    imageBuffer: Buffer,
    targetFormat: 'jpeg' | 'png' | 'webp' | 'svg',
    quality: number = 90
  ): Promise<ProcessedImage> {
    try {
      const sharp = await this.getSharp();

      // Check if input is SVG
      const isSVGInput = await this.isSVG(imageBuffer);

      // If converting from SVG to SVG, just optimize
      if (isSVGInput && targetFormat === 'svg') {
        const svgString = imageBuffer.toString('utf-8');
        const optimizedSVG = await this.optimizeSVG(svgString);
        const resultBuffer = Buffer.from(optimizedSVG, 'utf-8');

        return {
          buffer: resultBuffer,
          metadata: {
            width: 0,
            height: 0,
            format: 'svg',
            size: resultBuffer.length,
          },
        };
      }

      // If input is SVG and target is not SVG, convert to raster first
      let workingBuffer = imageBuffer;
      if (isSVGInput && targetFormat !== 'svg') {
        console.log('Converting SVG to raster format...');
        workingBuffer = await sharp(imageBuffer, {
          density: 300,
          limitInputPixels: 1000000000
        })
        .png()
        .toBuffer();
      }

      const metadata = await sharp(workingBuffer, { limitInputPixels: 1000000000, density: 300 }).metadata();
      const pipeline = sharp(workingBuffer, { limitInputPixels: 1000000000, density: 300 });

      // Convert to target format
      let convertedBuffer: Buffer;
      switch (targetFormat) {
        case 'jpeg':
          convertedBuffer = await pipeline.jpeg({ quality, progressive: true }).toBuffer();
          break;
        case 'png':
          // PNG quality in sharp is compression level (0-9), convert from 0-100 scale
          const pngCompression = Math.round((100 - quality) / 100 * 9);
          convertedBuffer = await pipeline.png({ compressionLevel: pngCompression }).toBuffer();
          break;
        case 'webp':
          convertedBuffer = await pipeline.webp({ quality }).toBuffer();
          break;
        case 'svg':
          // Convert raster to SVG by embedding as data URI
          const pngBuffer = await pipeline.png({ quality: 100 }).toBuffer();
          const base64Image = pngBuffer.toString('base64');
          const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${metadata.width}" height="${metadata.height}" viewBox="0 0 ${metadata.width} ${metadata.height}">
  <image width="${metadata.width}" height="${metadata.height}" xlink:href="data:image/png;base64,${base64Image}"/>
</svg>`;
          convertedBuffer = Buffer.from(svgContent, 'utf-8');
          break;
        default:
          throw new Error(`Unsupported target format: ${targetFormat}`);
      }

      const finalMetadata = targetFormat === 'svg'
        ? { width: metadata.width || 0, height: metadata.height || 0, format: 'svg' as const }
        : await sharp(convertedBuffer, { limitInputPixels: 1000000000, density: 300 }).metadata();

      return {
        buffer: convertedBuffer,
        metadata: {
          width: finalMetadata.width || metadata.width || 0,
          height: finalMetadata.height || metadata.height || 0,
          format: finalMetadata.format || targetFormat,
          size: convertedBuffer.length,
        },
      };
    } catch (error) {
      console.error('Format conversion error:', error);
      throw new Error(`Format conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Auto-upscale image if it's below 100KB to reach 150-200KB range
   * @param processedImage - The processed image to potentially upscale
   * @returns ProcessedImage with wasUpscaled flag in metadata
   */
  async autoUpscaleIfNeeded(processedImage: ProcessedImage): Promise<ProcessedImage & { wasUpscaled?: boolean }> {
    const TARGET_MIN_SIZE = 100 * 1024; // 100 KB
    const TARGET_SIZE_RANGE = { min: 150 * 1024, max: 200 * 1024 }; // 150-200 KB

    if (processedImage.buffer.length >= TARGET_MIN_SIZE) {
      return { ...processedImage, wasUpscaled: false };
    }

    try {
      console.log(`Image size ${(processedImage.buffer.length / 1024).toFixed(2)} KB is below 100 KB threshold, upscaling...`);

      const sharp = await this.getSharp();

      // Calculate scale factor to reach target size
      // File size roughly scales with pixel count for same quality
      const currentSize = processedImage.buffer.length;
      const targetSize = (TARGET_SIZE_RANGE.min + TARGET_SIZE_RANGE.max) / 2;
      const sizeRatio = targetSize / currentSize;

      // Scale factor is square root of size ratio (since size ~ width * height)
      const scaleFactor = Math.sqrt(sizeRatio);
      const clampedScaleFactor = Math.min(scaleFactor, 4.0); // Cap at 4x

      const newWidth = Math.round(processedImage.metadata.width * clampedScaleFactor);
      const newHeight = Math.round(processedImage.metadata.height * clampedScaleFactor);

      console.log(`Upscaling from ${processedImage.metadata.width}x${processedImage.metadata.height} to ${newWidth}x${newHeight} (${clampedScaleFactor.toFixed(2)}x)`);

      // Use Lanczos3 for high-quality upscaling
      const upscaledBuffer = await sharp(processedImage.buffer, {
        limitInputPixels: 1000000000
      })
        .resize(newWidth, newHeight, {
          kernel: 'lanczos3',
          fit: 'fill'
        })
        .jpeg({ quality: 90, progressive: true })
        .toBuffer();

      const upscaledMetadata = await sharp(upscaledBuffer, {
        limitInputPixels: 1000000000
      }).metadata();

      console.log(`Upscaled image size: ${(upscaledBuffer.length / 1024).toFixed(2)} KB`);

      return {
        buffer: upscaledBuffer,
        metadata: {
          width: upscaledMetadata.width || newWidth,
          height: upscaledMetadata.height || newHeight,
          format: upscaledMetadata.format || processedImage.metadata.format,
          size: upscaledBuffer.length,
        },
        wasUpscaled: true,
      };
    } catch (error) {
      console.warn('Auto-upscaling failed, returning original:', error);
      return { ...processedImage, wasUpscaled: false };
    }
  }
}