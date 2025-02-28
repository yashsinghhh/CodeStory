import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    domains: [
      's3-us-west-2.amazonaws.com',
      'public.notion-static.com'
    ]
  }
};

export default nextConfig;
