import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
    // Rubric manuals are uploaded through a Server Action (1MB default). Claude caps requests at 32MB,
    // and PDFs grow ~33% when base64-encoded.
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
