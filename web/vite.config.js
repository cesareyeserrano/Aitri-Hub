import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

export default defineConfig({
  plugins: [react()],
  define: {
    // Inject CLI package version into the React build at compile time.
    __APP_VERSION__: JSON.stringify(version),
  },
  build: {
    outDir: '../docker/web-dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.js'],
  },
});
