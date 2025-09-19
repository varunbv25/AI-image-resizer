/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['sharp'],
  images: {
    unoptimized: true
  }
};

module.exports = nextConfig;