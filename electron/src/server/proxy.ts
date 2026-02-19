/**
 * Express Proxy Middleware for Python Backend
 *
 * Forwards /api/v2/* requests to the Python FastAPI backend running
 * on localhost:8083. Used when Electron spawns Python as a subprocess
 * for backend convergence.
 *
 * Includes a health-check gate so requests skip the proxy instantly
 * when Python isn't running (no 3s timeout per request).
 */

import { Request, Response, NextFunction } from 'express';
import log from 'electron-log';

const PYTHON_BACKEND_PORT = 8083;
const PYTHON_BACKEND_URL = `http://127.0.0.1:${PYTHON_BACKEND_PORT}`;

// Health-check gate: track whether Python is available
let pythonAvailable = false;
let lastHealthCheck = 0;
const HEALTH_CHECK_INTERVAL_MS = 10_000; // Re-check every 10s

async function checkPythonHealth(): Promise<boolean> {
  const now = Date.now();
  if (now - lastHealthCheck < HEALTH_CHECK_INTERVAL_MS) {
    return pythonAvailable;
  }
  lastHealthCheck = now;
  try {
    const res = await fetch(`${PYTHON_BACKEND_URL}/health`, {
      signal: AbortSignal.timeout(500),
    });
    pythonAvailable = res.ok;
  } catch {
    pythonAvailable = false;
  }
  return pythonAvailable;
}

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
        proxyReq: (_proxyReq: unknown, req: Request) => {
          log.debug(`[proxy] ${req.method} ${req.url} → Python backend`);
        },
        error: (err: Error) => {
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
 *
 * Includes a health-check gate: if Python isn't running, requests
 * fall through to Express routes instantly (no 3s timeout).
 */
export function simplePythonProxy() {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Only proxy /api/v2/* paths
    if (!req.path.startsWith('/api/v2')) {
      return next();
    }

    // Health-check gate: skip proxy instantly when Python isn't running
    const isAvailable = await checkPythonHealth();
    if (!isAvailable) {
      // Rewrite /api/v2/* → /api/* so Express v1 routes can handle
      req.url = req.url.replace('/api/v2', '/api');
      req.originalUrl = req.originalUrl.replace('/api/v2', '/api');
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
        signal: AbortSignal.timeout(3000),
      };

      if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
        fetchOptions.body = JSON.stringify(req.body);
      }

      const response = await fetch(url, fetchOptions);

      // Python returned 404 or 502 — fall through to Express routes
      if (response.status === 404 || response.status === 502) {
        log.info(`[proxy] Python returned ${response.status} for ${req.path}, falling back to Express routes`);
        req.url = req.url.replace('/api/v2', '/api');
        req.originalUrl = req.originalUrl.replace('/api/v2', '/api');
        return next();
      }

      // Forward status and headers (skip content-length since we re-serialize the body)
      res.status(response.status);
      response.headers.forEach((value, key) => {
        if (!['transfer-encoding', 'content-encoding', 'content-length'].includes(key.toLowerCase())) {
          res.setHeader(key, value);
        }
      });

      // Forward body — wrapped in try/catch for malformed JSON safety
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          const data = await response.json();
          res.json(data);
        } catch (jsonErr) {
          log.warn(`[proxy] Malformed JSON from Python for ${req.path}`);
          const text = await response.text().catch(() => '');
          res.send(text);
        }
      } else if (contentType.includes('image/')) {
        const buffer = Buffer.from(await response.arrayBuffer());
        res.send(buffer);
      } else {
        const text = await response.text();
        res.send(text);
      }
    } catch (e: any) {
      // Python backend unreachable or timed out — fall through to Express /api/* routes
      log.info(`[proxy] Python backend unavailable for ${req.path} (${e.name}), falling back to Express routes`);
      pythonAvailable = false; // Mark as unavailable so next requests skip instantly
      // Rewrite /api/v2/* → /api/* so Express v1 routes can handle
      req.url = req.url.replace('/api/v2', '/api');
      req.originalUrl = req.originalUrl.replace('/api/v2', '/api');
      next();
    }
  };
}
