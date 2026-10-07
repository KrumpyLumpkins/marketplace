/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1"],
  async rewrites() { return [{source:"/api/marketplace/:path*",destination:`${process.env.MARKETPLACE_API_URL ?? "http://127.0.0.1:3100"}/:path*`}]; },
};

export default nextConfig;
