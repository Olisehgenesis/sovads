import type { NextConfig } from "next";
import { createMDX } from "fumadocs-mdx/next";

const nextConfig: NextConfig = {
  // Add Turbopack config to avoid warning when webpack is customized
  turbopack: {
    // Absolute root silences the "turbopack.root should be absolute" warning
    root: __dirname,
  },
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
  // Make sure the compiled SDK bundle ships with the Vercel serverless
  // function that serves `/api/v1/sdk` (and, via rewrite, `/_sovads_sdk/*`).
  // Without this the file gets excluded from the trace because nothing
  // statically imports it — the route only reads it via `fs.readFileSync`.
  outputFileTracingIncludes: {
    '/api/v1/sdk': ['./src/_sovads_sdk/**/*'],
  },
  // Serve raw markdown for any /docs/<slug>.mdx — used by the
  // "Copy as Markdown" button on each docs page.
  async rewrites() {
    return [
      { source: '/docs/:path*.mdx', destination: '/llms.mdx/docs/:path*' },
      { source: '/docs.mdx',        destination: '/llms.mdx/docs' },
      // Public SDK CDN URL that third-party sites embed. The API route
      // reads the file from the bundled `src/_sovads_sdk/index.js`.
      { source: '/_sovads_sdk/index.js', destination: '/api/v1/sdk' },
      { source: '/_sovads_sdk',          destination: '/api/v1/sdk' },
    ]
  },
};

const withMDX = createMDX();

export default withMDX(nextConfig);
