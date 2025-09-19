/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push('sharp');
    }
    return config;
  },
  experimental: {
    turbo: {
      rules: {
        'sharp': {
          loaders: ['external'],
        },
      },
    },
  },
};

module.exports = nextConfig;