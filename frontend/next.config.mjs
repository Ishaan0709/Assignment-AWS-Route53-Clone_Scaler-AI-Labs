// @ts-check
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Backend origin. The Next.js server proxies `/api/*` to it so that the
 * session cookie set by FastAPI is first-party for the browser.
 */
const API_URL = process.env.API_URL ?? "http://localhost:8000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Pin the tracing root so a stray lockfile in a parent directory is ignored.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
