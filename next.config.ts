import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  // Image Docker produksi (T130) hanya menyalin hasil build mandiri ini, tanpa node_modules penuh.
  output: "standalone",
};

export default nextConfig;
