import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // App interno, sempre dinâmico (sessão por cookie em toda página): sem cache de componentes.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
