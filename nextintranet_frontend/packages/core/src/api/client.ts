export interface ApiConfig {
  baseUrl: string;
  getToken: () => string | null;
  setToken: (token: string) => void;
  clearToken: () => void;
  onUnauthorized: () => void;
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

export async function apiFetch<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const cfg = getApiConfig();
  const token = cfg.getToken();
  
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  if (!headers.has('Content-Type') && !isFormData) {
    headers.set('Content-Type', 'application/json');
  }

  const url = `${cfg.baseUrl}${path}`;
  
  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (response.status === 401) {
    cfg.onUnauthorized();
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
