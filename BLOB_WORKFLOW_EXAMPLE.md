# Vercel Blob Upload Workflow - Implementation Guide

This document explains how the 3-step Vercel Blob workflow is implemented to handle large files (>4.5MB) without hitting serverless function payload limits.

## Architecture Overview

```
┌─────────────┐
│   Client    │
│  (Browser)  │
└──────┬──────┘
       │
       │ Step 1: Request Upload Token
       │ POST /api/get-upload-token
       │ Payload: { filename, mimetype }
       ▼
┌─────────────────────────┐
│  Vercel API Function    │
│  /api/get-upload-token  │
│  (generates token)      │
└──────┬──────────────────┘
       │
       │ Returns: { url, token }
       │
       ▼
┌─────────────┐
│   Client    │
│  Uploads    │
│  directly   │
│  to Blob    │
└──────┬──────┘
       │
       │ Step 2: Direct Upload to Vercel Blob
       │ (multipart, bypasses serverless limit)
       │
       ▼
┌─────────────────────────┐
│   Vercel Blob Storage   │
│  (file stored temp)     │
└──────┬──────────────────┘
       │
       │ Returns: { blobUrl }
       │
       ▼
┌─────────────┐
│   Client    │
│  Requests   │
│  Processing │
└──────┬──────┘
       │
       │ Step 3: Request Processing
       │ POST /api/process-from-blob
       │ Payload: { blobUrl, operation, params }
       ▼
┌─────────────────────────────┐
│  Vercel API Function        │
│  /api/process-from-blob     │
│  1. Downloads from blob     │
│  2. Processes with sharp.js │
│  3. Deletes blob            │
│  4. Returns base64 result   │
└──────┬──────────────────────┘
       │
       │ Returns: { imageData, metadata }
       │
       ▼
┌─────────────┐
│   Client    │
│  Displays   │
│   Result    │
└─────────────┘
```

## Implementation

### Step 1 & 2: Upload to Blob (Client-Side)

```typescript
import { useBlobUpload } from '@/hooks/useBlobUpload';

function MyComponent() {
  const { uploadToBlob, isUploading, uploadProgress } = useBlobUpload();

  const handleFileSelect = async (file: File) => {
    try {
      // Steps 1 & 2: Upload directly to Vercel Blob
      const result = await uploadToBlob(file);

      // result.url is the blob URL to use for processing
      console.log('Uploaded to:', result.url);

      // Now proceed to Step 3...
    } catch (error) {
      console.error('Upload failed:', error);
    }
  };

  return (
    <div>
      {isUploading && <p>Uploading: {uploadProgress}%</p>}
      <input type="file" onChange={(e) => {
        if (e.target.files?.[0]) {
          handleFileSelect(e.target.files[0]);
        }
      }} />
    </div>
  );
}
```

### Step 3: Process from Blob (Client-Side)

```typescript
const processImage = async (blobUrl: string) => {
  const response = await fetch('/api/process-from-blob', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      blobUrl: blobUrl,
      operation: 'resize', // or 'crop', 'compress', etc.
      params: {
        targetDimensions: { width: 1080, height: 1920 },
        quality: 80,
        format: 'jpeg',
      },
    }),
  });

  const result = await response.json();

  if (result.success) {
    // result.data.imageData contains the processed image (base64)
    // Blob has been automatically deleted
    console.log('Processed image:', result.data);
  }
};
```

### Complete Workflow Helper

For convenience, use the `uploadAndProcessWithBlob` helper:

```typescript
import { uploadAndProcessWithBlob } from '@/lib/blobUploadWorkflow';

const processLargeImage = async (file: File) => {
  try {
    const result = await uploadAndProcessWithBlob(
      file,
      {
        operation: 'resize',
        params: {
          targetDimensions: { width: 1080, height: 1920 },
          quality: 80,
          format: 'jpeg',
        },
      },
      {
        onProgress: (progress) => {
          console.log(`Upload: ${progress}%`);
        },
      }
    );

    // result.imageData contains the processed image (base64)
    // Blob has been automatically deleted
    console.log('Done!', result);
  } catch (error) {
    console.error('Failed:', error);
  }
};
```

## API Routes

### `/api/get-upload-token`

Generates a secure upload token for direct client-to-blob uploads.

**Request:**
```json
{
  "pathname": "image.jpg"
}
```

**Response:**
```json
{
  "url": "https://blob.vercel-storage.com/upload-url",
  "token": "vercel_blob_rw_..."
}
```

### `/api/process-from-blob`

Downloads image from blob, processes it, and deletes the blob.

**Request:**
```json
{
  "blobUrl": "https://blob.vercel-storage.com/image-abc123.jpg",
  "operation": "resize",
  "params": {
    "targetDimensions": { "width": 1080, "height": 1920 },
    "quality": 80,
    "format": "jpeg"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "imageData": "base64-encoded-image-data",
    "metadata": {
      "width": 1080,
      "height": 1920,
      "format": "jpeg",
      "size": 125840
    },
    "filename": "processed-image.jpeg"
  }
}
```

## Supported Operations

- `resize` - Resize image to target dimensions
- `crop` - Crop image to target dimensions
- `compress` - Compress image to target size/quality
- `enhance` - Enhance image quality (AI/sharp)
- `rotate-flip` - Rotate or flip image
- `convert-format` - Convert image format

## Benefits

1. **No 4.5MB limit** - Files upload directly to blob storage
2. **Fast uploads** - Client uploads directly, no server proxy
3. **Automatic cleanup** - Blobs deleted immediately after processing
4. **No permanent storage** - Temporary storage only, no database needed
5. **Progress tracking** - Real upload progress from blob client
6. **Secure** - Time-limited upload tokens
7. **Scalable** - Handles files up to 50MB (configurable)

## Error Handling

The workflow includes automatic cleanup on errors:

```typescript
try {
  // Upload and process
  const result = await uploadAndProcessWithBlob(file, options);
} catch (error) {
  // Blob is automatically deleted even if processing fails
  console.error('Error:', error.message);
}
```

## Environment Variables

Required in `.env`:

```bash
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
```

This token is automatically set by Vercel when you enable Blob storage in your project.