/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true
  },
  api: {
    bodyParser: {
      sizeLimit: '50mb'
    }
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb'
    }
  }
};

module.exports = nextConfig;