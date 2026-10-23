import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    proxy: { '/api': process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8000' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    clearMocks: true,
  },
});
