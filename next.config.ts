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
  outputFileTracingIncludes: {
    "/case-studies/large-development-land/artifacts/*": [
      "./case-studies/large-development-land/CFS_Development_Land_Acquisition_Review.pptx",
      "./case-studies/large-development-land/CFS_Development_Land_Underwriting.xlsx",
      "./case-studies/large-development-land/final_diagnostic_exhibits.json",
      "./docs/case-studies/cfs-investment-acquisition-presentation.md",
      "./docs/case-studies/cfs-investment-executive-recommendation.md",
      "./docs/case-studies/cfs-investment-interview-walkthrough.md",
      "./docs/case-studies/cfs-investment-large-development-land.md",
    ],
  },
  transpilePackages: ["@arcgis/core"],
};

export default nextConfig;
