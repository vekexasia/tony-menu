import type { NextConfig } from "next";

const workspaceRoot = process.cwd().endsWith("/web") ? process.cwd().slice(0, -4) : process.cwd();

const nextConfig: NextConfig = {
  ...(process.env.NODE_ENV === "production"
    ? { output: "export" }
    : {
        // Dev-only same-origin proxy, mirroring production's Pages Function
        // (web/functions/api/[[path]].ts). Lets a single tunnel to :3000 reach
        // the backend and chat worker without baking absolute URLs into
        // NEXT_PUBLIC_* vars.
        async rewrites() {
          return {
            beforeFiles: [
              { source: "/api/:path*", destination: "http://localhost:8787/:path*" },
              { source: "/chat/:path*", destination: "http://localhost:8788/:path*" },
            ],
          };
        },
      }),
  transpilePackages: ["@menu/schemas"],
  trailingSlash: true,
  turbopack: {
    root: workspaceRoot,
  },
  allowedDevOrigins: [
    "192.168.1.238",
    "100.126.88.105",
    "*.trycloudflare.com",
  ],

  // Image optimization - unoptimized for static export / Cloudflare Pages
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
