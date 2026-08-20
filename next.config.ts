import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
        source: "/arcgis-assets/:version/:directory/:path*",
      },
    ];
  },
  transpilePackages: ["@arcgis/core"],
};

export default nextConfig;
