import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimeEvent, RealtimeConnectionState } from './client';

let realtimeClient: any = null;

export function setRealtimeClient(client: any) {
  realtimeClient = client;
}

export function getRealtimeClient() {
  if (!realtimeClient) {
    throw new Error('Realtime client not initialized');
  }
  return realtimeClient;
}

export function useRealtimeMessages(
  onMessage: (event: RealtimeEvent) => void
): void {
  useEffect(() => {
    const client = getRealtimeClient();
    const unsubscribe = client.onMessage(onMessage);
    return unsubscribe;
  }, [onMessage]);
}

export function useRealtimeConnectionState(): RealtimeConnectionState {
  const [state, setState] = useState<RealtimeConnectionState>({
    events: 'disconnected',
    station: 'disconnected',
  });

  useEffect(() => {
    const client = getRealtimeClient();
    const unsubscribe = client.onConnectionState(setState);
    return unsubscribe;
  }, []);

  return state;
}

/**
 * Invalidate TanStack Query cache when specific realtime events occur
 */
export function useRealtimeInvalidation(
  queryKey: string[],
  eventTypes: string[]
): void {
  const queryClient = useQueryClient();

  useRealtimeMessages((event) => {
    if (eventTypes.includes(event.type)) {
      queryClient.invalidateQueries({ queryKey });
    }
  });
}
