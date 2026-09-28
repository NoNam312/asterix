import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the dev "N" badge away from the sidebar's Log out button.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
