import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // server minimal în .next/standalone, folosit de imaginea Docker
  output: "standalone",
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
