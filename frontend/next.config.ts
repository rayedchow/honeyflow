import type { NextConfig } from "next";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const apiHost = (() => {
  try {
    return new URL(apiUrl).hostname;
  } catch {
    return "localhost";
  }
})();

const nextConfig: NextConfig = {
  serverExternalPackages: ["@0glabs/0g-serving-broker"],
  images: {
    remotePatterns: [
      {
        protocol: apiUrl.startsWith("https") ? "https" : "http",
        hostname: apiHost,
      },
    ],
  },
};

export default nextConfig;
