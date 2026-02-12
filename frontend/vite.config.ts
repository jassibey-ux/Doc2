import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/app/',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8082',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8082',
        ws: true,
      },
    },
  },
  build: {
    outDir: '../electron/out/renderer',
    emptyOutDir: true,
  },
});
