import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Add Turbopack config to avoid warning when webpack is customized
  turbopack: {},
  // Externalize server-only packages for both Webpack and Turbopack
  serverExternalPackages: ["pino-pretty", "lokijs", "encoding"],
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
  // Fix for Next.js 16 RSC routing issues
  experimental: {
    externalDir: true,
    // Disable RSC prefetching to avoid 404 errors
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

export default nextConfig;
