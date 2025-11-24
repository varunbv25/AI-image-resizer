# AI Image & Video Processing Suite

A comprehensive, full-stack media processing platform offering **10 powerful processing modes** (5 image + 5 video) with seamless operation chaining, individual file customization, and full batch processing capabilities. Built with Next.js 15, React 19, TypeScript, and Google's Gemini AI for intelligent processing.

**Key Features:**
- 🤖 **Dual AI Systems**: Gemini 2.5 Flash Image for canvas extension + Gemini 2.0 Flash for image enhancement/unblurring
- 🎬 **Video Processing**: FFmpeg.wasm for client-side video compression, trimming, and cropping
- 🎨 **Modern UI**: Built with shadcn/ui components on Radix UI primitives + Tailwind CSS 4
- ⚡ **Performance**: Sharp.js (libvips) for blazing-fast server-side image processing + ONNX Runtime for client-side ML
- 🔄 **Chain Operations**: Seamlessly process images across all 5 modes with "Edit Again" feature
- 📦 **Full Batch Processing**: Process multiple files simultaneously with **per-file settings customization**
- 🎯 **Individual Selection**: Click any file to customize settings for that specific file
- 🎯 **Unlimited File Sizes**: Vercel Blob integration bypasses 4.5MB serverless limits

## 🌟 Features

### 📸 Image Processing Modes (5)

#### 🤖 AI Image Resizing
- **AI-Powered Canvas Extension**: Uses Google's Gemini 2.5 Flash Image model to intelligently extend image backgrounds
- **Smart Content-Aware Resizing**: Maintains subject positioning while extending canvas areas seamlessly
- **Edge Detection Fallback**: Automatic fallback to edge-extension algorithms when AI is unavailable
- **Multiple Aspect Ratios**: Pre-configured ratios including:
  - Instagram Stories/TikTok (9:16)
  - Portrait Print (2:3)
  - Widescreen (16:9)
  - Square (1:1)
  - Standard (4:3)
  - Landscape (3:2)
- **Custom Dimensions**: Support for any custom width and height
- **Batch Processing**: Process multiple images with individual dimension settings
- **Real-time Preview**: Side-by-side comparison of original and processed images

#### ✂️ Manual Cropping
- **Precision Control**: Drag-and-zoom functionality for pixel-perfect cropping
- **Interactive Canvas**: Click and drag image positioning within crop frame
- **Zoom Controls**: Scale images up or down for precise framing
- **Batch Support**: Process multiple images with sidebar UI showing all uploads
- **Per-Image Settings**: Customize crop dimensions and positioning for each image
- **Status Tracking**: Real-time status indicators (pending, processing, completed, error) for each image
- **Bulk Download**: Download all cropped images as a ZIP file or individually
- **Real-time Preview**: Live preview of crop area with exact dimensions
- **Frame Constraints**: Maintains aspect ratio while allowing flexible positioning
- **High-Quality Output**: Preserves image quality during cropping process

#### ✨ Image Enhancement
- **Triple Enhancement System**: Choose from AI, ML, or traditional methods
  - **Gemini AI Unblur**: Uses Gemini 2.0 Flash for intelligent blur reduction and clarity enhancement
  - **NAFNet ML Model**: Client-side ONNX-based enhancement (runs in browser, no API needed)
  - **Sharp.js Sharpening**: Fast, traditional sharpening with adjustable intensity (1-10 levels)
- **Smart Method Selection**: Toggle between AI and non-AI methods based on your needs
- **Adjustable Sharpness**: Fine-tune enhancement intensity with precision sliders (for Sharp.js method)
- **Batch Processing**: Process multiple images simultaneously with sidebar UI
- **Per-Image Settings**: Customize enhancement method and sharpness for each image individually
- **Status Tracking**: Real-time status indicators (pending, processing, completed, error) for each image
- **Bulk Download**: Download all enhanced images as a ZIP file or individually
- **Auto-Upscale**: Images under 100KB are automatically upscaled to 190-200KB range
- **Format Optimization**: Supports JPEG, PNG, WebP, and SVG inputs
- **Quality Preservation**: Maintains visual fidelity while enhancing details
- **Automatic Fallback**: If AI enhancement fails, automatically falls back to Sharp.js

#### 🔄 Rotate & Flip
- **Quick Rotations**: Instant 90°, 180°, and 270° clockwise rotations
- **Horizontal & Vertical Flips**: Mirror images with one click
- **Custom Angle Rotation**: Rotate by any custom degree value (0-360°)
- **Batch Processing**: Transform multiple images simultaneously with sidebar UI
- **Per-Image Settings**: Customize rotation and flip operations for each image individually
- **Status Tracking**: Real-time status indicators (pending, processing, completed, error) for each image
- **Bulk Download**: Download all transformed images as a ZIP file or individually
- **Lossless Transformations**: Maintains image quality during operations
- **Format Support**: Works with JPEG, PNG, WebP, and SVG inputs
- **Instant Preview**: See transformations in real-time before processing

#### 📦 Image Compression
- **Smart File Size Reduction**: Reduce image file sizes by up to 90% while maintaining visual quality
- **Dual Compression Modes**:
  - **Quality Mode**: Set quality percentage (1-100%)
  - **File Size Mode**: Set target file size in KB
- **Auto-Optimized Quality**: Starts with optimal quality settings (80% for JPEG/WebP, level 9 for PNG)
- **Iterative Compression**: Automatically adjusts quality to reach target file size
- **Batch Processing**: Process multiple images simultaneously with sidebar UI
- **Per-Image Settings**: Customize compression mode and target for each image individually
- **Individual Selection**: Click any image to set custom target size or quality
- **Status Tracking**: Real-time status indicators (pending, processing, completed, error) for each image
- **Bulk Download**: Download all compressed images as a ZIP file or individually
- **Format-Specific Optimization**:
  - JPEG: MozJPEG with progressive encoding for superior compression
  - PNG: Compression level 9 with palette optimization
  - WebP: Advanced WebP compression algorithms (80% quality)
- **Real-time Preview**: Live preview with before/after comparison
- **Compression Statistics**: Detailed metrics showing original, compressed, and target file sizes
- **Multi-attempt Algorithm**: Up to 10 compression attempts to achieve optimal results
- **Interactive Controls**: Mouse wheel scroll support on sliders for precise adjustments

### 🎬 Video Processing Modes (5)

#### 🎥 Video Compression
- **Flexible Compression**: Reduce video file sizes while maintaining quality
- **Target Size Control**: Set specific file size targets in MB
- **Resolution Options**: 360p, 480p, 720p output resolutions (30 FPS)
- **Format Support**: MP4, WebM, MOV output formats (H.264 codec with AAC audio)
- **Batch Processing**: Process multiple videos with sidebar UI
- **Per-Video Settings**: Customize target size, resolution, and format for each video
- **Individual Selection**: Click any video to apply unique compression settings
- **Smart Quality Calculation**: Automatically calculates optimal bitrate for target size
- **Minimum Quality Enforcement**: Ensures minimum bitrate for viewable quality on phones
- **Real-time Status**: Monitor compression progress for each video
- **Thumbnails**: Visual preview thumbnails for all uploaded videos
- **Bulk Download**: Download all compressed videos as a ZIP file

#### ✂️ Video Trimming
- **Precision Timeline Control**: Frame-by-frame video trimming interface
- **Interactive Timeline**: Visual timeline with draggable start/end handles
- **Frame Preview Strip**: See video frames along the timeline
- **Playback Control**: Play/pause video to find exact trim points
- **Fine-Tuning Buttons**: Increment/decrement start/end times by 0.1 seconds
- **Long Press Support**: Hold buttons for continuous time adjustment
- **Batch Processing**: Trim multiple videos with individual settings
- **Per-Video Settings**: Set unique start and end times for each video
- **Individual Selection**: Click any video to customize trim points
- **Real-time Preview**: See exactly which portion will be kept
- **Bulk Download**: Download all trimmed videos as a ZIP file

#### 🎯 Video Cropping
- **Coming Soon**: Advanced video cropping with aspect ratio presets
- **Batch Processing**: Process multiple videos with individual crop settings
- **Real-time Preview**: Visual crop area overlay

### 🎯 Universal Features
- **Drag & Drop Interface**: Intuitive file upload with comprehensive validation
- **Progress Tracking**: Real-time processing status with detailed progress indicators
- **Individual File Selection**: Click any file in batch mode to customize its settings
- **Per-File Configuration**: Each file can have unique processing parameters
- **Batch Actions**: Process all files at once with default settings or customize each one
- **Visual Sidebar**: Thumbnails, file info, and status indicators for all uploaded files
- **Unlimited File Sizes**: ⭐ **NEW** - Upload images of any size using Vercel Blob direct uploads
  - Bypasses 4.5MB serverless function limit
  - Direct client-to-blob uploads with progress tracking
  - Automatic cleanup after processing
  - No more "Request Entity Too Large" errors!
- **Chain Operations**: Process images across multiple modes sequentially with "Edit Again" feature
  - Process with one mode → Edit Again → Continue with another mode on the same image
  - Example workflow: Compress → Rotate → Enhance → Crop → Download
  - Seamlessly pass processed images between all 5 modes
- **Error Handling**: Graceful error handling with user-friendly messages
  - Unsupported format detection with clear supported format list
  - Cancel operations mid-process with confirmation dialog
  - Validation errors with retry options
- **File Validation**: Automatic validation of file format (size limits removed with blob uploads!)
- **Responsive Design**: Works seamlessly across desktop and mobile devices
- **Instant Download**: One-click download of processed files
- **Format Conversion**: Convert between formats while processing
- **Multiple Format Support**:
  - **Images**: JPEG, PNG, WebP, SVG input | JPEG, PNG, WebP output
  - **Videos**: MP4, MOV, WebM input | MP4, WebM, MOV output
- **SVG Processing**: Automatic SVG to raster conversion at 300 DPI for high-quality output

### 🎨 UI/UX Enhancements
- **Interactive Sliders**: Mouse wheel scroll support on all sliders for precise control
  - Hover over any slider and scroll to adjust values
  - Prevents page scrolling when adjusting slider values
  - Smooth incremental adjustments based on slider type
- **Side-by-Side Preview**: Clean comparison layout for before/after media
  - Original vs Processed Result
  - Clear dimension/duration labels
  - Professional card-based layout
- **Sidebar File Browser**: Visual list of all uploaded files
  - Thumbnails for quick identification
  - Status indicators (pending, processing, completed, error)
  - File size and dimension information
  - Click to select and customize individual files
- **Real-time Feedback**: Live updates of target sizes, compression percentages, and processing status
- **Batch Progress Tracking**: See completion status across all files
- **Keyboard Shortcuts** (Manual Cropping):
  - Arrow keys: Move crop frame
  - Space: Apply crop
  - Ctrl+R: Reset

## 🧮 Processing Algorithms

### Video Processing (FFmpeg.wasm)

#### Video Compression Algorithm
- **Codec**: H.264 (libx264) for video, AAC for audio
- **Target Size Calculation**:
  ```
  videoBitrate = (targetSizeMB * 8192) / duration - audioBitrate
  audioBitrate = 128 kbps (constant)
  ```
- **Resolution Mapping**:
  - 360p: 640×360 (min bitrate: 400 kbps)
  - 480p: 854×480 (min bitrate: 700 kbps)
  - 720p: 1280×720 (min bitrate: 1500 kbps)
- **Quality Enforcement**: Ensures minimum bitrate for phone viewing quality
- **Two-Pass Encoding**: Better quality distribution across the video
- **Frame Rate**: Fixed 30 FPS for consistent playback

#### Video Trimming Algorithm
- **Frame-Accurate Trimming**: Uses FFmpeg `-ss` (start) and `-to` (end) parameters
- **Copy Codec**: Uses `-c copy` when possible to avoid re-encoding
- **Timeline Precision**: 0.1-second granularity for trim points
- **Frame Generation**: Creates thumbnail strip at 0.5-second intervals
- **Playback Bounds**: Enforces playback within selected trim range

### Image Processing Algorithms

(See sections: SVG Processing, Raster Image Format Processing, AI Image Resizing Algorithms, Manual Cropping Algorithm, Upscaling Algorithm, Image Compression Algorithms - unchanged from previous version)

## 🛠 Technology Stack

### Frontend Framework
- **Next.js 15.5.3**: React framework with App Router and Turbopack for lightning-fast development
- **React 19.1.0**: Latest React with improved performance and new features
- **TypeScript 5**: Full type safety throughout the application with strict mode enabled

### Video Processing
- **FFmpeg.wasm v0.12.10**: Client-side video processing in the browser
  - H.264 encoding with libx264
  - AAC audio encoding
  - Format conversion (MP4, WebM, MOV)
  - Frame extraction and thumbnail generation
- **@ffmpeg/util v0.12.1**: FFmpeg utility functions and helpers

### Styling & UI Components
- **Tailwind CSS 4**: Utility-first CSS framework with PostCSS 4 integration
- **shadcn/ui**: High-quality, accessible UI component library (copy-paste components, not npm package)
- **Radix UI Primitives**: Unstyled, accessible component primitives
  - `@radix-ui/react-dialog` v1.1.15 - Modal dialogs and overlays
  - `@radix-ui/react-progress` v1.1.7 - Progress bars for processing status
  - `@radix-ui/react-select` v2.2.6 - Accessible select dropdowns
  - `@radix-ui/react-slider` v1.3.6 - Range sliders with mouse wheel support
  - `@radix-ui/react-slot` v1.2.3 - Composition utility for flexible components
  - `@radix-ui/react-tabs` v1.1.13 - Tab navigation for mode selection
- **Styling Utilities**:
  - `class-variance-authority` v0.7.1 - CVA for variant-based component APIs
  - `clsx` v2.1.1 - Conditional class name utility
  - `tailwind-merge` v3.3.1 - Merge Tailwind classes intelligently
  - `tw-animate-css` v1.3.8 - Extended animation utilities
- **Icons**: `lucide-react` v0.544.0 - Beautiful, customizable icon library (2000+ icons)
- **Animations**: `framer-motion` v12.23.24 - Production-ready animation library

### Backend & Image Processing
- **Next.js API Routes**: Serverless API endpoints (`runtime: 'nodejs'`, `maxDuration: 60s`)
- **Sharp.js v0.32.6**: High-performance image processing (libvips 8.14+ based)
  - Lanczos3 kernel for upscaling
  - MozJPEG compression
  - Progressive JPEG encoding
  - WebP and PNG optimization
  - SVG rasterization at 300 DPI
- **SVGO v4.0.0**: SVG optimization and minification
- **Formidable v3.5.4**: Multipart form data parsing for file uploads

### AI & Machine Learning
- **Google Gemini AI** (`@google/genai` v1.20.0):
  - **Gemini 2.5 Flash Image**: Intelligent canvas extension with generative fill
  - **Gemini 2.0 Flash Exp**: AI-powered image enhancement and unblurring
- **ONNX Runtime Web v1.23.0**: Client-side ML inference
  - NAFNet model for browser-based image enhancement
  - Runs entirely in the browser (no API calls needed)
  - WebAssembly-accelerated inference

### File Handling & Storage
- **Vercel Blob**: Unlimited file size uploads (bypasses 4.5MB serverless limit)
- **JSZip v3.10.1**: Client-side ZIP file generation for batch downloads
- **React Dropzone v14.3.8**: Drag & drop file upload with validation
- **Custom Helpers**:
  - Client-side image compression (>3MB auto-compressed)
  - Batch upload helper with progress tracking
  - Batch video upload helper with concurrent processing
  - Custom JSON parser supporting 100MB payloads

### Development Tools
- **ESLint v9**: Code quality and consistency (@eslint/eslintrc v3)
- **PostCSS**: CSS processing with Tailwind CSS 4
- **Node.js 18+**: Runtime environment

## 🚀 Getting Started

### Prerequisites

- **Node.js 18+**: Download from [nodejs.org](https://nodejs.org/)
- **npm or yarn**: Package manager (npm comes with Node.js)
- **Google Gemini API key**: Get one from [Google AI Studio](https://aistudio.google.com/)

### Installation

1. **Clone the repository:**
```bash
git clone <repository-url>
cd ai-image-resizer
```

2. **Install dependencies:**
```bash
npm install
# or
yarn install
```

3. **Set up environment variables:**
```bash
# Copy the environment template
cp .env.example .env.local
```

4. **Configure environment variables in `.env.local`:**
```env
# Required: Google Gemini API Key for AI features
GEMINI_API_KEY=your_gemini_api_key_here

# Required for Vercel deployments: Blob Storage (handles unlimited file sizes)
# Get this from Vercel Dashboard → Storage → Blob
# Automatically set on Vercel deployment, only needed for local dev
BLOB_READ_WRITE_TOKEN=your_blob_token_here

# Optional: CloudConvert for advanced compression
CLOUDCONVERT_API_KEY=your_cloudconvert_api_key_here
```

**Important:** For unlimited file size uploads on Vercel:
- Create a Blob Store in your Vercel project dashboard (Storage → Blob)
- The `BLOB_READ_WRITE_TOKEN` will be automatically set in production
- For local development, copy the token from Vercel to your `.env.local`
- See [VERCEL_BLOB_SETUP.md](./VERCEL_BLOB_SETUP.md) for detailed instructions

5. **Start the development server:**
```bash
npm run dev
# or
yarn dev
```

6. **Open your browser:**
Navigate to [http://localhost:3000](http://localhost:3000) to use the application.

### Development Commands

```bash
# Start development server with Turbopack
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linting
npm run lint
```

## 📖 Usage

### Processing Mode Selection

The application offers **10 distinct processing modes** (5 image + 5 video) accessible from the main interface:

**Image Modes:**
1. **AI Image Resizing** - For intelligent canvas extension and aspect ratio changes
2. **Manual Cropping** - For precise, hands-on image cropping
3. **Image Compression** - For file size optimization and web-ready images
4. **Image Enhancement** - For AI-powered deblurring and sharpening
5. **Rotate & Flip** - For instant image transformations (rotations and flips)

**Video Modes:**
6. **Video Compression** - For reducing video file sizes with quality control
7. **Video Trimming** - For precise video cutting and clip extraction
8. **Video Cropping** - For aspect ratio adjustment (coming soon)

### Batch Processing with Individual Customization

All processing modes support **full batch processing** with **per-file customization**:

1. **Upload Multiple Files**
   - Drag and drop multiple files onto the upload area
   - Or click to browse and select multiple files
   - All files appear in the sidebar with thumbnails and status indicators

2. **Individual File Selection**
   - Click any file in the sidebar to select it
   - The main content area displays settings for that specific file
   - Customize processing parameters for that file only

3. **Settings Customization**
   - **Default Settings**: Apply to all files when using "Process All"
   - **Per-File Settings**: Click a file to customize its individual settings
   - Each file remembers its custom settings until processing

4. **Processing Options**
   - **Process Individual**: Click "Process This [Image/Video]" to process the selected file with its custom settings
   - **Process All**: Click "Process All [Images/Videos]" to process all pending files (uses default settings for files without custom settings)

5. **Download Options**
   - **Download Single**: Click download button on individual completed files
   - **Download All**: Click "Download All" to get a ZIP file of all completed files

### Chain Operations (Images Only)

All image modes support seamless operation chaining with the "Edit Again" feature:
1. Process an image in any mode
2. Click "Edit Again" after processing
3. Select a different mode to continue editing the same processed image
4. Repeat as needed to create complex multi-stage workflows

### Video Processing Modes

#### 🎥 Video Compression Mode

1. **Upload Video(s)**
   - Upload single or multiple videos using drag-and-drop or file selection
   - Videos appear in the sidebar with thumbnails, duration, and file size

2. **Select Video for Customization (Optional)**
   - Click on a video from the sidebar to customize its compression settings
   - Selected video's settings appear in the main content area

3. **Configure Compression Settings**
   - **Target Size**: Set target file size in MB
   - **Resolution**: Choose 360p, 480p, or 720p (30 FPS)
   - **Output Format**: Select MP4, WebM, or MOV (all use H.264 + AAC)
   - Settings can be customized per-video or use defaults
   - Minimum size enforced based on resolution and duration

4. **Process Videos**
   - Click "Compress Video" to process the selected video with custom settings
   - Or click "Compress All Videos" to start batch processing with default settings
   - Monitor progress with detailed status updates in the sidebar

5. **Download Compressed Videos**
   - Download individual videos as they complete
   - Or click "Download All" to get a ZIP file of all compressed videos
   - Compare file sizes: Original → Compressed (with compression ratio)

#### ✂️ Video Trimming Mode

1. **Upload Video(s)**
   - Upload single or multiple videos using drag-and-drop or file selection
   - Videos appear in the sidebar with thumbnails and duration

2. **Select Video to Trim**
   - Click on a video from the sidebar to work on it
   - Selected video appears in the video player with interactive timeline

3. **Set Trim Points**
   - **Interactive Timeline**: Drag start and end handles on the timeline
   - **Frame Preview**: See video frames along the timeline for precise selection
   - **Fine-Tune Buttons**: Use +/- buttons to adjust start/end times by 0.1s
   - **Long Press**: Hold buttons for continuous time adjustment
   - **Playback Control**: Play/pause to find exact moments

4. **Process Videos**
   - Click "Trim Video" to process the selected video
   - Or switch to another video and set its trim points
   - Monitor progress for each video in the sidebar

5. **Download Trimmed Videos**
   - Download individual trimmed videos as they complete
   - Or click "Download All" to get a ZIP file of all trimmed videos
   - Compare durations: Original → Trimmed

## 📝 License

This project is private and proprietary. All rights reserved.

---

**Note**: This comprehensive media processing suite offers **10 distinct modes** (5 image + 5 video) with seamless capabilities:

**Image Modes:**
- **AI Image Resizing** requires a Google Gemini API key for AI-powered canvas extension (fallback methods available)
- **Manual Cropping** works entirely offline with no external dependencies
- **Image Compression** utilizes format-specific optimization for efficient file size reduction
- **Image Enhancement** offers three methods:
  - **AI Enhancement**: Requires Gemini API key, provides intelligent unblurring
  - **ML Enhancement**: Client-side NAFNet model (no API needed, runs in browser)
  - **Traditional Enhancement**: Sharp.js sharpening (no dependencies)
- **Rotate & Flip** provides instant image transformations with batch processing support

**Video Modes:**
- **Video Compression**: Client-side FFmpeg.wasm processing, target size and resolution control
- **Video Trimming**: Frame-accurate trimming with interactive timeline
- **Video Cropping**: Coming soon

**Key Capabilities:**
- **Full Batch Processing**: All modes support multiple file uploads
- **Individual Customization**: Click any file to apply unique settings
- **Per-File Settings**: Each file can have different processing parameters
- **Visual Sidebar**: Thumbnails, status indicators, and file information
- **Bulk Downloads**: ZIP files for batch-processed files

**UI/UX Highlights:**
- Built with **shadcn/ui** components on **Radix UI** primitives
- Styled with **Tailwind CSS 4** for modern, responsive design
- Animated with **Framer Motion** for smooth transitions
- **2000+ Lucide icons** for beautiful, consistent iconography

All image modes support the "Edit Again" feature, allowing you to chain multiple operations on the same image seamlessly. Choose the mode that best fits your workflow and requirements!
