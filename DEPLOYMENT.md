# Deployment Configuration Guide

This guide covers how to properly deploy the AI Image Processing Suite with support for large image files (up to 100MB).

## Request Body Size Limits

The application is configured to handle large image payloads (up to 100MB) through custom request parsing. However, deployment platforms have their own limits:

### Vercel

**Default Limits:**
- Hobby Plan: 4.5 MB request/response body limit
- Pro Plan: 4.5 MB default (can be increased)
- Enterprise: Custom limits available

**Configuration:**
If deploying to Vercel and experiencing payload size errors, you need to:

1. **Upgrade to Pro or Enterprise** for increased limits
2. **Add to `vercel.json`:**
```json
{
  "functions": {
    "src/app/api/**/*.ts": {
      "maxDuration": 60,
      "memory": 3008
    }
  }
}
```

3. **Contact Vercel Support** to increase function payload limits beyond 4.5MB

**Alternative Solution for Vercel:**
- Implement client-side compression before upload
- Use direct file uploads to cloud storage (S3, Cloudinary) instead of base64 in API body
- Reduce max file size to 4MB in the frontend validation

### Self-Hosted (Node.js)

When self-hosting with Node.js, you have full control over body size limits.

**Using `next start` (Production):**
```bash
# Set body size limit via environment variable
export NODE_OPTIONS="--max-http-header-size=100000000"
npm start
```

**Using PM2:**
```json
{
  "apps": [{
    "name": "ai-image-resizer",
    "script": "npm",
    "args": "start",
    "env": {
      "NODE_ENV": "production",
      "NODE_OPTIONS": "--max-http-header-size=100000000"
    }
  }]
}
```

**Using Custom Server:**
Create `server.js`:
```javascript
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const PORT = process.env.PORT || 3000;

app.prepare().then(() => {
  createServer({
    // Increase body size limit
    maxHeaderSize: 100 * 1024 * 1024, // 100MB
  }, async (req, res) => {
    const parsedUrl = parse(req.url, true);
    await handle(req, res, parsedUrl);
  }).listen(PORT, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${PORT}`);
  });
});
```

### Docker

**Dockerfile:**
```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Build the application
RUN npm run build

# Set environment variables for large payloads
ENV NODE_OPTIONS="--max-http-header-size=100000000"
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
```

**Docker Compose:**
```yaml
version: '3.8'
services:
  ai-image-resizer:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - NODE_OPTIONS=--max-http-header-size=100000000
      - GEMINI_API_KEY=${GEMINI_API_KEY}
    restart: unless-stopped
```

### AWS (Amplify, App Runner, ECS)

**AWS Amplify:**
- Default limit: 6MB
- Configure in `amplify.yml`:
```yaml
version: 1
frontend:
  phases:
    build:
      commands:
        - npm ci
        - npm run build
  artifacts:
    baseDirectory: .next
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
```

**AWS App Runner:**
- Configure body size in load balancer settings
- Increase timeout to 60 seconds

**AWS Lambda (via Serverless Framework):**
- Lambda has a 6MB payload limit (hard limit)
- Consider using S3 presigned URLs for large uploads

### Cloudflare Pages

**Limits:**
- Maximum request body size: 100MB
- Configure in `wrangler.toml`:
```toml
[env.production]
compatibility_date = "2024-01-01"

[env.production.vars]
MAX_UPLOAD_SIZE = "104857600"  # 100MB in bytes
```

### Railway

**Configuration:**
Railway supports larger payloads by default (up to 100MB).

Add to `railway.json`:
```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

## Frontend Configuration

Ensure your frontend validates file sizes before upload:

```typescript
// In your file upload component
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB recommended for base64 encoding

if (file.size > MAX_FILE_SIZE) {
  alert('File size exceeds 10MB limit. Please use a smaller image.');
  return;
}
```

## Monitoring and Debugging

### Check Current Limits

Add this diagnostic endpoint to test payload limits:

**`src/app/api/test-payload/route.ts`:**
```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const sizeInMB = (body.length / 1024 / 1024).toFixed(2);

    return NextResponse.json({
      success: true,
      receivedSizeMB: sizeInMB,
      message: `Successfully received ${sizeInMB}MB payload`
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 413 });
  }
}
```

### Error Messages

The application now returns specific error messages for payload size issues:

- **Status 413**: "Image file is too large. Please use an image smaller than 10MB..."
- **Status 400**: General processing errors
- **Status 500**: Server errors

## Recommendations

1. **Best Practice**: Limit frontend uploads to 5-10MB for optimal performance
2. **Base64 Encoding**: Remember that base64 encoding increases size by ~33%
3. **Compression**: Consider implementing client-side image compression before upload
4. **Alternative Approach**: Use direct S3/Cloudinary uploads with presigned URLs for very large files
5. **Monitoring**: Set up monitoring to track failed requests with 413 status codes

## Testing

Test payload handling:

```bash
# Test with a large payload
curl -X POST http://localhost:3000/api/test-payload \
  -H "Content-Type: application/json" \
  -d @large-test-file.json
```

## Troubleshooting

### Still Getting "Request Entity Too Large"?

1. **Check deployment platform limits** - Most platforms have hard limits
2. **Verify environment variables** - Ensure NODE_OPTIONS is set correctly
3. **Check reverse proxy** - If using nginx/apache, check their body size limits
4. **Monitor memory usage** - Large files may cause memory issues
5. **Consider chunked uploads** - For files > 10MB, implement chunked upload strategy

### Platform-Specific Issues

**Vercel 413 Error:**
- Solution: Reduce max file size to 4MB or upgrade plan

**AWS Lambda 413 Error:**
- Solution: Use API Gateway with S3 presigned URLs

**Cloudflare 413 Error:**
- Solution: Check Workers KV size limits

## Support

For deployment-specific issues, refer to:
- [Vercel Documentation](https://vercel.com/docs)
- [Railway Documentation](https://docs.railway.app/)
- [AWS Documentation](https://docs.aws.amazon.com/)
- [Cloudflare Pages Documentation](https://developers.cloudflare.com/pages/)
