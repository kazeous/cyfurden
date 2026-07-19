import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Allows a 5 MB QR image plus the storefront form fields and multipart overhead.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
