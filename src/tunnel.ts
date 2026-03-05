import nacl from 'tweetnacl';
import type {
  TunnelOptions,
  TunnelClient,
  TunnelRegisteredListing,
  TunnelServiceConfig,
} from './types.js';

// ---------------------------------------------------------------------------
// WebSocket message types (tunnel protocol)
// ---------------------------------------------------------------------------

interface TunnelRegisterMessage {
  type: 'register';
  services: TunnelServiceConfig[];
}

interface TunnelRegisteredMessage {
  type: 'registered';
  listings: TunnelRegisteredListing[];
}

interface TunnelRequestMessage {
  type: 'request';
  request_id: string;
  service: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: string; // base64-encoded
}

interface TunnelResponseMessage {
  type: 'response';
  request_id: string;
  status: number;
  headers: Record<string, string>;
  body: string; // base64-encoded
}

interface TunnelStreamChunkMessage {
  type: 'stream_chunk';
  request_id: string;
  data: string; // base64-encoded chunk
}

interface TunnelStreamEndMessage {
  type: 'stream_end';
  request_id: string;
  status: number;
  headers: Record<string, string>;
}

interface TunnelErrorMessage {
  type: 'error';
  request_id?: string;
  error: string;
  code?: string;
}

interface TunnelPingMessage {
  type: 'ping';
  ts: number;
}

interface TunnelPongMessage {
  type: 'pong';
  ts: number;
}

interface TunnelDrainedMessage {
  type: 'drained';
}

type IncomingMessage =
  | TunnelRegisteredMessage
  | TunnelRequestMessage
  | TunnelPingMessage
  | TunnelDrainedMessage
  | TunnelErrorMessage;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert Uint8Array to base64 string. */
function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Decode base64 string to Uint8Array. */
function fromBase64(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Build the WebSocket URL from a gateway HTTP URL. */
function buildWsUrl(gatewayUrl: string): string {
  const base = gatewayUrl.replace(/\/$/, '');
  const wsBase = base.replace(/^http/, 'ws');
  return `${wsBase}/tunnel/connect`;
}

/** Fetch nonce and sign it, returning auth headers. */
async function getAuthHeaders(
  gatewayUrl: string,
  walletAddress: string,
  secretKey: Uint8Array,
): Promise<Record<string, string>> {
  const nonceUrl = `${gatewayUrl}/v1/nonce?wallet=${encodeURIComponent(walletAddress)}`;
  const nonceRes = await fetch(nonceUrl);

  if (!nonceRes.ok) {
    const body = await nonceRes.text().catch(() => '');
    throw new Error(`Nonce request failed (${nonceRes.status}): ${body}`);
  }

  const { nonce } = (await nonceRes.json()) as { nonce: string; expires_in: number };

  const messageBytes = new TextEncoder().encode(nonce);
  const signature = nacl.sign.detached(messageBytes, secretKey);
  const signatureBase64 = toBase64(signature);

  return {
    'x-wallet': walletAddress,
    'x-nonce': nonce,
    'x-signature': signatureBase64,
  };
}

/** Find which local port to forward to for a given service name. */
function resolveServicePort(
  services: TunnelServiceConfig[],
  serviceName: string,
): number | undefined {
  const svc = services.find((s) => s.name === serviceName);
  return svc?.port;
}

/** Check if a response is SSE streaming. */
function isSSE(headers: Headers): boolean {
  const ct = headers.get('content-type') ?? '';
  return ct.includes('text/event-stream');
}

// ---------------------------------------------------------------------------
// Reconnect delay
// ---------------------------------------------------------------------------

const RECONNECT_DELAY_MS = 5_000;

// ---------------------------------------------------------------------------
// createTunnelClient
// ---------------------------------------------------------------------------

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

  // ------------------------------------------------------------------
  // Send helper
  // ------------------------------------------------------------------

  function send(msg: unknown): void {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  // ------------------------------------------------------------------
  // Request forwarding
  // ------------------------------------------------------------------

  async function handleRequest(msg: TunnelRequestMessage): Promise<void> {
    const { request_id, service, method, path, headers, body } = msg;

    options.onRequest?.(request_id, service, path);

    const port = resolveServicePort(services, service);
    if (port === undefined) {
      const errMsg: TunnelErrorMessage = {
        type: 'error',
        request_id,
        error: `Unknown service: ${service}`,
        code: 'UNKNOWN_SERVICE',
      };
      send(errMsg);
      return;
    }

    const url = `http://localhost:${port}${path}`;

    try {
      const fetchHeaders: Record<string, string> = { ...headers };
      // Remove hop-by-hop headers that shouldn't be forwarded
      delete fetchHeaders['host'];
      delete fetchHeaders['connection'];
      delete fetchHeaders['transfer-encoding'];

      const fetchInit: RequestInit = {
        method,
        headers: fetchHeaders,
      };

      if (body && method !== 'GET' && method !== 'HEAD') {
        fetchInit.body = fromBase64(body) as unknown as BodyInit;
      }

      const res = await fetch(url, fetchInit);

      // Check for SSE streaming
      if (isSSE(res.headers) && res.body) {
        // Stream response headers first
        const resHeaders: Record<string, string> = {};
        res.headers.forEach((v, k) => {
          resHeaders[k] = v;
        });

        const reader = res.body.getReader();
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk: TunnelStreamChunkMessage = {
              type: 'stream_chunk',
              request_id,
              data: toBase64(value),
            };
            send(chunk);
          }
        } finally {
          reader.releaseLock();
        }

        const endMsg: TunnelStreamEndMessage = {
          type: 'stream_end',
          request_id,
          status: res.status,
          headers: resHeaders,
        };
        send(endMsg);
      } else {
        // Non-streaming: buffer full response
        const resBody = new Uint8Array(await res.arrayBuffer());
        const resHeaders: Record<string, string> = {};
        res.headers.forEach((v, k) => {
          resHeaders[k] = v;
        });

        const responseMsg: TunnelResponseMessage = {
          type: 'response',
          request_id,
          status: res.status,
          headers: resHeaders,
          body: toBase64(resBody),
        };
        send(responseMsg);
      }
    } catch (err) {
      const errMsg: TunnelErrorMessage = {
        type: 'error',
        request_id,
        error: err instanceof Error ? err.message : String(err),
        code: 'UPSTREAM_ERROR',
      };
      send(errMsg);
    }
  }

  // ------------------------------------------------------------------
  // Reconnect logic
  // ------------------------------------------------------------------

  function scheduleReconnect(): void {
    if (intentionalClose) return;
    if (reconnectTimer) return;

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (!intentionalClose) {
        // Fire-and-forget reconnect; errors go to onError
        connectInternal().catch((err) => {
          options.onError?.(err instanceof Error ? err : new Error(String(err)));
          scheduleReconnect();
        });
      }
    }, RECONNECT_DELAY_MS);
  }

  // ------------------------------------------------------------------
  // Connect
  // ------------------------------------------------------------------

  async function connectInternal(): Promise<TunnelRegisteredListing[]> {
    const authHeaders = await getAuthHeaders(gatewayUrl, walletAddress, secretKey);
    const wsUrl = buildWsUrl(gatewayUrl);

    return new Promise<TunnelRegisteredListing[]>((resolve, reject) => {
      try {
        // Node.js WebSocket (globalThis.WebSocket in Node 21+, or ws package)
        // Pass auth as query params since browser WebSocket API doesn't support headers
        // But for Node.js agents, we use the protocol subprotocol trick or query params
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
        // Send register message with service configs
        const registerMsg: TunnelRegisterMessage = {
          type: 'register',
          services,
        };
        send(registerMsg);
      };

      ws.onmessage = (event: MessageEvent): void => {
        let msg: IncomingMessage;
        try {
          const raw = typeof event.data === 'string' ? event.data : String(event.data);
          msg = JSON.parse(raw) as IncomingMessage;
        } catch {
          return;
        }

        switch (msg.type) {
          case 'registered': {
            connected = true;
            const listings = msg.listings;
            if (!settled) {
              settled = true;
              resolve(listings);
            }
            options.onConnected?.(listings);
            break;
          }

          case 'request': {
            // Handle async — don't await in message handler
            handleRequest(msg).catch((err) => {
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
            if (drainResolve) {
              drainResolve();
              drainResolve = null;
            }
            break;
          }

          case 'error': {
            const error = new Error(msg.error);
            if (!settled) {
              settled = true;
              reject(error);
            }
            options.onError?.(error);
            break;
          }
        }
      };

      ws.onclose = (event: CloseEvent): void => {
        connected = false;
        let reason = event.reason || `WebSocket closed (code ${event.code})`;
        if (event.code === 4409) {
          reason = 'Another tunnel session is already active for this wallet. Close it first or wait for it to timeout.';
        }

        if (!settled) {
          settled = true;
          reject(new Error(reason));
        }

        options.onDisconnected?.(reason);

        // Don't reconnect on duplicate connection (4409) — it will keep failing
        if (!intentionalClose && event.code !== 4409) {
          scheduleReconnect();
        }
      };

      ws.onerror = (): void => {
        // onclose will fire after onerror, so we handle rejection there
        const error = new Error('WebSocket connection error');
        options.onError?.(error);
      };
    });
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  return {
    async connect(): Promise<TunnelRegisteredListing[]> {
      intentionalClose = false;
      return connectInternal();
    },

    async drain(): Promise<void> {
      if (!connected || !ws || ws.readyState !== WebSocket.OPEN) {
        return;
      }
      return new Promise<void>((resolve) => {
        drainResolve = resolve;
        send({ type: 'drain' });
      });
    },

    disconnect(): void {
      intentionalClose = true;
      connected = false;

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      if (ws) {
        ws.close(1000, 'Client disconnect');
        ws = null;
      }
    },

    isConnected(): boolean {
      return connected;
    },
  };
}
