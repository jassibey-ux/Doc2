/**
 * Configurable API Client
 *
 * Supports both local Electron backend and remote cloud API.
 * Adds auth headers (HMAC or Bearer) when configured for cloud mode.
 */

// API base URL: empty string = same origin (Electron/dev proxy), or cloud URL
const STORAGE_KEY = 'scensus_api_config';

interface ApiConfig {
  baseUrl: string;
  authToken: string;
  organizationId: string;
}

function loadApiConfig(): ApiConfig {
  try {
    const envBase = import.meta.env.VITE_API_URL;
    const defaults: ApiConfig = {
      baseUrl: envBase || '',
      authToken: '',
      organizationId: '',
    };

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...defaults, ...JSON.parse(stored) };
    }
    return defaults;
  } catch {
    return { baseUrl: '', authToken: '', organizationId: '' };
  }
}

let apiConfig = loadApiConfig();

export function getApiConfig(): ApiConfig {
  return { ...apiConfig };
}

export function setApiConfig(updates: Partial<ApiConfig>): void {
  apiConfig = { ...apiConfig, ...updates };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(apiConfig));
}

export function clearApiConfig(): void {
  apiConfig = { baseUrl: '', authToken: '', organizationId: '' };
  localStorage.removeItem(STORAGE_KEY);
}

export function getApiBaseUrl(): string {
  return apiConfig.baseUrl;
}

/**
 * Build request headers with optional auth.
 */
function buildHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra,
  };

  if (apiConfig.authToken) {
    headers['Authorization'] = `Bearer ${apiConfig.authToken}`;
  }

  if (apiConfig.organizationId) {
    headers['X-Organization-ID'] = apiConfig.organizationId;
  }

  return headers;
}

/**
 * Fetch wrapper that prepends the API base URL and adds auth headers.
 */
export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = `${apiConfig.baseUrl}${path}`;

  const headers = buildHeaders(
    options.headers as Record<string, string> | undefined,
  );

  // Don't set Content-Type for FormData (let browser set multipart boundary)
  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Handle 401 — clear token and redirect to login
  if (response.status === 401 && apiConfig.authToken) {
    setApiConfig({ authToken: '' });
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
  }

  return response;
}

/**
 * Convenience GET
 */
export async function apiGet<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

/**
 * Convenience POST
 */
export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await apiFetch(path, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json();
}

/**
 * Build WebSocket URL for current config.
 */
export function getWsUrl(): string {
  if (apiConfig.baseUrl) {
    // Cloud mode: convert http(s) to ws(s)
    const wsUrl = apiConfig.baseUrl
      .replace(/^https:/, 'wss:')
      .replace(/^http:/, 'ws:');
    return `${wsUrl}/ws`;
  }

  // Local mode: same origin
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}
