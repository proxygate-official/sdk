import type {
  TunnelOptions,
  TunnelClient,
  TunnelRegisteredListing,
} from './types.js';
import { handleRequest } from './tunnel/message-handler.js';
import type {
  TunnelRegisterMessage,
  TunnelPongMessage,
  IncomingMessage,
} from './tunnel/message-handler.js';
import {
  buildWsUrl,
  getAuthHeaders,
  RECONNECT_DELAY_MS,
} from './tunnel/ws-manager.js';

/**
 * Create a tunnel client that connects to the ProxyGate gateway via WebSocket,
 * registering local services and forwarding proxied requests to localhost.
 */
export function createTunnelClient(options: TunnelOptions): TunnelClient {
  const { gatewayUrl, walletAddress, secretKey, services } = options;

  let ws: WebSocket | null = null;
  let connected = false;
  let intentionalClose = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let drainResolve: (() => void) | null = null;

  function send(msg: unknown): void {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  function scheduleReconnect(): void {
    if (intentionalClose || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (!intentionalClose) {
        connectInternal().catch((err) => {
          options.onError?.(err instanceof Error ? err : new Error(String(err)));
          scheduleReconnect();
        });
      }
    }, RECONNECT_DELAY_MS);
  }

  async function connectInternal(): Promise<TunnelRegisteredListing[]> {
    const authHeaders = await getAuthHeaders(gatewayUrl, walletAddress, secretKey);
    const wsUrl = buildWsUrl(gatewayUrl);

    return new Promise<TunnelRegisteredListing[]>((resolve, reject) => {
      try {
        const urlWithAuth = new URL(wsUrl);
        urlWithAuth.searchParams.set('x-wallet', authHeaders['x-wallet']);
        urlWithAuth.searchParams.set('x-nonce', authHeaders['x-nonce']);
        urlWithAuth.searchParams.set('x-signature', authHeaders['x-signature']);
        ws = new WebSocket(urlWithAuth.toString());
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }

      let settled = false;

      ws.onopen = (): void => {
        const registerMsg: TunnelRegisterMessage = { type: 'register', services };
        send(registerMsg);
      };

      ws.onmessage = (event: MessageEvent): void => {
        let msg: IncomingMessage;
        try {
          const raw = typeof event.data === 'string' ? event.data : String(event.data);
          msg = JSON.parse(raw) as IncomingMessage;
        } catch { return; }

        switch (msg.type) {
          case 'registered': {
            connected = true;
            if (!settled) { settled = true; resolve(msg.listings); }
            options.onConnected?.(msg.listings);
            break;
          }
          case 'request': {
            handleRequest(msg, services, send, options.onRequest).catch((err) => {
              options.onError?.(err instanceof Error ? err : new Error(String(err)));
            });
            break;
          }
          case 'ping': {
            const pong: TunnelPongMessage = { type: 'pong', ts: msg.ts };
            send(pong);
            break;
          }
          case 'drained': {
            options.onDrained?.();
            if (drainResolve) { drainResolve(); drainResolve = null; }
            break;
          }
          case 'error': {
            const error = new Error(msg.error);
            if (!settled) { settled = true; reject(error); }
            options.onError?.(error);
            break;
          }
        }
      };

      ws.onclose = (event: CloseEvent): void => {
        connected = false;
        let reason = event.reason || `WebSocket closed (code ${event.code})`;
        if (event.code === 4409) reason = 'Another tunnel session is already active for this wallet. Close it first or wait for it to timeout.';
        if (!settled) { settled = true; reject(new Error(reason)); }
        options.onDisconnected?.(reason);
        if (!intentionalClose && event.code !== 4409) scheduleReconnect();
      };

      ws.onerror = (): void => {
        options.onError?.(new Error('WebSocket connection error'));
      };
    });
  }

  return {
    async connect(): Promise<TunnelRegisteredListing[]> {
      intentionalClose = false;
      return connectInternal();
    },
    async drain(): Promise<void> {
      if (!connected || !ws || ws.readyState !== WebSocket.OPEN) return;
      return new Promise<void>((resolve) => { drainResolve = resolve; send({ type: 'drain' }); });
    },
    disconnect(): void {
      intentionalClose = true;
      connected = false;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (ws) { ws.close(1000, 'Client disconnect'); ws = null; }
    },
    isConnected(): boolean { return connected; },
  };
}
