import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mastra loads its storage and sandbox backends at runtime; bundling them
  // breaks those dynamic requires.
  serverExternalPackages: ["@mastra/core", "@mastra/libsql", "@mastra/memory"],
};

export default nextConfig;
