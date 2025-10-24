# Vercel Blob Client Upload Setup Guide

## Overview

This application now supports uploading large files (>3MB) using Vercel Blob's client upload feature. This bypasses the 4.5MB Vercel function payload limit by uploading files directly from the browser to Vercel Blob storage, where they are processed and immediately deleted.

## Architecture

### How It Works

1. **Client-Side Upload**: Files larger than 3MB are uploaded directly from the browser to Vercel Blob storage
2. **Token Exchange**: The client first requests a secure upload token from your API route
3. **Direct Upload**: The file is uploaded directly to Vercel Blob (bypassing your serverless function)
4. **Processing**: Once uploaded, your server fetches, processes, and extracts image data
5. **Immediate Deletion**: The file is immediately deleted from Blob storage after processing
6. **Result Retrieval**: The client polls for the processed result

### File Flow

```
┌─────────────┐
│   Browser   │
│  (>3MB file)│
└──────┬──────┘
       │
       │ 1. Request upload token
       ├──────────────────────────────────┐
       │                                  │
       │                         ┌────────▼─────────┐
       │                         │  /api/blob-upload│
       │                         │  (Token Generator)│
       │                         └────────┬─────────┘
       │                                  │
       │ 2. Get secure token              │
       │◄─────────────────────────────────┘
       │
       │ 3. Upload directly to Blob
       ├──────────────────────────────────┐
       │                                  │
       │                         ┌────────▼─────────┐
       │                         │  Vercel Blob     │
       │                         │  Storage         │
       │                         └────────┬─────────┘
       │                                  │
       │                                  │ 4. Trigger onUploadCompleted
       │                         ┌────────▼─────────┐
       │                         │  Server Callback │
       │                         │  - Fetch file    │
       │                         │  - Process image │
       │                         │  - Store result  │
       │                         │  - Delete blob   │
       │                         └────────┬─────────┘
       │                                  │
       │ 5. Poll for result               │
       │◄─────────────────────────────────┘
       │
       │ 6. Get processed data
       ▼
┌─────────────┐
│   Display   │
└─────────────┘
```

## Setup Instructions

### 1. Create a Vercel Blob Store

1. Go to your [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Navigate to the **Storage** tab
4. Click **Create Database** → **Blob**
5. Follow the prompts to create your Blob store

Once created, Vercel automatically adds the `BLOB_READ_WRITE_TOKEN` environment variable to your project.

### 2. Configure Local Development

For local development, you need to copy the token to your local environment:

1. In the Vercel Dashboard, go to **Settings** → **Environment Variables**
2. Find and copy the `BLOB_READ_WRITE_TOKEN` value
3. Add it to your `.env.local` file:

```env
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxxxxxxxxx
```

### 3. Deploy to Vercel

The environment variable is automatically available in production. No additional configuration needed!

## Implementation Details

### Key Files

1. **[src/app/api/blob-upload/route.ts](src/app/api/blob-upload/route.ts)** - API route handling token generation and upload completion
2. **[src/lib/blobUploadHelper.ts](src/lib/blobUploadHelper.ts)** - Client-side upload utility
3. **[src/hooks/useFileUpload.ts](src/hooks/useFileUpload.ts)** - React hook with automatic blob upload for large files
4. **[src/components/ImageUploader.tsx](src/components/ImageUploader.tsx)** - Upload component with progress indicator

### Upload Strategy

The application automatically chooses the best upload method:

- **Files ≤ 3MB**: Traditional FormData upload to `/api/upload`
- **Files > 3MB**: Vercel Blob client upload (bypasses function payload limit)

### API Route: `/api/blob-upload`

**POST** - Token generation and upload handling
- Generates secure upload token
- Validates file types (JPEG, PNG, WebP, SVG)
- Sets 50MB maximum file size
- Processes and deletes file in `onUploadCompleted` callback

**GET** - Result retrieval
- Polls for processed upload result
- Returns image data and dimensions
- Automatically retries up to 30 times (30 seconds)

### Client-Side Usage

The implementation is transparent - simply use the existing `useFileUpload` hook:

```tsx
import { useFileUpload } from '@/hooks/useFileUpload';

function MyComponent() {
  const { uploadFile, isUploading, uploadProgress, uploadedImage } = useFileUpload();

  // Files >3MB automatically use blob upload
  const handleUpload = (file: File) => {
    uploadFile(file);
  };

  return (
    <ImageUploader
      onImageUpload={handleUpload}
      isUploading={isUploading}
      uploadProgress={uploadProgress} // Shows progress for large files
    />
  );
}
```

## Benefits

✅ **No File Size Limit**: Upload files up to 50MB (configurable)
✅ **Bypasses Function Limits**: Direct upload avoids Vercel's 4.5MB payload limit
✅ **Secure**: Token-based authentication prevents unauthorized uploads
✅ **No Storage Costs**: Files are immediately deleted after processing
✅ **Progress Tracking**: Real-time upload progress for better UX
✅ **Automatic**: Seamlessly switches between upload methods based on file size

## Production Considerations

### In-Memory Storage Limitation

The current implementation uses in-memory storage (`Map`) to temporarily store upload results. This has limitations:

- ⚠️ **Not suitable for production at scale**
- ⚠️ **Data lost on serverless function cold starts**
- ⚠️ **Not shared across multiple function instances**

### Recommended Production Solution

For production, replace the in-memory store with:

**Option 1: Redis** (Recommended)
```typescript
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!,
});

// Store result
await redis.setex(blob.url, 300, JSON.stringify(uploadData)); // 5 min TTL

// Retrieve result
const result = await redis.get(blob.url);
```

**Option 2: Database** (Vercel Postgres, Supabase, etc.)
```typescript
// Store with expiration timestamp
await db.uploadResults.create({
  data: {
    blobUrl: blob.url,
    imageData: uploadData,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  },
});
```

**Option 3: Vercel KV** (Simplest for Vercel)
```typescript
import { kv } from '@vercel/kv';

// Store result
await kv.set(blob.url, uploadData, { ex: 300 }); // 5 min TTL

// Retrieve result
const result = await kv.get(blob.url);
```

### Environment Variables

Ensure these are set in your Vercel project:

```env
# Required
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxxxx

# Optional (for AI features)
GEMINI_API_KEY=your_gemini_api_key
```

## Monitoring & Debugging

### Logs to Watch

The implementation includes detailed logging:

```
✓ Upload completed to blob: https://...
✓ File fetched from blob, size: 5242880 bytes
✓ Image dimensions: { width: 4000, height: 3000 }
✓ Upload result stored for: https://...
✓ File successfully deleted from blob: https://...
```

### Common Issues

**1. Token not found error**
- **Cause**: `BLOB_READ_WRITE_TOKEN` not set
- **Solution**: Create Blob store in Vercel Dashboard and copy token to `.env.local`

**2. Upload result not found**
- **Cause**: Processing took too long or function cold start cleared memory
- **Solution**: Implement Redis/database for production (see above)

**3. File type not allowed**
- **Cause**: Unsupported file format
- **Solution**: Add format to `allowedContentTypes` in [src/app/api/blob-upload/route.ts:44](src/app/api/blob-upload/route.ts#L44)

## Testing

### Test Local Upload

```bash
# Start dev server
npm run dev

# Upload a large file (>3MB)
# Watch browser console for:
#   "Using Vercel Blob client upload for large file..."
#   "Blob upload completed: https://..."
#   "Upload result retrieved for: filename.jpg"
```

### Test Production Upload

After deploying to Vercel, monitor the function logs:
1. Vercel Dashboard → Your Project → Logs
2. Filter by `/api/blob-upload`
3. Verify the upload, process, and delete cycle

## Migration Guide

### From Traditional Upload

No code changes needed! The `useFileUpload` hook automatically:
1. Detects file size
2. Uses blob upload for files >3MB
3. Falls back to traditional upload for smaller files

### Adjusting Threshold

To change the 3MB threshold, edit [src/lib/blobUploadHelper.ts:98](src/lib/blobUploadHelper.ts#L98):

```typescript
export function shouldUseBlobUpload(fileSize: number): boolean {
  const threshold = 5 * 1024 * 1024; // Change to 5MB
  return fileSize > threshold;
}
```

## Security

### Authentication

The current implementation allows all uploads. **For production**, add authentication in [src/app/api/blob-upload/route.ts:38](src/app/api/blob-upload/route.ts#L38):

```typescript
onBeforeGenerateToken: async (pathname) => {
  // Verify user session
  const session = await getServerSession();
  if (!session) {
    throw new Error('Unauthorized');
  }

  return {
    allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
    maximumSizeInBytes: 50 * 1024 * 1024,
    addRandomSuffix: true,
    tokenPayload: JSON.stringify({
      userId: session.user.id,
      uploadedAt: Date.now(),
    }),
  };
},
```

## Resources

- [Vercel Blob Documentation](https://vercel.com/docs/storage/vercel-blob)
- [Vercel Blob Client Uploads](https://vercel.com/docs/storage/vercel-blob/client-upload)
- [@vercel/blob Package](https://www.npmjs.com/package/@vercel/blob)

## Support

For issues or questions about this implementation:
1. Check the logs in Vercel Dashboard
2. Verify `BLOB_READ_WRITE_TOKEN` is set correctly
3. Review the [Common Issues](#common-issues) section above
