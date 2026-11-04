import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  outputFileTracingIncludes: { "/**/*": ["./db/schema.sql", "./data/demo/manifest.jsonl", "./data/pages/manifest.jsonl", "./data/groups/manifest.jsonl"] },
  images: { unoptimized: true },
};

export default nextConfig;
