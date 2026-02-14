/**
 * Express Proxy Middleware for Python Backend
 *
 * Forwards /api/v2/* requests to the Python FastAPI backend running
 * on localhost:8083. Used when Electron spawns Python as a subprocess
 * for backend convergence.
 */

import { Request, Response, NextFunction } from 'express';
import log from 'electron-log';

const PYTHON_BACKEND_PORT = 8083;
const PYTHON_BACKEND_URL = `http://127.0.0.1:${PYTHON_BACKEND_PORT}`;

/**
 * Create Express middleware that proxies /api/v2/* to the Python backend.
 */
export function createPythonProxy() {
  try {
    // Dynamic import to avoid build failure when not installed
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createProxyMiddleware } = require('http-proxy-middleware');
    const proxy = createProxyMiddleware({
      target: PYTHON_BACKEND_URL,
      changeOrigin: true,
      ws: true,
      pathRewrite: undefined, // Keep path as-is
      on: {
        proxyReq: (_proxyReq, req) => {
          log.debug(`[proxy] ${req.method} ${req.url} → Python backend`);
        },
        error: (err, _req, _res) => {
          log.warn(`[proxy] Error forwarding to Python backend: ${err.message}`);
        },
      },
    });

    return proxy;
  } catch (e: any) {
    // If http-proxy-middleware not installed, return passthrough
    log.warn(`Python proxy not available: ${e.message}. Install http-proxy-middleware to enable.`);
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }
}

/**
 * Simple fetch-based proxy fallback (no extra dependency needed).
 * Proxies requests by re-issuing them to the Python backend.
 */
export function simplePythonProxy() {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Only proxy /api/v2/* paths
    if (!req.path.startsWith('/api/v2')) {
      return next();
    }

    const url = `${PYTHON_BACKEND_URL}${req.originalUrl}`;

    try {
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') {
          headers[key] = value;
        }
      }
      // Don't forward host header
      delete headers['host'];

      const fetchOptions: RequestInit = {
        method: req.method,
        headers,
        signal: AbortSignal.timeout(60000),
      };

      if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
        fetchOptions.body = JSON.stringify(req.body);
      }

      const response = await fetch(url, fetchOptions);

      // Forward status and headers
      res.status(response.status);
      response.headers.forEach((value, key) => {
        if (!['transfer-encoding', 'content-encoding'].includes(key.toLowerCase())) {
          res.setHeader(key, value);
        }
      });

      // Forward body
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await response.json();
        res.json(data);
      } else if (contentType.includes('image/')) {
        const buffer = Buffer.from(await response.arrayBuffer());
        res.send(buffer);
      } else {
        const text = await response.text();
        res.send(text);
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        res.status(504).json({ error: 'Python backend timeout' });
      } else {
        log.warn(`[proxy] Python backend unavailable for ${req.path}: ${e.message}`);
        res.status(502).json({
          error: 'Python backend unavailable',
          detail: `Cannot reach backend at ${PYTHON_BACKEND_URL}`,
          code: 'BACKEND_UNAVAILABLE',
        });
      }
    }
  };
}
