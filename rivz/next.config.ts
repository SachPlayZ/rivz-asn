import type { NextConfig } from "next";

const isTauri = process.env.TAURI_BUILD === "true";

const nextConfig: NextConfig = {
  output: isTauri ? "export" : "standalone",
  images: isTauri ? { unoptimized: true } : undefined,
};

export default nextConfig;
