/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Without this, Next.js's per-route file tracing copies @prisma/client
  // (including its ~15-20MB native query-engine binary) into every single
  // serverless function's own bundle instead of treating it as one shared
  // external dependency — confirmed via .next/server's *.nft.json trace
  // manifests: 120 of this app's 127 functions were each independently
  // bundling their own full copy of the engine. That single duplication is
  // the direct cause of Vercel's "Functions Storage" usage ballooning far
  // past the free-tier limit (each deployment pays this cost ~120 times
  // over, then multiplies again across every retained deployment).
  serverExternalPackages: ["@prisma/client", "@prisma/engines"],
}

export default nextConfig
