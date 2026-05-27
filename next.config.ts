import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client"],
  experimental: {
    serverActions: {
      // Floor-plan uploads arrive as resized base64 data URLs via a server action.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
