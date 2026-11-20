import type { MetadataRoute } from "next";

function siteUrl(): string {
  return (
    process.env.AGENTTRACE_DASHBOARD_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/login", "/overview", "/traces", "/analytics", "/errors", "/projects", "/compare", "/api-keys", "/settings"],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
