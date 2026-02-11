import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Turbopack is default in Next.js 16 -- no explicit config needed
  // No output: 'export' -- we want server features in later phases
  // No webpack WASM config -- verovio embeds WASM inline in JS
  experimental: {
    serverActions: {
      bodySizeLimit: '60mb',
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
