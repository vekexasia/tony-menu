import type { NextConfig } from "next";

const workspaceRoot = process.cwd().endsWith("/web") ? process.cwd().slice(0, -4) : process.cwd();

const nextConfig: NextConfig = {
  ...(process.env.NODE_ENV === "production" ? { output: "export" } : {}),
  transpilePackages: ["@menu/schemas"],
  trailingSlash: true,
  turbopack: {
    root: workspaceRoot,
  },
  allowedDevOrigins: [
    "192.168.1.238",
    "100.126.88.105",
  ],

  // Image optimization - unoptimized for static export / Cloudflare Pages
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
