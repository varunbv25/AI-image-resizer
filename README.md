# AI-Powered Image Resizer

An intelligent image resizing and optimization tool that uses AI-powered canvas extension to create natural-looking results when extending images beyond their original dimensions.

## Features

- **AI-Powered Canvas Extension**: Uses Google's Gemini 2.5 Flash Image model to intelligently extend image backgrounds
- **Smart Resizing**: Maintains subject positioning while extending canvas areas
- **Multiple Aspect Ratios**: Pre-configured ratios for Instagram Stories (9:16), portraits (2:3), and custom dimensions
- **Fallback Strategies**: Automatic fallback to color-fill and smart cropping when AI is unavailable
- **Web Optimization**: Outputs web-optimized images in JPEG, PNG, or WebP formats
- **Real-time Preview**: See results before processing
- **Drag & Drop Interface**: Easy file upload with validation

## Technology Stack

- **Frontend**: Next.js 15 with TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API routes
- **AI**: Google Gemini 2.5 Flash Image model
- **Image Processing**: Sharp.js
- **File Handling**: Formidable
- **UI Components**: Radix UI primitives

## Getting Started

### Prerequisites

- Node.js 18+
- Google Gemini API key ([Get one here](https://aistudio.google.com/))

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env.local
```

3. Add your Gemini API key to `.env.local`:
```
GEMINI_API_KEY=your_gemini_api_key_here
```

4. Start the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. **Upload Image**: Drag and drop or click to select an image (JPEG, PNG, WebP up to 10MB)
2. **Select Dimensions**: Choose from preset aspect ratios or enter custom dimensions
3. **Process**: Click "Resize Image" to start AI-powered processing
4. **Download**: Download the optimized result

## API Endpoints

- `POST /api/upload` - Upload and validate image files
- `POST /api/process` - Process images with AI extension or fallback methods

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Add your `GEMINI_API_KEY` to Vercel environment variables
4. Deploy!

### Other Platforms

The application can be deployed to any platform that supports Next.js:
- Netlify
- Railway
- Render
- AWS
- Google Cloud

## Configuration

### Environment Variables

- `GEMINI_API_KEY` - Your Google Gemini API key (required for AI features)

### Supported Formats

- **Input**: JPEG, PNG, WebP (up to 10MB)
- **Output**: JPEG, PNG, WebP (web-optimized)

### Processing Strategies

1. **AI Extension** (Primary): Uses Gemini 2.5 Flash Image for intelligent background extension
2. **Color Fill** (Fallback): Detects and extends with dominant background colors
3. **Smart Crop** (Fallback): Centers and crops subject for best fit

## Architecture

```
src/
├── app/
│   ├── api/          # API routes (upload, process)
│   └── page.tsx      # Main application page
├── components/       # React components
│   ├── ui/          # shadcn/ui components
│   ├── ImageUploader.tsx
│   ├── DimensionSelector.tsx
│   ├── ImagePreview.tsx
│   └── ProcessingStatus.tsx
├── hooks/           # Custom React hooks
├── lib/             # Utility libraries
│   ├── gemini.ts    # Gemini AI integration
│   ├── imageProcessor.ts # Image processing logic
│   ├── fileHandler.ts    # File upload handling
│   └── constants.ts      # App constants
└── types/           # TypeScript type definitions
```

---

**Note**: This application requires a Google Gemini API key for AI-powered features. Fallback methods will be used if the API is unavailable.
