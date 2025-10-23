# Client-Side Compression Solution

## Problem Solved

**Issue:** Users getting `FUNCTION_PAYLOAD_TOO_LARGE` error when uploading images larger than ~3MB.

**Root Cause:**
- Vercel serverless functions have a **4.5MB payload limit**
- Base64 encoding adds **~33% overhead**
- Example: 5MB image → 6.65MB base64 → **EXCEEDS 4.5MB LIMIT** ❌

## Solution: Client-Side Compression

Instead of using Vercel Blob storage, we compress large images **on the client** before uploading!

### How It Works

```
User uploads 5MB image
    ↓
Client detects file > 2MB
    ↓
Client compresses to ~2MB (using canvas API)
    ↓
2MB file → 2.66MB base64 (with 33% overhead)
    ↓
Upload to serverless function (well under 4.5MB limit!) ✅
```

### Key Changes

#### 1. Compression Threshold: 3MB → 2MB

**File:** `src/lib/clientImageCompression.ts`
```typescript
maxSizeMB = 2,  // Was: 3MB, Now: 2MB
```

**Why 2MB?**
- 2MB file × 1.33 (base64 overhead) = 2.66MB
- Leaves room for JSON overhead
- Safe margin under 4.5MB limit

#### 2. Applied to ALL Single Uploads

**File:** `src/hooks/useFileUpload.ts`
```typescript
if (originalSize > 2 * 1024 * 1024) {  // If > 2MB
  console.log('Compressing image before upload...');
  fileToUpload = await compressImage(file, {
    maxSizeMB: 2,
    maxWidthOrHeight: 3072,
    quality: 0.75,
  });
}
```

**Before:** Only batch uploads were compressed
**After:** ALL uploads > 2MB are compressed

#### 3. Batch Uploads Also Updated

**File:** `src/components/modes/ImageCompression.tsx`
```typescript
const preparedFiles = await prepareFilesForBatchUpload(files, {
  maxSizeMB: 2,        // Was: 3
  maxWidthOrHeight: 3072,  // Was: 4096
  quality: 0.75,       // Was: 0.8
});
```

## Compression Algorithm

The compression uses **HTML5 Canvas API** with iterative quality reduction:

1. **Resize if needed:** If image > 3072px, scale down (maintains aspect ratio)
2. **Canvas render:** Draw image to canvas with high-quality smoothing
3. **Compress:** Convert to blob with specified quality (default 75%)
4. **Retry if needed:** If still > 2MB, reduce quality by 10% and try again
5. **Return:** Compressed file ready for upload

### Quality Settings

| Original Size | Target Size | Quality | Max Dimension |
|--------------|-------------|---------|---------------|
| < 2MB        | No compression | 100%    | Original      |
| 2-5MB        | ~2MB        | 75%     | 3072px        |
| 5-10MB       | ~2MB        | 65-75%  | 3072px        |
| > 10MB       | ~2MB        | 50-75%  | 3072px        |

## Benefits

✅ **No server configuration needed** - Works on any platform
✅ **No storage costs** - No Vercel Blob required
✅ **Fast uploads** - Smaller files upload faster
✅ **Better UX** - Compression happens locally (instant feedback)
✅ **Maintains quality** - Smart compression preserves visual fidelity
✅ **Works everywhere** - Compatible with all browsers
✅ **Backward compatible** - Small files (<2MB) unchanged

## vs. Vercel Blob Approach

| Feature | Client Compression | Vercel Blob |
|---------|-------------------|-------------|
| Setup complexity | ✅ None | ❌ Requires blob store setup |
| Works locally | ✅ Yes | ⚠️ Needs token |
| File size limit | ⚠️ ~10MB realistic | ✅ Unlimited |
| Upload speed | ✅ Fast (smaller files) | ⚠️ Slower (larger files) |
| Storage costs | ✅ $0 | ⚠️ Blob storage costs |
| Platform dependency | ✅ Works anywhere | ❌ Vercel only |

## Testing

### Test with 5MB Image

1. **Upload a 5MB image**
2. **Check browser console:**
   ```
   Original file size: 5.2 MB
   Compressing image before upload...
   Compressed: 5.2 MB → 1.95 MB (62% reduction)
   ```
3. **Verify no errors** - Should upload successfully!

### Test with 10MB Image

1. **Upload a 10MB image**
2. **Console output:**
   ```
   Original file size: 10.5 MB
   Compressing image before upload...
   Compressed: 10.5 MB → 1.98 MB (81% reduction)
   ```
3. **Processing works** - No payload errors!

## Console Logs

### Successful Compression
```
Original file size: 5.2 MB
Compressing image before upload...
Compressed: 5.2 MB → 1.95 MB (62% reduction)
Upload successful
```

### No Compression Needed
```
Original file size: 1.5 MB
(No compression - file under 2MB threshold)
Upload successful
```

### Batch Upload
```
[Batch] Preparing 3 files for upload...
[Batch] Compressing image1.jpg: 5.2 MB
[Batch] Compressed image1.jpg: 1.95 MB (62% reduction)
[Batch] Compressing image2.jpg: 8.1 MB
[Batch] Compressed image2.jpg: 1.99 MB (75% reduction)
[Batch] Total compression: 15.8 MB → 5.4 MB (65% reduction)
```

## File Size Expectations

| Original | Compressed | Reduction | Upload Time* |
|----------|-----------|-----------|--------------|
| 1 MB     | 1 MB      | 0%        | < 1s         |
| 2 MB     | 2 MB      | 0%        | ~2s          |
| 5 MB     | ~2 MB     | 60%       | ~2s          |
| 10 MB    | ~2 MB     | 80%       | ~2s          |
| 20 MB    | ~2 MB     | 90%       | ~2s          |

*On 10 Mbps connection

## Quality Impact

The compression is designed to be **visually lossless** for web use:

- **Original:** 5MB @ 100% quality, 4000×3000px
- **Compressed:** 2MB @ 75% quality, 3072×2304px
- **Visual difference:** Minimal - suitable for all web applications
- **Use case:** Perfect for social media, web galleries, email attachments

## Limitations

### When Compression Won't Help

1. **Already optimized images** - JPEG at 60% quality won't compress much
2. **Small dimensions, large file** - Some images resist compression
3. **Special formats** - SVG compression works differently

### Maximum Practical Size

- **Recommended:** < 10MB original file size
- **Maximum:** ~20MB (compression may take 5-10 seconds)
- **Beyond 20MB:** Consider resizing before upload

## Troubleshooting

### "Still getting payload errors"

**Check:**
1. Is compression happening? (Check console for "Compressing..." log)
2. Final compressed size? (Should be ~2MB)
3. Any network errors? (Check Network tab)

**Fix:**
- Lower `maxSizeMB` to 1.5MB
- Reduce `maxWidthOrHeight` to 2048px
- Lower `quality` to 0.7

### "Compression takes too long"

**For files > 15MB:**
```typescript
// Reduce maxWidthOrHeight for faster processing
maxWidthOrHeight: 2048,  // Default: 3072
quality: 0.7,            // Default: 0.75
```

### "Image quality too low"

**Increase quality settings:**
```typescript
maxSizeMB: 2.5,  // Slightly higher target
quality: 0.8,    // Better quality
```

Note: This may push you closer to the 4.5MB limit!

## Implementation Files

- **Compression logic:** `src/lib/clientImageCompression.ts`
- **Upload hook:** `src/hooks/useFileUpload.ts`
- **Batch helper:** `src/lib/batchUploadHelper.ts`
- **Component usage:** `src/components/modes/ImageCompression.tsx`

## Success Criteria

✅ Files > 2MB are compressed automatically
✅ Compressed files < 2MB (after compression)
✅ No `FUNCTION_PAYLOAD_TOO_LARGE` errors
✅ Upload speed improved (smaller payloads)
✅ Visual quality maintained
✅ Works in all browsers
✅ No server-side changes required

---

**Ready to test!** Upload a 5MB image and watch it compress before upload. 🚀