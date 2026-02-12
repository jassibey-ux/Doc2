import { Router } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import express from 'express';

export function staticRoutes(): Router {
  const router = Router();

  // Determine React build directory
  const reactDir = getReactDir();

  // Redirect root to /app/
  router.get('/', (_req, res) => {
    res.redirect(302, '/app/');
  });

  // Serve React app
  router.get('/app', (_req, res) => {
    serveIndex(res, reactDir);
  });

  router.get('/app/', (_req, res) => {
    serveIndex(res, reactDir);
  });

  // Serve React static files
  if (reactDir && fs.existsSync(reactDir)) {
    router.use('/app', express.static(reactDir));
  }

  // SPA fallback: any /app/* route returns index.html
  router.get('/app/*', (_req, res) => {
    serveIndex(res, reactDir);
  });

  return router;
}

function getReactDir(): string {
  // Check multiple possible locations
  // In production: __dirname = resources/app.asar/out/main
  // Unpacked renderer is at: resources/app.asar.unpacked/out/renderer
  const asarUnpacked = __dirname.replace('app.asar', 'app.asar.unpacked');
  const candidates = [
    path.join(asarUnpacked, '../renderer'),        // ASAR unpacked (production)
    path.join(__dirname, '../renderer'),            // electron-vite output (dev)
    path.join(process.cwd(), 'out/renderer'),      // CWD-relative
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.existsSync(path.join(candidate, 'index.html'))) {
      return candidate;
    }
  }

  // Fallback to first candidate
  return candidates[0];
}

function serveIndex(res: express.Response, reactDir: string): void {
  const indexPath = path.join(reactDir, 'index.html');

  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send(
      '<h1>React Dashboard not built.</h1><p>Run <code>npm run build</code> in the frontend/ directory.</p>'
    );
  }
}
