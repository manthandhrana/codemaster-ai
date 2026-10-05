import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  // '' prefix -> also read non-VITE_ vars such as DEV_API_PROXY (never exposed to the browser)
  const env = loadEnv(mode, root, '');
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': { target: env.DEV_API_PROXY || 'http://127.0.0.1:5050', changeOrigin: true },
      },
    },
    preview: { port: 4173 },
    build: { chunkSizeWarningLimit: 1000 },
  };
});
