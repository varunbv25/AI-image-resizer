# Testing Vercel Blob Upload Implementation

## Quick Test Checklist

### Before Deploying

1. **Verify Environment Variables**
```bash
# Check .env.local has the blob token
cat .env.local | grep BLOB_READ_WRITE_TOKEN
```

2. **Start Development Server**
```bash
npm run dev
```

3. **Test Small File (< 3MB)**
   - Upload a 2MB image
   - Should work with both old and new methods
   - Verify processing completes successfully

4. **Test Medium File (3-10MB)**
   - Upload a 5MB image (previously failed!)
   - Should upload via blob without errors
   - Verify no `FUNCTION_PAYLOAD_TOO_LARGE` error
   - Check console for "Fetching image from blob" log

5. **Test Large File (> 10MB)**
   - Upload a 20MB+ image
   - Watch upload progress indicator
   - Verify processing completes
   - Check blob is cleaned up after processing

### After Deploying to Vercel

1. **Create Blob Store**
   - Vercel Dashboard → Your Project → Storage → Blob
   - Click "Create Database" → "Blob"
   - Token is automatically added to environment variables

2. **Deploy to Vercel**
```bash
git add .
git commit -m "Add Vercel Blob support for unlimited file uploads"
git push
```

3. **Verify Deployment**
   - Check Vercel deployment logs
   - Verify `BLOB_READ_WRITE_TOKEN` is set in environment variables
   - Test with production URL

4. **Production Tests**
   - Test Image Compression mode with 5MB file
   - Test AI Resizing mode with 10MB file
   - Verify upload progress shows
   - Check processing completes successfully

## Test Files

Create test images of various sizes:

```bash
# Using ImageMagick (if installed)
convert -size 1000x1000 xc:white test-1mb.jpg
convert -size 2000x2000 xc:white test-5mb.jpg
convert -size 3000x3000 xc:white test-15mb.jpg
convert -size 5000x5000 xc:white test-50mb.jpg
```

Or download sample large images:
- [Unsplash](https://unsplash.com) - High-resolution photos
- [Pexels](https://pexels.com) - Free stock photos
- Use your phone to take high-res photos (usually 3-10MB)

## Expected Behavior

### Image Compression Mode

**Small Files (< 3MB):**
- ✅ May use base64 (legacy) or blob (new)
- ✅ Should process successfully
- ✅ No errors in console

**Medium Files (3-10MB):**
- ✅ **Automatic blob upload**
- ✅ Upload progress indicator shows
- ✅ Console log: "Fetching image from blob: https://..."
- ✅ Console log: "Cleaned up blob: https://..."
- ✅ Processing completes successfully
- ✅ **No FUNCTION_PAYLOAD_TOO_LARGE error**

**Large Files (> 10MB):**
- ✅ Direct blob upload
- ✅ Upload may take a few seconds (progress shown)
- ✅ Processing works normally
- ✅ Download works

### AI Resizing Mode

**With Blob Support:**
- ✅ Accepts files of any size
- ✅ Uploads to blob first
- ✅ Sends blob URL to `/api/process`
- ✅ Server fetches and processes
- ✅ Cleanup after completion

## Console Logs to Look For

### Successful Blob Upload
```
Uploading file: image.jpg (5.2MB)
Upload progress: 100%
Blob uploaded successfully: https://blob.vercel-storage.com/...
Upload complete
```

### Server Processing
```
Fetching image from blob: https://blob.vercel-storage.com/...
Compression complete
Cleaned up blob: https://blob.vercel-storage.com/...
```

## Common Issues

### Issue: "BLOB_READ_WRITE_TOKEN not found"
**Fix:**
```bash
# Local dev: Add to .env.local
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...

# Vercel: Create blob store in dashboard
```

### Issue: Upload works but "Failed to fetch image from blob storage"
**Possible causes:**
1. Blob URL expired (default: 1 hour)
2. Network connectivity issue
3. Blob was already deleted

**Fix:**
- Re-upload the file
- Check network connection
- Verify blob URL format

### Issue: Still getting payload errors
**Check:**
1. Are you using `useFileUploadWithBlob` hook?
2. Is component passing `blobUrl` to API?
3. Check browser console for errors

### Issue: Slow uploads
**Expected:**
- 5MB file: ~2-5 seconds
- 20MB file: ~10-20 seconds
- 50MB file: ~30-60 seconds

Depends on your internet upload speed.

## Performance Benchmarks

### Expected Upload Times (on 10 Mbps connection)

| File Size | Upload Time | Processing Time | Total |
|-----------|-------------|-----------------|-------|
| 1 MB      | < 1s        | 1-2s            | ~2s   |
| 5 MB      | 2-4s        | 2-3s            | ~6s   |
| 10 MB     | 5-8s        | 3-5s            | ~12s  |
| 20 MB     | 10-15s      | 5-8s            | ~20s  |
| 50 MB     | 30-40s      | 10-15s          | ~50s  |

## Verification Checklist

After testing, verify:

- [ ] Small files (< 3MB) work
- [ ] Medium files (3-10MB) work without payload errors
- [ ] Large files (> 10MB) work
- [ ] Upload progress shows correctly
- [ ] Processing completes successfully
- [ ] Download works
- [ ] Console shows blob cleanup logs
- [ ] No errors in browser console
- [ ] No errors in Vercel logs (if deployed)

## Rollback Plan

If issues occur, you can temporarily disable blob uploads:

1. Comment out blob upload in `ImageCompression.tsx`:
```typescript
// const { upload } = await import('@vercel/blob/client');
// Use legacy base64 upload instead
```

2. Add file size warnings:
```typescript
if (file.size > 3 * 1024 * 1024) {
  alert('Please compress file to under 3MB');
  return;
}
```

## Success Criteria

✅ All tests pass
✅ No payload size errors for files up to 50MB
✅ Upload progress works
✅ Processing completes successfully
✅ Blobs are cleaned up automatically
✅ Backward compatibility maintained

## Next Steps

After successful testing:

1. Update remaining modes (Manual Cropping, Upscaling, Enhancement, Rotate/Flip)
2. Add blob support to batch processing
3. Consider adding file size limits for cost control
4. Monitor blob storage usage in Vercel dashboard

---

**Ready to test! Start with a 5MB image in Image Compression mode.** 🚀