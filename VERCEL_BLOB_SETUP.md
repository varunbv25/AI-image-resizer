# Vercel Blob Setup Guide

This application uses **Vercel Blob Storage** to bypass the 4.5MB serverless function limit and support image uploads of any size.

## Architecture

### Traditional Approach (❌ Limited to ~3MB)
```
Client → Serverless Function (4.5MB limit) → Processing
```
Files must be sent through the serverless function, limited by Vercel's 4.5MB payload limit.

### New Blob Approach (✅ Unlimited Size)
```
Client → Request Upload Token → Vercel Function (small request)
       ↓
Client → Upload File → Vercel Blob Storage (direct upload, no size limit)
       ↓
Client → Send Blob URL → Vercel Function → Fetch & Process
       ↓
Vercel Function → Delete Blob → Cleanup
```

The file never passes through the serverless function, allowing uploads of any size!

## Setup Steps

### 1. Install Dependencies

Already installed:
```bash
npm install @vercel/blob
```

### 2. Configure Environment Variables

Add to your `.env.local` file:

```bash
# Vercel Blob Storage (automatically configured on Vercel)
BLOB_READ_WRITE_TOKEN=your_token_here
```

**Important:** When deployed to Vercel, this token is automatically set. For local development:

1. Go to your Vercel project dashboard
2. Navigate to **Storage** → **Create Database** → **Blob**
3. Copy the `BLOB_READ_WRITE_TOKEN` from the environment variables
4. Add it to your local `.env.local` file

### 3. How It Works

#### Client-Side (Direct Upload)
The application uses the `useFileUploadWithBlob` hook:

```typescript
// src/hooks/useFileUploadWithBlob.ts
import { upload } from '@vercel/blob/client';

const blob = await upload(file.name, file, {
  access: 'public',
  handleUploadUrl: '/api/blob/upload-token',
  onUploadProgress: (progressEvent) => {
    // Track upload progress
  },
});
```

#### Server-Side (Token Generation)
```typescript
// src/app/api/blob/upload-token/route.ts
import { handleUpload } from '@vercel/blob/client';

export async function POST(request: NextRequest) {
  const jsonResponse = await handleUpload({
    body: request.body,
    request,
    onBeforeGenerateToken: async (pathname) => {
      // Validate file type
      return {
        allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
      };
    },
  });
  return NextResponse.json(jsonResponse);
}
```

#### Processing (Fetch from Blob)
```typescript
// src/app/api/compress-image/route.ts
if (blobUrl) {
  const response = await fetch(blobUrl);
  const arrayBuffer = await response.arrayBuffer();
  buffer = Buffer.from(arrayBuffer);
}
```

#### Cleanup (Delete After Processing)
```typescript
// Automatic cleanup after processing
import { del } from '@vercel/blob';
await del(blobUrl);
```

## API Routes

### `/api/blob/upload-token` (POST)
Generates a secure upload URL for client-side uploads.

**Request:**
```json
{
  "filename": "image.jpg"
}
```

**Response:**
```json
{
  "url": "https://blob.vercel-storage.com/...",
  "uploadUrl": "https://..."
}
```

### `/api/blob/fetch` (POST)
Fetches blob content for server-side processing (optional helper).

**Request:**
```json
{
  "blobUrl": "https://blob.vercel-storage.com/..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "imageData": "base64...",
    "mimetype": "image/jpeg",
    "size": 1234567
  }
}
```

### `/api/blob/delete` (POST)
Deletes a blob from storage.

**Request:**
```json
{
  "blobUrl": "https://blob.vercel-storage.com/..."
}
```

## Updated Processing Routes

All processing routes now support both blob URLs and legacy base64 data:

### `/api/compress-image` (POST)
```json
{
  "blobUrl": "https://blob.vercel-storage.com/...",  // New
  "imageData": "base64...",                           // Legacy fallback
  "quality": 80,
  "originalSize": 5000000
}
```

### `/api/process` (POST) - AI Resizing
```json
{
  "blobUrl": "https://blob.vercel-storage.com/...",  // New
  "imageData": "base64...",                           // Legacy fallback
  "targetDimensions": { "width": 1920, "height": 1080 },
  "strategy": { "type": "ai" }
}
```

## File Size Limits

| Method | Max Upload Size | Notes |
|--------|----------------|-------|
| **Legacy (Base64)** | ~3MB | Limited by 4.5MB serverless payload + Base64 overhead |
| **Blob Upload** | **Unlimited** | Direct client upload, no serverless limit |

## Benefits

✅ **No Size Limits** - Upload images of any size
✅ **Better Performance** - Direct uploads to blob storage
✅ **Automatic Cleanup** - Blobs deleted after processing
✅ **Backward Compatible** - Legacy base64 still supported
✅ **Progress Tracking** - Real-time upload progress

## Testing

Test with large files:

```bash
# Create a 50MB test image
convert -size 10000x10000 xc:white test-50mb.jpg

# Upload through the application
# Should now work without "FUNCTION_PAYLOAD_TOO_LARGE" error
```

## Troubleshooting

### "BLOB_READ_WRITE_TOKEN not found"
- Make sure you've created a Blob store in your Vercel project
- Copy the token to `.env.local` for local development
- Token is automatically set when deployed to Vercel

### "Failed to fetch image from blob storage"
- Check that the blob URL is valid and accessible
- Ensure the blob hasn't expired (default: 1 hour for upload URLs)
- Verify network connectivity to Vercel Blob storage

### "Invalid file type"
- Only JPEG, PNG, WebP, and SVG are supported
- Check the file extension and MIME type

## Cost Considerations

Vercel Blob Storage pricing:
- **Hobby Plan**: 1GB storage, 100GB bandwidth/month (included)
- **Pro Plan**: 100GB storage, 1TB bandwidth/month (included)
- **Enterprise**: Custom limits

Since we delete blobs after processing, storage usage is minimal. Main cost is bandwidth.

## Security

- Upload tokens are time-limited (default: 1 hour)
- File type validation on server-side
- Public read access only (no write)
- Automatic cleanup prevents blob accumulation