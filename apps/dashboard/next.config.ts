import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

loadEnv({ path: fileURLToPath(new URL("../../.env", import.meta.url)), quiet: true });
loadEnv({ path: fileURLToPath(new URL(".env.local", import.meta.url)), quiet: true });

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
    // Disable Turbopack, use webpack instead
    // This is needed for Netlify compatibility
    // turbo: { disableTurbopack: true },  // Removed - not recognized in Next.js 16
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
  trailingSlash: true,
};

export const revalidate = 3600;
export default nextConfig;
