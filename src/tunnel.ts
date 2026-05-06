import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import type {
  TunnelOptions,
  TunnelClient,
  TunnelRegisteredListing,
  TunnelServiceConfig,
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
  getBearerHeaders,
  RECONNECT_DELAY_MS,
} from './tunnel/ws-manager.js';

// ---------------------------------------------------------------------------
// Docs helpers
// ---------------------------------------------------------------------------

/** Detect doc type from file extension. */
function detectDocType(filePath: string): 'openapi' | 'markdown' {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.md' || ext === '.markdown') return 'markdown';
  return 'openapi'; // .yaml, .yml, .json
}

/** Read docs files and return upload payloads keyed by service name. */
async function loadDocsFiles(
  services: TunnelServiceConfig[],
): Promise<Map<string, { doc_type: 'openapi' | 'markdown'; content: string }>> {
  const result = new Map<string, { doc_type: 'openapi' | 'markdown'; content: string }>();

  for (const svc of services) {
    if (!svc.docs) continue;
    try {
      const filePath = resolve(svc.docs);
      const content = await readFile(filePath, 'utf-8');
      result.set(svc.name, { doc_type: detectDocType(filePath), content });
    } catch {
      // Docs file not found or unreadable — skip silently
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// createTunnelClient
// ---------------------------------------------------------------------------

/**
 * Create a tunnel client that connects to the Proxygate gateway via WebSocket,
 * registering local services and forwarding proxied requests to localhost.
 */
export function createTunnelClient(options: TunnelOptions): TunnelClient {
  const { gatewayUrl, services } = options;

  if (!options.apiKey && (!options.walletAddress || !options.secretKey)) {
    throw new Error('Tunnel requires either apiKey or walletAddress + secretKey');
  }

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
    const wsUrl = buildWsUrl(gatewayUrl);

    // Phase 49: choose auth strategy — bearer API key or wallet-sig
    let authHeaders: Record<string, string>;
    if (options.apiKey) {
      authHeaders = getBearerHeaders(options.apiKey);
    } else {
      authHeaders = await getAuthHeaders(gatewayUrl, options.walletAddress!, options.secretKey!);
    }

    return new Promise<TunnelRegisteredListing[]>((resolve, reject) => {
      try {
        if (options.apiKey) {
          // Bearer auth: pass as protocol header (server-side WebSocket supports headers)
          // Use subprotocol trick for environments that don't support custom headers,
          // but prefer the standard approach for Node.js/Bun
          const urlObj = new URL(wsUrl);
          urlObj.searchParams.set('authorization', `Bearer ${options.apiKey}`);
          ws = new WebSocket(urlObj.toString());
        } else {
          // Wallet-sig auth: pass credentials as query params
          const urlWithAuth = new URL(wsUrl);
          urlWithAuth.searchParams.set('x-wallet', authHeaders['x-wallet']);
          urlWithAuth.searchParams.set('x-nonce', authHeaders['x-nonce']);
          urlWithAuth.searchParams.set('x-signature', authHeaders['x-signature']);
          ws = new WebSocket(urlWithAuth.toString());
        }
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
            const listings = msg.listings;

            // Upload docs for each service that has a docs file
            loadDocsFiles(services).then((docsMap) => {
              for (const listing of listings) {
                const docs = docsMap.get(listing.service);
                if (docs) {
                  send({
                    type: 'docs',
                    listing_id: listing.id,
                    doc_type: docs.doc_type,
                    content: docs.content,
                  });
                }
              }
            }).catch(() => {
              // Docs upload is best-effort
            });

            if (!settled) { settled = true; resolve(listings); }
            options.onConnected?.(listings);
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
