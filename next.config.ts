import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Parsers that load their own workers/DOM shims; keep them out of the server bundle.
  serverExternalPackages: ["unpdf", "jszip", "turndown"],
  // Streaming responses (study guides, plans) must not be buffered by gzip.
  compress: false,
  reactStrictMode: false,
  devIndicators: false,
  // Don't write editor-assistant instruction files into the project.
  agentRules: false,
};

export default nextConfig;
