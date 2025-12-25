export interface RealtimeEvent {
  id?: string;
  type: string;
  stationId?: string | null;
  deviceId?: string | null;
  ts?: number;
  payload?: unknown;
}

export type RealtimeScope = 'broadcast' | 'station';

export interface RealtimeConnectionState {
  events: 'disconnected' | 'connecting' | 'connected';
  station: 'disconnected' | 'connecting' | 'connected';
}

type MessageHandler = (event: RealtimeEvent) => void;
type ConnectionStateHandler = (state: RealtimeConnectionState) => void;

const RECONNECT_DELAY_MS = 3000;
const STATION_KEY = 'stationId';

export class RealtimeClient {
  private eventSocket?: WebSocket;
  private stationSocket?: WebSocket;
  private reconnectEventsTimer?: ReturnType<typeof setTimeout>;
  private reconnectStationTimer?: ReturnType<typeof setTimeout>;
  
  private messageHandlers = new Set<MessageHandler>();
  private connectionStateHandlers = new Set<ConnectionStateHandler>();
  
  private currentStationId: string | null = null;
  private connectionState: RealtimeConnectionState = {
    events: 'disconnected',
    station: 'disconnected',
  };

  constructor(
    private wsBaseUrl: string,
    private getToken: () => string | null
  ) {}

  initialize(): void {
    if (typeof window === 'undefined') return;
    
    const stationId = this.getStationFromUrl() || localStorage.getItem(STATION_KEY);
    if (stationId) {
      this.currentStationId = stationId;
      localStorage.setItem(STATION_KEY, stationId);
    }

    this.connectEvents();
    this.connectStation();
  }

  setStation(stationId: string | null): void {
    if (stationId === this.currentStationId) return;

    this.currentStationId = stationId;
    if (stationId) {
      localStorage.setItem(STATION_KEY, stationId);
    } else {
      localStorage.removeItem(STATION_KEY);
    }
    this.connectStation(true);
  }

  getStationId(): string | null {
    return this.currentStationId;
  }

  emit(event: RealtimeEvent, scope: RealtimeScope = 'station'): void {
    const socket = scope === 'broadcast'
      ? this.eventSocket
      : (this.stationSocket || this.eventSocket);

    if (scope === 'station' && !event.stationId) {
      if (this.currentStationId) {
        event.stationId = this.currentStationId;
      }
    }

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(event));
    }
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onConnectionState(handler: ConnectionStateHandler): () => void {
    this.connectionStateHandlers.add(handler);
    handler(this.connectionState);
    return () => this.connectionStateHandlers.delete(handler);
  }

  private connectEvents(): void {
    this.clearEventsSocket();
    const url = this.buildWsUrl('/ws/events/');
    this.setConnectionState({ events: 'connecting' });
    
    this.eventSocket = this.openSocket(
      url,
      () => this.setConnectionState({ events: 'connected' }),
      (data) => this.handleMessage(data),
      () => {
        this.setConnectionState({ events: 'disconnected' });
        this.scheduleReconnect('events');
      }
    );
  }

  private connectStation(force = false): void {
    const stationId = this.currentStationId;
    if (!stationId) {
      this.clearStationSocket();
      this.setConnectionState({ station: 'disconnected' });
      return;
    }

    if (!force && this.stationSocket && this.stationSocket.readyState === WebSocket.OPEN) {
      return;
    }

    this.clearStationSocket();
    const url = this.buildWsUrl(`/ws/station/${encodeURIComponent(stationId)}/`);
    this.setConnectionState({ station: 'connecting' });
    
    this.stationSocket = this.openSocket(
      url,
      () => this.setConnectionState({ station: 'connected' }),
      (data) => this.handleMessage(data),
      () => {
        this.setConnectionState({ station: 'disconnected' });
        this.scheduleReconnect('station');
      }
    );
  }

  private openSocket(
    url: string,
    onOpen: () => void,
    onMessage: (data: string) => void,
    onClose: () => void
  ): WebSocket {
    const socket = new WebSocket(url);
    socket.onopen = () => onOpen();
    socket.onmessage = (event) => onMessage(event.data);
    socket.onerror = () => socket.close();
    socket.onclose = () => onClose();
    return socket;
  }

  private handleMessage(data: string): void {
    try {
      const parsed = JSON.parse(data) as RealtimeEvent;
      this.messageHandlers.forEach(handler => handler(parsed));
    } catch {
      // Ignore malformed payloads
    }
  }

  private scheduleReconnect(scope: 'events' | 'station'): void {
    if (typeof window === 'undefined') return;

    if (scope === 'events') {
      if (this.reconnectEventsTimer) return;
      this.reconnectEventsTimer = setTimeout(() => {
        this.reconnectEventsTimer = undefined;
        this.connectEvents();
      }, RECONNECT_DELAY_MS);
      return;
    }

    if (this.reconnectStationTimer) return;
    this.reconnectStationTimer = setTimeout(() => {
      this.reconnectStationTimer = undefined;
      this.connectStation();
    }, RECONNECT_DELAY_MS);
  }

  private clearEventsSocket(): void {
    if (this.eventSocket) {
      this.eventSocket.close();
      this.eventSocket = undefined;
    }
    if (this.reconnectEventsTimer) {
      clearTimeout(this.reconnectEventsTimer);
      this.reconnectEventsTimer = undefined;
    }
  }

  private clearStationSocket(): void {
    if (this.stationSocket) {
      this.stationSocket.close();
      this.stationSocket = undefined;
    }
    if (this.reconnectStationTimer) {
      clearTimeout(this.reconnectStationTimer);
      this.reconnectStationTimer = undefined;
    }
  }

  private setConnectionState(update: Partial<RealtimeConnectionState>): void {
    this.connectionState = {
      ...this.connectionState,
      ...update,
    };
    this.connectionStateHandlers.forEach(handler => handler(this.connectionState));
  }

  private buildWsUrl(path: string): string {
    const url = `${this.wsBaseUrl}${path}`;
    return this.withToken(url);
  }

  private withToken(url: string): string {
    const token = this.getToken();
    if (!token) return url;
    
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}token=${encodeURIComponent(token)}`;
  }

  private getStationFromUrl(): string | null {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return params.get('station') || params.get('stationId');
  }

  destroy(): void {
    this.clearEventsSocket();
    this.clearStationSocket();
    this.messageHandlers.clear();
    this.connectionStateHandlers.clear();
  }
}
