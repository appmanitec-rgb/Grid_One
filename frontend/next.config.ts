import type { NextConfig } from "next";
import path from "node:path";

const internalApiUrl = (
  process.env.INTERNAL_API_URL || "http://localhost:3000"
).replace(/\/+$/, "");

const nextConfig: NextConfig = {
  turbopack: { root: path.resolve(__dirname, "..") },
  distDir: process.env.MANITEC_FRONTEND_DIST || (
    process.env.UX_REVIEW === "1"
      ? ".next-ux-review"
      : process.env.COMMERCIAL_REVIEW === "1"
        ? ".next-commercial"
        : process.env.E2E_DIST_DIR === "1"
          ? ".next-e2e"
          : ".next"
  ),
  poweredByHeader: false,
  // Word conversion is bounded at 60 s; the proxy must allow it to complete.
  experimental: { proxyTimeout: 90_000 },
  images: { qualities: [75, 90] },
  allowedDevOrigins: ["192.168.0.25"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${internalApiUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
