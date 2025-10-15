/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true
  },
  devIndicators: {
    appIsrIndicator: false
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb'
    }
  },
  // For App Router API Routes: Body size limits are handled at runtime
  // Default limit is ~4.5MB on Vercel (can be increased with Pro plan)
  // For self-hosted: Configure your Node.js server or use environment variables
};

module.exports = nextConfig;