import type { MetadataRoute } from "next";

function siteUrl(): string {
  return (
    process.env.AGENTTRACE_DASHBOARD_URL ??
    process.env.RENDER_EXTERNAL_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl(),
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
