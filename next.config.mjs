/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // snowflake-sdk is a native-ish Node package; keep it external to the
  // serverless bundle so Vercel resolves it at runtime instead of bundling it.
  serverExternalPackages: ["snowflake-sdk"],
};

export default nextConfig;
