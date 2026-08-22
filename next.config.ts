import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Questionnaire imports are capped again at 8 MB in application code.
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
