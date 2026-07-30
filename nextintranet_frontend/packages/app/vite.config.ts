import fs from 'fs';
import path from 'path';

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const frontendRoot = path.resolve(__dirname, '../..');
const documentationCandidates = [
  path.join(frontendRoot, 'documentation'),
  path.join(frontendRoot, '..', 'documentation'),
];
const documentationRoot =
  documentationCandidates.find((dir) =>
    fs.existsSync(path.join(dir, 'manifest.json')),
  ) ?? documentationCandidates[1];

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      workbox: {
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/admin\//,
          /^\/ws\//,
          /^\/static\//,
          /^\/s3\//,
          /^\/minio\//,
          /^\/mcp\b/,
        ],
        runtimeCaching: [
          {
            urlPattern: /^\/api\/v1\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24,
              },
              networkTimeoutSeconds: 10,
            },
          },
          {
            urlPattern: /^https?:\/\/.*\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@nextintranet/core': path.resolve(__dirname, '../core/src'),
      '@documentation': documentationRoot,
    },
    preserveSymlinks: false,
  },
  server: {
    allowedHosts: true,
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    fs: {
      allow: [frontendRoot, documentationRoot],
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
