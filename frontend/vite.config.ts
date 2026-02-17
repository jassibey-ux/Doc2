import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // When VITE_API_URL is set (cloud mode), proxy to that URL instead
  const apiTarget = env.VITE_API_URL || 'http://localhost:8082';
  const wsTarget = apiTarget.replace(/^http/, 'ws');

  return {
    plugins: [react(), cesium()],
    base: '/app/',
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/ws': {
          target: wsTarget,
          ws: true,
        },
      },
    },
    build: {
      outDir: '../electron/out/renderer',
      emptyOutDir: true,
      sourcemap: true,
    },
  };
});
