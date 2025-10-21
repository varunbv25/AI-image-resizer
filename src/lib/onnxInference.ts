import * as ort from 'onnxruntime-web';

// Configure ONNX Runtime to suppress CPU vendor warnings
if (typeof window !== 'undefined') {
  ort.env.wasm.numThreads = 1;
  ort.env.logLevel = 'error'; // Only show errors, suppress warnings
}

export class ONNXImageEnhancer {
  private session: ort.InferenceSession | null = null;
  private modelPath: string;
  private isLoaded: boolean = false;

  constructor(modelPath: string = '/models/nafnet.onnx') {
    this.modelPath = modelPath;
  }

  async loadModel(): Promise<void> {
    try {
      // Configure ONNX Runtime for WebAssembly execution
      this.session = await ort.InferenceSession.create(this.modelPath, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
      this.isLoaded = true;
      console.log('✓ ONNX NAFNet model loaded successfully');
    } catch (error) {
      // Silently fail - this is expected when model file is not present
      // The UI will show fallback mode automatically
      this.isLoaded = false;
      throw error; // Re-throw to be caught by the component
    }
  }

  async enhanceImage(imageData: ImageData): Promise<ImageData> {
    if (!this.session || !this.isLoaded) {
      throw new Error('Model not loaded. Call loadModel() first.');
    }

    // Preprocess: Convert ImageData to tensor
    const inputTensor = this.preprocessImage(imageData);

    // Run inference
    const feeds = { input: inputTensor };
    const results = await this.session.run(feeds);

    // Postprocess: Convert tensor back to ImageData
    const outputTensor = results.output;
    const enhancedImageData = this.postprocessImage(outputTensor, imageData.width, imageData.height);

    return enhancedImageData;
  }

  private preprocessImage(imageData: ImageData): ort.Tensor {
    const { width, height, data } = imageData;

    // Normalize to [0, 1] and convert to CHW format (Channel, Height, Width)
    const float32Data = new Float32Array(3 * width * height);

    for (let i = 0; i < width * height; i++) {
      float32Data[i] = data[i * 4] / 255.0;                          // R channel
      float32Data[width * height + i] = data[i * 4 + 1] / 255.0;     // G channel
      float32Data[2 * width * height + i] = data[i * 4 + 2] / 255.0; // B channel
    }

    return new ort.Tensor('float32', float32Data, [1, 3, height, width]);
  }

  private postprocessImage(tensor: ort.Tensor, width: number, height: number): ImageData {
    const data = tensor.data as Float32Array;
    const imageData = new ImageData(width, height);

    // Convert from CHW to HWC format and denormalize to [0, 255]
    for (let i = 0; i < width * height; i++) {
      imageData.data[i * 4] = Math.min(255, Math.max(0, data[i] * 255));                      // R
      imageData.data[i * 4 + 1] = Math.min(255, Math.max(0, data[width * height + i] * 255)); // G
      imageData.data[i * 4 + 2] = Math.min(255, Math.max(0, data[2 * width * height + i] * 255)); // B
      imageData.data[i * 4 + 3] = 255;                                                         // A (alpha)
    }

    return imageData;
  }

  /**
   * Check if the model is loaded and ready for inference
   */
  isModelLoaded(): boolean {
    return this.isLoaded;
  }

  /**
   * Release model resources
   */
  async dispose(): Promise<void> {
    if (this.session) {
      // ONNX Runtime doesn't have a dispose method, but we can clear the reference
      this.session = null;
      this.isLoaded = false;
      console.log('ONNX model resources released');
    }
  }
}
