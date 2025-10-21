# AI Image Processing Suite - User Flows

**Last Updated**: Synchronized with actual implementation (5 modes, 7 API routes)

This document describes the complete user journey for each processing mode from upload to download, matching the current implementation exactly.

---

## 1. AI Image Resizing (Smart Canvas Extension)

**Homepage** - Upload image via drag-drop or file picker

**Image Loads** - Preview thumbnail appears with remove option

**Mode Selection** - Click "AI Image Resizing" card (Bot icon, blue theme)
- **Note**: Only available for single images
- When multiple files uploaded, this mode is hidden
- Message shown: "Generative Expand and Manual Cropping are only available for single images"

**Processing Interface**
- **Left Panel**: Image details, target dimensions, aspect ratio toggle
- **Right Panel**: Original image preview

**Configure Settings**
- Enter custom width/height OR select preset ratio (1:1, 16:9, 4:3, etc.)
- Toggle "Maintain Aspect Ratio"
- AI automatically extends canvas with intelligent background

**Click "Process Image"** - Progress bar shows: Analyzing → Extending → Optimizing

**Preview Result** - Before/after comparison with drag slider

**Download** - Click download button
- Filename: `enhanced-[original-name].[format]`
- Format preserved: JPEG, PNG, WebP, or SVG

**Options**:
- **Back to modes**: Return to mode selection
- **Start over**: Clear all and return to upload
- **Edit Again**: Chain to another mode with processed image
- **Done**

---

## 2. Manual Cropping (Precision Drag-and-Zoom)

**Homepage** - Upload image

**Image Loads** - Preview thumbnail with remove option

**Mode Selection** - Click "Manual Cropping" card (Scissors icon, green theme)
- **Note**: Only available for single images
- When multiple files uploaded, this mode is hidden
- Message shown: "Generative Expand and Manual Cropping are only available for single images"

**Processing Interface**
- **Left Panel**: Crop dimensions, aspect ratio presets
- **Right Panel**: Interactive canvas with draggable image

**Select Crop Settings**
- Choose preset aspect ratio (Square, 16:9, 4:3, Original, Custom)
- Enter custom width/height if needed

**Adjust Image Position**
- Drag image within frame to position
- Zoom in/out using mouse wheel or zoom controls
- Real-time preview of cropped area
- Keyboard shortcuts available

**Click "Crop Image"** - Instant processing

**Preview Result** - Cropped image with optimal compression

**Download** - Click download button
- Filename: `cropped-[original-name].[format]`

**Options**:
- **Reset**: Reset crop settings
- **Back to modes**: Return to mode selection
- **Start over**: Clear all and return to upload
- **Edit Again**: Chain to another mode
- **Done**

---

## 3. Image Compression (Smart Size Reduction)

### Single Image:

**Homepage** - Upload image

**Image Loads** - Shows original file size

**Mode Selection** - Click "Compression" card (FileArchive icon, orange theme)

**Processing Interface**
- **Left Panel**: Target size controls, quality slider
- **Right Panel**: Original image with size info

**Adjust Compression**
- Drag quality slider (1-100)
- Enter target file size in KB or percentage of original
- Real-time size estimates
- Format-specific optimization (MozJPEG, PNG level 9, WebP)
- **Mouse wheel support**: Scroll over slider to adjust

**Click "Compress Image"** - Iterative quality reduction algorithm
- Progress bar shows compression iterations

**Preview Result**
- Before/after comparison
- Original size vs compressed size
- Compression ratio percentage
- Quality used

**Download** - Get optimized file
- Filename: `compressed-[original-name].[format]`

**Done**

---

### Batch Processing:

**Homepage** - Upload multiple images (2+)

**Images Load** - Thumbnails grid
- First 5 shown directly
- "+X more" indicator for additional files

**Mode Selection** - "Compression" card available for batch
- Highlighted as batch-capable mode

**Batch Processing Interface**
- **Sidebar**: List of all images with status icons
  - Clock icon: Pending
  - Spinner: Processing
  - Checkmark: Completed
  - X icon: Error
- **Main Area**: Preview of selected image
- Individual file sizes shown

**Configure & Process**
- **Global Settings**: Set target size/quality for all images
- **Per-Image Override**: Click image to customize individual settings
- Click "Process All Images"
- Progress tracker shows: "Image X/Y processing"

**View Summary** - All results with individual previews
- Total space saved displayed
- Individual compression ratios
- Before/after size comparison for each image

**Download Options**:
- **Download All**: Single ZIP file with all compressed images
  - Filename: `compressed-images.zip`
- **Download individual**: Click download on each image card
- Filename pattern: `compressed-[index]-[original-name].[format]`

**Confirmation**: "All images compressed successfully"

**Done**

---

## 4. Image Enhancement (Deblur & Sharpen)

### Single Image:

**Homepage** - Upload image

**Image Loads** - Preview thumbnail

**Mode Selection** - Click "AI Enhancement" card (Wand2 icon, indigo theme)

**Processing Interface**
- **Left Panel**: Enhancement method selector, settings
- **Right Panel**: Original image preview

**Choose Enhancement Method**
- **Deblur**: Reduce motion blur, restore sharpness (ONNX NAFNet model)
- **Sharpen**: Edge enhancement, detail improvement
- **Auto**: AI automatically selects best method

**Configure Settings**
- Sharpness slider (0-100) - if using Deblur or Sharpen
- No settings for Auto method
- **Mouse wheel support**: Scroll over slider to adjust

**Click "Enhance Image"** - Progress: Analyzing → Enhancing → Finalizing
- Uses ONNX models for processing
- Auto-upscales images < 100KB to 190-200KB range

**Preview Result** - Interactive before/after slider
- Drag slider to compare original vs enhanced
- Labels: "Before" (left) / "After" (right)

**View Details**
- Dimensions, format, file size
- Enhancement method used
- Processing time

**Download** - Click download button
- Filename: `enhanced-[original-name].[format]`

**Options**:
- **Edit Again**: Chain to another mode
- **Done**

---

### Batch Processing:

**Homepage** - Upload multiple images

**Images Load** - Thumbnails grid

**Mode Selection** - "AI Enhancement" available for batch

**Batch Interface**
- **Sidebar**: Queue of images with status
- **Main Area**: Preview first image with settings

**Select Method**
- Choose Deblur, Sharpen, or Auto for all images
- **Global Settings**: Apply same settings to all
- **Per-Image Override**: Customize individual settings

**Click "Process All"** - Sequential enhancement with progress tracker
- Shows "Enhancing image X of Y"
- Individual progress bars for each image

**View Results Summary**
- Grid of enhanced images
- Enhancement details for each

**Download Options**:
- **Download All (ZIP)**: `enhanced-images.zip`
- **Download individually**: Click on each image

**Confirmation**: "All images enhanced successfully"

**Done**

---

## 5. Rotate/Flip Image (Instant Transforms)

### Single Image:

**Homepage** - Upload image

**Image Loads** - Preview thumbnail

**Mode Selection** - Click "Rotate/Flip" card (RotateCw icon, teal theme)

**Processing Interface**
- **Left Panel**: Transform controls
- **Right Panel**: Live preview with instant updates

**Select Transform**
- **Rotate**: 90° CW, 90° CCW, 180°, 270°
- **Flip**: Horizontal, Vertical
- **Custom Rotation**: Slider for precise angle (0° to 360°)
  - **Mouse wheel support**: Scroll over slider to adjust

**Instant Preview** - Real-time transformation as you click
- No processing delay
- Live preview updates immediately

**Click "Apply"** - Finalize transformation

**Download** - Get transformed image
- Filename: `rotated-[original-name].[format]` or `flipped-[original-name].[format]`

**Done**

---

### Batch Processing:

**Upload Multiple Images**

**Mode Selection** - "Rotate/Flip" card available for batch

**Batch Interface**
- **Sidebar**: List of images with status
- **Main Area**: Preview first image with live updates
- Apply same transform to all OR individual controls

**Select Global Transform**
- 90° CW, 90° CCW, 180°, 270°
- Flip Horizontal, Flip Vertical
- Or set per-image transforms

**Click "Process All"** - Instant batch transformation
- Very fast processing
- Lossless for standard rotations (90°/180°/270°)

**View Results** - Grid of transformed images

**Download All (ZIP)** - `transformed-images.zip`

**Confirmation**: "X images transformed successfully"

**Done**

---

## 6. Format Conversion (Image Type Conversion)

### Status: ⚠️ **API EXISTS, UI NOT IMPLEMENTED**

**Note**: The `/api/convert-format` route is fully implemented but there is no UI mode component yet. This feature is planned for future implementation.

**Planned Single Image Flow**:

**Homepage** - Upload image

**Image Loads** - Preview thumbnail showing current format

**Mode Selection** - Click "Format Converter" card (Palette icon, cyan theme)

**Processing Interface**
- **Left Panel**: Format selection buttons
- **Right Panel**: Live preview with instant updates

**Browse Format Types**
- Supported formats: JPEG, PNG, WebP, SVG
- Current format excluded from options
- Click the target file type to convert

**Instant Conversion** - Processing happens immediately
- SVG → Raster: 300 DPI conversion
- Raster → SVG: Base64 embedding
- Raster ↔ Raster: Format conversion with optimization

**Preview Result** - Before/after comparison with format indicators

**Download** - Get converted image
- Filename: `[original-name]-converted.[new-format]`

**Done**

---

### Planned Batch Processing:

**Upload Multiple Images**

**Mode Selection** - "Format Converter" card

**Batch Interface**
- Choose single target format for all images
- Shows current format for each image

**Click "Convert All"** - Progress tracker

**Download All (ZIP)** - All converted images

**Success Confirmation**

**Done**

---

## KEY NAVIGATION FEATURES

### Header Navigation (Always Present)

- **Back Button**: Returns to previous step
  - Processing → Mode Selection → Upload
  - Arrow left icon with "Back" text

- **Imagify Logo**: Click to reset entire flow
  - Returns to homepage/upload
  - Clears all uploaded files

- **Start Over Button**: Available in processing view
  - Clears all and returns to upload
  - Confirmation dialog shown

### URL State Management

- `/?step=upload` - Upload page
- `/?step=mode-selection` - Mode selection with uploaded files
- `/?step=processing&mode={mode}` - Specific mode processing
  - Modes: `ai-crop`, `manual-crop`, `compression`, `enhancement`, `rotate-flip`
- Browser back/forward buttons work correctly
- URL updates automatically as you navigate

### File Management

- **Remove Files**: Hover over thumbnail, click X icon
- **Auto-reset**: If all files removed from mode selection, returns to upload
- **File Validation**:
  - Supported formats: JPEG, PNG, WebP, SVG
  - Max file size: 50MB (API limit)
  - Auto-compression: Triggers at 3MB
  - Real-time validation feedback

### Processing States

All modes show consistent progress indicators:

1. **Idle**: Waiting to start
2. **Analyzing**: Examining image
3. **Processing/Extending/Enhancing**: Main operation
4. **Optimizing/Finalizing**: Final touches
5. **Completed**: Ready to download
6. **Error**: Failed with error message

**Visual Indicators**:
- Animated progress bars
- Descriptive status messages
- Percentage complete (when applicable)
- Time estimates for batch operations

---

## COMPARISON SLIDER (UNIVERSAL FEATURE)

**Used in**: AI Resizing, Manual Cropping, Image Compression, Enhancement

**Features**:
- **Drag Slider**: Move divider left/right to compare before/after
- **Touch Support**: Swipe on mobile devices
- **Labels**: "Before" (left side) / "After" (right side)
- **Constraints**: Slider only moves within actual image bounds (not letterboxed areas)
- **Keyboard Support**: Arrow keys to move slider
- **Precise Control**: Hold Shift for fine-grained movement

---

## DOWNLOAD OPTIONS

### Single Image

- **Button**: "Download" with download icon
- **Filename Formats**:
  - AI Resizing: `enhanced-[original-name].[format]`
  - Manual Cropping: `cropped-[original-name].[format]`
  - Compression: `compressed-[original-name].[format]`
  - Enhancement: `enhanced-[original-name].[format]`
  - Rotate/Flip: `rotated-[original-name].[format]`
- **Formats Preserved**: JPEG, PNG, WebP, SVG
- **Download Method**: Browser download (no server storage)

### Batch Processing

- **Download All**: Single ZIP file with all processed images
  - ZIP filename: `[mode]-images.zip`
  - Example: `compressed-images.zip`, `enhanced-images.zip`
- **Individual Downloads**: Click download icon on each image card
- **Filename Convention**: `[mode]-[index]-[original-name].[format]`
  - Example: `compressed-1-photo.jpg`, `enhanced-2-image.png`
- **ZIP Generation**: Client-side using JSZip library

---

## CHAIN OPERATIONS (EDIT AGAIN FEATURE)

### How It Works

1. **Complete Any Mode**: Finish processing in any mode (e.g., Compression)
2. **Click "Edit Again"**: Button appears below download options
3. **Image Conversion**: Processed image converted to File object automatically
4. **Return to Mode Selection**: Taken back to mode selection screen
5. **Processed Image Loaded**: Your processed image is now the "uploaded" file
6. **Select Different Mode**: Choose any other mode (e.g., Rotate & Flip)
7. **Process Again**: Use processed image as input for new operation
8. **Repeat Indefinitely**: Chain as many operations as needed

### Seamless Chaining

- **All 5 Modes Support Chaining**: Works across all modes
- **Metadata Preserved**: Filename and MIME type maintained
- **No Quality Loss**: Base64 to Blob conversion is lossless
- **Transparent**: Happens automatically in background
- **Fast**: No re-upload required

### Example Chain Workflows

**Workflow 1: Optimize for Web**
1. Upload large image → **Compress** (reduce to 500KB) → Edit Again
2. **Rotate** (fix orientation) → Edit Again
3. **Enhance** (sharpen details) → Download final result

**Workflow 2: Prepare Social Media Post**
1. Upload photo → **AI Resize** (extend to 16:9) → Edit Again
2. **Compress** (under 1MB for Instagram) → Download

**Workflow 3: Repair and Format**
1. Upload blurry scan → **Enhance** (deblur) → Edit Again
2. **Rotate** (straighten) → Edit Again
3. **Manual Crop** (remove borders) → Download

---

## ERROR HANDLING

### Upload Errors

- **Invalid file type**
  - Alert: "Unsupported format. Use JPEG, PNG, WebP, or SVG"
  - Red border around dropzone

- **File too large** (>50MB before compression)
  - Auto-compress if possible (files >3MB)
  - If still too large: "File exceeds 50MB limit"

- **No files selected**
  - Dropzone remains in idle state
  - Prompt: "Drop images here or click to browse"

### Processing Errors

- **API failure**
  - Alert with specific error message
  - Processing state resets to idle
  - "Try again" button appears

- **Network timeout**
  - Message: "Request timed out. Please try again"
  - Retry button available

- **AI service unavailable** (AI Resizing only)
  - Automatic fallback to edge detection
  - Notice: "AI unavailable, using edge color extension"

### Batch Processing Errors

- **Individual image fails**
  - Marked with red X icon
  - Error message shown on hover
  - Retry button for that image

- **Successful images remain downloadable**
  - Can download successful ones while retrying failed

- **Error summary shown**
  - "X of Y images processed successfully"
  - "Y images failed - click to retry"

---

## BATCH MODE AVAILABILITY

### Modes with Full Batch Support ✅

1. **Image Compression**
   - Full batch UI and processing
   - Per-image settings available
   - Global settings option

2. **Image Enhancement**
   - Full batch UI and processing
   - Choose method per image or globally
   - Progress tracking per image

3. **Rotate & Flip**
   - Full batch UI and processing
   - Same transform for all or individual
   - Instant processing

### Modes Restricted to Single Images ❌

1. **AI Image Resizing**
   - **Reason**: UI restriction (batch code exists internally)
   - **Code location**: `page.tsx:310`
   - **Status**: Batch infrastructure ready, not exposed in UI

2. **Manual Cropping**
   - **Reason**: UI restriction (batch code exists internally)
   - **Code location**: `page.tsx:310`
   - **Status**: Batch infrastructure ready, not exposed in UI

### Why the Restriction?

When multiple files (2+) are uploaded:
- Only batch-capable modes appear in mode selection
- Restricted modes are hidden
- Message shown to user:
  > "Generative Expand and Manual Cropping are only available for single images"

**Technical Implementation**:
```typescript
// page.tsx:310
const batchCapableModes: Mode[] = ['compression', 'enhancement', 'rotate-flip'];
```

To use restricted modes:
- Upload **only one image** at a time
- All modes will then be available

---

## FILE SIZE LIMITS & COMPRESSION

### Upload Limits

- **API Body Limit**: 50MB (`/api/upload` route)
- **Client-Side Auto-Compression**: Triggers at 3MB
- **Custom JSON Parser**: Supports up to 100MB payloads
- **Recommended**: Keep images under 10MB for best performance

### Auto-Compression Settings

When a file exceeds 3MB, automatic compression happens:

- **Max File Size After Compression**: 3MB
- **Max Dimension**: 4096px (width or height)
- **Quality**: 80% (high quality preserved)
- **Iterative Reduction**: Quality decreases by 10% if still too large
- **Canvas Smoothing**: High-quality enabled
- **Transparent to User**: Happens automatically, logged to console

### Compression Stats Logging

Console output example:
```
Client-side compression applied:
Original: 8.5 MB
Compressed: 2.8 MB
Reduction: 67%
```

### Platform Compatibility

All platforms work reliably with client-side compression:

| Platform | Payload Limit | Status | Notes |
|----------|--------------|--------|-------|
| **Local Development** | 100MB | ✅ Works perfectly | No issues |
| **Vercel (Hobby)** | 4.5MB | ✅ Works perfectly | Compression keeps under limit |
| **AWS Lambda** | 6MB | ✅ Works perfectly | Compression ensures compatibility |
| **Cloudflare Pages** | 100MB | ✅ Works perfectly | No issues |
| **Railway** | 100MB | ✅ Works perfectly | No issues |
| **Self-Hosted** | 100MB | ✅ Works perfectly | Configurable |

**Why It Works**:
- 3MB compressed file → ~4MB after base64 encoding
- Stays under Vercel's 4.5MB limit
- Stays under AWS Lambda's 6MB limit

---

## SUPPORTED FORMATS

### Input Formats ✅

- **JPEG** (`.jpg`, `.jpeg`)
  - All variants supported
  - Lossy compression

- **PNG** (`.png`)
  - Transparency supported
  - Lossless compression

- **WebP** (`.webp`)
  - Modern format
  - Lossy and lossless variants

- **SVG** (`.svg`)
  - Converted to 300 DPI raster for processing
  - Original vector can be preserved in some modes

### Output Formats ✅

All input formats can be output in same format or converted:

- **JPEG**: 80-90% quality, MozJPEG encoder, progressive
- **PNG**: Compression level 9, palette optimization
- **WebP**: VP8 codec, 80-90% quality
- **SVG**: Raster image embedded as base64 in SVG wrapper

### Format-Specific Processing

- **JPEG**: MozJPEG encoder, trellis quantization, optimized Huffman
- **PNG**: Level 9 compression, adaptive filtering, palette optimization
- **WebP**: VP8/VP8L codec, superior compression ratios
- **SVG**: 300 DPI rasterization, preserves dimensions

---

## TECHNICAL IMPLEMENTATION DETAILS

### API Routes (7 Total)

1. **`/api/upload`** - File validation & metadata extraction
2. **`/api/process`** - AI image resizing (Gemini 2.5 Flash)
3. **`/api/compress`** - Manual cropping
4. **`/api/compress-image`** - Image compression
5. **`/api/enhance`** - Image enhancement (ONNX models)
6. **`/api/rotate-flip`** - Image transformations
7. **`/api/convert-format`** - Format conversion (⚠️ UI not implemented)

### Processing Modes (5 Total)

1. **AI Image Resizing** - `src/components/modes/AIImageResizing.tsx`
2. **Manual Cropping** - `src/components/modes/ManualCropping.tsx`
3. **Image Compression** - `src/components/modes/ImageCompression.tsx`
4. **Image Enhancement** - `src/components/modes/ImageEnhancement.tsx`
5. **Rotate & Flip** - `src/components/modes/RotateFlip.tsx`

### Image Processing Engine

- **Core**: `src/lib/imageProcessor.ts` (872 lines)
- **Engine**: Sharp.js (libvips)
- **AI**: Google Gemini 2.5 Flash Image
- **ML Models**: ONNX Runtime (NAFNet for enhancement)
- **Optimization**: MozJPEG, OptiPNG, WebP

### Client-Side Libraries

- **JSZip**: Batch download ZIP generation
- **React Dropzone**: File upload
- **Canvas API**: Image manipulation and compression
- **FormData**: Multipart form uploads

---

## ACCESSIBILITY FEATURES

### Keyboard Navigation

- **Tab**: Navigate between controls
- **Enter/Space**: Activate buttons
- **Arrow Keys**: Adjust sliders
- **Shift + Arrow**: Fine-grained slider control
- **Esc**: Close dialogs/modals

### Screen Reader Support

- **ARIA Labels**: All interactive elements labeled
- **Status Announcements**: Processing state changes announced
- **Error Messages**: Read aloud when they appear
- **Progress Updates**: Batch processing progress announced

### Visual Accessibility

- **High Contrast**: All text meets WCAG AA standards
- **Focus Indicators**: Visible focus rings on all interactive elements
- **Color Independence**: No information conveyed by color alone
- **Responsive**: Works on all screen sizes

---

## MOBILE & TOUCH SUPPORT

### Touch Gestures

- **Swipe**: Move comparison slider
- **Pinch to Zoom**: Manual cropping canvas
- **Drag**: Position image in crop canvas
- **Tap**: Select modes, buttons, images

### Mobile Optimizations

- **Responsive Layout**: All screens adapt to mobile
- **Touch Targets**: Minimum 44px tap targets
- **No Hover Dependencies**: All actions work via tap
- **Mobile Upload**: Native file picker integration

---

## BROWSER COMPATIBILITY

### Supported Browsers

- ✅ **Chrome/Edge** (Chromium): All features
- ✅ **Firefox**: All features
- ✅ **Safari**: All features (iOS 14+)
- ✅ **Mobile Browsers**: All features

### Required Browser Features

- **Canvas API**: Image manipulation
- **File API**: File upload handling
- **Fetch API**: API requests
- **Base64 Encoding**: Image data transmission
- **Modern JavaScript**: ES2020+ features

---

This comprehensive user flow documentation reflects the **exact current implementation** including all 5 modes, 7 API routes, batch support status, UI restrictions, and technical capabilities.
