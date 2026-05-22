import fs from 'fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

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
  plugins: [react()],
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
