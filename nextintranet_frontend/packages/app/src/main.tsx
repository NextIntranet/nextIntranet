import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { App } from './App';
import { apiFetch, initApiClient, tokenStorage } from '@nextintranet/core';
import { RealtimeClient, setRealtimeClient } from '@nextintranet/core';
import './index.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';
const WS_BASE_URL = import.meta.env.VITE_WS_URL || API_BASE_URL.replace(/^http/, 'ws');

// Initialize API client
initApiClient({
  baseUrl: API_BASE_URL,
  getToken: () => tokenStorage.getToken(),
  setToken: (token: string | null) => token && tokenStorage.setToken(token),
  clearToken: () => tokenStorage.clearTokens(),
  onUnauthorized: () => {
    tokenStorage.clearTokens();
    window.location.href = '/login';
  },
});

// Initialize WebSocket client
const realtimeClient = new RealtimeClient(WS_BASE_URL, () => tokenStorage.getToken());
realtimeClient.initialize();
setRealtimeClient(realtimeClient);

// TanStack Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 1,
    },
  },
});

if (tokenStorage.isAuthenticated()) {
  queryClient
    .prefetchQuery({
      queryKey: ['me'],
      queryFn: () => apiFetch('/api/v1/me/'),
    })
    .catch(() => {});
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </React.StrictMode>
);
