import 'dotenv/config';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const apiTarget = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001';
    return [
      {
        source: '/api/:path*',
        destination: `${apiTarget}/api/:path*`
      }
    ];
  }
};

export default nextConfig;
