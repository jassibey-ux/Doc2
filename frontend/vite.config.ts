import { defineConfig, loadEnv } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';
import path from 'path';
import fs from 'fs';

/**
 * vite-plugin-cesium copies Cesium assets to `outDir + base + cesiumBaseUrl`
 * (e.g. out/renderer/app/cesium/), but the Express server in Electron already
 * mounts outDir at the base path (/app), so the files need to be at
 * `outDir/cesium/` instead. This plugin moves them after the build.
 */
function fixCesiumBasePath(): Plugin {
  let outDir = '';
  let base = '/';
  return {
    name: 'fix-cesium-base-path',
    enforce: 'post',
    configResolved(config) {
      outDir = config.build.outDir;
      base = config.base;
    },
    // closeBundle is parallel — vite-plugin-cesium also copies in closeBundle,
    // so poll until its copy appears, then move to the correct location.
    async closeBundle() {
      if (base === '/' || base === './') return;
      const baseName = base.replace(/^\/|\/$/g, '');
      const src = path.resolve(outDir, baseName, 'cesium');
      const dest = path.resolve(outDir, 'cesium');
      // Wait up to 10s for vite-plugin-cesium to finish copying
      for (let i = 0; i < 40; i++) {
        if (fs.existsSync(path.join(src, 'Cesium.js'))) {
          fs.renameSync(src, dest);
          return;
        }
        await new Promise(r => setTimeout(r, 250));
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // When VITE_API_URL is set (cloud mode), proxy to that URL instead
  const apiTarget = env.VITE_API_URL || 'http://localhost:8082';
  const wsTarget = apiTarget.replace(/^http/, 'ws');

  return {
    plugins: [react(), cesium(), fixCesiumBasePath()],
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
