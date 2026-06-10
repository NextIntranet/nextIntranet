export interface ApiConfig {
  baseUrl: string;
  getToken: () => string | null;
  setToken: (token: string) => void;
  clearToken: () => void;
  onUnauthorized: () => void;
  getRefreshToken?: () => string | null;
  setRefreshToken?: (token: string) => void;
}

let config: ApiConfig | null = null;

export function initApiClient(cfg: ApiConfig) {
  config = cfg;
}

export function getApiConfig(): ApiConfig {
  if (!config) {
    throw new Error('API client not initialized. Call initApiClient() first.');
  }
  return config;
}

export interface ApiError extends Error {
  status: number;
  data?: unknown;
}

class ApiErrorImpl extends Error implements ApiError {
  constructor(
    message: string,
    public status: number,
    public data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Shared promise so that concurrent 401s trigger only one refresh request.
let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(cfg: ApiConfig): Promise<boolean> {
  const refreshToken = cfg.getRefreshToken?.();
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${cfg.baseUrl}/api/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: refreshToken }),
    });

    if (!response.ok) return false;

    const data: { access?: string; refresh?: string } = await response.json();
    if (!data.access) return false;

    cfg.setToken(data.access);
    // Backend rotates refresh tokens, so store the new one when provided.
    if (data.refresh) {
      cfg.setRefreshToken?.(data.refresh);
    }
    return true;
  } catch {
    return false;
  }
}

function tryRefreshToken(cfg: ApiConfig): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken(cfg).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function apiFetch<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const cfg = getApiConfig();

  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData;

  const doFetch = () => {
    const headers = new Headers(init?.headers);
    const token = cfg.getToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    if (!headers.has('Content-Type') && !isFormData) {
      headers.set('Content-Type', 'application/json');
    }
    return fetch(`${cfg.baseUrl}${path}`, {
      ...init,
      headers,
    });
  };

  let response = await doFetch();

  const isAuthEndpoint = path.startsWith('/api/token/');
  if (response.status === 401 && !isAuthEndpoint) {
    const refreshed = await tryRefreshToken(cfg);
    if (refreshed) {
      response = await doFetch();
    }
  }

  if (response.status === 401) {
    if (!isAuthEndpoint) {
      cfg.onUnauthorized();
    }
    throw new ApiErrorImpl('Unauthorized', 401);
  }

  if (!response.ok) {
    let errorData: unknown;
    try {
      errorData = await response.json();
    } catch {
      errorData = await response.text();
    }
    
    throw new ApiErrorImpl(
      `API Error: ${response.status} ${response.statusText}`,
      response.status,
      errorData
    );
  }

  // Handle empty responses (204, etc)
  if (response.status === 204 || response.headers.get('Content-Length') === '0') {
    return undefined as T;
  }

  return response.json();
}
