import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Escludi esbuild e i suoi pacchetti nativi dal bundling (Next.js 16)
  serverExternalPackages: [
    'esbuild',
    '@esbuild/darwin-arm64',
    '@esbuild/darwin-x64',
    '@esbuild/linux-arm64',
    '@esbuild/linux-x64',
    '@esbuild/win32-arm64',
    '@esbuild/win32-x64',
  ],
  // Configurazione Turbopack (vuota per ora, ma necessaria per evitare errori)
  turbopack: {},
};

export default nextConfig;
