import type { MetadataRoute } from "next";
import { canonicalUrl, indexingEnabled } from "@/shared/seo/metadata";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      ...(indexingEnabled ? { allow: "/", disallow: ["/api/"] } : { disallow: "/" }),
    },
    sitemap: canonicalUrl("/sitemap.xml"),
  };
}
